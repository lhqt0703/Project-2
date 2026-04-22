
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
  inGame?: boolean; // true = đang ở màn Game; false = đang ở Room/Lobby
}

interface RoomGameRules {
  twoHeartsFirstTwoNights: boolean;
  allNightActionsSimultaneous: boolean;
  witchSeeBiteOnlyIfHasHealPotion: boolean;
  witchHideProtectedBiteInSimultaneous: boolean;
  witchHideProtectedBiteWhenSequential: boolean;
  trialInteractionSelectionLimit: number;
  nonWolfNightActionDurationSec: number;
  nightActionOrder: NightActionRole[];
}

type NightActionRole = "Sói" | "Bảo vệ" | "Phù thủy" | "Linh sói" | "Thợ săn" | "Tiên tri";

interface Room {
  id: string;
  players: Player[];
  hostId: string; // ai là quản trò
  hidePlayerRoleText?: boolean; // host toggle: ẩn dòng role ở phía người chơi
  roles?: string[]; // danh sách role được chọn cho phòng
  rolesLocked?: boolean; // đã xác nhận role chưa
  lockedPlayerIds?: string[]; // danh sách id người chơi lúc xác nhận role
  phase?: string; // "day" hoặc "night"
  positions?: { playerId: string; x: number; y: number }[];
  positionEditors?: string[]; // ai được phép sắp xếp
  playerRoles?: Record<string, string>; // mapping playerId -> role

  // --- Game log ---
  // Nhật ký theo từng đêm. Host có thể xem mọi lúc; mọi người xem khi game kết thúc.
  nightCount?: number; // số đêm đã bắt đầu (tăng khi chuyển sang night)
  gameLog?: GameLogNight[];

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
  sharedHeartsVisible?: boolean;
  playerHearts?: Record<string, number>;

  // --- Phần vote ban ngày ---
  dayVoters?: string[]; // danh sách người chơi còn sống khi bắt đầu phiên vote ngày
  dayVotes?: Record<string, string | null>; // mapping: voterId -> targetId hoặc null
  dayLocked?: Record<string, boolean>; // voterId đã xác nhận khóa phiếu
  dayDiscussionTimer?: NodeJS.Timeout | null; // timer chờ kết thúc thảo luận để mở biểu quyết
  dayDiscussionDeadline?: number | null; // mốc thời gian kết thúc thảo luận ban ngày
  dayTimer?: NodeJS.Timeout | null; // timer tự động chốt vote ngày
  dayDeadline?: number | null; // mốc thời gian chốt vote ngày

  // --- Phiên thanh minh + biểu quyết sống/chết ---
  trialTargetId?: string | null; // người bị đưa lên thanh minh
  trialStage?: "none" | "defense" | "verdict";
  trialDefenseDeadline?: number | null;
  trialVerdictDeadline?: number | null;
  trialDefenseTimer?: NodeJS.Timeout | null;
  trialVerdictTimer?: NodeJS.Timeout | null;
  trialInteractionCut?: boolean;
  trialInteractionActiveIds?: string[]; // người đã bấm "Tương tác" (vòng trắng)
  trialSelectedInteractorId?: string | null; // người được chọn bởi bị cáo (vòng xanh)
  trialSelectedInteractorIds?: string[]; // người đã từng được bị cáo chọn tương tác
  trialInteractionSelectionLimit?: number; // số lượt bị cáo được chọn tương tác
  trialInteractionQueuedIds?: string[]; // hàng chờ những người muốn tương tác (để khôi phục khi được thêm lượt)
  trialVotes?: Record<string, "live" | "die" | null>; // voter -> sống/chết

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

  // --- Lượt đêm tuần tự (khi allNightActionsSimultaneous = false) ---
  nightTurnIndex?: number;
  nightTurnRole?: NightActionRole | null;
  nightTurnDeadline?: number | null;
  nightTurnPaused?: boolean;
  nightTurnRemainingMs?: number | null;
  nightTurnTimer?: NodeJS.Timeout | null;
  nightTurnOrderSnapshot?: NightActionRole[];

  // UI flag: after the first auto-arrange, subsequent uses should confirm
  autoArrangeUsed?: boolean;

  // UI flag: whether circles are shown in compact mode (synced to all clients).
  compactCircles?: boolean;

  // Layout height mode: positions are normalized against this pixel height.
  // 470px for 1..18 players, 570px when 19+ (adds a bottom extra row).
  layoutHeightPx?: number;

  // --- Game end state ---
  gameOver?: boolean;
  winner?: "wolves" | "villagers" | undefined;

  gameRules?: RoomGameRules;
  pendingGameRules?: RoomGameRules;

  // --- Linh sói (Spirit Wolf) ---
  spiritWolfId?: string | null;
  spiritWolfDecisionMade?: boolean;
  spiritWolfChoseSave?: boolean;
  // When true, Linh sói is considered wolf-aligned for seer + win condition,
  // but does NOT join wolves chat/biting group.
  spiritWolfWolfAligned?: boolean;
  // If true, Linh sói will become wolf-aligned starting next night.
  spiritWolfWolfAlignedPending?: boolean;
  spiritWolfPendingPoisonedWolfId?: string | null;
}

const DEFAULT_ROOM_GAME_RULES: RoomGameRules = {
  twoHeartsFirstTwoNights: true,
  allNightActionsSimultaneous: false,
  witchSeeBiteOnlyIfHasHealPotion: true,
  witchHideProtectedBiteInSimultaneous: false,
  witchHideProtectedBiteWhenSequential: true,
  trialInteractionSelectionLimit: 2,
  nonWolfNightActionDurationSec: 10,
  nightActionOrder: ["Sói", "Bảo vệ", "Phù thủy", "Linh sói", "Thợ săn", "Tiên tri"],
};

const WOLF_TURN_DURATION_MS = 20_000;
const TWO_HEARTS_MAX_HP = 2;
const TWO_HEARTS_NIGHT_LIMIT = 2;
const RULES_RESTART_FADE_IN_MS = 1000;
const RULES_RESTART_HOLD_MS = 2000;
const RULES_RESTART_FADE_OUT_MS = 500;
const RULES_RESTART_TOTAL_MS = RULES_RESTART_FADE_IN_MS + RULES_RESTART_HOLD_MS + RULES_RESTART_FADE_OUT_MS;
const RULES_RESTART_RESTART_AT_MS = RULES_RESTART_FADE_IN_MS + RULES_RESTART_HOLD_MS;

const NIGHT_ACTION_ROLE_SET = new Set<NightActionRole>(DEFAULT_ROOM_GAME_RULES.nightActionOrder);

function normalizeNightActionOrder(input: unknown): NightActionRole[] {
  const raw = Array.isArray(input) ? input : [];
  const unique: NightActionRole[] = [];
  for (const role of raw) {
    if (typeof role !== "string") continue;
    if (!NIGHT_ACTION_ROLE_SET.has(role as NightActionRole)) continue;
    if (unique.includes(role as NightActionRole)) continue;
    unique.push(role as NightActionRole);
  }

  for (const role of DEFAULT_ROOM_GAME_RULES.nightActionOrder) {
    if (!unique.includes(role)) unique.push(role);
  }
  return unique;
}

function clampTrialInteractionSelectionLimit(value: unknown) {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return DEFAULT_ROOM_GAME_RULES.trialInteractionSelectionLimit;
  return Math.max(0, Math.min(10, Math.floor(n)));
}

function clampNonWolfNightActionDurationSec(value: unknown) {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return DEFAULT_ROOM_GAME_RULES.nonWolfNightActionDurationSec;
  return Math.max(10, Math.min(30, Math.floor(n)));
}

function buildRoomGameRules(input?: Partial<RoomGameRules> | null): RoomGameRules {
  const merged: RoomGameRules = {
    ...DEFAULT_ROOM_GAME_RULES,
    ...(input || {}),
    trialInteractionSelectionLimit: clampTrialInteractionSelectionLimit(input?.trialInteractionSelectionLimit),
    nonWolfNightActionDurationSec: clampNonWolfNightActionDurationSec(input?.nonWolfNightActionDurationSec),
    nightActionOrder: normalizeNightActionOrder(input?.nightActionOrder),
  };

  return merged;
}

function ensureRoomGameRules(room: Room): RoomGameRules {
  room.gameRules = buildRoomGameRules(room.gameRules);
  return room.gameRules;
}

function initTwoHeartsForParticipants(room: Room) {
  const hp: Record<string, number> = {};
  for (const p of getParticipantPlayers(room)) {
    hp[p.id] = TWO_HEARTS_MAX_HP;
  }
  room.playerHearts = hp;
  room.sharedHeartsVisible = true;
}

function isTwoHeartsDamageMode(room: Room) {
  const rules = ensureRoomGameRules(room);
  return (
    rules.twoHeartsFirstTwoNights &&
    room.sharedHeartsVisible === true &&
    (room.nightCount || 0) <= TWO_HEARTS_NIGHT_LIMIT
  );
}

type GameLogEntryPhase = "night" | "day";

type WolfVoteBreakdown = {
  targetId: string;
  voterIds: string[];
};

type EliminationCause =
  | { type: "wolf"; attackerIds: string[] }
  | { type: "witch_poison" }
  | { type: "hunter_shot" }
  | { type: "day_vote"; voterIds: string[] }
  | { type: "trial_verdict"; voterIds: string[] };

type GameLogEntry =
  | { type: "wolf_vote"; phase: GameLogEntryPhase; voteBreakdown: WolfVoteBreakdown[] }
  | { type: "day_vote"; phase: GameLogEntryPhase; voteBreakdown: WolfVoteBreakdown[] }
  | { type: "wolf_result"; phase: GameLogEntryPhase; targetIds: string[]; selectedByByTarget?: Record<string, string[]> }
  | { type: "day_result"; phase: GameLogEntryPhase; targetId: string | null; tie?: boolean }
  | { type: "trial_started"; phase: GameLogEntryPhase; targetId: string }
  | { type: "trial_verdict"; phase: GameLogEntryPhase; targetId: string; liveVotes: number; dieVotes: number; liveVoterIds?: string[]; dieVoterIds?: string[]; executed: boolean }
  | { type: "bonus_bite"; phase: GameLogEntryPhase }
  | { type: "guardian_protect"; phase: GameLogEntryPhase; actorId: string; targetId: string }
  | { type: "witch_heal"; phase: GameLogEntryPhase; actorId: string; targetId: string }
  | { type: "witch_poison"; phase: GameLogEntryPhase; actorId: string; targetId: string }
  | { type: "seer_check"; phase: GameLogEntryPhase; actorId: string; targetId: string; isWolf: boolean }
  | { type: "hunter_mark"; phase: GameLogEntryPhase; actorId: string; targetId: string }
  | { type: "hunter_shot"; phase: GameLogEntryPhase; actorId: string; targetId: string }
  | { type: "spirit_wolf_decision"; phase: GameLogEntryPhase; saved: boolean; timedOut?: boolean }
  | { type: "saved_by_guardian"; phase: GameLogEntryPhase; targetIds: string[] }
  | { type: "saved_by_witch"; phase: GameLogEntryPhase; targetIds: string[] }
  | { type: "eliminated"; phase: GameLogEntryPhase; targetIds: string[]; causesByTarget?: Record<string, EliminationCause[]> }
  | { type: "no_death"; phase: GameLogEntryPhase };

type GameLogNight = {
  night: number;
  at: number;
  entries: GameLogEntry[];
};

type RolesRevealPayload = {
  roomId: string;
  rolesByPlayerId: Record<string, string>;
};

const rooms: Record<string, Room> = {};
const activeRooms = new Set<string>(); // chứa toàn bộ mã phòng đã tạo

const WOLF_ROLES = new Set(["Sói", "Sói con", "Bán sói"]);
const SPIRIT_WOLF_ROLE = "Linh sói";
function isWolfRole(role: string | undefined) {
  return !!role && WOLF_ROLES.has(role);
}

function getParticipantPlayers(room: Room) {
  return room.players.filter((p) => p.id !== room.hostId);
}

function getParticipantIds(room: Room) {
  return getParticipantPlayers(room).map((p) => p.id);
}

function getParticipantCount(room: Room) {
  return getParticipantIds(room).length;
}

function emitRestartCinematicToPlayers(roomId: string, message: string) {
  const room = rooms[roomId];
  if (!room) return;

  for (const player of getParticipantPlayers(room)) {
    io.to(player.id).emit("rulesRestartCinematic", {
      roomId,
      message,
      fadeInMs: RULES_RESTART_FADE_IN_MS,
      holdMs: RULES_RESTART_HOLD_MS,
      fadeOutMs: RULES_RESTART_FADE_OUT_MS,
    });
  }
}

function returnHostToGameView(roomId: string, hostOverlayMessage?: string) {
  const room = rooms[roomId];
  if (!room) return;

  const hostIndex = room.players.findIndex((p) => p.id === room.hostId);
  if (hostIndex >= 0) {
    room.players[hostIndex] = { ...room.players[hostIndex]!, inGame: true };
  }

  io.to(roomId).emit("roomUpdated", toPublicRoom(room));
  io.to(room.hostId).emit("gameStarted", hostOverlayMessage
    ? {
        hostRestartCinematic: {
          roomId,
          message: hostOverlayMessage,
          fadeInMs: RULES_RESTART_FADE_IN_MS,
          holdMs: RULES_RESTART_HOLD_MS,
          fadeOutMs: RULES_RESTART_FADE_OUT_MS,
        },
      }
    : undefined);
}

function getAlivePlayerIds(room: Room) {
  const dead = new Set(room.deadPlayers || []);
  return getParticipantIds(room).filter(id => !dead.has(id));
}

function getSpiritWolfId(room: Room): string | null {
  // prefer cached id if still valid
  const cached = room.spiritWolfId;
  if (cached && room.players.find(p => p.id === cached) && room.playerRoles?.[cached] === SPIRIT_WOLF_ROLE) {
    return cached;
  }
  const found = room.players.find(p => room.playerRoles?.[p.id] === SPIRIT_WOLF_ROLE)?.id || null;
  room.spiritWolfId = found;
  return found;
}

function isSpiritWolfAlive(room: Room) {
  const id = getSpiritWolfId(room);
  if (!id) return false;
  return !(room.deadPlayers || []).includes(id);
}

function isWolfAlignedPlayer(room: Room, playerId: string) {
  const role = room.playerRoles?.[playerId];
  if (isWolfRole(role)) return true;
  // Linh sói only counts as wolf-aligned after the SAVE takes effect (next night).
  return room.spiritWolfWolfAligned === true && getSpiritWolfId(room) === playerId;
}

function checkAndEndGame(roomId: string, reason?: string) {
  const room = rooms[roomId];
  if (!room) return;
  if (room.gameOver) return;
  if (!room.playerRoles) return;

  const aliveIds = getAlivePlayerIds(room);

  // Villagers win if ALL wolves that can bite are dead.
  // (Per spec: Linh sói after saving has no bite, so does not prevent villagers from winning here.)
  const bitingWolvesAlive = aliveIds.filter(id => isWolfRole(room.playerRoles?.[id])).length;
  if (bitingWolvesAlive <= 0) {
    room.gameOver = true;
    room.winner = "villagers";
    io.to(roomId).emit("gameEnded", { winner: room.winner, reason: reason || "no_biting_wolves" });
    io.to(roomId).emit("gameLogUpdated", { roomId, nights: room.gameLog || [] });
    io.to(roomId).emit("rolesRevealUpdated", { roomId, rolesByPlayerId: room.playerRoles || {} } satisfies RolesRevealPayload);
    io.to(roomId).emit("roomUpdated", toPublicRoom(room));
    return;
  }

  // Wolves win if (biting wolves) >= (villager team).
  // Linh sói (after choosing save) is wolf-aligned but does NOT count toward the "wolves" number.
  const spiritWolfId = getSpiritWolfId(room);
  const villagersAlive = aliveIds.filter(id => {
    const role = room.playerRoles?.[id];
    if (isWolfRole(role)) return false;
    if (role === SPIRIT_WOLF_ROLE && room.spiritWolfChoseSave === true && spiritWolfId === id) return false;
    return true;
  }).length;

  if (bitingWolvesAlive >= villagersAlive) {
    room.gameOver = true;
    room.winner = "wolves";
    io.to(roomId).emit("gameEnded", { winner: room.winner, reason: reason || "wolves_ge_villagers" });
    io.to(roomId).emit("gameLogUpdated", { roomId, nights: room.gameLog || [] });
    io.to(roomId).emit("rolesRevealUpdated", { roomId, rolesByPlayerId: room.playerRoles || {} } satisfies RolesRevealPayload);
    io.to(roomId).emit("roomUpdated", toPublicRoom(room));
  }
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
  const rules = ensureRoomGameRules(room);
  const guardianTarget = room.protectedTonight;
  const dead = new Set(room.deadPlayers || []);

  const hideProtectedBite =
    rules.allNightActionsSimultaneous
      ? rules.witchHideProtectedBiteInSimultaneous
      : rules.witchHideProtectedBiteWhenSequential;

  const candidates = [room.killedTonight, room.killedTonightExtra]
    .filter(Boolean)
    .filter(pid => (hideProtectedBite ? pid !== guardianTarget : true)) as string[];

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

  const rules = ensureRoomGameRules(room);
  const pendingTargets = getWitchPendingDeaths(room);
  for (const wid of getWitches(room)) {
    ensureWitchState(room, wid);
    const healUsed = room.witchPotions?.[wid]?.healUsed === true;
    const canSeePending = !rules.witchSeeBiteOnlyIfHasHealPotion || !healUsed;
    const targetIds = canSeePending ? pendingTargets : [];
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

function emitSpiritWolfDecisionNeeded(roomId: string) {
  const room = rooms[roomId];
  if (!room) return;
  if (room.gameOver) return;
  const swid = getSpiritWolfId(room);
  if (!swid) return;
  if ((room.deadPlayers || []).includes(swid)) return;
  if (room.spiritWolfDecisionMade) return;
  const targetId = room.spiritWolfPendingPoisonedWolfId;
  if (!targetId) return;
  if ((room.deadPlayers || []).includes(targetId)) return;
  io.to(swid).emit("spiritWolfDecisionNeeded", { targetId });
}

function emitWitchPotions(roomId: string, witchId: string) {
  const room = rooms[roomId];
  if (!room) return;
  ensureWitchState(room, witchId);
  io.to(witchId).emit("witchPotionsUpdated", room.witchPotions![witchId]);
}

function toPublicRoom(room: Room) {
  ensureRoomGameRules(room);
  // IMPORTANT: tuyệt đối không emit NodeJS.Timeout (wolfTimer) vì nó gây lỗi serialize.
  // Trả về object thuần JSON.
  const {
    wolfTimer: _wolfTimer,
    seerUsedTonight: _seerUsedTonight,
    witchPotions: _witchPotions,
    witchHealTargetTonight: _witchHealTargetTonight,
    witchPoisonTargetTonight: _witchPoisonTargetTonight,
    hunterTargetTonight: _hunterTargetTonight,
    gameLog: _gameLog,
    nightCount: _nightCount,
    // Never leak roles / private night state to non-host clients.
    playerRoles: _playerRoles,
    wolves: _wolves,
    wolfVotes: _wolfVotes,
    wolfVotes2: _wolfVotes2,
    wolfLocked: _wolfLocked,
    wolfTimer: __wolfTimer,
    dayDiscussionTimer: _dayDiscussionTimer,
    dayTimer: _dayTimer,
    trialDefenseTimer: _trialDefenseTimer,
    trialVerdictTimer: _trialVerdictTimer,
    nightTurnTimer: _nightTurnTimer,
    wolfDeadline: _wolfDeadline,
    killedTonight: _killedTonight,
    killedTonightExtra: _killedTonightExtra,
    protectedTonight: _protectedTonight,
    lastProtected: _lastProtected,
    spiritWolfPendingPoisonedWolfId: _spiritWolfPendingPoisonedWolfId,
    ...rest
  } = room;
  return {
    ...rest,
    players: room.players.map(p => ({
      id: p.id,
      name: p.name,
      connected: p.connected !== false,
      inGame: p.inGame === true,
    })),
  };
}

function getPlayerName(room: Room, playerId: string | null | undefined) {
  if (!playerId) return "(không rõ)";
  return room.players.find(p => p.id === playerId)?.name || playerId;
}

function ensureNightLog(room: Room) {
  room.gameLog = room.gameLog || [];
  const night = room.nightCount || 0;
  if (night <= 0) return null;

  let entry = room.gameLog.find(n => n.night === night);
  if (!entry) {
    entry = { night, at: Date.now(), entries: [] };
    room.gameLog.push(entry);
  }
  return entry;
}

function appendLogEntry(room: Room, entry: GameLogEntry) {
  const nightLog = ensureNightLog(room);
  if (!nightLog) return;
  nightLog.entries.push(entry);

  // Realtime log updates for host: push immediately after each new entry.
  if (room.id && room.hostId) {
    emitGameLogToSocket(room.id, room.hostId);
  }
}

function emitGameLogToSocket(roomId: string, socketId: string) {
  const room = rooms[roomId];
  if (!room) return;
  io.to(socketId).emit("gameLogUpdated", { roomId, nights: room.gameLog || [] });
}

function emitRolesRevealToSocket(roomId: string, socketId: string) {
  const room = rooms[roomId];
  if (!room) return;
  io.to(socketId).emit("rolesRevealUpdated", {
    roomId,
    rolesByPlayerId: room.playerRoles || {},
  } satisfies RolesRevealPayload);
}

function buildWolfVoteBreakdown(room: Room, votes: Record<string, string | null>): GameLogEntry {
  const activeWolves = getActiveWolves(room);
  const map: Record<string, string[]> = {};
  for (const wid of activeWolves) {
    const t = votes[wid];
    if (!t) continue;
    map[t] = map[t] || [];
    map[t].push(wid);
  }
  const targets = Object.keys(map);
  // Keep stable ordering by player name for readability.
  targets.sort((a, b) => getPlayerName(room, a).localeCompare(getPlayerName(room, b)));
  const voteBreakdown = targets.map(targetId => ({
    targetId,
    voterIds: map[targetId] || [],
  }));

  return {
    type: "wolf_vote",
    phase: "night",
    voteBreakdown,
  };
}

function getActiveDayVoters(room: Room) {
  const dead = new Set(room.deadPlayers || []);
  const base = (room.dayVoters && room.dayVoters.length)
    ? room.dayVoters
    : getParticipantIds(room).filter(id => !dead.has(id));

  return base
    .filter(id => !dead.has(id))
    .filter(id => isPlayerConnected(room, id))
    .filter(id => !!room.players.find(p => p.id === id));
}

function getTrialVoters(room: Room) {
  const targetId = room.trialTargetId;
  return getActiveDayVoters(room).filter((id) => id !== targetId);
}

function clearTrialState(room: Room) {
  if (room.trialDefenseTimer) {
    clearTimeout(room.trialDefenseTimer);
    room.trialDefenseTimer = null;
  }
  if (room.trialVerdictTimer) {
    clearTimeout(room.trialVerdictTimer);
    room.trialVerdictTimer = null;
  }

  room.trialTargetId = null;
  room.trialStage = "none";
  room.trialDefenseDeadline = null;
  room.trialVerdictDeadline = null;
  room.trialInteractionCut = false;
  room.trialInteractionActiveIds = [];
  room.trialSelectedInteractorId = null;
  room.trialSelectedInteractorIds = [];
  room.trialInteractionSelectionLimit = 0;
  room.trialInteractionQueuedIds = [];
  room.trialVotes = {};
}

function clearNightTurnTimer(room: Room) {
  if (room.nightTurnTimer) {
    clearTimeout(room.nightTurnTimer);
    room.nightTurnTimer = null;
  }
}

function resetNightTurnState(room: Room) {
  clearNightTurnTimer(room);
  room.nightTurnIndex = -1;
  room.nightTurnRole = null;
  room.nightTurnDeadline = null;
  room.nightTurnPaused = false;
  room.nightTurnRemainingMs = null;
  delete room.nightTurnOrderSnapshot;
}

function canPerformNightRoleAction(room: Room, playerId: string, expectedRole: NightActionRole) {
  if (room.phase !== "night") return false;
  if ((room.deadPlayers || []).includes(playerId)) return false;

  const rules = ensureRoomGameRules(room);
  if (rules.allNightActionsSimultaneous) return true;
  return room.nightTurnRole === expectedRole;
}

function getSelectedNightActionRoles(room: Room): NightActionRole[] {
  const sourceRoles = room.playerRoles
    ? Object.values(room.playerRoles)
    : room.roles || [];

  const hasWolfRole = sourceRoles.some((role) => isWolfRole(role));
  const selected = new Set<NightActionRole>();

  if (hasWolfRole) selected.add("Sói");
  for (const role of ["Bảo vệ", "Phù thủy", "Thợ săn", "Tiên tri"] as NightActionRole[]) {
    if (sourceRoles.includes(role)) selected.add(role);
  }

  return Array.from(selected);
}

function shouldIncludeSpiritWolfTurn(room: Room) {
  if (room.spiritWolfDecisionMade) return false;
  if (!room.spiritWolfPendingPoisonedWolfId) return false;
  if (!isSpiritWolfAlive(room)) return false;
  if ((room.deadPlayers || []).includes(room.spiritWolfPendingPoisonedWolfId)) return false;
  return true;
}

function getBaseNightActionOrder(room: Room) {
  const rules = ensureRoomGameRules(room);
  const selectedRoles = new Set(getSelectedNightActionRoles(room));
  return rules.nightActionOrder.filter((role) => selectedRoles.has(role));
}

function getEffectiveNightActionOrder(room: Room) {
  const order = room.nightTurnOrderSnapshot ? [...room.nightTurnOrderSnapshot] : getBaseNightActionOrder(room);

  if (shouldIncludeSpiritWolfTurn(room)) {
    const spiritRole: NightActionRole = "Linh sói";
    if (!order.includes(spiritRole)) {
      const witchIndex = order.indexOf("Phù thủy");
      if (witchIndex >= 0) {
        order.splice(witchIndex + 1, 0, spiritRole);
      } else {
        order.push(spiritRole);
      }
    }
  }

  return order;
}

function insertSpiritWolfIntoNightOrder(room: Room) {
  const spiritRole: NightActionRole = "Linh sói";
  if (!room.nightTurnOrderSnapshot) {
    room.nightTurnOrderSnapshot = getBaseNightActionOrder(room);
  }
  if (room.nightTurnOrderSnapshot.includes(spiritRole)) return;

  const insertAt = Math.min((room.nightTurnIndex ?? -1) + 1, room.nightTurnOrderSnapshot.length);
  room.nightTurnOrderSnapshot.splice(insertAt, 0, spiritRole);
}

function finishSpiritWolfTurn(roomId: string, timedOut: boolean) {
  const room = rooms[roomId];
  if (!room) return;
  if (room.phase !== "night") return;
  if (room.nightTurnRole !== SPIRIT_WOLF_ROLE) return;

  const pendingTargetId = room.spiritWolfPendingPoisonedWolfId;
  if (timedOut && !room.spiritWolfDecisionMade) {
    room.spiritWolfDecisionMade = true;
    room.spiritWolfChoseSave = false;
    if (pendingTargetId) {
      appendLogEntry(room, { type: "spirit_wolf_decision", phase: "night", saved: false, timedOut: true });
    }
    const swid = getSpiritWolfId(room);
    if (swid) {
      io.to(swid).emit("spiritWolfDecisionRecorded", { saved: false });
    }
  }

  room.spiritWolfPendingPoisonedWolfId = null;

  io.to(roomId).emit("roomUpdated", toPublicRoom(room));
  checkAndEndGame(roomId, timedOut ? "spirit_wolf_timeout" : "spirit_wolf_decision");

  startNightTurnByIndex(roomId, (room.nightTurnIndex ?? 0) + 1);
}

function clearGameTimers(room: Room) {
  clearNightTurnTimer(room);
  if (room.wolfTimer) {
    clearTimeout(room.wolfTimer);
    room.wolfTimer = null;
  }
  if (room.dayDiscussionTimer) {
    clearTimeout(room.dayDiscussionTimer);
    room.dayDiscussionTimer = null;
  }
  if (room.dayTimer) {
    clearTimeout(room.dayTimer);
    room.dayTimer = null;
  }
  if (room.trialDefenseTimer) {
    clearTimeout(room.trialDefenseTimer);
    room.trialDefenseTimer = null;
  }
  if (room.trialVerdictTimer) {
    clearTimeout(room.trialVerdictTimer);
    room.trialVerdictTimer = null;
  }
}

function resetRoomFromGameToLobby(room: Room) {
  clearGameTimers(room);
  clearTrialState(room);
  resetNightTurnState(room);

  delete room.phase;
  room.gameOver = true;
  room.winner = undefined;

  room.wolves = [];
  room.wolfVotes = {};
  room.wolfVotes2 = {};
  room.wolfLocked = {};
  room.wolfDeadline = null;
  room.killedTonight = null;
  room.killedTonightExtra = null;
  room.wolfBonusBiteThisNight = false;
  room.wolfExtraBiteNextNight = false;

  room.dayVoters = [];
  room.dayVotes = {};
  room.dayLocked = {};
  room.dayDiscussionDeadline = null;
  room.dayDeadline = null;

  room.deadPlayers = [];
  room.sharedHeartsVisible = false;
  room.playerHearts = {};
  room.protectedTonight = null;
  room.lastProtected = null;
  room.seerUsedTonight = {};
  room.hunterTargetTonight = {};
  room.witchHealTargetTonight = {};
  room.witchPoisonTargetTonight = {};
  room.spiritWolfPendingPoisonedWolfId = null;

  room.players = room.players.map((p) => ({ ...p, inGame: false }));
}

function startFreshRoundWithCurrentRoles(roomId: string) {
  const room = rooms[roomId];
  if (!room) return false;

  const rules = room.pendingGameRules ? buildRoomGameRules(room.pendingGameRules) : ensureRoomGameRules(room);
  room.gameRules = rules;
  delete room.pendingGameRules;

  const roles = room.roles;
  const participantCount = getParticipantCount(room);
  if (!roles || roles.length < participantCount) {
    return false;
  }

  clearGameTimers(room);

  // Remove everyone from private role rooms to prevent information leakage.
  for (const p of room.players) {
    const s = io.sockets.sockets.get(p.id);
    if (!s) continue;
    s.leave(`wolves_${roomId}`);
    s.leave(`witches_${roomId}`);
  }

  // Re-shuffle and assign roles.
  const shuffled = roles.slice().sort(() => Math.random() - 0.5);
  room.playerRoles = {};
  const participants = getParticipantPlayers(room);
  participants.forEach((player, index) => {
    const role: string = shuffled[index] || "";
    room.playerRoles![player.id] = role;
    io.to(player.id).emit("yourRole", role);
  });
  room.players = room.players.map((p) => ({ ...p, inGame: p.id !== room.hostId }));

  // Rebuild wolves room membership.
  room.wolves = participants.filter(p => isWolfRole(room.playerRoles?.[p.id])).map(p => p.id);
  room.wolves.forEach(wolfId => {
    const wolfSocket = io.sockets.sockets.get(wolfId);
    if (wolfSocket) wolfSocket.join(`wolves_${roomId}`);
  });

  // Rebuild witches room membership and reset potion state.
  room.witchPotions = {};
  room.witchHealTargetTonight = {};
  room.witchPoisonTargetTonight = {};
  for (const wid of getWitches(room)) {
    const witchSocket = io.sockets.sockets.get(wid);
    if (witchSocket) witchSocket.join(`witches_${roomId}`);
    ensureWitchState(room, wid);
    emitWitchPotions(roomId, wid);
  }

  // Reset per-game/per-night state.
  room.gameOver = false;
  room.winner = undefined;
  room.phase = "dusk";
  room.nightCount = 0;
  room.gameLog = [];
  room.deadPlayers = [];
  room.sharedHeartsVisible = false;
  room.playerHearts = {};
  room.protectedTonight = null;
  room.lastProtected = null;
  room.seerUsedTonight = {};
  room.hunterTargetTonight = {};
  room.killedTonight = null;
  room.killedTonightExtra = null;
  room.wolfVotes = {};
  room.wolfVotes2 = {};
  room.wolfLocked = {};
  room.wolfDeadline = null;
  room.wolfExtraBiteNextNight = false;
  room.wolfBonusBiteThisNight = false;
  resetNightTurnState(room);
  room.dayVoters = [];
  room.dayVotes = {};
  room.dayLocked = {};
  room.dayDiscussionDeadline = null;
  room.dayDeadline = null;
  room.hidePlayerRoleText = false;
  clearTrialState(room);

  if (rules.twoHeartsFirstTwoNights) {
    initTwoHeartsForParticipants(room);
  }

  // Reset Linh sói state.
  room.spiritWolfId = getSpiritWolfId(room);
  room.spiritWolfDecisionMade = false;
  room.spiritWolfChoseSave = false;
  room.spiritWolfWolfAligned = false;
  room.spiritWolfWolfAlignedPending = false;
  room.spiritWolfPendingPoisonedWolfId = null;

  io.to(roomId).emit("phaseChanged", "dusk");
  io.to(roomId).emit("roomUpdated", toPublicRoom(room));
  io.to(roomId).emit("gameStarted");
  emitRolesRevealToSocket(roomId, room.hostId);

  checkAndEndGame(roomId, "after_restart_game");
  return true;
}

function buildTrialInteractionUpdatedPayload(room: Room) {
  const selectedIds = room.trialSelectedInteractorIds || [];
  const selectionLimit = Math.max(0, room.trialInteractionSelectionLimit || 0);
  return {
    activeIds: room.trialInteractionActiveIds || [],
    selectedId: room.trialSelectedInteractorId || null,
    selectedIds,
    selectionLimit,
    selectionCount: selectedIds.length,
    interactionCut: room.trialInteractionCut === true,
  };
}

function buildDayVoteBreakdown(room: Room, votes: Record<string, string | null>): GameLogEntry {
  const activeVoters = getActiveDayVoters(room);
  const map: Record<string, string[]> = {};
  for (const voterId of activeVoters) {
    const t = votes[voterId];
    if (!t) continue;
    map[t] = map[t] || [];
    map[t].push(voterId);
  }
  const targets = Object.keys(map);
  targets.sort((a, b) => getPlayerName(room, a).localeCompare(getPlayerName(room, b)));
  const voteBreakdown = targets.map(targetId => ({
    targetId,
    voterIds: map[targetId] || [],
  }));

  return {
    type: "day_vote",
    phase: "day",
    voteBreakdown,
  };
}

function startTrialVerdictVoting(roomId: string) {
  const room = rooms[roomId];
  if (!room) return;
  if (room.gameOver) return;
  if (room.phase !== "day") return;
  if (!room.trialTargetId) return;

  if (room.trialDefenseTimer) {
    clearTimeout(room.trialDefenseTimer);
    room.trialDefenseTimer = null;
  }
  if (room.trialVerdictTimer) {
    clearTimeout(room.trialVerdictTimer);
    room.trialVerdictTimer = null;
  }

  room.trialStage = "verdict";
  room.trialInteractionCut = true;
  room.trialInteractionActiveIds = [];
  room.trialSelectedInteractorId = null;
  room.trialSelectedInteractorIds = [];
  room.trialInteractionQueuedIds = [];
  room.trialDefenseDeadline = null;
  room.trialVerdictDeadline = Date.now() + 20_000;

  const voters = getTrialVoters(room);
  room.trialVotes = room.trialVotes || {};
  voters.forEach((vid) => {
    if (typeof room.trialVotes?.[vid] === "undefined") {
      room.trialVotes![vid] = null;
    }
  });

  io.to(roomId).emit("trialVerdictStarted", {
    targetId: room.trialTargetId,
    voters,
    deadline: room.trialVerdictDeadline,
  });
  io.to(roomId).emit("trialVotesUpdated", room.trialVotes);
  io.to(roomId).emit("roomUpdated", toPublicRoom(room));

  room.trialVerdictTimer = setTimeout(() => {
    finishTrialVerdict(roomId);
  }, 20_000);
}

function finishTrialVerdict(roomId: string) {
  const room = rooms[roomId];
  if (!room) return;
  if (room.gameOver) return;
  if (room.phase !== "day") return;

  const targetId = room.trialTargetId;
  if (!targetId) return;

  if (room.trialVerdictTimer) {
    clearTimeout(room.trialVerdictTimer);
    room.trialVerdictTimer = null;
  }
  if (room.trialDefenseTimer) {
    clearTimeout(room.trialDefenseTimer);
    room.trialDefenseTimer = null;
  }

  const voters = getTrialVoters(room);
  const votes = room.trialVotes || {};

  let liveVotes = 0;
  let dieVotes = 0;
  const liveVoterIds: string[] = [];
  const dieVoterIds: string[] = [];
  for (const vid of voters) {
    const v = votes[vid];
    if (v === "live") {
      liveVotes += 1;
      liveVoterIds.push(vid);
    } else if (v === "die") {
      dieVotes += 1;
      dieVoterIds.push(vid);
    }
  }

  const executed = dieVotes > liveVotes;

  appendLogEntry(room, {
    type: "trial_verdict",
    phase: "day",
    targetId,
    liveVotes,
    dieVotes,
    liveVoterIds,
    dieVoterIds,
    executed,
  });

  if (executed && !((room.deadPlayers || []).includes(targetId))) {
    room.deadPlayers = room.deadPlayers || [];
    room.deadPlayers.push(targetId);
    io.to(roomId).emit("playerKilled", targetId);

    appendLogEntry(room, {
      type: "eliminated",
      phase: "day",
      targetIds: [targetId],
      causesByTarget: {
        [targetId]: [{ type: "trial_verdict", voterIds: dieVoterIds }],
      },
    });
  }

  io.to(roomId).emit("trialVerdictFinished", {
    targetId,
    executed,
    liveVotes,
    dieVotes,
  });

  clearTrialState(room);
  io.to(roomId).emit("roomUpdated", toPublicRoom(room));

  checkAndEndGame(roomId, "after_trial_verdict");

  if (room.hostId) {
    emitGameLogToSocket(roomId, room.hostId);
  }
}

function startTrialDefense(roomId: string, targetId: string) {
  const room = rooms[roomId];
  if (!room) return;
  if (room.gameOver) return;
  if (room.phase !== "day") return;
  const rules = ensureRoomGameRules(room);

  clearTrialState(room);

  room.trialTargetId = targetId;
  room.trialStage = "defense";
  room.trialDefenseDeadline = Date.now() + 120_000;
  room.trialInteractionCut = false;
  room.trialInteractionActiveIds = [];
  room.trialSelectedInteractorId = null;
  room.trialSelectedInteractorIds = [];
  room.trialInteractionSelectionLimit = rules.trialInteractionSelectionLimit;
  room.trialInteractionQueuedIds = [];
  room.trialVotes = {};

  appendLogEntry(room, { type: "trial_started", phase: "day", targetId });

  io.to(roomId).emit("trialPhaseStarted", {
    targetId,
    stage: "defense",
    defenseDeadline: room.trialDefenseDeadline,
    selectionLimit: room.trialInteractionSelectionLimit,
  });
  io.to(roomId).emit("trialInteractionUpdated", buildTrialInteractionUpdatedPayload(room));
  io.to(roomId).emit("roomUpdated", toPublicRoom(room));

  room.trialDefenseTimer = setTimeout(() => {
    startTrialVerdictVoting(roomId);
  }, 120_000);
}

function startDayVoting(roomId: string) {
  const room = rooms[roomId];
  if (!room) return;
  if (room.gameOver) return;

  if (room.dayDiscussionTimer) {
    clearTimeout(room.dayDiscussionTimer);
    room.dayDiscussionTimer = null;
  }
  room.dayDiscussionDeadline = null;
  io.to(roomId).emit("dayDiscussionStarted", { deadline: null });

  if (room.dayTimer) {
    clearTimeout(room.dayTimer);
    room.dayTimer = null;
  }

  clearTrialState(room);

  const voters = getAlivePlayerIds(room);
  room.dayVoters = voters;
  room.dayVotes = {};
  room.dayLocked = {};
  voters.forEach((id) => {
    room.dayVotes![id] = null;
    room.dayLocked![id] = false;
  });

  room.dayDeadline = Date.now() + 45_000; // 45 giây biểu quyết ban ngày

  io.to(roomId).emit("dayPhaseStarted", {
    voters: getActiveDayVoters(room),
    deadline: room.dayDeadline,
  });
  io.to(roomId).emit("dayVotesUpdated", room.dayVotes);
  io.to(roomId).emit("dayLockedUpdated", room.dayLocked);
  io.to(roomId).emit("roomUpdated", toPublicRoom(room));

  room.dayTimer = setTimeout(() => {
    finishDayVoting(roomId);
  }, 45_000);
}

function startDayDiscussion(roomId: string) {
  const room = rooms[roomId];
  if (!room) return;
  if (room.phase !== "day") return;
  if (room.gameOver) return;

  if (room.dayTimer) {
    clearTimeout(room.dayTimer);
    room.dayTimer = null;
  }
  if (room.dayDiscussionTimer) {
    clearTimeout(room.dayDiscussionTimer);
    room.dayDiscussionTimer = null;
  }

  clearTrialState(room);

  room.dayVoters = [];
  room.dayVotes = {};
  room.dayLocked = {};
  room.dayDeadline = null;
  room.dayDiscussionDeadline = Date.now() + 240_000; // 4 phút thảo luận

  io.to(roomId).emit("dayDiscussionStarted", {
    deadline: room.dayDiscussionDeadline,
  });
  io.to(roomId).emit("dayVotesUpdated", room.dayVotes);
  io.to(roomId).emit("dayLockedUpdated", room.dayLocked);
  io.to(roomId).emit("roomUpdated", toPublicRoom(room));

  room.dayDiscussionTimer = setTimeout(() => {
    startDayVoting(roomId);
  }, 240_000);
}

function finishDayVoting(roomId: string) {
  const room = rooms[roomId];
  if (!room) return;
  if (room.phase !== "day") return;
  if (room.gameOver) return;
  if (room.trialStage && room.trialStage !== "none") return;
  if (!room.dayDeadline) return;

  if (room.dayTimer) {
    clearTimeout(room.dayTimer);
    room.dayTimer = null;
  }

  const votes = room.dayVotes || {};
  const activeVoters = getActiveDayVoters(room);

  appendLogEntry(room, buildDayVoteBreakdown(room, votes));

  const counts: Record<string, number> = {};
  for (const voterId of activeVoters) {
    const target = votes[voterId];
    if (!target) continue;
    counts[target] = (counts[target] || 0) + 1;
  }

  const entries = Object.entries(counts);
  let executedId: string | null = null;
  let tie = false;
  if (entries.length > 0) {
    entries.sort((a, b) => b[1] - a[1]);
    if (entries.length > 1 && entries[0]![1] === entries[1]![1]) {
      tie = true;
    } else {
      executedId = entries[0]![0];
    }
  }

  appendLogEntry(room, { type: "day_result", phase: "day", targetId: executedId, tie });

  for (const voterId of activeVoters) {
    room.dayLocked = room.dayLocked || {};
    room.dayLocked[voterId] = true;
  }
  room.dayDiscussionDeadline = null;
  room.dayDeadline = null;

  io.to(roomId).emit("dayVotesUpdated", room.dayVotes || {});
  io.to(roomId).emit("dayLockedUpdated", room.dayLocked || {});
  io.to(roomId).emit("dayVoteFinished", { targetId: executedId, tie, startedTrial: !!executedId });
  io.to(roomId).emit("roomUpdated", toPublicRoom(room));

  if (executedId) {
    startTrialDefense(roomId, executedId);
  } else {
    checkAndEndGame(roomId, "after_day_vote_no_nominee");
  }

  // Push log updates to host immediately (host can view anytime).
  if (room.hostId) {
    emitGameLogToSocket(roomId, room.hostId);
  }
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


function startWolfPhase(roomId: string, opts?: { durationMs?: number; initializeVotes?: boolean }) {
  const room = rooms[roomId];
  if (!room) return;

  const initializeVotes = opts?.initializeVotes !== false;
  const wolves = room.players.filter(p => isWolfRole(room.playerRoles?.[p.id]));

  if (initializeVotes) {
    room.wolfVotes = {};
    room.wolfVotes2 = {};
    room.wolfLocked = {};
    wolves.forEach(w => {
      room.wolfVotes![w.id] = null;
      room.wolfVotes2![w.id] = null;
      room.wolfLocked![w.id] = false;
    });
  } else {
    room.wolfVotes = room.wolfVotes || {};
    room.wolfVotes2 = room.wolfVotes2 || {};
    room.wolfLocked = room.wolfLocked || {};
  }

  const durationMs = Math.max(0, Math.floor(opts?.durationMs ?? WOLF_TURN_DURATION_MS));

  // Time chờ cho sói cắn
  room.wolfDeadline = Date.now() + durationMs;
  // broadcast cho cả phòng (client cần biết deadline để đếm ngược)
  io.to(`wolves_${roomId}`).emit("wolfPhaseStarted", {
    wolves: wolves.map(w => w.id),
    activeWolves: getActiveWolves(room),
    deadline: room.wolfDeadline,
    maxTargets: room.wolfBonusBiteThisNight ? 2 : 1,
    resetVotes: initializeVotes,
  });

  // Ensure clients have a defined state for bonus target voting.
  io.to(`wolves_${roomId}`).emit("wolfVotes2Updated", room.wolfVotes2);

  // huỷ timer cũ nếu có
  if (room.wolfTimer) {
    clearTimeout(room.wolfTimer);
    room.wolfTimer = null;
  }

  // khi hết thời gian → xử lý vote
  if (durationMs <= 0) {
    finishWolfVoting(roomId);
    return;
  }

  room.wolfTimer = setTimeout(() => {
    finishWolfVoting(roomId);
  }, durationMs);
}

function getRoleTurnDurationMs(room: Room, role: NightActionRole) {
  if (role === "Sói") return WOLF_TURN_DURATION_MS;
  const rules = ensureRoomGameRules(room);
  return clampNonWolfNightActionDurationSec(rules.nonWolfNightActionDurationSec) * 1000;
}

function startNightTurnByIndex(roomId: string, index: number, opts?: { durationMs?: number; initializeWolfVotes?: boolean }) {
  const room = rooms[roomId];
  if (!room) return;
  if (room.phase !== "night") return;

  const rules = ensureRoomGameRules(room);
  if (rules.allNightActionsSimultaneous) return;

  clearNightTurnTimer(room);

  const order = getEffectiveNightActionOrder(room);
  if (index < 0 || index >= order.length) {
    room.nightTurnIndex = order.length;
    room.nightTurnRole = null;
    room.nightTurnDeadline = null;
    room.nightTurnPaused = false;
    room.nightTurnRemainingMs = null;
    io.to(roomId).emit("roomUpdated", toPublicRoom(room));
    return;
  }

  const role = order[index]!;
  const durationMs = Math.max(0, Math.floor(opts?.durationMs ?? getRoleTurnDurationMs(room, role)));

  room.nightTurnIndex = index;
  room.nightTurnRole = role;
  room.nightTurnPaused = false;
  room.nightTurnRemainingMs = durationMs;
  room.nightTurnDeadline = Date.now() + durationMs;

  if (role === "Sói") {
    startWolfPhase(roomId, {
      durationMs,
      initializeVotes: opts?.initializeWolfVotes !== false,
    });
  } else if (role === "Linh sói") {
    emitSpiritWolfDecisionNeeded(roomId);
    if (durationMs <= 0) {
      setTimeout(() => finishSpiritWolfTurn(roomId, true), 0);
    } else {
      room.nightTurnTimer = setTimeout(() => {
        finishSpiritWolfTurn(roomId, true);
      }, durationMs);
    }
  } else {
    if (durationMs <= 0) {
      setTimeout(() => {
        const latest = rooms[roomId];
        if (!latest) return;
        if (latest.phase !== "night") return;
        if (latest.nightTurnRole !== role) return;
        startNightTurnByIndex(roomId, index + 1);
      }, 0);
    } else {
      room.nightTurnTimer = setTimeout(() => {
        startNightTurnByIndex(roomId, index + 1);
      }, durationMs);
    }
  }

  io.to(roomId).emit("roomUpdated", toPublicRoom(room));
}

function startNightTurnFlow(roomId: string) {
  const room = rooms[roomId];
  if (!room) return;
  if (room.phase !== "night") return;

  const rules = ensureRoomGameRules(room);
  resetNightTurnState(room);
  room.nightTurnOrderSnapshot = getBaseNightActionOrder(room);

  if (rules.allNightActionsSimultaneous) {
    startWolfPhase(roomId, { initializeVotes: true, durationMs: WOLF_TURN_DURATION_MS });
    io.to(roomId).emit("roomUpdated", toPublicRoom(room));
    return;
  }

  const order = getEffectiveNightActionOrder(room);
  if (!order.length) {
    io.to(roomId).emit("roomUpdated", toPublicRoom(room));
    return;
  }

  startNightTurnByIndex(roomId, 0, { initializeWolfVotes: true });
}

function getWolfRoleCount(roles: string[] | undefined) {
  return (roles || []).filter(role => isWolfRole(role)).length;
}

function getMaxAllowedWolfCount(playerCount: number) {
  return Math.floor((playerCount - 1) / 2);
}

function rebalanceWolfRoles(room: Room, maxWolfCount: number) {
  const roles = [...(room.roles || [])];
  const participantCount = getParticipantCount(room);
  const currentWolfCount = getWolfRoleCount(roles);
  let overflow = Math.max(0, currentWolfCount - maxWolfCount);

  if (overflow <= 0) {
    room.roles = roles;
    return;
  }

  // If role list is longer than participant count, drop extra wolves first.
  const removableSlots = Math.max(0, roles.length - participantCount);
  if (removableSlots > 0) {
    for (let i = roles.length - 1; i >= 0 && overflow > 0 && room.roles && removableSlots > 0; i--) {
      if (!isWolfRole(roles[i])) continue;
      roles.splice(i, 1);
      overflow -= 1;
      if (roles.length <= participantCount) break;
    }
  }

  // If wolves are still over cap while list length cannot shrink further, convert extras to villagers.
  if (overflow > 0) {
    let keptWolfCount = 0;
    for (let i = 0; i < roles.length; i++) {
      const role = roles[i];
      if (!isWolfRole(role)) continue;

      keptWolfCount += 1;
      if (keptWolfCount > maxWolfCount) {
        roles[i] = "Dân";
        overflow -= 1;
        if (overflow <= 0) break;
      }
    }
  }

  room.roles = roles;
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

  // Log detailed wolf voting breakdown.
  appendLogEntry(room, buildWolfVoteBreakdown(room, votes));
  if (room.wolfBonusBiteThisNight) {
    appendLogEntry(room, buildWolfVoteBreakdown(room, votes2));
  }

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

  // Log resolved wolf victims for this night.
  const wolfTargets = [room.killedTonight, room.killedTonightExtra].filter(Boolean) as string[];
  const selectedByByTarget: Record<string, string[]> = {};
  for (const targetId of wolfTargets) {
    const selectedBy = activeWolves.filter((wid) => votes[wid] === targetId || votes2[wid] === targetId);
    selectedByByTarget[targetId] = selectedBy;
  }
  appendLogEntry(room, { type: "wolf_result", phase: "night", targetIds: wolfTargets, selectedByByTarget });

  // Phù thủy chỉ thấy "người sắp chết" nếu không bị bảo vệ cứu.
  emitWitchPendingDeath(roomId);

  const rules = ensureRoomGameRules(room);
  if (!rules.allNightActionsSimultaneous && room.phase === "night" && room.nightTurnRole === "Sói") {
    startNightTurnByIndex(roomId, (room.nightTurnIndex ?? 0) + 1);
  }
  // Lưu trạng thái: thực tế xử lý "chết" sẽ diễn ra khi host chuyển sang buổi sáng
}



// Khi client kết nối
io.on("connection", (socket) => {
  socket.on("createRoom", ({ name, gameRules }) => {
    const roomId = generateRoomId(activeRooms);

    rooms[roomId] = {
      id: roomId,
      players: [{ id: socket.id, name, connected: true, inGame: false }],
      hostId: socket.id,
      hidePlayerRoleText: false,
      layoutHeightPx: BASE_FRAME_HEIGHT_PX,
      positions: ensureNonOverlappingPositions([], undefined, { ...POSITION_LAYOUT, heightPx: BASE_FRAME_HEIGHT_PX }),   // host không tham gia nên không có vị trí vòng tròn
      positionEditors: [], // ai được phép sắp xếp
      autoArrangeUsed: false,
      compactCircles: false,
      gameRules: buildRoomGameRules(gameRules),
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

    ensureRoomGameRules(room);

    room.players.push({ id: socket.id, name, connected: true, inGame: false });

    // Expand/shrink layout height as needed, without visually moving existing players.
    const nextHeightPx = desiredLayoutHeightPx(getParticipantCount(room));
    rescaleRoomPositionsForHeight(room, nextHeightPx);

    const opts = layoutOptsForRoom(room);
    room.positions = ensureNonOverlappingPositions(getParticipantIds(room), room.positions, opts);
    socket.join(roomId);

    // 1) gửi riêng cho người vừa join
    socket.emit("roomJoined", toPublicRoom(room));

    // 2) gửi cho cả phòng để cập nhật
    io.to(roomId).emit("roomUpdated", toPublicRoom(room));
  });

  socket.on("getRoom", (roomId) => {
    const room = rooms[roomId];
    if (room) {
      ensureRoomGameRules(room);
      socket.emit("roomUpdated", toPublicRoom(room));
      io.to(roomId).emit("positionsUpdated", room.positions);
      io.to(roomId).emit("positionEditorsUpdated", room.positionEditors || []);

      if (room.phase === "day" && room.dayDeadline) {
        io.to(socket.id).emit("dayPhaseStarted", {
          voters: getActiveDayVoters(room),
          deadline: room.dayDeadline,
        });
        io.to(socket.id).emit("dayVotesUpdated", room.dayVotes || {});
        io.to(socket.id).emit("dayLockedUpdated", room.dayLocked || {});
      }

      if (room.phase === "day" && !room.dayDeadline && room.dayDiscussionDeadline) {
        io.to(socket.id).emit("dayDiscussionStarted", {
          deadline: room.dayDiscussionDeadline,
        });
      }

      if (room.phase === "day" && room.trialTargetId && room.trialStage === "defense") {
        io.to(socket.id).emit("trialPhaseStarted", {
          targetId: room.trialTargetId,
          stage: "defense",
          defenseDeadline: room.trialDefenseDeadline || null,
          selectionLimit: room.trialInteractionSelectionLimit,
        });
        io.to(socket.id).emit("trialInteractionUpdated", {
          ...buildTrialInteractionUpdatedPayload(room),
        });
      }

      if (room.phase === "day" && room.trialTargetId && room.trialStage === "verdict") {
        io.to(socket.id).emit("trialVerdictStarted", {
          targetId: room.trialTargetId,
          voters: getTrialVoters(room),
          deadline: room.trialVerdictDeadline || null,
        });
        io.to(socket.id).emit("trialVotesUpdated", room.trialVotes || {});
      }

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

      // Re-send Spirit Wolf pending decision on refresh/reconnect.
      if (room.playerRoles?.[socket.id] === SPIRIT_WOLF_ROLE) {
        if (
          room.nightTurnRole === SPIRIT_WOLF_ROLE &&
          !room.spiritWolfDecisionMade &&
          room.spiritWolfPendingPoisonedWolfId
        ) {
          emitSpiritWolfDecisionNeeded(roomId);
        }
      }

    } else {
      socket.emit("errorMessage", "Phòng không tồn tại :(");
    }
  });

  socket.on("setPlayerViewState", ({ roomId, view }: { roomId: string; view: "room" | "game" }) => {
    const room = rooms[roomId];
    if (!room) return;
    const idx = room.players.findIndex((p) => p.id === socket.id);
    if (idx < 0) return;

    const nextInGame = view === "game";
    const current = room.players[idx];
    if (!current || current.inGame === nextInGame) return;

    room.players[idx] = { ...current, inGame: nextInGame };
    io.to(roomId).emit("roomUpdated", toPublicRoom(room));
  });

  socket.on("updateRoomGameRules", ({ roomId, rules, applyMode }: { roomId: string; rules: Partial<RoomGameRules>; applyMode?: "next-round" | "restart-now" }) => {
    const room = rooms[roomId];
    if (!room) return;
    if (socket.id !== room.hostId) return;

    const mergedRules = buildRoomGameRules({ ...(ensureRoomGameRules(room) || {}), ...(rules || {}) });
    const gameInProgress = !!room.phase && !room.gameOver;

    if (!gameInProgress) {
      room.gameRules = mergedRules;
      delete room.pendingGameRules;
      io.to(roomId).emit("roomUpdated", toPublicRoom(room));
      return;
    }

    if (applyMode === "next-round") {
      room.pendingGameRules = mergedRules;
      io.to(roomId).emit("roomUpdated", toPublicRoom(room));
      return;
    }

    if (applyMode === "restart-now") {
      room.gameRules = mergedRules;
      delete room.pendingGameRules;
      io.to(roomId).emit("roomUpdated", toPublicRoom(room));
      returnHostToGameView(roomId, "Đang khởi tạo ván chơi mới");
      emitRestartCinematicToPlayers(roomId, "Chủ phòng đã thiết lập lại luật chơi và khởi động lại ván chơi mới");
      setTimeout(() => {
        startFreshRoundWithCurrentRoles(roomId);
      }, RULES_RESTART_RESTART_AT_MS);
      return;
    }

    socket.emit("errorMessage", "Ván chơi đang diễn ra. Hãy chọn áp dụng luật cho ván sau hoặc khởi động lại ván mới.");
  });

  socket.on("returnToCurrentGame", ({ roomId }: { roomId: string }) => {
    const room = rooms[roomId];
    if (!room) return;
    if (socket.id !== room.hostId) return;
    if (!room.phase || room.gameOver) return;

    const idx = room.players.findIndex((p) => p.id === socket.id);
    if (idx >= 0) {
      room.players[idx] = { ...room.players[idx]!, inGame: true };
      io.to(roomId).emit("roomUpdated", toPublicRoom(room));
    }
    io.to(socket.id).emit("gameStarted");
  });

  socket.on("requestReturnToRoom", ({ roomId }: { roomId: string }) => {
    const room = rooms[roomId];
    if (!room) {
      io.to(socket.id).emit("returnToRoomResult", { ok: false, reason: "room_closed" });
      return;
    }

    const idx = room.players.findIndex((p) => p.id === socket.id);
    if (idx < 0) {
      io.to(socket.id).emit("returnToRoomResult", { ok: false, reason: "kicked" });
      return;
    }

    const current = room.players[idx];
    if (current) {
      room.players[idx] = { ...current, inGame: false };
      io.to(roomId).emit("roomUpdated", toPublicRoom(room));
    }

    io.to(socket.id).emit("returnToRoomResult", { ok: true, roomId });
  });

  socket.on("hostReturnToRoom", ({ roomId }: { roomId: string }) => {
    const room = rooms[roomId];
    if (!room) return;
    if (socket.id !== room.hostId) return;
    if (!room.phase || room.gameOver) return;

    resetRoomFromGameToLobby(room);
    io.to(roomId).emit("roomUpdated", toPublicRoom(room));
    io.to(roomId).emit("forceReturnToRoom", { roomId, reason: "host_returned_to_room" });
  });

  socket.on("rolesSelected", ({
    roomId,
    roles,
    applyMode,
    forceAdjustWolfCount,
  }: {
    roomId: string;
    roles: string[];
    applyMode?: "next-round" | "restart-now";
    forceAdjustWolfCount?: boolean;
  }) => {
    const room = rooms[roomId];
    if (!room) return;
    if (socket.id !== room.hostId) return;

    const gameInProgress = !!room.phase && !room.gameOver;

    // lưu danh sách role vào phòng
    room.roles = roles; 

    // 🔒 bộ role đã khóa
    room.rolesLocked = true;  

    // lưu lại danh sách người chơi lúc khóa
    room.lockedPlayerIds = getParticipantIds(room); 

    if (gameInProgress && applyMode === "restart-now") {
      const participantCount = getParticipantCount(room);
      const wolfCount = getWolfRoleCount(room.roles);
      const maxAllowedWolfCount = getMaxAllowedWolfCount(participantCount);

      if (wolfCount > maxAllowedWolfCount) {
        if (!forceAdjustWolfCount) {
          io.to(room.hostId).emit("wolfRoleMismatch", {
            currentWolfCount: wolfCount,
            maxAllowedWolfCount,
            playerCount: participantCount,
          });
          return;
        }

        rebalanceWolfRoles(room, maxAllowedWolfCount);
      }

      io.to(roomId).emit("roomUpdated", toPublicRoom(room));
      returnHostToGameView(roomId, "Đang khởi tạo ván chơi mới");
      emitRestartCinematicToPlayers(roomId, "Chủ phòng đã cập nhật danh sách vai trò và khởi động lại ván chơi mới");
      setTimeout(() => {
        startFreshRoundWithCurrentRoles(roomId);
      }, RULES_RESTART_RESTART_AT_MS);
      return;
    }

    if (gameInProgress && applyMode === "next-round") {
      io.to(roomId).emit("roomUpdated", toPublicRoom(room));
      io.to(roomId).emit("rolesReady", roles);
      return;
    }

    io.to(roomId).emit("rolesReady", roles);
    io.to(roomId).emit("roomUpdated", toPublicRoom(room));
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
      const stillMissing = getParticipantCount(room) - room.roles.length;
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
    const stillMissing = getParticipantCount(room) - room.roles.length;

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
    const participants = getParticipantPlayers(room);

    participants.forEach((player, index) => {
      const role = shuffled[index]!; // dùng dấu chấm than vì chắc chắn số role phải bằng hoặc nhiều hơn số người
      room.playerRoles![player.id] = role;
      io.to(player.id).emit("yourRole", role);
    });
    room.players = room.players.map((p) => ({ ...p, inGame: p.id !== room.hostId }));

    // Thiết lập lại danh sách sói để các chức năng sói hoạt động đúng
    room.wolves = participants
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
    room.dayVoters = [];
    room.dayVotes = {};
    room.dayLocked = {};
    room.dayDiscussionDeadline = null;
    room.dayDeadline = null;
    if (room.dayDiscussionTimer) {
      clearTimeout(room.dayDiscussionTimer);
      room.dayDiscussionTimer = null;
    }
    if (room.dayTimer) {
      clearTimeout(room.dayTimer);
      room.dayTimer = null;
    }
    clearTrialState(room);

    // Reset end-game + Linh sói state
    room.gameOver = false;
    room.winner = undefined;
    room.spiritWolfId = getSpiritWolfId(room);
    room.spiritWolfDecisionMade = false;
    room.spiritWolfChoseSave = false;
    room.spiritWolfWolfAligned = false;
    room.spiritWolfWolfAlignedPending = false;
    room.spiritWolfPendingPoisonedWolfId = null;

    // Reset end-game + Linh sói state
    room.gameOver = false;
    room.winner = undefined;
    room.spiritWolfId = getSpiritWolfId(room);
    room.spiritWolfDecisionMade = false;
    room.spiritWolfChoseSave = false;
    room.spiritWolfWolfAligned = false;
    room.spiritWolfWolfAlignedPending = false;
    room.spiritWolfPendingPoisonedWolfId = null;
    
    // Đánh dấu game đã bắt đầu ở trạng thái chờ mở màn.
    room.phase = "dusk";

    io.to(roomId).emit("gameStarted");
    io.to(roomId).emit("phaseChanged", "dusk");
    io.to(roomId).emit("roomUpdated", toPublicRoom(room));

    // In case the role set is degenerate (e.g. no biting wolves), resolve immediately.
    checkAndEndGame(roomId, "after_game_start");

    // Cập nhật lại lockedPlayerIds sau khi đã bổ sung role và bắt đầu game
    room.lockedPlayerIds = getParticipantIds(room);
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

    const playerIds = getParticipantIds(room);

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

          // Nếu đang ở ban ngày, người mất kết nối sẽ bị loại khỏi danh sách biểu quyết hiệu lực.
          if (room.phase === "day") {
            if (room.dayVotes) room.dayVotes[socket.id] = null;
            if (room.dayLocked) room.dayLocked[socket.id] = false;

            io.to(roomId).emit("dayVotesUpdated", room.dayVotes || {});
            io.to(roomId).emit("dayLockedUpdated", room.dayLocked || {});
            if (room.dayDeadline) {
              io.to(roomId).emit("dayPhaseStarted", {
                voters: getActiveDayVoters(room),
                deadline: room.dayDeadline,
              });
            } else {
              io.to(roomId).emit("dayDiscussionStarted", {
                deadline: room.dayDiscussionDeadline || null,
              });
            }

            const activeDayVoters = getActiveDayVoters(room);
            const allDayLocked =
              activeDayVoters.length > 0 &&
              activeDayVoters.every((id) => room.dayLocked?.[id] === true);
            if (allDayLocked && (!room.trialStage || room.trialStage === "none")) {
              finishDayVoting(roomId);
            }

            // Trial updates on disconnect.
            if (room.trialStage === "defense") {
              const activeSet = new Set(room.trialInteractionActiveIds || []);
              if (activeSet.has(socket.id)) {
                activeSet.delete(socket.id);
                room.trialInteractionActiveIds = Array.from(activeSet);
              }
              const queuedSet = new Set(room.trialInteractionQueuedIds || []);
              if (queuedSet.has(socket.id)) {
                queuedSet.delete(socket.id);
                room.trialInteractionQueuedIds = Array.from(queuedSet);
              }
              if (room.trialSelectedInteractorId === socket.id) {
                room.trialSelectedInteractorId = null;
              }

              if (room.trialTargetId === socket.id) {
                // Nếu bị cáo mất kết nối, chuyển luôn sang biểu quyết sống/chết.
                startTrialVerdictVoting(roomId);
              } else {
                io.to(roomId).emit("trialInteractionUpdated", buildTrialInteractionUpdatedPayload(room));
              }
            }

            if (room.trialStage === "verdict") {
              if (room.trialVotes) room.trialVotes[socket.id] = null;
              io.to(roomId).emit("trialVotesUpdated", room.trialVotes || {});

              const activeTrialVoters = getTrialVoters(room);
              const allVoted =
                activeTrialVoters.length > 0 &&
                activeTrialVoters.every((id) => {
                  const v = room.trialVotes?.[id];
                  return v === "live" || v === "die";
                });
              if (allVoted) {
                finishTrialVerdict(roomId);
              }
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
        const nextHeightPx = desiredLayoutHeightPx(getParticipantCount(room));
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
              const nextHeightPxAfterHostChange = desiredLayoutHeightPx(getParticipantCount(room));
              rescaleRoomPositionsForHeight(room, nextHeightPxAfterHostChange);
              const hostChangedOpts = layoutOptsForRoom(room);
              room.positions = ensureNonOverlappingPositions(getParticipantIds(room), room.positions, hostChangedOpts);
              io.to(roomId).emit("positionsUpdated", room.positions || []);
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

  socket.on("startGame", (payload) => {
    const roomId = typeof payload === "string" ? payload : payload?.roomId;
    const forceAdjustWolfCount = typeof payload === "object" && payload !== null ? !!payload.forceAdjustWolfCount : false;

    if (!roomId) return;

    const room = rooms[roomId];
    if (!room) return;

    if (room.pendingGameRules) {
      room.gameRules = buildRoomGameRules(room.pendingGameRules);
      delete room.pendingGameRules;
    }

    // Kiểm tra nếu đã lock role và có người mới vào
    if (room.rolesLocked && room.lockedPlayerIds) {
      const lockedCount = room.lockedPlayerIds.length;
      const currentCount = getParticipantCount(room);
      if (currentCount > lockedCount) {
        const newPlayers = getParticipantPlayers(room).filter(
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
    const participantCount = getParticipantCount(room);
    if (!roles || roles.length < participantCount) {
      socket.emit("errorMessage", "Danh sách vai trò không hợp lệ hoặc chưa được chọn.");
      return;
    }

    const wolfCount = getWolfRoleCount(roles);
    const maxAllowedWolfCount = getMaxAllowedWolfCount(participantCount);

    if (wolfCount > maxAllowedWolfCount) {
      if (!forceAdjustWolfCount) {
        io.to(room.hostId).emit("wolfRoleMismatch", {
          currentWolfCount: wolfCount,
          maxAllowedWolfCount,
          playerCount: participantCount,
        });
        return;
      }

      rebalanceWolfRoles(room, maxAllowedWolfCount);
      io.to(roomId).emit("roomUpdated", toPublicRoom(room));
    }

    // Reset toàn bộ state theo ván cũ trước khi deal ván mới.
    clearGameTimers(room);
    clearTrialState(room);
    room.gameOver = false;
    room.winner = undefined;
    room.phase = "dusk";
    room.nightCount = 0;
    room.gameLog = [];
    room.deadPlayers = [];
    room.sharedHeartsVisible = false;
    room.playerHearts = {};
    room.protectedTonight = null;
    room.lastProtected = null;
    room.seerUsedTonight = {};
    room.hunterTargetTonight = {};
    room.killedTonight = null;
    room.killedTonightExtra = null;
    room.wolfVotes = {};
    room.wolfVotes2 = {};
    room.wolfLocked = {};
    room.wolfDeadline = null;
    room.wolfExtraBiteNextNight = false;
    room.wolfBonusBiteThisNight = false;
    resetNightTurnState(room);
    room.dayVoters = [];
    room.dayVotes = {};
    room.dayLocked = {};
    room.dayDiscussionDeadline = null;
    room.dayDeadline = null;
    room.hidePlayerRoleText = false;
    room.spiritWolfDecisionMade = false;
    room.spiritWolfChoseSave = false;
    room.spiritWolfWolfAligned = false;
    room.spiritWolfWolfAlignedPending = false;
    room.spiritWolfPendingPoisonedWolfId = null;
    room.witchPotions = {};
    room.witchHealTargetTonight = {};
    room.witchPoisonTargetTonight = {};
    room.wolves = [];
    room.players = room.players.map((p) => ({ ...p, inGame: p.id !== room.hostId }));

    if (ensureRoomGameRules(room).twoHeartsFirstTwoNights) {
      initTwoHeartsForParticipants(room);
    }

    // random role cho mỗi người và lưu mapping
    const rolesToUse = room.roles || roles;
    const shuffled = rolesToUse.slice().sort(() => Math.random() - 0.5);
    room.playerRoles = {};
    const participants = getParticipantPlayers(room);
    participants.forEach((player, index) => {
      const role: string = shuffled[index] || "";
      room.playerRoles![player.id] = role;
      // gửi role bí mật cho từng client
      console.log(`[yourRole emit] Gửi role '${role}' cho player ${player.id}`);
      io.to(player.id).emit("yourRole", role);
    });
    room.players = room.players.map((p) => ({ ...p, inGame: p.id !== room.hostId }));


    // Thiết lập danh sách sói
    room.wolves = participants
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
    room.dayVoters = [];
    room.dayVotes = {};
    room.dayLocked = {};
    room.dayDiscussionDeadline = null;
    room.dayDeadline = null;
    if (room.dayDiscussionTimer) {
      clearTimeout(room.dayDiscussionTimer);
      room.dayDiscussionTimer = null;
    }
    if (room.dayTimer) {
      clearTimeout(room.dayTimer);
      room.dayTimer = null;
    }
    clearTrialState(room);


    // Đánh dấu game đã bắt đầu ở trạng thái chờ mở màn.
    room.phase = "dusk";

    // thông báo cho cả phòng rằng game đã bắt đầu
    io.to(roomId).emit("gameStarted");
    io.to(roomId).emit("phaseChanged", "dusk");
    io.to(roomId).emit("roomUpdated", toPublicRoom(room));

    // Host can always see roles; refresh reveal mapping after (re)deal.
    emitRolesRevealToSocket(roomId, room.hostId);

    // In case the role set is degenerate (e.g. no biting wolves), resolve immediately.
    checkAndEndGame(roomId, "after_game_start");

  });

  // Host can restart the game: reshuffle roles and reset per-game state.
  socket.on("restartGame", ({ roomId }) => {
    const room = rooms[roomId];
    if (!room) return;
    if (socket.id !== room.hostId) return;

    const ok = startFreshRoundWithCurrentRoles(roomId);
    if (!ok) {
      socket.emit("errorMessage", "Danh sách vai trò không hợp lệ hoặc chưa được chọn.");
    }
  });

  // changePhase phải ở bên ngoài startGame
  socket.on("changePhase", ({ roomId, phase }) => {
    const room = rooms[roomId];
    if (!room) return;

    if (room.gameOver) return;

    room.phase = phase; // "day" hoặc "night"
    console.log(`[changePhase] Phòng ${roomId} chuyển sang phase '${phase}'`);
    // Gửi phase cho cả phòng
    io.to(roomId).emit("phaseChanged", phase);

    if (phase === "night") {
      if (room.dayTimer) {
        clearTimeout(room.dayTimer);
        room.dayTimer = null;
      }
      if (room.dayDiscussionTimer) {
        clearTimeout(room.dayDiscussionTimer);
        room.dayDiscussionTimer = null;
      }
      room.dayVoters = [];
      room.dayVotes = {};
      room.dayLocked = {};
      room.dayDiscussionDeadline = null;
      room.dayDeadline = null;
      io.to(roomId).emit("dayDiscussionStarted", { deadline: null });
      clearTrialState(room);

      // Increment night counter and start a new log bucket.
      room.nightCount = (room.nightCount || 0) + 1;

      if (ensureRoomGameRules(room).twoHeartsFirstTwoNights) {
        if (room.nightCount <= TWO_HEARTS_NIGHT_LIMIT) {
          if (!room.sharedHeartsVisible) {
            initTwoHeartsForParticipants(room);
          }
        } else {
          room.sharedHeartsVisible = false;
          room.playerHearts = {};
        }
      } else {
        room.sharedHeartsVisible = false;
        room.playerHearts = {};
      }

      io.to(roomId).emit("roomUpdated", toPublicRoom(room));

      ensureNightLog(room);

      // Apply Linh sói alignment starting from the night AFTER choosing save.
      if (room.spiritWolfWolfAlignedPending && !room.spiritWolfWolfAligned) {
        room.spiritWolfWolfAligned = true;
        room.spiritWolfWolfAlignedPending = false;
        checkAndEndGame(roomId, "spirit_wolf_aligned_next_night");
        if (room.gameOver) return;
      }

      // Determine whether wolves have a one-time bonus bite this night.
      room.wolfBonusBiteThisNight = !!room.wolfExtraBiteNextNight;
      room.wolfExtraBiteNextNight = false;
      room.killedTonightExtra = null;

      if (room.wolfBonusBiteThisNight) {
        appendLogEntry(room, { type: "bonus_bite", phase: "night" });
      }

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

      startNightTurnFlow(roomId);
    } 
    else if (phase === "day") {
      resetNightTurnState(room);

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
      const twoHeartsDamageMode = isTwoHeartsDamageMode(room);
      if (twoHeartsDamageMode) {
        room.playerHearts = room.playerHearts || {};
      }

      for (const pid of pendingWolfDeaths) {
        if (!pid || healedTargets.has(pid)) continue;

        if (!twoHeartsDamageMode) {
          finalDeathSet.add(pid);
          continue;
        }

        const currentHp = Math.max(0, Math.min(TWO_HEARTS_MAX_HP, room.playerHearts?.[pid] ?? TWO_HEARTS_MAX_HP));
        const nextHp = Math.max(0, currentHp - 1);
        room.playerHearts![pid] = nextHp;
        if (nextHp <= 0) {
          finalDeathSet.add(pid);
        }
      }
      for (const t of poisonTargets) {
        finalDeathSet.add(t);
      }

      const wolfAttackersByTarget: Record<string, string[]> = {};
      const wolfVotesNow = room.wolfVotes || {};
      const wolfVotes2Now = room.wolfVotes2 || {};
      const wolvesWhoVoted = Object.keys({ ...wolfVotesNow, ...wolfVotes2Now });
      for (const targetId of pendingWolfDeaths) {
        if (!targetId || healedTargets.has(targetId)) continue;
        const attackers = wolvesWhoVoted.filter((wid) => wolfVotesNow[wid] === targetId || wolfVotes2Now[wid] === targetId);
        wolfAttackersByTarget[targetId] = attackers;
      }

      const hunterShots: Array<{ hunterId: string; targetId: string }> = [];

      // Nếu thợ săn chết trong đêm, người thợ săn đã chọn cũng chết theo.
      for (const hid of getHunters(room)) {
        if (!finalDeathSet.has(hid)) continue;
        const targetId = room.hunterTargetTonight?.[hid] || null;
        if (!targetId) continue;
        if (targetId === hid) continue;
        if ((room.deadPlayers || []).includes(targetId)) continue;
        if (!room.players.find(p => p.id === targetId)) continue;
        finalDeathSet.add(targetId);

        // Dedicated event so clients can animate the shot before deaths are rendered.
        hunterShots.push({ hunterId: hid, targetId });
      }

      for (const s of hunterShots) {
        appendLogEntry(room, { type: "hunter_shot", phase: "day", actorId: s.hunterId, targetId: s.targetId });
      }

      for (const shot of hunterShots) {
        io.to(roomId).emit("hunterShot", shot);
      }

      const finalDeaths = Array.from(finalDeathSet);

      // --- Game log: end-of-night resolution summary ---
      const wolfTargets = [killedCandidate, killedCandidateExtra].filter(Boolean) as string[];
      const savedByGuardian = guardianTarget && wolfTargets.includes(guardianTarget)
        ? [guardianTarget]
        : [];
      const savedByHeal = pendingWolfDeaths.filter(pid => healedTargets.has(pid));

      if (savedByGuardian.length) {
        appendLogEntry(room, { type: "saved_by_guardian", phase: "day", targetIds: savedByGuardian });
      }
      if (savedByHeal.length) {
        appendLogEntry(room, { type: "saved_by_witch", phase: "day", targetIds: savedByHeal });
      }
      if (finalDeaths.length) {
        const causesByTarget: Record<string, EliminationCause[]> = {};
        const addCause = (pid: string, cause: EliminationCause) => {
          causesByTarget[pid] = causesByTarget[pid] || [];
          const exists = causesByTarget[pid]!.some((c) => {
            if (c.type !== cause.type) return false;
            if (c.type !== "wolf" || cause.type !== "wolf") return true;
            const a = [...c.attackerIds].sort().join("|");
            const b = [...cause.attackerIds].sort().join("|");
            return a === b;
          });
          if (!exists) causesByTarget[pid]!.push(cause);
        };

        for (const pid of finalDeaths) {
          if (wolfAttackersByTarget[pid]?.length) {
            addCause(pid, { type: "wolf", attackerIds: wolfAttackersByTarget[pid]! });
          }
          if (poisonTargets.has(pid)) {
            addCause(pid, { type: "witch_poison" });
          }
          if (hunterShots.some((s) => s.targetId === pid)) {
            addCause(pid, { type: "hunter_shot" });
          }
        }

        appendLogEntry(room, { type: "eliminated", phase: "day", targetIds: finalDeaths, causesByTarget });
      } else {
        appendLogEntry(room, { type: "no_death", phase: "day" });
      }
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

      // If Linh sói never responded in time, treat as NOT SAVE.
      if (room.spiritWolfPendingPoisonedWolfId && !room.spiritWolfDecisionMade) {
        room.spiritWolfDecisionMade = true;
        room.spiritWolfChoseSave = false;
        appendLogEntry(room, { type: "spirit_wolf_decision", phase: "night", saved: false, timedOut: true });
        const swid = getSpiritWolfId(room);
        if (swid) {
          io.to(swid).emit("spiritWolfDecisionRecorded", { saved: false });
        }
        room.spiritWolfPendingPoisonedWolfId = null;
      } else {
        room.spiritWolfPendingPoisonedWolfId = null;
      }

      checkAndEndGame(roomId, "after_night_resolution");
      if (!room.gameOver) {
        startDayDiscussion(roomId);
      }

      // Push log updates to host immediately (host can view anytime).
      if (room.hostId) {
        emitGameLogToSocket(roomId, room.hostId);
      }
    }
  });

  socket.on("requestGameLog", ({ roomId }) => {
    const room = rooms[roomId];
    if (!room) return;
    const isHost = socket.id === room.hostId;
    if (!isHost && !room.gameOver) return;
    emitGameLogToSocket(roomId, socket.id);
  });

  socket.on("requestRolesReveal", ({ roomId }) => {
    const room = rooms[roomId];
    if (!room) return;
    const isHost = socket.id === room.hostId;
    if (!isHost && !room.gameOver) return;
    emitRolesRevealToSocket(roomId, socket.id);
  });

  // Xử lý vote ban ngày: chọn người để biểu quyết treo
  socket.on("dayChooseTarget", ({ roomId, targetId }) => {
    const room = rooms[roomId];
    if (!room) return;
    if (room.gameOver) return;
    if (room.phase !== "day") return;
    if (room.trialStage && room.trialStage !== "none") return;
    if (!room.dayDeadline) return;
    if ((room.deadPlayers || []).includes(socket.id)) return;

    const activeVoters = getActiveDayVoters(room);
    if (!activeVoters.includes(socket.id)) return;

    if (room.dayLocked?.[socket.id]) {
      socket.emit("errorMessage", "Bạn đã khóa phiếu biểu quyết, không thể thay đổi.");
      return;
    }

    if (room.dayDeadline && Date.now() >= room.dayDeadline) return;

    room.dayVotes = room.dayVotes || {};

    // Cho phép bỏ chọn
    if (!targetId) {
      room.dayVotes[socket.id] = null;
      io.to(roomId).emit("dayVotesUpdated", room.dayVotes);
      return;
    }

    // target phải tồn tại và còn sống
    if (!room.players.find(p => p.id === targetId)) return;
    if ((room.deadPlayers || []).includes(targetId)) return;

    // không cho tự vote bản thân
    if (targetId === socket.id) return;

    room.dayVotes[socket.id] = targetId;
    io.to(roomId).emit("dayVotesUpdated", room.dayVotes);
  });

  // Xử lý khóa phiếu vote ban ngày
  socket.on("dayLockVote", ({ roomId }) => {
    const room = rooms[roomId];
    if (!room) return;
    if (room.gameOver) return;
    if (room.phase !== "day") return;
    if (room.trialStage && room.trialStage !== "none") return;
    if (!room.dayDeadline) return;
    if ((room.deadPlayers || []).includes(socket.id)) return;

    const activeVoters = getActiveDayVoters(room);
    if (!activeVoters.includes(socket.id)) return;

    room.dayLocked = room.dayLocked || {};
    room.dayLocked[socket.id] = true;
    io.to(roomId).emit("dayLockedUpdated", room.dayLocked);

    const allLocked =
      activeVoters.length > 0 &&
      activeVoters.every((id) => room.dayLocked?.[id] === true);
    if (allLocked) {
      finishDayVoting(roomId);
    }
  });

  socket.on("hostStartDayVoting", ({ roomId }) => {
    const room = rooms[roomId];
    if (!room) return;
    if (room.gameOver) return;
    if (room.phase !== "day") return;
    if (socket.id !== room.hostId) return;
    if (room.trialStage && room.trialStage !== "none") return;
    if (room.dayDeadline) return;

    startDayVoting(roomId);
  });

  socket.on("hostTogglePlayerRoleText", ({ roomId }) => {
    const room = rooms[roomId];
    if (!room) return;
    if (socket.id !== room.hostId) return;

    room.hidePlayerRoleText = !(room.hidePlayerRoleText === true);
    io.to(roomId).emit("roomUpdated", toPublicRoom(room));
  });

  // Host có thể chốt ngay giai đoạn vote/nghe thanh minh để không cần chờ hết giờ.
  socket.on("hostForceFinishDayVote", ({ roomId }) => {
    const room = rooms[roomId];
    if (!room) return;
    if (room.gameOver) return;
    if (room.phase !== "day") return;
    if (socket.id !== room.hostId) return;

    if (room.trialStage === "verdict") {
      finishTrialVerdict(roomId);
      return;
    }
    if (room.trialStage === "defense") {
      startTrialVerdictVoting(roomId);
      return;
    }
    if (!room.dayDeadline) return;
    finishDayVoting(roomId);
  });

  socket.on("hostNightTurnNext", ({ roomId }) => {
    const room = rooms[roomId];
    if (!room) return;
    if (room.gameOver) return;
    if (room.phase !== "night") return;
    if (socket.id !== room.hostId) return;

    const rules = ensureRoomGameRules(room);
    if (rules.allNightActionsSimultaneous) return;
    if (!room.nightTurnRole) return;

    if (room.nightTurnRole === "Sói") {
      if (room.wolfTimer) {
        clearTimeout(room.wolfTimer);
        room.wolfTimer = null;
      }
      finishWolfVoting(roomId);
      return;
    }

    clearNightTurnTimer(room);
    startNightTurnByIndex(roomId, (room.nightTurnIndex ?? 0) + 1);
  });

  socket.on("hostToggleNightTurnPause", ({ roomId }) => {
    const room = rooms[roomId];
    if (!room) return;
    if (room.gameOver) return;
    if (room.phase !== "night") return;
    if (socket.id !== room.hostId) return;

    const rules = ensureRoomGameRules(room);
    if (rules.allNightActionsSimultaneous) return;
    if (!room.nightTurnRole) return;

    if (!room.nightTurnPaused) {
      const deadline = room.nightTurnDeadline ?? Date.now();
      const remainingMs = Math.max(0, deadline - Date.now());
      room.nightTurnRemainingMs = remainingMs;
      room.nightTurnPaused = true;

      if (room.nightTurnRole === "Sói") {
        if (room.wolfTimer) {
          clearTimeout(room.wolfTimer);
          room.wolfTimer = null;
        }
      } else {
        clearNightTurnTimer(room);
      }

      io.to(roomId).emit("roomUpdated", toPublicRoom(room));
      return;
    }

    const remainingMs = Math.max(0, room.nightTurnRemainingMs ?? 0);
    room.nightTurnPaused = false;
    room.nightTurnDeadline = Date.now() + remainingMs;

    if (room.nightTurnRole === "Sói") {
      startWolfPhase(roomId, {
        durationMs: remainingMs,
        initializeVotes: false,
      });
    } else if (remainingMs <= 0) {
      startNightTurnByIndex(roomId, (room.nightTurnIndex ?? 0) + 1);
      return;
    } else {
      clearNightTurnTimer(room);
      room.nightTurnTimer = setTimeout(() => {
        startNightTurnByIndex(roomId, (room.nightTurnIndex ?? 0) + 1);
      }, remainingMs);
    }

    io.to(roomId).emit("roomUpdated", toPublicRoom(room));
  });

  // Người chơi (trừ bị cáo) bấm nút "Tương tác" trong lúc bị cáo thanh minh.
  socket.on("trialToggleInteraction", ({ roomId, active }) => {
    const room = rooms[roomId];
    if (!room) return;
    if (room.gameOver) return;
    if (room.phase !== "day") return;
    if (room.trialStage !== "defense") return;
    if (!room.trialTargetId) return;
    if ((room.deadPlayers || []).includes(socket.id)) return;
    if (socket.id === room.trialTargetId) return;
    if (room.trialInteractionCut) return;
    if ((room.trialSelectedInteractorIds || []).includes(socket.id)) return;

    const activeSet = new Set(room.trialInteractionActiveIds || []);
    const queuedSet = new Set(room.trialInteractionQueuedIds || []);
    if (active) activeSet.add(socket.id);
    else activeSet.delete(socket.id);
    if (active) queuedSet.add(socket.id);
    else queuedSet.delete(socket.id);

    room.trialInteractionActiveIds = Array.from(activeSet);
    room.trialInteractionQueuedIds = Array.from(queuedSet);
    if (!active && room.trialSelectedInteractorId === socket.id) {
      room.trialSelectedInteractorId = null;
    }

    io.to(roomId).emit("trialInteractionUpdated", buildTrialInteractionUpdatedPayload(room));
    io.to(roomId).emit("roomUpdated", toPublicRoom(room));
  });

  // Bị cáo chọn một người đã bấm "Tương tác" (vòng xanh).
  socket.on("trialSelectInteractor", ({ roomId, targetId }) => {
    const room = rooms[roomId];
    if (!room) return;
    if (room.gameOver) return;
    if (room.phase !== "day") return;
    if (room.trialStage !== "defense") return;
    if (!room.trialTargetId) return;
    if (socket.id !== room.trialTargetId) return;

    const active = new Set(room.trialInteractionActiveIds || []);
    if (!active.has(targetId)) return;

    const selectedIds = room.trialSelectedInteractorIds || [];
    if (selectedIds.includes(targetId)) return;

    selectedIds.push(targetId);
    room.trialSelectedInteractorIds = selectedIds;

    active.delete(targetId);
    room.trialInteractionActiveIds = Array.from(active);

    const queued = new Set(room.trialInteractionQueuedIds || []);
    queued.delete(targetId);
    room.trialInteractionQueuedIds = Array.from(queued);

    room.trialSelectedInteractorId = targetId;

    const selectionLimit = Math.max(0, room.trialInteractionSelectionLimit || 0);
    if (selectionLimit > 0 && selectedIds.length >= selectionLimit) {
      room.trialInteractionCut = true;
      room.trialInteractionActiveIds = [];
    }

    io.to(roomId).emit("trialInteractionUpdated", buildTrialInteractionUpdatedPayload(room));
    io.to(roomId).emit("roomUpdated", toPublicRoom(room));
  });

  socket.on("trialAddInteractionTurn", ({ roomId }) => {
    const room = rooms[roomId];
    if (!room) return;
    if (room.gameOver) return;
    if (room.phase !== "day") return;
    if (room.trialStage !== "defense") return;
    if (!room.trialTargetId) return;
    if (socket.id !== room.hostId) return;

    const nextLimit = Math.max(0, room.trialInteractionSelectionLimit || 0) + 1;
    room.trialInteractionSelectionLimit = nextLimit;

    const selectedSet = new Set(room.trialSelectedInteractorIds || []);
    if (room.trialInteractionCut && (room.trialSelectedInteractorIds || []).length < nextLimit) {
      room.trialInteractionCut = false;

      const deadSet = new Set(room.deadPlayers || []);
      const queued = room.trialInteractionQueuedIds || [];
      room.trialInteractionActiveIds = queued.filter((id) => {
        if (!id) return false;
        if (id === room.trialTargetId) return false;
        if (selectedSet.has(id)) return false;
        if (deadSet.has(id)) return false;
        if (!isPlayerConnected(room, id)) return false;
        return !!room.players.find((p) => p.id === id);
      });
    }

    io.to(roomId).emit("trialInteractionUpdated", buildTrialInteractionUpdatedPayload(room));
    io.to(roomId).emit("roomUpdated", toPublicRoom(room));
  });

  // Bị cáo cắt tương tác => bắt đầu biểu quyết sống/chết ngay.
  socket.on("trialCutInteraction", ({ roomId }) => {
    const room = rooms[roomId];
    if (!room) return;
    if (room.gameOver) return;
    if (room.phase !== "day") return;
    if (room.trialStage !== "defense") return;
    if (!room.trialTargetId) return;
    if (socket.id !== room.trialTargetId) return;

    room.trialInteractionCut = true;
    io.to(roomId).emit("trialInteractionUpdated", buildTrialInteractionUpdatedPayload(room));

    startTrialVerdictVoting(roomId);
  });

  // Mọi người (trừ bị cáo) vote sống/chết trong 20 giây.
  socket.on("trialVoteLifeDeath", ({ roomId, vote }) => {
    const room = rooms[roomId];
    if (!room) return;
    if (room.gameOver) return;
    if (room.phase !== "day") return;
    if (room.trialStage !== "verdict") return;
    if (!room.trialTargetId) return;
    if (socket.id === room.trialTargetId) return;
    if ((room.deadPlayers || []).includes(socket.id)) return;

    const voters = getTrialVoters(room);
    if (!voters.includes(socket.id)) return;

    if (room.trialVerdictDeadline && Date.now() >= room.trialVerdictDeadline) return;

    room.trialVotes = room.trialVotes || {};
    if (vote !== "live" && vote !== "die") {
      room.trialVotes[socket.id] = null;
    } else {
      room.trialVotes[socket.id] = vote;
    }

    io.to(roomId).emit("trialVotesUpdated", room.trialVotes);
  });

  // Xử lý chức năng thợ săn chọn mục tiêu trong đêm
  socket.on("hunterChooseTarget", ({ roomId, targetId }) => {
    const room = rooms[roomId];
    if (!room) return;

    if (room.phase !== "night") return;
    if (!canPerformNightRoleAction(room, socket.id, "Thợ săn")) return;
    if (room.playerRoles?.[socket.id] !== "Thợ săn") return;
    if ((room.deadPlayers || []).includes(socket.id)) return;

    room.hunterTargetTonight = room.hunterTargetTonight || {};

    const prev = room.hunterTargetTonight[socket.id] ?? null;

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

    if (prev !== targetId) {
      appendLogEntry(room, { type: "hunter_mark", phase: "night", actorId: socket.id, targetId });
    }
  });

  // Nhường quyền chủ phòng cho người khác
  socket.on("transferHost", ({ roomId, targetId }) => {
    const room = rooms[roomId];
    if (!room) return;
    if (socket.id !== room.hostId) return; // chỉ host mới được nhường quyền
    if (!room.players.find(p => p.id === targetId)) return;
    room.hostId = targetId;
    const nextHeightPxAfterHostChange = desiredLayoutHeightPx(getParticipantCount(room));
    rescaleRoomPositionsForHeight(room, nextHeightPxAfterHostChange);
    const hostChangedOpts = layoutOptsForRoom(room);
    room.positions = ensureNonOverlappingPositions(getParticipantIds(room), room.positions, hostChangedOpts);
    io.to(roomId).emit("positionsUpdated", room.positions || []);
    io.to(roomId).emit("hostChanged", room.hostId);
    io.to(roomId).emit("roomUpdated", toPublicRoom(room));
  });

  // Kick người chơi khỏi phòng
  socket.on("kickPlayer", ({ roomId, targetId, source }: { roomId: string; targetId: string; source?: "room" | "game" }) => {
    const room = rooms[roomId];
    if (!room) return;
    if (socket.id !== room.hostId) return; // chỉ host mới được kick
    if (!room.players.find(p => p.id === targetId)) return;

    const shouldForceReturnAll = source === "room" && !!room.phase && !room.gameOver;
    if (shouldForceReturnAll) {
      resetRoomFromGameToLobby(room);
    }

    // Xoá player khỏi room
    room.players = room.players.filter(p => p.id !== targetId);
    room.positions = (room.positions || []).filter((pos) => pos.playerId !== targetId);
    room.positionEditors = (room.positionEditors || []).filter((id) => id !== targetId);
    room.lockedPlayerIds = (room.lockedPlayerIds || []).filter((id) => id !== targetId);

    if (room.playerRoles) {
      delete room.playerRoles[targetId];
    }
    if (room.wolfVotes) {
      delete room.wolfVotes[targetId];
    }
    if (room.wolfVotes2) {
      delete room.wolfVotes2[targetId];
    }
    if (room.wolfLocked) {
      delete room.wolfLocked[targetId];
    }
    if (room.dayVotes) {
      delete room.dayVotes[targetId];
    }
    if (room.dayLocked) {
      delete room.dayLocked[targetId];
    }
    if (room.trialVotes) {
      delete room.trialVotes[targetId];
    }
    room.dayVoters = (room.dayVoters || []).filter((id) => id !== targetId);
    room.deadPlayers = (room.deadPlayers || []).filter((id) => id !== targetId);
    room.wolves = (room.wolves || []).filter((id) => id !== targetId);

    // Nếu bị kick là host (trường hợp hiếm), chuyển quyền cho người đầu tiên còn lại
    if (room.hostId === targetId && room.players.length > 0) {
      const firstPlayer = room.players[0];
      if (firstPlayer) {
        room.hostId = firstPlayer.id;
        const nextHeightPxAfterHostChange = desiredLayoutHeightPx(getParticipantCount(room));
        rescaleRoomPositionsForHeight(room, nextHeightPxAfterHostChange);
        const hostChangedOpts = layoutOptsForRoom(room);
        room.positions = ensureNonOverlappingPositions(getParticipantIds(room), room.positions, hostChangedOpts);
        io.to(roomId).emit("hostChanged", room.hostId);
      }
    }
    io.to(roomId).emit("positionsUpdated", room.positions || []);
    io.to(roomId).emit("roomUpdated", toPublicRoom(room));
    if (shouldForceReturnAll) {
      io.to(roomId).emit("forceReturnToRoom", { roomId, reason: "host_returned_to_room" });
    }
    io.to(targetId).emit("kicked"); // thông báo cho người bị kick
  });

  // Xử lý chức năng tiên tri soi người
  socket.on("seerCheck", ({ roomId, targetId }) => {
    const room = rooms[roomId];
    if (!room || !room.playerRoles) return;

    if (room.gameOver) return;

    // chỉ được dùng vào ban đêm
    if (room.phase !== "night") return;
    if (!canPerformNightRoleAction(room, socket.id, "Tiên tri")) return;

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
    // Seer detection rules:
    // - "Bán sói" thuộc phe Sói nhưng không bị Tiên tri phát hiện là Sói
    // - "Kẻ bị nguyền" thuộc phe Dân nhưng bị Tiên tri soi ra thành Sói
    const isSpiritWolfMarkedWolf =
      roleOfTarget === SPIRIT_WOLF_ROLE &&
      room.spiritWolfChoseSave === true &&
      getSpiritWolfId(room) === targetId;

    const isWolf =
      roleOfTarget === "Kẻ bị nguyền"
        ? true
        : roleOfTarget === "Bán sói"
          ? false
          : isSpiritWolfMarkedWolf
            ? true
            : isWolfRole(roleOfTarget);
    io.to(socket.id).emit("seerResult", { playerId: targetId, isWolf });

              // Log seer action (revealed after game; host can view anytime).
              appendLogEntry(room, { type: "seer_check", phase: "night", actorId: socket.id, targetId, isWolf });
  });

  // Xử lý chức năng bảo vệ bảo vệ người
  socket.on("guardianProtect", ({ roomId, targetId }) => {
    const room = rooms[roomId];
    if (!room) return;

    if (room.gameOver) return;

    // chỉ được dùng vào ban đêm
    if (room.phase !== "night") return;
    if (!canPerformNightRoleAction(room, socket.id, "Bảo vệ")) return;

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

    appendLogEntry(room, { type: "guardian_protect", phase: "night", actorId: socket.id, targetId });

    // Nếu bảo vệ trúng người sói cắn, phù thủy sẽ không còn thấy ai sắp chết.
    emitWitchPendingDeath(roomId);
  });

  // Xử lý chức năng phù thủy dùng bình cứu
  socket.on("witchHeal", ({ roomId, targetId }) => {
    const room = rooms[roomId];
    if (!room) return;

    if (room.gameOver) return;

    if (room.phase !== "night") return;
    if (!canPerformNightRoleAction(room, socket.id, "Phù thủy")) return;
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

    appendLogEntry(room, { type: "witch_heal", phase: "night", actorId: socket.id, targetId });

    // After using heal, this witch should no longer see pending deaths.
    emitWitchPendingDeath(roomId);
  });

  // Xử lý chức năng phù thủy dùng bình giết
  socket.on("witchPoison", ({ roomId, targetId }) => {
    const room = rooms[roomId];
    if (!room) return;

    if (room.gameOver) return;

    if (room.phase !== "night") return;
    if (!canPerformNightRoleAction(room, socket.id, "Phù thủy")) return;
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

    appendLogEntry(room, { type: "witch_poison", phase: "night", actorId: socket.id, targetId });

    // If witch poisons a wolf, Linh sói may choose to save.
    const targetRole = room.playerRoles?.[targetId];
    if (
      isWolfRole(targetRole) &&
      isSpiritWolfAlive(room) &&
      !room.spiritWolfDecisionMade &&
      !room.spiritWolfPendingPoisonedWolfId
    ) {
      room.spiritWolfPendingPoisonedWolfId = targetId;
      insertSpiritWolfIntoNightOrder(room);
      io.to(roomId).emit("roomUpdated", toPublicRoom(room));
    }
  });

  // Linh sói decides whether to save the poisoned wolf.
  socket.on("spiritWolfDecide", ({ roomId, save }) => {
    const room = rooms[roomId];
    if (!room) return;
    if (room.gameOver) return;
    if (room.phase !== "night") return;
    if (!canPerformNightRoleAction(room, socket.id, "Linh sói")) return;
    if (room.playerRoles?.[socket.id] !== SPIRIT_WOLF_ROLE) return;
    if ((room.deadPlayers || []).includes(socket.id)) return;

    const pendingTargetId = room.spiritWolfPendingPoisonedWolfId;
    if (!pendingTargetId) return;
    if (room.spiritWolfDecisionMade) return;

    room.spiritWolfDecisionMade = true;
    room.spiritWolfChoseSave = !!save;
    if (save) {
      room.spiritWolfWolfAlignedPending = true;
      // Cancel the poison kill on that wolf target (potion remains used).
      room.witchPoisonTargetTonight = room.witchPoisonTargetTonight || {};
      for (const wid of getWitches(room)) {
        if (room.witchPoisonTargetTonight[wid] === pendingTargetId) {
          room.witchPoisonTargetTonight[wid] = null;
        }
      }
    }

    room.spiritWolfPendingPoisonedWolfId = null;
    io.to(socket.id).emit("spiritWolfDecisionRecorded", { saved: !!save });
    io.to(roomId).emit("roomUpdated", toPublicRoom(room));

    appendLogEntry(room, { type: "spirit_wolf_decision", phase: "night", saved: !!save });

    // Spirit Wolf becomes wolf-aligned next night; still re-check in case there are no biting wolves.
    checkAndEndGame(roomId, "after_spirit_wolf_decision");
  });

  // Xử lý chức năng sói chọn cắn ai
  socket.on("wolfChooseTarget", ({ roomId, targetId }) => {
    const room = rooms[roomId];
    if (!room) return;
    if (room.gameOver) return;
    if (!isWolfRole(room.playerRoles?.[socket.id])) return; // chỉ phe sói mới được chọn
    if ((room.deadPlayers || []).includes(socket.id)) return; // sói chết -> bỏ qua
    if (room.phase !== "night") return;
    if (!canPerformNightRoleAction(room, socket.id, "Sói")) return;

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
    if (room.gameOver) return;
    if (!isWolfRole(room.playerRoles?.[socket.id])) return;
    if (room.phase !== "night") return;
    if ((room.deadPlayers || []).includes(socket.id)) return;
    if (!canPerformNightRoleAction(room, socket.id, "Sói")) return;

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
    if (!canPerformNightRoleAction(room, socket.id, "Sói")) return;

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


