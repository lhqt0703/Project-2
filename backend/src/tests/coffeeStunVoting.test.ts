import assert from "node:assert/strict";
import test from "node:test";
import { createCoffeeRoleState } from "../coffeeRoles.js";
import { createDayFlow } from "../dayFlow.js";
import { setServerContext, type ServerContext } from "../serverContext.js";
import type { Room } from "../serverTypes.js";
import { registerSocketHandlers } from "../socketHandlers.js";

type EmittedEvent = {
  recipient: string;
  event: string;
  payload: unknown;
};

function createStunnedRoom(overrides: Partial<Room> = {}): Room {
  const coffeeRoleState = createCoffeeRoleState();
  coffeeRoleState.wolfStunnedNight = 1;

  return {
    id: "coffee-stun-vote-room",
    hostId: "host",
    gameMode: "da_nghich",
    phase: "day",
    nightCount: 1,
    gameOver: false,
    players: [
      { id: "host", name: "Host", connected: true },
      { id: "target", name: "Target", connected: true },
      { id: "wolf", name: "Wolf", connected: true },
      { id: "villager", name: "Villager", connected: true },
    ],
    playerRoles: {
      target: "Dân làng",
      wolf: "Sói",
      villager: "Dân làng",
    },
    deadPlayers: [],
    dayVoters: ["target", "wolf", "villager"],
    dayVotes: { target: null, wolf: null, villager: null },
    dayLocked: { target: false, wolf: false, villager: false },
    dayDeadline: Date.now() + 60_000,
    trialStage: "none",
    daNghichState: {},
    coffeeRoleState,
    gameLog: [],
    gameEventLog: [],
    ...overrides,
  } as Room;
}

function createTestContext(room: Room) {
  const emitted: EmittedEvent[] = [];
  const io = {
    to: (recipient: string) => ({
      emit: (event: string, payload: unknown) => emitted.push({ recipient, event, payload }),
    }),
    in: () => ({
      socketsJoin: () => undefined,
      socketsLeave: () => undefined,
    }),
  } as unknown as ServerContext["io"];
  const ctx: ServerContext = {
    io,
    rooms: { [room.id]: room },
    activeRooms: new Set([room.id]),
  };
  setServerContext(ctx);
  return { ctx, emitted };
}

function createSocketHarness(room: Room, clientId = "wolf") {
  const { ctx, emitted } = createTestContext(room);
  const listeners: Record<string, (...args: unknown[]) => void> = {};
  const socketEvents: Array<{ event: string; payload: unknown }> = [];
  const socket = {
    id: `${clientId}-socket`,
    rooms: new Set<string>(),
    on: (event: string, listener: (...args: unknown[]) => void) => {
      listeners[event] = listener;
    },
    emit: (event: string, payload: unknown) => socketEvents.push({ event, payload }),
    join: () => undefined,
    leave: () => undefined,
  };
  const dayFlow = createDayFlow(ctx, { checkAndEndGame: () => undefined });

  registerSocketHandlers({
    socket,
    clientId,
    activeClientSockets: {},
    connectionState: {
      getClientIdFromSocket: () => clientId,
      disconnectedCleanupKey: {},
      clearDisconnectedCleanup: () => undefined,
      isClientCurrentlyConnected: () => true,
      scheduleDisconnectedCleanup: () => undefined,
    },
    lifecycle: { checkAndEndGame: () => undefined },
    dayFlow,
    nightFlow: {},
    elementalFlow: {},
  } as unknown as Parameters<typeof registerSocketHandlers>[0]);

  return { listeners, socketEvents, emitted };
}

test("bắt đầu vote không prefill hoặc khóa phiếu của Sói bị choáng", async () => {
  const room = createStunnedRoom({
    players: [
      { id: "host", name: "Host", connected: true },
      { id: "wolf", name: "Wolf", connected: true },
    ],
    playerRoles: { wolf: "Sói" },
    dayVoters: [],
  });
  const { ctx } = createTestContext(room);
  const flow = createDayFlow(ctx, { checkAndEndGame: () => undefined });

  flow.startDayVoting(room.id);

  assert.equal(room.dayVotes?.wolf, null);
  assert.equal(room.dayLocked?.wolf, false);
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(typeof room.dayDeadline, "number");

  if (room.dayTimer) clearTimeout(room.dayTimer);
  room.dayTimer = null;
});

test("bắt đầu trial không prefill abstain hoặc tự kết thúc vì Sói bị choáng", async () => {
  const room = createStunnedRoom({
    players: [
      { id: "host", name: "Host", connected: true },
      { id: "target", name: "Target", connected: true },
      { id: "wolf", name: "Wolf", connected: true },
    ],
    playerRoles: { target: "Dân làng", wolf: "Sói" },
    dayVoters: ["target", "wolf"],
    trialTargetId: "target",
    trialStage: "defense",
    trialVotes: {},
  });
  const { ctx } = createTestContext(room);
  const flow = createDayFlow(ctx, { checkAndEndGame: () => undefined });

  flow.startTrialVerdictVoting(room.id);

  assert.equal(room.trialVotes?.wolf, null);
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(room.trialStage, "verdict");

  if (room.trialVerdictTimer) clearTimeout(room.trialVerdictTimer);
  room.trialVerdictTimer = null;
});

test("finalize timeout mới mặc định trial abstain cho Sói bị choáng", () => {
  const room = createStunnedRoom({
    trialTargetId: "target",
    trialStage: "verdict",
    trialVotes: { wolf: null, villager: "live" },
  });
  const { ctx, emitted } = createTestContext(room);
  const flow = createDayFlow(ctx, { checkAndEndGame: () => undefined });

  flow.finishTrialVerdict(room.id, { defaultStunnedAbstain: true });

  const payload = emitted.find((entry) => entry.event === "trialVerdictFinished")?.payload as {
    liveVoterIds: string[];
    abstainVoterIds: string[];
    abstainVotes: number;
  };
  assert.deepEqual(payload.liveVoterIds, ["villager"]);
  assert.deepEqual(payload.abstainVoterIds, ["wolf"]);
  assert.equal(payload.abstainVotes, 1);

  const hostForceRoom = createStunnedRoom({
    id: "coffee-stun-host-force-room",
    trialTargetId: "target",
    trialStage: "verdict",
    trialVotes: { wolf: null, villager: "live" },
  });
  const { ctx: hostForceCtx, emitted: hostForceEmitted } = createTestContext(hostForceRoom);
  createDayFlow(hostForceCtx, { checkAndEndGame: () => undefined }).finishTrialVerdict(hostForceRoom.id);
  const hostForcePayload = hostForceEmitted.find((entry) => entry.event === "trialVerdictFinished")?.payload as {
    abstainVoterIds: string[];
    abstainVotes: number;
  };
  assert.deepEqual(hostForcePayload.abstainVoterIds, []);
  assert.equal(hostForcePayload.abstainVotes, 0);
});

test("finalize day loại bỏ mọi target không hợp lệ còn sót lại của Sói bị choáng", () => {
  const room = createStunnedRoom({
    dayVotes: { target: null, wolf: "villager", villager: null },
    dayLocked: { target: false, wolf: false, villager: false },
  });
  const { ctx } = createTestContext(room);
  const flow = createDayFlow(ctx, { checkAndEndGame: () => undefined });

  flow.finishDayVoting(room.id);

  assert.equal(room.dayVotes?.wolf, null);
  assert.equal(room.dayLocked?.wolf, true);
  const voteEvent = room.gameEventLog?.find((entry) => entry.type === "DAY_VOTE");
  assert.equal((voteEvent?.metadata?.votes as Record<string, string | null> | undefined)?.wolf, null);
});

test("socket chỉ cho Sói bị choáng chốt phiếu trống, vote live/abstain và cấm tương tác trial", () => {
  const room = createStunnedRoom();
  const { listeners, socketEvents } = createSocketHarness(room);
  const errors = () => socketEvents.filter((entry) => entry.event === "errorMessage");

  listeners.dayChooseTarget?.({ roomId: room.id, targetId: "villager" });
  assert.equal(room.dayVotes?.wolf, null);
  assert.equal(errors().length, 1);

  socketEvents.length = 0;
  listeners.dayChooseTarget?.({ roomId: room.id, targetId: null });
  listeners.dayLockVote?.({ roomId: room.id });
  assert.equal(room.dayVotes?.wolf, null);
  assert.equal(room.dayLocked?.wolf, true);
  assert.equal(errors().length, 0);

  room.dayLocked!.wolf = false;
  room.dayVotes!.wolf = "villager";
  listeners.dayLockVote?.({ roomId: room.id });
  assert.equal(room.dayLocked?.wolf, false);
  assert.equal(errors().length, 1);

  socketEvents.length = 0;
  room.dayDeadline = null;
  room.trialTargetId = "target";
  room.trialStage = "defense";
  room.trialInteractionCut = false;
  room.trialInteractionActiveIds = [];
  room.trialInteractionQueuedIds = [];
  room.trialSelectedInteractorIds = [];
  listeners.trialToggleInteraction?.({ roomId: room.id, active: true });
  assert.deepEqual(room.trialInteractionActiveIds, []);
  assert.deepEqual(room.trialInteractionQueuedIds, []);
  assert.equal(errors().length, 1);

  socketEvents.length = 0;
  room.trialStage = "verdict";
  room.trialVerdictDeadline = Date.now() + 60_000;
  room.trialVotes = { wolf: null, villager: null };
  listeners.trialVoteLifeDeath?.({ roomId: room.id, vote: "die" });
  assert.equal(room.trialVotes.wolf, null);
  assert.equal(errors().length, 1);

  socketEvents.length = 0;
  listeners.trialVoteLifeDeath?.({ roomId: room.id, vote: "live" });
  assert.equal(room.trialVotes.wolf, "live");
  assert.equal(errors().length, 0);

  listeners.trialVoteLifeDeath?.({ roomId: room.id, vote: "die" });
  assert.equal(room.trialVotes.wolf, "live");
  assert.equal(errors().length, 1);

  socketEvents.length = 0;
  listeners.trialVoteLifeDeath?.({ roomId: room.id, vote: "abstain" });
  assert.equal(room.trialVotes.wolf, "abstain");
  assert.equal(errors().length, 0);
});

test("không thể pause đúng mốc 0 để trì hoãn phiếu trống mặc định", () => {
  const room = createStunnedRoom({
    dayDeadline: null,
    trialTargetId: "target",
    trialStage: "verdict",
    trialVerdictDeadline: Date.now() - 1,
    trialVotes: { wolf: null, villager: "live" },
  });
  const { listeners, emitted } = createSocketHarness(room, "host");

  listeners.hostToggleDayPause?.({ roomId: room.id });

  assert.notEqual(room.dayPaused, true);
  const payload = emitted.find((entry) => entry.event === "trialVerdictFinished")?.payload as {
    abstainVoterIds: string[];
  };
  assert.deepEqual(payload.abstainVoterIds, ["wolf"]);
});
