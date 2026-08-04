import type { ServerContext } from "./serverContext.js";
import { ensureRoomGameRules, buildRoomGameRules, type Room, type GameLogEntryPhase } from "./serverTypes.js";
import { clearGameTimers, clearTrialState, ensureWitchState, getParticipantCount, getParticipantPlayers, getParticipantIds, getBanSoiId, getSpiritWolfId, getWildWolfId, getWitches, isWolfRole, resetNightTurnState, getAlivePlayerIds, isWolfAlignedPlayer } from "./roomState.js";
import { RULES_RESTART_FADE_IN_MS, RULES_RESTART_FADE_OUT_MS, RULES_RESTART_HOLD_MS, RULES_RESTART_RESTART_AT_MS, TWO_HEARTS_NIGHT_LIMIT, initTwoHeartsForParticipants } from "./gameConfig.js";
import { emitRolesRevealToSocket, toPublicRoom, broadcastWolvesListSync, emitPublicDayGameLogToRoom, emitGameLogToSocket, emitSongTrungRobbedStateToPlayers, emitCoffeePrivateStateForAll } from "./serverEmitters.js";
import { dealRolesWithPendingAssignments, pickRolesForParticipants } from "./roleAssignment.js";
import { clearLoveStateForPlayers, getLovePairIds } from "./love.js";
import { MERCHANT_ROLE, resetMerchantRoundState } from "./merchant.js";
import { shouldDeferEndGameForAngel } from "./angel.js";
import { appendLogEntry } from "./gameLog.js";
import { ScoringEngine } from "./scoring/scoringEngine.js";
import { buildGameSummaryFromRoom } from "./scoring/gameLogMapper.js";
import { appendGameEvent } from "./gameEvent.js";
import { saveMatchHistory } from "./gameHistory.js";
import { assignCoffeeSecondaryRoles, getPrimaryRolesForDeal, resetCoffeeRoleState } from "./coffeeRoles.js";


const SPIRIT_WOLF_ROLE = "Linh sói";

export function createLifecycleFlow(ctx: ServerContext) {
  function appendAngelOutcomes(room: Room, winner: NonNullable<Room["winner"]>) {
    const logged = new Set(room.angelOutcomeLoggedPlayerIds || []);
    const records = Object.values(room.angelReviveRecordsByAngelId || {});
    const phase = (room.phase === "day" ? "day" : "night") as "day" | "night";

    for (const record of records) {
      if (logged.has(record.angelId)) continue;

      const targetRole = room.playerRoles?.[record.targetId] || null;
      let won = false;
      let noContest = false;
      let reason: "matched_wolves" | "matched_villagers" | "wrong_guess" | "aligned_team_lost" | "third_party_target_won" | "third_party_target_lost";

      if (record.targetTeam === "third") {
        const targetWon = targetRole === MERCHANT_ROLE && (room.merchantWinCompletedPlayerIds || []).includes(record.targetId);
        won = targetWon;
        reason = targetWon ? "third_party_target_won" : "third_party_target_lost";
      } else if (record.guess !== record.targetTeam) {
        noContest = true;
        reason = "wrong_guess";
      } else if (record.targetTeam === "wolves" && winner === "wolves") {
        won = true;
        reason = "matched_wolves";
      } else if (record.targetTeam === "villagers" && winner === "villagers") {
        won = true;
        reason = "matched_villagers";
      } else {
        reason = "aligned_team_lost";
      }

      appendLogEntry(room, {
        type: "angel_outcome",
        phase,
        actorId: record.angelId,
        targetId: record.targetId,
        guess: record.guess,
        targetTeam: record.targetTeam,
        won,
        noContest,
        reason,
        winner,
      });
      logged.add(record.angelId);
    }

    room.angelOutcomeLoggedPlayerIds = Array.from(logged);
  }

  function endGame(roomId: string, room: Room, winner: NonNullable<Room["winner"]>, reason: string) {
    room.gameOver = true;
    room.winner = winner;
    room.warnedPlayerIds = [];
    appendAngelOutcomes(room, winner);

    appendGameEvent(room, {
      type: "GAME_OVER",
      phase: room.phase || "day",
      metadata: { winner, reason },
    });

    try {
      const summary = buildGameSummaryFromRoom(room);
      const engine = new ScoringEngine();
      room.scoreResult = engine.calculateScore(summary);
    } catch (err) {
      console.error("Error calculating scoreResult at endGame:", err);
    }

    try {
      saveMatchHistory(room);
    } catch (err) {
      console.error("Error saving match history at endGame:", err);
    }

    ctx.io.to(roomId).emit("gameEnded", { winner: room.winner, reason });
    ctx.io.to(roomId).emit("gameLogUpdated", { roomId, nights: room.gameLog || [] });
    ctx.io.to(roomId).emit(
      "rolesRevealUpdated",
      {
        roomId,
        rolesByPlayerId: room.playerRoles || {},
        rolesBeforeConversion: room.rolesBeforeConversion || {},
        secondaryRolesByPlayerId: room.coffeeRoleState?.secondaryRolesByPlayerId || {},
      }
    );
    ctx.io.to(roomId).emit("roomUpdated", toPublicRoom(room));
  }

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

    const removableSlots = Math.max(0, getPrimaryRolesForDeal(room).length - participantCount);
    if (removableSlots > 0) {
      for (let i = roles.length - 1; i >= 0 && overflow > 0 && room.roles && removableSlots > 0; i--) {
        if (!isWolfRole(roles[i])) continue;
        roles.splice(i, 1);
        overflow -= 1;
        room.roles = roles;
        if (getPrimaryRolesForDeal(room).length <= participantCount) break;
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

    const rules = room.pendingGameRules ? buildRoomGameRules(room.pendingGameRules, room.gameMode) : ensureRoomGameRules(room);
    room.gameRules = rules;
    delete room.pendingGameRules;

    const roles = getPrimaryRolesForDeal(room);
    const participantCount = getParticipantCount(room);
    if (roles.length < participantCount) {
      return false;
    }

    clearGameTimers(room);

    for (const p of room.players) {
      ctx.io.in(p.id).socketsLeave(`wolves_${roomId}`);
      ctx.io.in(p.id).socketsLeave(`witches_${roomId}`);
    }

    const participants = getParticipantPlayers(room);
    const deal = dealRolesWithPendingAssignments(
      participants,
      roles,
      room.pendingRoleAssignments,
      room.pendingRoleBlocks,
      pickRolesForParticipants,
      room.playerRoleHistory,
    );

    if (!deal) return false;

    const previousPlayerRoles = room.playerRoles;
    const previousCoffeeRoleState = room.coffeeRoleState;
    room.playerRoles = deal.playerRoles;
    resetCoffeeRoleState(room);
    const secondaryDeal = assignCoffeeSecondaryRoles(room);
    if (!secondaryDeal.ok) {
      if (previousPlayerRoles) room.playerRoles = previousPlayerRoles;
      else delete room.playerRoles;
      if (previousCoffeeRoleState) room.coffeeRoleState = previousCoffeeRoleState;
      else delete room.coffeeRoleState;
      return false;
    }
    if (deal.updatedPlayerRoleHistory) {
      room.playerRoleHistory = deal.updatedPlayerRoleHistory;
    }
    delete room.pendingRoleAssignments;
    delete room.pendingRoleBlocks;
    ctx.io.to(room.hostId).emit("pendingRoleAssignmentsUpdated", {});
    ctx.io.to(room.hostId).emit("pendingRoleBlocksUpdated", {});

    participants.forEach((player) => {
      const role: string = room.playerRoles![player.id] || "";
      room.playerRoles![player.id] = role;
      ctx.io.to(player.id).emit("yourRole", role);
      ctx.io.to(player.id).emit("wildWolfConvertedState", { converted: false });
    });
    emitCoffeePrivateStateForAll(roomId);


    room.daNghichState!.wolves = participants.filter((p) => isWolfRole(room.playerRoles?.[p.id])).map((p) => p.id);
    room.daNghichState!.wolves.forEach((wolfId) => {
      ctx.io.in(wolfId).socketsJoin(`wolves_${roomId}`);
    });
    broadcastWolvesListSync(roomId);

    room.witchPotions = {};
    room.witchHealTargetTonight = {};
    room.witchPoisonTargetTonight = {};
    room.witchHealTargetAt = {};
    room.witchPoisonTargetAt = {};
    for (const wid of getWitches(room)) {
      ctx.io.in(wid).socketsJoin(`witches_${roomId}`);
      ensureWitchState(room, wid);
    }

    room.gameOver = false;
    room.winner = undefined;
    room.phase = "dusk";
    room.duskCardSelections = {};
    room.nightCount = 0;
    room.gameLog = [];
    room.gameEventLog = [];
    room.deadPlayers = [];
    room.warnedPlayerIds = [];
    room.publicRevealedRolesByPlayerId = {};
    room.daNghichState!.sharedHeartsVisible = false;
    room.daNghichState!.playerHearts = {};
    room.daNghichState!.privatePlayerHearts = {};
    room.daNghichState!.privateHeartVisiblePlayerIds = [];
    room.daNghichState!.playerHeartShakeIds = [];
    room.daNghichState!.villageChiefDyingFramePlayerIds = [];
    room.protectedTonight = null;
    room.protectedTonightBy = null;
    room.protectedTonightAt = null;
    room.lastProtected = null;
    room.seerUsedTonight = {};
    room.seerResultsTonight = {};
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
    room.daNghichState!.wolfVotes = {};
    room.daNghichState!.wolfVotes2 = {};
    room.wolfLocked = {};
    room.daNghichState!.wolfDeadline = null;
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
    clearTrialState(room);

    if (rules.twoHeartsFirstTwoNights) {
      initTwoHeartsForParticipants(room);
    }

    room.spiritWolfId = getSpiritWolfId(room);
    room.spiritWolfDecisionMade = false;
    room.spiritWolfChoseSave = false;
    room.daNghichState!.spiritWolfWolfAligned = false;
    room.daNghichState!.spiritWolfWolfAlignedPending = false;
    room.spiritWolfPendingPoisonedWolfId = null;
    room.daNghichState!.spiritWolfDecisionDeadline = null;
    room.wildWolfConvertedPlayerIds = [];
    room.banSoiId = getBanSoiId(room);
    room.daNghichState!.banSoiWolfAligned = false;
    room.daNghichState!.banSoiWolfAlignedPending = false;
    room.wildWolfId = getWildWolfId(room);
    room.wildWolfConvertReadyNextNight = false;
    room.daNghichState!.wildWolfConvertAvailableTonight = false;
    room.daNghichState!.wildWolfConvertRequestedTonight = false;
    room.wildWolfConvertActorId = null;
    room.wildWolfConvertTargetId = null;
    room.wildWolfConvertUsed = false;
    room.villageChiefPendingWolfDeath = null;
    room.villageChiefExtraVoteAvailable = false;
    room.daNghichState!.villageChiefExtraVoteReady = false;
    room.daNghichState!.villageChiefExtraVoteUsed = false;
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
    room.daNghichState!.elementalSelectedBuffId = null;
    room.elementalSelectedBuffAppliesNight = null;
    room.daNghichState!.elementalBuffQuickMode = true;
    room.angelReviveAvailableByPlayerId = {};
    room.angelReviveUsedPlayerIds = [];
    room.angelReviveRecordsByAngelId = {};
    room.angelHiddenRevivedPlayerIds = [];
    room.angelOutcomeLoggedPlayerIds = [];
    resetMerchantRoundState(room);

    // Reset Soi Mu state
    room.soiMuState!.targets = {};
    room.soiMuState!.thumbDecisions = {};
    room.soiMuState!.locked = {};
    room.soiMuState!.investigatedPlayerId = null;
    room.soiMuState!.investigatedPrevTargetId = null;
    room.soiMuState!.investigationResolved = true;
    room.soiMuState!.daySelectedTargetId = null;
    room.soiMuState!.investigationResult = null;
    room.soiMuState!.hasMerchant = room.gameMode === "soi_mu" && Object.values(room.playerRoles || {}).includes("Tay Buôn");

    // Reset Song Trung state
    room.rolesBeforeConversion = {};
    room.daNghichState!.songTrungChoices = [];
    room.daNghichState!.songTrungUsedTonight = {};
    room.daNghichState!.songTrungVictimId = null;
    room.songTrungRobbedPlayerId = null;
    room.songTrungRobbedOriginalRole = null;
    room.songTrungFoundByVictim = false;
    room.songTrungVictimSearchUsedTonight = {};

    ctx.io.to(roomId).emit("phaseChanged", "dusk");
    clearLoveStateForPlayers(ctx, room, roomId);
    ctx.io.to(roomId).emit("roomUpdated", toPublicRoom(room));
    emitSongTrungRobbedStateToPlayers(ctx, roomId, room);
    ctx.io.to(roomId).emit("gameStarted");
    emitRolesRevealToSocket(roomId, room.hostId);
    emitPublicDayGameLogToRoom(roomId);
    emitGameLogToSocket(roomId, room.hostId);

    checkAndEndGame(roomId, "after_restart_game");
    return true;
  }

  function checkAndEndGame(roomId: string, reason?: string) {
    const room = ctx.rooms[roomId];
    if (!room) return;

    const aliveIds = getAlivePlayerIds(room);
    if (aliveIds.length === 0) {
      if (shouldDeferEndGameForAngel(room)) return;
      endGame(roomId, room, "nobody", reason || "nobody_alive");
      return;
    }

    if (room.gameMode === "soi_mu") {
      const wolvesCount = aliveIds.filter((id) => room.playerRoles?.[id] === "Sói").length;
      const villagersCount = aliveIds.filter((id) => room.playerRoles?.[id] !== "Sói").length;

      if (wolvesCount === 0) {
        endGame(roomId, room, "villagers", reason || "soi_mu_wolves_dead");
        return;
      }

      if (wolvesCount >= villagersCount) {
        endGame(roomId, room, "wolves", reason || "soi_mu_wolves_ge_villagers");
        return;
      }
      return;
    }

    if (room.gameMode === "diet_quy") {
      const dead = new Set(room.deadPlayers || []);

      // Check Phò promotion first!
      const demonAliveBefore = room.players.some((p) => p.id !== room.hostId && room.playerRoles?.[p.id] === "Ác Quỷ" && !dead.has(p.id));
      if (!demonAliveBefore) {
        const phòId = room.players.find((p) => p.id !== room.hostId && room.playerRoles?.[p.id] === "Phò" && !dead.has(p.id))?.id;
        if (phòId) {
          const nonTravelersAlive = room.players.filter((p) => {
            if (p.id === room.hostId) return false;
            if (dead.has(p.id)) return false;
            const role = room.playerRoles?.[p.id];
            return role && !["Người ẩn dật", "Thánh nhân"].includes(role);
          }).length;

          if (nonTravelersAlive >= 4) {
            room.playerRoles = room.playerRoles || {};
            room.playerRoles[phòId] = "Ác Quỷ";
            appendLogEntry(room, {
              type: "role_conversion",
              phase: (room.phase || "day") as GameLogEntryPhase,
              targetId: phòId,
              metadata: { newRole: "Ác Quỷ", reason: "scarlet_woman_promotion" }
            });
            ctx.io.to(phòId).emit("yourRole", "Ác Quỷ");
            ctx.io.to(roomId).emit("roomUpdated", toPublicRoom(room));
          }
        }
      }

      // Check win conditions after potential Phò promotion
      const latestAliveIds = getAlivePlayerIds(room);

      // 1. Saint executed: evil wins
      if (room.dietQuyState!.saintExecutedToday) {
        endGame(roomId, room, "wolves", reason || "saint_executed");
        return;
      }

      // 2. Demon dead: good wins
      const hasDemonAlive = latestAliveIds.some((id) => room.playerRoles?.[id] === "Ác Quỷ");
      if (!hasDemonAlive) {
        endGame(roomId, room, "villagers", reason || "demon_dead");
        return;
      }

      // 3. Only 2 players left: evil wins
      if (latestAliveIds.length <= 2) {
        endGame(roomId, room, "wolves", reason || "demon_survived_top_2");
        return;
      }

      // 4. Mayor win condition: 3 players left, Mayor alive, and no execution today
      const hasMayorAlive = latestAliveIds.some((id) => room.playerRoles?.[id] === "Thị trưởng");
      if (latestAliveIds.length === 3 && hasMayorAlive && !room.dietQuyState!.executedToday) {
        endGame(roomId, room, "villagers", reason || "mayor_survived_no_execution");
        return;
      }

      return;
    }

    const nonWolfAligned = aliveIds.filter(
      (id) => !isWolfAlignedPlayer(room, id)
    );
    const wolfAligned = aliveIds.filter((id) =>
      isWolfAlignedPlayer(room, id)
    );

    const lovePair = getLovePairIds(room);
    if (
      lovePair &&
      room.loveTargetWolfAligned === true &&
      aliveIds.length === 2 &&
      lovePair.every((id) => aliveIds.includes(id))
    ) {
      if (shouldDeferEndGameForAngel(room)) return;
      endGame(roomId, room, "lovers", reason || "love_pair_last_survivors");
      return;
    }

    if (wolfAligned.length === 0) {
      if (shouldDeferEndGameForAngel(room)) return;
      endGame(roomId, room, "villagers", reason || "wolves_eliminated");
      return;
    }

    if (nonWolfAligned.length === 0) {
      if (shouldDeferEndGameForAngel(room)) return;
      endGame(roomId, room, "wolves", reason || "all_villagers_dead");
      return;
    }

    // ponytail: Early end game check for 2 villagers vs 1 wolf during day phase when villagers have no defense
    if (room.phase === "day" && aliveIds.length === 3 && wolfAligned.length === 1 && nonWolfAligned.length === 2) {
      const hasDefense = nonWolfAligned.some((pId) => {
        const role = room.playerRoles?.[pId];

        // 1. Bảo vệ
        if (role === "Bảo vệ") return true;

        // 2. Phù thủy còn bình bất kỳ
        if (role === "Phù thủy") {
          const potions = room.witchPotions?.[pId];
          if (!potions || !potions.healUsed || !potions.poisonUsed) return true;
        }

        // 3. Thợ săn
        if (role === "Thợ săn") return true;

        // 4. Cặp đôi chưa sử dụng "ra khỏi làng"
        const pair = getLovePairIds(room);
        if (pair && pair.includes(pId) && room.loveEscapeUsed !== true) {
          return true;
        }

        // 5. Đang còn lá chắn của Hộ nhân giúp chặn 1 lần chết
        if (room.protectorTargetId === pId) return true;

        return false;
      });

      if (!hasDefense) {
        if (shouldDeferEndGameForAngel(room)) return;
        appendLogEntry(room, {
          type: "custom_log",
          phase: "day",
          message: "Đoản hậu sớm: Phe dân chỉ còn 2 người nhưng cả hai cũng không còn ai có khả năng tự vệ chống lại Sói trong đêm tiếp theo. Sói thắng"
        });
        endGame(roomId, room, "wolves", reason || "wolves_early_win_no_defense");
        return;
      }
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
      if (shouldDeferEndGameForAngel(room)) return;
      endGame(roomId, room, "wolves", reason || "wolves_ge_villagers");
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
