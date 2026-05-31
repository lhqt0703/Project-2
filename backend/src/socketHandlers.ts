import type { Socket } from "socket.io";
import type { ServerContext } from "./serverContext.js";
import { getServerContext } from "./serverContext.js";
import {
  desiredLayoutHeightPx,
  ensureNonOverlappingPositions,
  layoutOptsForRoom,
  rescaleRoomPositionsForHeight,
  clampToBounds,
  resolveDraggedAgainstFixedOthers,
  BASE_FRAME_HEIGHT_PX,
  POSITION_LAYOUT,
  type PlayerPos,
} from "./serverPositions.js";
import {
  clearGameTimers,
  clearNightTurnTimer,
  clearSpiritWolfDecisionTimer,
  clearTrialState,
  canPlayerActAtNight,
  ensureWitchState,
  getActiveDayVoters,
  getActiveWolves,
  getAlivePlayerIds,
  getParticipantCount,
  getParticipantIds,
  getParticipantPlayers,
  getBanSoiId,
  getSpiritWolfId,
  getWildWolfId,
  getTrialVoters,
  getWitches,
  isPlayerConnected,
  isSpiritWolfAlive,
  isWolfAlignedPlayer,
  isWolfRole,
  markWolfCubExtraBiteReadyIfDied,
  markWildWolfConversionReadyIfWolfDied,
  resetNightTurnState,
  resetRoomFromGameToLobby,
} from "./roomState.js";
import {
  buildRoomGameRules,
  ensureRoomGameRules,
  type EliminationCause,
  type Room,
  type RoomGameRules,
  type NightActionRole,
} from "./serverTypes.js";
import {
  appendLogEntry,
  buildDayVoteBreakdown,
  buildWolfVoteBreakdown,
  ensureNightLog,
} from "./gameLog.js";
import { appendGameEvent } from "./gameEvent.js";
import { listSavedMatches, loadSavedMatch } from "./gameHistory.js";
import {
  emitGameLogToSocket,
  emitCursedState,
  emitHunterTarget,
  emitMerchantCheeseMarks,
  emitMerchantPrivateState,
  emitMerchantPrivateStateForAll,
  emitProtectorTarget,
  emitPublicDayGameLogToSocket,
  emitRolesRevealToSocket,
  emitSpiritWolfDecisionNeeded,
  getHostNightActionProgressByPlayerId,
  emitWitchPendingDeath,
  emitWitchPotions,
  getWitchPendingDeaths,
  getSelectedElementalRoles,
  isElementalQuickMode,
  isElementalRoleTurn,
  shouldElementalsVoteBuffTonight,
  syncPrivateRoleStateForSocket,
  toPublicRoom,
  broadcastElementalBuffSelection,
} from "./serverEmitters.js";
import {
  ELEMENTAL_BUFFS,
  getBuffTier,
  MIN_CORRECT_ELEMENTAL_GUESSES_FOR_BUFF,
  type ElementalBuffId,
} from "./elemental.js";
import {
  RULES_RESTART_FADE_IN_MS,
  RULES_RESTART_FADE_OUT_MS,
  RULES_RESTART_HOLD_MS,
  RULES_RESTART_RESTART_AT_MS,
  RULES_RESTART_TOTAL_MS,
  TWO_HEARTS_MAX_HP,
  TWO_HEARTS_NIGHT_LIMIT,
  initTwoHeartsForParticipants,
  getTwoHeartsWolfDamage,
  isVillageChiefDelayedBiteNight,
} from "./gameConfig.js";
import {
  dealRolesWithPendingAssignments,
  prunePendingRoleBlocks,
  prunePendingRoleAssignments,
  pickRolesForParticipants,
  type PendingRoleBlocks,
  type PendingRoleAssignments,
} from "./roleAssignment.js";
import type { createConnectionState } from "./connectionState.js";
import type { createLifecycleFlow } from "./lifecycle.js";
import type { createDayFlow } from "./dayFlow.js";
import type { createNightFlow } from "./nightFlow.js";
import type { createElementalFlow } from "./elementalFlow.js";
import { resolveHunterShotsForDeaths } from "./hunter.js";
import { triggerMerchantGunpowderExplosion } from "./merchantEffects.js";
import {
  CURSED_ROLE,
  MERCHANT_ROLE,
  addMerchantItemToPlayer,
  expireMerchantItemsForNight,
  getCursedSniffAreaIds,
  getMerchantAvailableItemIds,
  hasActiveMerchantItem,
  isMerchantDecision,
  isMerchantItemId,
  isProtectedByGuardian,
  prepareMerchantNightState,
  resetMerchantRoundState,
  type MerchantTradeOffer,
} from "./merchant.js";
import {
  LOVE_ROLE,
  canLoveChoosePartnerTonight,
  clearLoveStateForPlayers,
  emitLoveStateToPair,
  isLovePairMemberAwayAt,
  markEliminatedWithLoveChain,
  getLovePairIds,
  getLovePartnerId,
} from "./love.js";
import {
  PROTECTOR_ROLE,
  PROTECTOR_PERMANENT_BUFF_ID,
  VILLAGE_CHIEF_ROLE,
  clearProtectorTargetIfDead,
  getVillageChiefId,
  isProtectorImmortalityPermanent,
  isVillageChief,
  tryUseProtectorImmortality,
  type ProtectorSaveRecord,
} from "./specialRoles.js";
import {
  ANGEL_ROLE,
  activateAngelRevivesForNight,
  emitAngelPrivateState,
  emitAngelPrivateStateForAll,
  expireUnusedAngelReviveOpportunities,
  isAngelGuess,
  markAngelReviveAvailable,
  recordAngelReviveChoice,
  revealAngelHiddenRevivesForDay,
} from "./angel.js";

const SPIRIT_WOLF_ROLE = "Linh sói";
const NORMAL_WOLF_ROLE = "Sói";
const WILD_WOLF_ROLE = "Sói Dại";
const HOST_EXTRA_TIME_NON_WOLF_ROLES = new Set([
  LOVE_ROLE,
  "Bảo vệ",
  PROTECTOR_ROLE,
  "Phù thủy",
  "Thợ săn",
  "Tiên tri",
  CURSED_ROLE,
  MERCHANT_ROLE,
]);

type RegisterSocketHandlersParams = {
  socket: Socket;
  clientId: string;
  activeClientSockets: Record<string, Set<string>>;
  connectionState: ReturnType<typeof createConnectionState>;
  lifecycle: ReturnType<typeof createLifecycleFlow>;
  dayFlow: ReturnType<typeof createDayFlow>;
  nightFlow: ReturnType<typeof createNightFlow>;
  elementalFlow: ReturnType<typeof createElementalFlow>;
};

export function registerSocketHandlers(params: RegisterSocketHandlersParams) {
  const {
    socket,
    clientId,
    activeClientSockets,
    connectionState,
    lifecycle,
    dayFlow,
    nightFlow,
    elementalFlow,
  } = params;

  const ctx = getServerContext()!;
  const { rooms, activeRooms } = ctx;

  const {
    getClientIdFromSocket,
    disconnectedCleanupKey,
    clearDisconnectedCleanup,
    isClientCurrentlyConnected,
    scheduleDisconnectedCleanup,
  } = connectionState;

  const {
    emitRestartCinematicToPlayers,
    returnHostToGameView,
    startFreshRoundWithCurrentRoles,
    getWolfRoleCount,
    getMaxAllowedWolfCount,
    rebalanceWolfRoles,
    checkAndEndGame,
  } = lifecycle;

  const {
    buildTrialInteractionUpdatedPayload,
    startTrialVerdictVoting,
    finishTrialVerdict,
    startTrialDefense,
    startDayVoting,
    startDayDiscussion,
    finishDayVoting,
    startVillageChiefExtraVoting,
  } = dayFlow;

  const {
    canPerformNightRoleAction,
    startSpiritWolfDecisionWindow,
    finishSpiritWolfTurn,
    getWolfTurnDurationMs,
    startWolfPhase,
    startNightTurnByIndex,
    startNightTurnFlow,
    finishWolfVoting,
    getEffectiveNightActionOrder,
  } = nightFlow;

  const {
    emitElementalTarget,
    emitElementalBuffVoteState,
    resolveElementalBuffVote,
  } = elementalFlow;

  function getAliveElementalPlayerIds(room: Room) {
    const dead = new Set(room.deadPlayers || []);
    return getParticipantPlayers(room)
      .filter((player) => !dead.has(player.id))
      .filter((player) => isElementalRoleTurn(room.playerRoles?.[player.id] || null))
      .map((player) => player.id);
  }

  function canUseTrialFlowControls(room: Room) {
    return clientId === room.hostId || room.positionEditors?.includes(clientId) === true;
  }

  function clearLobbyHeartBadges(room: Room) {
    const hadHeartBadges =
      room.sharedHeartsVisible === true ||
      Object.keys(room.playerHearts || {}).length > 0 ||
      Object.keys(room.privatePlayerHearts || {}).length > 0 ||
      (room.privateHeartVisiblePlayerIds || []).length > 0 ||
      (room.playerHeartShakeIds || []).length > 0;

    room.sharedHeartsVisible = false;
    room.playerHearts = {};
    room.privatePlayerHearts = {};
    room.privateHeartVisiblePlayerIds = [];
    room.playerHeartShakeIds = [];

    return hadHeartBadges;
  }

  function setRoomPendingRoleAssignments(room: Room, assignments: PendingRoleAssignments) {
    if (Object.keys(assignments).length > 0) {
      room.pendingRoleAssignments = assignments;
    } else {
      delete room.pendingRoleAssignments;
    }
  }

  function setRoomPendingRoleBlocks(room: Room, blocks: PendingRoleBlocks) {
    if (Object.keys(blocks).length > 0) {
      room.pendingRoleBlocks = blocks;
    } else {
      delete room.pendingRoleBlocks;
    }
  }

  function pruneRoomPendingRoleAssignments(room: Room) {
    const nextAssignments = prunePendingRoleAssignments(
      room.pendingRoleAssignments,
      room.roles || [],
      getParticipantIds(room),
    );
    setRoomPendingRoleAssignments(room, nextAssignments);
  }

  function pruneRoomPendingRoleBlocks(room: Room) {
    const nextBlocks = prunePendingRoleBlocks(
      room.pendingRoleBlocks,
      room.roles || [],
      getParticipantIds(room),
      room.pendingRoleAssignments,
    );
    setRoomPendingRoleBlocks(room, nextBlocks);
  }

  function emitPendingRoleAssignmentsToHost(roomId: string) {
    const room = rooms[roomId];
    if (!room) return;
    ctx.io.to(room.hostId).emit("pendingRoleAssignmentsUpdated", room.pendingRoleAssignments || {});
  }

  function emitPendingRoleBlocksToHost(roomId: string) {
    const room = rooms[roomId];
    if (!room) return;
    ctx.io.to(room.hostId).emit("pendingRoleBlocksUpdated", room.pendingRoleBlocks || {});
  }

  function syncPendingRoleInterventionsToHost(roomId: string) {
    const room = rooms[roomId];
    if (!room) return;
    pruneRoomPendingRoleAssignments(room);
    pruneRoomPendingRoleBlocks(room);
    emitPendingRoleAssignmentsToHost(roomId);
    emitPendingRoleBlocksToHost(roomId);
  }

  function emitHostNightActionProgress(roomId: string) {
    const room = rooms[roomId];
    if (!room) return;
    ctx.io.to(room.hostId).emit("hostNightActionProgressUpdated", {
      progressByPlayerId: getHostNightActionProgressByPlayerId(room),
    });
  }

  function removePlayerFromRoom(
    roomId: string,
    targetId: string,
    opts?: { source?: "room" | "game"; forceReturnAll?: boolean; notifyTarget?: boolean }
  ) {
    const room = rooms[roomId];
    if (!room) return;

    const shouldForceReturnAll =
      typeof opts?.forceReturnAll === "boolean"
        ? opts.forceReturnAll
        : opts?.source === "room" && !!room.phase && !room.gameOver;

    if (shouldForceReturnAll) {
      resetRoomFromGameToLobby(room);
    }

    room.players = room.players.filter((p) => p.id !== targetId);
    room.positions = (room.positions || []).filter((pos) => pos.playerId !== targetId);
    room.positionEditors = (room.positionEditors || []).filter((id) => id !== targetId);
    room.lockedPlayerIds = (room.lockedPlayerIds || []).filter((id) => id !== targetId);
    const removedRole = room.playerRoles?.[targetId] || null;

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
    if (room.publicRevealedRolesByPlayerId) {
      delete room.publicRevealedRolesByPlayerId[targetId];
    }
    if (room.privatePlayerHearts) {
      delete room.privatePlayerHearts[targetId];
    }
    room.privateHeartVisiblePlayerIds = (room.privateHeartVisiblePlayerIds || []).filter((id) => id !== targetId);
    room.playerHeartShakeIds = (room.playerHeartShakeIds || []).filter((id) => id !== targetId);
    room.villageChiefDyingFramePlayerIds = (room.villageChiefDyingFramePlayerIds || []).filter((id) => id !== targetId);
    if (room.villageChiefPendingWolfDeath?.playerId === targetId) {
      room.villageChiefPendingWolfDeath = null;
    }
    if (room.protectorActorId === targetId || room.protectorTargetId === targetId) {
      room.protectorActorId = null;
      room.protectorTargetId = null;
      room.protectorTargetSetNight = null;
    }
    if (removedRole === VILLAGE_CHIEF_ROLE) {
      room.villageChiefExtraVoteAvailable = false;
      room.villageChiefExtraVoteReady = false;
    }

    if (room.hostId === targetId && room.players.length > 0) {
      const firstPlayer = room.players[0];
      if (firstPlayer) {
        room.hostId = firstPlayer.id;
        const nextHeightPxAfterHostChange = desiredLayoutHeightPx(getParticipantCount(room));
        rescaleRoomPositionsForHeight(room, nextHeightPxAfterHostChange);
        const hostChangedOpts = layoutOptsForRoom(room);
        room.positions = ensureNonOverlappingPositions(getParticipantIds(room), room.positions, hostChangedOpts);
        ctx.io.to(roomId).emit("hostChanged", room.hostId);
      }
    }

    syncPendingRoleInterventionsToHost(roomId);
    ctx.io.to(roomId).emit("positionsUpdated", room.positions || []);
    ctx.io.to(roomId).emit("roomUpdated", toPublicRoom(room));
    if (shouldForceReturnAll) {
      ctx.io.to(roomId).emit("forceReturnToRoom", { roomId, reason: "host_returned_to_room" });
    }
    if (opts?.notifyTarget) {
      ctx.io.to(targetId).emit("kicked");
    }
  }

  function getNightActionExtraMs(room: Room, playerId: string) {
    const extra = room.nightActionExtraTimeMsByPlayerId?.[playerId] || 0;
    return Math.max(0, Math.floor(extra));
  }

  function shouldGrantWitchBonusToPlayer(room: Room, playerId: string) {
    const rules = ensureRoomGameRules(room);
    const nonWolf = rules.nonWolfNightActionDurationSec || 0;
    const wolf = rules.wolfNightActionDurationSec || 0;
    if (!(nonWolf > 0 && wolf === nonWolf)) return false;
    if (!rules.witchBonusTimeRequiresUsablePotion) return true;
    const potions = room.witchPotions?.[playerId];
    if (!potions) return true;
    return !(potions.healUsed === true && potions.poisonUsed === true);
  }

  function getSimultaneousDeadlineForPlayer(room: Room, playerId: string) {
    if (room.phase !== "night") return null;
    const rules = ensureRoomGameRules(room);
    if (!rules.allNightActionsSimultaneous) return null;
    if (!canPlayerActAtNight(room, playerId)) return null;

    if (isWolfAlignedPlayer(room, playerId)) {
      if (!room.wolfDeadline) return null;
      return room.wolfDeadline + getNightActionExtraMs(room, playerId);
    }

    const role = room.playerRoles?.[playerId] || null;
    if (!role) return null;

    if (role === SPIRIT_WOLF_ROLE) {
      if (!room.spiritWolfDecisionDeadline || !room.spiritWolfPendingPoisonedWolfId || room.spiritWolfDecisionMade) {
        return null;
      }
      return room.spiritWolfDecisionDeadline + getNightActionExtraMs(room, playerId);
    }

    if (!room.nightTurnDeadline) return null;
    let deadline = room.nightTurnDeadline + getNightActionExtraMs(room, playerId);
    if (role === "Phù thủy" && shouldGrantWitchBonusToPlayer(room, playerId)) {
      deadline += 10_000;
    }
    return deadline;
  }

  function rescheduleWolfTimerForCurrentDeadlines(roomId: string, room: Room) {
    if (room.wolfTimer) {
      clearTimeout(room.wolfTimer);
      room.wolfTimer = null;
    }
    if (room.wolfVoteResolvedTonight) return;
    if (!room.wolfDeadline) return;

    const activeWolves = getActiveWolves(room);
    let maxDeadline = room.wolfDeadline;
    for (const wolfId of activeWolves) {
      const deadline = getSimultaneousDeadlineForPlayer(room, wolfId);
      if (deadline && deadline > maxDeadline) {
        maxDeadline = deadline;
      }
    }

    const remainingMs = Math.max(0, maxDeadline - Date.now());
    if (remainingMs <= 0) {
      finishWolfVoting(roomId);
      return;
    }
    room.wolfTimer = setTimeout(() => {
      finishWolfVoting(roomId);
    }, remainingMs);
  }

  function isWildWolfConversionUsable(room: Room, playerId: string) {
    const wildWolfId = getWildWolfId(room);
    return (
      wildWolfId === playerId &&
      room.playerRoles?.[playerId] === WILD_WOLF_ROLE &&
      room.wildWolfConvertAvailableTonight === true &&
      room.wildWolfConvertUsed !== true &&
      canPlayerActAtNight(room, playerId)
    );
  }

  function emitWildWolfConversionState(roomId: string, room: Room) {
    ctx.io.to(`wolves_${roomId}`).emit("wildWolfConversionUpdated", {
      available: room.wildWolfConvertAvailableTonight === true,
      requested: room.wildWolfConvertRequestedTonight === true,
    });
  }

  function getWildWolfConversionCandidateIds(room: Room, playerId: string) {
    return [room.wolfVotes?.[playerId], room.wolfVotes2?.[playerId]]
      .filter((targetId): targetId is string => !!targetId);
  }

  function clearWildWolfConversionIfTargetIsNoLongerSelected(roomId: string, room: Room, playerId: string) {
    if (room.wildWolfConvertActorId !== playerId) return;
    if (!room.wildWolfConvertRequestedTonight) return;
    const targetId = room.wildWolfConvertTargetId || null;
    if (targetId && getWildWolfConversionCandidateIds(room, playerId).includes(targetId)) return;

    room.wildWolfConvertRequestedTonight = false;
    room.wildWolfConvertActorId = null;
    room.wildWolfConvertTargetId = null;
    emitWildWolfConversionState(roomId, room);
  }

  function canWaitForWildWolfConversionAfterLocked(room: Room) {
    const wildWolfId = getWildWolfId(room);
    if (!wildWolfId) return false;
    if (!room.wolfDeadline || Date.now() >= room.wolfDeadline) return false;
    return (
      room.wildWolfConvertAvailableTonight === true &&
      room.wildWolfConvertRequestedTonight !== true &&
      room.wildWolfConvertUsed !== true &&
      room.playerRoles?.[wildWolfId] === WILD_WOLF_ROLE &&
      isPlayerConnected(room, wildWolfId) &&
      canPlayerActAtNight(room, wildWolfId)
    );
  }

  function finishWolfVotingIfAllLocked(roomId: string, room: Room, allowWildWolfConversionWait = true) {
    const activeWolves = getActiveWolves(room);
    const allLocked = activeWolves.length > 0 && activeWolves.every((id) => room.wolfLocked?.[id] === true);
    if (!allLocked) return;
    if (allowWildWolfConversionWait && canWaitForWildWolfConversionAfterLocked(room)) return;

    if (room.wolfTimer) {
      clearTimeout(room.wolfTimer);
      room.wolfTimer = null;
    }
    finishWolfVoting(roomId);
  }

  function convertWildWolfTargetToWolf(roomId: string, room: Room, targetId: string) {
    if (!room.players.find((player) => player.id === targetId)) return false;
    if ((room.deadPlayers || []).includes(targetId)) return false;

    room.playerRoles = room.playerRoles || {};
    const fromRole = room.playerRoles[targetId] || "Dân làng";
    room.playerRoles[targetId] = NORMAL_WOLF_ROLE;
    appendGameEvent(room, {
      type: "ROLE_CONVERSION",
      phase: "night",
      actorIds: room.wildWolfId ? [room.wildWolfId] : [],
      targetIds: [targetId],
      metadata: {
        type: "wild_wolf",
        fromRole,
        toRole: NORMAL_WOLF_ROLE,
      },
    });
    room.wolves = Array.from(new Set([...(room.wolves || []), targetId]));
    room.wildWolfConvertedPlayerIds = Array.from(new Set([...(room.wildWolfConvertedPlayerIds || []), targetId]));

    if (room.publicRevealedRolesByPlayerId?.[targetId]) {
      room.publicRevealedRolesByPlayerId[targetId] = NORMAL_WOLF_ROLE;
    }
    if (room.banSoiId === targetId) {
      room.banSoiId = null;
      room.banSoiWolfAligned = false;
      room.banSoiWolfAlignedPending = false;
    }
    if (room.spiritWolfId === targetId) {
      room.spiritWolfId = null;
      room.spiritWolfWolfAligned = false;
      room.spiritWolfWolfAlignedPending = false;
      room.spiritWolfPendingPoisonedWolfId = null;
    }

    ctx.io.in(targetId).socketsJoin(`wolves_${roomId}`);
    ctx.io.in(targetId).socketsLeave(`witches_${roomId}`);
    ctx.io.to(targetId).emit("yourRole", NORMAL_WOLF_ROLE);
    ctx.io.to(targetId).emit("wildWolfConvertedState", { converted: true });

    if (room.loveTargetId === targetId) {
      room.loveTargetWolfAligned = true;
      emitLoveStateToPair(ctx, roomId, room);
    }

    emitRolesRevealToSocket(roomId, room.hostId);
    return true;
  }

  function finalizeElementalGuessNight(room: Room) {
    const eligibleElementalIds = new Set(getAliveElementalPlayerIds(room));
    const correctIds = Array.from(new Set(room.elementalCorrectGuessPlayerIdsTonight || []))
      .filter((playerId) => eligibleElementalIds.has(playerId));
    const correctCount = correctIds.length;
    const totalCount = eligibleElementalIds.size;
    const triggeredBuffVote = correctCount >= MIN_CORRECT_ELEMENTAL_GUESSES_FOR_BUFF;
    const nextBuffVoteNight = triggeredBuffVote ? (room.nightCount || 0) + 1 : undefined;

    room.elementalCorrectGuessCountForBuff = triggeredBuffVote ? correctCount : 0;
    room.elementalPendingBuffVoteNight = nextBuffVoteNight ?? null;
    room.elementalBuffVotesTonight = {};
    room.elementalBuffQuickMode = isElementalQuickMode(room);

    if (totalCount > 0 || (room.elementalTargetTonight && Object.keys(room.elementalTargetTonight).length > 0)) {
      appendLogEntry(room, {
        type: "elemental_guess_summary",
        phase: "night",
        correctCount,
        totalCount,
        correctIds,
        triggeredBuffVote,
        ...(nextBuffVoteNight !== undefined ? { nextBuffVoteNight } : {}),
      });
    }
  }

  function isMerchantEffectImmediate(room: Room) {
    const rules = ensureRoomGameRules(room);
    if (rules.allNightActionsSimultaneous) return false;
    const order = room.nightTurnOrderSnapshot?.length
      ? room.nightTurnOrderSnapshot
      : rules.nightActionOrder;
    const merchantIndex = order.indexOf(MERCHANT_ROLE);
    if (merchantIndex < 0) return false;
    const beforeMerchant = order.slice(0, merchantIndex);
    return beforeMerchant.every((role) => role === LOVE_ROLE);
  }

  function getMerchantEffectAppliesNight(room: Room) {
    const currentNight = room.nightCount || 0;
    return isMerchantEffectImmediate(room) ? currentNight : currentNight + 1;
  }

  function isMerchantTradeWindowOpen(room: Room, offer: MerchantTradeOffer) {
    if (room.gameOver) return false;
    if (room.phase !== "night") return false;
    if (!canPlayerActAtNight(room, offer.actorId)) return false;
    if ((room.deadPlayers || []).includes(offer.targetId)) return false;
    if (room.playerRoles?.[offer.actorId] !== MERCHANT_ROLE) return false;
    return canPerformNightRoleAction(room, offer.actorId, MERCHANT_ROLE);
  }

  function isMerchantTargetWolfTeam(room: Room, targetId: string) {
    const role = room.playerRoles?.[targetId];
    return isWolfAlignedPlayer(room, targetId) || isWolfRole(role);
  }

  function applyMerchantWolfBiteBlock(room: Room, appliesNight: number) {
    if (appliesNight <= (room.nightCount || 0)) {
      room.merchantWolfBiteDisabledTonight = true;
      return;
    }
    room.merchantWolfBiteDisabledNextNight = true;
  }

  function applyMerchantCheeseMark(room: Room, targetId: string, appliesNight: number) {
    if (appliesNight <= (room.nightCount || 0)) {
      room.merchantCheeseMarkedPlayerIds = Array.from(
        new Set([...(room.merchantCheeseMarkedPlayerIds || []), targetId]),
      );
      return;
    }
    room.merchantCheeseMarkedPlayerIdsNextNight = Array.from(
      new Set([...(room.merchantCheeseMarkedPlayerIdsNextNight || []), targetId]),
    );
  }

  function recordMerchantSuccessfulTrade(room: Room, merchantId: string) {
    const rules = ensureRoomGameRules(room);
    const requiredTrades = rules.merchantWinRequiredSuccessfulTrades;
    room.merchantSuccessfulTradeCountsByPlayerId = room.merchantSuccessfulTradeCountsByPlayerId || {};

    const successfulTrades = (room.merchantSuccessfulTradeCountsByPlayerId[merchantId] || 0) + 1;
    room.merchantSuccessfulTradeCountsByPlayerId[merchantId] = successfulTrades;

    if (successfulTrades < requiredTrades) return;
    if ((room.merchantWinCompletedPlayerIds || []).includes(merchantId)) return;

    room.merchantWinCompletedPlayerIds = Array.from(new Set([...(room.merchantWinCompletedPlayerIds || []), merchantId]));
    appendLogEntry(room, {
      type: "merchant_win_condition_completed",
      phase: "night",
      actorId: merchantId,
      successfulTrades,
      requiredTrades,
    });
    appendGameEvent(room, {
      type: "MERCHANT_WIN",
      phase: "night",
      actorIds: [merchantId],
      metadata: { successfulTrades, requiredTrades },
    });
  }

  function resolveMerchantOffer(roomId: string, room: Room, offer: MerchantTradeOffer, targetChoice: "up" | "down") {
    if (offer.resolved) return;
    offer.targetChoice = targetChoice;
    offer.resolved = true;
    offer.appliesNight = getMerchantEffectAppliesNight(room);

    let result: NonNullable<MerchantTradeOffer["result"]>;
    let receivedItem = false;
    if (offer.merchantChoice === targetChoice) {
      addMerchantItemToPlayer(room, offer.targetId, offer.itemId, offer.appliesNight);
      if (ensureRoomGameRules(room).merchantSingleUseItems) {
        room.merchantUsedItemIds = Array.from(new Set([...(room.merchantUsedItemIds || []), offer.itemId]));
      }
      result = "success";
      receivedItem = true;
    } else if (isMerchantTargetWolfTeam(room, offer.targetId)) {
      applyMerchantWolfBiteBlock(room, offer.appliesNight);
      result = "failed_wolf";
    } else {
      applyMerchantCheeseMark(room, offer.targetId, offer.appliesNight);
      result = "failed_villager";
      emitMerchantCheeseMarks(roomId);
    }

    offer.result = result;
    appendLogEntry(room, {
      type: "merchant_trade_response",
      phase: "night",
      actorId: offer.actorId,
      targetId: offer.targetId,
      itemId: offer.itemId,
      merchantChoice: offer.merchantChoice,
      targetChoice,
      result,
    });
    appendGameEvent(room, {
      type: "MERCHANT_TRADE",
      phase: "night",
      actorIds: [offer.actorId],
      targetIds: [offer.targetId],
      metadata: {
        itemId: offer.itemId,
        result,
        merchantChoice: offer.merchantChoice,
        targetChoice,
      },
    });
    if (receivedItem) {
      appendLogEntry(room, {
        type: "merchant_item_received",
        phase: "night",
        targetId: offer.targetId,
        itemId: offer.itemId,
        appliesNight: offer.appliesNight,
      });
      recordMerchantSuccessfulTrade(room, offer.actorId);
    }
  }

  function expireMerchantItemsAtNightEnd(room: Room) {
    const expiredByPlayerId = expireMerchantItemsForNight(room, room.nightCount || 0);
    for (const [targetId, itemIds] of Object.entries(expiredByPlayerId)) {
      appendLogEntry(room, {
        type: "merchant_item_expired",
        phase: "day",
        targetId,
        itemIds,
      });
    }
  }

  function appendPoppyGlassesViewLogs(room: Room, targetId: string) {
    for (const player of room.players) {
      if ((room.deadPlayers || []).includes(player.id)) continue;
      if (!hasActiveMerchantItem(room, player.id, "poppy-glasses")) continue;
      appendLogEntry(room, {
        type: "merchant_item_used",
        phase: "night",
        itemId: "poppy-glasses",
        actorId: player.id,
        targetId,
      });
    }
  }

  function resolveNightDeaths(roomId: string, room: Room) {
    const initialDead = new Set(room.deadPlayers || []);
    const playerIds = new Set(room.players.map((player) => player.id));
    const eliminatedIds: string[] = [];
    const causesByTarget: Record<string, EliminationCause[]> = {};
    const protectorSaves: ProtectorSaveRecord[] = [];
    const loveLinkDeaths: { sourceId: string; targetId: string }[] = [];
    const savedByGuardianIds: string[] = [];

    const addUnique = (ids: string[], id: string) => {
      if (!ids.includes(id)) ids.push(id);
    };

    const unlockVillageChiefExtraVoteIfProtectorDiedByWolf = () => {
      const protectorId = eliminatedIds.find((id) => {
        if (room.playerRoles?.[id] !== PROTECTOR_ROLE) return false;
        const causes = causesByTarget[id] || [];
        return causes.some((cause) => cause.type === "wolf");
      });
      if (!protectorId) return;
      if (room.villageChiefExtraVoteUsed || room.villageChiefExtraVoteAvailable) return;

      const chiefId = getVillageChiefId(room);
      if (!chiefId || (room.deadPlayers || []).includes(chiefId)) return;

      room.villageChiefExtraVoteAvailable = true;
      room.villageChiefExtraVoteReady = false;
    };

    const getUniqueTargets = (targets: Array<string | null | undefined>) => {
      const unique: string[] = [];
      for (const targetId of targets) {
        if (!targetId) continue;
        if (!playerIds.has(targetId)) continue;
        if (!unique.includes(targetId)) unique.push(targetId);
      }
      return unique;
    };

    const markEliminated = (targetId: string, cause: EliminationCause) => {
      return markEliminatedWithLoveChain(ctx, roomId, room, targetId, cause, "night", {
        initialDead,
        eliminatedIds,
        causesByTarget,
        protectorSaves,
        loveLinkDeaths,
      });
    };

    const flushProtectorSaves = () => {
      while (protectorSaves.length) {
        const save = protectorSaves.shift()!;
        appendLogEntry(room, {
          type: "protector_save",
          phase: "night",
          actorId: save.actorId,
          targetId: save.targetId,
          cause: save.cause,
          permanent: save.permanent,
        });
        appendGameEvent(room, {
          type: "PROTECTOR_SAVE",
          phase: "night",
          actorIds: save.actorId ? [save.actorId] : [],
          targetIds: [save.targetId],
          metadata: { cause: save.cause, permanent: save.permanent },
        });
        if (save.actorId) {
          emitProtectorTarget(roomId, save.actorId);
        }
      }
    };

    const flushLoveLinkDeathLogs = (phase: "night" | "day") => {
      while (loveLinkDeaths.length) {
        const death = loveLinkDeaths.shift()!;
        appendLogEntry(room, {
          type: "love_link_death",
          phase,
          sourceId: death.sourceId,
          targetId: death.targetId,
        });
      }
    };

    const wolfAttackersForTarget = (targetId: string) => {
      const votes = room.wolfVotes || {};
      const votes2 = room.wolfVotes2 || {};
      return getActiveWolves(room).filter((wolfId) => votes[wolfId] === targetId || votes2[wolfId] === targetId);
    };

    const rules = ensureRoomGameRules(room);
    const wolfTargets = getUniqueTargets([room.killedTonight, room.killedTonightExtra]);
    const healEntries = Object.entries(room.witchHealTargetTonight || {});
    const wolfAttackAt = room.wolfAttackResolvedAt || Date.now();
    const spiritWolfId = getSpiritWolfId(room);
    const banSoiId = getBanSoiId(room);
    const wildWolfConvertTargetId =
      room.wildWolfConvertRequestedTonight &&
      room.wildWolfConvertAvailableTonight &&
      !room.wildWolfConvertUsed
        ? room.wildWolfConvertTargetId || null
        : null;

    const isGuardianEffective = (targetId: string, saveCutoffAt: number | null) => {
      return isProtectedByGuardian(room, targetId, saveCutoffAt);
    };

    const isWitchHealEffective = (targetId: string, saveCutoffAt: number | null) => {
      return healEntries.some(([witchId, healedTargetId]) => {
        if (healedTargetId !== targetId) return false;
        if (!saveCutoffAt) return true;
        const healAt = room.witchHealTargetAt?.[witchId];
        return !!healAt && healAt <= saveCutoffAt;
      });
    };

    for (const targetId of wolfTargets) {
      if (initialDead.has(targetId)) continue;

      if (isLovePairMemberAwayAt(room, targetId, wolfAttackAt)) continue;

      const escapeAt = room.loveEscapeActiveTonight ? (room.loveEscapeActivatedAt || null) : null;
      const saveCutoffAt = escapeAt && wolfAttackAt <= escapeAt && getLovePairIds(room)?.includes(targetId)
        ? escapeAt
        : null;
      const wasHealed = isWitchHealEffective(targetId, saveCutoffAt);
      const isProtected = isGuardianEffective(targetId, saveCutoffAt);

      if (isProtected) addUnique(savedByGuardianIds, targetId);

      if (targetId === wildWolfConvertTargetId) {
        const biteCounted = (!wasHealed && !isProtected) || rules.banSoiBecomeWolfEvenIfHealed;
        appendLogEntry(room, {
          type: "wild_wolf_conversion",
          phase: "night",
          actorId: room.wildWolfConvertActorId || getWildWolfId(room),
          targetId,
          success: biteCounted,
          previousTargetRole: room.playerRoles?.[targetId] || null,
          savedByGuardian: isProtected,
          savedByWitch: wasHealed,
          ...(biteCounted ? {} : { reason: "saved" as const }),
        });

        if (biteCounted && convertWildWolfTargetToWolf(roomId, room, targetId)) {
          room.wildWolfConvertUsed = true;
        }

        room.wildWolfConvertAvailableTonight = false;
        room.wildWolfConvertRequestedTonight = false;
        room.wildWolfConvertActorId = null;
        continue;
      }

      if (targetId === spiritWolfId) {
        if (!wasHealed && !isProtected) {
          room.spiritWolfWolfAlignedPending = true;
        }
        continue;
      }

      if (targetId === banSoiId) {
        const biteCounted = (!wasHealed && !isProtected) || rules.banSoiBecomeWolfEvenIfHealed;
        if (biteCounted) {
          const twoHeartsDamage = getTwoHeartsWolfDamage(room);
          if (twoHeartsDamage > 0 && twoHeartsDamage < TWO_HEARTS_MAX_HP) {
            room.playerHearts = room.playerHearts || {};
            const currentHp = Math.max(1, Math.min(TWO_HEARTS_MAX_HP, room.playerHearts[targetId] ?? TWO_HEARTS_MAX_HP));
            room.playerHearts[targetId] = Math.max(0, currentHp - twoHeartsDamage);
          }
          room.banSoiWolfAlignedPending = true;
        }
        continue;
      }

      if (isProtected || wasHealed) continue;

      const wolfCause: EliminationCause = {
        type: "wolf",
        attackerIds: wolfAttackersForTarget(targetId),
      };

      if (isVillageChief(room, targetId)) {
        if (isVillageChiefDelayedBiteNight(room)) {
          if (room.sharedHeartsVisible) {
            room.playerHearts = room.playerHearts || {};
            const currentHp = Math.max(1, Math.min(TWO_HEARTS_MAX_HP, room.playerHearts[targetId] ?? TWO_HEARTS_MAX_HP));
            room.playerHearts[targetId] = Math.max(1, currentHp - 1);
          }
          room.villageChiefPendingWolfDeath = {
            playerId: targetId,
            bittenNight: room.nightCount || 0,
            attackerIds: wolfCause.attackerIds,
          };
          continue;
        }
      }

      const protectorSave = tryUseProtectorImmortality(room, targetId, wolfCause);
      if (protectorSave) {
        protectorSaves.push(protectorSave);
        continue;
      }

      const twoHeartsDamage = getTwoHeartsWolfDamage(room);
      if (twoHeartsDamage > 0) {
        room.playerHearts = room.playerHearts || {};
        const currentHp = Math.max(1, Math.min(TWO_HEARTS_MAX_HP, room.playerHearts[targetId] ?? TWO_HEARTS_MAX_HP));
        const nextHp = Math.max(0, currentHp - twoHeartsDamage);
        room.playerHearts[targetId] = nextHp;
        if (nextHp <= 0) {
          markEliminated(targetId, wolfCause);
        }
        continue;
      }

      markEliminated(targetId, wolfCause);
    }

    flushProtectorSaves();

    const poisonEntries = Object.entries(room.witchPoisonTargetTonight || {});
    const poisonTargets = getUniqueTargets(poisonEntries.map(([, targetId]) => targetId));
    for (const targetId of poisonTargets) {
      const poisonAts = poisonEntries
        .filter(([, poisonedTargetId]) => poisonedTargetId === targetId)
        .map(([witchId]) => room.witchPoisonTargetAt?.[witchId] || Date.now());
      if (poisonAts.length > 0 && poisonAts.every((poisonAt) => isLovePairMemberAwayAt(room, targetId, poisonAt))) {
        continue;
      }
      const witchEntry = poisonEntries.find(([, poisonedTargetId]) => poisonedTargetId === targetId);
      const witchId = witchEntry ? witchEntry[0] : undefined;
      const newlyDead = markEliminated(targetId, { type: "witch_poison", sourceActorId: witchId, killerId: witchId });
      if (newlyDead.includes(targetId)) {
        triggerMerchantGunpowderExplosion(ctx, roomId, room, targetId, "night", {
          initialDead,
          eliminatedIds,
          causesByTarget,
          protectorSaves,
          loveLinkDeaths,
        });
      }
    }

    flushProtectorSaves();

    if (savedByGuardianIds.length) {
      appendLogEntry(room, { type: "saved_by_guardian", phase: "night", targetIds: savedByGuardianIds, actorId: room.protectedTonightBy || null });
      for (const targetId of savedByGuardianIds) {
        appendGameEvent(room, {
          type: "GUARD_SAVE",
          phase: "night",
          actorIds: room.protectedTonightBy ? [room.protectedTonightBy] : [],
          targetIds: [targetId],
        });
      }
    }
    if (eliminatedIds.length) {
      unlockVillageChiefExtraVoteIfProtectorDiedByWolf();
      const rules = ensureRoomGameRules(room);
      if (rules.allNightActionsSimultaneous) {
        const hunterShots = resolveHunterShotsForDeaths(ctx, roomId, room, eliminatedIds, "day", {
          appendEliminationLog: false,
        });
        const dayEliminatedIds = Array.from(new Set([...hunterShots.killedIds, ...eliminatedIds]));
        flushLoveLinkDeathLogs("day");
        appendLogEntry(room, {
          type: "eliminated",
          phase: "day",
          targetIds: dayEliminatedIds,
          causesByTarget: {
            ...causesByTarget,
            ...hunterShots.causesByTarget,
          },
        });
      } else {
        flushLoveLinkDeathLogs("night");
        appendLogEntry(room, { type: "eliminated", phase: "night", targetIds: eliminatedIds, causesByTarget });
        resolveHunterShotsForDeaths(ctx, roomId, room, eliminatedIds, "night");
      }
    } else {
      appendLogEntry(room, { type: "no_death", phase: "day" });
    }

    if (room.loveEscapeActiveTonight) {
      room.loveEscapeActiveTonight = false;
      room.loveEscapeActivatedAt = null;
      room.loveEscapeVotesTonight = {};
      room.loveEscapeVoteAt = {};
      emitLoveStateToPair(ctx, roomId, room);
    }
  }

  function resolveVillageChiefDelayedWolfDeath(roomId: string, room: Room) {
    const pending = room.villageChiefPendingWolfDeath || null;
    if (!pending) return;
    if ((room.nightCount || 0) <= pending.bittenNight) return;

    room.villageChiefPendingWolfDeath = null;
    if (room.privatePlayerHearts) {
      delete room.privatePlayerHearts[pending.playerId];
    }
    room.privateHeartVisiblePlayerIds = (room.privateHeartVisiblePlayerIds || []).filter((id) => id !== pending.playerId);
    room.playerHeartShakeIds = (room.playerHeartShakeIds || []).filter((id) => id !== pending.playerId);
    room.villageChiefDyingFramePlayerIds = (room.villageChiefDyingFramePlayerIds || []).filter((id) => id !== pending.playerId);

    if ((room.deadPlayers || []).includes(pending.playerId)) return;
    if (!room.players.find((player) => player.id === pending.playerId)) return;

    const eliminatedIds: string[] = [];
    const causesByTarget: Record<string, EliminationCause[]> = {};
    const protectorSaves: ProtectorSaveRecord[] = [];
    const loveLinkDeaths: { sourceId: string; targetId: string }[] = [];
    const cause: EliminationCause = { type: "wolf", attackerIds: pending.attackerIds || [] };

    appendLogEntry(room, {
      type: "village_chief_delayed_death",
      phase: "day",
      targetId: pending.playerId,
    });

    markEliminatedWithLoveChain(ctx, roomId, room, pending.playerId, cause, "day", {
      eliminatedIds,
      causesByTarget,
      protectorSaves,
      loveLinkDeaths,
    });

    const hadProtectorSave = protectorSaves.length > 0;
    while (protectorSaves.length) {
      const save = protectorSaves.shift()!;
      appendLogEntry(room, {
        type: "protector_save",
        phase: "day",
        actorId: save.actorId,
        targetId: save.targetId,
        cause: save.cause,
        permanent: save.permanent,
      });
      if (save.actorId) {
        emitProtectorTarget(roomId, save.actorId);
      }
    }

    if (eliminatedIds.length) {
      const hunterShots = resolveHunterShotsForDeaths(ctx, roomId, room, eliminatedIds, "day", {
        appendEliminationLog: false,
      });
      while (loveLinkDeaths.length) {
        const death = loveLinkDeaths.shift()!;
        appendLogEntry(room, {
          type: "love_link_death",
          phase: "day",
          sourceId: death.sourceId,
          targetId: death.targetId,
        });
      }
      appendLogEntry(room, {
        type: "eliminated",
        phase: "day",
        targetIds: Array.from(new Set([...eliminatedIds, ...hunterShots.killedIds])),
        causesByTarget: {
          ...causesByTarget,
          ...hunterShots.causesByTarget,
        },
      });
    } else if (hadProtectorSave) {
      appendLogEntry(room, { type: "no_death", phase: "day" });
    }
  }

  function finalizeUnmatchedLoveEscapeVote(roomId: string, room: Room) {
    if (room.loveEscapeActiveTonight) return;
    const pair = getLovePairIds(room);
    if (!pair) return;
    const votes = pair.filter((id) => room.loveEscapeVotesTonight?.[id] === true);
    if (votes.length !== 1) return;

    const actorId = votes[0]!;
    const partnerId = getLovePartnerId(room, actorId);
    if (!partnerId) return;

    appendLogEntry(room, {
      type: "love_escape_missed",
      phase: "night",
      actorId,
      partnerId,
    });

    room.loveEscapeVotesTonight = {};
    room.loveEscapeVoteAt = {};
    clearLoveStateForPlayers(ctx, room, roomId);
  }

  // Register all socket event handlers
  socket.on("createRoom", ({ name, gameRules }) => {
    const roomId = generateRoomId(activeRooms!);

    rooms[roomId] = {
      id: roomId,
      players: [{ id: clientId, name, connected: true, inGame: false }],
      hostId: clientId,
      hidePlayerRoleText: false,
      layoutHeightPx: BASE_FRAME_HEIGHT_PX,
      positions: ensureNonOverlappingPositions([], undefined, { ...POSITION_LAYOUT, heightPx: BASE_FRAME_HEIGHT_PX }),
      positionEditors: [],
      autoArrangeUsed: false,
      compactCircles: false,
      gameRules: buildRoomGameRules(gameRules),
      gameEventLog: [],
    };

    socket.join(roomId);
    socket.emit("roomCreated", toPublicRoom(rooms[roomId]));
  });

  socket.on("joinRoom", ({ roomId, name }) => {
    const room = rooms[roomId];
    if (!room) {
      socket.emit("errorMessage", "Phòng không tồn tại :(");
      return;
    }

    ensureRoomGameRules(room);
    clearDisconnectedCleanup(roomId, clientId);
    const existingPlayerIndex = room.players.findIndex((p) => p.id === clientId);
    if (existingPlayerIndex >= 0) {
      const current = room.players[existingPlayerIndex]!;
      room.players[existingPlayerIndex] = {
        ...current,
        name: typeof name === "string" && name.trim() ? name : current.name,
        connected: true,
        inGame: false,
      };
    } else {
      room.players.push({ id: clientId, name, connected: true, inGame: false });
    }

    const nextHeightPx = desiredLayoutHeightPx(getParticipantCount(room));
    rescaleRoomPositionsForHeight(room, nextHeightPx);

    const opts = layoutOptsForRoom(room);
    room.positions = ensureNonOverlappingPositions(getParticipantIds(room), room.positions, opts);
    socket.join(roomId);
    syncPrivateRoleStateForSocket(socket, roomId, room, clientId);

    socket.emit("roomJoined", toPublicRoom(room));
    ctx.io.to(roomId).emit("roomUpdated", toPublicRoom(room));
  });

  socket.on("getRoom", (roomId) => {
    const room = rooms[roomId];
    if (room) {
      ensureRoomGameRules(room);
      socket.join(roomId);
      clearDisconnectedCleanup(roomId, clientId);
      const playerIndex = room.players.findIndex((p) => p.id === clientId);
      if (playerIndex >= 0 && room.players[playerIndex]?.connected === false) {
        room.players[playerIndex] = { ...room.players[playerIndex]!, connected: true };
        ctx.io.to(roomId).emit("roomUpdated", toPublicRoom(room));
      }
      syncPrivateRoleStateForSocket(socket, roomId, room, clientId);
      socket.emit("roomUpdated", toPublicRoom(room));
      if (clientId === room.hostId) {
        syncPendingRoleInterventionsToHost(roomId);
        emitGameLogToSocket(roomId, clientId);
      } else if (room.gameOver) {
        emitGameLogToSocket(roomId, clientId);
      } else if (room.phase === "day") {
        emitPublicDayGameLogToSocket(roomId, clientId);
      }
      ctx.io.to(roomId).emit("positionsUpdated", room.positions);
      ctx.io.to(roomId).emit("positionEditorsUpdated", room.positionEditors || []);

      if (room.phase === "day" && room.dayDeadline) {
        ctx.io.to(clientId).emit("dayPhaseStarted", {
          voters: getActiveDayVoters(room),
          deadline: room.dayDeadline,
        });
        ctx.io.to(clientId).emit("dayVotesUpdated", room.dayVotes || {});
        ctx.io.to(clientId).emit("dayLockedUpdated", room.dayLocked || {});
      }

      if (room.phase === "day" && !room.dayDeadline && room.dayDiscussionDeadline) {
        ctx.io.to(clientId).emit("dayDiscussionStarted", {
          deadline: room.dayDiscussionDeadline,
        });
      }

      if (room.phase === "day" && room.trialTargetId && room.trialStage === "defense") {
        ctx.io.to(clientId).emit("trialPhaseStarted", {
          targetId: room.trialTargetId,
          stage: "defense",
          defenseDeadline: room.trialDefenseDeadline || null,
          selectionLimit: room.trialInteractionSelectionLimit,
        });
        ctx.io.to(clientId).emit("trialInteractionUpdated", {
          ...buildTrialInteractionUpdatedPayload(room),
        });
      }

      if (room.phase === "day" && room.trialTargetId && room.trialStage === "verdict") {
        ctx.io.to(clientId).emit("trialVerdictStarted", {
          targetId: room.trialTargetId,
          voters: getTrialVoters(room),
          deadline: room.trialVerdictDeadline || null,
        });
        ctx.io.to(clientId).emit("trialVotesUpdated", room.trialVotes || {});
      }

      if (room.playerRoles?.[clientId] === "Phù thủy") {
        ensureWitchState(room, clientId);
        emitWitchPotions(roomId, clientId);
        emitWitchPendingDeath(roomId);
      }

      if (room.playerRoles?.[clientId] === "Thợ săn") {
        emitHunterTarget(roomId, clientId);
      }

      if (room.playerRoles?.[clientId] === PROTECTOR_ROLE) {
        emitProtectorTarget(roomId, clientId);
      }

      if (isElementalRoleTurn(room.playerRoles?.[clientId] || null)) {
        emitElementalTarget(roomId, clientId);
        emitElementalBuffVoteState(roomId, clientId);
      }

      if (room.playerRoles?.[clientId] === SPIRIT_WOLF_ROLE) {
        const rules = ensureRoomGameRules(room);
        if (
          (rules.allNightActionsSimultaneous || room.nightTurnRole === SPIRIT_WOLF_ROLE) &&
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
    const idx = room.players.findIndex((p) => p.id === clientId);
    if (idx < 0) return;

    const nextInGame = view === "game";
    const current = room.players[idx];
    const heartsChanged = !nextInGame && room.gameOver ? clearLobbyHeartBadges(room) : false;
    if (!current || (current.inGame === nextInGame && !heartsChanged)) return;

    room.players[idx] = { ...current, inGame: nextInGame };
    ctx.io.to(roomId).emit("roomUpdated", toPublicRoom(room));
    if (clientId === room.hostId && nextInGame) {
      emitGameLogToSocket(roomId, clientId);
    }
  });

  socket.on("updateRoomGameRules", ({ roomId, rules, applyMode }: { roomId: string; rules: Partial<RoomGameRules>; applyMode?: "next-round" | "restart-now" }) => {
    const room = rooms[roomId];
    if (!room) return;
    if (clientId !== room.hostId) return;

    const mergedRules = buildRoomGameRules({ ...(ensureRoomGameRules(room) || {}), ...(rules || {}) });
    const gameInProgress = !!room.phase && !room.gameOver;

    if (!gameInProgress) {
      room.gameRules = mergedRules;
      delete room.pendingGameRules;
      ctx.io.to(roomId).emit("roomUpdated", toPublicRoom(room));
      return;
    }

    if (applyMode === "next-round") {
      room.pendingGameRules = mergedRules;
      ctx.io.to(roomId).emit("roomUpdated", toPublicRoom(room));
      return;
    }

    if (applyMode === "restart-now") {
      room.gameRules = mergedRules;
      delete room.pendingGameRules;
      ctx.io.to(roomId).emit("roomUpdated", toPublicRoom(room));
      returnHostToGameView(roomId, "Đang khởi tạo ván chơi mới");
      emitRestartCinematicToPlayers(roomId, "Quản trò đã thiết lập lại luật chơi và khởi động lại ván chơi mới");
      setTimeout(() => {
        startFreshRoundWithCurrentRoles(roomId);
      }, RULES_RESTART_RESTART_AT_MS);
      return;
    }

    socket.emit("errorMessage", "Ván chơi đang diễn ra. Hãy chọn áp dụng luật cho ván sau hoặc khởi động lại ván mới.");
  });

  socket.on("setPendingRoleAssignment", ({
    roomId,
    targetId,
    role,
  }: {
    roomId: string;
    targetId: string;
    role?: string | null;
  }) => {
    const room = rooms[roomId];
    if (!room) return;
    if (clientId !== room.hostId) return;

    if (!room.players.find((player) => player.id === targetId) || targetId === room.hostId) {
      socket.emit("errorMessage", "Người chơi không hợp lệ.");
      return;
    }

    pruneRoomPendingRoleAssignments(room);
    const nextAssignments: PendingRoleAssignments = { ...(room.pendingRoleAssignments || {}) };
    const nextRole = typeof role === "string" && role.trim().length > 0 ? role : null;

    if (!nextRole) {
      delete nextAssignments[targetId];
      setRoomPendingRoleAssignments(room, nextAssignments);
      emitPendingRoleAssignmentsToHost(roomId);
      return;
    }

    const roleCount = (room.roles || []).filter((roomRole) => roomRole === nextRole).length;
    if (roleCount <= 0) {
      socket.emit("errorMessage", "Vai trò này chưa có trong danh sách vai trò của phòng.");
      return;
    }

    if (room.pendingRoleBlocks?.[targetId]?.includes(nextRole)) {
      socket.emit("errorMessage", "Người chơi này đang bị chặn vai trò đó. Hãy xóa chặn trước khi phát trước role này.");
      return;
    }

    const usedByOthers = Object.entries(nextAssignments).filter(
      ([playerId, assignedRole]) => playerId !== targetId && assignedRole === nextRole,
    ).length;
    if (usedByOthers >= roleCount) {
      socket.emit("errorMessage", "Vai trò này đã được phát trước đủ số lượng hiện có.");
      return;
    }

    nextAssignments[targetId] = nextRole;
    setRoomPendingRoleAssignments(room, nextAssignments);
    emitPendingRoleAssignmentsToHost(roomId);
  });

  socket.on("setPendingRoleBlock", ({
    roomId,
    targetId,
    role,
    blocked,
  }: {
    roomId: string;
    targetId: string;
    role?: string | null;
    blocked?: boolean;
  }) => {
    const room = rooms[roomId];
    if (!room) return;
    if (clientId !== room.hostId) return;

    if (!room.players.find((player) => player.id === targetId) || targetId === room.hostId) {
      socket.emit("errorMessage", "Người chơi không hợp lệ.");
      return;
    }

    const nextRole = typeof role === "string" && role.trim().length > 0 ? role : null;
    if (!nextRole) return;

    const roleCount = (room.roles || []).filter((roomRole) => roomRole === nextRole).length;
    if (roleCount <= 0) {
      socket.emit("errorMessage", "Vai trò này chưa có trong danh sách vai trò của phòng.");
      return;
    }

    pruneRoomPendingRoleAssignments(room);
    pruneRoomPendingRoleBlocks(room);

    if (blocked !== false && room.pendingRoleAssignments?.[targetId] === nextRole) {
      socket.emit("errorMessage", "Người chơi này đang được phát trước vai trò đó. Hãy xóa phát trước trước khi chặn role này.");
      return;
    }

    const nextBlocks: PendingRoleBlocks = { ...(room.pendingRoleBlocks || {}) };
    const currentBlocks = new Set(nextBlocks[targetId] || []);
    if (blocked === false) {
      currentBlocks.delete(nextRole);
    } else {
      currentBlocks.add(nextRole);
    }

    if (currentBlocks.size > 0) {
      nextBlocks[targetId] = Array.from(currentBlocks);
    } else {
      delete nextBlocks[targetId];
    }

    setRoomPendingRoleBlocks(room, nextBlocks);
    emitPendingRoleBlocksToHost(roomId);
  });

  socket.on("returnToCurrentGame", ({ roomId }: { roomId: string }) => {
    const room = rooms[roomId];
    if (!room) return;
    if (clientId !== room.hostId) return;
    if (!room.phase || room.gameOver) return;

    const idx = room.players.findIndex((p) => p.id === clientId);
    if (idx >= 0) {
      room.players[idx] = { ...room.players[idx]!, inGame: true };
      ctx.io.to(roomId).emit("roomUpdated", toPublicRoom(room));
    }
    ctx.io.to(clientId).emit("gameStarted");
    emitRolesRevealToSocket(roomId, clientId);
  });

  socket.on("requestReturnToRoom", ({ roomId }: { roomId: string }) => {
    const room = rooms[roomId];
    if (!room) {
      ctx.io.to(clientId).emit("returnToRoomResult", { ok: false, reason: "room_closed" });
      return;
    }

    const idx = room.players.findIndex((p) => p.id === clientId);
    if (idx < 0) {
      ctx.io.to(clientId).emit("returnToRoomResult", { ok: false, reason: "kicked" });
      return;
    }

    const current = room.players[idx];
    if (current) {
      if (room.gameOver) {
        clearLobbyHeartBadges(room);
      }
      room.players[idx] = { ...current, inGame: false };
      ctx.io.to(roomId).emit("roomUpdated", toPublicRoom(room));
    }

    ctx.io.to(clientId).emit("returnToRoomResult", { ok: true, roomId });
  });

  socket.on("hostReturnToRoom", ({ roomId }: { roomId: string }) => {
    const room = rooms[roomId];
    if (!room) return;
    if (clientId !== room.hostId) return;
    if (!room.phase || room.gameOver) return;

    resetRoomFromGameToLobby(room);
    ctx.io.to(roomId).emit("roomUpdated", toPublicRoom(room));
    ctx.io.to(roomId).emit("forceReturnToRoom", { roomId, reason: "host_returned_to_room" });
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
    if (!room) {
      return;
    }
    if (clientId !== room.hostId) {
      return;
    }

    const gameInProgress = !!room.phase && !room.gameOver;
    const participantCount = getParticipantCount(room);
    const incomingRoles = Array.isArray(roles) ? roles : [];

    if (incomingRoles.length < participantCount) {
      socket.emit("errorMessage", "Danh sách vai trò không hợp lệ hoặc chưa được chọn.");
      return;
    }

    const incomingWolfCount = getWolfRoleCount(incomingRoles);
    const maxAllowedWolfCount = getMaxAllowedWolfCount(participantCount);

    if (incomingWolfCount > maxAllowedWolfCount && !forceAdjustWolfCount) {
      ctx.io.to(room.hostId).emit("wolfRoleMismatch", {
        currentWolfCount: incomingWolfCount,
        maxAllowedWolfCount,
        playerCount: participantCount,
      });
      return;
    }

    room.roles = incomingRoles;
    room.rolesLocked = true;
    room.lockedPlayerIds = getParticipantIds(room);

    if (incomingWolfCount > maxAllowedWolfCount && forceAdjustWolfCount) {
      rebalanceWolfRoles(room, maxAllowedWolfCount);
    }
    syncPendingRoleInterventionsToHost(roomId);

    if (gameInProgress && applyMode === "restart-now") {
      const wolfCount = getWolfRoleCount(room.roles);

      if (wolfCount > maxAllowedWolfCount) {
        if (!forceAdjustWolfCount) {
          ctx.io.to(room.hostId).emit("wolfRoleMismatch", {
            currentWolfCount: wolfCount,
            maxAllowedWolfCount,
            playerCount: participantCount,
          });
          return;
        }

        rebalanceWolfRoles(room, maxAllowedWolfCount);
        syncPendingRoleInterventionsToHost(roomId);
      }

      ctx.io.to(roomId).emit("roomUpdated", toPublicRoom(room));
      returnHostToGameView(roomId, "Đang khởi tạo ván chơi mới");
      emitRestartCinematicToPlayers(roomId, "Quản trò đã cập nhật danh sách vai trò và khởi động lại ván chơi mới");
      setTimeout(() => {
        startFreshRoundWithCurrentRoles(roomId);
      }, RULES_RESTART_RESTART_AT_MS);
      return;
    }

    if (gameInProgress && applyMode === "next-round") {
      ctx.io.to(roomId).emit("roomUpdated", toPublicRoom(room));
      ctx.io.to(roomId).emit("rolesReady", room.roles);
      return;
    }

    ctx.io.to(roomId).emit("rolesReady", room.roles);
    ctx.io.to(roomId).emit("roomUpdated", toPublicRoom(room));
  });

  socket.on("addAutoRoles", ({ roomId, count }) => {
    const room = rooms[roomId];
    if (!room) {
      return;
    }
    room.roles = room.roles || [];

    for (let i = 0; i < count; i++) {
      room.roles.push("Dân làng");
    }

    const stillMissing = getParticipantCount(room) - room.roles.length;

    if (stillMissing > 0) {
      ctx.io.to(room.hostId).emit("roleMismatch", {
        newPlayers: [],
        missingRoles: stillMissing
      });
      return;
    }

    const participants = getParticipantPlayers(room);
    const deal = dealRolesWithPendingAssignments(
      participants,
      room.roles,
      room.pendingRoleAssignments,
      room.pendingRoleBlocks,
      (remainingRoles) => remainingRoles.slice().sort(() => Math.random() - 0.5),
    );

    if (!deal) {
      socket.emit("errorMessage", "Danh sách vai trò không hợp lệ hoặc chưa được chọn.");
      return;
    }

    room.playerRoles = deal.playerRoles;
    delete room.pendingRoleAssignments;
    delete room.pendingRoleBlocks;
    emitPendingRoleAssignmentsToHost(roomId);
    emitPendingRoleBlocksToHost(roomId);

    participants.forEach((player) => {
      const role = room.playerRoles![player.id]!;
      room.playerRoles![player.id] = role;
      ctx.io.to(player.id).emit("yourRole", role);
      ctx.io.to(player.id).emit("wildWolfConvertedState", { converted: false });
    });
    room.players = room.players.map((p) => ({ ...p, inGame: p.id !== room.hostId }));

    room.wolves = participants
      .filter(p => isWolfRole(room.playerRoles?.[p.id]))
      .map(p => p.id);

    room.wolves.forEach(wolfId => {
      ctx.io.in(wolfId).socketsJoin(`wolves_${roomId}`);
    });

    room.deadPlayers = room.deadPlayers || [];
    room.publicRevealedRolesByPlayerId = {};
    room.angelReviveAvailableByPlayerId = {};
    room.angelReviveUsedPlayerIds = [];
    room.angelReviveRecordsByAngelId = {};
    room.angelHiddenRevivedPlayerIds = [];
    room.angelOutcomeLoggedPlayerIds = [];
    room.privatePlayerHearts = {};
    room.privateHeartVisiblePlayerIds = [];
    room.playerHeartShakeIds = [];
    room.villageChiefDyingFramePlayerIds = [];
    room.villageChiefPendingWolfDeath = null;
    room.villageChiefExtraVoteAvailable = false;
    room.villageChiefExtraVoteReady = false;
    room.villageChiefExtraVoteUsed = false;
    room.protectorActorId = null;
    room.protectorTargetId = null;
    room.protectorTargetSetNight = null;
    room.protectorImmortalityPermanent = false;
    room.wolfExtraBiteNextNight = room.wolfExtraBiteNextNight || false;
    room.wolfBonusBiteThisNight = false;
    room.hunterShotPlayerIds = [];
    room.loveCupidId = null;
    room.loveTargetId = null;
    room.loveTargetWolfAligned = false;
    room.lovePairCreatedNight = null;
    room.loveEscapeUsed = false;
    room.loveEscapeVotesTonight = {};
    room.loveEscapeVoteAt = {};
    room.loveEscapeActiveTonight = false;
    room.loveEscapeActivatedAt = null;
    room.wolfVoteResolvedTonight = false;
    room.wolfAttackResolvedAt = null;
    room.killedTonightExtra = null;
    room.dayVoters = [];
    room.dayVotes = {};
    room.dayLocked = {};
    room.dayVoteKind = "main";
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

    room.gameOver = false;
    room.winner = undefined;
    room.spiritWolfId = getSpiritWolfId(room);
    room.spiritWolfDecisionMade = false;
    room.spiritWolfChoseSave = false;
    room.spiritWolfWolfAligned = false;
    room.spiritWolfWolfAlignedPending = false;
    room.spiritWolfPendingPoisonedWolfId = null;
    room.spiritWolfDecisionDeadline = null;
    room.wildWolfConvertedPlayerIds = [];
    room.banSoiId = getBanSoiId(room);
    room.banSoiWolfAligned = false;
    room.banSoiWolfAlignedPending = false;
    room.wildWolfId = getWildWolfId(room);
    room.wildWolfConvertReadyNextNight = false;
    room.wildWolfConvertAvailableTonight = false;
    room.wildWolfConvertRequestedTonight = false;
    room.wildWolfConvertActorId = null;
    room.wildWolfConvertTargetId = null;
    room.wildWolfConvertUsed = false;
    room.angelReviveAvailableByPlayerId = {};
    room.angelReviveUsedPlayerIds = [];
    room.angelReviveRecordsByAngelId = {};
    room.angelHiddenRevivedPlayerIds = [];
    room.angelOutcomeLoggedPlayerIds = [];
    resetMerchantRoundState(room);

    room.hidePlayerRoleText = true;
    room.phase = "dusk";

    ctx.io.to(roomId).emit("phaseChanged", "dusk");
    clearLoveStateForPlayers(ctx, room, roomId);
    ctx.io.to(roomId).emit("roomUpdated", toPublicRoom(room));
    ctx.io.to(roomId).emit("gameStarted");

    checkAndEndGame(roomId, "after_game_start");

    room.lockedPlayerIds = getParticipantIds(room);  });

  socket.on("updatePositions", ({ roomId, positions, markAutoArrangeUsed }) => {
    const room = rooms[roomId];
    if (!room) {      return;
    }    const isHost = clientId === room.hostId;
    const isEditor = room.positionEditors?.includes(clientId);

    if (!isHost && !isEditor) {      socket.emit("errorMessage", "Bạn không có quyền chỉnh vị trí.");
      return;
    }

    const playerIds = getParticipantIds(room);
    const desiredHeightPx = desiredLayoutHeightPx(playerIds.length);
    rescaleRoomPositionsForHeight(room, desiredHeightPx);

    const opts = layoutOptsForRoom(room);
    const hasAllPlayers = (room.positions || []).length === playerIds.length;
    const current = room.positions && hasAllPlayers
      ? room.positions.map(p => clampToBounds({ ...p }, opts))
      : ensureNonOverlappingPositions(playerIds, room.positions, opts);

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
        ctx.io.to(roomId).emit("positionsUpdated", room.positions);
        return;
      }
    }

    room.positions = ensureNonOverlappingPositions(playerIds, positions, opts);
    ctx.io.to(roomId).emit("positionsUpdated", room.positions);

    if (markAutoArrangeUsed && !room.autoArrangeUsed) {
      room.autoArrangeUsed = true;
      ctx.io.to(roomId).emit("roomUpdated", toPublicRoom(room));
    }  });

  socket.on("setCompactCircles", ({ roomId, compact }: { roomId: string; compact: boolean }) => {
    const room = rooms[roomId];
    if (!room) return;

    const isHost = clientId === room.hostId;
    const isEditor = room.positionEditors?.includes(clientId);
    if (!isHost && !isEditor) {
      socket.emit("errorMessage", "Bạn không có quyền chỉnh vị trí.");
      return;
    }

    room.compactCircles = !!compact;
    ctx.io.to(roomId).emit("roomUpdated", toPublicRoom(room));
  });

  socket.on("grantPositionEdit", ({ roomId, targetId }) => {
    const room = rooms[roomId];
    if (!room) return;
    if (clientId !== room.hostId) return;

    room.positionEditors = room.positionEditors || [];
    if (!room.positionEditors.includes(targetId)) {
      room.positionEditors.push(targetId);
    }

    ctx.io.to(roomId).emit("positionEditorsUpdated", room.positionEditors);
  });

  socket.on("revokePositionEdit", ({ roomId, targetId }) => {
    const room = rooms[roomId];
    if (!room) return;
    if (clientId !== room.hostId) return;

    room.positionEditors = (room.positionEditors || []).filter(id => id !== targetId);
    ctx.io.to(roomId).emit("positionEditorsUpdated", room.positionEditors);
  });

  socket.on("disconnect", () => {
    console.log("Client ngắt:", clientId);
    activeClientSockets[clientId]?.delete(socket.id);
    if (activeClientSockets[clientId]?.size === 0) {
      delete activeClientSockets[clientId];
    }
    if (isClientCurrentlyConnected(clientId)) return;

    for (const roomId in rooms) {
      const room = rooms[roomId];
      if (!room) continue;

      const playerIndex = room.players.findIndex(p => p.id === clientId);
      if (playerIndex !== -1) {
        const isHost = room.hostId === clientId;

        if (room.phase) {
          room.players[playerIndex] = { ...room.players[playerIndex]!, connected: false };

          if (isWolfAlignedPlayer(room, clientId)) {
            if (room.wolfVotes) room.wolfVotes[clientId] = null;
            if (room.wolfVotes2) room.wolfVotes2[clientId] = null;
            if (room.wolfLocked) room.wolfLocked[clientId] = false;
            ctx.io.to(`wolves_${roomId}`).emit("wolfVotesUpdated", room.wolfVotes || {});
            ctx.io.to(`wolves_${roomId}`).emit("wolfVotes2Updated", room.wolfVotes2 || {});
            ctx.io.to(`wolves_${roomId}`).emit("wolfLockedUpdated", room.wolfLocked || {});
            emitHostNightActionProgress(roomId);

            finishWolfVotingIfAllLocked(roomId, room);
          }

          if (room.phase === "day") {
            if (room.dayVotes) room.dayVotes[clientId] = null;
            if (room.dayLocked) room.dayLocked[clientId] = false;

            ctx.io.to(roomId).emit("dayVotesUpdated", room.dayVotes || {});
            ctx.io.to(roomId).emit("dayLockedUpdated", room.dayLocked || {});
            if (room.dayDeadline) {
              ctx.io.to(roomId).emit("dayPhaseStarted", {
                voters: getActiveDayVoters(room),
                deadline: room.dayDeadline,
              });
            } else {
              ctx.io.to(roomId).emit("dayDiscussionStarted", {
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

            if (room.trialStage === "defense") {
              const activeSet = new Set(room.trialInteractionActiveIds || []);
              if (activeSet.has(clientId)) {
                activeSet.delete(clientId);
                room.trialInteractionActiveIds = Array.from(activeSet);
              }
              const queuedSet = new Set(room.trialInteractionQueuedIds || []);
              if (queuedSet.has(clientId)) {
                queuedSet.delete(clientId);
                room.trialInteractionQueuedIds = Array.from(queuedSet);
              }
              if (room.trialSelectedInteractorId === clientId) {
                room.trialSelectedInteractorId = null;
              }

              if (room.trialTargetId === clientId) {
                startTrialVerdictVoting(roomId);
              } else {
                ctx.io.to(roomId).emit("trialInteractionUpdated", buildTrialInteractionUpdatedPayload(room));
              }
            }

            if (room.trialStage === "verdict") {
              if (room.trialVotes) room.trialVotes[clientId] = null;
              ctx.io.to(roomId).emit("trialVotesUpdated", room.trialVotes || {});

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

          ctx.io.to(roomId).emit("roomUpdated", toPublicRoom(room));

          if (isHost) {
            ctx.io.to(roomId).emit("hostDisconnected");
            console.log(`Host mất kết nối khi game đang diễn ra ở phòng ${roomId}`);
          }

          break;
        }

        room.players[playerIndex] = { ...room.players[playerIndex]!, connected: false };
        scheduleDisconnectedCleanup(roomId, clientId);
        ctx.io.to(roomId).emit("roomUpdated", toPublicRoom(room));
        break;
      }
    }
  });

  socket.on("startGame", (payload) => {
    const roomId = typeof payload === "string" ? payload : payload?.roomId;
    const forceAdjustWolfCount = typeof payload === "object" && payload !== null ? !!payload.forceAdjustWolfCount : false;

    if (!roomId) {      return;
    }

    const room = rooms[roomId];
    if (!room) {      return;
    }    if (room.pendingGameRules) {
      room.gameRules = buildRoomGameRules(room.pendingGameRules);
      delete room.pendingGameRules;
    }

    if (room.rolesLocked && room.lockedPlayerIds) {
      const lockedCount = room.lockedPlayerIds.length;
      const currentCount = getParticipantCount(room);
      if (currentCount > lockedCount) {
        const newPlayers = getParticipantPlayers(room).filter(
          p => !room.lockedPlayerIds!.includes(p.id)
        );
        const missingRoles = Math.max(0, currentCount - (room.roles?.length || 0));
        if (missingRoles > 0) {          ctx.io.to(room.hostId).emit("roleMismatch", {
            newPlayers,
            missingRoles
          });
          return;
        }
      }
    }

    const roles = room.roles;
    const participantCount = getParticipantCount(room);
    if (!roles || roles.length < participantCount) {      socket.emit("errorMessage", "Danh sách vai trò không hợp lệ hoặc chưa được chọn.");
      return;
    }

    const wolfCount = getWolfRoleCount(roles);
    const maxAllowedWolfCount = getMaxAllowedWolfCount(participantCount);

    if (wolfCount > maxAllowedWolfCount) {
      if (!forceAdjustWolfCount) {        ctx.io.to(room.hostId).emit("wolfRoleMismatch", {
          currentWolfCount: wolfCount,
          maxAllowedWolfCount,
          playerCount: participantCount,
        });
        return;
      }

      rebalanceWolfRoles(room, maxAllowedWolfCount);
      syncPendingRoleInterventionsToHost(roomId);
      ctx.io.to(roomId).emit("roomUpdated", toPublicRoom(room));
    }

    clearGameTimers(room);
    clearTrialState(room);
    room.gameOver = false;
    room.winner = undefined;
    room.phase = "dusk";
    room.nightCount = 0;
    room.gameLog = [];
    room.deadPlayers = [];
    room.angelReviveAvailableByPlayerId = {};
    room.angelReviveUsedPlayerIds = [];
    room.angelReviveRecordsByAngelId = {};
    room.angelHiddenRevivedPlayerIds = [];
    room.angelOutcomeLoggedPlayerIds = [];
    room.publicRevealedRolesByPlayerId = {};
    room.sharedHeartsVisible = false;
    room.playerHearts = {};
    room.privatePlayerHearts = {};
    room.privateHeartVisiblePlayerIds = [];
    room.playerHeartShakeIds = [];
    room.villageChiefDyingFramePlayerIds = [];
    room.protectedTonight = null;
    room.protectedTonightBy = null;
    room.protectedTonightAt = null;
    room.lastProtected = null;
    room.seerUsedTonight = {};
    room.hunterTargetTonight = {};
    room.hunterShotPlayerIds = [];
    room.loveCupidId = null;
    room.loveTargetId = null;
    room.loveTargetWolfAligned = false;
    room.lovePairCreatedNight = null;
    room.loveEscapeUsed = false;
    room.loveEscapeVotesTonight = {};
    room.loveEscapeVoteAt = {};
    room.loveEscapeActiveTonight = false;
    room.loveEscapeActivatedAt = null;
    room.killedTonight = null;
    room.killedTonightExtra = null;
    room.wolfAttackResolvedAt = null;
    room.wolfVotes = {};
    room.wolfVotes2 = {};
    room.wolfLocked = {};
    room.wolfDeadline = null;
    room.wolfVoteResolvedTonight = false;
    room.wolfExtraBiteNextNight = false;
    room.wolfBonusBiteThisNight = false;
    resetNightTurnState(room);
    room.dayVoters = [];
    room.dayVotes = {};
    room.dayLocked = {};
    room.dayVoteKind = "main";
    room.dayDiscussionDeadline = null;
    room.dayDeadline = null;
    room.hidePlayerRoleText = true;
    room.spiritWolfDecisionMade = false;
    room.spiritWolfChoseSave = false;
    room.spiritWolfWolfAligned = false;
    room.spiritWolfWolfAlignedPending = false;
    room.spiritWolfPendingPoisonedWolfId = null;
    room.spiritWolfDecisionDeadline = null;
    room.banSoiId = null;
    room.banSoiWolfAligned = false;
    room.banSoiWolfAlignedPending = false;
    room.wildWolfId = null;
    room.wildWolfConvertReadyNextNight = false;
    room.wildWolfConvertAvailableTonight = false;
    room.wildWolfConvertRequestedTonight = false;
    room.wildWolfConvertActorId = null;
    room.wildWolfConvertTargetId = null;
    room.wildWolfConvertUsed = false;
    room.wildWolfConvertedPlayerIds = [];
    room.villageChiefPendingWolfDeath = null;
    room.villageChiefExtraVoteAvailable = false;
    room.villageChiefExtraVoteReady = false;
    room.villageChiefExtraVoteUsed = false;
    room.protectorActorId = null;
    room.protectorTargetId = null;
    room.protectorTargetSetNight = null;
    room.protectorImmortalityPermanent = false;
    room.elementalTargetTonight = {};
    room.elementalCorrectGuessPlayerIdsTonight = [];
    room.elementalCorrectGuessCountForBuff = 0;
    room.elementalPendingBuffVoteNight = null;
    room.elementalBuffVotesTonight = {};
    room.elementalBuffVotesResolvedNight = null;
    room.elementalSelectedBuffId = null;
    room.elementalSelectedBuffAppliesNight = null;
    room.elementalBuffQuickMode = true;
    resetMerchantRoundState(room);
    room.witchPotions = {};
    room.witchHealTargetTonight = {};
    room.witchPoisonTargetTonight = {};
    room.witchHealTargetAt = {};
    room.witchPoisonTargetAt = {};
    room.wolves = [];
    room.players = room.players.map((p) => ({ ...p, inGame: p.id !== room.hostId }));

    if (ensureRoomGameRules(room).twoHeartsFirstTwoNights) {
      initTwoHeartsForParticipants(room);
    }


    const participants = getParticipantPlayers(room);
    const deal = dealRolesWithPendingAssignments(
      participants,
      room.roles || roles,
      room.pendingRoleAssignments,
      room.pendingRoleBlocks,
      pickRolesForParticipants,
    );

    if (!deal) {
      socket.emit("errorMessage", "Danh sách vai trò không hợp lệ hoặc chưa được chọn.");
      return;
    }

    room.playerRoles = deal.playerRoles;
    delete room.pendingRoleAssignments;
    delete room.pendingRoleBlocks;
    emitPendingRoleAssignmentsToHost(roomId);
    emitPendingRoleBlocksToHost(roomId);

    participants.forEach((player) => {
      const role = room.playerRoles![player.id]!;
      room.playerRoles![player.id] = role;
      ctx.io.to(player.id).emit("yourRole", role);
      ctx.io.to(player.id).emit("wildWolfConvertedState", { converted: false });
    });
    room.players = room.players.map((p) => ({ ...p, inGame: p.id !== room.hostId }));

    room.wolves = participants
      .filter(p => isWolfRole(room.playerRoles?.[p.id]))
      .map(p => p.id);

    room.wolves.forEach(wolfId => {
      ctx.io.in(wolfId).socketsJoin(`wolves_${roomId}`);
    });

    room.banSoiId = getBanSoiId(room);
    room.wildWolfId = getWildWolfId(room);

    const witches = getWitches(room);
    witches.forEach(witchId => {
      ctx.io.in(witchId).socketsJoin(`witches_${roomId}`);
      ensureWitchState(room, witchId);
      emitWitchPotions(roomId, witchId);
    });

    room.deadPlayers = room.deadPlayers || [];
    room.wolfExtraBiteNextNight = room.wolfExtraBiteNextNight || false;
    room.wolfBonusBiteThisNight = false;
    room.hunterShotPlayerIds = [];
    room.wolfVoteResolvedTonight = false;
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

    room.hidePlayerRoleText = true;
    room.phase = "dusk";

    ctx.io.to(roomId).emit("phaseChanged", "dusk");
    clearLoveStateForPlayers(ctx, room, roomId);
    ctx.io.to(roomId).emit("roomUpdated", toPublicRoom(room));
    ctx.io.to(roomId).emit("gameStarted");
    
    emitRolesRevealToSocket(roomId, room.hostId);
    
    checkAndEndGame(roomId, "after_game_start");
  });

  socket.on("requestRolesReveal", ({ roomId }: { roomId: string }) => {
    const room = rooms[roomId];
    if (!room) return;
    if (clientId !== room.hostId) return;

    emitRolesRevealToSocket(roomId, clientId);
  });

  socket.on("requestGameLog", ({ roomId }: { roomId: string }) => {
    const room = rooms[roomId];
    if (!room) return;

    if (clientId === room.hostId || room.gameOver) {
      emitGameLogToSocket(roomId, clientId);
      return;
    }

    if (room.phase === "day") {
      emitPublicDayGameLogToSocket(roomId, clientId);
    }
  });

  socket.on("hostRevealDisconnectedBadge", ({ roomId, show }: { roomId: string; show: boolean }) => {
    const room = rooms[roomId];
    if (!room) return;
    if (clientId !== room.hostId) return;

    ctx.io.to(roomId).emit("revealDisconnectedBadge", { show: !!show });
  });

  socket.on("requestHostNightActionProgress", ({ roomId }: { roomId: string }) => {
    const room = rooms[roomId];
    if (!room) return;
    if (clientId !== room.hostId) return;
    emitHostNightActionProgress(roomId);
  });

  socket.on("loveChoosePartner", ({ roomId, targetId }) => {
    const room = rooms[roomId];
    if (!room || !room.playerRoles) return;
    if (room.gameOver) return;
    if (room.phase !== "night") return;
    if (!canLoveChoosePartnerTonight(room)) return;
    if (!canPerformNightRoleAction(room, clientId, LOVE_ROLE)) return;
    if (room.playerRoles?.[clientId] !== LOVE_ROLE) return;
    if (!canPlayerActAtNight(room, clientId)) return;
    if (room.loveTargetId) return;

    if (!targetId || targetId === clientId) return;
    if (!room.players.find((player) => player.id === targetId)) return;
    if ((room.deadPlayers || []).includes(targetId)) return;

    const targetRole = room.playerRoles[targetId];
    if (!targetRole) return;
    const targetWolfAligned = isWolfAlignedPlayer(room, targetId) || isWolfRole(targetRole);

    room.loveCupidId = clientId;
    room.loveTargetId = targetId;
    room.loveTargetWolfAligned = targetWolfAligned;
    room.lovePairCreatedNight = room.nightCount || 1;
    room.loveEscapeUsed = false;
    room.loveEscapeVotesTonight = {};
    room.loveEscapeVoteAt = {};
    room.loveEscapeActiveTonight = false;
    room.loveEscapeActivatedAt = null;

    appendLogEntry(room, {
      type: "love_pair",
      phase: "night",
      actorId: clientId,
      targetId,
      targetWolfAligned,
    });

    ctx.io.to(clientId).emit("loveChoiceRecorded", { targetId });
    for (const socketId of [clientId, targetId, room.hostId]) {
      ctx.io.to(socketId).emit("loveArrowShot", { cupidId: clientId, targetId });
    }
    emitLoveStateToPair(ctx, roomId, room);
    emitHostNightActionProgress(roomId);
    ctx.io.to(roomId).emit("roomUpdated", toPublicRoom(room));
  });

  socket.on("loveEscapeVote", ({ roomId }) => {
    const room = rooms[roomId];
    if (!room) return;
    if (room.gameOver) return;
    if (room.phase !== "night") return;
    if (!canPlayerActAtNight(room, clientId)) return;
    if (room.loveEscapeUsed || room.loveEscapeActiveTonight) return;
    const rules = ensureRoomGameRules(room);
    if (rules.allNightActionsSimultaneous) {
      const deadline = getSimultaneousDeadlineForPlayer(room, clientId);
      if (deadline && Date.now() >= deadline) return;
    } else if (!room.nightTurnPaused && room.nightTurnDeadline && Date.now() >= room.nightTurnDeadline) {
      return;
    }

    const partnerId = getLovePartnerId(room, clientId);
    if (!partnerId) return;
    if ((room.deadPlayers || []).includes(partnerId)) return;

    room.loveEscapeVotesTonight = room.loveEscapeVotesTonight || {};
    room.loveEscapeVoteAt = room.loveEscapeVoteAt || {};
    if (room.loveEscapeVotesTonight[clientId]) return;
    const partnerAlreadyVoted = room.loveEscapeVotesTonight[partnerId] === true;

    room.loveEscapeVotesTonight[clientId] = true;
    room.loveEscapeVoteAt[clientId] = Date.now();

    if (!partnerAlreadyVoted) {
      appendLogEntry(room, {
        type: "love_escape_vote",
        phase: "night",
        actorId: clientId,
        partnerId,
      });
    }

    const pair = getLovePairIds(room);
    if (pair && pair.every((id) => room.loveEscapeVotesTonight?.[id] === true)) {
      room.loveEscapeUsed = true;
      room.loveEscapeActiveTonight = true;
      room.loveEscapeActivatedAt = Date.now();
      appendLogEntry(room, {
        type: "love_escape",
        phase: "night",
        targetIds: pair,
      });
      appendGameEvent(room, {
        type: "LOVE_ESCAPE",
        phase: "night",
        targetIds: pair,
      });
    }

    emitLoveStateToPair(ctx, roomId, room);
    ctx.io.to(roomId).emit("roomUpdated", toPublicRoom(room));
  });

  socket.on("restartGame", ({ roomId }) => {
    const room = rooms[roomId];
    if (!room) return;
    if (clientId !== room.hostId) return;

    const ok = startFreshRoundWithCurrentRoles(roomId);
    if (!ok) {
      socket.emit("errorMessage", "Danh sách vai trò không hợp lệ hoặc chưa được chọn.");
    }
  });

  socket.on("changePhase", ({ roomId, phase }) => {
    const room = rooms[roomId];
    if (!room) return;

    if (room.gameOver) return;

    const previousPhase = room.phase;
    room.phase = phase;
    if (phase === "dusk" || phase === "day" || phase === "night") {
      room.hidePlayerRoleText = true;
    }
    console.log(`[changePhase] Phòng ${roomId} chuyển sang phase '${phase}'`);
    ctx.io.to(roomId).emit("phaseChanged", phase);

    if (phase === "day") {
      const revealedAngelRevives = revealAngelHiddenRevivesForDay(room);
      for (const record of revealedAngelRevives) {
        emitAngelPrivateState(ctx, roomId, room, record.angelId);
        emitAngelPrivateState(ctx, roomId, room, record.targetId);
      }
      if (revealedAngelRevives.length) {
        emitAngelPrivateStateForAll(ctx, roomId, room);
      }

      const wasElementalBuffVoteNight = shouldElementalsVoteBuffTonight(room);
      if (wasElementalBuffVoteNight) {
        resolveElementalBuffVote(roomId);
      } else {
        finalizeElementalGuessNight(room);
      }

      if (
        ensureRoomGameRules(room).allNightActionsSimultaneous &&
        !room.wolfVoteResolvedTonight &&
        !room.merchantWolfBiteDisabledTonight
      ) {
        finishWolfVoting(roomId);
      }
      clearSpiritWolfDecisionTimer(room);
      room.spiritWolfDecisionDeadline = null;
      if (room.spiritWolfPendingPoisonedWolfId && !room.spiritWolfDecisionMade) {
        room.spiritWolfDecisionMade = true;
        room.spiritWolfChoseSave = false;
        const spiritWolfId = getSpiritWolfId(room);
        appendLogEntry(room, { type: "spirit_wolf_decision", phase: "night", actorId: spiritWolfId, saved: false, timedOut: true });
        if (spiritWolfId) {
          ctx.io.to(spiritWolfId).emit("spiritWolfDecisionRecorded", { saved: false });
        }
      }
      room.spiritWolfPendingPoisonedWolfId = null;
      finalizeUnmatchedLoveEscapeVote(roomId, room);
      room.privatePlayerHearts = {};
      room.privateHeartVisiblePlayerIds = [];
      room.playerHeartShakeIds = [];
      room.villageChiefDyingFramePlayerIds = [];
      resolveVillageChiefDelayedWolfDeath(roomId, room);
      resolveNightDeaths(roomId, room);
      expireMerchantItemsAtNightEnd(room);
      room.merchantCheeseMarkedPlayerIds = [];
      emitMerchantCheeseMarks(roomId);
      emitMerchantPrivateStateForAll(roomId);

      ctx.io.to(roomId).emit("roomUpdated", toPublicRoom(room));
      checkAndEndGame(roomId, "after_night_kills");
      if (!room.gameOver) {
        startDayDiscussion(roomId);
      }
    } else if (phase === "night") {
      if (previousPhase === "day") {
        const currentNightLog = ensureNightLog(room);
        const hasDayVoteLog = currentNightLog?.entries.some((entry) =>
          entry.phase === "day" &&
          (
            entry.type === "day_vote" ||
            entry.type === "day_result" ||
            entry.type === "day_vote_skipped" ||
            entry.type === "trial_verdict"
          )
        );
        const hadDayVotingState =
          !!room.dayDeadline ||
          !!room.dayDiscussionDeadline ||
          (room.dayVoters || []).length > 0 ||
          Object.values(room.dayVotes || {}).some(Boolean);
        if (!hasDayVoteLog && hadDayVotingState) {
          appendLogEntry(room, { type: "day_vote_skipped", phase: "day" });
        }
      }
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
      ctx.io.to(roomId).emit("dayDiscussionStarted", { deadline: null });
      clearTrialState(room);

      room.nightCount = (room.nightCount || 0) + 1;
      expireUnusedAngelReviveOpportunities(room);
      const activatedAngelRevives = activateAngelRevivesForNight(room);
      for (const record of activatedAngelRevives) {
        appendLogEntry(room, {
          type: "angel_revive_activated",
          phase: "night",
          actorId: record.angelId,
          targetId: record.targetId,
          guess: record.guess,
        });
        if (isWolfAlignedPlayer(room, record.targetId)) {
          ctx.io.in(record.targetId).socketsJoin(`wolves_${roomId}`);
        }
        emitAngelPrivateState(ctx, roomId, room, record.angelId);
        emitAngelPrivateState(ctx, roomId, room, record.targetId);
      }
      emitAngelPrivateStateForAll(ctx, roomId, room);
      checkAndEndGame(roomId, "angel_revive_expired");
      if (room.gameOver) return;

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

      ensureNightLog(room);

      const rulesForChief = ensureRoomGameRules(room);
      if (
        room.elementalSelectedBuffId === PROTECTOR_PERMANENT_BUFF_ID &&
        room.elementalSelectedBuffAppliesNight !== null &&
        typeof room.elementalSelectedBuffAppliesNight !== "undefined" &&
        room.elementalSelectedBuffAppliesNight <= (room.nightCount || 0)
      ) {
        room.protectorImmortalityPermanent = true;
      }
      room.privatePlayerHearts = {};
      room.privateHeartVisiblePlayerIds = [];
      room.playerHeartShakeIds = [];
      room.villageChiefDyingFramePlayerIds = [];
      if (
        rulesForChief.villageChiefKnowsWolfBite &&
        room.villageChiefPendingWolfDeath &&
        room.villageChiefPendingWolfDeath.bittenNight < (room.nightCount || 0) &&
        !(room.deadPlayers || []).includes(room.villageChiefPendingWolfDeath.playerId)
      ) {
        const targetId = room.villageChiefPendingWolfDeath.playerId;
        room.privatePlayerHearts = room.privatePlayerHearts || {};
        room.privatePlayerHearts[targetId] = 1;
        room.privateHeartVisiblePlayerIds = [targetId];
        room.playerHeartShakeIds = [targetId];
      }

      if (room.spiritWolfWolfAlignedPending && !room.spiritWolfWolfAligned) {
        room.spiritWolfWolfAligned = true;
        room.spiritWolfWolfAlignedPending = false;
        checkAndEndGame(roomId, "spirit_wolf_aligned_next_night");
        if (room.gameOver) return;
      }

      if (room.banSoiWolfAlignedPending && !room.banSoiWolfAligned) {
        room.banSoiWolfAligned = true;
        room.banSoiWolfAlignedPending = false;
        if (room.banSoiId) {
          appendLogEntry(room, { type: "ban_soi_aligned", phase: "night", targetId: room.banSoiId });
          appendGameEvent(room, {
            type: "ROLE_CONVERSION",
            phase: "night",
            targetIds: [room.banSoiId],
            metadata: {
              type: "ban_soi",
              toTeam: "wolves",
            },
          });
          ctx.io.in(room.banSoiId).socketsJoin(`wolves_${roomId}`);
          if (room.loveTargetId === room.banSoiId) {
            room.loveTargetWolfAligned = true;
            emitLoveStateToPair(ctx, roomId, room);
          }
        }
        checkAndEndGame(roomId, "ban_soi_aligned_next_night");
        if (room.gameOver) return;
      }

      const wildWolfId = getWildWolfId(room);
      room.wildWolfConvertAvailableTonight =
        room.wildWolfConvertReadyNextNight === true &&
        room.wildWolfConvertUsed !== true &&
        !!wildWolfId &&
        !(room.deadPlayers || []).includes(wildWolfId);
      room.wildWolfConvertReadyNextNight = false;
      room.wildWolfConvertRequestedTonight = false;
      room.wildWolfConvertActorId = null;
      room.wildWolfConvertTargetId = null;

      prepareMerchantNightState(room);
      if (
        room.merchantGuardianCarryoverTargetId &&
        room.merchantGuardianCarryoverNight === (room.nightCount || 0)
      ) {
        appendLogEntry(room, {
          type: "merchant_item_used",
          phase: "night",
          itemId: "moth-cocoon",
          targetId: room.merchantGuardianCarryoverTargetId,
        });
        appendPoppyGlassesViewLogs(room, room.merchantGuardianCarryoverTargetId);
      }
      emitMerchantCheeseMarks(roomId);
      ctx.io.to(roomId).emit("roomUpdated", toPublicRoom(room));

      room.wolfBonusBiteThisNight = !!room.wolfExtraBiteNextNight;
      room.wolfExtraBiteNextNight = false;
      room.killedTonight = null;
      room.killedTonightExtra = null;

      if (room.wolfBonusBiteThisNight) {
        appendLogEntry(room, { type: "bonus_bite", phase: "night" });
      }

      // Reset night action state.
      room.lastProtected = room.protectedTonight ?? null;
      room.protectedTonight = null;
      room.protectedTonightBy = null;
      room.protectedTonightAt = null;
      room.hunterTargetTonight = {};
      room.elementalTargetTonight = {};
      room.elementalCorrectGuessPlayerIdsTonight = [];
      room.elementalBuffVotesTonight = {};
      room.seerUsedTonight = {};
      room.witchHealTargetTonight = {};
      room.witchPoisonTargetTonight = {};
      room.witchHealTargetAt = {};
      room.witchPoisonTargetAt = {};
      room.wolfVotes = {};
      room.wolfVotes2 = {};
      room.wolfLocked = {};
      room.wolfDeadline = null;
      room.wolfVoteResolvedTonight = false;
      room.nightActionExtraTimeMsByPlayerId = {};
      room.nightTurnRemainingMs = null;
      room.wolfTurnRemainingMs = null;
      room.spiritWolfDecisionRemainingMs = null;
      room.wolfAttackResolvedAt = null;
      room.loveEscapeVotesTonight = {};
      room.loveEscapeVoteAt = {};
      room.loveEscapeActiveTonight = false;
      room.loveEscapeActivatedAt = null;
      emitLoveStateToPair(ctx, roomId, room);
      emitMerchantPrivateStateForAll(roomId);

      // Create a time-ordered action sequence.
      startNightTurnFlow(roomId);
    }
  });

  socket.on("dayChooseTarget", ({ roomId, targetId }) => {
    const room = rooms[roomId];
    if (!room) return;
    if (room.gameOver) return;
    if (room.phase !== "day") return;
    if (!room.dayDeadline) return;
    if ((room.deadPlayers || []).includes(clientId)) return;

    const activeVoters = getActiveDayVoters(room);
    if (!activeVoters.includes(clientId)) return;

    if (room.dayLocked?.[clientId]) {
      socket.emit("errorMessage", "Bạn đã khóa phiếu biểu quyết, không thể thay đổi.");
      return;
    }

    if (room.dayDeadline && Date.now() >= room.dayDeadline) return;

    room.dayVotes = room.dayVotes || {};

    if (!targetId) {
      room.dayVotes[clientId] = null;
      ctx.io.to(roomId).emit("dayVotesUpdated", room.dayVotes);
      return;
    }

    if (!room.players.find(p => p.id === targetId)) return;
    if ((room.deadPlayers || []).includes(targetId)) return;

    if (targetId === clientId) return;

    room.dayVotes[clientId] = targetId;
    ctx.io.to(roomId).emit("dayVotesUpdated", room.dayVotes);
  });

  socket.on("dayLockVote", ({ roomId }) => {
    const room = rooms[roomId];
    if (!room) return;
    if (room.gameOver) return;
    if (room.phase !== "day") return;
    if (room.trialStage && room.trialStage !== "none") return;
    if (!room.dayDeadline) return;
    if ((room.deadPlayers || []).includes(clientId)) return;

    const activeVoters = getActiveDayVoters(room);
    if (!activeVoters.includes(clientId)) return;

    room.dayLocked = room.dayLocked || {};
    room.dayLocked[clientId] = true;
    ctx.io.to(roomId).emit("dayLockedUpdated", room.dayLocked);

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
    if (!canUseTrialFlowControls(room)) return;
    if (room.trialStage && room.trialStage !== "none") return;
    if (room.dayDeadline) return;

    startDayVoting(roomId);
  });

  socket.on("villageChiefStartExtraVote", ({ roomId }) => {
    const room = rooms[roomId];
    if (!room) return;
    if (room.gameOver) return;
    if (room.phase !== "day") return;
    if (room.playerRoles?.[clientId] !== VILLAGE_CHIEF_ROLE) return;
    if ((room.deadPlayers || []).includes(clientId)) return;

    startVillageChiefExtraVoting(roomId, clientId);
  });

  socket.on("hostTogglePlayerRoleText", ({ roomId }) => {
    const room = rooms[roomId];
    if (!room) return;
    if (clientId !== room.hostId) return;

    room.hidePlayerRoleText = !(room.hidePlayerRoleText === true);
    ctx.io.to(roomId).emit("roomUpdated", toPublicRoom(room));
  });

  socket.on("hostForceFinishDayVote", ({ roomId }) => {
    const room = rooms[roomId];
    if (!room) return;
    if (room.gameOver) return;
    if (room.phase !== "day") return;
    const canForceFinishDayVote =
      clientId === room.hostId ||
      (room.trialStage === "defense" && canUseTrialFlowControls(room));
    if (!canForceFinishDayVote) return;

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
    if (clientId !== room.hostId) return;

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

    if (room.nightTurnRole === SPIRIT_WOLF_ROLE) {
      clearNightTurnTimer(room);
      finishSpiritWolfTurn(roomId, true);
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
    if (clientId !== room.hostId) return;

    const rules = ensureRoomGameRules(room);
    if (rules.allNightActionsSimultaneous) {
      const now = Date.now();

      if (!room.nightTurnPaused) {
        room.nightTurnPaused = true;
        room.nightTurnRemainingMs = room.nightTurnDeadline ? Math.max(0, room.nightTurnDeadline - now) : null;
        room.wolfTurnRemainingMs = room.wolfDeadline ? Math.max(0, room.wolfDeadline - now) : null;
        room.spiritWolfDecisionRemainingMs = room.spiritWolfDecisionDeadline
          ? Math.max(0, room.spiritWolfDecisionDeadline - now)
          : null;

        clearNightTurnTimer(room);
        clearSpiritWolfDecisionTimer(room);
        if (room.wolfTimer) {
          clearTimeout(room.wolfTimer);
          room.wolfTimer = null;
        }

        room.nightTurnDeadline = null;
        room.wolfDeadline = null;
        room.spiritWolfDecisionDeadline = null;

        ctx.io.to(roomId).emit("roomUpdated", toPublicRoom(room));
        emitHostNightActionProgress(roomId);
        return;
      }

      room.nightTurnPaused = false;
      room.nightTurnDeadline =
        room.nightTurnRemainingMs == null
          ? null
          : now + Math.max(0, room.nightTurnRemainingMs);

      const shouldResumeWolf =
        room.wolfTurnRemainingMs != null &&
        !room.wolfVoteResolvedTonight &&
        !room.merchantWolfBiteDisabledTonight;
      if (shouldResumeWolf) {
        const wolfRemainingMs = Math.max(0, room.wolfTurnRemainingMs ?? 0);
        room.wolfDeadline = now + wolfRemainingMs;
        startWolfPhase(roomId, {
          durationMs: wolfRemainingMs,
          initializeVotes: false,
        });
        rescheduleWolfTimerForCurrentDeadlines(roomId, room);
      } else {
        room.wolfDeadline = null;
      }

      const shouldResumeSpiritWolf =
        room.spiritWolfDecisionRemainingMs != null &&
        !!room.spiritWolfPendingPoisonedWolfId &&
        !room.spiritWolfDecisionMade;
      if (shouldResumeSpiritWolf) {
        const spiritRemainingMs = Math.max(0, room.spiritWolfDecisionRemainingMs ?? 0);
        if (spiritRemainingMs <= 0) {
          finishSpiritWolfTurn(roomId, true);
          return;
        }
        room.spiritWolfDecisionDeadline = now + spiritRemainingMs;
        emitSpiritWolfDecisionNeeded(roomId);
        clearSpiritWolfDecisionTimer(room);
        room.spiritWolfDecisionTimer = setTimeout(() => {
          finishSpiritWolfTurn(roomId, true);
        }, spiritRemainingMs);
      } else {
        room.spiritWolfDecisionDeadline = null;
      }

      if (room.nightTurnDeadline) {
        const baseDeadline = room.nightTurnDeadline;
        setTimeout(() => {
          const latest = rooms[roomId];
          if (!latest) return;
          if (latest.phase !== "night") return;
          if (latest.nightTurnPaused) return;
          if (latest.nightTurnDeadline !== baseDeadline) return;
          emitHostNightActionProgress(roomId);
        }, Math.max(0, baseDeadline - Date.now()));
      }

      ctx.io.to(roomId).emit("roomUpdated", toPublicRoom(room));
      emitHostNightActionProgress(roomId);
      return;
    }

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
      } else if (room.nightTurnRole === SPIRIT_WOLF_ROLE) {
        clearSpiritWolfDecisionTimer(room);
        clearNightTurnTimer(room);
        room.spiritWolfDecisionDeadline = null;
      } else {
        clearNightTurnTimer(room);
      }

      ctx.io.to(roomId).emit("roomUpdated", toPublicRoom(room));
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
    } else if (room.nightTurnRole === SPIRIT_WOLF_ROLE) {
      if (remainingMs <= 0) {
        finishSpiritWolfTurn(roomId, true);
        return;
      }
      clearNightTurnTimer(room);
      room.spiritWolfDecisionDeadline = room.nightTurnDeadline;
      room.nightTurnTimer = setTimeout(() => {
        finishSpiritWolfTurn(roomId, true);
      }, remainingMs);
    } else if (remainingMs <= 0) {
      startNightTurnByIndex(roomId, (room.nightTurnIndex ?? 0) + 1);
      return;
    } else {
      clearNightTurnTimer(room);
      room.nightTurnTimer = setTimeout(() => {
        startNightTurnByIndex(roomId, (room.nightTurnIndex ?? 0) + 1);
      }, remainingMs);
    }

    ctx.io.to(roomId).emit("roomUpdated", toPublicRoom(room));
  });

  socket.on("hostAddNightActionTime", ({ roomId, targetId }: { roomId: string; targetId: string }) => {
    const room = rooms[roomId];
    if (!room) return;
    if (room.gameOver) return;
    if (room.phase !== "night") return;
    if (clientId !== room.hostId) return;
    if (!targetId || targetId === room.hostId) return;
    if (!room.players.find((player) => player.id === targetId)) return;
    if ((room.deadPlayers || []).includes(targetId)) return;

    const rules = ensureRoomGameRules(room);
    const extraMs = 10_000;
    const appendExtraTimeLog = (targetRole: string) => {
      appendLogEntry(room, {
        type: "night_action_extra_time",
        phase: "night",
        targetId,
        roleName: targetRole,
        extraSeconds: Math.round(extraMs / 1000),
      });
    };

    if (rules.allNightActionsSimultaneous) {
      const targetRole = room.playerRoles?.[targetId] || null;
      if (!targetRole) return;

      const hasActiveDeadline = !!getSimultaneousDeadlineForPlayer(room, targetId);
      const canExtendWhilePaused =
        room.nightTurnPaused &&
        (
          (isWolfAlignedPlayer(room, targetId) && room.wolfTurnRemainingMs != null) ||
          (targetRole === SPIRIT_WOLF_ROLE && room.spiritWolfDecisionRemainingMs != null) ||
          (!isWolfAlignedPlayer(room, targetId) && targetRole !== SPIRIT_WOLF_ROLE && room.nightTurnRemainingMs != null)
        );
      if (!hasActiveDeadline && !canExtendWhilePaused) return;

      let baseDeadline = 0;
      if (isWolfAlignedPlayer(room, targetId)) {
        baseDeadline = room.wolfDeadline ?? Date.now();
      } else if (targetRole === SPIRIT_WOLF_ROLE) {
        baseDeadline = room.spiritWolfDecisionDeadline ?? Date.now();
      } else {
        baseDeadline = room.nightTurnDeadline ?? Date.now();
        if (targetRole === "Phù thủy" && shouldGrantWitchBonusToPlayer(room, targetId)) {
          baseDeadline += 10_000;
        }
      }

      const currentExtraMs = getNightActionExtraMs(room, targetId);
      const currentTotalDeadline = baseDeadline + currentExtraMs;

      const newTotalDeadline = Math.max(currentTotalDeadline, Date.now()) + extraMs;
      const newExtraMs = newTotalDeadline - baseDeadline;

      room.nightActionExtraTimeMsByPlayerId = room.nightActionExtraTimeMsByPlayerId || {};
      room.nightActionExtraTimeMsByPlayerId[targetId] = newExtraMs;

      if (!room.nightTurnPaused) {
        if (isWolfAlignedPlayer(room, targetId) && room.wolfDeadline && !room.wolfVoteResolvedTonight) {
          rescheduleWolfTimerForCurrentDeadlines(roomId, room);
        } else if (
          targetRole === SPIRIT_WOLF_ROLE &&
          room.spiritWolfDecisionDeadline &&
          room.spiritWolfPendingPoisonedWolfId &&
          !room.spiritWolfDecisionMade
        ) {
          const remainingMs = Math.max(0, room.spiritWolfDecisionDeadline + getNightActionExtraMs(room, targetId) - Date.now());
          clearSpiritWolfDecisionTimer(room);
          room.spiritWolfDecisionTimer = setTimeout(() => {
            finishSpiritWolfTurn(roomId, true);
          }, remainingMs);
        }
      }

      appendExtraTimeLog(targetRole);
      ctx.io.to(roomId).emit("roomUpdated", toPublicRoom(room));
      emitHostNightActionProgress(roomId);
      return;
    }

    if (!room.nightTurnRole) return;
    const targetRole = room.playerRoles?.[targetId] || null;
    if (!targetRole) return;

    const order = getEffectiveNightActionOrder(room);
    const targetRoleInOrder =
      isWolfAlignedPlayer(room, targetId)
        ? "Sói"
        : targetRole === SPIRIT_WOLF_ROLE
          ? SPIRIT_WOLF_ROLE
          : targetRole;
    const targetRoleIndex = order.indexOf(targetRoleInOrder as NightActionRole);

    if (targetRoleIndex >= 0) {
      // Revert/set the night turn to this role's turn so they can act.
      room.nightTurnIndex = targetRoleIndex;
      room.nightTurnRole = targetRoleInOrder as NightActionRole;

      if (room.nightTurnPaused) {
        room.nightTurnRemainingMs = Math.max(0, (room.nightTurnRemainingMs ?? 0) + extraMs);
      } else {
        clearNightTurnTimer(room);
        clearSpiritWolfDecisionTimer(room);
        
        // Give them the full extra 10 seconds to act.
        const durationMs = extraMs;
        startNightTurnByIndex(roomId, targetRoleIndex, { durationMs, initializeWolfVotes: false });
      }

      appendExtraTimeLog(targetRole);
      ctx.io.to(roomId).emit("roomUpdated", toPublicRoom(room));
      return;
    }
  });

  socket.on("hostEliminatePlayerForRules", ({ roomId, targetId }: { roomId: string; targetId: string }) => {
    const room = rooms[roomId];
    if (!room) return;
    if (room.gameOver) return;
    if (clientId !== room.hostId) return;
    if (!room.phase) return;
    if (!targetId || targetId === room.hostId) return;
    if (!room.players.find((player) => player.id === targetId)) return;
    if ((room.deadPlayers || []).includes(targetId)) return;

    room.deadPlayers = room.deadPlayers || [];
    room.deadPlayers.push(targetId);
    markWolfCubExtraBiteReadyIfDied(room, targetId);
    markWildWolfConversionReadyIfWolfDied(room, targetId);
    clearProtectorTargetIfDead(room, targetId);

    if (room.wolfVotes) {
      for (const [wolfId, votedTargetId] of Object.entries(room.wolfVotes)) {
        if (wolfId === targetId || votedTargetId === targetId) room.wolfVotes[wolfId] = null;
      }
      ctx.io.to(`wolves_${roomId}`).emit("wolfVotesUpdated", room.wolfVotes);
    }
    if (room.wolfVotes2) {
      for (const [wolfId, votedTargetId] of Object.entries(room.wolfVotes2)) {
        if (wolfId === targetId || votedTargetId === targetId) room.wolfVotes2[wolfId] = null;
      }
      ctx.io.to(`wolves_${roomId}`).emit("wolfVotes2Updated", room.wolfVotes2);
    }
    if (room.wolfLocked?.[targetId] !== undefined) {
      room.wolfLocked[targetId] = false;
      ctx.io.to(`wolves_${roomId}`).emit("wolfLockedUpdated", room.wolfLocked);
    }

    if (room.dayVotes) {
      for (const [voterId, votedTargetId] of Object.entries(room.dayVotes)) {
        if (voterId === targetId || votedTargetId === targetId) room.dayVotes[voterId] = null;
      }
      ctx.io.to(roomId).emit("dayVotesUpdated", room.dayVotes);
    }
    if (room.dayLocked?.[targetId] !== undefined) {
      room.dayLocked[targetId] = false;
      ctx.io.to(roomId).emit("dayLockedUpdated", room.dayLocked);
    }
    room.dayVoters = (room.dayVoters || []).filter((id) => id !== targetId);
    if (room.trialVotes?.[targetId] !== undefined) {
      delete room.trialVotes[targetId];
      ctx.io.to(roomId).emit("trialVotesUpdated", room.trialVotes);
    }
    room.trialInteractionActiveIds = (room.trialInteractionActiveIds || []).filter((id) => id !== targetId);
    room.trialSelectedInteractorIds = (room.trialSelectedInteractorIds || []).filter((id) => id !== targetId);
    room.trialInteractionQueuedIds = (room.trialInteractionQueuedIds || []).filter((id) => id !== targetId);
    if (room.trialSelectedInteractorId === targetId) room.trialSelectedInteractorId = null;
    if (room.trialTargetId === targetId) {
      clearTrialState(room);
    } else if (room.trialStage === "defense") {
      ctx.io.to(roomId).emit("trialInteractionUpdated", buildTrialInteractionUpdatedPayload(room));
    }

    const logPhase = room.phase === "day" ? "day" : "night";
    appendLogEntry(room, {
      type: "mysterious_force_eliminated",
      phase: logPhase,
      targetId,
    });

    if (markAngelReviveAvailable(room, targetId)) {
      emitAngelPrivateState(ctx, roomId, room, targetId);
    }

    ctx.io.to(roomId).emit("playerKilled", targetId);
    emitHostNightActionProgress(roomId);
    ctx.io.to(roomId).emit("roomUpdated", toPublicRoom(room));
    checkAndEndGame(roomId, "host_eliminated_for_rules");
  });

  socket.on("angelChooseRevive", ({ roomId, targetId, guess }: { roomId: string; targetId: string; guess: unknown }) => {
    const room = rooms[roomId];
    if (!room) return;
    if (room.gameOver) return;
    if (room.phase !== "day") return;
    if (room.playerRoles?.[clientId] !== ANGEL_ROLE) return;
    if (!(room.deadPlayers || []).includes(clientId)) return;
    if (!isAngelGuess(guess)) return;
    if (!targetId || targetId === clientId || targetId === room.hostId) return;
    if (!room.players.find((player) => player.id === targetId)) return;
    if (!(room.deadPlayers || []).includes(targetId)) return;
    if ((room.angelReviveUsedPlayerIds || []).includes(clientId)) return;
    if (room.angelReviveRecordsByAngelId?.[clientId]) return;
    if (room.angelReviveAvailableByPlayerId?.[clientId] !== (room.nightCount || 0)) return;
    const targetAlreadyChosen = Object.values(room.angelReviveRecordsByAngelId || {}).some((record) => record.targetId === targetId);
    if (targetAlreadyChosen) return;

    recordAngelReviveChoice(room, clientId, targetId, guess);
    emitAngelPrivateState(ctx, roomId, room, clientId);
    emitAngelPrivateState(ctx, roomId, room, targetId);
    ctx.io.to(roomId).emit("roomUpdated", toPublicRoom(room));
  });

  socket.on("hostEndGameNow", ({ roomId }) => {
    const room = rooms[roomId];
    if (!room) return;
    if (room.gameOver) return;
    if (clientId !== room.hostId) return;

    clearGameTimers(room);

    room.gameOver = true;
    room.winner = "nobody";

    // Add log entry
    ensureNightLog(room);
    const phase = (room.phase || "night") as "night" | "day";
    appendLogEntry(room, {
      type: "host_ended_game",
      phase,
    });

    // Emit events
    ctx.io.to(roomId).emit("gameEnded", {
      winner: room.winner,
      reason: "host_ended_game",
    });
    ctx.io.to(roomId).emit("gameLogUpdated", { roomId, nights: room.gameLog || [] });
    ctx.io.to(roomId).emit(
      "rolesRevealUpdated",
      { roomId, rolesByPlayerId: room.playerRoles || {} }
    );
    ctx.io.to(roomId).emit("roomUpdated", toPublicRoom(room));
  });

  socket.on("trialToggleInteraction", ({ roomId, active }) => {
    const room = rooms[roomId];
    if (!room) return;
    if (room.gameOver) return;
    if (room.phase !== "day") return;
    if (room.trialStage !== "defense") return;
    if (!room.trialTargetId) return;
    if ((room.deadPlayers || []).includes(clientId)) return;
    if (clientId === room.trialTargetId) return;
    if (room.trialInteractionCut) return;
    if ((room.trialSelectedInteractorIds || []).includes(clientId)) return;

    const activeSet = new Set(room.trialInteractionActiveIds || []);
    const queuedSet = new Set(room.trialInteractionQueuedIds || []);
    if (active) activeSet.add(clientId);
    else activeSet.delete(clientId);
    if (active) queuedSet.add(clientId);
    else queuedSet.delete(clientId);

    room.trialInteractionActiveIds = Array.from(activeSet);
    room.trialInteractionQueuedIds = Array.from(queuedSet);
    if (!active && room.trialSelectedInteractorId === clientId) {
      room.trialSelectedInteractorId = null;
    }

    ctx.io.to(roomId).emit("trialInteractionUpdated", buildTrialInteractionUpdatedPayload(room));
    ctx.io.to(roomId).emit("roomUpdated", toPublicRoom(room));
  });

  socket.on("trialSelectInteractor", ({ roomId, targetId }) => {
    const room = rooms[roomId];
    if (!room) return;
    if (room.gameOver) return;
    if (room.phase !== "day") return;
    if (room.trialStage !== "defense") return;
    if (!room.trialTargetId) return;
    if (clientId !== room.trialTargetId) return;

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

    ctx.io.to(roomId).emit("trialInteractionUpdated", buildTrialInteractionUpdatedPayload(room));
    ctx.io.to(roomId).emit("roomUpdated", toPublicRoom(room));
  });

  socket.on("trialAddInteractionTurn", ({ roomId }) => {
    const room = rooms[roomId];
    if (!room) return;
    if (room.gameOver) return;
    if (room.phase !== "day") return;
    if (room.trialStage !== "defense") return;
    if (!room.trialTargetId) return;
    if (!canUseTrialFlowControls(room)) return;

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

    ctx.io.to(roomId).emit("trialInteractionUpdated", buildTrialInteractionUpdatedPayload(room));
    ctx.io.to(roomId).emit("roomUpdated", toPublicRoom(room));
  });

  socket.on("trialCutInteraction", ({ roomId }) => {
    const room = rooms[roomId];
    if (!room) return;
    if (room.gameOver) return;
    if (room.phase !== "day") return;
    if (room.trialStage !== "defense") return;
    if (!room.trialTargetId) return;
    if (clientId !== room.trialTargetId) return;

    room.trialInteractionCut = true;
    ctx.io.to(roomId).emit("trialInteractionUpdated", buildTrialInteractionUpdatedPayload(room));

    startTrialVerdictVoting(roomId);
  });

  socket.on("trialVoteLifeDeath", ({ roomId, vote }) => {
    const room = rooms[roomId];
    if (!room) return;
    if (room.gameOver) return;
    if (room.phase !== "day") return;
    if (room.trialStage !== "verdict") return;
    if (!room.trialTargetId) return;
    if (clientId === room.trialTargetId) return;
    if ((room.deadPlayers || []).includes(clientId)) return;

    const voters = getTrialVoters(room);
    if (!voters.includes(clientId)) return;

    if (room.trialVerdictDeadline && Date.now() >= room.trialVerdictDeadline) return;

    room.trialVotes = room.trialVotes || {};
    if (vote !== "live" && vote !== "die") {
      room.trialVotes[clientId] = null;
    } else {
      room.trialVotes[clientId] = vote;
    }

    ctx.io.to(roomId).emit("trialVotesUpdated", room.trialVotes);
  });

  socket.on("hunterChooseTarget", ({ roomId, targetId }) => {
    const room = rooms[roomId];
    if (!room) return;

    if (room.phase !== "night") return;
    if (!canPerformNightRoleAction(room, clientId, "Thợ săn")) return;
    if (room.playerRoles?.[clientId] !== "Thợ săn") return;
    if (!canPlayerActAtNight(room, clientId)) return;

    room.hunterTargetTonight = room.hunterTargetTonight || {};

    const prev = room.hunterTargetTonight[clientId] ?? null;

    if (!targetId) {
      room.hunterTargetTonight[clientId] = null;
      emitHunterTarget(roomId, clientId);
      emitHostNightActionProgress(roomId);
      return;
    }

    if (!room.players.find(p => p.id === targetId)) return;
    if ((room.deadPlayers || []).includes(targetId)) return;

    if (isLovePairMemberAwayAt(room, targetId, Date.now())) {
      room.hunterTargetTonight[clientId] = null;
      emitHunterTarget(roomId, clientId);
      emitHostNightActionProgress(roomId);
      return;
    }

    room.hunterTargetTonight[clientId] = targetId;
    emitHunterTarget(roomId, clientId);
    emitHostNightActionProgress(roomId);

    if (prev !== targetId) {
      appendLogEntry(room, { type: "hunter_mark", phase: "night", actorId: clientId, targetId });
    }
  });

  socket.on("elementalChooseTarget", ({ roomId, targetId }) => {
    const room = rooms[roomId];
    if (!room) return;
    if (room.phase !== "night") return;
    const myRole = room.playerRoles?.[clientId] || null;
    if (!isElementalRoleTurn(myRole)) return;
    if (!canPerformNightRoleAction(room, clientId, myRole as any)) return;
    if (!canPlayerActAtNight(room, clientId)) return;
    if (shouldElementalsVoteBuffTonight(room)) return;

    room.elementalTargetTonight = room.elementalTargetTonight || {};

    if (!targetId) {
      room.elementalTargetTonight[clientId] = null;
      emitElementalTarget(roomId, clientId);
      emitHostNightActionProgress(roomId);
      return;
    }

    if (targetId === clientId) {
      socket.emit("errorMessage", "Bạn không thể chọn chính mình.");
      return;
    }
    if (!room.players.find((p) => p.id === targetId)) return;
    if ((room.deadPlayers || []).includes(targetId)) return;

    if (isLovePairMemberAwayAt(room, targetId, Date.now())) {
      room.elementalTargetTonight[clientId] = null;
      emitElementalTarget(roomId, clientId);
      emitHostNightActionProgress(roomId);
      return;
    }

    room.elementalTargetTonight[clientId] = targetId;
    const targetRole = room.playerRoles?.[targetId] || null;
    const isCorrect = isElementalRoleTurn(targetRole);
    if (isCorrect) {
      room.elementalCorrectGuessPlayerIdsTonight = Array.from(new Set([...(room.elementalCorrectGuessPlayerIdsTonight || []), clientId]));
    } else {
      room.elementalCorrectGuessPlayerIdsTonight = (room.elementalCorrectGuessPlayerIdsTonight || []).filter((id) => id !== clientId);
    }
    appendLogEntry(room, {
      type: "elemental_guess",
      phase: "night",
      actorId: clientId,
      targetId,
      isCorrect,
    });
    emitElementalTarget(roomId, clientId);
    emitHostNightActionProgress(roomId);
  });

  socket.on("elementalChooseBuff", ({ roomId, buffId }) => {
    const room = rooms[roomId];
    if (!room) return;
    if (room.phase !== "night") return;
    const myRole = room.playerRoles?.[clientId] || null;
    if (!isElementalRoleTurn(myRole)) return;
    if (!canPerformNightRoleAction(room, clientId, myRole as any)) return;
    if (!canPlayerActAtNight(room, clientId)) return;
    if (!shouldElementalsVoteBuffTonight(room)) return;
    const availableTier = getBuffTier(room.elementalCorrectGuessCountForBuff || 0);
    const selectedBuff = ELEMENTAL_BUFFS.find((buff) => buff.id === buffId);
    if (!selectedBuff || selectedBuff.tier !== availableTier) return;

    room.elementalBuffVotesTonight = room.elementalBuffVotesTonight || {};
    room.elementalBuffVotesTonight[clientId] = buffId;
    emitElementalBuffVoteState(roomId, clientId);
    emitHostNightActionProgress(roomId);
  });

  socket.on("transferHost", ({ roomId, targetId }) => {
    const room = rooms[roomId];
    if (!room) return;
    if (clientId !== room.hostId) return;
    if (!room.players.find(p => p.id === targetId)) return;
    room.hostId = targetId;
    delete room.pendingRoleAssignments;
    delete room.pendingRoleBlocks;
    const nextHeightPxAfterHostChange = desiredLayoutHeightPx(getParticipantCount(room));
    rescaleRoomPositionsForHeight(room, nextHeightPxAfterHostChange);
    const hostChangedOpts = layoutOptsForRoom(room);
    room.positions = ensureNonOverlappingPositions(getParticipantIds(room), room.positions, hostChangedOpts);
    ctx.io.to(roomId).emit("positionsUpdated", room.positions || []);
    ctx.io.to(roomId).emit("hostChanged", room.hostId);
    ctx.io.to(roomId).emit("roomUpdated", toPublicRoom(room));
    emitPendingRoleAssignmentsToHost(roomId);
    emitPendingRoleBlocksToHost(roomId);
  });

  socket.on("leaveRoom", ({ roomId }: { roomId: string }) => {
    const room = rooms[roomId];
    if (!room) return;
    if (!room.players.find((p) => p.id === clientId)) return;

    const isHost = room.hostId === clientId;
    if (isHost) {
      clearGameTimers(room);
      ctx.io.to(roomId).emit("roomClosed", { roomId, reason: "host_left" });
      ctx.io.in(roomId).socketsLeave(roomId);
      delete rooms[roomId];
      activeRooms?.delete(roomId);
      return;
    }

    removePlayerFromRoom(roomId, clientId, { forceReturnAll: false });
    socket.leave(roomId);
  });

  socket.on("kickPlayer", ({ roomId, targetId, source }: { roomId: string; targetId: string; source?: "room" | "game" }) => {
    const room = rooms[roomId];
    if (!room) return;
    if (clientId !== room.hostId) return;
    if (!room.players.find(p => p.id === targetId)) return;
    removePlayerFromRoom(roomId, targetId, { ...(source ? { source } : {}), notifyTarget: true });
  });

  socket.on("seerCheck", ({ roomId, targetId }) => {
    const room = rooms[roomId];
    if (!room || !room.playerRoles) return;

    if (room.gameOver) return;

    if (room.phase !== "night") return;
    if (!canPerformNightRoleAction(room, clientId, "Tiên tri")) return;

    if (room.playerRoles?.[clientId] !== "Tiên tri") return;

    if (!canPlayerActAtNight(room, clientId)) return;

    if (!room.players.find(p => p.id === targetId)) return;
    if ((room.deadPlayers || []).includes(targetId)) return;

    room.seerUsedTonight = room.seerUsedTonight || {};
    const usedCount = room.seerUsedTonight[clientId] || 0;
    const maxChecks = (room.elementalSelectedBuffId === "seer-check-two" && room.elementalSelectedBuffAppliesNight === room.nightCount) ? 2 : 1;
    if (usedCount >= maxChecks) {
      socket.emit("errorMessage", "Bạn đã dùng chức năng tiên tri trong đêm này rồi!");
      return;
    }
    room.seerUsedTonight[clientId] = usedCount + 1;

    const actionAt = Date.now();
    const roleOfTarget = room.playerRoles[targetId];
    const seerBlockedByCloak = hasActiveMerchantItem(room, targetId, "invisibility-cloak");
    const actualIsWolf =
      isLovePairMemberAwayAt(room, targetId, actionAt)
        ? false
        : roleOfTarget === "Kẻ bị nguyền"
          ? true
          : isWolfAlignedPlayer(room, targetId)
            ? true
            : isWolfRole(roleOfTarget);

    const isWolf = seerBlockedByCloak ? false : actualIsWolf;
    ctx.io.to(clientId).emit("seerResult", { playerId: targetId, isWolf });

    appendLogEntry(room, {
      type: "seer_check",
      phase: "night",
      actorId: clientId,
      targetId,
      isWolf,
      actualIsWolf,
      ...(seerBlockedByCloak ? { blockedByMerchantItem: "invisibility-cloak" as const } : {}),
    });
    emitHostNightActionProgress(roomId);
  });

  socket.on("cursedSniff", ({ roomId, targetId }) => {
    const room = rooms[roomId];
    if (!room || !room.playerRoles) return;
    if (room.gameOver) return;
    if (room.phase !== "night") return;
    if (!canPerformNightRoleAction(room, clientId, CURSED_ROLE)) return;
    if (room.playerRoles?.[clientId] !== CURSED_ROLE) return;
    if (!canPlayerActAtNight(room, clientId)) return;

    if (targetId === room.hostId) return;
    if (!room.players.find((player) => player.id === targetId)) return;
    if ((room.deadPlayers || []).includes(targetId)) return;

    room.cursedTargetTonight = room.cursedTargetTonight || {};
    if (room.cursedTargetTonight[clientId]) {
      socket.emit("errorMessage", "Bạn đã chọn trong đêm này rồi.");
      return;
    }

    const lastTargetId = room.cursedLastTargetByPlayerId?.[clientId] || null;
    if (lastTargetId && lastTargetId === targetId) {
      socket.emit("errorMessage", "Không thể chọn cùng một người hai đêm liên tiếp.");
      return;
    }

    const actionAt = Date.now();
    const areaIds = getCursedSniffAreaIds(room, targetId);
    const blockedByMintPlayerIds: string[] = [];
    const hasWolf = areaIds.some((playerId) => {
      if ((room.deadPlayers || []).includes(playerId)) return false;
      if (isLovePairMemberAwayAt(room, playerId, actionAt)) return false;
      const targetRole = room.playerRoles?.[playerId];
      const isWolfTarget = isWolfAlignedPlayer(room, playerId) || isWolfRole(targetRole);
      if (!isWolfTarget) return false;
      if (hasActiveMerchantItem(room, playerId, "mint")) {
        blockedByMintPlayerIds.push(playerId);
        return false;
      }
      return true;
    });

    room.cursedTargetTonight[clientId] = targetId;
    room.cursedLastTargetByPlayerId = room.cursedLastTargetByPlayerId || {};
    room.cursedLastTargetByPlayerId[clientId] = targetId;

    ctx.io.to(clientId).emit("cursedResult", { targetId, areaIds, hasWolf });
    appendLogEntry(room, {
      type: "cursed_sniff",
      phase: "night",
      actorId: clientId,
      targetId,
      areaIds,
      hasWolf,
      blockedByMintPlayerIds,
    });
    emitCursedState(roomId, clientId);
    emitHostNightActionProgress(roomId);
  });

  socket.on("merchantOfferTrade", ({ roomId, targetId, itemId, choice }) => {
    const room = rooms[roomId];
    if (!room || !room.playerRoles) return;
    if (room.gameOver) return;
    if (room.phase !== "night") return;
    if (!canPerformNightRoleAction(room, clientId, MERCHANT_ROLE)) return;
    if (room.playerRoles?.[clientId] !== MERCHANT_ROLE) return;
    if (!canPlayerActAtNight(room, clientId)) return;

    if (!isMerchantItemId(itemId) || !isMerchantDecision(choice)) return;
    if (!targetId || targetId === clientId) {
      socket.emit("errorMessage", "Bạn không thể tự giao dịch với chính mình");
      return;
    }
    if (targetId === room.hostId) return;
    if (!room.players.find((player) => player.id === targetId)) return;
    if ((room.deadPlayers || []).includes(targetId)) return;

    room.merchantTradeOffersTonight = room.merchantTradeOffersTonight || {};
    if (room.merchantTradeOffersTonight[clientId]) {
      socket.emit("errorMessage", "Bạn đã tạo giao dịch trong đêm này rồi.");
      return;
    }

    const lastTargetId = room.merchantLastTargetByPlayerId?.[clientId] || null;
    if (lastTargetId && lastTargetId === targetId) {
      socket.emit("errorMessage", "Không thể chọn cùng một người hai đêm liên tiếp.");
      return;
    }

    const availableItemIds = getMerchantAvailableItemIds(room);
    if (!availableItemIds.includes(itemId)) {
      socket.emit("errorMessage", "Món đồ này không còn trong kho hàng.");
      return;
    }

    const offer: MerchantTradeOffer = {
      actorId: clientId,
      targetId,
      itemId,
      merchantChoice: choice,
      targetChoice: null,
      resolved: false,
      result: null,
      night: room.nightCount || 0,
      appliesNight: getMerchantEffectAppliesNight(room),
      createdAt: Date.now(),
    };

    room.merchantTradeOffersTonight[clientId] = offer;
    room.merchantLastTargetByPlayerId = room.merchantLastTargetByPlayerId || {};
    room.merchantLastTargetByPlayerId[clientId] = targetId;

    appendLogEntry(room, {
      type: "merchant_trade_offer",
      phase: "night",
      actorId: clientId,
      targetId,
      itemId,
      merchantChoice: choice,
    });
    emitMerchantPrivateState(roomId, clientId);
    emitMerchantPrivateState(roomId, targetId);
    emitHostNightActionProgress(roomId);
  });

  socket.on("merchantRespondTrade", ({ roomId, choice }) => {
    const room = rooms[roomId];
    if (!room || !room.playerRoles) return;
    if (!isMerchantDecision(choice)) return;
    if (room.gameOver) return;
    if (room.phase !== "night") return;
    if (!canPlayerActAtNight(room, clientId)) return;

    const offers = Object.values(room.merchantTradeOffersTonight || {});
    const offer = offers.find((item) => item.targetId === clientId && item.resolved !== true) || null;
    if (!offer) return;
    if (!isMerchantTradeWindowOpen(room, offer)) return;

    resolveMerchantOffer(roomId, room, offer, choice);

    emitMerchantPrivateState(roomId, offer.actorId);
    emitMerchantPrivateState(roomId, offer.targetId);
    emitHostNightActionProgress(roomId);
    ctx.io.to(roomId).emit("roomUpdated", toPublicRoom(room));
  });

  socket.on("guardianProtect", ({ roomId, targetId }) => {
    const room = rooms[roomId];
    if (!room) return;

    if (room.gameOver) return;

    if (room.phase !== "night") return;
    if (!canPerformNightRoleAction(room, clientId, "Bảo vệ")) return;

    if (room.playerRoles?.[clientId] !== "Bảo vệ") return;

    if (!canPlayerActAtNight(room, clientId)) return;

    if (room.protectedTonight) {
      socket.emit("errorMessage", "Bạn đã xác nhận bảo vệ đêm nay rồi, không thể thay đổi lựa chọn.");
      return;
    }

    if (!room.players.find(p => p.id === targetId)) return;
    if ((room.deadPlayers || []).includes(targetId) && targetId !== clientId) return;

    if (room.lastProtected && room.lastProtected === targetId) {
      socket.emit("errorMessage", "Không thể bảo vệ cùng người hai đêm liên tiếp!");
      return;
    }

    room.protectedTonight = targetId;
    room.protectedTonightBy = clientId;
    room.protectedTonightAt = Date.now();
    if (hasActiveMerchantItem(room, targetId, "moth-cocoon")) {
      room.merchantGuardianCarryoverTargetId = targetId;
      room.merchantGuardianCarryoverBy = clientId;
      room.merchantGuardianCarryoverNight = (room.nightCount || 0) + 1;
    }
    ctx.io.to(clientId).emit("guardianProtected", targetId);

    appendLogEntry(room, { type: "guardian_protect", phase: "night", actorId: clientId, targetId });
    appendGameEvent(room, {
      type: "BODYGUARD_PROTECT",
      phase: "night",
      actorIds: [clientId],
      targetIds: [targetId],
    });
    appendPoppyGlassesViewLogs(room, targetId);

    emitWitchPendingDeath(roomId);
    emitMerchantPrivateStateForAll(roomId);
    emitHostNightActionProgress(roomId);
  });

  socket.on("protectorChooseTarget", ({ roomId, targetId }) => {
    const room = rooms[roomId];
    if (!room) return;
    if (room.gameOver) return;
    if (room.phase !== "night") return;
    if (!canPerformNightRoleAction(room, clientId, PROTECTOR_ROLE)) return;
    if (room.playerRoles?.[clientId] !== PROTECTOR_ROLE) return;
    if (!canPlayerActAtNight(room, clientId)) return;

    if (room.protectorTargetId) {
      socket.emit("errorMessage", "Hộ nhân đã chọn người được bất tử. Chỉ có thể chọn lại sau khi bất tử bị kích hoạt.");
      return;
    }

    if (!room.players.find(p => p.id === targetId)) return;
    if ((room.deadPlayers || []).includes(targetId)) return;

    room.protectorActorId = clientId;
    room.protectorTargetId = targetId;
    room.protectorTargetSetNight = room.nightCount || 0;
    const permanent = isProtectorImmortalityPermanent(room);

    appendLogEntry(room, {
      type: "protector_bless",
      phase: "night",
      actorId: clientId,
      targetId,
      permanent,
    });

    appendGameEvent(room, {
      type: "PROTECTOR_BLESS",
      phase: "night",
      actorIds: [clientId],
      targetIds: [targetId],
      metadata: { permanent },
    });

    emitProtectorTarget(roomId, clientId);
    emitWitchPendingDeath(roomId);
    emitHostNightActionProgress(roomId);
    ctx.io.to(roomId).emit("roomUpdated", toPublicRoom(room));
  });

  socket.on("witchHeal", ({ roomId, targetId }) => {
    const room = rooms[roomId];
    if (!room) return;

    if (room.gameOver) return;

    if (room.phase !== "night") return;
    if (!canPerformNightRoleAction(room, clientId, "Phù thủy")) return;
    if (room.playerRoles?.[clientId] !== "Phù thủy") return;
    if (!canPlayerActAtNight(room, clientId)) return;

    ensureWitchState(room, clientId);

    const potions = room.witchPotions![clientId]!;
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
    room.witchHealTargetTonight![clientId] = targetId;
    room.witchHealTargetAt = room.witchHealTargetAt || {};
    room.witchHealTargetAt[clientId] = Date.now();
    emitWitchPotions(roomId, clientId);

    appendLogEntry(room, { type: "witch_heal", phase: "night", actorId: clientId, targetId });
    appendGameEvent(room, {
      type: "WITCH_HEAL",
      phase: "night",
      actorIds: [clientId],
      targetIds: [targetId],
    });

    emitWitchPendingDeath(roomId);
    emitHostNightActionProgress(roomId);
  });

  socket.on("witchPoison", ({ roomId, targetId }) => {
    const room = rooms[roomId];
    if (!room) return;

    if (room.gameOver) return;

    if (room.phase !== "night") return;
    if (!canPerformNightRoleAction(room, clientId, "Phù thủy")) return;
    if (room.playerRoles?.[clientId] !== "Phù thủy") return;
    if (!canPlayerActAtNight(room, clientId)) return;

    ensureWitchState(room, clientId);

    const potions = room.witchPotions![clientId]!;
    if (potions.poisonUsed) {
      socket.emit("errorMessage", "Bạn đã dùng bình giết rồi!");
      return;
    }

    if (targetId === clientId) {
      socket.emit("errorMessage", "Bạn không thể dùng bình giết lên chính mình.");
      return;
    }

    if (!room.players.find(p => p.id === targetId)) return;
    if ((room.deadPlayers || []).includes(targetId)) return;

    potions.poisonUsed = true;
    room.witchPoisonTargetTonight![clientId] = targetId;
    room.witchPoisonTargetAt = room.witchPoisonTargetAt || {};
    room.witchPoisonTargetAt[clientId] = Date.now();
    emitWitchPotions(roomId, clientId);

    appendLogEntry(room, { type: "witch_poison", phase: "night", actorId: clientId, targetId });
    appendGameEvent(room, {
      type: "WITCH_POISON",
      phase: "night",
      actorIds: [clientId],
      targetIds: [targetId],
    });
    emitHostNightActionProgress(roomId);

    const targetRole = room.playerRoles?.[targetId];
    if (
      isWolfRole(targetRole) &&
      isSpiritWolfAlive(room) &&
      !room.spiritWolfDecisionMade &&
      !room.spiritWolfPendingPoisonedWolfId
    ) {
      room.spiritWolfPendingPoisonedWolfId = targetId;
      startSpiritWolfDecisionWindow(roomId);
    }
  });

  socket.on("spiritWolfDecide", ({ roomId, save }) => {
    const room = rooms[roomId];
    if (!room) return;
    if (room.gameOver) return;
    if (room.phase !== "night") return;
    if (!canPerformNightRoleAction(room, clientId, "Linh sói")) return;
    if (room.playerRoles?.[clientId] !== SPIRIT_WOLF_ROLE) return;
    if (!canPlayerActAtNight(room, clientId)) return;

    const pendingTargetId = room.spiritWolfPendingPoisonedWolfId;
    if (!pendingTargetId) return;
    if (room.spiritWolfDecisionMade) return;

    room.spiritWolfDecisionMade = true;
    room.spiritWolfChoseSave = !!save;
    if (!save) {
      room.spiritWolfWolfAlignedPending = true;
    }

    if (save) {
      room.witchPoisonTargetTonight = room.witchPoisonTargetTonight || {};
      for (const wid of getWitches(room)) {
        if (room.witchPoisonTargetTonight[wid] === pendingTargetId) {
          room.witchPoisonTargetTonight[wid] = null;
          if (room.witchPoisonTargetAt) {
            delete room.witchPoisonTargetAt[wid];
          }
        }
      }
    }

    ctx.io.to(clientId).emit("spiritWolfDecisionRecorded", { saved: !!save });

    appendLogEntry(room, { type: "spirit_wolf_decision", phase: "night", actorId: clientId, saved: !!save });

    finishSpiritWolfTurn(roomId, false);
  });

  socket.on("wildWolfToggleConversion", ({ roomId, active, targetId }) => {
    const room = rooms[roomId];
    if (!room) return;
    if (room.gameOver) return;
    if (room.phase !== "night") return;
    if (!isWildWolfConversionUsable(room, clientId)) return;
    if (!canPerformNightRoleAction(room, clientId, "Sói")) return;
    if (room.wolfVoteResolvedTonight) return;

    if (!active) {
      room.wildWolfConvertRequestedTonight = false;
      room.wildWolfConvertActorId = null;
      room.wildWolfConvertTargetId = null;
      emitWildWolfConversionState(roomId, room);
      finishWolfVotingIfAllLocked(roomId, room, false);
      return;
    }

    const candidates = getWildWolfConversionCandidateIds(room, clientId);
    const selectedTargetId =
      typeof targetId === "string" && candidates.includes(targetId)
        ? targetId
        : candidates[0] || null;
    if (!selectedTargetId) return;
    if (!room.players.find((player) => player.id === selectedTargetId)) return;
    if ((room.deadPlayers || []).includes(selectedTargetId)) return;
    if (isWolfAlignedPlayer(room, selectedTargetId)) return;

    room.wildWolfConvertRequestedTonight = true;
    room.wildWolfConvertActorId = clientId;
    room.wildWolfConvertTargetId = selectedTargetId;

    emitWildWolfConversionState(roomId, room);
    finishWolfVotingIfAllLocked(roomId, room);
  });

  socket.on("wolfChooseTarget", ({ roomId, targetId }) => {
    const room = rooms[roomId];
    if (!room) return;
    if (room.gameOver) return;
    if (!isWolfAlignedPlayer(room, clientId)) return;
    if (!canPlayerActAtNight(room, clientId)) return;
    if (room.phase !== "night") return;
    if (!canPerformNightRoleAction(room, clientId, "Sói")) return;

    if (room.wolfLocked?.[clientId]) {
      socket.emit("errorMessage", "Bạn đã bấm CẮN, không thể thay đổi lựa chọn.");
      return;
    }

    room.wolfVotes = room.wolfVotes || {};

    if (!targetId) {
      room.wolfVotes[clientId] = null;
      ctx.io.to(`wolves_${roomId}`).emit("wolfVotesUpdated", room.wolfVotes);
      clearWildWolfConversionIfTargetIsNoLongerSelected(roomId, room, clientId);
      return;
    }

    if (!room.players.find(p => p.id === targetId)) return;
    if ((room.deadPlayers || []).includes(targetId)) return;

    if (targetId === clientId) return;
    if (isWolfAlignedPlayer(room, targetId)) return;

    room.wolfVotes[clientId] = targetId;
    clearWildWolfConversionIfTargetIsNoLongerSelected(roomId, room, clientId);

    ctx.io.to(`wolves_${roomId}`).emit("wolfVotesUpdated", room.wolfVotes);
  });

  socket.on("wolfChooseTarget2", ({ roomId, targetId }) => {
    const room = rooms[roomId];
    if (!room) return;
    if (room.gameOver) return;
    if (!isWolfAlignedPlayer(room, clientId)) return;
    if (room.phase !== "night") return;
    if (!canPlayerActAtNight(room, clientId)) return;
    if (!canPerformNightRoleAction(room, clientId, "Sói")) return;

    if (!room.wolfBonusBiteThisNight) return;

    if (room.wolfLocked?.[clientId]) {
      socket.emit("errorMessage", "Bạn đã bấm CẮN, không thể thay đổi lựa chọn.");
      return;
    }

    room.wolfVotes2 = room.wolfVotes2 || {};

    if (!targetId) {
      room.wolfVotes2[clientId] = null;
      ctx.io.to(`wolves_${roomId}`).emit("wolfVotes2Updated", room.wolfVotes2);
      clearWildWolfConversionIfTargetIsNoLongerSelected(roomId, room, clientId);
      return;
    }

    if (!room.players.find(p => p.id === targetId)) return;
    if ((room.deadPlayers || []).includes(targetId)) return;

    if (targetId === clientId) return;
    if (isWolfAlignedPlayer(room, targetId)) return;

    if (room.wolfVotes?.[clientId] && room.wolfVotes[clientId] === targetId) return;

    room.wolfVotes2[clientId] = targetId;
    ctx.io.to(`wolves_${roomId}`).emit("wolfVotes2Updated", room.wolfVotes2);
    clearWildWolfConversionIfTargetIsNoLongerSelected(roomId, room, clientId);
  });

  socket.on("wolfLockVote", ({ roomId }) => {
    const room = rooms[roomId];
    if (!room) return;

    if (!isWolfAlignedPlayer(room, clientId)) return;
    if (room.phase !== "night") return;
    if (!canPerformNightRoleAction(room, clientId, "Sói")) return;

    room.wolfLocked = room.wolfLocked || {};
    room.wolfLocked![clientId] = true;

    ctx.io.to(`wolves_${roomId}`).emit("wolfLockedUpdated", room.wolfLocked);
    emitHostNightActionProgress(roomId);

    finishWolfVotingIfAllLocked(roomId, room);
  });

  // --- SCENARIO REPLAYER HANDLERS ---
  socket.on("listSavedMatches", (callback?: (res: { matches: string[] }) => void) => {
    const matches = listSavedMatches();
    if (callback) {
      callback({ matches });
    } else {
      socket.emit("savedMatchesList", { matches });
    }
  });

  socket.on("startScenarioReplay", ({ fileName }: { fileName: string }, callback?: (res: { ok: boolean; roomId?: string; error?: string }) => void) => {
    try {
      const match = loadSavedMatch(fileName);
      if (!match) {
        const err = "Không tìm thấy tệp lịch sử trận đấu.";
        if (callback) callback({ ok: false, error: err });
        else socket.emit("errorMessage", err);
        return;
      }

      const replayRoomId = generateRoomId(activeRooms!);
      const room: Room = {
        id: replayRoomId,
        players: match.players.map((p: any) => ({
          id: p.id,
          name: p.name,
          connected: true,
          inGame: true,
        })),
        hostId: clientId,
        hidePlayerRoleText: false,
        layoutHeightPx: BASE_FRAME_HEIGHT_PX,
        positions: ensureNonOverlappingPositions([], undefined, { ...POSITION_LAYOUT, heightPx: BASE_FRAME_HEIGHT_PX }),
        positionEditors: [],
        autoArrangeUsed: false,
        compactCircles: false,
        gameRules: buildRoomGameRules(undefined),
        gameEventLog: match.gameEventLog,
        isReplay: true,
        replayEvents: match.gameEventLog,
        replayIndex: 0,
        playerRoles: {},
        deadPlayers: [],
        phase: "lobby",
        gameLog: [],
        nightCount: 0,
      };

      for (const p of match.players) {
        room.playerRoles![p.id] = p.role;
      }

      rooms[replayRoomId] = room;
      socket.join(replayRoomId);
      
      socket.emit("roomCreated", toPublicRoom(room));
      
      if (callback) {
        callback({ ok: true, roomId: replayRoomId });
      }
    } catch (err: any) {
      console.error("Error starting scenario replay:", err);
      if (callback) callback({ ok: false, error: err.message || String(err) });
    }
  });

  socket.on("nextReplayStep", ({ roomId }: { roomId: string }, callback?: (res: { ok: boolean; finished: boolean }) => void) => {
    const room = rooms[roomId];
    if (!room) {
      if (callback) callback({ ok: false, finished: false });
      return;
    }

    if (!room.isReplay || !room.replayEvents) {
      if (callback) callback({ ok: false, finished: false });
      return;
    }

    const totalSteps = room.replayEvents.length;
    if (room.replayIndex! >= totalSteps) {
      if (callback) callback({ ok: true, finished: true });
      return;
    }

    const event = room.replayEvents[room.replayIndex!];
    if (!event) {
      if (callback) callback({ ok: false, finished: true });
      return;
    }
    room.replayIndex! += 1;

    // Transition phase and nightCount
    if (event.phase === "night" && room.phase !== "night") {
      room.nightCount = (room.nightCount || 0) + 1;
    }
    room.phase = event.phase;

    const getPlayerNameLocal = (pid: string) => {
      return room.players.find(p => p.id === pid)?.name || pid;
    };

    let logMessage = `[Bước ${room.replayIndex}/${totalSteps}] ${event.type}: `;

    // Visual state reconstruction based on event type
    switch (event.type) {
      case "WOLF_BITE": {
        const target = event.targetIds?.[0];
        const targetName = target ? getPlayerNameLocal(target) : "Không ai";
        logMessage += `Sói chọn cắn ${targetName}`;
        room.killedTonight = target || null;
        if (event.metadata?.votes) {
          room.wolfVotes = event.metadata.votes as Record<string, string | null>;
        }
        break;
      }
      case "BODYGUARD_PROTECT": {
        const target = event.targetIds?.[0];
        const targetName = target ? getPlayerNameLocal(target) : "Không ai";
        logMessage += `Bảo vệ chọn bảo vệ ${targetName}`;
        room.protectedTonight = target || null;
        break;
      }
      case "PROTECTOR_BLESS": {
        const target = event.targetIds?.[0];
        const targetName = target ? getPlayerNameLocal(target) : "Không ai";
        logMessage += `Nhà bảo hộ ban phước cho ${targetName}`;
        room.protectorTargetId = target || null;
        break;
      }
      case "PROTECTOR_SAVE": {
        logMessage += `Nhà bảo hộ cứu thành công`;
        break;
      }
      case "WITCH_HEAL": {
        const target = event.targetIds?.[0];
        const targetName = target ? getPlayerNameLocal(target) : "Không ai";
        logMessage += `Phù thủy dùng bình cứu cứu ${targetName}`;
        room.killedTonight = null;
        break;
      }
      case "WITCH_POISON": {
        const target = event.targetIds?.[0];
        const targetName = target ? getPlayerNameLocal(target) : "Không ai";
        logMessage += `Phù thủy dùng bình độc độc ${targetName}`;
        room.killedTonightExtra = target || null;
        break;
      }
      case "HUNTER_SHOT": {
        const hunter = event.actorIds?.[0] || "";
        const target = event.targetIds?.[0];
        const hunterName = getPlayerNameLocal(hunter);
        const targetName = target ? getPlayerNameLocal(target) : "Không ai";
        logMessage += `Thợ săn [${hunterName}] bắn hạ ${targetName}`;
        room.hunterTargetTonight = room.hunterTargetTonight || {};
        room.hunterTargetTonight[hunter] = target || null;
        break;
      }
      case "DAY_VOTE": {
        const target = event.targetIds?.[0];
        const targetName = target ? getPlayerNameLocal(target) : "Bỏ qua";
        logMessage += `Biểu quyết ngày chọn treo cổ ${targetName}`;
        if (event.metadata?.votes) {
          room.dayVotes = event.metadata.votes as Record<string, string | null>;
        }
        break;
      }
      case "TRIAL_VERDICT": {
        const target = event.targetIds?.[0];
        const targetName = target ? getPlayerNameLocal(target) : "Không ai";
        const executed = event.metadata?.executed ? "Bị treo cổ" : "Được tha bổng";
        logMessage += `Tòa án quyết định: ${targetName} ${executed}`;
        room.trialTargetId = target || null;
        room.trialStage = "verdict";
        break;
      }
      case "VILLAGE_CHIEF_EXTRA_VOTE": {
        const chief = event.actorIds?.[0] || "";
        const chiefName = getPlayerNameLocal(chief);
        logMessage += `Trưởng làng [${chiefName}] bỏ phiếu quyết định`;
        break;
      }
      case "LOVE_LINK_DEATH": {
        const partner = event.targetIds?.[0];
        const partnerName = partner ? getPlayerNameLocal(partner) : "";
        logMessage += `Cặp đôi chết chùm: ${partnerName} chết theo bạn đời`;
        if (partner && !room.deadPlayers?.includes(partner)) {
          room.deadPlayers = room.deadPlayers || [];
          room.deadPlayers.push(partner);
        }
        break;
      }
      case "PLAYER_ELIMINATED": {
        const target = event.targetIds?.[0];
        const targetName = target ? getPlayerNameLocal(target) : "";
        const cause = event.metadata?.cause || "không rõ";
        logMessage += `Người chơi ${targetName} đã bị loại do: ${cause}`;
        if (target && !room.deadPlayers?.includes(target)) {
          room.deadPlayers = room.deadPlayers || [];
          room.deadPlayers.push(target);
        }
        break;
      }
      case "ROLE_CONVERSION": {
        const target = event.targetIds?.[0];
        const toRole = event.metadata?.toRole || "Sói";
        const targetName = target ? getPlayerNameLocal(target) : "";
        logMessage += `${targetName} chuyển đổi vai trò thành ${toRole}`;
        if (target) {
          room.playerRoles = room.playerRoles || {};
          room.playerRoles[target] = toRole;
        }
        break;
      }
      case "GAME_OVER": {
        const winner = event.metadata?.winner || "Không ai";
        const reason = event.metadata?.reason || "";
        logMessage += `Trò chơi kết thúc! Phe thắng: ${winner}. Lý do: ${reason}`;
        room.gameOver = true;
        room.winner = winner as any;
        break;
      }
      default: {
        logMessage += `Sự kiện ${event.type}`;
        break;
      }
    }

    // Append to gameLog
    const phaseStr = event.phase === "night" ? "night" : "day";
    appendLogEntry(room, {
      type: "custom_log",
      phase: phaseStr,
      message: logMessage,
      timestamp: event.timestamp,
    });

    // Notify all players in room
    ctx.io.to(roomId).emit("roomUpdated", toPublicRoom(room));
    ctx.io.to(roomId).emit("gameLogUpdated", { roomId, nights: room.gameLog || [] });

    if (callback) {
      callback({ ok: true, finished: room.replayIndex! >= totalSteps });
    }
  });
}

// Tạo mã phòng ngẫu nhiên gồm 3 chữ số, đảm bảo không trùng với các phòng đang hoạt động.
function generateRoomId(activeRooms: Set<string>): string {
  let roomId: string;
  do {
    roomId = String(Math.floor(Math.random() * 1000)).padStart(3, "0");
  } while (activeRooms.has(roomId));
  activeRooms.add(roomId);
  return roomId;
}
