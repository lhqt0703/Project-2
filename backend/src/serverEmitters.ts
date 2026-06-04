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
  type GameLogNight,
  type RolesRevealPayload,
  type Room,
} from "./serverTypes.js";
import {
  ensureWitchState,
  getActiveWolves,
  getAlivePlayerIds,
  getSpiritWolfId,
  getWitches,
  canPlayerActAtNight,
  isWolfAlignedPlayer,
} from "./roomState.js";
import { LOVE_ROLE, emitLoveStateToPlayer, isLovePairMemberAwayAt, isLovePartnerChoiceNight } from "./love.js";
import {
  CURSED_ROLE,
  MERCHANT_ROLE,
  canUseCursedSniff,
  getActiveGuardianProtectedTargetIds,
  getActiveMerchantItems,
  getCursedMaxSniffUses,
  getCursedSniffUseCount,
  getMerchantAvailableItemIds,
  getVisibleGuardianProtectionTargetId,
} from "./merchant.js";
import { PROTECTOR_ROLE } from "./specialRoles.js";
import { emitAngelPrivateState } from "./angel.js";

export function toPublicRoom(room: Room) {
  ensureRoomGameRules(room);
  if (room.isReplay) {
    return {
      ...room,
      players: room.players.map((p) => ({
        id: p.id,
        name: p.name,
        connected: p.connected !== false,
        inGame: p.inGame === true,
      })),
    };
  }
  const {
    wolfTimer: _wolfTimer,
    seerUsedTonight: _seerUsedTonight,
    witchPotions: _witchPotions,
    witchHealTargetTonight: _witchHealTargetTonight,
    witchPoisonTargetTonight: _witchPoisonTargetTonight,
    hunterTargetTonight: _hunterTargetTonight,
    protectorActorId: _protectorActorId,
    protectorTargetId: _protectorTargetId,
    protectorTargetSetNight: _protectorTargetSetNight,
    villageChiefPendingWolfDeath: _villageChiefPendingWolfDeath,
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
    protectedTonightBy: _protectedTonightBy,
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
    spiritWolfDecisionTimer: _spiritWolfDecisionTimer,
    pendingRoleAssignments: _pendingRoleAssignments,
    pendingRoleBlocks: _pendingRoleBlocks,
    wolfDeadline: _wolfDeadline,
    wildWolfId: _wildWolfId,
    wildWolfConvertReadyNextNight: _wildWolfConvertReadyNextNight,
    wildWolfConvertAvailableTonight: _wildWolfConvertAvailableTonight,
    wildWolfConvertRequestedTonight: _wildWolfConvertRequestedTonight,
    wildWolfConvertActorId: _wildWolfConvertActorId,
    wildWolfConvertTargetId: _wildWolfConvertTargetId,
    wildWolfConvertUsed: _wildWolfConvertUsed,
    killedTonight: _killedTonight,
    killedTonightExtra: _killedTonightExtra,
    protectedTonight: _protectedTonight,
    lastProtected: _lastProtected,
    spiritWolfPendingPoisonedWolfId: _spiritWolfPendingPoisonedWolfId,
    wildWolfConvertedPlayerIds: _wildWolfConvertedPlayerIds,
    hunterShotPlayerIds: _hunterShotPlayerIds,
    elementalTargetTonight: _elementalTargetTonight,
    elementalCorrectGuessPlayerIdsTonight: _elementalCorrectGuessPlayerIdsTonight,
    elementalBuffVotesTonight: _elementalBuffVotesTonight,
    cursedTargetTonight: _cursedTargetTonight,
    cursedLastTargetByPlayerId: _cursedLastTargetByPlayerId,
    cursedSniffUseCountsByPlayerId: _cursedSniffUseCountsByPlayerId,
    merchantTradeOffersTonight: _merchantTradeOffersTonight,
    merchantLastTargetByPlayerId: _merchantLastTargetByPlayerId,
    merchantItemsByPlayerId: _merchantItemsByPlayerId,
    merchantUsedItemIds: _merchantUsedItemIds,
    merchantSuccessfulTradeCountsByPlayerId: _merchantSuccessfulTradeCountsByPlayerId,
    merchantWinCompletedPlayerIds: _merchantWinCompletedPlayerIds,
    merchantWolfBiteDisabledTonight: _merchantWolfBiteDisabledTonight,
    merchantWolfBiteDisabledNextNight: _merchantWolfBiteDisabledNextNight,
    merchantCheeseMarkedPlayerIds: _merchantCheeseMarkedPlayerIds,
    merchantCheeseMarkedPlayerIdsNextNight: _merchantCheeseMarkedPlayerIdsNextNight,
    merchantGuardianCarryoverTargetId: _merchantGuardianCarryoverTargetId,
    merchantGuardianCarryoverBy: _merchantGuardianCarryoverBy,
    merchantGuardianCarryoverNight: _merchantGuardianCarryoverNight,
    merchantGunpowderExplodedPlayerIdsTonight: _merchantGunpowderExplodedPlayerIdsTonight,
    angelReviveAvailableByPlayerId: _angelReviveAvailableByPlayerId,
    angelReviveUsedPlayerIds: _angelReviveUsedPlayerIds,
    angelReviveRecordsByAngelId: _angelReviveRecordsByAngelId,
    angelHiddenRevivedPlayerIds: _angelHiddenRevivedPlayerIds,
    angelOutcomeLoggedPlayerIds: _angelOutcomeLoggedPlayerIds,
    ...rest
  } = room;

  return {
    ...rest,
    serverTime: Date.now(),
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

export function emitProtectorTarget(roomId: string, protectorId: string) {
  const ctx = getServerContext();
  if (!ctx) return;
  const room = ctx.rooms[roomId];
  if (!room) return;
  const hasUsed = room.protectorActorId === protectorId;
  const targetId = hasUsed ? room.protectorTargetId ?? null : null;
  ctx.io.to(protectorId).emit("protectorTargetUpdated", { targetId, hasUsed });
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
  const firstEffectiveRole = rules.nightActionOrder.find(
    (role) => role !== LOVE_ROLE && role !== MERCHANT_ROLE,
  );
  return firstEffectiveRole === ELEMENTAL_GROUP_ROLE;
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
  const getNightActionExtraMs = (playerId: string) => {
    const extra = room.nightActionExtraTimeMsByPlayerId?.[playerId] || 0;
    return Math.max(0, Math.floor(extra));
  };

  const witchHasUsablePotion = (playerId: string) => {
    const potions = room.witchPotions?.[playerId];
    if (!potions) return true;
    return !(potions.healUsed === true && potions.poisonUsed === true);
  };

  const witchGetsBonus = (playerId: string) => {
    if (!witchBonusApplies) return false;
    if (!rules.witchBonusTimeRequiresUsablePotion) return true;
    return witchHasUsablePotion(playerId);
  };

  const getDeadlineForPlayer = (playerId: string, role: string | null | undefined) => {
    if (isWolfAlignedPlayer(room, playerId)) {
      const wolfDeadline = room.wolfDeadline ?? null;
      if (!wolfDeadline) return null;
      return wolfDeadline + getNightActionExtraMs(playerId);
    }
    if (role === "Linh sói") {
      const spiritDeadline = room.spiritWolfDecisionDeadline ?? null;
      if (!spiritDeadline) return null;
      return spiritDeadline + getNightActionExtraMs(playerId);
    }
    const baseDeadline = room.nightTurnDeadline ?? null;
    if (!baseDeadline) return null;
    let deadline = baseDeadline + getNightActionExtraMs(playerId);
    if (role === "Phù thủy" && witchGetsBonus(playerId)) {
      deadline += 10_000;
    }
    return deadline;
  };

  const pendingStillActive = (playerId: string, role: string | null | undefined) => {
    const deadline = getDeadlineForPlayer(playerId, role);
    if (!deadline) return true;
    return now < deadline;
  };

  const setProgress = (playerId: string, status: "pending" | "done", role: string | null | undefined) => {
    if (status === "pending" && !pendingStillActive(playerId, role)) return;
    progress[playerId] = status;
  };

  for (const player of room.players) {
    const playerId = player.id;
    if (playerId === room.hostId) continue;
    if (dead.has(playerId) && !canPlayerActAtNight(room, playerId)) continue;

    const role = room.playerRoles?.[playerId];
    if (!role) continue;

    if (isWolfAlignedPlayer(room, playerId)) {
      const status = room.wolfLocked?.[playerId] === true ? "done" : "pending";
      if (status === "pending" && room.wolfVoteResolvedTonight) continue;
      setProgress(playerId, status, role);
      continue;
    }

    if (role === LOVE_ROLE) {
      if (!isLovePartnerChoiceNight(room)) continue;
      setProgress(playerId, room.loveTargetId ? "done" : "pending", role);
      continue;
    }

    if (role === "Bảo vệ") {
      setProgress(playerId, room.protectedTonightAt ? "done" : "pending", role);
      continue;
    }

    if (role === PROTECTOR_ROLE) {
      const hasUsed = room.protectorActorId === playerId;
      setProgress(playerId, hasUsed || !!room.protectorTargetId ? "done" : "pending", role);
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
      if (!room.spiritWolfPendingPoisonedWolfId && !room.spiritWolfDecisionDeadline) continue;
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

    if (role === CURSED_ROLE) {
      if (!canUseCursedSniff(room, playerId)) {
        setProgress(playerId, "done", role);
      } else {
        setProgress(playerId, room.cursedTargetTonight?.[playerId] ? "done" : "pending", role);
      }
      continue;
    }

    if (role === MERCHANT_ROLE) {
      if (getMerchantAvailableItemIds(room).length <= 0) continue;
      const offer = room.merchantTradeOffersTonight?.[playerId] || null;
      setProgress(playerId, offer?.resolved ? "done" : "pending", role);
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
  const guardianTargets = new Set(getActiveGuardianProtectedTargetIds(room));
  const dead = new Set(room.deadPlayers || []);

  const hideProtectedBite =
    rules.allNightActionsSimultaneous
      ? rules.witchHideProtectedBiteInSimultaneous
      : rules.witchHideProtectedBiteWhenSequential;

  const candidates = [room.killedTonight, room.killedTonightExtra]
    .filter(Boolean)
    .filter((pid) => !isLovePairMemberAwayAt(room, pid as string, room.wolfAttackResolvedAt || Date.now()))
    .filter((pid) => (hideProtectedBite ? !guardianTargets.has(pid as string) : true)) as string[];

  const unique: string[] = [];
  for (const pid of candidates) {
    if (!pid) continue;
    if (dead.has(pid)) continue;
    if (
      !rules.witchSeeProtectorImmortalBite &&
      room.protectorTargetId === pid &&
      getAlivePlayerIds(room).includes(pid)
    ) {
      continue;
    }
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

function getPublicDayGameLog(room: Room): GameLogNight[] {
  return (room.gameLog || [])
    .map((nightLog) => ({
      ...nightLog,
      entries: (nightLog.entries || []).filter((entry) => entry.phase === "day"),
    }))
    .filter((nightLog) => nightLog.entries.length > 0);
}

export function emitPublicDayGameLogToSocket(roomId: string, socketId: string) {
  const ctx = getServerContext();
  if (!ctx) return;
  const room = ctx.rooms[roomId];
  if (!room) return;
  const nights = room.isReplay ? (room.gameLog || []) : getPublicDayGameLog(room);
  ctx.io.to(socketId).emit("gameLogUpdated", { roomId, nights });
}

export function emitPublicDayGameLogToRoom(roomId: string) {
  const ctx = getServerContext();
  if (!ctx) return;
  const room = ctx.rooms[roomId];
  if (!room) return;
  const nights = room.isReplay ? (room.gameLog || []) : getPublicDayGameLog(room);
  for (const player of room.players || []) {
    if (player.id === room.hostId) continue;
    ctx.io.to(player.id).emit("gameLogUpdated", { roomId, nights });
  }
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
  const deadline = room.nightTurnPaused ? null : room.spiritWolfDecisionDeadline ?? room.nightTurnDeadline ?? null;
  ctx.io.to(swid).emit("spiritWolfDecisionNeeded", {
    targetId,
    deadline,
  });
}

function sanitizeMerchantTradeForPlayer(room: Room, playerId: string) {
  const offers = Object.values(room.merchantTradeOffersTonight || {});
  const offer = offers.find((item) => item.actorId === playerId || item.targetId === playerId) || null;
  if (!offer) return null;

  const isActor = offer.actorId === playerId;
  const canSeeResolvedDetails = offer.resolved === true;
  return {
    actorId: offer.actorId,
    targetId: offer.targetId,
    itemId: isActor || canSeeResolvedDetails ? offer.itemId : null,
    merchantChoice: isActor || canSeeResolvedDetails ? offer.merchantChoice : null,
    targetChoice: offer.targetChoice ?? null,
    resolved: offer.resolved === true,
    result: offer.result ?? null,
    appliesNight: offer.appliesNight,
  };
}

export function buildMerchantPrivateState(room: Room, playerId: string) {
  const hasPoppyGlasses = getActiveMerchantItems(room, playerId).some((item) => item.id === "poppy-glasses");
  return {
    items: room.merchantItemsByPlayerId?.[playerId] || [],
    activeItemIds: getActiveMerchantItems(room, playerId).map((item) => item.id),
    availableStockIds: room.playerRoles?.[playerId] === MERCHANT_ROLE ? getMerchantAvailableItemIds(room) : [],
    trade: sanitizeMerchantTradeForPlayer(room, playerId),
    lastTargetId:
      room.playerRoles?.[playerId] === MERCHANT_ROLE
        ? room.merchantLastTargetByPlayerId?.[playerId] ?? null
        : null,
    poppyGlassesProtectedTargetId: hasPoppyGlasses ? getVisibleGuardianProtectionTargetId(room) : null,
  };
}

export function emitMerchantPrivateState(roomId: string, playerId: string) {
  const ctx = getServerContext();
  if (!ctx) return;
  const room = ctx.rooms[roomId];
  if (!room) return;
  ctx.io.to(playerId).emit("merchantPrivateStateUpdated", buildMerchantPrivateState(room, playerId));
}

export function emitMerchantPrivateStateForAll(roomId: string) {
  const ctx = getServerContext();
  if (!ctx) return;
  const room = ctx.rooms[roomId];
  if (!room) return;
  for (const player of room.players) {
    emitMerchantPrivateState(roomId, player.id);
  }
}

export function emitCursedState(roomId: string, playerId: string) {
  const ctx = getServerContext();
  if (!ctx) return;
  const room = ctx.rooms[roomId];
  if (!room) return;
  const usesUsed = getCursedSniffUseCount(room, playerId);
  const maxUses = getCursedMaxSniffUses(room);
  ctx.io.to(playerId).emit("cursedTargetUpdated", {
    targetId: room.cursedTargetTonight?.[playerId] ?? null,
    lastTargetId: room.cursedLastTargetByPlayerId?.[playerId] ?? null,
    usesUsed,
    maxUses,
    usesRemaining: Math.max(0, maxUses - usesUsed),
  });
}

export function emitMerchantCheeseMarks(roomId: string) {
  const ctx = getServerContext();
  if (!ctx) return;
  const room = ctx.rooms[roomId];
  if (!room) return;
  ctx.io.to(`wolves_${roomId}`).emit("merchantCheeseMarksUpdated", {
    playerIds: room.merchantCheeseMarkedPlayerIds || [],
  });
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
  socket.emit("wildWolfConvertedState", {
    converted: (room.wildWolfConvertedPlayerIds || []).includes(playerId),
  });
  emitLoveStateToPlayer(ctx, roomId, room, playerId);

  if (isWolfAlignedPlayer(room, playerId)) {
    socket.join(`wolves_${roomId}`);
    const rules = ensureRoomGameRules(room);
    const wolves = room.players.filter((p) => isWolfAlignedPlayer(room, p.id));
    if (room.phase === "night" && room.merchantWolfBiteDisabledTonight) {
      socket.emit("wolfPhaseStarted", {
        wolves: wolves.map((w) => w.id),
        activeWolves: [],
        deadline: null,
        maxTargets: 0,
        resetVotes: false,
        biteDisabled: true,
        wolfBadgeRolesByPlayerId: Object.fromEntries(wolves.map((w) => [w.id, room.playerRoles?.[w.id] || "Sói"])),
        wildWolfConvertAvailable: false,
        wildWolfConvertRequested: false,
      });
    }
    const wolfPhaseActive =
      room.phase === "night" &&
      !room.wolfVoteResolvedTonight &&
      (rules.allNightActionsSimultaneous || room.nightTurnRole === "Sói");
    if (wolfPhaseActive) {
      socket.emit("wolfPhaseStarted", {
        wolves: wolves.map((w) => w.id),
        activeWolves: getActiveWolves(room),
        deadline: room.wolfDeadline ?? null,
        maxTargets: room.wolfBonusBiteThisNight ? 2 : 1,
        resetVotes: false,
        wolfBadgeRolesByPlayerId: Object.fromEntries(wolves.map((w) => [w.id, room.playerRoles?.[w.id] || "Sói"])),
        wildWolfConvertAvailable: room.wildWolfConvertAvailableTonight === true,
        wildWolfConvertRequested: room.wildWolfConvertRequestedTonight === true,
      });
      socket.emit("wolfVotesUpdated", room.wolfVotes || {});
      socket.emit("wolfVotes2Updated", room.wolfVotes2 || {});
      socket.emit("wolfLockedUpdated", room.wolfLocked || {});
    }
  } else {
    socket.leave(`wolves_${roomId}`);
  }

  if (role === "Phù thủy") {
    socket.join(`witches_${roomId}`);
    ensureWitchState(room, playerId);
    emitWitchPotions(roomId, playerId);
    emitWitchPendingDeath(roomId);
  } else {
    socket.leave(`witches_${roomId}`);
  }

  if (role === PROTECTOR_ROLE) {
    emitProtectorTarget(roomId, playerId);
  }

  if (role === CURSED_ROLE) {
    emitCursedState(roomId, playerId);
  }

  emitMerchantPrivateState(roomId, playerId);
  emitAngelPrivateState(ctx, roomId, room, playerId);
  socket.emit("merchantCheeseMarksUpdated", {
    playerIds: isWolfAlignedPlayer(room, playerId) ? room.merchantCheeseMarkedPlayerIds || [] : [],
  });
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
