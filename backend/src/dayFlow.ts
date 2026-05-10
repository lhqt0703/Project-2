import type { ServerContext } from "./serverContext.js";
import { appendLogEntry, buildDayVoteBreakdown } from "./gameLog.js";
import { resolveHunterShotsForDeaths } from "./hunter.js";
import { emitGameLogToSocket, toPublicRoom } from "./serverEmitters.js";
import { clearTrialState, getActiveDayVoters, getAlivePlayerIds, getTrialVoters } from "./roomState.js";
import { ensureRoomGameRules, type Room } from "./serverTypes.js";

type DayFlowDeps = {
  checkAndEndGame: (roomId: string, reason?: string) => void;
};

export function createDayFlow(ctx: ServerContext, deps: DayFlowDeps) {
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
        liveVotes += 1;
        liveVoterIds.push(vid);
      } else if (v === "die") {
        dieVotes += 1;
        dieVoterIds.push(vid);
      }
    }

    const executed = dieVotes > liveVotes;

    appendLogEntry(room, {
      type: "trial_verdict",
      phase: "day",
      targetId,
      liveVotes,
      dieVotes,
      liveVoterIds,
      dieVoterIds,
      executed,
    });

    if (executed && !((room.deadPlayers || []).includes(targetId))) {
      room.deadPlayers = room.deadPlayers || [];
      room.deadPlayers.push(targetId);
      ctx.io.to(roomId).emit("playerKilled", targetId);

      appendLogEntry(room, {
        type: "eliminated",
        phase: "day",
        targetIds: [targetId],
        causesByTarget: {
          [targetId]: [{ type: "trial_verdict", voterIds: dieVoterIds }],
        },
      });

      resolveHunterShotsForDeaths(ctx, roomId, room, [targetId], "day");
    }

    ctx.io.to(roomId).emit("trialVerdictFinished", {
      targetId,
      executed,
      liveVotes,
      dieVotes,
    });

    clearTrialState(room);
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

  function startDayVoting(roomId: string) {
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
    voters.forEach((id) => {
      room.dayVotes![id] = null;
      room.dayLocked![id] = false;
    });

    room.dayDeadline = Date.now() + 45_000;

    ctx.io.to(roomId).emit("dayPhaseStarted", {
      voters: getActiveDayVoters(room),
      deadline: room.dayDeadline,
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

    appendLogEntry(room, buildDayVoteBreakdown(room, votes));

    const counts: Record<string, number> = {};
    for (const voterId of activeVoters) {
      const target = votes[voterId];
      if (!target) continue;
      counts[target] = (counts[target] || 0) + 1;
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

    appendLogEntry(room, { type: "day_result", phase: "day", targetId: executedId, tie });

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
  };
}
