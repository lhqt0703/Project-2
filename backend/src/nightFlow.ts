import type { ServerContext } from "./serverContext.js";
import { appendLogEntry, buildWolfVoteBreakdown } from "./gameLog.js";
import { appendGameEvent } from "./gameEvent.js";
import {
  emitSpiritWolfDecisionNeeded,
  emitWitchPendingDeath,
  getHostNightActionProgressByPlayerId,
  getSelectedElementalRoles,
  getWolfTurnDurationMs,
  isElementalRoleTurn,
} from "./serverEmitters.js";
import { clampNonWolfNightActionDurationSec, clampWolfNightActionDurationSec, isVillageChiefDelayedBiteNight, LINH_MIEU_ROLE } from "./gameConfig.js";
import { ELEMENTAL_GROUP_ROLE } from "./elemental.js";
import {
  clearNightTurnTimer,
  canPlayerActAtNight,
  getActiveWolves,
  getParticipantIds,
  getSpiritWolfId,
  getWitches,
  isSpiritWolfAlive,
  isWolfAlignedPlayer,
  resetNightTurnState,
  getSeatingOrder,
} from "./roomState.js";
import { ensureRoomGameRules, type NightActionRole, type Room } from "./serverTypes.js";
import { toPublicRoom } from "./serverEmitters.js";
import { LOVE_ROLE, canLoveChoosePartnerTonight, isLovePairMemberAwayAt } from "./love.js";
import { CURSED_ROLE, MERCHANT_ROLE, canUseCursedSniff, getMerchantAvailableItemIds } from "./merchant.js";
import { PROTECTOR_ROLE, isVillageChief } from "./specialRoles.js";
import { COFFEE_MAKER_ROLE, DONG_TRUNG_ROLE, LINH_CHI_ROLE } from "./coffeeRoles.js";

type NightFlowDeps = {
  checkAndEndGame: (roomId: string, reason?: string) => void;
  emitElementalNightState: (roomId: string, playerId: string) => void;
  resolveElementalBuffVote: (roomId: string) => void;
};

export function createNightFlow(ctx: ServerContext, deps: NightFlowDeps) {
  const WITCH_BONUS_MS = 10_000;
  const SPIRIT_WOLF_DECISION_MS = 10_000;

  function getNonWolfTurnDurationMs(room: Room) {
    const rules = ensureRoomGameRules(room);
    const seconds = clampNonWolfNightActionDurationSec(rules.nonWolfNightActionDurationSec);
    return Math.max(0, Math.floor(seconds * 1000));
  }

  function doesWitchHaveUsablePotion(room: Room, witchId: string) {
    const potions = room.witchPotions?.[witchId];
    if (!potions) return true;
    return !(potions.healUsed && potions.poisonUsed);
  }

  function shouldGrantWitchBonus(room: Room, witchId?: string) {
    const rules = ensureRoomGameRules(room);
    const nonWolfSec = clampNonWolfNightActionDurationSec(rules.nonWolfNightActionDurationSec);
    const wolfSec = clampWolfNightActionDurationSec(rules.wolfNightActionDurationSec);
    if (!(nonWolfSec > 0 && wolfSec === nonWolfSec)) return false;
    if (!rules.witchBonusTimeRequiresUsablePotion) return true;
    if (witchId) return doesWitchHaveUsablePotion(room, witchId);
    return getWitches(room).some((id) => doesWitchHaveUsablePotion(room, id));
  }

  function getNightActionExtraMs(room: Room, playerId: string) {
    const extraMs = room.nightActionExtraTimeMsByPlayerId?.[playerId] || 0;
    return Math.max(0, Math.floor(extraMs));
  }

  function getWitchTurnDurationMs(room: Room) {
    const baseMs = getNonWolfTurnDurationMs(room);
    if (baseMs <= 0) return baseMs;
    return shouldGrantWitchBonus(room) ? baseMs + WITCH_BONUS_MS : baseMs;
  }

  function emitHostNightActionProgress(roomId: string) {
    const room = ctx.rooms[roomId];
    if (!room) return;
    ctx.io.to(room.hostId).emit("hostNightActionProgressUpdated", {
      progressByPlayerId: getHostNightActionProgressByPlayerId(room),
    });
  }

  function getSimultaneousRoleDeadline(room: Room, playerId: string, role: NightActionRole) {
    const rules = ensureRoomGameRules(room);
    if (!rules.allNightActionsSimultaneous) return null;
    if (role === "Sói") {
      if (!room.daNghichState!.wolfDeadline) return null;
      return room.daNghichState!.wolfDeadline + getNightActionExtraMs(room, playerId);
    }
    if (role === "Linh sói") {
      if (!room.daNghichState!.spiritWolfDecisionDeadline) return null;
      return room.daNghichState!.spiritWolfDecisionDeadline + getNightActionExtraMs(room, playerId);
    }

    const baseDeadline = room.nightTurnDeadline ?? null;
    if (!baseDeadline) return null;
    let deadline = baseDeadline;
    if (role === "Phù thủy" && shouldGrantWitchBonus(room, playerId)) {
      deadline += WITCH_BONUS_MS;
    }
    return deadline + getNightActionExtraMs(room, playerId);
  }

  function canPerformNightRoleAction(room: Room, playerId: string, expectedRole: NightActionRole) {
    if (room.phase !== "night") return false;
    if (!canPlayerActAtNight(room, playerId)) return false;

    if (expectedRole === "Sói" && room.wolfVoteResolvedTonight) return false;

    const rules = ensureRoomGameRules(room);
    if (rules.allNightActionsSimultaneous) {
      if (expectedRole === "Linh sói") {
        if (room.playerRoles?.[playerId] !== "Linh sói") return false;
        if (!room.spiritWolfPendingPoisonedWolfId || room.spiritWolfDecisionMade) return false;
      }
      const deadline = getSimultaneousRoleDeadline(room, playerId, expectedRole);
      if (expectedRole === "Linh sói" && !deadline) return false;
      if (deadline && Date.now() >= deadline) return false;
      return true;
    }
    return room.nightTurnRole === expectedRole;
  }

  function getSelectedNightActionRoles(room: Room): NightActionRole[] {
    const sourceRoles = room.playerRoles
      ? Object.values(room.playerRoles)
      : room.roles || [];

    const hasWolfRole = room.players.some((p) => isWolfAlignedPlayer(room, p.id));
    const selected = new Set<NightActionRole>();

    if (hasWolfRole && !room.merchantWolfBiteDisabledTonight) selected.add("Sói");
    if (sourceRoles.includes(LOVE_ROLE) && canLoveChoosePartnerTonight(room)) {
      selected.add(LOVE_ROLE as NightActionRole);
    }

    for (const role of [
      "Bảo vệ",
      PROTECTOR_ROLE,
      LINH_MIEU_ROLE,
      "Phù thủy",
      "Thợ săn",
      "Tiên tri",
      COFFEE_MAKER_ROLE,
      LINH_CHI_ROLE,
      DONG_TRUNG_ROLE,
      "Song Trùng",
    ] as NightActionRole[]) {
      if (sourceRoles.includes(role)) selected.add(role);
    }

    const hasChiefCanFind = ensureRoomGameRules(room).villageChiefCanFindProtector &&
      sourceRoles.includes("Trưởng làng") &&
      sourceRoles.includes("Hộ nhân");
    if (hasChiefCanFind) {
      selected.add("Trưởng làng");
    }

    const cursedPlayerIds = room.playerRoles
      ? Object.entries(room.playerRoles)
        .filter(([, role]) => role === CURSED_ROLE)
        .map(([playerId]) => playerId)
      : [];
    if (
      cursedPlayerIds.length > 0
        ? cursedPlayerIds.some((playerId) => canUseCursedSniff(room, playerId))
        : sourceRoles.includes(CURSED_ROLE)
    ) {
      selected.add(CURSED_ROLE as NightActionRole);
    }

    if (sourceRoles.includes(MERCHANT_ROLE) && getMerchantAvailableItemIds(room).length > 0) {
      selected.add(MERCHANT_ROLE as NightActionRole);
    }

    for (const role of getSelectedElementalRoles(room)) {
      selected.add(role as NightActionRole);
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

  function emitElementalNightStateForRole(roomId: string, role: NightActionRole) {
    const room = ctx.rooms[roomId];
    if (!room) return;
    if (!isElementalRoleTurn(role)) return;
    const dead = new Set(room.deadPlayers || []);
    for (const player of room.players) {
      if (dead.has(player.id) && !canPlayerActAtNight(room, player.id)) continue;
      if (room.playerRoles?.[player.id] !== role) continue;
      deps.emitElementalNightState(roomId, player.id);
    }
  }

  function emitElementalNightStateForAll(roomId: string) {
    const room = ctx.rooms[roomId];
    if (!room) return;
    const dead = new Set(room.deadPlayers || []);
    for (const player of room.players) {
      if (dead.has(player.id) && !canPlayerActAtNight(room, player.id)) continue;
      if (!isElementalRoleTurn(room.playerRoles?.[player.id] || null)) continue;
      deps.emitElementalNightState(roomId, player.id);
    }
  }

  function getBaseNightActionOrder(room: Room) {
    const rules = ensureRoomGameRules(room);
    const selectedRoles = new Set(getSelectedNightActionRoles(room));
    const expanded: NightActionRole[] = [];
    for (const role of rules.nightActionOrder) {
      if (role === ELEMENTAL_GROUP_ROLE) {
        for (const elementalRole of getSelectedElementalRoles(room)) {
          if (selectedRoles.has(elementalRole as NightActionRole)) {
            expanded.push(elementalRole as NightActionRole);
          }
        }
        continue;
      }
      if (selectedRoles.has(role as NightActionRole)) {
        expanded.push(role as NightActionRole);
      }
    }
    return expanded;
  }

  function getEffectiveNightActionOrder(room: Room) {
    if (!room.nightTurnOrderSnapshot) {
      room.nightTurnOrderSnapshot = getBaseNightActionOrder(room);
    }

    const order = room.nightTurnOrderSnapshot;

    if (shouldIncludeSpiritWolfTurn(room)) {
      ensureUpcomingSpiritWolfTurn(room, order);
    }

    return [...order];
  }

  function ensureUpcomingSpiritWolfTurn(room: Room, order: NightActionRole[]) {
    const spiritRole: NightActionRole = "Linh sói";
    const currentIndex = room.nightTurnIndex ?? -1;
    const existingIndex = order.indexOf(spiritRole);
    if (existingIndex >= 0 && existingIndex >= currentIndex) return;

    const insertAt =
      currentIndex >= 0
        ? currentIndex + 1
        : (() => {
          const witchIndex = order.indexOf("Phù thủy");
          return witchIndex >= 0 ? witchIndex + 1 : order.length;
        })();

    order.splice(Math.min(insertAt, order.length), 0, spiritRole);
  }

  function insertSpiritWolfIntoNightOrder(room: Room) {
    if (!room.nightTurnOrderSnapshot) {
      room.nightTurnOrderSnapshot = getBaseNightActionOrder(room);
    }
    ensureUpcomingSpiritWolfTurn(room, room.nightTurnOrderSnapshot);
  }

  function finishSpiritWolfTurn(roomId: string, timedOut: boolean) {
    const room = ctx.rooms[roomId];
    if (!room) return;
    if (room.phase !== "night") return;
    const rules = ensureRoomGameRules(room);
    const isSequentialNight = !rules.allNightActionsSimultaneous;
    if (isSequentialNight && room.nightTurnRole !== "Linh sói") return;

    clearNightTurnTimer(room);
    if (room.spiritWolfDecisionTimer) {
      clearTimeout(room.spiritWolfDecisionTimer);
      room.spiritWolfDecisionTimer = null;
    }
    room.daNghichState!.spiritWolfDecisionDeadline = null;

    const pendingTargetId = room.spiritWolfPendingPoisonedWolfId;
    if (timedOut && !room.spiritWolfDecisionMade && pendingTargetId) {
      room.spiritWolfDecisionMade = true;
      room.spiritWolfChoseSave = false;
      const swid = getSpiritWolfId(room);
      appendLogEntry(room, { type: "spirit_wolf_decision", phase: "night", actorId: swid, saved: false, timedOut: true });
      if (swid) {
        ctx.io.to(swid).emit("spiritWolfDecisionRecorded", { saved: false });
      }
    }

    room.spiritWolfPendingPoisonedWolfId = null;

    ctx.io.to(roomId).emit("roomUpdated", toPublicRoom(room));
    emitHostNightActionProgress(roomId);
    deps.checkAndEndGame(roomId, timedOut ? "spirit_wolf_timeout" : "spirit_wolf_decision");

    if (isSequentialNight && !room.gameOver) {
      startNightTurnByIndex(roomId, (room.nightTurnIndex ?? 0) + 1);
    }
  }

  function startSpiritWolfDecisionWindow(roomId: string) {
    const room = ctx.rooms[roomId];
    if (!room) return;
    if (room.phase !== "night") return;
    if (!shouldIncludeSpiritWolfTurn(room)) return;

    const rules = ensureRoomGameRules(room);
    const durationMs = SPIRIT_WOLF_DECISION_MS;

    if (rules.allNightActionsSimultaneous) {
      if (room.spiritWolfDecisionTimer) {
        clearTimeout(room.spiritWolfDecisionTimer);
        room.spiritWolfDecisionTimer = null;
      }
      room.daNghichState!.spiritWolfDecisionDeadline = Date.now() + durationMs + 500;
      emitSpiritWolfDecisionNeeded(roomId);
      room.spiritWolfDecisionTimer = setTimeout(() => {
        finishSpiritWolfTurn(roomId, true);
      }, durationMs + 500);
      ctx.io.to(roomId).emit("roomUpdated", toPublicRoom(room));
      emitHostNightActionProgress(roomId);
      return;
    }

    if (!room.nightTurnOrderSnapshot) {
      room.nightTurnOrderSnapshot = getBaseNightActionOrder(room);
    }
    insertSpiritWolfIntoNightOrder(room);
    const currentIndex = room.nightTurnIndex ?? -1;
    const searchFrom = Math.max(0, currentIndex);
    let spiritIndex = room.nightTurnOrderSnapshot.indexOf("Linh sói", searchFrom);
    if (spiritIndex < 0) {
      spiritIndex = room.nightTurnOrderSnapshot.indexOf("Linh sói");
    }
    if (spiritIndex < 0) return;

    startNightTurnByIndex(roomId, spiritIndex, { durationMs });
  }

  function startWolfPhase(roomId: string, opts?: { durationMs?: number; initializeVotes?: boolean; useTimer?: boolean }) {
    const room = ctx.rooms[roomId];
    if (!room) return;

    const initializeVotes = opts?.initializeVotes !== false;
    const wolves = room.players.filter((p) => isWolfAlignedPlayer(room, p.id));

    if (initializeVotes) {
      room.daNghichState!.wolfVotes = {};
      room.daNghichState!.wolfVotes2 = {};
      room.wolfLocked = {};
      wolves.forEach((w) => {
        room.daNghichState!.wolfVotes![w.id] = null;
        room.daNghichState!.wolfVotes2![w.id] = null;
        room.wolfLocked![w.id] = false;
      });
      room.wolfVoteResolvedTonight = false;
    } else {
      room.daNghichState!.wolfVotes = room.daNghichState!.wolfVotes || {};
      room.daNghichState!.wolfVotes2 = room.daNghichState!.wolfVotes2 || {};
      room.wolfLocked = room.wolfLocked || {};
    }

    const useTimer = opts?.useTimer !== false;
    const durationMs = useTimer ? Math.max(0, Math.floor(opts?.durationMs ?? getWolfTurnDurationMs(room))) : null;

    room.daNghichState!.wolfDeadline = durationMs === null ? null : Date.now() + durationMs + 500;
    ctx.io.to(`wolves_${roomId}`).emit("wolfPhaseStarted", {
      wolves: wolves.map((w) => w.id),
      activeWolves: getActiveWolves(room),
      deadline: room.daNghichState!.wolfDeadline,
      maxTargets: room.wolfBonusBiteThisNight ? 2 : 1,
      resetVotes: initializeVotes,
      wolfBadgeRolesByPlayerId: Object.fromEntries(wolves.map((w) => [w.id, room.playerRoles?.[w.id] || "Sói"])),
      wildWolfConvertAvailable: room.daNghichState!.wildWolfConvertAvailableTonight === true,
      wildWolfConvertRequested: room.daNghichState!.wildWolfConvertRequestedTonight === true,
    });

    ctx.io.to(`wolves_${roomId}`).emit("wolfVotesUpdated", room.daNghichState!.wolfVotes || {});
    ctx.io.to(`wolves_${roomId}`).emit("wolfVotes2Updated", room.daNghichState!.wolfVotes2 || {});
    ctx.io.to(`wolves_${roomId}`).emit("wolfLockedUpdated", room.wolfLocked || {});

    if (room.wolfTimer) {
      clearTimeout(room.wolfTimer);
      room.wolfTimer = null;
    }

    if (durationMs === null) {
      return;
    }

    if (durationMs <= 0) {
      finishWolfVoting(roomId);
      return;
    }

    room.wolfTimer = setTimeout(() => {
      finishWolfVoting(roomId);
    }, durationMs + 500);
  }

  function emitWolfBiteDisabled(roomId: string) {
    const room = ctx.rooms[roomId];
    if (!room) return;
    const wolves = room.players.filter((p) => isWolfAlignedPlayer(room, p.id));
    ctx.io.to(`wolves_${roomId}`).emit("wolfPhaseStarted", {
      wolves: wolves.map((w) => w.id),
      activeWolves: [],
      deadline: null,
      maxTargets: 0,
      resetVotes: true,
      biteDisabled: true,
      wolfBadgeRolesByPlayerId: Object.fromEntries(wolves.map((w) => [w.id, room.playerRoles?.[w.id] || "Sói"])),
      wildWolfConvertAvailable: false,
      wildWolfConvertRequested: false,
    });
  }

  function getRoleTurnDurationMs(room: Room, role: NightActionRole) {
    if (role === "Sói") return getWolfTurnDurationMs(room);
    if (role === "Phù thủy") return getWitchTurnDurationMs(room);
    if (role === "Linh sói") return SPIRIT_WOLF_DECISION_MS;
    return getNonWolfTurnDurationMs(room);
  }

  function startNightTurnByIndex(roomId: string, index: number, opts?: { durationMs?: number; initializeWolfVotes?: boolean }) {
    const room = ctx.rooms[roomId];
    if (!room) return;
    if (room.phase !== "night") return;

    const rules = ensureRoomGameRules(room);
    if (rules.allNightActionsSimultaneous) return;

    clearNightTurnTimer(room);

    const order = getEffectiveNightActionOrder(room);
    const previousRole = index > 0 ? order[index - 1] : null;
    const nextRole = index >= 0 && index < order.length ? order[index] : null;
    if (isElementalRoleTurn(previousRole) && !isElementalRoleTurn(nextRole)) {
      deps.resolveElementalBuffVote(roomId);
    }

    if (index < 0 || index >= order.length) {
      room.nightTurnIndex = order.length;
      room.nightTurnRole = null;
      room.nightTurnDeadline = null;
      room.nightTurnPaused = false;
      room.nightTurnRemainingMs = null;
      room.hidePlayerRoleText = true;
      ctx.io.to(roomId).emit("roomUpdated", toPublicRoom(room));
      return;
    }

    const role = order[index]!;
    if (role === "Sói" && room.merchantWolfBiteDisabledTonight) {
      room.daNghichState!.wolfDeadline = null;
      room.wolfVoteResolvedTonight = true;
      startNightTurnByIndex(roomId, index + 1);
      return;
    }
    const durationMs = Math.max(0, Math.floor(opts?.durationMs ?? getRoleTurnDurationMs(room, role)));

    room.nightTurnIndex = index;
    room.nightTurnRole = role;
    room.nightTurnPaused = false;
    room.nightTurnRemainingMs = durationMs;
    room.nightTurnDeadline = Date.now() + durationMs + 500;
    room.daNghichState!.spiritWolfDecisionDeadline = role === "Linh sói" ? room.nightTurnDeadline : room.daNghichState!.spiritWolfDecisionDeadline ?? null;
    room.hidePlayerRoleText = false;

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
        }, durationMs + 500);
      }
    } else {
      if (durationMs <= 0) {
        setTimeout(() => {
          const latest = ctx.rooms[roomId];
          if (!latest) return;
          if (latest.phase !== "night") return;
          if (latest.nightTurnRole !== role) return;
          startNightTurnByIndex(roomId, index + 1);
        }, 0);
      } else {
        room.nightTurnTimer = setTimeout(() => {
          startNightTurnByIndex(roomId, index + 1);
        }, durationMs + 500);
      }
    }

    ctx.io.to(roomId).emit("roomUpdated", toPublicRoom(room));
    emitElementalNightStateForRole(roomId, role);
  }

  function startNightTurnFlow(roomId: string, options?: { delayMs?: number }) {
    const room = ctx.rooms[roomId];
    if (!room) return;
    if (room.phase !== "night") return;

    const delayMs = Math.max(0, Math.floor(options?.delayMs || 0));
    if (delayMs > 0) {
      const transitionEndsAt = Math.max(Date.now(), room.nightTransitionEndsAt || Date.now() + delayMs);
      const remainingTransitionMs = Math.max(0, transitionEndsAt - Date.now());
      room.nightTransitionEndsAt = transitionEndsAt;
      ctx.io.to(roomId).emit("roomUpdated", toPublicRoom(room));
      setTimeout(() => {
        const latest = ctx.rooms[roomId];
        if (!latest || latest.phase !== "night") return;
        if (latest.nightTransitionEndsAt !== transitionEndsAt) return;
        latest.nightTransitionEndsAt = null;
        startNightTurnFlow(roomId);
      }, remainingTransitionMs);
      return;
    }

    room.nightTransitionEndsAt = null;

    const rules = ensureRoomGameRules(room);
    resetNightTurnState(room);
    room.nightTurnOrderSnapshot = getBaseNightActionOrder(room);

    if (rules.allNightActionsSimultaneous) {
      room.hidePlayerRoleText = false;
      const nonWolfDurationMs = getNonWolfTurnDurationMs(room);
      room.nightTurnDeadline = nonWolfDurationMs > 0 ? Date.now() + nonWolfDurationMs + 500 : null;
      const baseDeadline = room.nightTurnDeadline;

      if (room.merchantWolfBiteDisabledTonight) {
        room.daNghichState!.wolfDeadline = null;
        room.wolfVoteResolvedTonight = true;
        emitWolfBiteDisabled(roomId);
      } else {
        const wolfDurationMs = getWolfTurnDurationMs(room);
        startWolfPhase(roomId, {
          initializeVotes: true,
          useTimer: wolfDurationMs > 0,
          durationMs: wolfDurationMs,
        });
      }
      ctx.io.to(roomId).emit("roomUpdated", toPublicRoom(room));
      emitElementalNightStateForAll(roomId);
      if (baseDeadline) {
        setTimeout(() => {
          const latest = ctx.rooms[roomId];
          if (!latest) return;
          if (latest.phase !== "night") return;
          if (latest.nightTurnDeadline !== baseDeadline) return;
          emitHostNightActionProgress(roomId);
        }, Math.max(0, baseDeadline - Date.now()));

        if (shouldGrantWitchBonus(room)) {
          const witchDeadline = baseDeadline + WITCH_BONUS_MS;
          setTimeout(() => {
            const latest = ctx.rooms[roomId];
            if (!latest) return;
            if (latest.phase !== "night") return;
            if (latest.nightTurnDeadline !== baseDeadline) return;
            emitHostNightActionProgress(roomId);
          }, Math.max(0, witchDeadline - Date.now()));
        }
      }
      return;
    }

    const order = getEffectiveNightActionOrder(room);
    if (!order.length) {
      ctx.io.to(roomId).emit("roomUpdated", toPublicRoom(room));
      return;
    }

    startNightTurnByIndex(roomId, 0, { initializeWolfVotes: true });
  }

  function finishWolfVoting(roomId: string) {
    const room = ctx.rooms[roomId];
    if (!room) return;
    if (room.gameMode === "soi_mu") return;
    if (room.wolfVoteResolvedTonight) return;
    const rules = ensureRoomGameRules(room);
    if (room.merchantWolfBiteDisabledTonight) {
      room.daNghichState!.wolfDeadline = null;
      room.wolfVoteResolvedTonight = true;
      emitWolfBiteDisabled(roomId);
      emitHostNightActionProgress(roomId);
      if (!rules.allNightActionsSimultaneous && room.phase === "night" && room.nightTurnRole === "Sói") {
        startNightTurnByIndex(roomId, (room.nightTurnIndex ?? 0) + 1);
      }
      return;
    }

    if (room.wolfTimer) {
      clearTimeout(room.wolfTimer);
      room.wolfTimer = null;
    }
    room.daNghichState!.wolfDeadline = null;
    room.wolfVoteResolvedTonight = true;
    room.wolfAttackResolvedAt = Date.now();

    const votes = room.daNghichState!.wolfVotes || {};
    const votes2 = room.daNghichState!.wolfVotes2 || {};
    const activeWolves = getActiveWolves(room);

    appendLogEntry(
      room,
      room.wolfBonusBiteThisNight
        ? buildWolfVoteBreakdown(room, votes, votes2)
        : buildWolfVoteBreakdown(room, votes)
    );

    const getRandomEligibleWolfTarget = () => {
      const dead = new Set(room.deadPlayers || []);
      const attackAt = room.wolfAttackResolvedAt || Date.now();
      const candidates = getParticipantIds(room)
        .filter((playerId) => !dead.has(playerId))
        .filter((playerId) => rules.wolfCanBiteWolf || !isWolfAlignedPlayer(room, playerId))
        .filter((playerId) => !isLovePairMemberAwayAt(room, playerId, attackAt, true));
      if (!candidates.length) return null;
      return candidates[Math.floor(Math.random() * candidates.length)] ?? null;
    };

    const results = calculateWolfBiteResults(
      room,
      votes,
      votes2,
      activeWolves,
      rules,
      getRandomEligibleWolfTarget
    );

    room.killedTonight = results.killedTonight;
    room.killedTonightExtra = results.killedTonightExtra;

    ctx.io.to(roomId).emit("wolfVoteFinished", {
      target: room.killedTonight,
      extraTarget: room.killedTonightExtra,
    });

    const wolfTargets = [room.killedTonight, room.killedTonightExtra].filter(Boolean) as string[];
    const selectedByByTarget: Record<string, string[]> = {};
    for (const targetId of wolfTargets) {
      const selectedBy = activeWolves.filter((wid) => votes[wid] === targetId || votes2[wid] === targetId);
      selectedByByTarget[targetId] = selectedBy;
    }
    const villageChiefDelayedTargetIds = wolfTargets.filter((targetId) =>
      isVillageChief(room, targetId) && isVillageChiefDelayedBiteNight(room)
    );
    appendLogEntry(room, {
      type: "wolf_result",
      phase: "night",
      targetIds: wolfTargets,
      selectedByByTarget,
      villageChiefDelayedTargetIds,
    });

    for (const targetId of wolfTargets) {
      const voters = selectedByByTarget[targetId] || [];
      appendGameEvent(room, {
        type: "WOLF_BITE",
        phase: "night",
        actorIds: voters,
        targetIds: [targetId],
        metadata: {
          votes: votes,
          wolfBonusBite: room.wolfBonusBiteThisNight === true,
        },
      });
    }

    const wildConversionTargetId =
      room.daNghichState!.wildWolfConvertRequestedTonight &&
        room.daNghichState!.wildWolfConvertAvailableTonight &&
        !room.wildWolfConvertUsed
        ? room.wildWolfConvertTargetId || null
        : null;
    const wildConversionTargetWasBitten = !!wildConversionTargetId && wolfTargets.includes(wildConversionTargetId);
    if (
      room.daNghichState!.wildWolfConvertRequestedTonight &&
      room.daNghichState!.wildWolfConvertAvailableTonight &&
      !room.wildWolfConvertUsed &&
      (!wildConversionTargetId || !wildConversionTargetWasBitten)
    ) {
      appendLogEntry(room, {
        type: "wild_wolf_conversion",
        phase: "night",
        actorId: room.wildWolfConvertActorId || null,
        targetId: wildConversionTargetId,
        success: false,
        previousTargetRole: wildConversionTargetId ? room.playerRoles?.[wildConversionTargetId] || null : null,
        reason: "no_target",
      });
      room.daNghichState!.wildWolfConvertAvailableTonight = false;
      room.daNghichState!.wildWolfConvertRequestedTonight = false;
      room.wildWolfConvertActorId = null;
    }

    if (rules.villageChiefKnowsWolfBite && villageChiefDelayedTargetIds.length) {
      for (const targetId of villageChiefDelayedTargetIds) {
        if ((room.deadPlayers || []).includes(targetId)) continue;
        room.daNghichState!.privatePlayerHearts = room.daNghichState!.privatePlayerHearts || {};
        room.daNghichState!.privatePlayerHearts[targetId] = 1;
        room.daNghichState!.privateHeartVisiblePlayerIds = Array.from(new Set([...(room.daNghichState!.privateHeartVisiblePlayerIds || []), targetId]));
        room.daNghichState!.playerHeartShakeIds = (room.daNghichState!.playerHeartShakeIds || []).filter((id) => id !== targetId);
        room.daNghichState!.villageChiefDyingFramePlayerIds = Array.from(new Set([...(room.daNghichState!.villageChiefDyingFramePlayerIds || []), targetId]));
      }
      ctx.io.to(roomId).emit("roomUpdated", toPublicRoom(room));
    }

    if (room.phase === "night") {
      emitWitchPendingDeath(roomId);
    }
    emitHostNightActionProgress(roomId);

    if (!rules.allNightActionsSimultaneous && room.phase === "night" && room.nightTurnRole === "Sói") {
      startNightTurnByIndex(roomId, (room.nightTurnIndex ?? 0) + 1);
    }
  }

  return {
    canPerformNightRoleAction,
    getSelectedNightActionRoles,
    shouldIncludeSpiritWolfTurn,
    getBaseNightActionOrder,
    getEffectiveNightActionOrder,
    insertSpiritWolfIntoNightOrder,
    startSpiritWolfDecisionWindow,
    finishSpiritWolfTurn,
    getWolfTurnDurationMs,
    getNonWolfTurnDurationMs,
    startWolfPhase,
    getRoleTurnDurationMs,
    startNightTurnByIndex,
    startNightTurnFlow,
    finishWolfVoting,
  };
}

export function calculateWolfBiteResults(
  room: any,
  votes: Record<string, string | null>,
  votes2: Record<string, string | null>,
  activeWolves: string[],
  rules: any,
  getRandomEligibleWolfTarget: () => string | null
): { killedTonight: string | null; killedTonightExtra: string | null } {
  const forceWolfBiteFirstNight =
    rules.twoHeartsFirstTwoNights &&
    rules.forceWolfBiteFirstNight &&
    (room.nightCount || 0) === 1 &&
    activeWolves.length > 0;

  const randomFrom = <T,>(items: T[]): T | null => {
    if (!items.length) return null;
    return items[Math.floor(Math.random() * items.length)] ?? null;
  };

  const counts: Record<string, number> = {};
  activeWolves.forEach((wolfId) => {
    const target = votes[wolfId];
    if (!target) return;
    counts[target] = (counts[target] || 0) + 1;
  });

  let killedTonight: string | null = null;
  let killedTonightExtra: string | null = null;

  const entries = Object.entries(counts);
  if (entries.length === 0) {
    killedTonight = forceWolfBiteFirstNight ? getRandomEligibleWolfTarget() : null;
  } else {
    entries.sort((a, b) => b[1] - a[1]);
    if (entries.length > 1 && entries[0]![1] === entries[1]![1]) {
      const topCount = entries[0]![1];
      const tiedTargets = entries.filter(([, count]) => count === topCount).map(([targetId]) => targetId);
      killedTonight = forceWolfBiteFirstNight ? randomFrom(tiedTargets) : null;
    } else {
      killedTonight = entries[0]![0];
    }
  }

  if (room.wolfBonusBiteThisNight) {
    const votingWolves = activeWolves.filter((wid) => !!votes[wid] || !!votes2[wid]);

    if (votingWolves.length <= 1) {
      const wid = votingWolves[0];
      const t1 = wid ? votes[wid] : null;
      const t2 = wid ? votes2[wid] : null;
      if (t1 && t2 && t1 !== t2) {
        killedTonight = t1;
        killedTonightExtra = t2;
      } else {
        killedTonight = t1 || t2 || null;
        killedTonightExtra = null;
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

      if (rules.wolfBonusBiteSmoothTied) {
        const eligible = Object.entries(combinedCounts);
        if (eligible.length === 0) {
          killedTonight = null;
          killedTonightExtra = null;
        } else {
          eligible.sort((a, b) => b[1] - a[1]);
          const voteGroups: Record<number, string[]> = {};
          eligible.forEach(([pid, count]) => {
            if (!voteGroups[count]) {
              voteGroups[count] = [];
            }
            voteGroups[count].push(pid);
          });

          const sortedVotes = Object.keys(voteGroups)
            .map(Number)
            .sort((a, b) => b - a);

          const max1 = sortedVotes[0];
          const S1 = max1 !== undefined ? voteGroups[max1]! : [];

          if (S1.length >= 3) {
            killedTonight = null;
            killedTonightExtra = null;
          } else if (S1.length === 2) {
            killedTonight = S1[0]!;
            killedTonightExtra = S1[1]!;
          } else {
            killedTonight = S1[0]!;
            const max2 = sortedVotes[1];
            const S2 = max2 !== undefined ? voteGroups[max2]! : [];
            if (S2.length === 1) {
              killedTonightExtra = S2[0]!;
            } else {
              killedTonightExtra = null;
            }
          }
        }
      } else {
        const eligible = Object.entries(combinedCounts).filter(([, c]) => c >= 2);
        if (eligible.length === 0) {
          killedTonight = null;
          killedTonightExtra = null;
        } else {
          eligible.sort((a, b) => b[1] - a[1]);
          const topCount = eligible[0]![1];
          const topTied = eligible.filter(([, c]) => c === topCount);
          if (topTied.length >= 3) {
            killedTonight = null;
            killedTonightExtra = null;
          } else if (topTied.length === 2) {
            killedTonight = topTied[0]![0];
            killedTonightExtra = topTied[1]![0];
          } else {
            killedTonight = eligible[0]![0];

            const remaining = eligible.filter(([pid]) => pid !== killedTonight);
            if (remaining.length) {
              const secondCount = remaining[0]![1];
              const secondTied = remaining.filter(([, c]) => c === secondCount);
              if (secondTied.length === 1) {
                killedTonightExtra = remaining[0]![0];
              } else {
                killedTonightExtra = null;
              }
            }
          }
        }
      }
    }
  }

  if (forceWolfBiteFirstNight && !killedTonight) {
    const selectedTargets = Object.keys(counts);
    killedTonight = selectedTargets.length
      ? randomFrom(selectedTargets)
      : getRandomEligibleWolfTarget();
    if (killedTonightExtra === killedTonight) {
      killedTonightExtra = null;
    }
  }

  return { killedTonight, killedTonightExtra };
}
