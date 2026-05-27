import type { ServerContext } from "./serverContext.js";
import { appendLogEntry, buildDayVoteBreakdown } from "./gameLog.js";
import { appendGameEvent } from "./gameEvent.js";
import { resolveHunterShotsForDeaths } from "./hunter.js";
import { emitGameLogToSocket, toPublicRoom } from "./serverEmitters.js";
import { clearTrialState, getActiveDayVoters, getAlivePlayerIds, getTrialVoters } from "./roomState.js";
import { ensureRoomGameRules, type EliminationCause, type Room } from "./serverTypes.js";
import { markEliminatedWithLoveChain } from "./love.js";
import {
  getDayVoteWeight,
  getVillageChiefId,
  isVillageChief,
  isVillageChiefRevealed,
  revealRolePublicly,
} from "./specialRoles.js";

type DayFlowDeps = {
  checkAndEndGame: (roomId: string, reason?: string) => void;
};

export function createDayFlow(ctx: ServerContext, deps: DayFlowDeps) {
  function emitPublicRoleReveal(roomId: string, room: Room) {
    ctx.io.to(roomId).emit("publicRolesRevealUpdated", {
      roomId,
      rolesByPlayerId: room.publicRevealedRolesByPlayerId || {},
    });
    ctx.io.to(roomId).emit("roomUpdated", toPublicRoom(room));
  }

  function markVillageChiefExtraVoteReady(room: Room) {
    if (!room.villageChiefExtraVoteAvailable || room.villageChiefExtraVoteUsed) return;
    room.villageChiefExtraVoteReady = true;
  }

  function clearFinishedDayVoteKind(room: Room) {
    if (room.dayVoteKind === "village_chief_extra") {
      room.villageChiefExtraVoteAvailable = false;
      room.villageChiefExtraVoteReady = false;
      room.villageChiefExtraVoteUsed = true;
      room.dayVoteKind = "main";
      return;
    }
    markVillageChiefExtraVoteReady(room);
  }

  function buildTrialInteractionUpdatedPayload(room: Room) {
    const selectedIds = room.trialSelectedInteractorIds || [];
    const selectionLimit = Math.max(0, room.trialInteractionSelectionLimit || 0);
    return {
      activeIds: room.trialInteractionActiveIds || [],
      selectedId: room.trialSelectedInteractorId || null,
      selectedIds,
      selectionLimit,
      selectionCount: selectedIds.length,
      interactionCut: room.trialInteractionCut === true,
    };
  }

  function startTrialVerdictVoting(roomId: string) {
    const room = ctx.rooms[roomId];
    if (!room) return;
    if (room.gameOver) return;
    if (room.phase !== "day") return;
    if (!room.trialTargetId) return;

    if (room.trialDefenseTimer) {
      clearTimeout(room.trialDefenseTimer);
      room.trialDefenseTimer = null;
    }
    if (room.trialVerdictTimer) {
      clearTimeout(room.trialVerdictTimer);
      room.trialVerdictTimer = null;
    }

    room.trialStage = "verdict";
    room.trialInteractionCut = true;
    room.trialInteractionActiveIds = [];
    room.trialSelectedInteractorId = null;
    room.trialSelectedInteractorIds = [];
    room.trialInteractionQueuedIds = [];
    room.trialDefenseDeadline = null;
    room.trialVerdictDeadline = Date.now() + 20_000;

    const voters = getTrialVoters(room);
    room.trialVotes = room.trialVotes || {};
    voters.forEach((vid) => {
      if (typeof room.trialVotes?.[vid] === "undefined") {
        room.trialVotes![vid] = null;
      }
    });

    ctx.io.to(roomId).emit("trialVerdictStarted", {
      targetId: room.trialTargetId,
      voters,
      deadline: room.trialVerdictDeadline,
    });
    ctx.io.to(roomId).emit("trialVotesUpdated", room.trialVotes);
    ctx.io.to(roomId).emit("roomUpdated", toPublicRoom(room));

    room.trialVerdictTimer = setTimeout(() => {
      finishTrialVerdict(roomId);
    }, 20_000);
  }

  function finishTrialVerdict(roomId: string) {
    const room = ctx.rooms[roomId];
    if (!room) return;
    if (room.gameOver) return;
    if (room.phase !== "day") return;

    const targetId = room.trialTargetId;
    if (!targetId) return;

    if (room.trialVerdictTimer) {
      clearTimeout(room.trialVerdictTimer);
      room.trialVerdictTimer = null;
    }
    if (room.trialDefenseTimer) {
      clearTimeout(room.trialDefenseTimer);
      room.trialDefenseTimer = null;
    }

    const voters = getTrialVoters(room);
    const votes = room.trialVotes || {};

    let liveVotes = 0;
    let dieVotes = 0;
    const liveVoterIds: string[] = [];
    const dieVoterIds: string[] = [];
    for (const vid of voters) {
      const v = votes[vid];
      if (v === "live") {
        liveVotes += getDayVoteWeight(room, vid);
        liveVoterIds.push(vid);
      } else if (v === "die") {
        dieVotes += getDayVoteWeight(room, vid);
        dieVoterIds.push(vid);
      }
    }

    const votedToExecute = dieVotes > liveVotes;
    const chiefSurvivesByReveal =
      votedToExecute &&
      isVillageChief(room, targetId) &&
      !isVillageChiefRevealed(room, targetId);
    const executed = votedToExecute && !chiefSurvivesByReveal;

    appendLogEntry(room, {
      type: "trial_verdict",
      phase: "day",
      targetId,
      liveVotes,
      dieVotes,
      liveVoterIds,
      dieVoterIds,
      executed: votedToExecute,
    });
    appendGameEvent(room, {
      type: "TRIAL_VERDICT",
      phase: "day",
      targetIds: [targetId],
      metadata: {
        executed: votedToExecute,
        liveVotes,
        dieVotes,
        liveVoterIds,
        dieVoterIds,
      },
    });

    if (chiefSurvivesByReveal) {
      revealRolePublicly(room, targetId);
      appendLogEntry(room, {
        type: "village_chief_revealed",
        phase: "day",
        targetId,
        reason: "day_vote",
      });
      emitPublicRoleReveal(roomId, room);
    }

    if (executed && !((room.deadPlayers || []).includes(targetId))) {
      const eliminatedIds: string[] = [];
      const causesByTarget: Record<string, EliminationCause[]> = {};
      const loveLinkDeaths: { sourceId: string; targetId: string }[] = [];
      markEliminatedWithLoveChain(ctx, roomId, room, targetId, { type: "trial_verdict", voterIds: dieVoterIds }, "day", {
        eliminatedIds,
        causesByTarget,
        loveLinkDeaths,
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
        targetIds: eliminatedIds,
        causesByTarget,
      });

      resolveHunterShotsForDeaths(ctx, roomId, room, eliminatedIds, "day");
    }

    ctx.io.to(roomId).emit("trialVerdictFinished", {
      targetId,
      executed,
      liveVotes,
      dieVotes,
      chiefRevealed: chiefSurvivesByReveal,
    });

    clearTrialState(room);
    clearFinishedDayVoteKind(room);
    ctx.io.to(roomId).emit("roomUpdated", toPublicRoom(room));

    deps.checkAndEndGame(roomId, "after_trial_verdict");

    if (room.hostId) {
      emitGameLogToSocket(roomId, room.hostId);
    }
  }

  function startTrialDefense(roomId: string, targetId: string) {
    const room = ctx.rooms[roomId];
    if (!room) return;
    if (room.gameOver) return;
    if (room.phase !== "day") return;
    const rules = ensureRoomGameRules(room);

    clearTrialState(room);

    room.trialTargetId = targetId;
    room.trialStage = "defense";
    room.trialDefenseDeadline = Date.now() + 120_000;
    room.trialInteractionCut = false;
    room.trialInteractionActiveIds = [];
    room.trialSelectedInteractorId = null;
    room.trialSelectedInteractorIds = [];
    room.trialInteractionSelectionLimit = rules.trialInteractionSelectionLimit;
    room.trialInteractionQueuedIds = [];
    room.trialVotes = {};

    appendLogEntry(room, { type: "trial_started", phase: "day", targetId });

    ctx.io.to(roomId).emit("trialPhaseStarted", {
      targetId,
      stage: "defense",
      defenseDeadline: room.trialDefenseDeadline,
      selectionLimit: room.trialInteractionSelectionLimit,
    });
    ctx.io.to(roomId).emit("trialInteractionUpdated", buildTrialInteractionUpdatedPayload(room));
    ctx.io.to(roomId).emit("roomUpdated", toPublicRoom(room));

    room.trialDefenseTimer = setTimeout(() => {
      startTrialVerdictVoting(roomId);
    }, 120_000);
  }

  function startDayVoting(roomId: string, opts?: { kind?: "main" | "village_chief_extra" }) {
    const room = ctx.rooms[roomId];
    if (!room) return;
    if (room.gameOver) return;

    if (room.dayDiscussionTimer) {
      clearTimeout(room.dayDiscussionTimer);
      room.dayDiscussionTimer = null;
    }
    room.dayDiscussionDeadline = null;
    ctx.io.to(roomId).emit("dayDiscussionStarted", { deadline: null });

    if (room.dayTimer) {
      clearTimeout(room.dayTimer);
      room.dayTimer = null;
    }

    clearTrialState(room);

    const voters = getAlivePlayerIds(room);
    room.dayVoters = voters;
    room.dayVotes = {};
    room.dayLocked = {};
    room.dayVoteKind = opts?.kind || "main";
    voters.forEach((id) => {
      room.dayVotes![id] = null;
      room.dayLocked![id] = false;
    });

    room.dayDeadline = Date.now() + 45_000;

    ctx.io.to(roomId).emit("dayPhaseStarted", {
      voters: getActiveDayVoters(room),
      deadline: room.dayDeadline,
      kind: room.dayVoteKind,
    });
    ctx.io.to(roomId).emit("dayVotesUpdated", room.dayVotes);
    ctx.io.to(roomId).emit("dayLockedUpdated", room.dayLocked);
    ctx.io.to(roomId).emit("roomUpdated", toPublicRoom(room));

    room.dayTimer = setTimeout(() => {
      finishDayVoting(roomId);
    }, 45_000);
  }

  function startDayDiscussion(roomId: string) {
    const room = ctx.rooms[roomId];
    if (!room) return;
    if (room.phase !== "day") return;
    if (room.gameOver) return;

    if (room.dayTimer) {
      clearTimeout(room.dayTimer);
      room.dayTimer = null;
    }
    if (room.dayDiscussionTimer) {
      clearTimeout(room.dayDiscussionTimer);
      room.dayDiscussionTimer = null;
    }

    clearTrialState(room);

    room.dayVoters = [];
    room.dayVotes = {};
    room.dayLocked = {};
    room.dayDeadline = null;
    room.dayDiscussionDeadline = Date.now() + 240_000;

    ctx.io.to(roomId).emit("dayDiscussionStarted", {
      deadline: room.dayDiscussionDeadline,
    });
    ctx.io.to(roomId).emit("dayVotesUpdated", room.dayVotes);
    ctx.io.to(roomId).emit("dayLockedUpdated", room.dayLocked);
    ctx.io.to(roomId).emit("roomUpdated", toPublicRoom(room));

    room.dayDiscussionTimer = setTimeout(() => {
      startDayVoting(roomId);
    }, 240_000);
  }

  function finishDayVoting(roomId: string) {
    const room = ctx.rooms[roomId];
    if (!room) return;
    if (room.phase !== "day") return;
    if (room.gameOver) return;
    if (room.trialStage && room.trialStage !== "none") return;
    if (!room.dayDeadline) return;

    if (room.dayTimer) {
      clearTimeout(room.dayTimer);
      room.dayTimer = null;
    }

    const votes = room.dayVotes || {};
    const activeVoters = getActiveDayVoters(room);
    const dayVoteBreakdown = buildDayVoteBreakdown(room, votes);
    const voteWasSkipped = dayVoteBreakdown.type === "day_vote" && dayVoteBreakdown.voteBreakdown.length === 0;

    if (voteWasSkipped) {
      appendLogEntry(room, { type: "day_vote_skipped", phase: "day" });
    } else {
      appendLogEntry(room, dayVoteBreakdown);
    }

    const counts: Record<string, number> = {};
    for (const voterId of activeVoters) {
      const target = votes[voterId];
      if (!target) continue;
      counts[target] = (counts[target] || 0) + getDayVoteWeight(room, voterId);
    }

    const entries = Object.entries(counts);
    let executedId: string | null = null;
    let tie = false;
    if (entries.length > 0) {
      entries.sort((a, b) => b[1] - a[1]);
      if (entries.length > 1 && entries[0]![1] === entries[1]![1]) {
        tie = true;
      } else {
        executedId = entries[0]![0];
      }
    }

    if (!voteWasSkipped) {
      appendLogEntry(room, { type: "day_result", phase: "day", targetId: executedId, tie });
    }
    appendGameEvent(room, {
      type: "DAY_VOTE",
      phase: "day",
      targetIds: executedId ? [executedId] : [],
      metadata: {
        tie,
        skipped: voteWasSkipped,
        votes,
        voteKind: room.dayVoteKind || "main",
      },
    });

    for (const voterId of activeVoters) {
      room.dayLocked = room.dayLocked || {};
      room.dayLocked[voterId] = true;
    }
    room.dayDiscussionDeadline = null;
    room.dayDeadline = null;

    ctx.io.to(roomId).emit("dayVotesUpdated", room.dayVotes || {});
    ctx.io.to(roomId).emit("dayLockedUpdated", room.dayLocked || {});
    ctx.io.to(roomId).emit("dayVoteFinished", { targetId: executedId, tie, startedTrial: !!executedId });
    ctx.io.to(roomId).emit("roomUpdated", toPublicRoom(room));

    if (executedId) {
      startTrialDefense(roomId, executedId);
    } else {
      clearFinishedDayVoteKind(room);
      ctx.io.to(roomId).emit("roomUpdated", toPublicRoom(room));
      deps.checkAndEndGame(roomId, "after_day_vote_no_nominee");
    }

    if (room.hostId) {
      emitGameLogToSocket(roomId, room.hostId);
    }
  }

  return {
    buildTrialInteractionUpdatedPayload,
    startTrialVerdictVoting,
    finishTrialVerdict,
    startTrialDefense,
    startDayVoting,
    startDayDiscussion,
    finishDayVoting,
    startVillageChiefExtraVoting(roomId: string, chiefId: string) {
      const room = ctx.rooms[roomId];
      if (!room) return;
      if (room.gameOver) return;
      if (room.phase !== "day") return;
      if (room.dayDeadline || room.dayDiscussionDeadline) return;
      if (room.trialStage && room.trialStage !== "none") return;
      if (!room.villageChiefExtraVoteReady || room.villageChiefExtraVoteUsed) return;
      if ((room.deadPlayers || []).includes(chiefId)) return;
      if (getVillageChiefId(room) !== chiefId) return;

      room.villageChiefExtraVoteReady = false;
      room.villageChiefExtraVoteAvailable = false;
      room.villageChiefExtraVoteUsed = true;

      appendLogEntry(room, {
        type: "village_chief_extra_vote_started",
        phase: "day",
        chiefId,
      });
      appendGameEvent(room, {
        type: "VILLAGE_CHIEF_EXTRA_VOTE",
        phase: "day",
        actorIds: [chiefId],
      });

      startDayVoting(roomId, { kind: "village_chief_extra" });
    },
  };
}
