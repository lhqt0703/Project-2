import React, { useEffect, useRef, useState } from "react";
import { socket, clientId } from "../socket";
import { useRoomContext } from "../context/RoomContext";
import { getDeterministicSlots1to18, getDeterministicSlots19Plus } from "./layouts";
import ElementalVFX from "./ElementalVFX";
import BorderGlow from "./BorderGlow";
import Orb from "./Orb";

interface PlayerPosition {
  playerId: string;
  x: number;
  y: number;
}

interface RoomLike {
  id: string;
  hostId: string;
  players: Array<{ id: string; name: string; connected?: boolean; inGame?: boolean }>;
  positions?: PlayerPosition[];
  positionEditors?: string[];
  autoArrangeUsed?: boolean;
  compactCircles?: boolean;
  phase?: string;
  gameOver?: boolean;
  wolfVotes?: Record<string, string | null>;
  wolfVotes2?: Record<string, string | null>;
  deadPlayers?: string[];
  sharedHeartsVisible?: boolean;
  playerHearts?: Record<string, number>;
  privatePlayerHearts?: Record<string, number>;
  privateHeartVisiblePlayerIds?: string[];
  playerHeartShakeIds?: string[];
  nightActionProgressByPlayerId?: Record<string, "pending" | "done">;
  nightTurnDeadline?: number | null;
  wolfDeadline?: number | null;
  spiritWolfDecisionDeadline?: number | null;
  nightActionExtraTimeMsByPlayerId?: Record<string, number>;
  gameRules?: {
    allNightActionsSimultaneous?: boolean;
    nonWolfNightActionDurationSec?: number;
    wolfNightActionDurationSec?: number;
    witchBonusTimeRequiresUsablePotion?: boolean;
  };
}

type BulletAnimation = {
  fromPlayerId: string;
  toPlayerId: string;
  startedAt: number;
  durationMs: number;
  assetSrc?: string;
  alt?: string;
  rotationOffsetDeg?: number;
};

const DEFAULT_CIRCLE_SIZE_PX = 72; // Match Game.tsx size
const SMALL_CIRCLE_SIZE_PX = 46;
const CIRCLE_BORDER_PX = 2;
const BOUNDARY_MARGIN_PX = 12;
const DEFAULT_GAP_PX = 13.3;
const SNAP_AXIS_THRESHOLD_PX = 25;
const SNAP_MAX_DISTANCE_PX = 100;

const FRAME_HEIGHT_PX = 470;
const EXTRA_FRAME_HEIGHT_PX = 100;
const EXPANDED_FRAME_HEIGHT_PX = FRAME_HEIGHT_PX + EXTRA_FRAME_HEIGHT_PX;
const TOP_AREA_HEIGHT_PX = 350;
const GAP_BETWEEN_AREAS_PX = 20;
const AUTO_BOUNDARY_MARGIN_PX = 2; // allow fitting 7 across like user expects
const AUTO_TOP_LIMIT = 18;

const EMIT_PERCENT_DECIMALS = 1; // .x%
const EMIT_STEP_01 = 1 / (100 * Math.pow(10, EMIT_PERCENT_DECIMALS)); // 0.1% => 0.001

function quantize01(v: number) {
  return Math.round(v / EMIT_STEP_01) * EMIT_STEP_01;
}

function quantizePos(pos: PlayerPosition) {
  return {
    ...pos,
    x: quantize01(pos.x),
    y: quantize01(pos.y),
  };
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

function clampToBounds<T extends { x: number; y: number }>(pos: T, rect: DOMRect, circleSizePx: number): T {
  const r = circleSizePx / 2;
  const marginX = (r + CIRCLE_BORDER_PX + BOUNDARY_MARGIN_PX) / rect.width;
  const marginY = (r + CIRCLE_BORDER_PX + BOUNDARY_MARGIN_PX) / rect.height;
  return {
    ...pos,
    x: clamp(pos.x, marginX, 1 - marginX),
    y: clamp(pos.y, marginY, 1 - marginY),
  };
}

function pxDelta(a: { x: number; y: number }, b: { x: number; y: number }, rect: DOMRect) {
  return {
    dx: (a.x - b.x) * rect.width,
    dy: (a.y - b.y) * rect.height,
  };
}

function resolveDraggedNoOverlap(
  candidate: PlayerPosition,
  others: PlayerPosition[],
  rect: DOMRect,
  lockedAxis: "x" | "y" | undefined,
  circleSizePx: number
) {
  const minDistPx = circleSizePx;
  const minDistSq = minDistPx * minDistPx;

  let x = candidate.x;
  let y = candidate.y;
  ({ x, y } = clampToBounds({ x, y }, rect, circleSizePx));

  const anyOverlap = () => {
    for (const o of others) {
      const dxPx = (x - o.x) * rect.width;
      const dyPx = (y - o.y) * rect.height;
      if (dxPx * dxPx + dyPx * dyPx < minDistSq - 0.25) return true;
    }
    return false;
  };

  const pushAlongAxis = (axis: "x" | "y") => {
    for (let iter = 0; iter < 24; iter++) {
      let moved = false;
      for (const o of others) {
        const dxPx = (x - o.x) * rect.width;
        const dyPx = (y - o.y) * rect.height;
        const d2 = dxPx * dxPx + dyPx * dyPx;
        if (d2 >= minDistSq) continue;

        const d = Math.sqrt(d2) || 0.0001;
        const overlap = minDistPx - d;
        if (overlap <= 0) continue;

        if (axis === "x") {
          const sign = (dxPx || 1) >= 0 ? 1 : -1;
          x += (sign * overlap) / rect.width;
        } else {
          const sign = (dyPx || 1) >= 0 ? 1 : -1;
          y += (sign * overlap) / rect.height;
        }

        ({ x, y } = clampToBounds({ x, y }, rect, circleSizePx));
        moved = true;
      }
      if (!moved) break;
      if (!anyOverlap()) return true;
    }
    return !anyOverlap();
  };

  // If a magnet snap locked one axis, prefer resolving by sliding on the other axis.
  if (lockedAxis === "x") {
    if (pushAlongAxis("y")) return { ...candidate, x, y };
  } else if (lockedAxis === "y") {
    if (pushAlongAxis("x")) return { ...candidate, x, y };
  }

  // Fallback: 2D separation pushes away from overlaps.
  for (let iter = 0; iter < 16; iter++) {
    let moved = false;
    for (const o of others) {
      const dxPx = (x - o.x) * rect.width;
      const dyPx = (y - o.y) * rect.height;
      const d2 = dxPx * dxPx + dyPx * dyPx;
      if (d2 >= minDistSq) continue;

      const d = Math.sqrt(d2) || 0.0001;
      const overlap = minDistPx - d;
      if (overlap <= 0) continue;

      const nx = dxPx / d;
      const ny = dyPx / d;
      x += (nx * overlap) / rect.width;
      y += (ny * overlap) / rect.height;
      ({ x, y } = clampToBounds({ x, y }, rect, circleSizePx));
      moved = true;
    }
    if (!moved) break;
  }

  return { ...candidate, x, y };
}

function applyMagnetSnap(
  rawCandidate: PlayerPosition,
  others: PlayerPosition[],
  rect: DOMRect,
  circleSizePx: number
): { snapped: PlayerPosition; lockedAxis?: "x" | "y" } {
  // When circles are smaller, reduce magnet strength (snap range/threshold)
  // so dragging feels less “sticky”.
  const sizeFactor = clamp(circleSizePx / DEFAULT_CIRCLE_SIZE_PX, 0.55, 1);
  const snapAxisThresholdPx = SNAP_AXIS_THRESHOLD_PX * sizeFactor;
  const snapMaxDistancePx = SNAP_MAX_DISTANCE_PX * sizeFactor;

  const preferredSepPx = circleSizePx + DEFAULT_GAP_PX;
  const minSepPx = circleSizePx;

  let best: { axis: "x" | "y"; dist: number; axisDelta: number; target: PlayerPosition } | undefined;

  // Invisible magnet on the vertical center axis (x=0.5).
  const centerDxPx = Math.abs((rawCandidate.x - 0.5) * rect.width);
  if (centerDxPx <= snapAxisThresholdPx) {
    // Use dist = axis distance so it can win over far-away player snaps.
    best = {
      axis: "x",
      dist: centerDxPx,
      axisDelta: centerDxPx,
      target: { playerId: "__CENTER__", x: 0.5, y: rawCandidate.y },
    };
  }

  for (const o of others) {
    const { dx, dy } = pxDelta(rawCandidate, o, rect);
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > snapMaxDistancePx) continue;

    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);

    if (absDx <= snapAxisThresholdPx && absDy > 1) {
      const candidate = { axis: "x" as const, dist, axisDelta: absDx, target: o };
      if (!best || candidate.dist < best.dist || (candidate.dist === best.dist && candidate.axisDelta < best.axisDelta)) {
        best = candidate;
      }
    }
    if (absDy <= snapAxisThresholdPx && absDx > 1) {
      const candidate = { axis: "y" as const, dist, axisDelta: absDy, target: o };
      if (!best || candidate.dist < best.dist || (candidate.dist === best.dist && candidate.axisDelta < best.axisDelta)) {
        best = candidate;
      }
    }
  }

  if (!best) return { snapped: rawCandidate };

  const t = best.target;
  if (best.axis === "x") {
    // Center-axis snap (x = 0.5)
    if (t.playerId === "__CENTER__") {
      const snapped: PlayerPosition = { ...rawCandidate, x: 0.5 };
      const clamped = clampToBounds(snapped, rect, circleSizePx);
      return { snapped: { ...snapped, ...clamped }, lockedAxis: "x" };
    }

    const dyRawPx = (rawCandidate.y - t.y) * rect.height;
    const sign = (dyRawPx || 1) >= 0 ? 1 : -1;
    const intended = Math.abs(dyRawPx);
    const sep = intended < preferredSepPx ? clamp(intended, minSepPx, preferredSepPx) : preferredSepPx;
    const snapped: PlayerPosition = {
      ...rawCandidate,
      x: t.x,
      y: t.y + (sign * sep) / rect.height,
    };
    const clamped = clampToBounds(snapped, rect, circleSizePx);
    return { snapped: { ...snapped, ...clamped }, lockedAxis: "x" };
  }

  const dxRawPx = (rawCandidate.x - t.x) * rect.width;
  const sign = (dxRawPx || 1) >= 0 ? 1 : -1;
  const intended = Math.abs(dxRawPx);
  const sep = intended < preferredSepPx ? clamp(intended, minSepPx, preferredSepPx) : preferredSepPx;
  const snapped: PlayerPosition = {
    ...rawCandidate,
    y: t.y,
    x: t.x + (sign * sep) / rect.width,
  };
  const clamped = clampToBounds(snapped, rect, circleSizePx);
  return { snapped: { ...snapped, ...clamped }, lockedAxis: "y" };
}

const getRoleBadgeStyle = (role: string) => {
  const isWolf = ["Sói", "Sói con", "Sói Dại", "Bán sói", "Linh sói"].includes(role);
  const isSpecialBlue = ["Tiên tri", "Tiên tri tập sự", "Thợ săn", "Hiệp sĩ"].includes(role);
  const isSpecialGreen = ["Bảo vệ", "Phù thủy", "Già làng", "Sinh đôi"].includes(role);
  const isSpecialPurple = ["Thổi sáo", "Linh hồn", "Kẻ nguyền rủa"].includes(role);

  let borderGradient = "linear-gradient(135deg, rgba(255, 255, 255, 0.15), rgba(255, 255, 255, 0.05))";
  let bgGradient = "linear-gradient(135deg, rgba(30, 41, 59, 0.9), rgba(15, 23, 42, 0.95))";
  let textColor = "#e2e8f0";
  let glow = "rgba(0, 0, 0, 0.4)";

  if (isWolf) {
    borderGradient = "linear-gradient(135deg, rgba(239, 68, 68, 0.6), rgba(153, 27, 27, 0.3))";
    bgGradient = "linear-gradient(135deg, rgba(45, 18, 18, 0.95), rgba(20, 10, 10, 0.98))";
    textColor = "#ff6b6b";
    glow = "rgba(239, 68, 68, 0.25)";
  } else if (isSpecialBlue) {
    borderGradient = "linear-gradient(135deg, rgba(6, 182, 212, 0.6), rgba(8, 145, 178, 0.3))";
    bgGradient = "linear-gradient(135deg, rgba(12, 34, 45, 0.95), rgba(8, 20, 30, 0.98))";
    textColor = "#22d3ee";
    glow = "rgba(6, 182, 212, 0.25)";
  } else if (isSpecialGreen) {
    borderGradient = "linear-gradient(135deg, rgba(16, 185, 129, 0.6), rgba(4, 120, 87, 0.3))";
    bgGradient = "linear-gradient(135deg, rgba(12, 38, 28, 0.95), rgba(6, 20, 15, 0.98))";
    textColor = "#34d399";
    glow = "rgba(16, 185, 129, 0.25)";
  } else if (isSpecialPurple) {
    borderGradient = "linear-gradient(135deg, rgba(168, 85, 247, 0.6), rgba(109, 40, 217, 0.3))";
    bgGradient = "linear-gradient(135deg, rgba(28, 18, 45, 0.95), rgba(15, 8, 25, 0.98))";
    textColor = "#c084fc";
    glow = "rgba(168, 85, 247, 0.25)";
  }

  return {
    background: `${bgGradient} padding-box, ${borderGradient} border-box`,
    border: "1px solid transparent",
    color: textColor,
    boxShadow: `0 3px 8px ${glow}`,
  };
};

export default function PlayerPositions({
  onPlayerClick,
  onPlayerDoubleClick,
  mode = "edit",
  roomOverride,
  seerResult,
  deadPlayersOverride,
  bulletAnimation,
  selectedOutlinePlayerId,
  selectedOutlinePlayerIds,
  highlightPlayerId,
  secondaryHighlightPlayerIds,
  cursedHighlightPlayerIds,
  cursedHighlightIsDanger,
  verdictLivePlayerIds,
  verdictDiePlayerIds,
  dangerPlayerId,
  dangerPlayerIds,
  showWolfVoteBadges,
  wolfVoteVoterIds,
  voteWeightsByVoterId,
  showWolfBadges,
  wolfBadgePlayerIds,
  wolfBadgeRoles,
  cheesePlayerIds,
  showRoleBadges,
  roleBadges,
  activeNightRole,
  suppressNightActionProgress,
  trialOrangePlayerId,
  trialWhitePlayerIds,
  trialGreenPlayerId,
  replayActorIds,
  replayTargetIds,
  showActionGlow,
  dietQuyOrangeHighlightPlayerIds,
  dietQuyRedHighlightPlayerIds,
}: {
  onPlayerClick: (playerId: string) => void;
  onPlayerDoubleClick?: (playerId: string) => void;
  mode?: "edit" | "view";
  roomOverride?: RoomLike | null;
  seerResult?: { playerId: string; isWolf: boolean } | null;
  deadPlayersOverride?: string[];
  bulletAnimation?: BulletAnimation | null;
  selectedOutlinePlayerId?: string | null;
  selectedOutlinePlayerIds?: string[];
  highlightPlayerId?: string | null;
  secondaryHighlightPlayerIds?: string[];
  cursedHighlightPlayerIds?: string[];
  cursedHighlightIsDanger?: boolean;
  verdictLivePlayerIds?: string[];
  verdictDiePlayerIds?: string[];
  dangerPlayerId?: string | null;
  dangerPlayerIds?: string[];
  showWolfVoteBadges?: boolean;
  wolfVoteVoterIds?: string[];
  voteWeightsByVoterId?: Record<string, number>;
  showWolfBadges?: boolean;
  wolfBadgePlayerIds?: string[];
  wolfBadgeRoles?: Record<string, string>;
  cheesePlayerIds?: string[];
  showRoleBadges?: boolean;
  roleBadges?: Record<string, string>;
  activeNightRole?: string | null;
  suppressNightActionProgress?: boolean;
  trialOrangePlayerId?: string | null;
  trialWhitePlayerIds?: string[];
  trialGreenPlayerId?: string | null;
  replayActorIds?: string[];
  replayTargetIds?: string[];
  showActionGlow?: boolean;
  dietQuyOrangeHighlightPlayerIds?: string[];
  dietQuyRedHighlightPlayerIds?: string[];
}) {
  const { room: contextRoom } = useRoomContext();
  const room: RoomLike | null = roomOverride ?? (contextRoom as RoomLike | null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [revealDisconnectedToAll, setRevealDisconnectedToAll] = useState<boolean>(false);
  const [dragging, setDragging] = useState<string | null>(null);
  const dragOffsetRef = useRef<{ dxPx: number; dyPx: number } | null>(null);
  const lastPointerTypeRef = useRef<string | null>(null);
  const lastTapRef = useRef<{ playerId: string; at: number } | null>(null);
  const [swapSource, setSwapSource] = useState<string | null>(null);
  const [compactCircles, setCompactCircles] = useState<boolean>(() => room?.compactCircles ?? false);
  const [frameScale, setFrameScale] = useState(1);
  const [nightActionNow, setNightActionNow] = useState(() => Date.now());

  if (!room) return null;

  const visiblePlayers = room.players.filter((p) => p.id !== room.hostId);

  // Sync circle size mode from server room state.
  useEffect(() => {
    setCompactCircles(room.compactCircles ?? false);
  }, [room.compactCircles]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const updateScale = () => {
      const width = el.getBoundingClientRect().width || 600;
      setFrameScale(clamp(width / 600, 0.55, 1));
    };

    updateScale();

    const observer = new ResizeObserver(updateScale);
    observer.observe(el);
    window.addEventListener("resize", updateScale);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateScale);
    };
  }, []);

  const isHost = room.hostId === clientId;
  const isEditor = mode === "edit" && (room.positionEditors?.includes(clientId!) || isHost);
  const isSimultaneousNight =
    room.phase === "night" && room.gameRules?.allNightActionsSimultaneous === true;
  const hasPendingNightActionProgress = Object.values(room.nightActionProgressByPlayerId || {}).includes("pending");

  useEffect(() => {
    if (!isHost) return;
    if (!isSimultaneousNight) return;
    const hasAnyCountdown = !!room.nightTurnDeadline || !!room.wolfDeadline || !!room.spiritWolfDecisionDeadline;
    if (!hasAnyCountdown) return;
    if (!hasPendingNightActionProgress) return;

    setNightActionNow(Date.now());
    const t = window.setInterval(() => setNightActionNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [hasPendingNightActionProgress, isHost, isSimultaneousNight, room.nightTurnDeadline, room.spiritWolfDecisionDeadline, room.wolfDeadline]);

  const witchBonusApplies =
    (room.gameRules?.nonWolfNightActionDurationSec || 0) > 0
    && room.gameRules?.nonWolfNightActionDurationSec === room.gameRules?.wolfNightActionDurationSec;
  const getVisibleNightActionProgress = (playerId: string) => {
    if (!isHost) return undefined;
    if (suppressNightActionProgress) return undefined;
    const progress = room.nightActionProgressByPlayerId?.[playerId];
    if (progress !== "pending") return progress;
    if (!isSimultaneousNight) return progress;
    const extraMs = Math.max(0, Math.floor(room.nightActionExtraTimeMsByPlayerId?.[playerId] || 0));

    const roleName = roleBadges?.[playerId] || wolfBadgeRoles?.[playerId] || "";
    const isWolfProgress = roleName === "Sói" || roleName === "Sói con" || roleName === "Sói Dại" || roleName === "Bán sói";
    if (isWolfProgress) {
      const wolfDeadline = room.wolfDeadline ?? null;
      if (!wolfDeadline) return progress;
      return nightActionNow >= wolfDeadline + extraMs ? undefined : progress;
    }

    if (roleName === "Linh sói") {
      const spiritDeadline = room.spiritWolfDecisionDeadline ?? null;
      if (!spiritDeadline) return progress;
      return nightActionNow >= spiritDeadline + extraMs ? undefined : progress;
    }

    const baseDeadline = room.nightTurnDeadline ?? null;
    if (!baseDeadline) return progress;
    const deadline = roleName === "Phù thủy" && witchBonusApplies
      ? baseDeadline + extraMs + 10_000
      : baseDeadline + extraMs;
    return nightActionNow >= deadline ? undefined : progress;
  };

  const isExpandedFrame = visiblePlayers.length > AUTO_TOP_LIMIT;
  const frameHeightPx = isExpandedFrame ? EXPANDED_FRAME_HEIGHT_PX : FRAME_HEIGHT_PX;

  const scalePx = (value: number, min = 1) => Math.max(min, Math.round(value * frameScale));
  const scaleNum = (value: number, min = 0) => Math.max(min, Number((value * frameScale).toFixed(2)));
  const circleSizePx = scalePx(compactCircles ? SMALL_CIRCLE_SIZE_PX : DEFAULT_CIRCLE_SIZE_PX, 34);
  const circleRadiusPx = circleSizePx / 2;
  const circleBorderPx = scalePx(2, 1);
  const selectedBorderPx = scalePx(3, 2);
  const playerFontSizePx = scalePx(12, 9);
  const playerSubFontSizePx = scalePx(11, 8);
  const badgeFontSizePx = scalePx(11, 8);
  const hpBadgeFontSizePx = scalePx(12, 9);
  const badgeOffsetPx = scalePx(10, 6);
  const hpBadgeTopPx = scalePx(26, 16);
  const badgePadding = `${scalePx(2, 1)}px ${scalePx(6, 3)}px`;
  const hpBadgePadding = `${scalePx(2, 1)}px ${scalePx(8, 4)}px`;

  const wolfVotes = room.wolfVotes as Record<string, string | null> | undefined;
  const wolfVotes2 = room.wolfVotes2 as Record<string, string | null> | undefined;
  const deadPlayers =
    mode === "view"
      ? (deadPlayersOverride ?? (room.deadPlayers as string[] | undefined))
      : (deadPlayersOverride ?? []);
  const wolfCount = wolfVoteVoterIds && wolfVoteVoterIds.length
    ? wolfVoteVoterIds.length
    : (() => {
        const ids = Object.keys({ ...(wolfVotes || {}), ...(wolfVotes2 || {}) });
        return ids.length;
      })();

  const onPointerDown = (e: React.PointerEvent, playerId: string) => {
    if (!isEditor) return;
    if (swapSource) {
      // If in swap mode, select target
      if (swapSource !== playerId) {
        // Perform swap
        const p1 = room.positions?.find(p => p.playerId === swapSource);
        const p2 = room.positions?.find(p => p.playerId === playerId);
        if (p1 && p2) {
          const newPositions = room.positions!.map(p => {
            if (p.playerId === swapSource) return { ...p, x: p2.x, y: p2.y };
            if (p.playerId === playerId) return { ...p, x: p1.x, y: p1.y };
            return p;
          });
          socket.emit("updatePositions", { roomId: room.id, positions: newPositions.map(quantizePos) });
        }
        setSwapSource(null);
      } else {
        setSwapSource(null); // Cancel swap if clicked same
      }
      return;
    }

    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const pos = room.positions?.find(p => p.playerId === playerId);
    if (!pos) return;
    const pointerX = e.clientX - rect.left;
    const pointerY = e.clientY - rect.top;
    const centerX = pos.x * rect.width;
    const centerY = pos.y * rect.height;
    dragOffsetRef.current = { dxPx: pointerX - centerX, dyPx: pointerY - centerY };
    setDragging(playerId);
  };

  useEffect(() => {
    const handler = (payload: { show: boolean }) => {
      setRevealDisconnectedToAll(!!payload.show);
    };
    socket.on("revealDisconnectedBadge", handler);
    return () => {
      socket.off("revealDisconnectedBadge", handler);
    };
  }, []);

  const hasDisconnectedPlayers = room.players.some((p) => p.connected === false);
  
  // We need local state for smooth dragging
  const [localPositions, setLocalPositions] = useState<PlayerPosition[]>([]);
  useEffect(() => {
    if (room.positions) {
      setLocalPositions(room.positions.filter((pos) => pos.playerId !== room.hostId));
    }
  }, [room.hostId, room.positions]);

  const animPositionsRef = useRef<PlayerPosition[]>([]);
  useEffect(() => {
    animPositionsRef.current = (localPositions && localPositions.length ? localPositions : (room.positions || [])) as PlayerPosition[];
  }, [localPositions, room.positions]);

  const [bulletFrame, setBulletFrame] = useState<{ x: number; y: number; elapsedMs: number; totalMs: number } | null>(null);
  const bulletRafRef = useRef<number | null>(null);

  useEffect(() => {
    if (bulletRafRef.current != null) {
      cancelAnimationFrame(bulletRafRef.current);
      bulletRafRef.current = null;
    }

    if (!bulletAnimation) {
      setBulletFrame(null);
      return;
    }

    const easeInCubic = (t: number) => t * t * t;
    const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
    const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

    // Cinematic timing: quick burst -> slow-mo (~1s) -> quick finish.
    // These are time-based (ms), so the feel doesn't depend on distance.
    const burst1Ms = 800;
    const slowMoMs = 100;
    const burst2Ms = 100;
    const totalMs = burst1Ms + slowMoMs + burst2Ms;

    const tick = () => {
      const now = performance.now();
      const elapsedMs = now - bulletAnimation.startedAt;
      const localElapsed = clamp(elapsedMs, 0, totalMs);
      const t = clamp(localElapsed / totalMs, 0, 1);

      const positions = animPositionsRef.current;
      const from = positions.find(p => p.playerId === bulletAnimation.fromPlayerId);
      const to = positions.find(p => p.playerId === bulletAnimation.toPlayerId);

      if (!from || !to) {
        setBulletFrame(null);
        return;
      }

      // Map elapsed time -> travel fraction (0..1) with the cinematic beat.
      // Distance splits are chosen to keep the bullet visible during slow-mo.
      const d1 = 0.35;
      const d2 = 0.70;

      let s = 0;
      if (localElapsed <= burst1Ms) {
        const u = clamp(localElapsed / burst1Ms, 0, 1);
        s = d1 * easeOutCubic(u);
      } else if (localElapsed <= burst1Ms + slowMoMs) {
        const u = clamp((localElapsed - burst1Ms) / slowMoMs, 0, 1);
        s = d1 + (d2 - d1) * easeInOutCubic(u);
      } else {
        const u = clamp((localElapsed - burst1Ms - slowMoMs) / burst2Ms, 0, 1);
        s = d2 + (1 - d2) * easeInCubic(u);
      }

      setBulletFrame({
        x: from.x + (to.x - from.x) * s,
        y: from.y + (to.y - from.y) * s,
        elapsedMs: localElapsed,
        totalMs,
      });

      if (t < 1) {
        bulletRafRef.current = requestAnimationFrame(tick);
      } else {
        // Keep the last frame briefly; Game will clear bulletAnimation state.
        bulletRafRef.current = null;
      }
    };

    bulletRafRef.current = requestAnimationFrame(tick);
    return () => {
      if (bulletRafRef.current != null) {
        cancelAnimationFrame(bulletRafRef.current);
        bulletRafRef.current = null;
      }
    };
  }, [
    bulletAnimation?.fromPlayerId,
    bulletAnimation?.toPlayerId,
    bulletAnimation?.startedAt,
    bulletAnimation?.durationMs,
  ]);

  const bulletRecoil = (() => {
    if (!bulletAnimation || !bulletFrame) return null;
    const positions = localPositions && localPositions.length ? localPositions : (room.positions || []);
    const from = positions.find(p => p.playerId === bulletAnimation.fromPlayerId);
    const to = positions.find(p => p.playerId === bulletAnimation.toPlayerId);
    if (!from || !to) return null;
    const rect = containerRef.current?.getBoundingClientRect();
    const w = rect?.width ?? 1;
    const h = rect?.height ?? 1;
    const dxPx = (to.x - from.x) * w;
    const dyPx = (to.y - from.y) * h;
    const len = Math.sqrt(dxPx * dxPx + dyPx * dyPx) || 1;
    return {
      fromId: bulletAnimation.fromPlayerId,
      toId: bulletAnimation.toPlayerId,
      ux: dxPx / len,
      uy: dyPx / len,
      angleDeg: (Math.atan2(dyPx, dxPx) * 180) / Math.PI,
      elapsedMs: bulletFrame.elapsedMs,
      totalMs: bulletFrame.totalMs,
    };
  })();

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragging || !isEditor) return;
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const offset = dragOffsetRef.current || { dxPx: 0, dyPx: 0 };
    const x = (e.clientX - rect.left - offset.dxPx) / rect.width;
    const y = (e.clientY - rect.top - offset.dyPx) / rect.height;

    setLocalPositions(prev => {
      const current = prev.find(p => p.playerId === dragging);
      if (!current) return prev;
      const others = prev.filter(p => p.playerId !== dragging);

      const bounded = clampToBounds({ x, y }, rect, circleSizePx);
      const rawCandidate: PlayerPosition = { ...current, ...bounded };

      const { snapped, lockedAxis } = applyMagnetSnap(rawCandidate, others, rect, circleSizePx);
      const resolved = resolveDraggedNoOverlap(snapped, others, rect, lockedAxis, circleSizePx);

      const minDistPx = circleSizePx;
      const minDistSq = minDistPx * minDistPx;
      for (const o of others) {
        const dxPx = (resolved.x - o.x) * rect.width;
        const dyPx = (resolved.y - o.y) * rect.height;
        if (dxPx * dxPx + dyPx * dyPx < minDistSq - 0.1) return prev;
      }

      return prev.map(p => (p.playerId === dragging ? resolved : p));
    });
  };

  const onPointerUp = () => {
    if (dragging) {
      const quantized = localPositions.map(quantizePos);
      setLocalPositions(quantized);
      socket.emit("updatePositions", { roomId: room.id, positions: quantized });
      setDragging(null);
      dragOffsetRef.current = null;
    }
  };

  const autoArrange = () => {
    if (!isEditor) return;
    if (!containerRef.current) return;

    if (room.autoArrangeUsed) {
      const ok = window.confirm("Bạn chắc chắn muốn tự xếp lại vị trí không?");
      if (!ok) return;
    }

    const rect = containerRef.current.getBoundingClientRect();

    // Build a stable top/wait split based on where players currently are,
    // so "Tự xếp" doesn't reshuffle everyone just because someone left/joined.
    const posById = new Map(localPositions.map(p => [p.playerId, p] as const));
    const idsAll = visiblePlayers.map(p => p.id);
    const allWithPos = idsAll.map(id => ({ id, pos: posById.get(id) }));

    // 19+ players: auto-switch to compact circles (if not already), then apply fixed 19–24 layouts.
    // (Y is computed against the expanded 570px frame.)
    if (idsAll.length > AUTO_TOP_LIMIT) {
      const nextCircleSizePx = SMALL_CIRCLE_SIZE_PX;

      if (!compactCircles) {
        setCompactCircles(true);
        socket.emit("setCompactCircles", { roomId: room.id, compact: true });
      }

      const slotsNorm = getDeterministicSlots19Plus(idsAll.length) || getDeterministicSlots19Plus(24) || [];

      const nextCircleRadiusPx = nextCircleSizePx / 2;
      const joinCenterYpx = FRAME_HEIGHT_PX + EXTRA_FRAME_HEIGHT_PX / 2;
      const joinMarginXpx = nextCircleRadiusPx + CIRCLE_BORDER_PX + AUTO_BOUNDARY_MARGIN_PX;
      const joinMinX = joinMarginXpx;
      const joinMaxX = rect.width - joinMarginXpx;
      const yJoin = clamp(
        joinCenterYpx,
        nextCircleRadiusPx + CIRCLE_BORDER_PX,
        rect.height - (nextCircleRadiusPx + CIRCLE_BORDER_PX)
      );
      const yJoinNorm = yJoin / rect.height;

      const newPos: PlayerPosition[] = [];
      for (let i = 0; i < idsAll.length; i++) {
        const id = idsAll[i]!;
        const slot = slotsNorm[i];
        if (slot) {
          newPos.push(
            clampToBounds(
              quantizePos({ playerId: id, x: slot.x, y: slot.y }),
              rect,
              nextCircleSizePx
            )
          );
        } else {
          // Safety fallback for >20 players: keep extra players in the bottom extension row.
          const extraIndex = i - slotsNorm.length;
          const extraCount = Math.max(1, idsAll.length - slotsNorm.length);
          const xPx = extraCount === 1
            ? rect.width / 2
            : (joinMinX + (joinMaxX - joinMinX) * (extraIndex / (extraCount - 1)));
          newPos.push(
            clampToBounds(
              quantizePos({ playerId: id, x: xPx / rect.width, y: yJoinNorm }),
              rect,
              nextCircleSizePx
            )
          );
        }
      }

      socket.emit("updatePositions", { roomId: room.id, positions: newPos, markAutoArrangeUsed: true });
      return;
    }

    // For 17/18-player layouts, do NOT reserve the bottom waiting row.
    const noWaitingRow = idsAll.length === 17 || idsAll.length === 18;

    // Classify by current Y (top area vs waiting/outside). If a player has no pos yet, treat as outside.
    const topCutYpx = noWaitingRow ? rect.height : (TOP_AREA_HEIGHT_PX + GAP_BETWEEN_AREAS_PX / 2);
    const idsInTop: string[] = [];
    const idsOutside: string[] = [];
    for (const { id, pos } of allWithPos) {
      if (!pos) {
        idsOutside.push(id);
        continue;
      }
      const yPx = pos.y * rect.height;
      if (yPx <= topCutYpx) idsInTop.push(id);
      else idsOutside.push(id);
    }

    const ordered = [...idsInTop, ...idsOutside];
    const idsTop = noWaitingRow ? ordered : ordered.slice(0, AUTO_TOP_LIMIT);
    const n = idsTop.length;

    // Deterministic layouts for 1–18 only (no fallback frame inference).
    const marginYpx = circleRadiusPx + CIRCLE_BORDER_PX + AUTO_BOUNDARY_MARGIN_PX;
    const topSlotsMaxYpx = noWaitingRow
      ? (rect.height - marginYpx)
      : (TOP_AREA_HEIGHT_PX + GAP_BETWEEN_AREAS_PX - marginYpx);

    const yNormToPx = (yNorm: number) => clamp(yNorm * rect.height, marginYpx, topSlotsMaxYpx);
    const slots = getDeterministicSlots1to18(n, rect, yNormToPx);
    if (!slots?.length) return;

    // Incremental fill:
    // - keep players already sitting on a slot (within a small radius)
    // - fill empty slots with outside/waiting players first
    // - only then place remaining players (if any)
    const slotTaken = new Array(slots.length).fill(false);
    const assigned = new Map<string, number>();

    const slotRadiusPx = circleSizePx * 0.75;
    const slotRadiusSq = slotRadiusPx * slotRadiusPx;
    const findNearestSlot = (xPx: number, yPx: number) => {
      let best = -1;
      let bestD = Infinity;
      for (let i = 0; i < slots.length; i++) {
        if (slotTaken[i]) continue;
        const s = slots[i]!;
        const dx = xPx - s.xPx;
        const dy = yPx - s.yPx;
        const d = dx * dx + dy * dy;
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
      return { idx: best, distSq: bestD };
    };

    // 1) Pin existing top occupants to their nearest slots (if close enough)
    for (const id of idsTop) {
      const pos = posById.get(id);
      if (!pos) continue;
      const yPx = pos.y * rect.height;
      if (yPx > topCutYpx) continue;
      const xPx = pos.x * rect.width;
      const { idx, distSq } = findNearestSlot(xPx, yPx);
      if (idx >= 0 && distSq <= slotRadiusSq) {
        assigned.set(id, idx);
        slotTaken[idx] = true;
      }
    }

    // 2) Fill remaining slots prioritizing outside/waiting players, then the rest
    const outsideFirst = idsTop.filter(id => {
      const pos = posById.get(id);
      if (!pos) return true;
      return pos.y * rect.height > topCutYpx;
    });
    const outsideSet = new Set(outsideFirst);
    const insideLeftover = idsTop.filter(id => !outsideSet.has(id));
    const fillOrder = [...outsideFirst, ...insideLeftover];

    for (const id of fillOrder) {
      if (assigned.has(id)) continue;
      const nextSlot = slotTaken.indexOf(false);
      if (nextSlot === -1) break;
      assigned.set(id, nextSlot);
      slotTaken[nextSlot] = true;
    }

    const newPos: PlayerPosition[] = [];
    for (const id of idsTop) {
      const slotIdx = assigned.get(id);
      if (slotIdx == null) continue;
      const s = slots[slotIdx]!;
      const p: PlayerPosition = {
        playerId: id,
        x: s.xPx / rect.width,
        y: s.yPx / rect.height,
      };
      newPos.push(clampToBounds(quantizePos(p), rect, circleSizePx));
    }

    socket.emit("updatePositions", { roomId: room.id, positions: newPos, markAutoArrangeUsed: true });
  };

  const toggleCircleSize = () => {
    const nextCompact = !compactCircles;
    setCompactCircles(nextCompact);

    // Broadcast to everyone in the room.
    socket.emit("setCompactCircles", { roomId: room.id, compact: nextCompact });

    // For 19+ players: when returning to normal size, always reset the first 18 players
    // back to the 18-player layout; any extra players are pushed into the bottom extension row.
    if (!nextCompact && isEditor && visiblePlayers.length > AUTO_TOP_LIMIT && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const nextCircleSizePx = scalePx(DEFAULT_CIRCLE_SIZE_PX, 34);
      const nextCircleRadiusPx = nextCircleSizePx / 2;
      const idsAll = visiblePlayers.map(p => p.id);
      const idsTopFixed = idsAll.slice(0, AUTO_TOP_LIMIT);
      const idsExtra = idsAll.slice(AUTO_TOP_LIMIT);

      // The 18-player layout was originally authored for a 470px frame.
      // When the room has 19+ players, the frame is expanded (typically 570px).
      // To keep the *pixel* rows stable, scale y-norm by (470 / currentHeight).
      const yScale = FRAME_HEIGHT_PX / rect.height;
      const yScaled = (yBaseNorm: number) => yBaseNorm * yScale;

      const slots18: Array<{ x: number; y: number }> = [];
      const xs7 = [0.083, 0.222, 0.361, 0.50, 0.639, 0.778, 0.917];
      for (const x of xs7) slots18.push({ x, y: yScaled(0.16) });
      slots18.push({ x: 0.083, y: yScaled(0.38) });
      slots18.push({ x: 0.917, y: yScaled(0.38) });
      slots18.push({ x: 0.083, y: yScaled(0.60) });
      slots18.push({ x: 0.917, y: yScaled(0.60) });
      for (const x of xs7) slots18.push({ x, y: yScaled(0.82) });

      const updated: PlayerPosition[] = [];

      for (let i = 0; i < idsTopFixed.length; i++) {
        const id = idsTopFixed[i]!;
        const slot = slots18[i];
        if (!slot) continue;
        updated.push(
          clampToBounds(
            quantizePos({ playerId: id, x: slot.x, y: slot.y }),
            rect,
            nextCircleSizePx
          )
        );
      }

      if (idsExtra.length) {
        const joinCenterYpx = FRAME_HEIGHT_PX + EXTRA_FRAME_HEIGHT_PX / 2;
        const joinMarginXpx = nextCircleRadiusPx + CIRCLE_BORDER_PX + AUTO_BOUNDARY_MARGIN_PX;
        const joinMinX = joinMarginXpx;
        const joinMaxX = rect.width - joinMarginXpx;

        const y = clamp(joinCenterYpx, nextCircleRadiusPx + CIRCLE_BORDER_PX, rect.height - (nextCircleRadiusPx + CIRCLE_BORDER_PX));
        const yNorm = y / rect.height;

        for (let i = 0; i < idsExtra.length; i++) {
          const id = idsExtra[i]!;
          const count = idsExtra.length;
          const xPx = count === 1
            ? rect.width / 2
            : (joinMinX + (joinMaxX - joinMinX) * (i / (count - 1)));
          const xNorm = xPx / rect.width;
          updated.push(clampToBounds(quantizePos({ playerId: id, x: xNorm, y: yNorm }), rect, nextCircleSizePx));
        }
      }

      setLocalPositions(updated);
      socket.emit("updatePositions", { roomId: room.id, positions: updated });
    }
  };

  return (
    <div className="player-position-shell">
      <style>{`
        @keyframes witchDangerShake {
          0% { transform: translate(-50%,-50%) translateX(0); }
          20% { transform: translate(-50%,-50%) translateX(-2px); }
          40% { transform: translate(-50%,-50%) translateX(2px); }
          60% { transform: translate(-50%,-50%) translateX(-2px); }
          80% { transform: translate(-50%,-50%) translateX(2px); }
          100% { transform: translate(-50%,-50%) translateX(0); }
        }
        .witch-danger {
          animation: witchDangerShake 500ms infinite;
        }
        @keyframes playerHeartShake {
          0% { transform: translateX(0); }
          20% { transform: translateX(-1px); }
          40% { transform: translateX(1px); }
          60% { transform: translateX(-1px); }
          80% { transform: translateX(1px); }
          100% { transform: translateX(0); }
        }

        /* PREMIUM REVAMP KEYFRAMES */
        @keyframes rotateGlow {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes rotateGlowCounter {
          from { transform: rotate(360deg); }
          to { transform: rotate(0deg); }
        }
        @keyframes breatheSoft {
          0%, 100% { opacity: 0.65; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.03); }
        }
        @keyframes warningPulse {
          0%, 100% { box-shadow: 0 0 10px rgba(220, 38, 38, 0.4), inset 0 0 4px rgba(220, 38, 38, 0.2); border-color: rgba(220, 38, 38, 0.7); }
          50% { box-shadow: 0 0 20px rgba(220, 38, 38, 0.85), inset 0 0 8px rgba(220, 38, 38, 0.45); border-color: rgba(255, 107, 107, 1); }
        }
        @keyframes activeRolePulse {
          0%, 100% { box-shadow: 0 0 12px rgba(255, 215, 0, 0.4), inset 0 0 6px rgba(255, 215, 0, 0.2); }
          50% { box-shadow: 0 0 24px rgba(255, 215, 0, 0.75), inset 0 0 10px rgba(255, 215, 0, 0.4); }
        }
        @keyframes pulseCaution {
          0%, 100% { opacity: 0.9; box-shadow: 0 2px 6px rgba(0,0,0,0.3); }
          50% { opacity: 1; box-shadow: 0 2px 10px rgba(245, 158, 11, 0.35); }
        }

        /* CONCENTRIC HALOS */
        .player-halo {
          position: absolute;
          border-radius: 50%;
          pointer-events: none;
          z-index: -1;
          transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
        }
        .halo-live {
          box-shadow: 0 0 16px rgba(16, 185, 129, 0.75), inset 0 0 6px rgba(16, 185, 129, 0.35);
          /* animation: breatheSoft 1.8s ease-in-out infinite; */
        }
        .halo-die {
          box-shadow: 0 0 16px rgba(239, 68, 68, 0.85), inset 0 0 6px rgba(239, 68, 68, 0.4);
          animation: breatheSoft 2.2s ease-in-out infinite;
        }
        .halo-danger {
          animation: warningPulse 1.2s ease-in-out infinite;
        }
        .halo-spotlight {
          animation: rotateGlow 12s linear infinite;
          box-shadow: 0 0 14px rgba(255, 152, 0, 0.45);
        }
        .halo-secondary {
          animation: rotateGlowCounter 16s linear infinite;
          box-shadow: 0 0 10px rgba(46, 204, 113, 0.25);
        }
        .halo-cursed {
          animation: breatheSoft 2.5s ease-in-out infinite;
        }
        .halo-active-role {
          animation: activeRolePulse 2s ease-in-out infinite;
        }
        .halo-trial-orange {
          animation: rotateGlow 8s linear infinite;
          box-shadow: 0 0 22px rgba(245, 158, 11, 0.75), inset 0 0 10px rgba(245, 158, 11, 0.35);
        }
        .halo-trial-white {
          animation: breatheSoft 2.2s ease-in-out infinite;
          box-shadow: 0 0 14px rgba(241, 245, 249, 0.5);
        }
        .halo-trial-green {
          animation: breatheSoft 2s ease-in-out infinite;
          box-shadow: 0 0 20px rgba(52, 211, 153, 0.65);
        }
        .halo-night-pending {
          animation: rotateGlow 14s linear infinite;
          box-shadow: 0 0 12px rgba(245, 158, 11, 0.35);
        }
        .halo-night-done {
          box-shadow: 0 0 12px rgba(16, 185, 129, 0.45);
        }
        .halo-seer {
          animation: breatheSoft 2s ease-in-out infinite;
          box-shadow: 0 0 16px rgba(255, 255, 255, 0.4);
        }

        /* PREMIUM TOKEN COMPONENT */
        .player-circle-token {
          background: linear-gradient(135deg, rgba(31, 36, 48, 0.94), rgba(23, 26, 33, 0.97));
          box-shadow: 
            inset 0 1px 2px rgba(255, 255, 255, 0.08),
            inset 0 -2px 6px rgba(0, 0, 0, 0.45),
            0 8px 24px rgba(0, 0, 0, 0.35);
          transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
        }
        .player-circle-token:hover {
          transform: translateY(-2px) scale(1.03);
          background: linear-gradient(135deg, rgba(38, 44, 58, 0.96), rgba(28, 32, 41, 0.98));
          box-shadow: 
            inset 0 1px 3px rgba(255, 255, 255, 0.14),
            inset 0 -2px 8px rgba(0, 0, 0, 0.5),
            0 12px 32px rgba(0, 0, 0, 0.45);
        }
      `}</style>
      {isEditor && (
        <div className="player-position-toolbar" style={{ marginBottom: 8, justifyContent: "center" }}>
          <button onClick={() => setSwapSource(prev => prev ? null : "SELECTING")}>
            {swapSource ? "Hủy đổi chỗ" : "Đổi chỗ"}
          </button>
          <button onClick={autoArrange}>Tự xếp</button>
          <button onClick={toggleCircleSize}>
            {compactCircles ? "Kích thước chuẩn" : "Đổi kích thước"}
          </button>
        </div>
      )}
      {isHost && hasDisconnectedPlayers && (
        <div style={{ marginBottom: 8, textAlign: "center" }}>
          <button
            onClick={() => {
              const next = !revealDisconnectedToAll;
              socket.emit("hostRevealDisconnectedBadge", { roomId: room.id, show: next });
              setRevealDisconnectedToAll(next);
            }}
          >
            {revealDisconnectedToAll ? "Ẩn mất kết nối cho mọi người" : "Hiện mất kết nối cho mọi người"}
          </button>
        </div>
      )}
      
      <div
        className="player-position-frame"
        ref={containerRef}
        style={{
          width: "100%",
          height: frameHeightPx,
          background: "var(--player-position-frame-bg, var(--surface-muted))",
          borderRadius: 10,
          position: "relative",
          touchAction: "none",
          overflow: "hidden",
          transform: "translate3d(0, 0, 0)",
          isolation: "isolate",
          transition: "height 200ms ease",
        }}
        onPointerMove={handlePointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
      >
        {bulletAnimation && bulletFrame && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              pointerEvents: "none",
              zIndex: 9,
            }}
          >
            <img
              src={bulletAnimation.assetSrc || encodeURI("/Đạn.svg")}
              alt={bulletAnimation.alt || "Đạn"}
              style={{
                position: "absolute",
                left: `${bulletFrame.x * 100}%`,
                top: `${bulletFrame.y * 100}%`,
                // The SVG's default facing is up-right; +45deg makes it face right.
                transform: `translate(-50%, -50%) rotate(${(bulletRecoil?.angleDeg ?? 0) + (bulletAnimation.rotationOffsetDeg ?? 45)}deg)`,
                transformOrigin: "center",
                width: scalePx(22, 14),
                height: scalePx(22, 14),
              }}
            />
          </div>
        )}
        {localPositions.filter((pos) => pos.playerId !== room.hostId).map((pos) => {
          const p = room.players.find((x) => x.id === pos.playerId);
          if (!p) return null;

          const left = `${pos.x * 100}%`;
          const top = `${pos.y * 100}%`;

          const effectiveVoterIds = wolfVoteVoterIds && wolfVoteVoterIds.length ? wolfVoteVoterIds : undefined;
          const effectiveWolfCount = effectiveVoterIds ? effectiveVoterIds.length : wolfCount;
          const voteCountForThis = (wolfVotes || wolfVotes2)
            ? (effectiveVoterIds
                ? effectiveVoterIds.reduce((total, wid) => {
                    const votedThis = (wolfVotes?.[wid] === pos.playerId) || (wolfVotes2?.[wid] === pos.playerId);
                    if (!votedThis) return total;
                    return total + (voteWeightsByVoterId?.[wid] || 1);
                  }, 0)
                : (() => {
                    const ids = Object.keys({ ...(wolfVotes || {}), ...(wolfVotes2 || {}) });
                    return ids.filter(wid => (wolfVotes?.[wid] === pos.playerId) || (wolfVotes2?.[wid] === pos.playerId)).length;
                  })())
            : 0;
          const isDead = (deadPlayers || []).includes(pos.playerId);
          const isSwapSelected = swapSource === pos.playerId;
          const isReplayActor = !!replayActorIds && replayActorIds.includes(pos.playerId);
          const isReplayTarget = !!replayTargetIds && replayTargetIds.includes(pos.playerId);

          const isSeerResult = !!seerResult && seerResult.playerId === pos.playerId;
          const isWitchDanger =
            (!!dangerPlayerId && dangerPlayerId === pos.playerId) ||
            (!!dangerPlayerIds && dangerPlayerIds.includes(pos.playerId))
            && !verdictDiePlayerIds?.includes(pos.playerId);
          const isHighlighted = !!highlightPlayerId && highlightPlayerId === pos.playerId;
          const isSecondaryHighlighted = !!secondaryHighlightPlayerIds && secondaryHighlightPlayerIds.includes(pos.playerId);
          const isCursedHighlighted = !!cursedHighlightPlayerIds && cursedHighlightPlayerIds.includes(pos.playerId);
          const isVerdictLiveHighlighted = !!verdictLivePlayerIds && verdictLivePlayerIds.includes(pos.playerId);
          const isVerdictDieHighlighted = !!verdictDiePlayerIds && verdictDiePlayerIds.includes(pos.playerId);
          const nightActionProgress = getVisibleNightActionProgress(pos.playerId);

          const showSelectedOutline =
            (!!selectedOutlinePlayerId && selectedOutlinePlayerId === pos.playerId) ||
            (!!selectedOutlinePlayerIds && selectedOutlinePlayerIds.includes(pos.playerId));
          const showWolfBadge = !!showWolfBadges && (wolfBadgePlayerIds || []).includes(p.id);
          const showCheeseBadge = !!cheesePlayerIds && cheesePlayerIds.includes(p.id);
          const wolfBadgeText = showWolfBadge ? (wolfBadgeRoles?.[p.id] || "Sói") : undefined;
          const roleBadgeText = (showRoleBadges && roleBadges) ? roleBadges[p.id] : undefined;
          
          const vfxType = (() => {
            if (!roleBadgeText) return null;
            if (roleBadgeText === "Băng Giá") return "ice";
            if (roleBadgeText === "Sấm Sét") return "thunder";
            if (roleBadgeText === "Lửa") return "fire";
            if (roleBadgeText === "Bóng Tối") return "darkness";
            return null;
          })();

          const isWolfBadgeRole = roleBadgeText === "Sói" || roleBadgeText === "Sói con" || roleBadgeText === "Sói Dại" || roleBadgeText === "Bán sói";
          const isActiveNightRoleBadge = !!activeNightRole && (
            (activeNightRole === "Sói" && isWolfBadgeRole) ||
            (activeNightRole !== "Sói" && roleBadgeText === activeNightRole)
          );
          // Only show disconnected badge to host by default. Host can broadcast visibility to all clients
          const showDisconnectedBadge =
            p.connected === false && (isHost || (revealDisconnectedToAll && !isDead));
          const showInGameBadge = mode === "edit" && p.inGame === true;
          const privateHeartVisible =
            (room.privateHeartVisiblePlayerIds || []).includes(pos.playerId) &&
            (isHost || pos.playerId === clientId);
          const heartVisible = room.sharedHeartsVisible || privateHeartVisible;
          const privatePlayerHp = privateHeartVisible ? room.privatePlayerHearts?.[pos.playerId] : undefined;
          const playerHp =
            privateHeartVisible && typeof privatePlayerHp === "number"
              ? privatePlayerHp
              : heartVisible
                ? room.playerHearts?.[pos.playerId]
                : undefined;
          const showHpBadge = heartVisible && !isDead && typeof playerHp === "number";
          const heartShaking = privateHeartVisible && (room.playerHeartShakeIds || []).includes(pos.playerId);
          const hpSafe = Math.max(0, Math.min(2, playerHp ?? 0));
          const filledHearts = Array.from({ length: hpSafe });
          const emptyHearts = Array.from({ length: 2 - hpSafe });

          const isBulletView = mode === "view" && !!bulletRecoil;

          // Recoil on hunter (kick back) and knockback on target near impact.
          let extraDx = 0;
          let extraDy = 0;
          if (isBulletView && bulletRecoil) {
            const { fromId, toId, ux, uy, elapsedMs, totalMs } = bulletRecoil;

            const pulse = (u: number) => {
              const t = clamp(u, 0, 1);
              return Math.sin(Math.PI * t);
            };

            // Hunter recoil: kick back quickly as bullet fires, then return slowly during slow-mo,
            // then finish returning quickly as bullet speeds up.
            const HUNTER_RECOIL_PX = scaleNum(38, 20);

            const burst1Ms = 800;
            const slowMoMs = 100;
            const burst2Ms = Math.max(1, totalMs - burst1Ms - slowMoMs);

            // Recoil timing: kick back VERY fast (pre slow-mo), hold, then return in slow-mo,
            // then snap back fast in the final burst.
            const hunterKickMs = 55;

            const recoilMag = (() => {
              if (elapsedMs <= 0) return 0;

              // 1) Fast kickback (no slow-mo yet)
              if (elapsedMs <= hunterKickMs) {
                const u = clamp(elapsedMs / hunterKickMs, 0, 1);
                const easeOut = 1 - Math.pow(1 - u, 3);
                return HUNTER_RECOIL_PX * easeOut;
              }

              // 2) Hold the recoil position until slow-mo starts
              if (elapsedMs <= burst1Ms) {
                return HUNTER_RECOIL_PX;
              }

              // 3) Slow return during slow-mo (only part-way)
              const residualFrac = 1.35; // how much recoil remains after slow-mo
              if (elapsedMs <= burst1Ms + slowMoMs) {
                const u = clamp((elapsedMs - burst1Ms) / slowMoMs, 0, 1);
                const eased = 1 - Math.pow(1 - u, 3);
                return HUNTER_RECOIL_PX * (1 - (1 - residualFrac) * eased);
              }

              // 4) Snap back fast in the final burst with a tiny overshoot
              const u = clamp((elapsedMs - burst1Ms - slowMoMs) / burst2Ms, 0, 1);
              const s = 1.15;
              const x = u - 1;
              const easeOutBack = 1 + (s + 1) * x * x * x + s * x * x;
              return HUNTER_RECOIL_PX * residualFrac * (1 - easeOutBack);
            })();

            if (pos.playerId === fromId) {
              extraDx += -ux * recoilMag;
              extraDy += -uy * recoilMag;
            }

            // Target knockback: delay until the *final* burst so it doesn't flinch early.
            const TARGET_KNOCK_PX = scaleNum(14, 8);
            const targetKickWindowMs = Math.min(90, Math.max(40, burst2Ms));
            const impactStart = Math.max(0, totalMs - targetKickWindowMs);
            const knockPulse = pulse((elapsedMs - impactStart) / targetKickWindowMs);

            if (pos.playerId === toId) {
              extraDx += ux * TARGET_KNOCK_PX * knockPulse;
              extraDy += uy * TARGET_KNOCK_PX * knockPulse;
            }
          }

          const circleTransform = `translate(-50%,-50%)${extraDx || extraDy ? ` translate(${extraDx}px, ${extraDy}px)` : ""}`;

          const isSelfGlow = !!showActionGlow && pos.playerId === clientId;

          const innerContent = (
            <>
              {/* Elemental VFX (Ice, Fire, Thunder, Darkness) */}
              {vfxType && <ElementalVFX type={vfxType} />}

              {/* Concentric Halo Rings */}
              {isSeerResult && (
                <div className="player-halo halo-seer" style={{ inset: -scalePx(6, 4), border: `${scalePx(2, 1)}px solid ${seerResult!.isWolf ? "#ef4444" : "#f1f5f9"}` }} />
              )}
              {isVerdictLiveHighlighted && (
                <div className="player-halo halo-live" style={{ inset: -scalePx(6, 4), border: `${scalePx(2, 1)}px solid #10b981` }} />
              )}
              {isVerdictDieHighlighted && (
                <div className="player-halo halo-die" style={{ inset: -scalePx(6, 4), border: `${scalePx(2, 1)}px solid #ef4444` }} />
              )}
              {isWitchDanger && (
                <div className="player-halo halo-danger" style={{ inset: -scalePx(6, 4), border: `${scalePx(2.5, 1.5)}px solid #dc2626` }} />
              )}
              {isCursedHighlighted && (
                <div className="player-halo halo-cursed" style={{ inset: -scalePx(6, 4), border: `${scalePx(2, 1)}px solid ${cursedHighlightIsDanger ? "#dc2626" : "#e2e8f0"}` }} />
              )}
              {nightActionProgress === "pending" && (
                <div className="player-halo halo-night-pending" style={{ inset: -scalePx(6, 4), border: `${scalePx(2, 1)}px dashed #f59e0b` }} />
              )}
              {nightActionProgress === "done" && (
                <div className="player-halo halo-night-done" style={{ inset: -scalePx(6, 4), border: `${scalePx(2, 1)}px solid #10b981` }} />
              )}
              {(dietQuyOrangeHighlightPlayerIds || []).includes(pos.playerId) && (
                <div className="player-halo halo-dietquy-orange" style={{ inset: -scalePx(6, 4), border: `${scalePx(2, 1)}px solid #ff9800`, boxShadow: "0 0 8px #ff9800" }} />
              )}
              {(dietQuyRedHighlightPlayerIds || []).includes(pos.playerId) && (
                <div className="player-halo halo-dietquy-red" style={{ inset: -scalePx(6, 4), border: `${scalePx(2, 1)}px solid #ef4444`, boxShadow: "0 0 8px #ef4444" }} />
              )}

              {/* Mid Concentric Rings */}
              {isSecondaryHighlighted && (
                <div className="player-halo halo-secondary" /* style={{ inset: -scalePx(8, 5), border: `${scalePx(2, 1)}px dotted rgba(46, 204, 113, 0.7)` }} */ />
              )}
              {(trialWhitePlayerIds || []).includes(pos.playerId) && (
                <div className="player-halo halo-trial-white" style={{ inset: -scalePx(10, 6), border: `${scalePx(2, 1)}px solid #f1f5f9` }} />
              )}

              {/* Outer Concentric Rings */}
              {isHighlighted && (
                <div className="player-halo halo-spotlight" style={{ inset: -scalePx(10, 6), border: `${scalePx(2, 1)}px solid #ff9800` }} />
              )}
              {isActiveNightRoleBadge && (
                <div className="player-halo halo-active-role" style={{ inset: -scalePx(10, 6), border: `${scalePx(2.5, 1.5)}px solid #ffd700` }} />
              )}
              {trialOrangePlayerId === pos.playerId && (
                <Orb hue={160} />
              )}
              {trialGreenPlayerId === pos.playerId && (
                <div className="player-halo halo-trial-green" style={{ inset: -scalePx(12, 8), border: `${scalePx(2.5, 2)}px solid #34d399` }} />
              )}

              {/* Badges and Indicators */}
              {showWolfVoteBadges && effectiveWolfCount >= 2 && voteCountForThis > 0 && (
                <div style={{
                  position: "absolute",
                  top: -badgeOffsetPx,
                  right: -badgeOffsetPx,
                  background: "linear-gradient(135deg, #ef5350, #c62828)",
                  color: "#fff",
                  borderRadius: badgeOffsetPx,
                  padding: badgePadding,
                  fontSize: badgeFontSizePx,
                  fontWeight: "bold",
                  zIndex: 2,
                  boxShadow: "0 2px 6px rgba(198, 40, 40, 0.4), inset 0 1px 1px rgba(255, 255, 255, 0.2)",
                  border: "1px solid rgba(255, 255, 255, 0.15)",
                }}>
                  {voteCountForThis}/{effectiveWolfCount}
                </div>
              )}
              {nightActionProgress === "pending" && (
                <div
                  style={{
                    position: "absolute",
                    top: -badgeOffsetPx,
                    left: "50%",
                    transform: "translateX(-50%)",
                    fontSize: scalePx(16, 11),
                    lineHeight: 1,
                    filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.55))",
                  }}
                >
                  ⌛
                </div>
              )}

              {showWolfBadge && (
                <div style={{
                  position: "absolute",
                  top: -badgeOffsetPx,
                  left: -badgeOffsetPx,
                  background: "linear-gradient(135deg, #422213, #2d1307)",
                  color: "#ff6b6b",
                  padding: badgePadding,
                  borderRadius: scalePx(6, 3),
                  fontSize: badgeFontSizePx,
                  fontWeight: "bold",
                  border: "1px solid rgba(239, 68, 68, 0.35)",
                  boxShadow: "0 2px 6px rgba(0,0,0,0.45), inset 0 1px 1px rgba(255,255,255,0.15)",
                  display: "flex",
                  alignItems: "center",
                  gap: scalePx(3, 2),
                }}>
                  🐺 {wolfBadgeText || "Sói"}
                </div>
              )}

              {showCheeseBadge && (
                <div style={{
                  position: "absolute",
                  top: -badgeOffsetPx,
                  left: "50%",
                  transform: "translateX(-50%)",
                  fontSize: scalePx(18, 12),
                  lineHeight: 1,
                  filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.65))",
                }}>
                  🧀
                </div>
              )}

              {roleBadgeText && (
                <div style={{
                  position: "absolute",
                  bottom: -badgeOffsetPx,
                  left: "50%",
                  transform: "translateX(-50%)",
                  padding: badgePadding,
                  borderRadius: scalePx(6, 3),
                  fontSize: badgeFontSizePx,
                  fontWeight: "bold",
                  width: "max-content",
                  zIndex: 2,
                  ...getRoleBadgeStyle(roleBadgeText),
                }}>
                  {roleBadgeText}
                </div>
              )}

              {showDisconnectedBadge && (
                <div style={{
                  position: "absolute",
                  bottom: roleBadgeText ? -(badgeOffsetPx + scalePx(24, 12)) : -badgeOffsetPx,
                  left: "50%",
                  transform: "translateX(-50%)",
                  background: "linear-gradient(135deg, #475569, #334155)",
                  color: "#cbd5e1",
                  padding: badgePadding,
                  borderRadius: scalePx(6, 3),
                  fontSize: badgeFontSizePx,
                  fontWeight: "bold",
                  width: "max-content",
                  border: "1px solid rgba(245, 158, 11, 0.4)",
                  boxShadow: "0 2px 6px rgba(0,0,0,0.3)",
                  animation: "pulseCaution 2s ease-in-out infinite",
                  zIndex: 3,
                }}>
                  🔌 Mất kết nối
                </div>
              )}

              {showInGameBadge && (
                <div style={{
                  position: "absolute",
                  top: -badgeOffsetPx,
                  left: "50%",
                  transform: "translateX(-50%)",
                  background: "linear-gradient(135deg, #1e3a8a, #0f172a)",
                  color: "#93c5fd",
                  padding: badgePadding,
                  borderRadius: scalePx(6, 3),
                  fontSize: badgeFontSizePx,
                  fontWeight: "bold",
                  width: "max-content",
                  border: "1px solid rgba(59, 130, 246, 0.4)",
                  boxShadow: "0 2px 6px rgba(59, 130, 246, 0.2)",
                  zIndex: 2,
                }}>
                  🎮 Trong trận
                </div>
              )}

              {showHpBadge && (
                <div style={{
                  position: "absolute",
                  top: -hpBadgeTopPx,
                  right: -scalePx(6, 3),
                  background: "rgba(15, 17, 21, 0.85)",
                  backdropFilter: "blur(4px)",
                  border: "1px solid rgba(255, 255, 255, 0.08)",
                  padding: hpBadgePadding,
                  borderRadius: 999,
                  fontSize: hpBadgeFontSizePx,
                  fontWeight: "bold",
                  letterSpacing: scaleNum(0.5, 0.25),
                  boxShadow: "0 4px 12px rgba(0, 0, 0, 0.45)",
                  zIndex: 2,
                }}>
                  {filledHearts.map((_, idx) => (
                    <span
                      key={`filled-${idx}`}
                      style={{
                        display: "inline-block",
                        animation: heartShaking ? "playerHeartShake 850ms ease-in-out infinite" : undefined,
                        color: "#ef4444",
                        textShadow: "0 0 6px rgba(239, 68, 68, 0.6)",
                      }}
                    >
                      ♥️
                    </span>
                  ))}
                  {emptyHearts.map((_, idx) => (
                    <span key={`empty-${idx}`} style={{ opacity: 0.35, color: "#94a3b8" }}>♡</span>
                  ))}
                </div>
              )}

              <div style={{ textAlign: "center", pointerEvents: "none", zIndex: 1 }}>
                <div style={{
                  fontWeight: 600,
                  textDecoration: isDead ? "line-through" : undefined,
                  textDecorationColor: isDead ? "rgba(239, 68, 68, 0.5)" : undefined,
                  opacity: isDead ? 0.45 : 1,
                  color: isDead ? "#94a3b8" : "#f8fafc",
                  fontFamily: "'Inter', system-ui, sans-serif",
                  letterSpacing: "-0.01em",
                }}>{p.name}</div>
                <div style={{ opacity: isDead ? 0.3 : 0.5, fontSize: playerSubFontSizePx }}>
                  {p.id === clientId ? "(Bạn)" : ""}
                </div>
              </div>
            </>
          );

          const tokenProps = {
            key: pos.playerId,
            onPointerDown: (e: React.PointerEvent) => {
              lastPointerTypeRef.current = e.pointerType || null;
              if (!isEditor) return;
              if (swapSource === "SELECTING") {
                setSwapSource(pos.playerId);
              } else if (swapSource) {
                onPointerDown(e, pos.playerId); // Trigger swap logic
              } else {
                onPointerDown(e, pos.playerId); // Trigger drag
              }
            },
            onClick: () => {
              if (dragging) return;
              const isTouchTap = lastPointerTypeRef.current === "touch";
              if (isTouchTap && onPlayerDoubleClick) {
                const now = Date.now();
                const lastTap = lastTapRef.current;
                if (lastTap && lastTap.playerId === p.id && now - lastTap.at <= 360) {
                  onPlayerDoubleClick(p.id);
                  lastTapRef.current = null;
                } else {
                  lastTapRef.current = { playerId: p.id, at: now };
                }
              }
              onPlayerClick(p.id);
            },
            onDoubleClick: () => {
              if (!dragging) onPlayerDoubleClick?.(p.id);
            },
            className: `player-circle-token ${isDead ? "is-dead" : ""} ${isSwapSelected ? "is-swap-selected" : ""} ${isWitchDanger && !isVerdictDieHighlighted ? "witch-danger" : ""}`,
            style: {
              position: "absolute" as const,
              left,
              top,
              transform: circleTransform,
              width: circleSizePx,
              height: circleSizePx,
              borderRadius: circleRadiusPx,
              border: isReplayTarget 
                ? "3px solid rgb(245, 158, 11)" 
                : isReplayActor 
                  ? "2px solid rgb(16, 185, 129)" 
                  : isSwapSelected 
                    ? `${selectedBorderPx}px solid #2196F3` 
                    : isDead 
                      ? `${circleBorderPx}px solid rgba(239, 68, 68, 0.35)` 
                      : `${circleBorderPx}px solid rgba(255, 255, 255, 0.08)`,
              boxShadow: isReplayTarget
                ? "0 0 22px rgba(245, 158, 11, 0.75), inset 0 0 10px rgba(245, 158, 11, 0.35)"
                : isReplayActor
                  ? "0 0 12px rgba(16, 185, 129, 0.45)"
                  : undefined,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: playerFontSizePx,
              cursor: isEditor ? (swapSource ? "crosshair" : "grab") : "pointer",
              zIndex: dragging === pos.playerId ? 10 : 1,
              outline: showSelectedOutline ? `${selectedBorderPx}px solid rgba(255,165,0,0.9)` : undefined,
              transition: dragging === pos.playerId
                ? "none"
                : "left 0.2s, top 0.2s, width 220ms ease, height 220ms ease, border-radius 220ms ease, box-shadow 300ms ease, transform 0.2s ease", // Smooth move + resize + glow
            }
          };

          if (isSelfGlow) {
            return (
              <BorderGlow
                {...tokenProps}
                animated={true}
                borderRadius={circleRadiusPx}
                glowRadius={circleSizePx / 2 + 10}
                glowColor="168 85 247"
                colors={['#c084fc', '#f472b6', '#38bdf8']}
                backgroundColor="rgba(23, 26, 33, 0.97)"
              >
                {innerContent}
              </BorderGlow>
            );
          }

          return (
            <div {...tokenProps}>
              {innerContent}
            </div>
          );
        })}
      </div>
    </div>
  );
}
