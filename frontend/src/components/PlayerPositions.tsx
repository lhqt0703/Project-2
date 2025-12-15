import React, { useEffect, useRef, useState } from "react";
import { socket } from "../socket";
import { useRoomContext } from "../context/RoomContext";

interface PlayerPosition {
  playerId: string;
  x: number;
  y: number;
}

const CIRCLE_SIZE_PX = 72; // Match Game.tsx size
const CIRCLE_RADIUS_PX = CIRCLE_SIZE_PX / 2;
const CIRCLE_BORDER_PX = 2;
const BOUNDARY_MARGIN_PX = 12;
const DEFAULT_GAP_PX = 13.3;
const SNAP_AXIS_THRESHOLD_PX = 25;
const SNAP_MAX_DISTANCE_PX = 100;

const FRAME_HEIGHT_PX = 470;
const TOP_AREA_HEIGHT_PX = 350;
const AUTO_MAX_COLS = 7;
const AUTO_BOUNDARY_MARGIN_PX = 2; // allow fitting 7 across like user expects

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

function clampToBounds<T extends { x: number; y: number }>(pos: T, rect: DOMRect): T {
  const marginX = (CIRCLE_RADIUS_PX + CIRCLE_BORDER_PX + BOUNDARY_MARGIN_PX) / rect.width;
  const marginY = (CIRCLE_RADIUS_PX + CIRCLE_BORDER_PX + BOUNDARY_MARGIN_PX) / rect.height;
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
  lockedAxis?: "x" | "y"
) {
  const minDistPx = CIRCLE_SIZE_PX;
  const minDistSq = minDistPx * minDistPx;

  let x = candidate.x;
  let y = candidate.y;

  const margin = clampToBounds({ x, y }, rect);
  x = margin.x;
  y = margin.y;

  const resolve1D = (axis: "x" | "y") => {
    for (let iter = 0; iter < 18; iter++) {
      let moved = false;
      for (const o of others) {
        const dxPx = (x - o.x) * rect.width;
        const dyPx = (y - o.y) * rect.height;

        const d2 = dxPx * dxPx + dyPx * dyPx;
        if (d2 >= minDistSq) continue;

        if (axis === "x") {
          const absDx = Math.abs(dxPx);
          if (absDx >= minDistPx) continue;
          const requiredDy = Math.sqrt(minDistSq - absDx * absDx);
          const lo = o.y - requiredDy / rect.height;
          const hi = o.y + requiredDy / rect.height;
          if (y > lo && y < hi) {
            const up = hi;
            const down = lo;
            const marginY = (CIRCLE_RADIUS_PX + CIRCLE_BORDER_PX) / rect.height;
            const upC = clamp(up, marginY, 1 - marginY);
            const downC = clamp(down, marginY, 1 - marginY);

            const preferUp = (dyPx || 1) >= 0;
            const candidates = preferUp ? [upC, downC] : [downC, upC];
            let chosen: number | null = null;
            for (const c of candidates) {
              if (!(c > lo && c < hi)) {
                chosen = c;
                break;
              }
            }
            if (chosen === null) return false;
            y = chosen;
            moved = true;
          }
        } else {
          const absDy = Math.abs(dyPx);
          if (absDy >= minDistPx) continue;
          const requiredDx = Math.sqrt(minDistSq - absDy * absDy);
          const lo = o.x - requiredDx / rect.width;
          const hi = o.x + requiredDx / rect.width;
          if (x > lo && x < hi) {
            const right = hi;
            const left = lo;
            const marginX = (CIRCLE_RADIUS_PX + CIRCLE_BORDER_PX) / rect.width;
            const rightC = clamp(right, marginX, 1 - marginX);
            const leftC = clamp(left, marginX, 1 - marginX);

            const preferRight = (dxPx || 1) >= 0;
            const candidates = preferRight ? [rightC, leftC] : [leftC, rightC];
            let chosen: number | null = null;
            for (const c of candidates) {
              if (!(c > lo && c < hi)) {
                chosen = c;
                break;
              }
            }
            if (chosen === null) return false;
            x = chosen;
            moved = true;
          }
        }
      }
      const clamped = clampToBounds({ x, y }, rect);
      x = clamped.x;
      y = clamped.y;
      if (!moved) break;
    }
    return true;
  };

  const anyOverlap = () => {
    for (const o of others) {
      const dxPx = (x - o.x) * rect.width;
      const dyPx = (y - o.y) * rect.height;
      const d2 = dxPx * dxPx + dyPx * dyPx;
      if (d2 < minDistSq - 0.25) return true;
    }
    return false;
  };

  if (lockedAxis === "x") {
    const ok = resolve1D("x");
    if (ok && !anyOverlap()) return { ...candidate, x, y };
    lockedAxis = undefined;
  } else if (lockedAxis === "y") {
    const ok = resolve1D("y");
    if (ok && !anyOverlap()) return { ...candidate, x, y };
    lockedAxis = undefined;
  }

  for (let iter = 0; iter < 16; iter++) {
    let moved = false;
    for (const o of others) {
      const dxPx = (x - o.x) * rect.width;
      const dyPx = (y - o.y) * rect.height;
      const d2 = dxPx * dxPx + dyPx * dyPx;
      if (d2 >= minDistSq) continue;

      const d = Math.sqrt(d2) || 0.0001;
      const overlap = minDistPx - d;
      const nx = dxPx / d;
      const ny = dyPx / d;

      x += (nx * overlap) / rect.width;
      y += (ny * overlap) / rect.height;

      const clamped = clampToBounds({ x, y }, rect);
      x = clamped.x;
      y = clamped.y;
      moved = true;
    }
    if (!moved) break;
  }

  return { ...candidate, x, y };
}

function applyMagnetSnap(
  rawCandidate: PlayerPosition,
  others: PlayerPosition[],
  rect: DOMRect
): { snapped: PlayerPosition; lockedAxis?: "x" | "y" } {
  const preferredSepPx = CIRCLE_SIZE_PX + DEFAULT_GAP_PX;
  const minSepPx = CIRCLE_SIZE_PX;

  let best: { axis: "x" | "y"; dist: number; axisDelta: number; target: PlayerPosition } | undefined;

  // Invisible magnet on the vertical center axis (x=0.5).
  const centerDxPx = Math.abs((rawCandidate.x - 0.5) * rect.width);
  if (centerDxPx <= SNAP_AXIS_THRESHOLD_PX) {
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
    if (dist > SNAP_MAX_DISTANCE_PX) continue;

    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);

    if (absDx <= SNAP_AXIS_THRESHOLD_PX && absDy > 1) {
      const candidate = { axis: "x" as const, dist, axisDelta: absDx, target: o };
      if (!best || candidate.dist < best.dist || (candidate.dist === best.dist && candidate.axisDelta < best.axisDelta)) {
        best = candidate;
      }
    }
    if (absDy <= SNAP_AXIS_THRESHOLD_PX && absDx > 1) {
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
      const clamped = clampToBounds(snapped, rect);
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
    const clamped = clampToBounds(snapped, rect);
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
  const clamped = clampToBounds(snapped, rect);
  return { snapped: { ...snapped, ...clamped }, lockedAxis: "y" };
}

export default function PlayerPositions({
  onPlayerClick,
}: {
  onPlayerClick: (playerId: string) => void;
}) {
  const { room } = useRoomContext();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const dragOffsetRef = useRef<{ dxPx: number; dyPx: number } | null>(null);
  const [swapSource, setSwapSource] = useState<string | null>(null);

  if (!room) return null;

  const isHost = room.hostId === socket.id;
  const isEditor = room.positionEditors?.includes(socket.id!) || isHost;

  const wolfVotes = (room as any).wolfVotes as Record<string, string | null> | undefined;
  const deadPlayers = (room as any).deadPlayers as string[] | undefined;
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

      const bounded = clampToBounds({ x, y }, rect);
      const rawCandidate: PlayerPosition = { ...current, ...bounded };

      const { snapped, lockedAxis } = applyMagnetSnap(rawCandidate, others, rect);
      const resolved = resolveDraggedNoOverlap(snapped, others, rect, lockedAxis);

      const minDistPx = CIRCLE_SIZE_PX;
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
    const rect = containerRef.current.getBoundingClientRect();
    const ids = room.players.map(p => p.id);
    const n = ids.length;

    // Arrange as a hollow rectangle frame in the TOP area only.
    // First row's top should be 15% of the whole frame height.
    // Use a smaller margin here so 7 columns can fit.
    const marginXpx = CIRCLE_RADIUS_PX + CIRCLE_BORDER_PX + AUTO_BOUNDARY_MARGIN_PX;
    const marginYpx = CIRCLE_RADIUS_PX + CIRCLE_BORDER_PX + AUTO_BOUNDARY_MARGIN_PX;
    const minX = marginXpx;
    const maxX = rect.width - marginXpx;

    const firstRowYpx = FRAME_HEIGHT_PX * 0.15;
    const topAreaMaxYpx = TOP_AREA_HEIGHT_PX - marginYpx;
    const rowStepYpx = CIRCLE_SIZE_PX + DEFAULT_GAP_PX;

    // Pick a compact frame automatically based on n:
    // - keep fixed step = circle+gap (so it doesn't stretch wide)
    // - choose cols/rows that minimize unused perimeter slots and width
    const minStepX = CIRCLE_SIZE_PX + DEFAULT_GAP_PX;
    const availableSpanX = maxX - minX;
    const maxRowsByHeight = Math.max(1, Math.floor((topAreaMaxYpx - firstRowYpx) / rowStepYpx) + 1);

    const computePerimeterSlots = (cols: number, rows: number) =>
      rows <= 1 ? cols : rows === 2 ? 2 * cols : 2 * cols + 2 * (rows - 2);

    let cols = 1;
    let rows = Math.min(n, maxRowsByHeight);
    if (n >= 2) {
      type Candidate = { cols: number; rows: number; slots: number; empty: number; widthSteps: number };
      const candidates: Candidate[] = [];
      const maxColsFeasible = Math.min(AUTO_MAX_COLS, n);
      for (let c = 2; c <= maxColsFeasible; c++) {
        if (minStepX * (c - 1) > availableSpanX + 0.01) continue;
        // try rows from 2..maxRowsByHeight to find the minimal that fits
        for (let r = 2; r <= maxRowsByHeight; r++) {
          const slots = computePerimeterSlots(c, r);
          if (slots < n) continue;
          candidates.push({ cols: c, rows: r, slots, empty: slots - n, widthSteps: c - 1 });
          break;
        }
      }

      if (candidates.length) {
        candidates.sort((a, b) =>
          a.empty - b.empty || a.widthSteps - b.widthSteps || a.rows - b.rows || a.cols - b.cols
        );
        cols = candidates[0]!.cols;
        rows = candidates[0]!.rows;
      }
    }

    const xStepPx = cols === 1 ? 0 : minStepX;
    const xStartPx = cols === 1 ? rect.width / 2 : (rect.width / 2 - (xStepPx * (cols - 1)) / 2);

    const rowY = (r: number) => Math.min(firstRowYpx + r * rowStepYpx, topAreaMaxYpx);
    const colX = (c: number) => (cols === 1 ? rect.width / 2 : (xStartPx + c * xStepPx));

    const slots: Array<{ xPx: number; yPx: number }> = [];

    if (cols === 1) {
      // Single column: stack down.
      for (let i = 0; i < n; i++) slots.push({ xPx: rect.width / 2, yPx: rowY(i) });
    } else if (rows <= 2) {
      // Two rows (top+bottom). Fill bottom first, then top edges-in.
      const bottomY = rowY(rows - 1);
      for (let c = 0; c < cols; c++) slots.push({ xPx: colX(c), yPx: bottomY });
      const topY = rowY(0);
      const order: number[] = [];
      for (let k = 0; k < cols; k++) {
        const left = k;
        const right = cols - 1 - k;
        if (left > right) break;
        order.push(left);
        if (right !== left) order.push(right);
      }
      for (const c of order) slots.push({ xPx: colX(c), yPx: topY });
    } else {
      // Full frame: bottom row, side walls, then top row edges-in.
      const bottomY = rowY(rows - 1);
      for (let c = 0; c < cols; c++) slots.push({ xPx: colX(c), yPx: bottomY });

      for (let r = rows - 2; r >= 1; r--) {
        const y = rowY(r);
        slots.push({ xPx: colX(0), yPx: y });
        slots.push({ xPx: colX(cols - 1), yPx: y });
      }

      const topY = rowY(0);
      const order: number[] = [];
      for (let k = 0; k < cols; k++) {
        const left = k;
        const right = cols - 1 - k;
        if (left > right) break;
        order.push(left);
        if (right !== left) order.push(right);
      }
      for (const c of order) slots.push({ xPx: colX(c), yPx: topY });
    }

    // Safety: if not enough perimeter slots (shouldn't happen for normal counts),
    // append a simple interior grid instead of stacking multiple players onto one spot.
    if (slots.length < n) {
      const used = new Set(slots.map(s => `${Math.round(s.xPx)}:${Math.round(s.yPx)}`));
      const interiorStartY = rowY(1);
      const interiorEndY = rowY(Math.max(1, rows - 2));
      const interiorCols = Math.max(1, cols - 2);
      const interiorX0 = colX(1);
      for (let i = 0; slots.length < n && i < 2000; i++) {
        const c = i % interiorCols;
        const r = Math.floor(i / interiorCols);
        const x = interiorX0 + c * xStepPx;
        const y = Math.min(interiorStartY + r * rowStepYpx, interiorEndY);
        const key = `${Math.round(x)}:${Math.round(y)}`;
        if (used.has(key)) continue;
        used.add(key);
        slots.push({ xPx: x, yPx: y });
      }
    }

    const newPos: PlayerPosition[] = [];
    for (let i = 0; i < n; i++) {
      const s = slots[i]!;
      const p: PlayerPosition = {
        playerId: ids[i]!,
        x: s.xPx / rect.width,
        y: s.yPx / rect.height,
      };
      newPos.push(clampToBounds(quantizePos(p), rect));
    }

    socket.emit("updatePositions", { roomId: room.id, positions: newPos });
  };

  return (
    <div style={{ position: "relative", width: "100%", maxWidth: 600, margin: "0 auto" }}>
      {isEditor && (
        <div style={{ marginBottom: 8, display: "flex", gap: 8, justifyContent: "center" }}>
          <button onClick={() => setSwapSource(prev => prev ? null : "SELECTING")}>
            {swapSource ? "Hủy đổi chỗ" : "Đổi chỗ"}
          </button>
          <button onClick={autoArrange}>Tự xếp</button>
        </div>
      )}
      
      <div
        ref={containerRef}
        style={{
          width: "100%",
          height: FRAME_HEIGHT_PX,
          background: "#f0f0f0",
          borderRadius: 10,
          position: "relative",
          touchAction: "none",
          overflow: "hidden",
        }}
        onPointerMove={handlePointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
      >
        {/* center marker */}
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            transform: "translate(-50%,-50%)",
            pointerEvents: "none",
          }}
        >
          <div style={{ width: 6, height: 6, borderRadius: 3, background: "#666" }} />
        </div>

        {localPositions.map((pos) => {
          const p = room.players.find((x) => x.id === pos.playerId);
          if (!p) return null;

          const left = `${pos.x * 100}%`;
          const top = `${pos.y * 100}%`;

          const voteCountForThis = wolfVotes ? Object.values(wolfVotes).filter(t => t === pos.playerId).length : 0;
          const isDead = (deadPlayers || []).includes(pos.playerId);
          const isSwapSelected = swapSource === pos.playerId;

          return (
            <div
              key={pos.playerId}
              onPointerDown={(e) => {
                if (swapSource === "SELECTING") {
                  setSwapSource(pos.playerId);
                } else if (swapSource) {
                  onPointerDown(e, pos.playerId); // Trigger swap logic
                } else {
                  onPointerDown(e, pos.playerId); // Trigger drag
                }
              }}
              onClick={() => {
                if (!isEditor && !dragging) onPlayerClick(p.id);
                // If editor, click is handled by pointer events mostly, but we might want to allow click if not dragged
              }}
              style={{
                position: "absolute",
                left,
                top,
                transform: "translate(-50%,-50%)",
                width: 72,
                height: 72,
                borderRadius: 36,
                background: "#fff",
                border: isSwapSelected ? "3px solid #2196F3" : "2px solid #333",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 12,
                cursor: isEditor ? (swapSource ? "crosshair" : "grab") : "pointer",
                opacity: isDead ? 0.4 : 1,
                zIndex: dragging === pos.playerId ? 10 : 1,
                transition: dragging === pos.playerId ? "none" : "left 0.2s, top 0.2s", // Smooth swap animation
              }}
            >
              {wolfCount >= 2 && voteCountForThis > 0 && (
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
                  {voteCountForThis}/{wolfCount}
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
