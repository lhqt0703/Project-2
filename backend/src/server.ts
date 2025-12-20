
import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";

const app = express();
const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: "*",
  },
});


interface Player {
  id: string;
  name: string;
  connected?: boolean; // true = đang online; false = mất kết nối
}

interface Room {
  id: string;
  players: Player[];
  hostId: string; // ai là quản trò
  roles?: string[]; // danh sách role được chọn cho phòng
  rolesLocked?: boolean; // đã xác nhận role chưa
  lockedPlayerIds?: string[]; // danh sách id người chơi lúc xác nhận role
  phase?: string; // "day" hoặc "night"
  positions?: { playerId: string; x: number; y: number }[];
  positionEditors?: string[]; // ai được phép sắp xếp
  playerRoles?: Record<string, string>; // mapping playerId -> role

   // --- Phần cho sói ---
  wolves?: string[]; // danh sách id của sói (còn sống) trong phòng
  wolfVotes?: Record<string, string | null>; // mapping: wolfId -> targetId hoặc null
  wolfVotes2?: Record<string, string | null>; // mapping: wolfId -> 2nd targetId (bonus bite night)
  wolfLocked?: Record<string, boolean>;// wolfId nào đã nhấn nút "cắn" → true
  wolfTimer?: NodeJS.Timeout | null; // thời gian server tự động kết thúc
  wolfDeadline?: number | null;  // thời gian chờ sói kết thúc cắn
  killedTonight?: string | null; // playerId người bị cắn đêm nay (hiện null nếu ko ai)
  killedTonightExtra?: string | null; // bonus victim (wolf cub died -> next night)
  wolfExtraBiteNextNight?: boolean; // if true, wolves can kill 2 targets next night (one-time)
  wolfBonusBiteThisNight?: boolean; // internal: whether current night has a bonus bite
  deadPlayers?: string[]; // danh sách playerId đã chết

  // --- Phần cho bảo vệ ---
  protectedTonight?: string | null; // playerId được bảo vệ trong đêm hiện tại
  lastProtected?: string | null; // playerId đã bảo vệ đêm trước (chống bảo vệ 2 đêm liên tiếp)
  seerUsedTonight?: Record<string, boolean>; // playerId (tiên tri) đã dùng chức năng trong đêm này

  // --- Phần cho phù thủy ---
  witchPotions?: Record<string, { healUsed: boolean; poisonUsed: boolean }>; // theo witchId
  witchHealTargetTonight?: Record<string, string | null>; // theo witchId (thường = wolf pending)
  witchPoisonTargetTonight?: Record<string, string | null>; // theo witchId

  // --- Phần cho thợ săn ---
  // hunterId -> targetId (mỗi đêm có thể chọn 1 người; nếu hunter chết trong đêm thì target cũng chết)
  hunterTargetTonight?: Record<string, string | null>;

  // UI flag: after the first auto-arrange, subsequent uses should confirm
  autoArrangeUsed?: boolean;

  // UI flag: whether circles are shown in compact mode (synced to all clients).
  compactCircles?: boolean;

  // Layout height mode: positions are normalized against this pixel height.
  // 470px for 1..18 players, 570px when 19+ (adds a bottom extra row).
  layoutHeightPx?: number;
}

const rooms: Record<string, Room> = {};
const activeRooms = new Set<string>(); // chứa toàn bộ mã phòng đã tạo

const WOLF_ROLES = new Set(["Sói", "Sói con"]);
function isWolfRole(role: string | undefined) {
  return !!role && WOLF_ROLES.has(role);
}

function isPlayerConnected(room: Room, playerId: string) {
  const player = room.players.find(p => p.id === playerId);
  return player ? player.connected !== false : false;
}

function getActiveWolves(room: Room) {
  const allWolves = room.players
    .filter(p => isWolfRole(room.playerRoles?.[p.id]))
    .map(p => p.id);
  const dead = new Set(room.deadPlayers || []);
  return allWolves.filter(id => !dead.has(id) && isPlayerConnected(room, id));
}

function getWitches(room: Room) {
  return room.players
    .filter(p => room.playerRoles?.[p.id] === "Phù thủy")
    .map(p => p.id);
}

function getHunters(room: Room) {
  return room.players
    .filter(p => room.playerRoles?.[p.id] === "Thợ săn")
    .map(p => p.id);
}

function emitHunterTarget(roomId: string, hunterId: string) {
  const room = rooms[roomId];
  if (!room) return;
  const targetId = room.hunterTargetTonight?.[hunterId] ?? null;
  io.to(hunterId).emit("hunterTargetUpdated", { targetId });
}

function getWitchPendingDeaths(room: Room): string[] {
  const guardianTarget = room.protectedTonight;
  const dead = new Set(room.deadPlayers || []);

  const candidates = [room.killedTonight, room.killedTonightExtra]
    .filter(Boolean)
    .filter(pid => pid !== guardianTarget) as string[];

  const unique: string[] = [];
  for (const pid of candidates) {
    if (!pid) continue;
    if (dead.has(pid)) continue;
    if (!room.players.find(p => p.id === pid)) continue;
    if (!unique.includes(pid)) unique.push(pid);
  }
  return unique;
}

function emitWitchPendingDeath(roomId: string) {
  const room = rooms[roomId];
  if (!room) return;

  const pendingTargets = getWitchPendingDeaths(room);
  for (const wid of getWitches(room)) {
    ensureWitchState(room, wid);
    const healUsed = room.witchPotions?.[wid]?.healUsed === true;
    const targetIds = healUsed ? [] : pendingTargets;
    io.to(wid).emit("witchPendingDeath", { targetId: targetIds[0] ?? null, targetIds });
  }
}

function ensureWitchState(room: Room, witchId: string) {
  room.witchPotions = room.witchPotions || {};
  room.witchHealTargetTonight = room.witchHealTargetTonight || {};
  room.witchPoisonTargetTonight = room.witchPoisonTargetTonight || {};

  if (!room.witchPotions[witchId]) {
    room.witchPotions[witchId] = { healUsed: false, poisonUsed: false };
  }
  if (typeof room.witchHealTargetTonight[witchId] === "undefined") {
    room.witchHealTargetTonight[witchId] = null;
  }
  if (typeof room.witchPoisonTargetTonight[witchId] === "undefined") {
    room.witchPoisonTargetTonight[witchId] = null;
  }
}

function emitWitchPotions(roomId: string, witchId: string) {
  const room = rooms[roomId];
  if (!room) return;
  ensureWitchState(room, witchId);
  io.to(witchId).emit("witchPotionsUpdated", room.witchPotions![witchId]);
}

function toPublicRoom(room: Room) {
  // IMPORTANT: tuyệt đối không emit NodeJS.Timeout (wolfTimer) vì nó gây lỗi serialize.
  // Trả về object thuần JSON.
  const {
    wolfTimer: _wolfTimer,
    seerUsedTonight: _seerUsedTonight,
    witchPotions: _witchPotions,
    witchHealTargetTonight: _witchHealTargetTonight,
    witchPoisonTargetTonight: _witchPoisonTargetTonight,
    hunterTargetTonight: _hunterTargetTonight,
    ...rest
  } = room;
  return {
    ...rest,
    players: room.players.map(p => ({ id: p.id, name: p.name, connected: p.connected !== false })),
  };
}


// Tạo phòng mới

function generateRoomId(activeRooms: Set<string>)  {
  let id;
  do {
    id = String(Math.floor(Math.random() * 1000)).padStart(3, "0"); // mã phòng 3 chữ số
  } while (activeRooms.has(id));

  activeRooms.add(id);
  return id;
}

function generateCirclePositions(playerIds: string[]) {
  const n = playerIds.length;
  return playerIds.map((id, i) => {
    const angle = (i / n) * 2 * Math.PI - Math.PI / 2;
    return {
      playerId: id,
      x: 0.5 + 0.35 * Math.cos(angle), // tâm (0.5, 0.5), bán kính 0.35
      y: 0.5 + 0.35 * Math.sin(angle),
    };
  });
}

type PlayerPos = { playerId: string; x: number; y: number };

// Layout assumptions (client canvas is typically ~600x400 in Game view)
type PositionLayout = {
  widthPx: number;
  heightPx: number;
  radiusPx: number;
  defaultGapPx: number;
  paddingPx: number;
};

const POSITION_LAYOUT: PositionLayout = {
  widthPx: 600,
  heightPx: 470,
  radiusPx: 40,
  defaultGapPx: 13.3,
  paddingPx: 6,
};

const BASE_FRAME_HEIGHT_PX = POSITION_LAYOUT.heightPx;
const EXTRA_FRAME_HEIGHT_PX = 100;
const EXPANDED_FRAME_HEIGHT_PX = BASE_FRAME_HEIGHT_PX + EXTRA_FRAME_HEIGHT_PX;
const AUTO_TOP_LIMIT = 18;

const COMPACT_RADIUS_PX = 23; // matches 46px circles on client

const JOIN_LAYOUT = {
  topHeightPx: 350,
  gapPx: 20,
  joinHeightPx: 100,
  maxPerRow: 7,
} as const;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function clamp01(v: number) {
  return Math.max(0, Math.min(1, v));
}

function clampToBounds(pos: PlayerPos, opts = POSITION_LAYOUT): PlayerPos {
  const marginX = (opts.radiusPx + opts.paddingPx) / opts.widthPx;
  const marginY = (opts.radiusPx + opts.paddingPx) / opts.heightPx;
  return {
    ...pos,
    x: Math.max(marginX, Math.min(1 - marginX, clamp01(pos.x))),
    y: Math.max(marginY, Math.min(1 - marginY, clamp01(pos.y))),
  };
}

function layoutOptsForRoom(room: Room) {
  const heightPx = room.layoutHeightPx ?? BASE_FRAME_HEIGHT_PX;
  const radiusPx = room.compactCircles ? COMPACT_RADIUS_PX : POSITION_LAYOUT.radiusPx;
  return { ...POSITION_LAYOUT, heightPx, radiusPx };
}

function desiredLayoutHeightPx(playerCount: number) {
  return playerCount > AUTO_TOP_LIMIT ? EXPANDED_FRAME_HEIGHT_PX : BASE_FRAME_HEIGHT_PX;
}

function rescaleRoomPositionsForHeight(room: Room, nextHeightPx: number) {
  const prevHeightPx = room.layoutHeightPx ?? BASE_FRAME_HEIGHT_PX;
  if (prevHeightPx === nextHeightPx) return false;

  const factor = prevHeightPx / nextHeightPx; // preserve pixel y: yNorm' = yNorm * (prev/next)
  const nextOpts = { ...POSITION_LAYOUT, heightPx: nextHeightPx };

  room.positions = (room.positions || []).map(p => {
    const scaled: PlayerPos = { ...p, y: p.y * factor };
    return clampToBounds(scaled, nextOpts);
  });
  room.layoutHeightPx = nextHeightPx;
  return true;
}

function distSqPx(a: PlayerPos, b: PlayerPos, opts = POSITION_LAYOUT) {
  const dx = (a.x - b.x) * opts.widthPx;
  const dy = (a.y - b.y) * opts.heightPx;
  return dx * dx + dy * dy;
}

function isTooClose(a: PlayerPos, b: PlayerPos, minDistPx: number, opts = POSITION_LAYOUT) {
  return distSqPx(a, b, opts) < minDistPx * minDistPx;
}

function resolveOverlaps(
  positions: PlayerPos[],
  {
    minDistPx,
    anchoredIds,
    anchorStrength,
    iterations,
  }: {
    minDistPx: number;
    anchoredIds?: Set<string>;
    anchorStrength?: number; // 0..1; smaller = weaker pull to anchor
    iterations?: number;
  },
  opts = POSITION_LAYOUT
) {
  const anchors = new Map<string, { x: number; y: number }>();
  if (anchoredIds) {
    positions.forEach(p => {
      if (anchoredIds.has(p.playerId)) anchors.set(p.playerId, { x: p.x, y: p.y });
    });
  }

  const iters = iterations ?? 220;
  const k = anchorStrength ?? 0.02;
  const minDistSq = minDistPx * minDistPx;

  for (let iter = 0; iter < iters; iter++) {
    let moved = 0;

    for (let i = 0; i < positions.length; i++) {
      const a = positions[i]!;
      // If this position is anchored, keep it fully fixed to avoid drift.
      if (anchoredIds?.has(a.playerId)) continue;
      let pushXpx = 0;
      let pushYpx = 0;

      for (let j = 0; j < positions.length; j++) {
        if (i === j) continue;
        const b = positions[j]!;

        const dxPx = (a.x - b.x) * opts.widthPx;
        const dyPx = (a.y - b.y) * opts.heightPx;
        const d2 = dxPx * dxPx + dyPx * dyPx;
        if (d2 >= minDistSq) continue;

        const d = Math.sqrt(d2) || 0.0001;
        const overlap = (minDistPx - d) / d;
        pushXpx += dxPx * overlap;
        pushYpx += dyPx * overlap;
      }

      // anchor spring to keep old positions stable
      const anchor = anchors.get(a.playerId);
      if (anchor) {
        pushXpx += (anchor.x - a.x) * opts.widthPx * k;
        pushYpx += (anchor.y - a.y) * opts.heightPx * k;
      }

      if (pushXpx === 0 && pushYpx === 0) continue;
      const step = 0.6;
      a.x += (pushXpx / opts.widthPx) * 0.06 * step;
      a.y += (pushYpx / opts.heightPx) * 0.06 * step;
      const clamped = clampToBounds(a, opts);
      a.x = clamped.x;
      a.y = clamped.y;
      moved++;
    }

    if (moved === 0) break;
  }

  return positions;
}

function tryPlaceNewPoint(existing: PlayerPos[], id: string, minDistPx: number, opts = POSITION_LAYOUT): PlayerPos | null {
  const marginX = (opts.radiusPx + opts.paddingPx) / opts.widthPx;
  const marginY = (opts.radiusPx + opts.paddingPx) / opts.heightPx;

  const isExpanded = opts.heightPx > BASE_FRAME_HEIGHT_PX + 0.01;

  // For high player counts (notably 17/18 layouts), don't reserve the bottom join row.
  // Place new players somewhere inside the frame instead.
  const preferJoinRow = !isExpanded && existing.length < 17;

  // For 19+ players (expanded frame), place new players into the extra bottom row first.
  if (isExpanded && existing.length >= AUTO_TOP_LIMIT) {
    const extraCenterY = (BASE_FRAME_HEIGHT_PX + EXTRA_FRAME_HEIGHT_PX / 2) / opts.heightPx;
    const y = clamp(extraCenterY, marginY, 1 - marginY);

    const stepX = (2 * opts.radiusPx + opts.defaultGapPx) / opts.widthPx;
    const availableX = 1 - 2 * marginX;
    const maxSlots = Math.max(1, Math.floor(availableX / stepX) + 1);
    const slots = Math.min(JOIN_LAYOUT.maxPerRow, maxSlots);
    const startX = clamp(0.5 - (stepX * (slots - 1)) / 2, marginX, 1 - marginX);

    for (let i = 0; i < slots; i++) {
      const candidate: PlayerPos = {
        playerId: id,
        x: clamp(startX + stepX * i, marginX, 1 - marginX),
        y,
      };
      let ok = true;
      for (const p of existing) {
        if (isTooClose(candidate, p, minDistPx, opts)) {
          ok = false;
          break;
        }
      }
      if (ok) return candidate;
    }
  }

  if (!preferJoinRow) {
    const centerX = 0.5;
    const centerY = 0.5;
    const step = (2 * opts.radiusPx + opts.defaultGapPx) / Math.min(opts.widthPx, opts.heightPx);
    const rings = 6;
    const pointsPerRing = 10;

    for (let r = 0; r <= rings; r++) {
      const radius = r * step;
      const points = r === 0 ? 1 : pointsPerRing;
      for (let i = 0; i < points; i++) {
        const a = (i / points) * 2 * Math.PI;
        const candidate: PlayerPos = {
          playerId: id,
          x: clamp(centerX + Math.cos(a) * radius, marginX, 1 - marginX),
          y: clamp(centerY + Math.sin(a) * radius, marginY, 1 - marginY),
        };
        let ok = true;
        for (const p of existing) {
          if (isTooClose(candidate, p, minDistPx, opts)) {
            ok = false;
            break;
          }
        }
        if (ok) return candidate;
      }
    }
  }

  const joinStartPx = JOIN_LAYOUT.topHeightPx + JOIN_LAYOUT.gapPx;
  const joinCenterY = (joinStartPx + JOIN_LAYOUT.joinHeightPx / 2) / opts.heightPx;
  const joinCenterYClamped = clamp(joinCenterY, marginY, 1 - marginY);

  const stepX = (2 * opts.radiusPx + opts.defaultGapPx) / opts.widthPx;
  const availableX = 1 - 2 * marginX;
  const maxSlots = Math.max(1, Math.floor(availableX / stepX) + 1);
  const slots = Math.min(JOIN_LAYOUT.maxPerRow, maxSlots);
  const startX = clamp(0.5 - (stepX * (slots - 1)) / 2, marginX, 1 - marginX);

  if (preferJoinRow) for (let i = 0; i < slots; i++) {
    const candidate: PlayerPos = {
      playerId: id,
      x: clamp(startX + stepX * i, marginX, 1 - marginX),
      y: joinCenterYClamped,
    };
    let ok = true;
    for (const p of existing) {
      if (isTooClose(candidate, p, minDistPx, opts)) {
        ok = false;
        break;
      }
    }
    if (ok) return candidate;
  }

  // 2) Fallback: random anywhere
  for (let attempt = 0; attempt < 1200; attempt++) {
    const candidate: PlayerPos = {
      playerId: id,
      x: marginX + Math.random() * (1 - 2 * marginX),
      y: marginY + Math.random() * (1 - 2 * marginY),
    };
    let ok = true;
    for (const p of existing) {
      if (isTooClose(candidate, p, minDistPx, opts)) {
        ok = false;
        break;
      }
    }
    if (ok) return candidate;
  }
  return null;
}

function ensureNonOverlappingPositions(playerIds: string[], existingPositions?: PlayerPos[], opts = POSITION_LAYOUT): PlayerPos[] {
  const byId = new Map<string, PlayerPos>();
  (existingPositions || []).forEach(p => {
    byId.set(p.playerId, clampToBounds({ ...p }, opts));
  });

  const anchoredIds = new Set<string>();
  const result: PlayerPos[] = [];

  // 1) keep existing positions when possible
  for (const id of playerIds) {
    const ex = byId.get(id);
    if (ex) {
      anchoredIds.add(id);
      result.push({ ...ex });
    }
  }

  // 2) place missing players without overlap (prefer a small default gap)
  const preferredMinDistPx = 2 * opts.radiusPx + opts.defaultGapPx;
  const hardMinDistPx = 2 * opts.radiusPx;

  for (const id of playerIds) {
    if (byId.has(id)) continue;
    const placed =
      tryPlaceNewPoint(result, id, preferredMinDistPx, opts) ||
      tryPlaceNewPoint(result, id, hardMinDistPx, opts);

    if (placed) {
      result.push(placed);
      continue;
    }

    // fallback: start from circle + relax (guarantees best-effort packing)
    const fallback = generateCirclePositions([id])[0]!;
    result.push(clampToBounds({ ...fallback, playerId: id }, opts));
  }

  // 3) resolve overlaps; keep anchors stable unless necessary
  resolveOverlaps(result, {
    minDistPx: hardMinDistPx,
    anchoredIds,
    anchorStrength: 0.02,
    iterations: 260,
  }, opts);

  return result;
}

function resolveDraggedAgainstFixedOthers(dragged: PlayerPos, fixedOthers: PlayerPos[], opts = POSITION_LAYOUT): PlayerPos {
  const minDistPx = 2 * opts.radiusPx; // hard minimum
  const minDistSq = minDistPx * minDistPx;

  let p: PlayerPos = clampToBounds({ ...dragged }, opts);

  // Push only the dragged point away from fixed others.
  for (let iter = 0; iter < 24; iter++) {
    let moved = false;

    for (const o of fixedOthers) {
      const dxPx = (p.x - o.x) * opts.widthPx;
      const dyPx = (p.y - o.y) * opts.heightPx;
      const d2 = dxPx * dxPx + dyPx * dyPx;
      if (d2 >= minDistSq) continue;

      const d = Math.sqrt(d2) || 0.0001;
      const overlap = minDistPx - d;
      const nx = dxPx / d;
      const ny = dyPx / d;

      p.x += (nx * overlap) / opts.widthPx;
      p.y += (ny * overlap) / opts.heightPx;
      p = clampToBounds(p, opts);
      moved = true;
    }

    if (!moved) break;
  }

  // If still overlapping (too crowded), fall back to best-effort relax using existing layout.
  for (const o of fixedOthers) {
    if (isTooClose(p, o, minDistPx, opts)) {
      const fallback = ensureNonOverlappingPositions(
        [p.playerId, ...fixedOthers.map(x => x.playerId)],
        [p, ...fixedOthers],
        opts
      );
      const fixed = fallback.find(x => x.playerId === p.playerId);
      return fixed ? fixed : p;
    }
  }

  return p;
}


function startWolfPhase(roomId: string) {
  const room = rooms[roomId];
  if (!room) return;

  const wolves = room.players.filter(p => isWolfRole(room.playerRoles?.[p.id]));

  room.wolfVotes = {};
  room.wolfVotes2 = {};
  room.wolfLocked = {};
  wolves.forEach(w => {
    room.wolfVotes![w.id] = null;
    room.wolfVotes2![w.id] = null;
    room.wolfLocked![w.id] = false;
  });
  // Time chờ cho sói cắn
  room.wolfDeadline = Date.now() + 20_000; // 20 giây
  // broadcast cho cả phòng (client cần biết deadline để đếm ngược)
  io.to(`wolves_${roomId}`).emit("wolfPhaseStarted", {
    wolves: wolves.map(w => w.id),
    activeWolves: getActiveWolves(room),
    deadline: room.wolfDeadline,
    maxTargets: room.wolfBonusBiteThisNight ? 2 : 1,
  });

  // Ensure clients have a defined state for bonus target voting.
  io.to(`wolves_${roomId}`).emit("wolfVotes2Updated", room.wolfVotes2);

  // huỷ timer cũ nếu có
  if (room.wolfTimer) {
    clearTimeout(room.wolfTimer);
    room.wolfTimer = null;
  }

  // khi hết thời gian → xử lý vote
  room.wolfTimer = setTimeout(() => {
    finishWolfVoting(roomId);
  }, 20_000);
}

function finishWolfVoting(roomId: string) {
  const room = rooms[roomId];
  if (!room) return;

  // nếu timer còn tồn tại thì clear đi
  if (room.wolfTimer) {
    clearTimeout(room.wolfTimer);
    room.wolfTimer = null;
  }

  const votes = room.wolfVotes || {};
  const votes2 = room.wolfVotes2 || {};
  const activeWolves = getActiveWolves(room);

  const counts: Record<string, number> = {};
  activeWolves.forEach(wolfId => {
    const target = votes[wolfId];
    if (!target) return;
    counts[target] = (counts[target] || 0) + 1;
  });

  const entries = Object.entries(counts); // [ [playerId, count], ... ]

  // Hòa phiếu hoặc không ai vote
  if (entries.length === 0) {
    room.killedTonight = null;
  } else {
    // Sắp xếp phiếu từ nhiều xuống thấp
    entries.sort((a, b) => b[1] - a[1]);
    // Kiểm tra phiếu
    if (entries.length > 1 && entries[0]![1] === entries[1]![1]) { // dùng ! để TS ko nghĩ rằng entries[0] có thể undefined
      room.killedTonight = null; // hòa phiếu → ko chết ai
    } else {
      room.killedTonight = entries[0]![0]; // playerId bị cắn
    }
  }

  // Bonus bite: use combined selections (target #1 and #2) but ONLY shared votes count.
  // Rule (per user spec): if only one target has shared votes, only that one dies;
  // any remaining targets that tie (or don't reach 2 votes) are discarded.
  room.killedTonightExtra = null;
  if (room.wolfBonusBiteThisNight) {
    const votingWolves = activeWolves.filter(wid => !!votes[wid] || !!votes2[wid]);

    // If only one wolf actually voted this night, do NOT treat equal counts as a tie.
    // Just accept that wolf's selections (up to 2 unique targets).
    if (votingWolves.length <= 1) {
      const wid = votingWolves[0];
      const t1 = wid ? votes[wid] : null;
      const t2 = wid ? votes2[wid] : null;
      if (t1 && t2 && t1 !== t2) {
        room.killedTonight = t1;
        room.killedTonightExtra = t2;
      } else {
        room.killedTonight = t1 || t2 || null;
        room.killedTonightExtra = null;
      }
    } else {
      const combinedCounts: Record<string, number> = {};
      for (const wid of votingWolves) {
        const t1 = votes[wid];
        const t2 = votes2[wid];
        const uniq = new Set<string>();
        if (t1) uniq.add(t1);
        if (t2) uniq.add(t2);
        for (const t of uniq) {
          combinedCounts[t] = (combinedCounts[t] || 0) + 1;
        }
      }

      // Consider only targets with at least 2 votes (shared across wolves).
      const eligible = Object.entries(combinedCounts).filter(([, c]) => c >= 2);
      if (eligible.length === 0) {
        room.killedTonight = null;
        room.killedTonightExtra = null;
      } else {
        eligible.sort((a, b) => b[1] - a[1]);
        const topCount = eligible[0]![1];
        const topTied = eligible.filter(([, c]) => c === topCount);
        if (topTied.length >= 3) {
          // too many tied for first => nobody dies
          room.killedTonight = null;
          room.killedTonightExtra = null;
        } else if (topTied.length === 2) {
          // exactly two targets tied for first: both die
          room.killedTonight = topTied[0]![0];
          room.killedTonightExtra = topTied[1]![0];
        } else {
          room.killedTonight = eligible[0]![0];

          // second victim: next unique count >=2, and must not tie.
          const remaining = eligible.filter(([pid]) => pid !== room.killedTonight);
          if (remaining.length) {
            const secondCount = remaining[0]![1];
            const secondTied = remaining.filter(([, c]) => c === secondCount);
            if (secondTied.length === 1) {
              room.killedTonightExtra = remaining[0]![0];
            } else {
              room.killedTonightExtra = null;
            }
          }
        }
      }
    }
  }
  // thông báo kết quả sơ cho phòng (chưa công bố đến người chơi sáng, chỉ gửi event)
  io.to(roomId).emit("wolfVoteFinished", {
    target: room.killedTonight,
    extraTarget: room.killedTonightExtra,
  });

  // Phù thủy chỉ thấy "người sắp chết" nếu không bị bảo vệ cứu.
  emitWitchPendingDeath(roomId);
  // Lưu trạng thái: thực tế xử lý "chết" sẽ diễn ra khi host chuyển sang buổi sáng
}



// Khi client kết nối
io.on("connection", (socket) => {
  socket.on("createRoom", ({ name }) => {
    const roomId = generateRoomId(activeRooms);

    rooms[roomId] = {
      id: roomId,
      players: [{ id: socket.id, name, connected: true }],
      hostId: socket.id,
      layoutHeightPx: BASE_FRAME_HEIGHT_PX,
      positions: ensureNonOverlappingPositions([socket.id], undefined, { ...POSITION_LAYOUT, heightPx: BASE_FRAME_HEIGHT_PX }),   // khởi tạo vị trí
      positionEditors: [], // ai được phép sắp xếp
      autoArrangeUsed: false,
      compactCircles: false,
    };

    socket.join(roomId);

    // Gửi lại thông tin phòng cho người tạo
    socket.emit("roomCreated", toPublicRoom(rooms[roomId]));
  });

  socket.on("joinRoom", ({ roomId, name }) => {
    const room = rooms[roomId];
    if (!room) {
      socket.emit("errorMessage", "Phòng không tồn tại :(");
      return;
    }

    room.players.push({ id: socket.id, name, connected: true });

    // Expand/shrink layout height as needed, without visually moving existing players.
    const nextHeightPx = desiredLayoutHeightPx(room.players.length);
    rescaleRoomPositionsForHeight(room, nextHeightPx);

    const opts = layoutOptsForRoom(room);
    room.positions = ensureNonOverlappingPositions(room.players.map(p => p.id), room.positions, opts);
    socket.join(roomId);

    // 1) gửi riêng cho người vừa join
    socket.emit("roomJoined", toPublicRoom(room));

    // 2) gửi cho cả phòng để cập nhật
    io.to(roomId).emit("roomUpdated", toPublicRoom(room));
  });

  socket.on("getRoom", (roomId) => {
    const room = rooms[roomId];
    if (room) {
      socket.emit("roomUpdated", toPublicRoom(room));
      io.to(roomId).emit("positionsUpdated", room.positions);
      io.to(roomId).emit("positionEditorsUpdated", room.positionEditors || []);

      // Re-send private witch potion state on refresh/reconnect.
      if (room.playerRoles?.[socket.id] === "Phù thủy") {
        ensureWitchState(room, socket.id);
        emitWitchPotions(roomId, socket.id);
        emitWitchPendingDeath(roomId);
      }

      // Re-send private hunter target state on refresh/reconnect.
      if (room.playerRoles?.[socket.id] === "Thợ săn") {
        emitHunterTarget(roomId, socket.id);
      }

    } else {
      socket.emit("errorMessage", "Phòng không tồn tại :(");
    }
  });

  socket.on("rolesSelected", ({ roomId, roles }) => {
    const room = rooms[roomId];
    if (!room) return;

    // lưu danh sách role vào phòng
    room.roles = roles; 

    // 🔒 bộ role đã khóa
    room.rolesLocked = true;  

    // lưu lại danh sách người chơi lúc khóa
    room.lockedPlayerIds = room.players.map(p => p.id); 

    io.to(roomId).emit("rolesReady", roles);
  });

  socket.on("addAutoRoles", ({ roomId, count }) => {
    const room = rooms[roomId];
    if (!room) return;

    room.roles = room.roles || []; 

    const currentVillagers = room.roles.filter(r => r === "Dân").length;
    const maxVillagers = 10;

    const availableToAdd = maxVillagers - currentVillagers;

    if (availableToAdd <= 0) {
      // Đã đạt tối đa dân, không thêm nữa
      const stillMissing = room.players.length - room.roles.length;
      io.to(room.hostId).emit("roleMismatch", {
        newPlayers: [],
        missingRoles: stillMissing
      });
      return;
    }

    const addCount = Math.min(count, availableToAdd);

    for (let i = 0; i < addCount; i++) {
      room.roles.push("Dân");
    }

    // Sau khi thêm, kiểm tra còn thiếu không
    const stillMissing = room.players.length - room.roles.length;

    if (stillMissing > 0) {
      io.to(room.hostId).emit("roleMismatch", {
        newPlayers: [],
        missingRoles: stillMissing
      });
      return;
    }

    // Đủ role → bắt đầu game luôn
    const shuffled = room.roles.slice().sort(() => Math.random() - 0.5);
    room.playerRoles = {};

    room.players.forEach((player, index) => {
      const role = shuffled[index]!; // dùng dấu chấm than vì chắc chắn số role phải bằng hoặc nhiều hơn số người
      room.playerRoles![player.id] = role;
      io.to(player.id).emit("yourRole", role);
    });

    // Thiết lập lại danh sách sói để các chức năng sói hoạt động đúng
    room.wolves = room.players
      .filter(p => isWolfRole(room.playerRoles?.[p.id]))
      .map(p => p.id);

    room.wolves.forEach(wolfId => {
      const wolfSocket = io.sockets.sockets.get(wolfId);
      if (wolfSocket) wolfSocket.join(`wolves_${roomId}`);
    });

    // Khởi tạo mảng người chết (để tránh lỗi undefined)
    room.deadPlayers = room.deadPlayers || [];
    room.wolfExtraBiteNextNight = room.wolfExtraBiteNextNight || false;
    room.wolfBonusBiteThisNight = false;
    room.killedTonightExtra = null;
    
    // Đánh dấu game đã bắt đầu (mặc định là ban ngày)
    room.phase = "day";

    io.to(roomId).emit("gameStarted");

    // Cập nhật lại lockedPlayerIds sau khi đã bổ sung role và bắt đầu game
    room.lockedPlayerIds = room.players.map(p => p.id);
  });

  socket.on("updatePositions", ({ roomId, positions, markAutoArrangeUsed }) => {
    const room = rooms[roomId];
    if (!room) return;

    const isHost = socket.id === room.hostId;
    const isEditor = room.positionEditors?.includes(socket.id);

    if (!isHost && !isEditor) {
      socket.emit("errorMessage", "Bạn không có quyền chỉnh vị trí.");
      return;
    }

    const playerIds = room.players.map(p => p.id);

    // Ensure height mode stays consistent even if clients race updates around join/leave.
    const desiredHeightPx = desiredLayoutHeightPx(playerIds.length);
    rescaleRoomPositionsForHeight(room, desiredHeightPx);

    // Ensure server sanitizes against the current layout height and circle size.
    const opts = layoutOptsForRoom(room);
    const hasAllPlayers = (room.positions || []).length === playerIds.length;
    const current = room.positions && hasAllPlayers
      ? room.positions.map(p => clampToBounds({ ...p }, opts))
      : ensureNonOverlappingPositions(playerIds, room.positions, opts);

    // Detect "single-drag" updates: only one player changed compared to current.
    const incomingById = new Map<string, PlayerPos>();
    (positions || []).forEach((p: PlayerPos) => incomingById.set(p.playerId, p));
    const currentById = new Map<string, PlayerPos>();
    current.forEach(p => currentById.set(p.playerId, p));

    const EPS = 0.0005;
    const changedIds: string[] = [];
    for (const id of playerIds) {
      const inc = incomingById.get(id);
      const cur = currentById.get(id);
      if (!inc || !cur) continue;
      if (Math.abs(inc.x - cur.x) > EPS || Math.abs(inc.y - cur.y) > EPS) changedIds.push(id);
    }

    if (changedIds.length === 1) {
      const draggedId = changedIds[0]!;
      const draggedIncoming = incomingById.get(draggedId);
      const draggedCurrent = currentById.get(draggedId);

      if (draggedIncoming && draggedCurrent) {
        const fixedOthers = current.filter(p => p.playerId !== draggedId);
        const resolvedDragged = resolveDraggedAgainstFixedOthers(
          { ...draggedCurrent, x: draggedIncoming.x, y: draggedIncoming.y },
          fixedOthers,
          opts
        );
        room.positions = [...fixedOthers, resolvedDragged];
        io.to(roomId).emit("positionsUpdated", room.positions);
        return;
      }
    }

    // Multi-change updates (swap/auto-arrange) or ambiguous updates: sanitize globally.
    room.positions = ensureNonOverlappingPositions(playerIds, positions, opts);
    io.to(roomId).emit("positionsUpdated", room.positions);

    if (markAutoArrangeUsed && !room.autoArrangeUsed) {
      room.autoArrangeUsed = true;
      io.to(roomId).emit("roomUpdated", toPublicRoom(room));
    }
  });

  socket.on("setCompactCircles", ({ roomId, compact }: { roomId: string; compact: boolean }) => {
    const room = rooms[roomId];
    if (!room) return;

    const isHost = socket.id === room.hostId;
    const isEditor = room.positionEditors?.includes(socket.id);
    if (!isHost && !isEditor) {
      socket.emit("errorMessage", "Bạn không có quyền chỉnh vị trí.");
      return;
    }

    room.compactCircles = !!compact;
    io.to(roomId).emit("roomUpdated", toPublicRoom(room));
  });

  socket.on("grantPositionEdit", ({ roomId, targetId }) => {
    const room = rooms[roomId];
    if (!room) return;
    if (socket.id !== room.hostId) return;

    room.positionEditors = room.positionEditors || [];
    if (!room.positionEditors.includes(targetId)) {
      room.positionEditors.push(targetId);
    }

    io.to(roomId).emit("positionEditorsUpdated", room.positionEditors);
  });

  socket.on("revokePositionEdit", ({ roomId, targetId }) => {
    const room = rooms[roomId];
    if (!room) return;
    if (socket.id !== room.hostId) return;

    room.positionEditors = (room.positionEditors || []).filter(id => id !== targetId);
    io.to(roomId).emit("positionEditorsUpdated", room.positionEditors);
  });

  console.log("Một client đã kết nối:", socket.id);

  socket.on("disconnect", () => {
    console.log("Client ngắt:", socket.id);

    for (const roomId in rooms) {
      const room = rooms[roomId];
      if (!room) continue;

      // tìm user trong room
      const playerIndex = room.players.findIndex(p => p.id === socket.id);
      if (playerIndex !== -1) {
        const isHost = room.hostId === socket.id;

        // Nếu game đã bắt đầu -> không xoá khỏi phòng, chỉ đánh dấu mất kết nối
        if (room.phase) {
          room.players[playerIndex] = { ...room.players[playerIndex]!, connected: false };

          // Nếu là sói và đang ở night phase -> bỏ qua hành động của họ
          if (isWolfRole(room.playerRoles?.[socket.id])) {
            if (room.wolfVotes) room.wolfVotes[socket.id] = null;
            if (room.wolfVotes2) room.wolfVotes2[socket.id] = null;
            if (room.wolfLocked) room.wolfLocked[socket.id] = false;
            io.to(`wolves_${roomId}`).emit("wolfVotesUpdated", room.wolfVotes || {});
            io.to(`wolves_${roomId}`).emit("wolfVotes2Updated", room.wolfVotes2 || {});
            io.to(`wolves_${roomId}`).emit("wolfLockedUpdated", room.wolfLocked || {});

            // nếu các sói còn online đã lock hết -> chốt luôn
            const activeWolves = getActiveWolves(room);
            const allLocked = activeWolves.length > 0 && activeWolves.every(id => room.wolfLocked?.[id] === true);
            if (allLocked) {
              finishWolfVoting(roomId);
            }
          }

          // broadcast cho cả phòng để hiện badge mất kết nối
          io.to(roomId).emit("roomUpdated", toPublicRoom(room));

          // Nếu host mất kết nối khi game đang diễn ra
          if (isHost) {
            io.to(roomId).emit("hostDisconnected");
            console.log(`Host mất kết nối khi game đang diễn ra ở phòng ${roomId}`);
          }

          break;
        }

        // Game chưa bắt đầu -> xoá user khỏi room như cũ
        room.players.splice(playerIndex, 1);
        // Xóa cả position luôn
        room.positions = (room.positions || []).filter(pos => pos.playerId !== socket.id);

        // If we crossed the 18↔19 boundary, rescale remaining positions back.
        const nextHeightPx = desiredLayoutHeightPx(room.players.length);
        const changed = rescaleRoomPositionsForHeight(room, nextHeightPx);
        if (changed) {
          const opts = layoutOptsForRoom(room);
          room.positions = (room.positions || []).map(p => clampToBounds({ ...p }, opts));
        }

        io.to(roomId).emit("positionsUpdated", room.positions);

        // nếu phòng trống → xoá phòng
        if (room.players.length === 0) {
          delete rooms[roomId];
          activeRooms.delete(roomId);
          console.log(`Phòng ${roomId} đã đóng vì trống.`);
        } else {
          // Nếu host rời phòng
          if (isHost) {
            // Chuyển quyền host cho người đầu tiên còn lại
            if (room.players[0]) {
              room.hostId = room.players[0].id;
              io.to(roomId).emit("hostChanged", room.hostId);
              io.to(roomId).emit("roomUpdated", toPublicRoom(room));
              console.log(`Chủ phòng rời, chuyển quyền cho ${room.hostId}`);
            }
          } else {
            // nếu còn người → cập nhật room
            io.to(roomId).emit("roomUpdated", toPublicRoom(room));
          }
        }
        break;
      }
    }
  });

  socket.on("startGame", (roomId) => {
    const room = rooms[roomId];
    if (!room) return;

    // Kiểm tra nếu đã lock role và có người mới vào
    if (room.rolesLocked && room.lockedPlayerIds) {
      const lockedCount = room.lockedPlayerIds.length;
      const currentCount = room.players.length;
      if (currentCount > lockedCount) {
        const newPlayers = room.players.filter(
          p => !room.lockedPlayerIds!.includes(p.id)
        );
        const missingRoles = Math.max(0, currentCount - (room.roles?.length || 0));
        // gửi cảnh báo CHỈ đến host
        if (missingRoles > 0) {
          io.to(room.hostId).emit("roleMismatch", {
            newPlayers,
            missingRoles
          });
          return;
        }
      }
    }

    const roles = room.roles;
    if (!roles || roles.length < room.players.length) {
      socket.emit("errorMessage", "Danh sách vai trò không hợp lệ hoặc chưa được chọn.");
      return;
    }

    // random role cho mỗi người và lưu mapping
    const shuffled = roles.slice().sort(() => Math.random() - 0.5);
    room.playerRoles = {};
    room.players.forEach((player, index) => {
      const role: string = shuffled[index] || "";
      room.playerRoles![player.id] = role;
      // gửi role bí mật cho từng client
      console.log(`[yourRole emit] Gửi role '${role}' cho player ${player.id}`);
      io.to(player.id).emit("yourRole", role);
    });


    // Thiết lập danh sách sói
    room.wolves = room.players
      .filter(p => isWolfRole(room.playerRoles?.[p.id]))
      .map(p => p.id);

    room.wolves.forEach(wolfId => {
      const wolfSocket = io.sockets.sockets.get(wolfId);
      if (wolfSocket) wolfSocket.join(`wolves_${roomId}`);
    });

    // Thiết lập danh sách phù thủy
    const witches = getWitches(room);
    witches.forEach(witchId => {
      const witchSocket = io.sockets.sockets.get(witchId);
      if (witchSocket) witchSocket.join(`witches_${roomId}`);
      ensureWitchState(room, witchId);
      emitWitchPotions(roomId, witchId);
    });

    // đảm bảo danh sách deadPlayers tồn tại
    room.deadPlayers = room.deadPlayers || [];

    room.wolfExtraBiteNextNight = room.wolfExtraBiteNextNight || false;
    room.wolfBonusBiteThisNight = false;
    room.killedTonightExtra = null;


    // Đánh dấu game đã bắt đầu (mặc định là ban ngày)
    room.phase = "day";

    // thông báo cho cả phòng rằng game đã bắt đầu
    io.to(roomId).emit("gameStarted");

  });

  // changePhase phải ở bên ngoài startGame
  socket.on("changePhase", ({ roomId, phase }) => {
    const room = rooms[roomId];
    if (!room) return;

    room.phase = phase; // "day" hoặc "night"
    console.log(`[changePhase] Phòng ${roomId} chuyển sang phase '${phase}'`);
    // Gửi phase cho cả phòng
    io.to(roomId).emit("phaseChanged", phase);

    if (phase === "night") {
      // Determine whether wolves have a one-time bonus bite this night.
      room.wolfBonusBiteThisNight = !!room.wolfExtraBiteNextNight;
      room.wolfExtraBiteNextNight = false;
      room.killedTonightExtra = null;

      // reset lựa chọn của bảo vệ cho đêm mới
      room.protectedTonight = null;

      // reset chọn bình trong đêm (không reset potion đã dùng)
      room.witchHealTargetTonight = room.witchHealTargetTonight || {};
      room.witchPoisonTargetTonight = room.witchPoisonTargetTonight || {};
      for (const wid of getWitches(room)) {
        ensureWitchState(room, wid);
        room.witchHealTargetTonight[wid] = null;
        room.witchPoisonTargetTonight[wid] = null;
        emitWitchPotions(roomId, wid);
      }

      // ban đầu đêm chưa có người sắp chết
      emitWitchPendingDeath(roomId);

      room.seerUsedTonight = {};

      // reset lựa chọn thợ săn cho đêm mới
      room.hunterTargetTonight = room.hunterTargetTonight || {};
      for (const hid of getHunters(room)) {
        room.hunterTargetTonight[hid] = null;
        emitHunterTarget(roomId, hid);
      }

      startWolfPhase(roomId);
    } 
    else if (phase === "day") {
      // khi chuyển sang sáng -> nếu có người bị cắn thì công bố và đánh dấu dead
      const killedCandidate = room.killedTonight;
      const killedCandidateExtra = room.killedTonightExtra;
      const guardianTarget = room.protectedTonight;

      const pendingWolfDeaths = [killedCandidate, killedCandidateExtra]
        .filter(Boolean)
        .filter(pid => pid !== guardianTarget) as string[];
      const healedTargets = new Set<string>();
      const poisonTargets = new Set<string>();

      // apply witch actions
      for (const wid of getWitches(room)) {
        ensureWitchState(room, wid);
        const healTarget = room.witchHealTargetTonight?.[wid] || null;
        if (healTarget) healedTargets.add(healTarget);

        const poisonTarget = room.witchPoisonTargetTonight?.[wid] || null;
        if (poisonTarget) poisonTargets.add(poisonTarget);
      }

      const finalDeathSet = new Set<string>();
      for (const pid of pendingWolfDeaths) {
        if (pid && !healedTargets.has(pid)) finalDeathSet.add(pid);
      }
      for (const t of poisonTargets) {
        finalDeathSet.add(t);
      }

      // Nếu thợ săn chết trong đêm, người thợ săn đã chọn cũng chết theo.
      for (const hid of getHunters(room)) {
        if (!finalDeathSet.has(hid)) continue;
        const targetId = room.hunterTargetTonight?.[hid] || null;
        if (!targetId) continue;
        if (targetId === hid) continue;
        if ((room.deadPlayers || []).includes(targetId)) continue;
        if (!room.players.find(p => p.id === targetId)) continue;
        finalDeathSet.add(targetId);
      }

      const finalDeaths = Array.from(finalDeathSet);
      if (finalDeaths.length) {
        room.deadPlayers = room.deadPlayers || [];
        for (const pid of finalDeaths) {
          if (!pid) continue;
          if (room.deadPlayers.includes(pid)) continue;
          // chỉ giết người còn trong phòng
          if (!room.players.find(p => p.id === pid)) continue;
          room.deadPlayers.push(pid);
          io.to(roomId).emit("playerKilled", pid);
        }

        // If the Wolf Cub died tonight, enable a one-time bonus bite next night.
        if (!room.wolfExtraBiteNextNight) {
          const cubDied = finalDeaths.some(pid => room.playerRoles?.[pid] === "Sói con");
          if (cubDied) room.wolfExtraBiteNextNight = true;
        }
      }

      // cập nhật lastProtected sau khi kết thúc đêm
      if (guardianTarget) {
        room.lastProtected = guardianTarget;
      }
      room.protectedTonight = null;
      room.killedTonight = null;
      room.killedTonightExtra = null;

      // reset lựa chọn thợ săn sau khi kết thúc đêm
      room.hunterTargetTonight = room.hunterTargetTonight || {};
      for (const hid of getHunters(room)) {
        room.hunterTargetTonight[hid] = null;
        emitHunterTarget(roomId, hid);
      }

      // reset per-night witch choices after resolving
      room.witchHealTargetTonight = room.witchHealTargetTonight || {};
      room.witchPoisonTargetTonight = room.witchPoisonTargetTonight || {};
      for (const wid of getWitches(room)) {
        room.witchHealTargetTonight[wid] = null;
        room.witchPoisonTargetTonight[wid] = null;
      }

      room.seerUsedTonight = {};
          // cleanup any wolf phase leftover
        if (room.wolfTimer) {
          clearTimeout(room.wolfTimer);
          room.wolfTimer = null;
        }
        room.wolfVotes = {};
        room.wolfVotes2 = {};
        room.wolfLocked = {};
        room.wolfDeadline = null;
        room.wolfBonusBiteThisNight = false;
    }
  });

  // Xử lý chức năng thợ săn chọn mục tiêu trong đêm
  socket.on("hunterChooseTarget", ({ roomId, targetId }) => {
    const room = rooms[roomId];
    if (!room) return;

    if (room.phase !== "night") return;
    if (room.playerRoles?.[socket.id] !== "Thợ săn") return;
    if ((room.deadPlayers || []).includes(socket.id)) return;

    room.hunterTargetTonight = room.hunterTargetTonight || {};

    // Cho phép clear bằng null/undefined
    if (!targetId) {
      room.hunterTargetTonight[socket.id] = null;
      emitHunterTarget(roomId, socket.id);
      return;
    }

    // target phải tồn tại trong phòng và còn sống
    if (!room.players.find(p => p.id === targetId)) return;
    if ((room.deadPlayers || []).includes(targetId)) return;

    room.hunterTargetTonight[socket.id] = targetId;
    emitHunterTarget(roomId, socket.id);
  });

  // Nhường quyền chủ phòng cho người khác
  socket.on("transferHost", ({ roomId, targetId }) => {
    const room = rooms[roomId];
    if (!room) return;
    if (socket.id !== room.hostId) return; // chỉ host mới được nhường quyền
    if (!room.players.find(p => p.id === targetId)) return;
    room.hostId = targetId;
    io.to(roomId).emit("hostChanged", room.hostId);
    io.to(roomId).emit("roomUpdated", toPublicRoom(room));
  });

  // Kick người chơi khỏi phòng
  socket.on("kickPlayer", ({ roomId, targetId }) => {
    const room = rooms[roomId];
    if (!room) return;
    if (socket.id !== room.hostId) return; // chỉ host mới được kick
    if (!room.players.find(p => p.id === targetId)) return;
    // Xoá player khỏi room
    room.players = room.players.filter(p => p.id !== targetId);
    // Nếu bị kick là host (trường hợp hiếm), chuyển quyền cho người đầu tiên còn lại
    if (room.hostId === targetId && room.players.length > 0) {
      const firstPlayer = room.players[0];
      if (firstPlayer) {
        room.hostId = firstPlayer.id;
        io.to(roomId).emit("hostChanged", room.hostId);
      }
    }
    io.to(roomId).emit("roomUpdated", toPublicRoom(room));
    io.to(targetId).emit("kicked"); // thông báo cho người bị kick
  });

  // Xử lý chức năng tiên tri soi người
  socket.on("seerCheck", ({ roomId, targetId }) => {
    const room = rooms[roomId];
    if (!room || !room.playerRoles) return;

    // chỉ được dùng vào ban đêm
    if (room.phase !== "night") return;

    // chỉ tiên tri mới được dùng
    if (room.playerRoles?.[socket.id] !== "Tiên tri") return;

    // tiên tri chết thì không được chọn
    if ((room.deadPlayers || []).includes(socket.id)) return;

    // target phải tồn tại trong phòng và còn sống
    if (!room.players.find(p => p.id === targetId)) return;
    if ((room.deadPlayers || []).includes(targetId)) return;

    // mỗi đêm chỉ dùng 1 lần
    room.seerUsedTonight = room.seerUsedTonight || {};
    if (room.seerUsedTonight[socket.id]) {
      socket.emit("errorMessage", "Bạn đã dùng chức năng tiên tri trong đêm này rồi!");
      return;
    }
    room.seerUsedTonight[socket.id] = true;

    const roleOfTarget = room.playerRoles[targetId];
    const isWolf = isWolfRole(roleOfTarget);
    io.to(socket.id).emit("seerResult", { playerId: targetId, isWolf });
  });

  // Xử lý chức năng bảo vệ bảo vệ người
  socket.on("guardianProtect", ({ roomId, targetId }) => {
    const room = rooms[roomId];
    if (!room) return;

    // chỉ được dùng vào ban đêm
    if (room.phase !== "night") return;

    // chỉ bảo vệ mới được chọn
    if (room.playerRoles?.[socket.id] !== "Bảo vệ") return;

    // bảo vệ chết thì không được chọn
    if ((room.deadPlayers || []).includes(socket.id)) return;

    // đã xác nhận bảo vệ đêm nay thì không được đổi nữa
    if (room.protectedTonight) {
      socket.emit("errorMessage", "Bạn đã xác nhận bảo vệ đêm nay rồi, không thể thay đổi lựa chọn.");
      return;
    }

    // target phải tồn tại trong phòng và còn sống
    if (!room.players.find(p => p.id === targetId)) return;
    if ((room.deadPlayers || []).includes(targetId)) return;

    // Không bảo vệ cùng người 2 đêm liên tiếp
    if (room.lastProtected && room.lastProtected === targetId) {
      socket.emit("errorMessage", "Không thể bảo vệ cùng người hai đêm liên tiếp!");
      return;
    }

    room.protectedTonight = targetId;
    io.to(socket.id).emit("guardianProtected", targetId);

    // Nếu bảo vệ trúng người sói cắn, phù thủy sẽ không còn thấy ai sắp chết.
    emitWitchPendingDeath(roomId);
  });

  // Xử lý chức năng phù thủy dùng bình cứu
  socket.on("witchHeal", ({ roomId, targetId }) => {
    const room = rooms[roomId];
    if (!room) return;

    if (room.phase !== "night") return;
    if (room.playerRoles?.[socket.id] !== "Phù thủy") return;
    if ((room.deadPlayers || []).includes(socket.id)) return;

    ensureWitchState(room, socket.id);

    const potions = room.witchPotions![socket.id]!;
    if (potions.healUsed) {
      socket.emit("errorMessage", "Bạn đã dùng bình cứu rồi!");
      return;
    }

    const pendingTargets = getWitchPendingDeaths(room);
    if (!pendingTargets.length) {
      socket.emit("errorMessage", "Không có ai sắp chết để dùng bình cứu.");
      return;
    }

    if (!targetId || !pendingTargets.includes(targetId)) {
      socket.emit("errorMessage", "Mục tiêu bình cứu không hợp lệ.");
      return;
    }

    potions.healUsed = true;
    room.witchHealTargetTonight![socket.id] = targetId;
    emitWitchPotions(roomId, socket.id);

    // After using heal, this witch should no longer see pending deaths.
    emitWitchPendingDeath(roomId);
  });

  // Xử lý chức năng phù thủy dùng bình giết
  socket.on("witchPoison", ({ roomId, targetId }) => {
    const room = rooms[roomId];
    if (!room) return;

    if (room.phase !== "night") return;
    if (room.playerRoles?.[socket.id] !== "Phù thủy") return;
    if ((room.deadPlayers || []).includes(socket.id)) return;

    ensureWitchState(room, socket.id);

    const potions = room.witchPotions![socket.id]!;
    if (potions.poisonUsed) {
      socket.emit("errorMessage", "Bạn đã dùng bình giết rồi!");
      return;
    }

    // không giết bản thân
    if (targetId === socket.id) {
      socket.emit("errorMessage", "Bạn không thể dùng bình giết lên chính mình.");
      return;
    }

    // target phải tồn tại và còn sống
    if (!room.players.find(p => p.id === targetId)) return;
    if ((room.deadPlayers || []).includes(targetId)) return;

    potions.poisonUsed = true;
    room.witchPoisonTargetTonight![socket.id] = targetId;
    emitWitchPotions(roomId, socket.id);
  });

  // Xử lý chức năng sói chọn cắn ai
  socket.on("wolfChooseTarget", ({ roomId, targetId }) => {
    const room = rooms[roomId];
    if (!room) return;
    if (!isWolfRole(room.playerRoles?.[socket.id])) return; // chỉ phe sói mới được chọn
    if ((room.deadPlayers || []).includes(socket.id)) return; // sói chết -> bỏ qua
    if (room.phase !== "night") return;

    // nếu sói đã cắn thì ko cho thay đổi
    if (room.wolfLocked?.[socket.id]) {
      socket.emit("errorMessage", "Bạn đã bấm CẮN, không thể thay đổi lựa chọn.");
      return;
    }

    room.wolfVotes = room.wolfVotes || {}; // khởi tạo nếu chưa có

    // Allow clear by null/undefined
    if (!targetId) {
      room.wolfVotes[socket.id] = null;
      io.to(`wolves_${roomId}`).emit("wolfVotesUpdated", room.wolfVotes);
      return;
    }

    // Validate target exists and alive
    if (!room.players.find(p => p.id === targetId)) return;
    if ((room.deadPlayers || []).includes(targetId)) return;

    // Prevent voting for yourself or wolf-team
    if (targetId === socket.id) return;
    if (isWolfRole(room.playerRoles?.[targetId])) return;

    room.wolfVotes[socket.id] = targetId;

    // Gửi cập nhật vote cho tất cả sói để họ nhìn thấy
    io.to(`wolves_${roomId}`).emit("wolfVotesUpdated", room.wolfVotes); 
  });

  // Xử lý mục tiêu cắn thứ 2 (chỉ khi có bonus bite)
  socket.on("wolfChooseTarget2", ({ roomId, targetId }) => {
    const room = rooms[roomId];
    if (!room) return;
    if (!isWolfRole(room.playerRoles?.[socket.id])) return;
    if (room.phase !== "night") return;
    if ((room.deadPlayers || []).includes(socket.id)) return;

    // Chỉ cho chọn mục tiêu #2 khi đêm này có bonus
    if (!room.wolfBonusBiteThisNight) return;

    // nếu sói đã lock thì ko cho thay đổi
    if (room.wolfLocked?.[socket.id]) {
      socket.emit("errorMessage", "Bạn đã bấm CẮN, không thể thay đổi lựa chọn.");
      return;
    }

    room.wolfVotes2 = room.wolfVotes2 || {};

    // Allow clear by null/undefined
    if (!targetId) {
      room.wolfVotes2[socket.id] = null;
      io.to(`wolves_${roomId}`).emit("wolfVotes2Updated", room.wolfVotes2);
      return;
    }

    // Validate target exists and alive
    if (!room.players.find(p => p.id === targetId)) return;
    if ((room.deadPlayers || []).includes(targetId)) return;

    // Prevent voting for yourself or wolf-team
    if (targetId === socket.id) return;
    if (isWolfRole(room.playerRoles?.[targetId])) return;

    // Prevent selecting the same as primary
    if (room.wolfVotes?.[socket.id] && room.wolfVotes[socket.id] === targetId) return;

    room.wolfVotes2[socket.id] = targetId;
    io.to(`wolves_${roomId}`).emit("wolfVotes2Updated", room.wolfVotes2);
  });

  // Xử lý khi sói nhấn nút "Cắn" (lock vote)
  socket.on("wolfLockVote", ({ roomId }) => {
    const room = rooms[roomId];
    if (!room) return;

    if (!isWolfRole(room.playerRoles?.[socket.id])) return;
    if (room.phase !== "night") return;

    room.wolfLocked = room.wolfLocked || {}; // khởi tạo nếu chưa có
    room.wolfLocked![socket.id] = true;

    // Gửi cập nhật trạng thái lock cho tất cả sói
    io.to(`wolves_${roomId}`).emit("wolfLockedUpdated", room.wolfLocked);

    // nếu tất cả sói đã lock → xử lý ngay, không chờ hết 10 giây
    const activeWolves = getActiveWolves(room);
    const allLocked = activeWolves.length > 0 && activeWolves.every(id => room.wolfLocked?.[id] === true);
    if (allLocked) {
    if (room.wolfTimer) { // nếu timer còn tồn tại
      clearTimeout(room.wolfTimer);
      room.wolfTimer = null;
    }
    finishWolfVoting(roomId);
    }
  });


});


// Start server
httpServer.listen(3001, () => {
  console.log("Backend đang chạy tại http://localhost:3001");
});


