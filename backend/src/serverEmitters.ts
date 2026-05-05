import { getServerContext } from "./serverContext.js";
import {
  ELEMENTAL_BUFF_LABELS,
  ELEMENTAL_GROUP_ROLE,
  ELEMENTAL_ROLE_ORDER,
  ELEMENTAL_ROLE_SET,
  type ElementalBuffId,
  type ElementalRole,
} from "./elemental.js";
import { WOLF_TURN_DURATION_MS } from "./gameConfig.js";
import {
  ensureRoomGameRules,
  type RolesRevealPayload,
  type Room,
} from "./serverTypes.js";
import {
  ensureWitchState,
  getSpiritWolfId,
  getWitches,
  isWolfRole,
} from "./roomState.js";

export function toPublicRoom(room: Room) {
  ensureRoomGameRules(room);
  const {
    wolfTimer: _wolfTimer,
    seerUsedTonight: _seerUsedTonight,
    witchPotions: _witchPotions,
    witchHealTargetTonight: _witchHealTargetTonight,
    witchPoisonTargetTonight: _witchPoisonTargetTonight,
    hunterTargetTonight: _hunterTargetTonight,
    gameLog: _gameLog,
    playerRoles: _playerRoles,
    wolves: _wolves,
    wolfVotes: _wolfVotes,
    wolfVotes2: _wolfVotes2,
    wolfLocked: _wolfLocked,
    dayDiscussionTimer: _dayDiscussionTimer,
    dayTimer: _dayTimer,
    trialDefenseTimer: _trialDefenseTimer,
    trialVerdictTimer: _trialVerdictTimer,
    nightTurnTimer: _nightTurnTimer,
    pendingRoleAssignments: _pendingRoleAssignments,
    wolfDeadline: _wolfDeadline,
    killedTonight: _killedTonight,
    killedTonightExtra: _killedTonightExtra,
    protectedTonight: _protectedTonight,
    lastProtected: _lastProtected,
    spiritWolfPendingPoisonedWolfId: _spiritWolfPendingPoisonedWolfId,
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
  const baseDurationMs = WOLF_TURN_DURATION_MS;
  if (isElementalBuffActive(room, "reduce-next-night-effect")) {
    return Math.max(1, Math.floor(baseDurationMs / 2));
  }
  return baseDurationMs;
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

  if (isWolfRole(role)) {
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
