import React, { useEffect, useRef, useState } from "react";
import { socket } from "../socket";
import { useRoomContext } from "../context/RoomContext";
import { getDeterministicSlots1to18, getDeterministicSlots19Plus } from "./layouts";

interface PlayerPosition {
  playerId: string;
  x: number;
  y: number;
}

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

export default function PlayerPositions({
  onPlayerClick,
  mode = "edit",
  seerResult,
  selectedOutlinePlayerId,
  dangerPlayerId,
  showWolfVoteBadges,
  wolfVoteVoterIds,
  showWolfBadges,
  wolfBadgePlayerIds,
}: {
  onPlayerClick: (playerId: string) => void;
  mode?: "edit" | "view";
  seerResult?: { playerId: string; isWolf: boolean } | null;
  selectedOutlinePlayerId?: string | null;
  dangerPlayerId?: string | null;
  showWolfVoteBadges?: boolean;
  wolfVoteVoterIds?: string[];
  showWolfBadges?: boolean;
  wolfBadgePlayerIds?: string[];
}) {
  const { room } = useRoomContext();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const dragOffsetRef = useRef<{ dxPx: number; dyPx: number } | null>(null);
  const [swapSource, setSwapSource] = useState<string | null>(null);
  const [compactCircles, setCompactCircles] = useState<boolean>(() => room?.compactCircles ?? false);

  if (!room) return null;

  // Sync circle size mode from server room state.
  useEffect(() => {
    setCompactCircles(room.compactCircles ?? false);
  }, [room.compactCircles]);

  const isHost = room.hostId === socket.id;
  const isEditor = mode === "edit" && (room.positionEditors?.includes(socket.id!) || isHost);

  const isExpandedFrame = room.players.length > AUTO_TOP_LIMIT;
  const frameHeightPx = isExpandedFrame ? EXPANDED_FRAME_HEIGHT_PX : FRAME_HEIGHT_PX;

  const circleSizePx = compactCircles ? SMALL_CIRCLE_SIZE_PX : DEFAULT_CIRCLE_SIZE_PX;
  const circleRadiusPx = circleSizePx / 2;

  const wolfVotes = room.wolfVotes as Record<string, string | null> | undefined;
  const deadPlayers = room.deadPlayers as string[] | undefined;
  const wolvesAlive = room.players.filter(p => room.playerRoles?.[p.id] === "Sói" && !(deadPlayers || []).includes(p.id)).map(p => p.id);
  const wolfCount = wolvesAlive.length;

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
  
  // We need local state for smooth dragging
  const [localPositions, setLocalPositions] = useState<PlayerPosition[]>([]);
  useEffect(() => {
    if (room.positions) setLocalPositions(room.positions);
  }, [room.positions]);

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
    const idsAll = room.players.map(p => p.id);
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
    if (!nextCompact && isEditor && room.players.length > AUTO_TOP_LIMIT && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const nextCircleSizePx = DEFAULT_CIRCLE_SIZE_PX;
      const nextCircleRadiusPx = nextCircleSizePx / 2;
      const idsAll = room.players.map(p => p.id);
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
    <div style={{ position: "relative", width: "100%", maxWidth: 600, margin: "0 auto" }}>
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
      `}</style>
      {isEditor && (
        <div style={{ marginBottom: 8, display: "flex", gap: 8, justifyContent: "center" }}>
          <button onClick={() => setSwapSource(prev => prev ? null : "SELECTING")}>
            {swapSource ? "Hủy đổi chỗ" : "Đổi chỗ"}
          </button>
          <button onClick={autoArrange}>Tự xếp</button>
          <button onClick={toggleCircleSize}>
            {compactCircles ? "Kích thước chuẩn" : "Đổi kích thước"}
          </button>
        </div>
      )}
      
      <div
        ref={containerRef}
        style={{
          width: "100%",
          height: frameHeightPx,
          background: "#f0f0f0",
          borderRadius: 10,
          position: "relative",
          touchAction: "none",
          overflow: "hidden",
          transition: "height 200ms ease",
        }}
        onPointerMove={handlePointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
      >
        {localPositions.map((pos) => {
          const p = room.players.find((x) => x.id === pos.playerId);
          if (!p) return null;

          const left = `${pos.x * 100}%`;
          const top = `${pos.y * 100}%`;

          const effectiveVoterIds = wolfVoteVoterIds && wolfVoteVoterIds.length ? wolfVoteVoterIds : undefined;
          const effectiveWolfCount = effectiveVoterIds ? effectiveVoterIds.length : wolfCount;
          const voteCountForThis = wolfVotes
            ? (effectiveVoterIds
                ? effectiveVoterIds.filter(wid => wolfVotes[wid] === pos.playerId).length
                : Object.values(wolfVotes).filter(t => t === pos.playerId).length)
            : 0;
          const isDead = (deadPlayers || []).includes(pos.playerId);
          const isSwapSelected = swapSource === pos.playerId;

          let boxShadow = "";
          if (seerResult && seerResult.playerId === pos.playerId) {
            boxShadow = seerResult.isWolf
              ? "0 0 0 8px #d00, 0 0 16px 8px #222"
              : "0 0 0 8px #222, 0 0 16px 8px #d00";
          }

          const isWitchDanger = !!dangerPlayerId && dangerPlayerId === pos.playerId;
          const dangerShadow = isWitchDanger ? "0 0 0 6px rgba(220,0,0,0.95), 0 0 14px rgba(220,0,0,0.55)" : "";
          const mergedBoxShadow = [boxShadow, dangerShadow].filter(Boolean).join(", ");

          const showSelectedOutline = !!selectedOutlinePlayerId && selectedOutlinePlayerId === pos.playerId;
          const showWolfBadge = !!showWolfBadges && (wolfBadgePlayerIds || []).includes(p.id);

          return (
            <div
              key={pos.playerId}
              onPointerDown={(e) => {
                if (!isEditor) return;
                if (swapSource === "SELECTING") {
                  setSwapSource(pos.playerId);
                } else if (swapSource) {
                  onPointerDown(e, pos.playerId); // Trigger swap logic
                } else {
                  onPointerDown(e, pos.playerId); // Trigger drag
                }
              }}
              onClick={() => {
                if (!dragging) onPlayerClick(p.id);
              }}
              className={isWitchDanger ? "witch-danger" : undefined}
              style={{
                position: "absolute",
                left,
                top,
                transform: "translate(-50%,-50%)",
                width: circleSizePx,
                height: circleSizePx,
                borderRadius: circleRadiusPx,
                background: "#fff",
                border: isSwapSelected ? "3px solid #2196F3" : "2px solid #333",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 12,
                cursor: isEditor ? (swapSource ? "crosshair" : "grab") : "pointer",
                opacity: isDead ? 0.4 : 1,
                zIndex: dragging === pos.playerId ? 10 : 1,
                boxShadow: mergedBoxShadow || undefined,
                outline: showSelectedOutline ? "3px solid rgba(255,165,0,0.9)" : undefined,
                transition: dragging === pos.playerId
                  ? "none"
                  : "left 0.2s, top 0.2s, width 220ms ease, height 220ms ease, border-radius 220ms ease", // Smooth move + resize
              }}
            >
              {showWolfVoteBadges && effectiveWolfCount >= 2 && voteCountForThis > 0 && (
                <div style={{
                  position: "absolute",
                  top: -10,
                  right: -10,
                  background: "#b71c1c",
                  color: "#fff",
                  borderRadius: 10,
                  padding: "2px 6px",
                  fontSize: 11,
                  fontWeight: "bold",
                }}>
                  {voteCountForThis}/{effectiveWolfCount}
                </div>
              )}

              {showWolfBadge && (
                <div style={{
                  position: "absolute",
                  top: -10,
                  left: -10,
                  background: "#000",
                  color: "#fff",
                  padding: "2px 6px",
                  borderRadius: 6,
                  fontSize: 11,
                  fontWeight: "bold",
                  opacity: 0.9,
                }}>
                  Sói
                </div>
              )}

              {p.connected === false && (
                <div style={{
                  position: "absolute",
                  bottom: -10,
                  left: "50%",
                  transform: "translateX(-50%)",
                  background: "#555",
                  color: "#fff",
                  padding: "2px 6px",
                  borderRadius: 6,
                  fontSize: 11,
                  fontWeight: "bold",
                  opacity: 0.9,
                  width: "max-content",
                }}>
                  Mất kết nối
                </div>
              )}

              <div style={{ textAlign: "center", pointerEvents: "none" }}>
                <div style={{ fontWeight: "bold" }}>{p.name}</div>
                <div style={{ opacity: 0.6, fontSize: 11 }}>
                  {p.id === socket.id ? "(Bạn)" : ""}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
