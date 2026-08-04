import assert from "node:assert/strict";
import test from "node:test";
import { createDayFlow } from "../dayFlow.js";
import { setServerContext } from "../serverContext.js";
import type { Room } from "../serverTypes.js";

function createRoom(overrides: Partial<Room> = {}): Room {
  return {
    id: "trial-abstain-room",
    hostId: "host",
    phase: "day",
    nightCount: 1,
    gameOver: false,
    players: [
      { id: "host", name: "Host", connected: true },
      { id: "target", name: "Target", connected: true },
      { id: "live-voter", name: "Live voter", connected: true },
      { id: "blank-voter", name: "Blank voter", connected: true },
    ],
    playerRoles: {
      target: "Dân làng",
      "live-voter": "Dân làng",
      "blank-voter": "Dân làng",
    },
    deadPlayers: [],
    dayVoters: ["target", "live-voter", "blank-voter"],
    trialTargetId: "target",
    trialStage: "verdict",
    trialVotes: {
      "live-voter": "live",
      "blank-voter": "abstain",
    },
    gameLog: [],
    gameEventLog: [],
    daNghichState: {},
    ...overrides,
  } as Room;
}

function finishVerdict(room: Room) {
  const emitted: Array<{ event: string; payload: unknown }> = [];
  const ctx = {
    rooms: { [room.id]: room },
    activeRooms: new Set([room.id]),
    io: {
      to: () => ({
        emit: (event: string, payload: unknown) => emitted.push({ event, payload }),
      }),
    },
  } as any;
  setServerContext(ctx);
  createDayFlow(ctx, { checkAndEndGame: () => {} }).finishTrialVerdict(room.id);
  return emitted.find((entry) => entry.event === "trialVerdictFinished")?.payload as {
    executed: boolean;
    liveVotes: number;
    dieVotes: number;
    abstainVotes: number;
    liveVoterIds: string[];
    dieVoterIds: string[];
    abstainVoterIds: string[];
  };
}

test("trial verdict tallies explicit abstain votes without affecting execution", () => {
  const room = createRoom();
  const payload = finishVerdict(room);

  assert.deepEqual(payload, {
    targetId: "target",
    executed: false,
    liveVotes: 1,
    dieVotes: 0,
    abstainVotes: 1,
    liveVoterIds: ["live-voter"],
    dieVoterIds: [],
    abstainVoterIds: ["blank-voter"],
    chiefRevealed: false,
  });

  const verdictLog = room.gameLog?.[0]?.entries.find((entry) => entry.type === "trial_verdict");
  assert.ok(verdictLog && verdictLog.type === "trial_verdict");
  assert.equal(verdictLog.abstainVotes, 1);
  assert.deepEqual(verdictLog.abstainVoterIds, ["blank-voter"]);
  assert.equal(verdictLog.executed, false);
});

test("trial log records the actual execution result when an unrevealed chief survives", () => {
  const room = createRoom({
    playerRoles: {
      target: "Trưởng làng",
      "live-voter": "Dân làng",
      "blank-voter": "Dân làng",
    },
    trialVotes: {
      "live-voter": "die",
      "blank-voter": "abstain",
    },
  });

  const payload = finishVerdict(room);
  assert.equal(payload.executed, false);

  const verdictLog = room.gameLog?.[0]?.entries.find((entry) => entry.type === "trial_verdict");
  assert.ok(verdictLog && verdictLog.type === "trial_verdict");
  assert.equal(verdictLog.executed, false);

  const verdictEvent = room.gameEventLog?.find((entry) => entry.type === "TRIAL_VERDICT");
  assert.equal(verdictEvent?.metadata?.executed, false);
});
