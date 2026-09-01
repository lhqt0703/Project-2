import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { gsap } from "gsap";
import Physics2DPlugin from "../libs/Physics2DPlugin";
import { socket, clientId } from "../socket";
import { useRoomContext } from "../context/RoomContext";
import { getDeterministicSlots1to18, getDeterministicSlots19Plus } from "./layouts";
import ElementalVFX from "./ElementalVFX";
import Orb from "./Orb";
import { AvifIcon } from "./AvifIcon";
import ConfirmModal from "./ConfirmModal";
import PlayerNameVaporize from "./PlayerNameVaporize";

import PlayerShotEffect from "./PlayerShotEffect";
import SplashCursor from "./SplashCursor";
import heartIcon from "../assets/icon/tim.avif";

import nenLungAsset from "../assets/nền lưng.avif";
import boardSvg from "../assets/board.svg";
import avaPhucMasked from "../assets/Ava/046fa88a-a719-47c3-8b97-ddfc8337cf83 M-1.avif";
import avaDinMasked from "../assets/Ava/f7d9652f-ac74-4557-81a2-7c2731a77d37 M-1.avif";
import avaHaVietMasked from "../assets/Ava/397d9740-e21b-4ade-941f-25912aefd591 M-1.avif";
import avaSanMasked from "../assets/Ava/d64474be-88b2-4f67-bf0d-310c3c9de7f5 M-1.avif";
import avaCuongMasked from "../assets/Ava/8dfc1d63-988f-460d-8569-8a1964be99a0 M-1.avif";
import avaVietThangMasked from "../assets/Ava/ec0c6c66-9ce7-4d86-ac12-25824af15b79 M-1.avif";
import avaDuyMasked from "../assets/Ava/9bc9009c-13b3-4ba6-bbdd-a7189b477ccd M-1.avif";

export const AVA_IMAGES = import.meta.glob<string>("../assets/Ava/*", {
  eager: true,
  import: "default",
});

export function getAvatarUrlByFileName(fileName: string | undefined): string | null {
  if (!fileName) return null;
  const cleanName = fileName.trim();
  const entry = Object.entries(AVA_IMAGES).find(([path]) => path.endsWith(cleanName));
  return entry ? entry[1] : null;
}


export const MASKED_AVATAR_MAP: Record<string, string> = {
  "046fa88a-a719-47c3-8b97-ddfc8337cf83": avaPhucMasked,
  "f7d9652f-ac74-4557-81a2-7c2731a77d37": avaDinMasked,
  "397d9740-e21b-4ade-941f-25912aefd591": avaHaVietMasked,
  "d64474be-88b2-4f67-bf0d-310c3c9de7f5": avaSanMasked,
  "8dfc1d63-988f-460d-8569-8a1964be99a0": avaCuongMasked,
  "ec0c6c66-9ce7-4d86-ac12-25824af15b79": avaVietThangMasked,
  "9bc9009c-13b3-4ba6-bbdd-a7189b477ccd": avaDuyMasked
};

const triggerHeartExplosion = (x: number, y: number, containerEl: HTMLDivElement | null, count: number) => {
  if (!containerEl || count <= 0) return;

  let confettiContainer = document.getElementById("cupid-confetti-viewport-container");
  if (!confettiContainer) {
    confettiContainer = document.createElement("div");
    confettiContainer.id = "cupid-confetti-viewport-container";
    Object.assign(confettiContainer.style, {
      position: "fixed",
      top: "0",
      left: "0",
      width: "100vw",
      height: "100dvh",
      pointerEvents: "none",
      overflow: "hidden",
      zIndex: "99999",
    });
    document.body.appendChild(confettiContainer);
  }

  const rect = containerEl.getBoundingClientRect();
  const targetX = rect.left + x * rect.width;
  const targetY = rect.top + y * rect.height;

  const gravity = 2200;

  for (let i = 0; i < count; i++) {
    const img = document.createElement("img");
    img.src = heartIcon;
    img.style.position = "absolute";
    img.style.pointerEvents = "none";
    img.style.left = `${targetX}px`;
    img.style.top = `${targetY}px`;
    img.style.width = "14px";
    img.style.height = "auto";
    img.style.zIndex = "99999";
    img.style.transform = "translate(-50%, -50%)";

    confettiContainer.appendChild(img);

    const angle = Math.random() * Math.PI * 2 * (180 / Math.PI);
    const velocity = gsap.utils.random(200, 600);
    const duration = 1.0 + Math.random() * 0.6;

    gsap.to(img, {
      physics2D: {
        angle: angle,
        velocity: velocity,
        gravity: gravity,
      },
      rotation: gsap.utils.random(-180, 180),
      duration: duration,
      ease: "power1.out",
    });

    gsap.to(img, {
      opacity: 0,
      duration: 0.3,
      delay: duration - 0.3,
      ease: "power1.out",
      onComplete: () => {
        img.remove();
      },
    });
  }
};

export interface PlayerPosition {
  playerId: string;
  x: number;
  y: number;
}

interface RoomLike {
  id: string;
  hostId: string;
  players: Array<{ id: string; name: string; connected?: boolean; playerRealName?: string; playerAvatar?: string }>;
  positions?: PlayerPosition[];
  positionEditors?: string[];
  autoArrangeUsed?: boolean;
  compactCircles?: boolean;
  phase?: string;
  gameOver?: boolean;
  gameMode?: string;
  deadPlayers?: string[];
  warnedPlayerIds?: string[];
  trialStage?: "none" | "defense" | "verdict";
  trialTargetId?: string | null;
  trialVotes?: Record<string, "live" | "die" | "abstain" | null>;
  dayLocked?: Record<string, boolean>;
  dayVotes?: Record<string, string | null>;
  dayDeadline?: number | null;
  wolfVotes?: Record<string, string | null>;
  wolfVotes2?: Record<string, string | null>;
  nightActionProgressByPlayerId?: Record<string, "pending" | "done">;
  nightTurnDeadline?: number | null;
  nightActionExtraTimeMsByPlayerId?: Record<string, number>;
  gameRules?: {
    allNightActionsSimultaneous?: boolean;
    nonWolfNightActionDurationSec?: number;
    wolfNightActionDurationSec?: number;
    witchBonusTimeRequiresUsablePotion?: boolean;
    twoHeartsFirstTwoNights?: boolean;
  };
  playerRoles?: Record<string, string>;
  soiMuState?: {
    namThuTargetId?: string | null;
    suyThanTargetId?: string | null;
  };
  daNghichState?: {
    sharedHeartsVisible?: boolean;
    playerHearts?: Record<string, number>;
    privatePlayerHearts?: Record<string, number>;
    privateHeartVisiblePlayerIds?: string[];
    playerHeartShakeIds?: string[];
    villageChiefDyingFramePlayerIds?: string[];
    wolfVotes?: Record<string, string | null>;
    wolfVotes2?: Record<string, string | null>;
    wolfDeadline?: number | null;
    spiritWolfDecisionDeadline?: number | null;
    wolves?: string[];
  };
  publicRevealedRolesByPlayerId?: Record<string, string>;
  pendingRoleAssignments?: Record<string, string>;
  pendingRoleBlocks?: Record<string, string[]>;
  roles?: string[];
}

type BulletAnimation = {
  fromPlayerId: string;
  toPlayerId: string;
  startedAt: number;
  durationMs: number;
  assetSrc?: string;
  alt?: string;
  rotationOffsetDeg?: number;
  kind?: "hunter" | "love";
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

const STYLE_CHUA_THA_HOA: React.CSSProperties = {
  background: "linear-gradient(135deg, rgba(28, 18, 45, 0.95), rgba(15, 8, 25, 0.98)) padding-box padding-box, linear-gradient(135deg, rgb(247 85 85 / 60%), rgb(40 94 217 / 30%)) border-box border-box",
  border: "1px solid transparent",
  color: "rgb(226, 232, 240)",
  boxShadow: "0px 3px 8px rgba(85, 134, 247, 0.25)",
  transition: "background 0.5s ease-in-out, box-shadow 0.5s ease-in-out, color 0.5s ease-in-out, border-color 0.5s ease-in-out",
};

const STYLE_DA_THA_HOA: React.CSSProperties = {
  background: "linear-gradient(135deg, rgba(28, 18, 45, 0.95), rgba(15, 8, 25, 0.98)) padding-box padding-box, linear-gradient(135deg, rgb(85 131 247 / 60%), rgb(217 40 40 / 30%)) border-box border-box",
  border: "1px solid transparent",
  color: "rgb(226, 232, 240)",
  boxShadow: "0px 3px 8px rgba(247, 85, 85, 0.25)",
  transition: "background 0.5s ease-in-out, box-shadow 0.5s ease-in-out, color 0.5s ease-in-out, border-color 0.5s ease-in-out",
};

const NEUTRAL_ROLES = ["Linh sói", "Thiên Sứ", "Bán sói", "Song Trùng", "Tay Buôn", "Ariana", "Thần tình yêu"];

const isNeutralRole = (r: string) => {
  if (!r) return false;
  const norm = r.trim().toLowerCase();
  return NEUTRAL_ROLES.some(n => n.toLowerCase() === norm);
};

const isRoleWolfCorrupted = (
  role: string,
  playerId?: string,
  room?: any,
  loveState?: any,
  revealedRoles?: any
): boolean => {
  if (!playerId) return false;
  const r = role.trim();

  // 1. Linh Sói
  if (r === "Linh sói") {
    return room?.daNghichState?.spiritWolfWolfAligned === true || room?.daNghichState?.spiritWolfWolfAlignedPending === true;
  }

  // 2. Thiên Sứ
  if (r === "Thiên Sứ" || r.toLowerCase() === "thiên sứ" || r.toLowerCase() === "angel") {
    const angelRecord = room?.angelReviveRecordsByAngelId?.[playerId];
    const guess = typeof angelRecord === "object" ? angelRecord?.guess : angelRecord;
    return guess === "wolves";
  }

  // 3. Bán sói
  if (r === "Bán sói") {
    return room?.daNghichState?.banSoiWolfAligned === true;
  }

  // 4. Song Trùng
  if (r === "Song Trùng") {
    const stolenRole = room?.playerRoles?.[playerId] || revealedRoles?.[playerId];
    if (!stolenRole || stolenRole === "Song Trùng") return false;
    const isWolfRole = ["Sói", "Sói con", "Sói Dại", "Bán sói", "Linh sói"].includes(stolenRole);
    return isWolfRole || (room?.daNghichState?.wolves || []).includes(playerId);
  }

  // 5. Tay Buôn
  if (r === "Tay Buôn" || r === "Ariana" || r.toLowerCase() === "tay buôn") {
    const wolfTrades = room?.merchantWolfTradeCountsByPlayerId?.[playerId] || 0;
    const villagerTrades = room?.merchantVillagerTradeCountsByPlayerId?.[playerId] || 0;
    return wolfTrades > villagerTrades;
  }

  // 6. Thần tình yêu
  if (r === "Thần tình yêu") {
    const cupidTargetId = room?.loveTargetId || loveState?.targetId;
    if (!cupidTargetId) return false;
    const targetRole = room?.playerRoles?.[cupidTargetId] || revealedRoles?.[cupidTargetId];
    const isTargetWolfRole = ["Sói", "Sói con", "Sói Dại", "Bán sói", "Linh sói"].includes(targetRole || "");
    const isTargetInWolves = (room?.daNghichState?.wolves || []).includes(cupidTargetId);
    const isTargetBanSoiWolf = targetRole === "Bán sói" && room?.daNghichState?.banSoiWolfAligned === true;
    const isTargetLinhSoiWolf = targetRole === "Linh sói" && (room?.daNghichState?.spiritWolfWolfAligned === true || room?.daNghichState?.spiritWolfWolfAlignedPending === true);
    const isTargetConverted = !!(room?.rolesBeforeConversion?.[cupidTargetId]);
    return isTargetWolfRole || isTargetInWolves || isTargetBanSoiWolf || isTargetLinhSoiWolf || isTargetConverted;
  }

  return false;
};

const getRoleBadgeStyle = (
  role: string,
  targetPlayerId?: string,
  isHost: boolean = false,
  room?: any,
  loveState?: any,
  revealedRoles?: any,
  clientId?: string
): React.CSSProperties => {
  const normRole = role ? role.trim() : "";
  const isCupid = normRole === "Thần tình yêu";
  const isPureWolf = ["Sói", "Sói con", "Sói Dại"].includes(normRole);
  const isGameOver = room?.gameOver === true;

  // Check Cupid special visibility during active game (!isGameOver)
  const isViewerCupidOrPartner = !isGameOver && clientId && isCupid && targetPlayerId && (
    targetPlayerId === clientId || (loveState?.pairIds || []).includes(targetPlayerId)
  );

  // If Cupid looking at Cupid's own role (or Cupid's partner looking at Cupid's role) during game, show Pink Cupid style
  if (isCupid && isViewerCupidOrPartner && !isHost) {
    return {
      background: "linear-gradient(135deg, rgba(74, 20, 45, 0.95), rgba(40, 10, 25, 0.98)) padding-box, linear-gradient(135deg, rgba(244, 114, 182, 0.6), rgba(219, 39, 119, 0.3)) border-box",
      border: "1px solid transparent",
      color: "#f472b6",
      boxShadow: "0 3px 8px rgba(244, 114, 182, 0.25)",
      transition: "background 0.5s ease-in-out, box-shadow 0.5s ease-in-out, color 0.5s ease-in-out, border-color 0.5s ease-in-out",
    };
  }

  // Check if neutral role should use ChưaThaHoá / ĐãThaHoá style
  // Applied to: Host (always), Everyone at GameOver, or Cupid viewing paired partner's badge
  const myRole = room?.playerRoles?.[clientId || ""] || loveState?.rolesByPlayerId?.[clientId || ""];
  const isViewerCupidViewingPartner = clientId && targetPlayerId && (
    (myRole === "Thần tình yêu" || loveState?.cupidId === clientId) &&
    (loveState?.partnerId === targetPlayerId || (loveState?.pairIds || []).includes(targetPlayerId))
  );

  if (isNeutralRole(normRole) && (isHost || isGameOver || isViewerCupidViewingPartner)) {
    const isCorrupted = isRoleWolfCorrupted(normRole, targetPlayerId, room, loveState, revealedRoles);
    return isCorrupted ? STYLE_DA_THA_HOA : STYLE_CHUA_THA_HOA;
  }

  // Pure wolf style
  if (isPureWolf) {
    return {
      background: "linear-gradient(135deg, rgba(45, 18, 18, 0.95), rgba(20, 10, 10, 0.98)) padding-box, linear-gradient(135deg, rgba(239, 68, 68, 0.6), rgba(153, 27, 27, 0.3)) border-box",
      border: "1px solid transparent",
      color: "#ff6b6b",
      boxShadow: "0 3px 8px rgba(239, 68, 68, 0.25)",
      transition: "background 0.5s ease-in-out, box-shadow 0.5s ease-in-out, color 0.5s ease-in-out, border-color 0.5s ease-in-out",
    };
  }

  // Default villager / other role style
  return {
    background: "linear-gradient(135deg, rgba(30, 41, 59, 0.9), rgba(15, 23, 42, 0.95)) padding-box, linear-gradient(135deg, rgba(255, 255, 255, 0.15), rgba(255, 255, 255, 0.05)) border-box",
    border: "1px solid transparent",
    color: "#e2e8f0",
    boxShadow: "0 3px 8px rgba(0, 0, 0, 0.4)",
    transition: "background 0.5s ease-in-out, box-shadow 0.5s ease-in-out, color 0.5s ease-in-out, border-color 0.5s ease-in-out",
  };
};

interface PlayerWoodBoardProps {
  visible: boolean;
  iconName: string;
  textLines: string[];
  style?: React.CSSProperties;
}

function PlayerWoodBoard({
  visible,
  iconName,
  textLines,
  style,
}: PlayerWoodBoardProps) {
  const [showText, setShowText] = useState(false);

  const handleBoardClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (showText) return;
    setShowText(true);
    setTimeout(() => {
      setShowText(false);
    }, 2000);
  };

  return (
    <div
      onClick={handleBoardClick}
      onPointerDown={(e) => e.stopPropagation()}
      style={{
        position: "absolute",
        top: "-1.2rem",
        right: "-0.1rem",
        width: "1.8rem",
        height: "1.8rem",
        cursor: "pointer",
        rotate: "34deg",
        zIndex: -1,
        opacity: visible ? 1 : 0,
        transform: visible ? "scale(1)" : "scale(0)",
        pointerEvents: visible ? "auto" : "none",
        transformOrigin: "bottom center",
        transition: "opacity 0.35s ease, transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1), top 0.35s ease, right 0.35s ease, rotate 0.35s ease",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        ...style,
      }}
    >
      <img
        src={boardSvg}
        alt="Board"
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          position: "relative",
          top: "-15%",
          zIndex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <span
          style={{
            position: "absolute",
            width: "14px",
            height: "14px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transition: "opacity 0.2s ease",
            opacity: showText ? 0 : 1,
            pointerEvents: "none",
          }}
        >
          <AvifIcon name={iconName} style={{ width: "100%", height: "100%" }} />
        </span>
        <span
          style={{
            position: "absolute",
            fontSize: "5.5px",
            fontWeight: "bold",
            color: "#451a03",
            textAlign: "center",
            lineHeight: 1,
            transition: "opacity 0.2s ease",
            opacity: showText ? 1 : 0,
            pointerEvents: "none",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            width: "max-content",
          }}
        >
          {textLines.map((line, idx) => (
            <span key={idx}>{line}</span>
          ))}
        </span>
      </div>
    </div>
  );
}

function BlankVoteBoard({ visible, style }: { visible: boolean; style?: React.CSSProperties }) {
  return (
    <PlayerWoodBoard
      visible={visible}
      iconName="⭕"
      textLines={["Phiếu", "trống"]}
      style={style}
    />
  );
}

function TrialVotedBoard({ visible, style }: { visible: boolean; style?: React.CSSProperties }) {
  return (
    <PlayerWoodBoard
      visible={visible}
      iconName="🗳️"
      textLines={["Đã", "chốt"]}
      style={style}
    />
  );
}

function DisconnectedBoard({ visible, style }: { visible: boolean; style?: React.CSSProperties }) {
  return (
    <PlayerWoodBoard
      visible={visible}
      iconName="⛓️💥"
      textLines={["Mất", "kết nối"]}
      style={style}
    />
  );
}

function WarningBoard({ visible, style }: { visible: boolean; style?: React.CSSProperties }) {
  return (
    <PlayerWoodBoard
      visible={visible}
      iconName="⚠️"
      textLines={["Cảnh", "cáo"]}
      style={style}
    />
  );
}

function NamThuBoard({ visible, style }: { visible: boolean; style?: React.CSSProperties }) {
  return (
    <PlayerWoodBoard
      visible={visible}
      iconName="👄"
      textLines={["Cấm", "cười"]}
      style={style}
    />
  );
}

function SuyThanBoard({ visible, style }: { visible: boolean; style?: React.CSSProperties }) {
  return (
    <PlayerWoodBoard
      visible={visible}
      iconName="💦"
      textLines={["Cấm", "đái"]}
      style={style}
    />
  );
}


interface PlayerMessageBubbleProps {
  playerId: string;
  message: { id: string; text: string; channel: "wolf" | "lovers"; createdAt: number };
  circleSizePx: number;
  onDismiss: () => void;
  visible?: boolean;
  x: number;
  y: number;
}

const PlayerMessageBubble: React.FC<PlayerMessageBubbleProps> = ({
  message,
  circleSizePx,
  onDismiss,
  visible = true,
  x,
  y
}) => {
  const [isSelfVisible, setIsSelfVisible] = useState(true);
  const bubbleRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const lifespanMs = 8000;
    const elapsed = Date.now() - message.createdAt;
    const remainingTime = Math.max(0, lifespanMs - elapsed);

    const timer = setTimeout(() => {
      handleDismiss();
    }, remainingTime);

    return () => clearTimeout(timer);
  }, [message]);

  const handleDismiss = () => {
    if (!isSelfVisible) return;
    setIsSelfVisible(false);
    if (bubbleRef.current) {
      gsap.to(bubbleRef.current, {
        opacity: 0,
        scale: 0.8,
        y: -10,
        duration: 0.25,
        ease: "power2.out",
        onComplete: onDismiss
      });
    } else {
      onDismiss();
    }
  };

  const isWolf = message.channel === "wolf";
  const bgGradient = isWolf
    ? "linear-gradient(135deg, #8C5A3C, #5C3A24)"
    : "linear-gradient(135deg, #ff6a6a, #f72257)";
  const borderCol = isWolf ? "#A76F53" : "#f96b84";
  const shadowCol = isWolf ? "rgba(140, 90, 60, 0.4)" : "rgba(247, 34, 87, 0.4)";

  return (
    <div
      ref={bubbleRef}
      onClick={(e) => {
        e.stopPropagation();
        handleDismiss();
      }}
      style={{
        position: "absolute",
        left: `${x * 100}%`,
        top: `${y * 100}%`,
        transform: `translate(-50%, -100%) translateY(-${circleSizePx / 2 + 8}px)`,
        width: "max-content",
        maxWidth: `${circleSizePx * 2.5}px`,
        background: bgGradient,
        border: `1px solid ${borderCol}`,
        borderRadius: "12px",
        padding: "8px 12px",
        color: "#fff",
        fontSize: "13px",
        fontWeight: "500",
        lineHeight: "1.4",
        textAlign: "center",
        boxShadow: `0 4px 12px ${shadowCol}`,
        zIndex: 99999,
        cursor: "pointer",
        wordBreak: "break-word",
        animation: "slideUpBubble 0.25s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards",
        userSelect: "none",
        pointerEvents: "auto",
        display: (visible && isSelfVisible) ? "block" : "none"
      }}
    >
      <style>{`
        @keyframes slideUpBubble {
          from {
            opacity: 0;
            transform: translate(-50%, -100%) translateY(-${circleSizePx / 2 + 8 - 10}px) scale(0.9);
          }
          to {
            opacity: 1;
            transform: translate(-50%, -100%) translateY(-${circleSizePx / 2 + 8}px) scale(1);
          }
        }
        .bubble-arrow {
          position: absolute;
          top: 100%;
          left: 50%;
          transform: translateX(-50%);
          width: 0;
          height: 0;
          border-left: 6px solid transparent;
          border-right: 6px solid transparent;
          border-top: 6px solid ${isWolf ? "#5C3A24" : "#f72257"};
        }
      `}</style>
      <div>{message.text}</div>
      <div className="bubble-arrow" />
    </div>
  );
};

export default function PlayerPositions({
  onPlayerClick,
  onPlayerDoubleClick,
  mode = "edit",
  roomOverride,
  seerResults,
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
  verdictAbstainPlayerIds,
  dangerPlayerId,
  dangerPlayerIds,
  showWolfVoteBadges,
  wolfVoteVoterIds,
  voteWeightsByVoterId,
  wolfMaxTargets = 1,
  showWolfBadges,
  wolfBadgePlayerIds,
  wolfBadgeRoles,
  cheesePlayerIds,
  showRoleBadges,
  roleBadges,
  loveState,
  loveArrowShot,
  revealedRoles,
  rolesBeforeConversion,
  chiefFoundProtectorId,
  songTrungRobbedPlayerId,
  songTrungFoundByVictim,
  guardianProtectedTargetId,
  activeNightRole,
  suppressNightActionProgress,
  trialOrangePlayerId,
  trialWhitePlayerIds,
  trialGreenPlayerId,
  replayActorIds,
  replayTargetIds,
  viewMode = "nick-names",
  showVoteReview,
  dayVotes,
  dayLocked,
  activeMessages = [],
  onDismissMessage,
  isNightInfoVisible = true,
  children,
  witchPotionEffect,
  onWitchPotionEffectComplete,
  testHeartExplosionTrigger,
}: {
  onPlayerClick: (playerId: string) => void;
  onPlayerDoubleClick?: (playerId: string, clientX?: number, clientY?: number) => void;
  mode?: "edit" | "view";
  roomOverride?: RoomLike | null;
  seerResults?: { playerId: string; isWolf: boolean }[] | null;
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
  verdictAbstainPlayerIds?: string[];
  dangerPlayerId?: string | null;
  dangerPlayerIds?: string[];
  showWolfVoteBadges?: boolean;
  wolfVoteVoterIds?: string[];
  voteWeightsByVoterId?: Record<string, number>;
  wolfMaxTargets?: number;
  showWolfBadges?: boolean;
  wolfBadgePlayerIds?: string[];
  wolfBadgeRoles?: Record<string, string>;
  cheesePlayerIds?: string[];
  showRoleBadges?: boolean;
  roleBadges?: Record<string, string>;
  loveState?: any;
  loveArrowShot?: { cupidId: string; targetId: string; timestamp?: number } | null;
  revealedRoles?: Record<string, string>;
  rolesBeforeConversion?: Record<string, string>;
  chiefFoundProtectorId?: string | null;
  songTrungRobbedPlayerId?: string | null;
  songTrungFoundByVictim?: boolean;
  guardianProtectedTargetId?: string | null;
  activeNightRole?: string | null;
  suppressNightActionProgress?: boolean;
  trialOrangePlayerId?: string | null;
  trialWhitePlayerIds?: string[];
  trialGreenPlayerId?: string | null;
  replayActorIds?: string[];
  replayTargetIds?: string[];
  viewMode?: "real-names" | "nick-names" | "real-names-roles" | "nick-names-roles";
  showVoteReview?: boolean;
  dayVotes?: Record<string, string | null> | null;
  dayLocked?: Record<string, boolean> | null;
  activeMessages?: any[];
  onDismissMessage?: (messageId: string) => void;
  isNightInfoVisible?: boolean;
  children?: React.ReactNode;
  setRoom?: React.Dispatch<React.SetStateAction<any>>;
  witchPotionEffect?: { targetId: string; type: "heal" | "poison"; startedAt: number } | null;
  onWitchPotionEffectComplete?: () => void;
  testHeartExplosionTrigger?: number;
}) {
  const { room: contextRoom, role } = useRoomContext();
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
  const [showAutoArrangeConfirm, setShowAutoArrangeConfirm] = useState(false);
  const [nightActionNow, setNightActionNow] = useState(() => Date.now());

  if (!room) return null;

  const getRoleDisplayName = (roleName: string | undefined | null) => {
    if (!roleName) return "";
    if (room?.gameMode === "soi_mu" && roleName === "Tay Buôn") return "Ariana";
    return roleName;
  };

  const visiblePlayers = room.players.filter((p) => p.id !== room.hostId);

  // Sync circle size mode from server room state.
  useEffect(() => {
    setCompactCircles(room.compactCircles ?? false);
  }, [room.compactCircles]);

  const [containerSize, setContainerSize] = useState({ width: 600, height: 470 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const updateScale = () => {
      const rect = el.getBoundingClientRect();
      const width = rect.width || 600;
      const height = rect.height || 470;
      setFrameScale(clamp(width / 600, 0.55, 1));
      setContainerSize({ width, height });
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
    const hasAnyCountdown = !!room.nightTurnDeadline || !!room.daNghichState?.wolfDeadline || !!room.daNghichState?.spiritWolfDecisionDeadline;
    if (!hasAnyCountdown) return;
    if (!hasPendingNightActionProgress) return;

    setNightActionNow(Date.now());
    const t = window.setInterval(() => setNightActionNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [hasPendingNightActionProgress, isHost, isSimultaneousNight, room.nightTurnDeadline, room.daNghichState?.spiritWolfDecisionDeadline, room.daNghichState?.wolfDeadline]);

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
      const wolfDeadline = room.daNghichState?.wolfDeadline ?? null;
      if (!wolfDeadline) return progress;
      return nightActionNow >= wolfDeadline + extraMs ? undefined : progress;
    }

    if (roleName === "Linh sói") {
      const spiritDeadline = room.daNghichState?.spiritWolfDecisionDeadline ?? null;
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
  const voteBadgeTopPx = scalePx(40, 26);
  const hpBadgeTopPx = scalePx(26, 16);
  const badgePadding = `${scalePx(2, 1)}px ${scalePx(6, 3)}px`;
  const hpBadgePadding = `${scalePx(2, 1)}px ${scalePx(8, 4)}px`;
  const dashCamXoay = { inset: -scalePx(6, 4), border: `${scalePx(2, 1)}px dashed #f59e0b` };

  const wolfVotes = ((room as any).wolfVotes || room.daNghichState?.wolfVotes) as Record<string, string | null> | undefined;
  const wolfVotes2 = ((room as any).wolfVotes2 || room.daNghichState?.wolfVotes2) as Record<string, string | null> | undefined;
  const deadPlayers =
    room.id === "mock-8"
      ? (room.deadPlayers as string[] | undefined) ?? []
      : mode === "view"
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

  useEffect(() => {
    if (Physics2DPlugin) {
      gsap.registerPlugin(Physics2DPlugin);
    }
  }, []);

  const prevPlayerHeartsRef = useRef<Record<string, number>>({});
  useEffect(() => {
    if (room?.daNghichState?.playerHearts) {
      if (Object.keys(room.daNghichState?.playerHearts).length > 0) {
        prevPlayerHeartsRef.current = room.daNghichState?.playerHearts;
      }
    }
  }, [room?.daNghichState?.playerHearts]);

  const [pendingHeartExplosion, setPendingHeartExplosion] = useState(false);
  const prevSharedHeartsVisibleRef = useRef<boolean | undefined>(undefined);

  useEffect(() => {
    const prevSharedHeartsVisible = prevSharedHeartsVisibleRef.current;
    const currentSharedHeartsVisible = room?.daNghichState?.sharedHeartsVisible;
    prevSharedHeartsVisibleRef.current = currentSharedHeartsVisible;

    if (prevSharedHeartsVisible === true && currentSharedHeartsVisible === false) {
      if (room?.gameRules?.twoHeartsFirstTwoNights && (room?.phase === "day" || room?.id === "mock-8")) {
        setPendingHeartExplosion(true);
      }
    }
  }, [room?.daNghichState?.sharedHeartsVisible, room?.gameRules?.twoHeartsFirstTwoNights, room?.phase, room?.id]);

  useEffect(() => {
    if (pendingHeartExplosion && !bulletAnimation) {
      const timer = window.setTimeout(() => {
        const alivePlayers = (room?.players || []).filter(p => p.id !== room?.hostId && !(room?.deadPlayers || []).includes(p.id));
        alivePlayers.forEach(p => {
          const pos = localPositions.find(pos => pos.playerId === p.id);
          if (pos) {
            const hpCount = prevPlayerHeartsRef.current[p.id] ?? 2;
            if (hpCount > 0) {
              const circleRadiusPx = circleSizePx / 2;
              const badgeLeft = -circleRadiusPx - scalePx(6, 3);
              const badgeTop = -circleRadiusPx - hpBadgeTopPx;
              const badgeWidth = scalePx(48, 32);
              const badgeHeight = scalePx(20, 14);
              const dxPx = badgeLeft + badgeWidth / 2;
              const dyPx = badgeTop + badgeHeight / 2;
              const dxPct = dxPx / containerSize.width;
              const dyPct = dyPx / containerSize.height;

              triggerHeartExplosion(pos.x + dxPct, pos.y + dyPct, containerRef.current, hpCount);
            }
          }
        });
        setPendingHeartExplosion(false);
      }, 1000);

      return () => window.clearTimeout(timer);
    }
  }, [pendingHeartExplosion, bulletAnimation, room?.players, room?.deadPlayers, localPositions, room?.hostId, circleSizePx, hpBadgeTopPx, containerSize, frameScale]);

  const prevTestHeartExplosionTriggerRef = useRef<number | undefined>(undefined);
  useEffect(() => {
    const prev = prevTestHeartExplosionTriggerRef.current;
    prevTestHeartExplosionTriggerRef.current = testHeartExplosionTrigger;
    if (prev !== undefined && testHeartExplosionTrigger !== undefined && testHeartExplosionTrigger > prev) {
      if (room) {
        const alivePlayers = room.players.filter(p => p.id !== room.hostId && !(room.deadPlayers || []).includes(p.id));
        alivePlayers.forEach(p => {
          const pos = localPositions.find(pos => pos.playerId === p.id);
          if (pos) {
            const hpCount = room.daNghichState?.playerHearts?.[p.id] ?? 2;
            if (hpCount > 0) {
              const circleRadiusPx = circleSizePx / 2;
              const badgeLeft = -circleRadiusPx - scalePx(6, 3);
              const badgeTop = -circleRadiusPx - hpBadgeTopPx;
              const badgeWidth = scalePx(48, 32);
              const badgeHeight = scalePx(20, 14);
              const dxPx = badgeLeft + badgeWidth / 2;
              const dyPx = badgeTop + badgeHeight / 2;
              const dxPct = dxPx / containerSize.width;
              const dyPct = dyPx / containerSize.height;

              triggerHeartExplosion(pos.x + dxPct, pos.y + dyPct, containerRef.current, hpCount);
            }
          }
        });
      }
    }
  }, [testHeartExplosionTrigger, room, localPositions, circleSizePx, hpBadgeTopPx, containerSize]);

  const [recoilState, setRecoilState] = useState<{ elapsedMs: number; totalMs: number } | null>(null);

  const bulletRecoil = (() => {
    if (!bulletAnimation || !recoilState || bulletAnimation.kind === "love") return null;
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
      elapsedMs: recoilState.elapsedMs,
      totalMs: recoilState.totalMs,
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

  const autoArrange = (force = false) => {
    if (!isEditor) return;
    if (!containerRef.current) return;

    if (room.autoArrangeUsed && !force) {
      setShowAutoArrangeConfirm(true);
      return;
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

  const linesToDraw: Array<{ id: string; startX: number; startY: number; endX: number; endY: number }> = [];

  if (dayVotes && trialOrangePlayerId) {
    Object.entries(dayVotes).forEach(([voterId, targetId]) => {
      if (!targetId || targetId === trialOrangePlayerId) return;
      if ((deadPlayersOverride || []).includes(voterId)) return;

      const fromPos = localPositions.find((pos) => pos.playerId === voterId);
      const toPos = localPositions.find((pos) => pos.playerId === targetId);
      if (fromPos && toPos) {
        const W = containerSize.width;
        const H = containerSize.height;

        const X1 = fromPos.x * W;
        const Y1 = fromPos.y * H;
        const X2 = toPos.x * W;
        const Y2 = toPos.y * H;

        const dx = X2 - X1;
        const dy = Y2 - Y1;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist > circleSizePx) {
          const R = circleSizePx / 2;
          const startPadding = R + 4;
          const endPadding = R + 8;

          const startX = X1 + (startPadding / dist) * dx;
          const startY = Y1 + (startPadding / dist) * dy;
          const endX = X2 - (endPadding / dist) * dx;
          const endY = Y2 - (endPadding / dist) * dy;

          linesToDraw.push({
            id: `${voterId}-${targetId}`,
            startX,
            startY,
            endX,
            endY,
          });
        }
      }
    });
  }

  // Tính toán trạng thái vote (cho cả ban đêm - Sói và ban ngày - Biểu quyết)
  const isNightPhase = room?.phase === "night";
  const wolfVoteStatuses = (() => {
    if (!showWolfVoteBadges || !room) return null;

    const activeVotesMap = isNightPhase ? (wolfVotes || wolfVotes2) : (dayVotes || wolfVotes || wolfVotes2);

    const voterIds = wolfVoteVoterIds && wolfVoteVoterIds.length
      ? wolfVoteVoterIds
      : Object.keys({ ...(activeVotesMap || {}), ...(isNightPhase ? (wolfVotes2 || {}) : {}) });

    const getPlayerVoteCount = (pId: string) => {
      if (!activeVotesMap) return 0;
      return voterIds.reduce((total, wid) => {
        const votedThis = (activeVotesMap?.[wid] === pId) || (isNightPhase && wolfVotes2?.[wid] === pId);
        return votedThis ? total + (voteWeightsByVoterId?.[wid] || 1) : total;
      }, 0);
    };

    const activePlayers = room.players.filter((p) => p.id !== room.hostId);
    const votesMap = new Map<string, number>();
    const eligibleList: { id: string; count: number }[] = [];

    activePlayers.forEach((ap) => {
      const voteCount = getPlayerVoteCount(ap.id);
      votesMap.set(ap.id, voteCount);
      if (voteCount > 0) {
        eligibleList.push({ id: ap.id, count: voteCount });
      }
    });

    // Xác định những ai là winner dựa trên thuật toán kết toán
    const winners = new Set<string>();
    const isTwoBites = isNightPhase && wolfMaxTargets && wolfMaxTargets >= 2;

    if (eligibleList.length > 0) {
      // Sắp xếp các mục tiêu giảm dần theo số vote
      eligibleList.sort((a, b) => b.count - a.count);

      // Phân nhóm theo số vote
      const voteGroups: Record<number, string[]> = {};
      eligibleList.forEach(({ id, count }) => {
        if (!voteGroups[count]) {
          voteGroups[count] = [];
        }
        voteGroups[count].push(id);
      });

      const sortedVotes = Object.keys(voteGroups)
        .map(Number)
        .sort((a, b) => b - a);

      const max1 = sortedVotes[0];
      const S1 = max1 !== undefined ? voteGroups[max1]! : [];

      if (isTwoBites) {
        if (S1.length === 2) {
          winners.add(S1[0]!);
          winners.add(S1[1]!);
        } else if (S1.length === 1) {
          winners.add(S1[0]!);
          const max2 = sortedVotes[1];
          const S2 = max2 !== undefined ? voteGroups[max2]! : [];
          if (S2.length === 1) {
            winners.add(S2[0]!);
          }
        }
      } else {
        // Cắn thường 1 mục tiêu hoặc biểu quyết ban ngày (chọn 1 mục tiêu duy nhất có số vote cao nhất)
        if (S1.length === 1) {
          winners.add(S1[0]!);
        }
      }
    }

    // Gán trạng thái cho mỗi người chơi
    const statuses: Record<string, "winner" | "tied"> = {};
    activePlayers.forEach((ap) => {
      const v = votesMap.get(ap.id) || 0;
      if (v > 0) {
        if (winners.has(ap.id)) {
          statuses[ap.id] = "winner";
        } else {
          statuses[ap.id] = "tied";
        }
      }
    });

    return statuses;
  })();

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
        @keyframes boardPop {
          0% {
            transform: scale(0);
            opacity: 0;
          }
          70% {
            transform: scale(1.15);
            opacity: 0.9;
          }
          100% {
            transform: scale(1);
            opacity: 1;
          }
        }
        @keyframes dashMove {
          to {
            stroke-dashoffset: -40;
          }
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
        @keyframes badgeFadeIn {
          0% {
            opacity: 0;
            transform: translate(-50%, 12px) scale(0.8);
          }
          70% {
            opacity: 0.9;
            transform: translate(-50%, -2px) scale(1.05);
          }
          100% {
            opacity: 1;
            transform: translate(-50%, 0) scale(1);
          }
        }
        @keyframes voteBadgePopIn {
          0% {
            opacity: 0;
            transform: scale(0.35) translateY(6px);
          }
          70% {
            opacity: 1;
            transform: scale(1.15) translateY(-1px);
          }
          100% {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
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
          box-shadow: 0 0 16px rgba(255, 255, 255, 0.4);
        }
        .halo-cursed-wolf {
          animation: breatheSoft 2.5s ease-in-out infinite;
          box-shadow: 0 0 16px rgb(255 0 0 / 40%);
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
          box-shadow: 0 0 20px rgba(52, 211, 153, 0.65);
        }
        .halo-dash-cam-xoay {
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
        .halo-seer-wolf {
          animation: breatheSoft 2s ease-in-out infinite;
          box-shadow: 0 0 16px rgb(255 0 0 / 40%);
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
          <button onClick={() => autoArrange()}>Tự xếp</button>
          <button onClick={toggleCircleSize}>
            {compactCircles ? "Kích thước chuẩn" : "Đổi kích thước"}
          </button>
        </div>
      )}



      <div
        className="player-position-frame"
        ref={containerRef}
        style={{
          width: "100%",
          height: frameHeightPx,
          background: "rgb(12 14 18 / 67%)",
          backdropFilter: "blur(8px)",
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
        <PlayerShotEffect
          bulletAnimation={bulletAnimation}
          positions={animPositionsRef.current}
          containerRef={containerRef}
          onRecoilUpdate={setRecoilState}
        />
        {/* Chỉ render hiệu ứng quăng bình của phù thủy cho Host và Phù Thủy, hoặc khi ở trong mock-8 để test */}
        {(() => {
          const isAllowed = (room?.id === "mock-8") || (room?.hostId === clientId) || (room?.playerRoles?.[clientId!] === "Phù thủy" || role === "Phù thủy");
          if (witchPotionEffect) {
            console.log("[WitchVFX] isAllowed:", isAllowed, "targetId:", witchPotionEffect.targetId, "type:", witchPotionEffect.type);
          }
          return isAllowed && witchPotionEffect ? createPortal(
            <SplashCursor
              toPlayerId={witchPotionEffect.targetId}
              positions={animPositionsRef.current}
              containerRef={containerRef}
              onComplete={onWitchPotionEffectComplete}
              RAINBOW_MODE={witchPotionEffect.type === "heal"}
              COLOR={witchPotionEffect.type === "poison" ? "#F43F5E" : undefined}
            />,
            document.body
          ) : null;
        })()}
        {/* SVG overlay for dashed arrow lines */}
        {linesToDraw.length > 0 && (
          <svg
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              pointerEvents: "none",
              zIndex: 0,
              opacity: showVoteReview ? 1 : 0,
              transition: "opacity 0.4s cubic-bezier(0.4, 0, 0.2, 1)",
            }}
          >
            <defs>
              <marker
                id="dashed-arrowhead"
                viewBox="0 0 10 10"
                refX="6"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#f59e0b" />
              </marker>
            </defs>
            {linesToDraw.map((line) => (
              <line
                key={line.id}
                x1={line.startX}
                y1={line.startY}
                x2={line.endX}
                y2={line.endY}
                stroke="#f59e0b"
                strokeWidth="2.5"
                strokeDasharray="6,4"
                markerEnd="url(#dashed-arrowhead)"
                style={{
                  animation: "dashMove 30s linear infinite",
                }}
              />
            ))}
          </svg>
        )}
        {localPositions.filter((pos) => pos.playerId !== room.hostId).map((pos) => {
          const p = room.players.find((x) => x.id === pos.playerId);
          if (!p) return null;

          let avatarUrl: string | undefined = undefined;
          let maskedAvatarUrl: string | undefined = undefined;

          let targetAvatarFile = p.playerAvatar;
          // ponytail: fallback to search assets/Ava for file matching playerId if playerAvatar is not in history
          if (!targetAvatarFile) {
            const matchedFileEntry = Object.keys(AVA_IMAGES).find((path) => {
              const fileName = path.split("/").pop() || "";
              return fileName.includes(pos.playerId);
            });
            if (matchedFileEntry) {
              targetAvatarFile = matchedFileEntry.split("/").pop();
            }
          }

          if (targetAvatarFile) {
            const customUrl = getAvatarUrlByFileName(targetAvatarFile);
            if (customUrl) {
              if (targetAvatarFile.trim().toUpperCase().includes("M-")) {
                maskedAvatarUrl = customUrl;
              } else {
                avatarUrl = customUrl;
              }
            }
          }

          if (!avatarUrl && !maskedAvatarUrl) {

            maskedAvatarUrl = MASKED_AVATAR_MAP[pos.playerId];
            if (pos.playerId.startsWith("dev-")) {
              const parts = pos.playerId.split("-");
              const lastPart = parts[parts.length - 1];
              const idx = parseInt(lastPart, 10);
              if (!isNaN(idx) && idx >= 1 && idx <= 7) {
                const VIP_IDS = [
                  "046fa88a-a719-47c3-8b97-ddfc8337cf83",
                  "f7d9652f-ac74-4557-81a2-7c2731a77d37",
                  "397d9740-e21b-4ade-941f-25912aefd591",
                  "d64474be-88b2-4f67-bf0d-310c3c9de7f5",
                  "8dfc1d63-988f-460d-8569-8a1964be99a0",
                  "ec0c6c66-9ce7-4d86-ac12-25824af15b79",
                  "9bc9009c-13b3-4ba6-bbdd-a7189b477ccd"
                ];
                const vipId = VIP_IDS[idx - 1];
                if (!maskedAvatarUrl) maskedAvatarUrl = MASKED_AVATAR_MAP[vipId];
              }
            }
          }
          const isRealNamesMode = viewMode === "real-names" || viewMode === "real-names-roles";
          const displayName = (isRealNamesMode && p.playerRealName) ? p.playerRealName : p.name;

          const left = `${pos.x * 100}%`;
          const top = `${pos.y * 100}%`;

          const effectiveVoterIds = wolfVoteVoterIds && wolfVoteVoterIds.length ? wolfVoteVoterIds : undefined;
          const effectiveWolfCount = effectiveVoterIds ? effectiveVoterIds.length : wolfCount;
          const activeVotesMap = isNightPhase ? (wolfVotes || wolfVotes2) : (dayVotes || wolfVotes || wolfVotes2);
          const voteCountForThis = activeVotesMap
            ? (effectiveVoterIds
              ? effectiveVoterIds.reduce((total, wid) => {
                const votedThis = (activeVotesMap?.[wid] === pos.playerId) || (isNightPhase && wolfVotes2?.[wid] === pos.playerId);
                if (!votedThis) return total;
                return total + (voteWeightsByVoterId?.[wid] || 1);
              }, 0)
              : (() => {
                const ids = Object.keys({ ...(activeVotesMap || {}), ...(isNightPhase ? (wolfVotes2 || {}) : {}) });
                return ids.filter(wid => (activeVotesMap?.[wid] === pos.playerId) || (isNightPhase && wolfVotes2?.[wid] === pos.playerId)).length;
              })())
            : 0;
          const isDead = (deadPlayers || []).includes(pos.playerId);
          const isSwapSelected = swapSource === pos.playerId;
          const isReplayActor = !!replayActorIds && replayActorIds.includes(pos.playerId);
          const isReplayTarget = !!replayTargetIds && replayTargetIds.includes(pos.playerId);

          const currentSeerResult = seerResults?.find(r => r.playerId === pos.playerId);
          const isSeerResult = !!currentSeerResult;
          const isWitchDanger =
            (!!dangerPlayerId && dangerPlayerId === pos.playerId) ||
            (!!dangerPlayerIds && dangerPlayerIds.includes(pos.playerId))
            && !verdictDiePlayerIds?.includes(pos.playerId);
          const isHighlighted = !!highlightPlayerId && highlightPlayerId === pos.playerId;
          const isSecondaryHighlighted =
            !!secondaryHighlightPlayerIds &&
            secondaryHighlightPlayerIds.includes(pos.playerId) &&
            !verdictLivePlayerIds?.includes(pos.playerId);
          const isBlankVoter =
            !isDead &&
            pos.playerId !== room.hostId &&
            (!dayVotes || !dayVotes[pos.playerId]);
          const isCursedHighlighted = !!cursedHighlightPlayerIds && cursedHighlightPlayerIds.includes(pos.playerId);
          const isVerdictLiveHighlighted = !!verdictLivePlayerIds && verdictLivePlayerIds.includes(pos.playerId);
          const isVerdictDieHighlighted = !!verdictDiePlayerIds && verdictDiePlayerIds.includes(pos.playerId);
          const isVerdictAbstain = !!verdictAbstainPlayerIds && verdictAbstainPlayerIds.includes(pos.playerId);
          const nightActionProgress = getVisibleNightActionProgress(pos.playerId);

          const showSelectedOutline =
            (!!selectedOutlinePlayerId && selectedOutlinePlayerId === pos.playerId) ||
            (!!selectedOutlinePlayerIds && selectedOutlinePlayerIds.includes(pos.playerId));
          const showCheeseBadge = !!cheesePlayerIds && cheesePlayerIds.includes(p.id);
          let rawRoleBadgeText = (showRoleBadges && roleBadges) ? roleBadges[p.id] : undefined;

          if (!rawRoleBadgeText && chiefFoundProtectorId && p.id === chiefFoundProtectorId) {
            const myRole = room?.playerRoles?.[clientId || ""];
            const isChief = myRole === "Trưởng làng";
            if (isChief || isHost) {
              rawRoleBadgeText = "Hộ nhân";
            }
          }

          // Kiểm tra xem người chơi có bị biến đổi bởi Sói Dại không
          const originalRoleOfP = rolesBeforeConversion?.[p.id];

          // Trưởng làng đã lộ diện cũng là một dạng conversion cần hiển thị kể cả khi không có rolesBeforeConversion (để dự phòng)
          const isChiefRevealed = room.publicRevealedRolesByPlayerId?.[p.id] === "Trưởng làng";
          const currentRoleOfP =
            (wolfBadgeRoles && wolfBadgeRoles[p.id]) ||
            (revealedRoles && revealedRoles[p.id]) ||
            (loveState && loveState.rolesByPlayerId && loveState.rolesByPlayerId[p.id]) ||
            (p.id === clientId ? (p.id === songTrungRobbedPlayerId && !room.gameOver ? undefined : role) : undefined);
          const isCurrentlyWolf = currentRoleOfP === "Sói" || room.daNghichState?.wolves?.includes(p.id);
          const isChiefConverted = !!(isChiefRevealed && isCurrentlyWolf);
          const isChiefRoleConverted = originalRoleOfP === "Trưởng làng" || isChiefConverted;

          const isViewerWolf = ["Sói", "Sói con", "Sói Dại", "Bán sói", "Linh sói"].includes(role || "") || room.daNghichState?.wolves?.includes(clientId || "");
          const isViewerCupidAndPaired = role === "Thần tình yêu" && clientId !== songTrungRobbedPlayerId && loveState?.pairIds?.includes(p.id);
          const isSongTrungConversion = originalRoleOfP === "Song Trùng";
          const isRobbedPlayerWhoFound = clientId && songTrungRobbedPlayerId === clientId && songTrungFoundByVictim;

          const canSeeConversion = !!(
            isHost ||
            room.gameOver ||
            (clientId && p.id === clientId) ||
            (isSongTrungConversion && isRobbedPlayerWhoFound) ||
            (!isSongTrungConversion && (isViewerWolf || isViewerCupidAndPaired))
          );

          const isViewerAlive = !clientId || !(deadPlayers || []).includes(clientId);

          // Trưởng làng biến đổi thành Sói chỉ hiển thị badge kép cho Host, khi kết thúc game, hoặc phe Sói (còn sống) / bản thân Trưởng làng (còn sống) / Thần tình yêu ghép đôi (còn sống) VÀO BAN ĐÊM
          const isChiefConvertedActive = isChiefRoleConverted && (
            isHost ||
            room.gameOver ||
            (room.phase === "night" && isViewerAlive && (
              (clientId && p.id === clientId) ||
              isViewerWolf ||
              isViewerCupidAndPaired
            ))
          );

          // Chỉ hiển thị badge kép của Song Trùng vào ban đêm, khi kết thúc game hoặc đối với Host
          const isNightOrGameOverOrHost = room.phase === "night" || room.gameOver || isHost;
          const isSongTrungConversionActive = isSongTrungConversion && isNightOrGameOverOrHost;

          const isGeneralConversion = !!originalRoleOfP && originalRoleOfP !== "Trưởng làng" && originalRoleOfP !== "Song Trùng";

          const showSpecialConvertedWolfBadge = !!(
            (isGeneralConversion && canSeeConversion) ||
            (isSongTrungConversion && canSeeConversion && isSongTrungConversionActive) ||
            isChiefConvertedActive
          );

          const effectiveOriginalRole = (originalRoleOfP && originalRoleOfP !== "Trưởng làng" ? originalRoleOfP : undefined) || (isChiefConvertedActive ? "Trưởng làng" : undefined);

          if (showRoleBadges && showSpecialConvertedWolfBadge && effectiveOriginalRole) {
            rawRoleBadgeText = effectiveOriginalRole;
          } else if (showRoleBadges && (isChiefRevealed || isChiefRoleConverted) && !showSpecialConvertedWolfBadge) {
            rawRoleBadgeText = "Trưởng làng";
          }

          const showWolfBadge = !!showWolfBadges && (wolfBadgePlayerIds || []).includes(p.id) && (!isChiefRoleConverted || showSpecialConvertedWolfBadge);
          const wolfBadgeText = showWolfBadge ? (wolfBadgeRoles?.[p.id] || "Sói") : undefined;

          // Delay showing role badges during Cupid's shot animation (checks both active animation & socket shot event timestamp)
          const isLoveBullet = bulletAnimation && bulletAnimation.kind === "love";
          const isLoveSocketShot = loveArrowShot && loveArrowShot.cupidId && loveArrowShot.targetId;

          if ((isLoveBullet || isLoveSocketShot) && rawRoleBadgeText) {
            let elapsed = recoilState ? recoilState.elapsedMs : 0;
            if (!recoilState && loveArrowShot?.timestamp) {
              elapsed = Math.max(0, Date.now() - loveArrowShot.timestamp);
            }
            const targetId = isLoveBullet ? bulletAnimation.toPlayerId : loveArrowShot?.targetId;
            const cupidId = isLoveBullet ? bulletAnimation.fromPlayerId : loveArrowShot?.cupidId;

            // 1. Hide the target's badge until the explosion starts (2400ms)
            if (p.id === targetId && elapsed < 2400) {
              rawRoleBadgeText = undefined;
            }
            // 2. Hide Cupid's badge until the explosion ends completely (4400ms)
            if (p.id === cupidId && elapsed < 4400) {
              rawRoleBadgeText = undefined;
            }
          }

          const roleBadgeText = rawRoleBadgeText;

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
          const privateHeartVisible =
            (room.daNghichState?.privateHeartVisiblePlayerIds || []).includes(pos.playerId) &&
            (isHost || pos.playerId === clientId);
          const heartVisible = room.daNghichState?.sharedHeartsVisible || privateHeartVisible;
          const privatePlayerHp = privateHeartVisible ? room.daNghichState?.privatePlayerHearts?.[pos.playerId] : undefined;
          const playerHp =
            privateHeartVisible && typeof privatePlayerHp === "number"
              ? privatePlayerHp
              : heartVisible
                ? room.daNghichState?.playerHearts?.[pos.playerId]
                : undefined;
          const showHpBadge = heartVisible && !isDead && typeof playerHp === "number";
          const heartShaking = privateHeartVisible && (room.daNghichState?.playerHeartShakeIds || []).includes(pos.playerId);
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

          const innerContent = (
            <>
              {maskedAvatarUrl ? (
                <>
                  {/* 1. Phần thân nhân vật được bo tròn theo vòng tròn */}
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      borderRadius: "inherit",
                      overflow: "hidden",
                      pointerEvents: "none",
                      zIndex: 0,
                    }}
                  >
                    <img
                      src={maskedAvatarUrl}
                      alt=""
                      style={{
                        position: "absolute",
                        bottom: 0,
                        left: "50%",
                        transform: "translateX(-50%)",
                        width: "115%",
                        height: "115%",
                        objectFit: "contain",
                        objectPosition: "bottom center",
                      }}
                    />
                    {/* Overlay tối nhẹ lên thân nhân vật */}
                    <div style={{
                      position: "absolute",
                      inset: 0,
                      borderRadius: "inherit",
                      zIndex: 1
                    }} />
                  </div>

                  {/* 2. Phần đầu nhân vật nhô lên ngoài vòng tròn */}
                  <img
                    src={maskedAvatarUrl}
                    alt=""
                    style={{
                      position: "absolute",
                      bottom: 0,
                      left: "50%",
                      transform: "translateX(-50%)",
                      width: "115%",
                      height: "115%",
                      objectFit: "contain",
                      objectPosition: "bottom center",
                      clipPath: "inset(0 0 40% 0)",
                      pointerEvents: "none",
                      zIndex: 0,
                    }}
                  />
                </>
              ) : (
                avatarUrl && (
                  <div style={{
                    position: "absolute",
                    inset: 0,
                    background: "rgba(0, 0, 0, 0.15)",
                    borderRadius: "inherit",
                    zIndex: 0
                  }} />
                )
              )}
              {/* Elemental VFX (Ice, Fire, Thunder, Darkness) */}
              {vfxType && <ElementalVFX type={vfxType} />}

              {/* Concentric Halo Rings */}
              {isSeerResult && currentSeerResult && (
                <div className={`player-halo halo-seer ${currentSeerResult.isWolf ? "halo-seer-wolf" : ""}`} style={{ inset: -scalePx(6, 4), border: `${scalePx(4, 1)}px solid ${currentSeerResult.isWolf ? "#ef4444" : "#f1f5f9"}` }} />
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
                <div className={`player-halo halo-cursed ${cursedHighlightIsDanger ? "halo-cursed-wolf" : ""}`} style={{ inset: -scalePx(6, 4), border: `${scalePx(4, 1)}px solid ${cursedHighlightIsDanger ? "#dc2626" : "#e2e8f0"}` }} />
              )}
              {nightActionProgress === "pending" && (
                <div className="player-halo halo-dash-cam-xoay" style={dashCamXoay} />
              )}
              {nightActionProgress === "done" && (
                <div className="player-halo halo-night-done" style={{ inset: -scalePx(6, 4), border: `${scalePx(2, 1)}px solid #10b981` }} />
              )}

              {/* Concentric Rings */}
              {isSecondaryHighlighted && (
                <div className="player-halo" style={{ inset: -scalePx(10, 6), border: `${scalePx(4, 1)}px solid #ffffff`, boxShadow: "0 0 10px rgba(255, 255, 255, 0.8)" }} />
              )}
              {(() => {
                const isTrialGreen = trialGreenPlayerId === pos.playerId;
                const isTrialWhite = (trialWhitePlayerIds || []).includes(pos.playerId);
                if (!isTrialGreen && !isTrialWhite) return null;

                return (
                  <div
                    className={`player-halo ${isTrialGreen ? "halo-trial-green" : "halo-trial-white"}`}
                    style={{
                      inset: isTrialGreen ? -scalePx(8, 6) : -scalePx(6, 4),
                      border: isTrialGreen
                        ? `${scalePx(2.5, 2)}px solid #34d399`
                        : `${scalePx(2, 1)}px solid #f1f5f9`,
                      transition: "all 0.4s cubic-bezier(0.4, 0, 0.2, 1)",
                    }}
                  />
                );
              })()}

              {/* Outer Concentric Rings */}
              {isHighlighted && (
                <div className="player-halo halo-spotlight" style={{ inset: -scalePx(10, 6), border: `${scalePx(4, 1)}px solid #ffffff`, boxShadow: "0 0 10px rgba(255, 255, 255, 0.8)" }} />
              )}
              {isActiveNightRoleBadge && (
                <div className="player-halo halo-active-role" style={{ inset: -scalePx(10, 6), border: `${scalePx(2.5, 1.5)}px solid #ffd700` }} />
              )}
              {trialOrangePlayerId === pos.playerId && (
                <div className="player-halo halo-dash-cam-xoay" style={dashCamXoay} />
              )}
              {isNightPhase && guardianProtectedTargetId === pos.playerId && (
                <Orb hue={0} />
              )}

              {/* Badges and Indicators */}
              {showWolfVoteBadges && effectiveWolfCount >= 1 && voteCountForThis > 0 && (() => {
                const status = wolfVoteStatuses?.[pos.playerId] || "tied";
                const isWinner = status === "winner";

                return (
                  <div style={{
                    position: "absolute",
                    top: voteBadgeTopPx,
                    right: -badgeOffsetPx,
                    color: "#fff",
                    borderRadius: badgeOffsetPx,
                    padding: badgePadding,
                    fontSize: badgeFontSizePx,
                    fontWeight: "bold",
                    zIndex: 2,
                    border: "1px solid rgba(255, 255, 255, 0.18)",
                    animation: "voteBadgePopIn 0.35s cubic-bezier(0.34, 1.56, 0.64, 1) forwards",
                    overflow: "hidden",
                    boxShadow: isWinner
                      ? "0 2px 8px rgba(0, 150, 136, 0.5), inset 0 1px 1px rgba(255, 255, 255, 0.25)"
                      : "0 2px 8px rgba(198, 40, 40, 0.5), inset 0 1px 1px rgba(255, 255, 255, 0.25)",
                    transition: "box-shadow 0.6s cubic-bezier(0.4, 0, 0.2, 1)",
                  }}>
                    {/* Layer màu đỏ (tied / default) */}
                    <div style={{
                      position: "absolute",
                      inset: 0,
                      background: "linear-gradient(135deg, #ef5350, #c62828)",
                      zIndex: 0,
                    }} />

                    {/* Layer màu xanh (winner - transition opacity mượt mà) */}
                    <div style={{
                      position: "absolute",
                      inset: 0,
                      background: "linear-gradient(135deg, #009688, #4CAF50)",
                      opacity: isWinner ? 1 : 0,
                      transition: "opacity 0.6s cubic-bezier(0.4, 0, 0.2, 1)",
                      zIndex: 1,
                    }} />

                    {/* Nội dung số phiếu */}
                    <span style={{ position: "relative", zIndex: 2 }}>
                      {voteCountForThis}/{effectiveWolfCount}
                    </span>
                  </div>
                );
              })()}

              {showWolfBadge && (
                <div style={{
                  position: "absolute",
                  bottom: -badgeOffsetPx,
                  left: "50%",
                  transform: "translateX(-50%)",
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
                  width: "max-content",
                  zIndex: 2,
                  animation: "badgeFadeIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) forwards",
                }}>
                  <AvifIcon name="🐺" style={{ width: "1.15em", height: "1.15em" }} /> {wolfBadgeText || "Sói"}
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
                <div
                  id={showRoleBadges && showSpecialConvertedWolfBadge && effectiveOriginalRole === "Song Trùng" ? "badgekep" : undefined}
                  style={{
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
                    animation: "badgeFadeIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) forwards",
                    ...getRoleBadgeStyle(roleBadgeText, p.id, isHost, room, loveState, revealedRoles, clientId),
                    ...(showSpecialConvertedWolfBadge ? {
                      background: effectiveOriginalRole === "Song Trùng"
                        ? (isRoleWolfCorrupted("Song Trùng", p.id, room, loveState, revealedRoles) ? STYLE_DA_THA_HOA.background : STYLE_CHUA_THA_HOA.background)
                        : "linear-gradient(135deg, rgba(30, 41, 59, 0.9), rgba(45 18 18 / 0.95)) padding-box, linear-gradient(135deg, rgba(239, 68, 68, 0.6), rgba(153, 27, 27, 0.3)) border-box",
                      border: "1px solid transparent",
                      boxShadow: effectiveOriginalRole === "Song Trùng"
                        ? (isRoleWolfCorrupted("Song Trùng", p.id, room, loveState, revealedRoles) ? STYLE_DA_THA_HOA.boxShadow : STYLE_CHUA_THA_HOA.boxShadow)
                        : "0 3px 8px rgba(239, 68, 68, 0.25)",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: "2px",
                      transition: "background 0.5s ease-in-out, box-shadow 0.5s ease-in-out, color 0.5s ease-in-out, border-color 0.5s ease-in-out",
                    } : {}),
                  }}>
                  {showSpecialConvertedWolfBadge && effectiveOriginalRole ? (
                    effectiveOriginalRole === "Song Trùng" ? (
                      <>
                        <span style={{ filter: "blur(0.7px)", opacity: 0.55, fontSize: "0.75em" }}>
                          Song Trùng
                        </span>
                        <span style={{ color: "#e2e8f0", fontSize: "0.95em" }}>
                          {currentRoleOfP}
                        </span>
                      </>
                    ) : (
                      <>
                        <span style={{ filter: "blur(0.7px)", opacity: 0.55, fontSize: "0.75em" }}>
                          {effectiveOriginalRole}
                        </span>
                        <span style={{ color: "#ff6b6b", fontSize: "0.95em", display: "flex", alignItems: "center", gap: "2px" }}>
                          <AvifIcon name="🐺" style={{ width: "1.1em", height: "1.1em" }} /> Sói
                        </span>
                      </>
                    )
                  ) : (
                    roleBadgeText
                  )}
                </div>
              )}



              {showHpBadge && (
                <div style={{
                  position: "absolute",
                  top: -hpBadgeTopPx,
                  left: -scalePx(6, 3),
                  background: "rgba(15, 17, 21, 0.85)",
                  backdropFilter: "blur(4px)",
                  border: "1px solid rgba(255, 255, 255, 0.08)",
                  padding: hpBadgePadding,
                  borderRadius: 999,
                  fontSize: hpBadgeFontSizePx,
                  fontWeight: "bold",
                  letterSpacing: scaleNum(0.5, 0.25),
                  boxShadow: "0 4px 12px rgba(0, 0, 0, 0.45)",
                  zIndex: -1,
                }}>
                  {filledHearts.map((_, idx) => (
                    <span
                      key={`filled-${idx}`}
                      style={{
                        display: "inline-block",
                        animation: heartShaking ? "playerHeartShake 850ms ease-in-out infinite" : undefined,
                      }}
                    >
                      <AvifIcon name="♥️" style={{ width: scalePx(14, 10), height: scalePx(14, 10) }} />
                    </span>
                  ))}
                  {emptyHearts.map((_, idx) => (
                    <span key={`empty-${idx}`} style={{ opacity: 0.35, color: "#94a3b8" }}>♡</span>
                  ))}
                </div>
              )}

              {(() => {
                const hasAvatar = !!(avatarUrl || maskedAvatarUrl);
                const hasRoleBadge = !!(roleBadgeText || showWolfBadge);
                const isNameAtBottom = hasAvatar && !hasRoleBadge;
                return (
                  <div style={{
                    position: "absolute",
                    left: "50%",
                    top: "50%",
                    transform: isNameAtBottom ? "translate(-50%, 2.5em)" : "translate(-50%, -50%)",
                    textAlign: "center",
                    pointerEvents: "none",
                    zIndex: 1,
                    width: "max-content",
                    transition: "transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)"
                  }}>
                    <div style={{
                      fontWeight: 600,
                      opacity: isDead ? 0.45 : 1,
                      color: isDead ? "#94a3b8" : "#f8fafc",
                      fontFamily: "'Inter', system-ui, sans-serif",
                      letterSpacing: "-0.01em",
                      textShadow: (avatarUrl || maskedAvatarUrl) ? "0 2px 4px rgba(0,0,0,0.95), 0 0 6px rgba(0,0,0,0.95)" : "0 1px 2px rgba(0,0,0,0.6)",
                    }}>{displayName}</div>
                    <div style={{ opacity: isDead ? 0.3 : 0.5, fontSize: playerSubFontSizePx, textShadow: (avatarUrl || maskedAvatarUrl) ? "0 1px 2px rgba(0,0,0,0.9)" : undefined, filter: "drop-shadow(2px 4px 6px black)" }}>
                      {p.id === clientId ? "(Bạn)" : ""}
                    </div>
                    {mode === "edit" && (
                      <div style={{
                        fontSize: "9px",
                        fontWeight: 600,
                        marginTop: 2,
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: 1,
                        textShadow: "0 1px 2px rgba(0,0,0,0.9)"
                      }}>
                        {room?.positionEditors?.includes(p.id) && (
                          <span style={{ color: "#38bdf8" }}>⚙️ Quyền sắp xếp</span>
                        )}
                        {isHost && room?.pendingRoleAssignments?.[p.id] && (
                          <span style={{ color: "#ff8f42" }}>
                            ✨ Phát trước: {getRoleDisplayName(room.pendingRoleAssignments[p.id])}
                          </span>
                        )}
                        {isHost && room?.pendingRoleBlocks?.[p.id] && room.pendingRoleBlocks[p.id].length > 0 && (
                          <span style={{ color: "#f43f5e" }}>
                            🚫 Chặn: {room.pendingRoleBlocks[p.id].map(getRoleDisplayName).join(", ")}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })()}
            </>
          );

          const tokenProps = {
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
            onClick: (e: React.MouseEvent) => {
              if (dragging) return;
              const isTouchTap = lastPointerTypeRef.current === "touch";
              if (isTouchTap && onPlayerDoubleClick) {
                const now = Date.now();
                const lastTap = lastTapRef.current;
                if (lastTap && lastTap.playerId === p.id && now - lastTap.at <= 360) {
                  onPlayerDoubleClick(p.id, e.clientX, e.clientY);
                  lastTapRef.current = null;
                } else {
                  lastTapRef.current = { playerId: p.id, at: now };
                }
              }
              onPlayerClick(p.id);
            },
            onDoubleClick: (e: React.MouseEvent) => {
              if (!dragging) onPlayerDoubleClick?.(p.id, e.clientX, e.clientY);
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
              backgroundImage: maskedAvatarUrl
                ? `url("${nenLungAsset}")`
                : (avatarUrl ? `url("${avatarUrl}")` : undefined),
              backgroundPosition: (maskedAvatarUrl || avatarUrl) ? "center" : undefined,
              backgroundSize: (maskedAvatarUrl || avatarUrl) ? "cover" : undefined,
              backgroundRepeat: (maskedAvatarUrl || avatarUrl) ? "no-repeat" : undefined,
              backgroundOrigin: (maskedAvatarUrl || avatarUrl) ? "border-box" : undefined,
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
                : "left 0.2s, top 0.2s, width 220ms ease, height 220ms ease, border-radius 220ms ease, box-shadow 300ms ease, transform 0.2s ease, filter 0.5s ease",
              filter: isDead ? "grayscale(0.94) brightness(0.5) opacity(0.5)" : undefined,
            }
          };

          const isDay = room?.phase === "day";
          const isSoiMu = room?.gameMode === "soi_mu";
          const rolesInGame = room?.roles || [];
          const hasNamThuInGame = rolesInGame.includes("Nam Thư");
          const hasSuyThanInGame = rolesInGame.includes("Suy Thận");
          const showNamThuBoard = !!isSoiMu && !!isDay && room?.soiMuState?.namThuTargetId === pos.playerId;
          const showSuyThanBoard = !!isSoiMu && !!isDay && room?.soiMuState?.suyThanTargetId === pos.playerId;

          const effectiveDayLocked = dayLocked ?? room?.dayLocked;
          const effectiveDayVotes = dayVotes ?? room?.dayVotes;
          const isDayVotingActive = !!isDay && !isDead && pos.playerId !== room?.hostId && (room?.trialStage === "none" || !room?.trialStage) && !!room?.dayDeadline;
          const isDayLockedForThisPlayer = isDayVotingActive && !!effectiveDayLocked?.[pos.playerId];
          const dayVoteTarget = effectiveDayVotes?.[pos.playerId];
          const isDayVotedTarget = isDayLockedForThisPlayer && typeof dayVoteTarget === "string" && dayVoteTarget.trim().length > 0;
          const isDayVotedBlank = isDayLockedForThisPlayer && !dayVoteTarget;

          // Xác định danh sách các bảng thực sự đang hiển thị
          const visibleBlank = (!!showVoteReview && isBlankVoter) || isDayVotedBlank || isVerdictAbstain;
          const visibleTrialVoted =
            (!!isDay &&
              !isDead &&
              pos.playerId !== room?.trialTargetId &&
              room?.trialStage === "verdict" &&
              (room?.trialVotes?.[pos.playerId] === "live" ||
                room?.trialVotes?.[pos.playerId] === "die" ||
                room?.trialVotes?.[pos.playerId] === "abstain")) ||
            isDayVotedTarget;
          const visibleDisconnected = showDisconnectedBadge;
          const visibleNamThu = showNamThuBoard;
          const visibleSuyThan = showSuyThanBoard;
          const visibleWarning = !!room?.warnedPlayerIds?.includes(pos.playerId);

          const visibleBoards: string[] = [];
          if (hasNamThuInGame && visibleNamThu) visibleBoards.push("namthu");
          if (hasSuyThanInGame && visibleSuyThan) visibleBoards.push("suythan");
          if (visibleBlank) visibleBoards.push("blank");
          if (visibleTrialVoted) visibleBoards.push("trialVoted");
          if (visibleDisconnected) visibleBoards.push("disconnected");
          if (visibleWarning) visibleBoards.push("warning");

          const hasDashCamXoay = (nightActionProgress === "pending") || (trialOrangePlayerId === pos.playerId);
          const hasHalo =
            hasDashCamXoay ||
            (isSeerResult && !!currentSeerResult) ||
            !!isVerdictLiveHighlighted ||
            !!isVerdictDieHighlighted ||
            !!isWitchDanger ||
            !!isCursedHighlighted ||
            nightActionProgress === "done" ||
            !!isSecondaryHighlighted ||
            trialGreenPlayerId === pos.playerId ||
            (trialWhitePlayerIds || []).includes(pos.playerId) ||
            !!isHighlighted ||
            !!isActiveNightRoleBadge;

          const isMobile =
            typeof window !== "undefined" &&
            (window.innerWidth <= 760 ||
              (typeof navigator !== "undefined" &&
                /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
                  navigator.userAgent
                )) ||
              (window.matchMedia && window.matchMedia("(pointer: coarse)").matches));

          const getBoardStyle = (key: string) => {
            const index = visibleBoards.indexOf(key);
            if (index === -1) return undefined;

            const count = visibleBoards.length;

            if (count >= 2) {
              if (index === 0) {
                return hasHalo
                  ? { top: "-1.75rem", right: "0.3rem", rotate: "15deg" }
                  : isMobile
                    ? { top: "-23px", right: "-2px", rotate: "28deg" }
                    : { top: "-1.45rem", right: "0.3rem", rotate: "15deg" };
              }
              if (index === 1) {
                return hasHalo
                  ? { top: "-0.9rem", right: "-0.7rem", rotate: "48deg" }
                  : isMobile
                    ? { top: "-12px", right: "-10px", rotate: "64deg" }
                    : { top: "-0.9rem", right: "-0.35rem", rotate: "48deg" };
              }
              if (index === 2) {
                return hasHalo
                  ? { top: "-2.75rem", right: "0.05rem", rotate: "16deg", zIndex: -2 }
                  : { top: "-2.45rem", right: "0.05rem", rotate: "16deg", zIndex: -2 };
              }
              if (index === 3) {
                return hasHalo
                  ? { top: "-1.65rem", right: "-1.5rem", rotate: "48deg", zIndex: -2 }
                  : { top: "-1.65rem", right: "-1.2rem", rotate: "48deg", zIndex: -2 };
              }
              if (index === 4) {
                return hasHalo
                  ? { top: "-2.25rem", right: "-1.1rem", rotate: "32deg", zIndex: -3 }
                  : { top: "-2.25rem", right: "-0.8rem", rotate: "32deg", zIndex: -3 };
              }
            } else if (count === 1) {
              if (hasHalo) {
                return isMobile
                  ? {
                    top: "-24px",
                    right: "-7px",
                    rotate: "34deg",
                  }
                  : {
                    top: "-1.4rem",
                    right: "-0.3rem",
                  };
              } else if (isMobile) {
                return {
                  top: "-21px",
                  right: "-5px",
                  rotate: "34deg",
                };
              }
            }
            return undefined;
          };

          const blankStyle = getBoardStyle("blank");
          const trialVotedStyle = getBoardStyle("trialVoted");
          const disconnectedStyle = getBoardStyle("disconnected");
          const namThuStyle = getBoardStyle("namthu");
          const suyThanStyle = getBoardStyle("suythan");
          const warningStyle = getBoardStyle("warning");

          const hasAvatar = !!(avatarUrl || maskedAvatarUrl);
          const isNameAtBottom = hasAvatar && !(roleBadgeText || showWolfBadge);

          return (
            <React.Fragment key={pos.playerId}>
              <div {...tokenProps} data-player-id={pos.playerId}>
                {innerContent}
                <BlankVoteBoard visible={visibleBlank} style={blankStyle} />
                <TrialVotedBoard visible={visibleTrialVoted} style={trialVotedStyle} />
                <DisconnectedBoard visible={visibleDisconnected} style={disconnectedStyle} />
                {hasNamThuInGame && <NamThuBoard visible={visibleNamThu} style={namThuStyle} />}
                {hasSuyThanInGame && <SuyThanBoard visible={visibleSuyThan} style={suyThanStyle} />}
                <WarningBoard visible={visibleWarning} style={warningStyle} />
              </div>
              <PlayerNameVaporize
                active={isDead && room.phase === "day"}
                isDead={isDead}
                text={displayName}
                left={left}
                top={top}
                tokenTransform={circleTransform}
                tokenSize={circleSizePx}
                fontSize={playerFontSizePx}
                nameAtBottom={isNameAtBottom}
              />
            </React.Fragment>
          );
        })}
      </div>

      {/* Bong bóng chat được đưa ra ngoài frame để không bị overflow hidden cắt mất */}
      {isNightInfoVisible && activeMessages && activeMessages.length > 0 && (
        <div
          className="chat-bubbles-board"
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            zIndex: 1005,
          }}
        >
          {localPositions.filter((pos) => pos.playerId !== room.hostId).map((pos) => {
            const playerMsg = activeMessages.find(m => m.senderId === pos.playerId);
            if (!playerMsg) return null;
            return (
              <PlayerMessageBubble
                key={playerMsg.id}
                playerId={pos.playerId}
                message={playerMsg}
                circleSizePx={circleSizePx}
                onDismiss={() => onDismissMessage?.(playerMsg.id)}
                visible={isNightInfoVisible}
                x={pos.x}
                y={pos.y}
              />
            );
          })}
        </div>
      )}

      <ConfirmModal
        open={showAutoArrangeConfirm}
        title="Xác nhận"
        message="Bạn chắc chắn muốn tự xếp lại vị trí không?"
        onConfirm={() => {
          setShowAutoArrangeConfirm(false);
          autoArrange(true);
        }}
        onCancel={() => setShowAutoArrangeConfirm(false)}
      />

      {children}
    </div>
  );
}
