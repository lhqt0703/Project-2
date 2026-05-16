import { getServerContext } from "./serverContext.js";
import {
  ELEMENTAL_BUFF_LABELS,
  ELEMENTAL_GROUP_ROLE,
  ELEMENTAL_ROLE_ORDER,
  ELEMENTAL_ROLE_SET,
  type ElementalBuffId,
  type ElementalRole,
} from "./elemental.js";
import { clampNonWolfNightActionDurationSec, clampWolfNightActionDurationSec } from "./gameConfig.js";
import {
  ensureRoomGameRules,
  type RolesRevealPayload,
  type Room,
} from "./serverTypes.js";
import {
  ensureWitchState,
  getSpiritWolfId,
  getWitches,
  isWolfAlignedPlayer,
  isWolfRole,
} from "./roomState.js";
import { LOVE_ROLE, emitLoveStateToPlayer, isLovePairMemberAwayAt } from "./love.js";

export function toPublicRoom(room: Room) {
  ensureRoomGameRules(room);
  const {
    wolfTimer: _wolfTimer,
    seerUsedTonight: _seerUsedTonight,
    witchPotions: _witchPotions,
    witchHealTargetTonight: _witchHealTargetTonight,
    witchPoisonTargetTonight: _witchPoisonTargetTonight,
    hunterTargetTonight: _hunterTargetTonight,
    loveCupidId: _loveCupidId,
    loveTargetId: _loveTargetId,
    loveTargetWolfAligned: _loveTargetWolfAligned,
    lovePairCreatedNight: _lovePairCreatedNight,
    loveEscapeUsed: _loveEscapeUsed,
    loveEscapeVotesTonight: _loveEscapeVotesTonight,
    loveEscapeVoteAt: _loveEscapeVoteAt,
    loveEscapeActiveTonight: _loveEscapeActiveTonight,
    loveEscapeActivatedAt: _loveEscapeActivatedAt,
    wolfAttackResolvedAt: _wolfAttackResolvedAt,
    protectedTonightAt: _protectedTonightAt,
    witchHealTargetAt: _witchHealTargetAt,
    witchPoisonTargetAt: _witchPoisonTargetAt,
    gameLog: _gameLog,
    playerRoles: _playerRoles,
    wolves: _wolves,
    wolfVotes: _wolfVotes,
    wolfVotes2: _wolfVotes2,
    wolfLocked: _wolfLocked,
    wolfVoteResolvedTonight: _wolfVoteResolvedTonight,
    dayDiscussionTimer: _dayDiscussionTimer,
    dayTimer: _dayTimer,
    trialDefenseTimer: _trialDefenseTimer,
    trialVerdictTimer: _trialVerdictTimer,
    nightTurnTimer: _nightTurnTimer,
    pendingRoleAssignments: _pendingRoleAssignments,
    pendingRoleBlocks: _pendingRoleBlocks,
    wolfDeadline: _wolfDeadline,
    killedTonight: _killedTonight,
    killedTonightExtra: _killedTonightExtra,
    protectedTonight: _protectedTonight,
    lastProtected: _lastProtected,
    spiritWolfPendingPoisonedWolfId: _spiritWolfPendingPoisonedWolfId,
    hunterShotPlayerIds: _hunterShotPlayerIds,
    elementalTargetTonight: _elementalTargetTonight,
    elementalCorrectGuessPlayerIdsTonight: _elementalCorrectGuessPlayerIdsTonight,
    elementalBuffVotesTonight: _elementalBuffVotesTonight,
    ...rest
  } = room;

  return {
    ...rest,
    players: room.players.map((p) => ({
      id: p.id,
      name: p.name,
      connected: p.connected !== false,
      inGame: p.inGame === true,
    })),
  };
}

function getSelectedElementalRoles(room: Room): ElementalRole[] {
  const sourceRoles = room.playerRoles ? Object.values(room.playerRoles) : room.roles || [];
  return ELEMENTAL_ROLE_ORDER.filter((role) => sourceRoles.includes(role));
}

function isElementalRoleTurn(role: string | null | undefined): role is ElementalRole {
  return !!role && ELEMENTAL_ROLE_SET.has(role);
}

function shouldElementalsVoteBuffTonight(room: Room) {
  return !!room.elementalPendingBuffVoteNight && room.elementalPendingBuffVoteNight === (room.nightCount || 0);
}

function isElementalQuickMode(room: Room) {
  const rules = ensureRoomGameRules(room);
  if (rules.allNightActionsSimultaneous) return false;
  return rules.nightActionOrder[0] === ELEMENTAL_GROUP_ROLE;
}

function isElementalBuffActive(room: Room, buffId: ElementalBuffId) {
  return room.elementalSelectedBuffId === buffId
    && room.elementalSelectedBuffAppliesNight === (room.nightCount || 0);
}

function getWolfTurnDurationMs(room: Room) {
  const rules = ensureRoomGameRules(room);
  const baseDurationMs = Math.max(
    0,
    Math.floor(clampWolfNightActionDurationSec(rules.wolfNightActionDurationSec) * 1000),
  );
  if (baseDurationMs <= 0) return 0;
  if (isElementalBuffActive(room, "reduce-next-night-effect")) {
    return Math.max(1, Math.floor(baseDurationMs / 2));
  }
  return baseDurationMs;
}

export function getHostNightActionProgressByPlayerId(room: Room): Record<string, "pending" | "done"> {
  const rules = ensureRoomGameRules(room);
  if (!rules.allNightActionsSimultaneous) return {};
  if (room.phase !== "night") return {};
  if (room.gameOver) return {};

  const dead = new Set(room.deadPlayers || []);
  const progress: Record<string, "pending" | "done"> = {};
  const currentNight = room.nightCount || 0;
  const now = Date.now();
  const isElementalBuffVoteNight = shouldElementalsVoteBuffTonight(room);
  const seerRequiredChecks =
    room.elementalSelectedBuffId === "seer-check-two" && room.elementalSelectedBuffAppliesNight === currentNight
      ? 2
      : 1;
  const nonWolfDurationSec = clampNonWolfNightActionDurationSec(rules.nonWolfNightActionDurationSec);
  const wolfDurationSec = clampWolfNightActionDurationSec(rules.wolfNightActionDurationSec);
  const witchBonusApplies =
    nonWolfDurationSec > 0
    && wolfDurationSec === nonWolfDurationSec;

  const nonWolfPendingStillActive = (role: string | null | undefined) => {
    const baseDeadline = room.nightTurnDeadline ?? null;
    if (!baseDeadline) return true;
    const deadline = role === "Phù thủy" && witchBonusApplies ? baseDeadline + 10_000 : baseDeadline;
    return now < deadline;
  };

  const setProgress = (playerId: string, status: "pending" | "done", role: string | null | undefined) => {
    if (status === "pending" && !nonWolfPendingStillActive(role)) return;
    progress[playerId] = status;
  };

  for (const player of room.players) {
    const playerId = player.id;
    if (playerId === room.hostId) continue;
    if (dead.has(playerId)) continue;

    const role = room.playerRoles?.[playerId];
    if (!role) continue;

    if (isWolfAlignedPlayer(room, playerId)) {
      const status = room.wolfLocked?.[playerId] === true ? "done" : "pending";
      if (status === "pending" && room.wolfVoteResolvedTonight) continue;
      if (status === "pending" && room.wolfDeadline && now >= room.wolfDeadline) continue;
      progress[playerId] = status;
      continue;
    }

    if (role === LOVE_ROLE) {
      if (currentNight !== 1) continue;
      setProgress(playerId, room.loveTargetId ? "done" : "pending", role);
      continue;
    }

    if (role === "Bảo vệ") {
      setProgress(playerId, room.protectedTonightAt ? "done" : "pending", role);
      continue;
    }

    if (role === "Phù thủy") {
      const healDone = !!room.witchHealTargetAt?.[playerId];
      const poisonDone = !!room.witchPoisonTargetAt?.[playerId];
      const noPotionLeft =
        room.witchPotions?.[playerId]?.healUsed === true
        && room.witchPotions?.[playerId]?.poisonUsed === true;
      setProgress(playerId, healDone || poisonDone || noPotionLeft ? "done" : "pending", role);
      continue;
    }

    if (role === "Linh sói") {
      if (!room.spiritWolfPendingPoisonedWolfId && !room.spiritWolfDecisionMade) continue;
      setProgress(playerId, room.spiritWolfDecisionMade ? "done" : "pending", role);
      continue;
    }

    if (role === "Thợ săn") {
      setProgress(playerId, room.hunterTargetTonight?.[playerId] ? "done" : "pending", role);
      continue;
    }

    if (role === "Tiên tri") {
      const usedChecks = room.seerUsedTonight?.[playerId] || 0;
      setProgress(playerId, usedChecks >= seerRequiredChecks ? "done" : "pending", role);
      continue;
    }

    if (isElementalRoleTurn(role)) {
      if (isElementalBuffVoteNight) {
        setProgress(playerId, room.elementalBuffVotesTonight?.[playerId] ? "done" : "pending", role);
      } else {
        setProgress(playerId, room.elementalTargetTonight?.[playerId] ? "done" : "pending", role);
      }
    }
  }

  return progress;
}

export function getWitchPendingDeaths(room: Room): string[] {
  const rules = ensureRoomGameRules(room);
  const guardianTarget = room.protectedTonight;
  const dead = new Set(room.deadPlayers || []);

  const hideProtectedBite =
    rules.allNightActionsSimultaneous
      ? rules.witchHideProtectedBiteInSimultaneous
      : rules.witchHideProtectedBiteWhenSequential;

  const candidates = [room.killedTonight, room.killedTonightExtra]
    .filter(Boolean)
    .filter((pid) => !isLovePairMemberAwayAt(room, pid as string, room.wolfAttackResolvedAt || Date.now()))
    .filter((pid) => (hideProtectedBite ? pid !== guardianTarget : true)) as string[];

  const unique: string[] = [];
  for (const pid of candidates) {
    if (!pid) continue;
    if (dead.has(pid)) continue;
    if (!room.players.find((p) => p.id === pid)) continue;
    if (!unique.includes(pid)) unique.push(pid);
  }
  return unique;
}

export function emitGameLogToSocket(roomId: string, socketId: string) {
  const ctx = getServerContext();
  if (!ctx) return;
  const room = ctx.rooms[roomId];
  if (!room) return;
  ctx.io.to(socketId).emit("gameLogUpdated", { roomId, nights: room.gameLog || [] });
}

export function emitRolesRevealToSocket(roomId: string, socketId: string) {
  const ctx = getServerContext();
  if (!ctx) return;
  const room = ctx.rooms[roomId];
  if (!room) return;
  ctx.io.to(socketId).emit("rolesRevealUpdated", {
    roomId,
    rolesByPlayerId: room.playerRoles || {},
  } satisfies RolesRevealPayload);
}

export function emitWitchPendingDeath(roomId: string) {
  const ctx = getServerContext();
  if (!ctx) return;
  const room = ctx.rooms[roomId];
  if (!room) return;

  const rules = ensureRoomGameRules(room);
  const pendingTargets = getWitchPendingDeaths(room);
  for (const wid of getWitches(room)) {
    ensureWitchState(room, wid);
    const healUsed = room.witchPotions?.[wid]?.healUsed === true;
    const canSeePending = !rules.witchSeeBiteOnlyIfHasHealPotion || !healUsed;
    const targetIds = canSeePending ? pendingTargets : [];
    ctx.io.to(wid).emit("witchPendingDeath", { targetId: targetIds[0] ?? null, targetIds });
  }
}

export function emitWitchPotions(roomId: string, witchId: string) {
  const ctx = getServerContext();
  if (!ctx) return;
  const room = ctx.rooms[roomId];
  if (!room) return;
  ensureWitchState(room, witchId);
  ctx.io.to(witchId).emit("witchPotionsUpdated", room.witchPotions![witchId]);
}

export function emitSpiritWolfDecisionNeeded(roomId: string) {
  const ctx = getServerContext();
  if (!ctx) return;
  const room = ctx.rooms[roomId];
  if (!room) return;
  if (room.gameOver) return;
  const swid = getSpiritWolfId(room);
  if (!swid) return;
  if ((room.deadPlayers || []).includes(swid)) return;
  if (room.spiritWolfDecisionMade) return;
  const targetId = room.spiritWolfPendingPoisonedWolfId;
  if (!targetId) return;
  if ((room.deadPlayers || []).includes(targetId)) return;
  ctx.io.to(swid).emit("spiritWolfDecisionNeeded", { targetId });
}

export function emitHunterTarget(roomId: string, hunterId: string) {
  const ctx = getServerContext();
  if (!ctx) return;
  const room = ctx.rooms[roomId];
  if (!room) return;
  const targetId = room.hunterTargetTonight?.[hunterId] ?? null;
  ctx.io.to(hunterId).emit("hunterTargetUpdated", { targetId });
}

export function syncPrivateRoleStateForSocket(
  socket: any,
  roomId: string,
  room: Room,
  playerId: string,
) {
  const ctx = getServerContext();
  if (!ctx) return;
  const role = room.playerRoles?.[playerId];
  if (!role) return;

  socket.emit("yourRole", role);
  emitLoveStateToPlayer(ctx, roomId, room, playerId);

  if (isWolfAlignedPlayer(room, playerId)) {
    socket.join(`wolves_${roomId}`);
  } else {
    socket.leave(`wolves_${roomId}`);
  }

  if (role === "Phù thủy") {
    socket.join(`witches_${roomId}`);
    ensureWitchState(room, playerId);
    emitWitchPotions(roomId, playerId);
  } else {
    socket.leave(`witches_${roomId}`);
  }
}

export function broadcastElementalBuffSelection(
  roomId: string,
  payload: {
    buffId: ElementalBuffId | null;
    tier: number;
    appliesNight: number | null;
    randomTieBreak: boolean;
  },
) {
  const ctx = getServerContext();
  if (!ctx) return;
  const label = payload.buffId ? ELEMENTAL_BUFF_LABELS[payload.buffId] : null;
  ctx.io.to(roomId).emit("elementalBuffSelected", {
    ...payload,
    label,
  });
}

export {
  getSelectedElementalRoles,
  getWolfTurnDurationMs,
  isElementalBuffActive,
  isElementalQuickMode,
  isElementalRoleTurn,
  shouldElementalsVoteBuffTonight,
};
