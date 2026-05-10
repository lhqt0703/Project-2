import type { ServerContext } from "./serverContext.js";
import { ensureRoomGameRules, buildRoomGameRules, type Room } from "./serverTypes.js";
import { clearGameTimers, clearTrialState, ensureWitchState, getParticipantCount, getParticipantPlayers, getParticipantIds, getSpiritWolfId, getWitches, isWolfRole, resetNightTurnState, getAlivePlayerIds, isWolfAlignedPlayer } from "./roomState.js";
import { RULES_RESTART_FADE_IN_MS, RULES_RESTART_FADE_OUT_MS, RULES_RESTART_HOLD_MS, RULES_RESTART_RESTART_AT_MS, TWO_HEARTS_NIGHT_LIMIT, initTwoHeartsForParticipants } from "./gameConfig.js";
import { emitRolesRevealToSocket, toPublicRoom } from "./serverEmitters.js";
import { dealRolesWithPendingAssignments } from "./roleAssignment.js";

const SPIRIT_WOLF_ROLE = "Linh sói";

export function createLifecycleFlow(ctx: ServerContext) {
  function emitRestartCinematicToPlayers(roomId: string, message: string) {
    const room = ctx.rooms[roomId];
    if (!room) return;

    for (const player of getParticipantPlayers(room)) {
      ctx.io.to(player.id).emit("rulesRestartCinematic", {
        roomId,
        message,
        fadeInMs: RULES_RESTART_FADE_IN_MS,
        holdMs: RULES_RESTART_HOLD_MS,
        fadeOutMs: RULES_RESTART_FADE_OUT_MS,
      });
    }
  }

  function returnHostToGameView(roomId: string, hostOverlayMessage?: string) {
    const room = ctx.rooms[roomId];
    if (!room) return;

    const hostIndex = room.players.findIndex((p) => p.id === room.hostId);
    if (hostIndex >= 0) {
      room.players[hostIndex] = { ...room.players[hostIndex]!, inGame: true };
    }

    ctx.io.to(roomId).emit("roomUpdated", toPublicRoom(room));
    ctx.io.to(room.hostId).emit("gameStarted", hostOverlayMessage
      ? {
          hostRestartCinematic: {
            roomId,
            message: hostOverlayMessage,
            fadeInMs: RULES_RESTART_FADE_IN_MS,
            holdMs: RULES_RESTART_HOLD_MS,
            fadeOutMs: RULES_RESTART_FADE_OUT_MS,
          },
        }
      : undefined);
  }

  function getWolfRoleCount(roles: string[] | undefined) {
    return (roles || []).filter((role) => isWolfRole(role)).length;
  }

  function getMaxAllowedWolfCount(playerCount: number) {
    return Math.floor((playerCount - 1) / 2);
  }

  function rebalanceWolfRoles(room: Room, maxWolfCount: number) {
    const roles = [...(room.roles || [])];
    const participantCount = getParticipantCount(room);
    const currentWolfCount = getWolfRoleCount(roles);
    let overflow = Math.max(0, currentWolfCount - maxWolfCount);

    if (overflow <= 0) {
      room.roles = roles;
      return;
    }

    const removableSlots = Math.max(0, roles.length - participantCount);
    if (removableSlots > 0) {
      for (let i = roles.length - 1; i >= 0 && overflow > 0 && room.roles && removableSlots > 0; i--) {
        if (!isWolfRole(roles[i])) continue;
        roles.splice(i, 1);
        overflow -= 1;
        if (roles.length <= participantCount) break;
      }
    }

    if (overflow > 0) {
      let keptWolfCount = 0;
      for (let i = 0; i < roles.length; i++) {
        const role = roles[i];
        if (!isWolfRole(role)) continue;

        keptWolfCount += 1;
        if (keptWolfCount > maxWolfCount) {
          roles[i] = "Dân làng";
          overflow -= 1;
          if (overflow <= 0) break;
        }
      }
    }

    room.roles = roles;
  }

  function startFreshRoundWithCurrentRoles(roomId: string) {
    const room = ctx.rooms[roomId];
    if (!room) return false;

    const rules = room.pendingGameRules ? buildRoomGameRules(room.pendingGameRules) : ensureRoomGameRules(room);
    room.gameRules = rules;
    delete room.pendingGameRules;

    const roles = room.roles;
    const participantCount = getParticipantCount(room);
    if (!roles || roles.length < participantCount) {
      return false;
    }

    clearGameTimers(room);

    for (const p of room.players) {
      ctx.io.in(p.id).socketsLeave(`wolves_${roomId}`);
      ctx.io.in(p.id).socketsLeave(`witches_${roomId}`);
    }

    function shuffle<T>(arr: T[]) {
  return arr.slice().sort(() => Math.random() - 0.5);
}

const HIGH_PRIORITY_ROLES = new Set(["Tiên tri", "Bảo vệ", "Phù thủy"]);

function isLowPriorityElementalRole(role: string) {
  // nếu role nguyên tố của bạn nằm trong ELEMENTAL_ROLE_SET thì import và dùng ở đây
  return role.includes("nguyên tố");
}

function pickRolesForParticipants(roles: string[], participantCount: number) {
  const selected: string[] = [];

  const wolves = roles.filter(isWolfRole);
  const high = roles.filter((r) => HIGH_PRIORITY_ROLES.has(r));
  const low = roles.filter((r) => isLowPriorityElementalRole(r));
  const medium = roles.filter(
    (r) =>
      !isWolfRole(r) &&
      !HIGH_PRIORITY_ROLES.has(r) &&
      !isLowPriorityElementalRole(r)
  );

  if (wolves.length > 0 && selected.length < participantCount) {
    selected.push(shuffle(wolves)[0]!);
  }

  for (const role of shuffle(high)) {
    if (selected.length >= participantCount) break;
    selected.push(role);
  }

  for (const role of shuffle(medium)) {
    if (selected.length >= participantCount) break;
    selected.push(role);
  }

  for (const role of shuffle(low)) {
    if (selected.length >= participantCount) break;
    selected.push(role);
  }

  return shuffle(selected);
}

    const participants = getParticipantPlayers(room);
    const deal = dealRolesWithPendingAssignments(
      participants,
      roles,
      room.pendingRoleAssignments,
      (remainingRoles, remainingPlayerCount) =>
        remainingRoles.length > remainingPlayerCount
          ? pickRolesForParticipants(remainingRoles, remainingPlayerCount)
          : shuffle(remainingRoles),
    );

    if (!deal) return false;

    room.playerRoles = deal.playerRoles;
    delete room.pendingRoleAssignments;
    ctx.io.to(room.hostId).emit("pendingRoleAssignmentsUpdated", {});

    participants.forEach((player) => {
      const role: string = room.playerRoles![player.id] || "";
      room.playerRoles![player.id] = role;
      ctx.io.to(player.id).emit("yourRole", role);
    });
    room.players = room.players.map((p) => ({ ...p, inGame: p.id !== room.hostId }));

    room.wolves = participants.filter((p) => isWolfRole(room.playerRoles?.[p.id])).map((p) => p.id);
    room.wolves.forEach((wolfId) => {
      ctx.io.in(wolfId).socketsJoin(`wolves_${roomId}`);
    });

    room.witchPotions = {};
    room.witchHealTargetTonight = {};
    room.witchPoisonTargetTonight = {};
    for (const wid of getWitches(room)) {
      ctx.io.in(wid).socketsJoin(`witches_${roomId}`);
      ensureWitchState(room, wid);
    }

    room.gameOver = false;
    room.winner = undefined;
    room.phase = "dusk";
    room.nightCount = 0;
    room.gameLog = [];
    room.deadPlayers = [];
    room.sharedHeartsVisible = false;
    room.playerHearts = {};
    room.protectedTonight = null;
    room.lastProtected = null;
    room.seerUsedTonight = {};
    room.hunterTargetTonight = {};
    room.hunterShotPlayerIds = [];
    room.killedTonight = null;
    room.killedTonightExtra = null;
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
    room.dayDiscussionDeadline = null;
    room.dayDeadline = null;
    room.hidePlayerRoleText = true;
    clearTrialState(room);

    if (rules.twoHeartsFirstTwoNights) {
      initTwoHeartsForParticipants(room);
    }

    room.spiritWolfId = getSpiritWolfId(room);
    room.spiritWolfDecisionMade = false;
    room.spiritWolfChoseSave = false;
    room.spiritWolfWolfAligned = false;
    room.spiritWolfWolfAlignedPending = false;
    room.spiritWolfPendingPoisonedWolfId = null;
    room.spiritWolfBittenThisNight = false;
    room.elementalTargetTonight = {};
    room.elementalCorrectGuessPlayerIdsTonight = [];
    room.elementalCorrectGuessCountForBuff = 0;
    room.elementalPendingBuffVoteNight = null;
    room.elementalBuffVotesTonight = {};
    room.elementalBuffVotesResolvedNight = null;
    room.elementalSelectedBuffId = null;
    room.elementalSelectedBuffAppliesNight = null;
    room.elementalBuffQuickMode = true;

    ctx.io.to(roomId).emit("phaseChanged", "dusk");
    ctx.io.to(roomId).emit("roomUpdated", toPublicRoom(room));
    ctx.io.to(roomId).emit("gameStarted");
    emitRolesRevealToSocket(roomId, room.hostId);

    checkAndEndGame(roomId, "after_restart_game");
    return true;
  }

  function checkAndEndGame(roomId: string, reason?: string) {
    const room = ctx.rooms[roomId];
    if (!room) return;

    const aliveIds = getAlivePlayerIds(room);
    if (aliveIds.length === 0) {
      room.gameOver = true;
      room.winner = "nobody";
      ctx.io.to(roomId).emit("gameEnded", { winner: room.winner, reason: reason || "nobody_alive" });
      ctx.io.to(roomId).emit("gameLogUpdated", { roomId, nights: room.gameLog || [] });
      ctx.io.to(roomId).emit("roomUpdated", toPublicRoom(room));
      return;
    }

    const nonWolfAligned = aliveIds.filter(
      (id) => !isWolfAlignedPlayer(room, id)
    );
    const wolfAligned = aliveIds.filter((id) =>
      isWolfAlignedPlayer(room, id)
    );

    if (wolfAligned.length === 0) {
      room.gameOver = true;
      room.winner = "villagers";
      ctx.io.to(roomId).emit("gameEnded", {
        winner: room.winner,
        reason: reason || "wolves_eliminated",
      });
      ctx.io.to(roomId).emit("gameLogUpdated", { roomId, nights: room.gameLog || [] });
      ctx.io.to(roomId).emit(
        "rolesRevealUpdated",
        { roomId, rolesByPlayerId: room.playerRoles || {} }
      );
      ctx.io.to(roomId).emit("roomUpdated", toPublicRoom(room));
      return;
    }

    if (nonWolfAligned.length === 0) {
      room.gameOver = true;
      room.winner = "wolves";
      ctx.io.to(roomId).emit("gameEnded", {
        winner: room.winner,
        reason: reason || "all_villagers_dead",
      });
      ctx.io.to(roomId).emit("gameLogUpdated", { roomId, nights: room.gameLog || [] });
      ctx.io.to(roomId).emit(
        "rolesRevealUpdated",
        { roomId, rolesByPlayerId: room.playerRoles || {} }
      );
      ctx.io.to(roomId).emit("roomUpdated", toPublicRoom(room));
      return;
    }

    const bitingWolvesAlive = getAlivePlayerIds(room)
      .filter((id) => isWolfAlignedPlayer(room, id))
      .length;
    const spiritWolfId = getSpiritWolfId(room);
    const villagersAlive = aliveIds.filter((id) => {
      if (isWolfAlignedPlayer(room, id)) return false;
      return true;
    }).length;

    if (bitingWolvesAlive >= villagersAlive) {
      room.gameOver = true;
      room.winner = "wolves";
      ctx.io.to(roomId).emit("gameEnded", { winner: room.winner, reason: reason || "wolves_ge_villagers" });
      ctx.io.to(roomId).emit("gameLogUpdated", { roomId, nights: room.gameLog || [] });
      ctx.io.to(roomId).emit(
        "rolesRevealUpdated",
        { roomId, rolesByPlayerId: room.playerRoles || {} }
      );
      ctx.io.to(roomId).emit("roomUpdated", toPublicRoom(room));
    }
  }

  return {
    checkAndEndGame,
    emitRestartCinematicToPlayers,
    returnHostToGameView,
    startFreshRoundWithCurrentRoles,
    getWolfRoleCount,
    getMaxAllowedWolfCount,
    rebalanceWolfRoles,
  };
}
