export type PlayerPos = { playerId: string; x: number; y: number };

export type PositionableRoom = {
  layoutHeightPx?: number;
  compactCircles?: boolean;
  positions?: PlayerPos[];
};

export type PositionLayout = {
  widthPx: number;
  heightPx: number;
  radiusPx: number;
  defaultGapPx: number;
  paddingPx: number;
};

export const POSITION_LAYOUT: PositionLayout = {
  widthPx: 600,
  heightPx: 470,
  radiusPx: 40,
  defaultGapPx: 13.3,
  paddingPx: 6,
};

export const BASE_FRAME_HEIGHT_PX = POSITION_LAYOUT.heightPx;
export const EXTRA_FRAME_HEIGHT_PX = 100;
export const EXPANDED_FRAME_HEIGHT_PX = BASE_FRAME_HEIGHT_PX + EXTRA_FRAME_HEIGHT_PX;
export const AUTO_TOP_LIMIT = 18;

export const COMPACT_RADIUS_PX = 23;

export const JOIN_LAYOUT = {
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

export function clampToBounds(pos: PlayerPos, opts = POSITION_LAYOUT): PlayerPos {
  const marginX = (opts.radiusPx + opts.paddingPx) / opts.widthPx;
  const marginY = (opts.radiusPx + opts.paddingPx) / opts.heightPx;
  return {
    ...pos,
    x: Math.max(marginX, Math.min(1 - marginX, clamp01(pos.x))),
    y: Math.max(marginY, Math.min(1 - marginY, clamp01(pos.y))),
  };
}

export function layoutOptsForRoom(room: PositionableRoom) {
  const heightPx = room.layoutHeightPx ?? BASE_FRAME_HEIGHT_PX;
  const radiusPx = room.compactCircles ? COMPACT_RADIUS_PX : POSITION_LAYOUT.radiusPx;
  return { ...POSITION_LAYOUT, heightPx, radiusPx };
}

export function desiredLayoutHeightPx(playerCount: number) {
  return playerCount > AUTO_TOP_LIMIT ? EXPANDED_FRAME_HEIGHT_PX : BASE_FRAME_HEIGHT_PX;
}

export function rescaleRoomPositionsForHeight(room: PositionableRoom, nextHeightPx: number) {
  const prevHeightPx = room.layoutHeightPx ?? BASE_FRAME_HEIGHT_PX;
  if (prevHeightPx === nextHeightPx) return false;

  const factor = prevHeightPx / nextHeightPx;
  const nextOpts = { ...POSITION_LAYOUT, heightPx: nextHeightPx };

  room.positions = (room.positions || []).map((p) => {
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
    anchorStrength?: number;
    iterations?: number;
  },
  opts = POSITION_LAYOUT
) {
  const anchors = new Map<string, { x: number; y: number }>();
  if (anchoredIds) {
    positions.forEach((p) => {
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
  const preferJoinRow = !isExpanded && existing.length < 17;

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

export function generateCirclePositions(playerIds: string[]) {
  const n = playerIds.length;
  return playerIds.map((id, i) => {
    const angle = (i / n) * 2 * Math.PI - Math.PI / 2;
    return {
      playerId: id,
      x: 0.5 + 0.35 * Math.cos(angle),
      y: 0.5 + 0.35 * Math.sin(angle),
    };
  });
}

export function ensureNonOverlappingPositions(playerIds: string[], existingPositions?: PlayerPos[], opts = POSITION_LAYOUT): PlayerPos[] {
  const byId = new Map<string, PlayerPos>();
  (existingPositions || []).forEach((p) => {
    byId.set(p.playerId, clampToBounds({ ...p }, opts));
  });

  const anchoredIds = new Set<string>();
  const result: PlayerPos[] = [];

  for (const id of playerIds) {
    const ex = byId.get(id);
    if (ex) {
      anchoredIds.add(id);
      result.push({ ...ex });
    }
  }

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

    const fallback = generateCirclePositions([id])[0]!;
    result.push(clampToBounds({ ...fallback, playerId: id }, opts));
  }

  resolveOverlaps(
    result,
    {
      minDistPx: hardMinDistPx,
      anchoredIds,
      anchorStrength: 0.02,
      iterations: 260,
    },
    opts
  );

  return result;
}

export function resolveDraggedAgainstFixedOthers(dragged: PlayerPos, fixedOthers: PlayerPos[], opts = POSITION_LAYOUT): PlayerPos {
  const minDistPx = 2 * opts.radiusPx;
  const minDistSq = minDistPx * minDistPx;

  let p: PlayerPos = clampToBounds({ ...dragged }, opts);

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

  for (const o of fixedOthers) {
    if (isTooClose(p, o, minDistPx, opts)) {
      const fallback = ensureNonOverlappingPositions(
        [p.playerId, ...fixedOthers.map((x) => x.playerId)],
        [p, ...fixedOthers],
        opts
      );
      const fixed = fallback.find((x) => x.playerId === p.playerId);
      return fixed ? fixed : p;
    }
  }

  return p;
}

export function generateRoomId(activeRooms: Set<string>) {
  let id;
  do {
    id = String(Math.floor(Math.random() * 1000)).padStart(3, "0");
  } while (activeRooms.has(id));

  activeRooms.add(id);
  return id;
}