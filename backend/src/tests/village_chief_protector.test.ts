import test from "node:test";
import assert from "node:assert";
import { registerSocketHandlers } from "../socketHandlers.js";
import { setServerContext } from "../serverContext.js";
import { createLifecycleFlow } from "../lifecycle.js";
import { createDayFlow } from "../dayFlow.js";
import { createNightFlow } from "../nightFlow.js";
import { createElementalFlow } from "../elementalFlow.js";
import type { Room } from "../serverTypes.js";

// Mock socket.io and connection state
const mockIo = {
  to: () => ({
    emit: () => {},
  }),
  in: () => ({
    socketsJoin: () => {},
    socketsLeave: () => {},
  }),
} as any;

const mockConnectionState = {
  getClientIdFromSocket: () => "chief_1",
  disconnectedCleanupKey: {},
  clearDisconnectedCleanup: () => {},
  isClientCurrentlyConnected: () => true,
  scheduleDisconnectedCleanup: () => {},
};

const createMockRoom = (): Room => {
  return {
    id: "test_chief_room",
    hostId: "host_1",
    phase: "night",
    nightCount: 1,
    players: [
      { id: "chief_1", name: "Chief", connected: true },
      { id: "protector_1", name: "Protector", connected: true },
      { id: "villager_1", name: "Villager", connected: true },
      { id: "wolf_1", name: "Wolf", connected: true },
      { id: "host_1", name: "Host", connected: true },
    ],
    playerRoles: {
      chief_1: "Trưởng làng",
      protector_1: "Hộ nhân",
      villager_1: "Dân làng",
      wolf_1: "Sói",
      host_1: "Dân làng",
    },
    roles: ["Trưởng làng", "Hộ nhân", "Dân làng", "Sói"],
    deadPlayers: [],
    gameLog: [],
    gameOver: false,
    gameRules: {
      twoHeartsFirstTwoNights: false,
      forceWolfBiteFirstNight: false,
      allNightActionsSimultaneous: true,
      witchSeeBiteOnlyIfHasHealPotion: true,
      witchBonusTimeRequiresUsablePotion: true,
      witchHideProtectedBiteInSimultaneous: false,
      witchHideProtectedBiteWhenSequential: true,
      trialInteractionSelectionLimit: 2,
      nonWolfNightActionDurationSec: 20,
      wolfNightActionDurationSec: 20,
      nightActionOrder: [],
      banSoiBecomeWolfEvenIfHealed: false,
      loveCanChoosePartnerFirstTwoNights: false,
      villageChiefKnowsWolfBite: true,
      witchSeeProtectorImmortalBite: true,
      hunterShotPublicInDay: true,
      merchantSingleUseItems: false,
      merchantWinRequiredSuccessfulTrades: 3,
      merchantHideReceivedItemName: false,
      loveEscapeImmuneSimultaneous: true,
      wolfCanBiteWolf: false,
      villageChiefCanFindProtector: true,
    },
  };
};

test("Chief Protector Search and Shield Redirection", async (t) => {
  const rooms: Record<string, Room> = {};
  const activeRooms = new Set<string>();
  const ctx = {
    io: mockIo,
    rooms,
    activeRooms,
  } as any;

  setServerContext(ctx);

  const lifecycle = createLifecycleFlow(ctx);
  const elementalFlow = createElementalFlow(ctx);
  const dayFlow = createDayFlow(ctx, { checkAndEndGame: lifecycle.checkAndEndGame });
  const nightFlow = createNightFlow(ctx, {
    checkAndEndGame: lifecycle.checkAndEndGame,
    emitElementalNightState: elementalFlow.emitElementalNightState,
    resolveElementalBuffVote: elementalFlow.resolveElementalBuffVote,
  });

  await t.test("Chief Check Event works correctly", () => {
    const room = createMockRoom();
    rooms[room.id] = room;

    const socketListeners: Record<string, Function> = {};
    const mockSocket = {
      rooms: new Set(),
      on: (event: string, cb: Function) => {
        socketListeners[event] = cb;
      },
      emit: (event: string, payload: any) => {
        if (event === "chiefCheckResult") {
          mockSocket.lastResult = payload;
        }
      },
    } as any;

    registerSocketHandlers({
      socket: mockSocket,
      clientId: "chief_1",
      activeClientSockets: new Map(),
      connectionState: mockConnectionState,
      lifecycle,
      dayFlow,
      nightFlow,
      elementalFlow,
    } as any);

    // 1. Check a non-protector player
    socketListeners.chiefCheck?.({ roomId: room.id, targetId: "villager_1" });
    assert.strictEqual(mockSocket.lastResult?.isProtector, false);
    assert.ok(!room.chiefFoundProtectorId);
    assert.strictEqual(room.chiefUsedTonight?.chief_1, true);

    // Reset chiefUsedTonight for the next check (simulating next night)
    room.chiefUsedTonight = {};

    // 2. Check the protector
    socketListeners.chiefCheck?.({ roomId: room.id, targetId: "protector_1" });
    assert.strictEqual(mockSocket.lastResult?.isProtector, true);
    assert.strictEqual(room.chiefFoundProtectorId, "protector_1");
  });

  await t.test("Wolf Bite Redirection from Protector to Chief", () => {
    const room = createMockRoom();
    rooms[room.id] = room;

    // Set Chief has found the Protector
    room.chiefFoundProtectorId = "protector_1";

    // Wolves vote to bite the Protector
    room.daNghichState!.wolfVotes = {
      wolf_1: "protector_1",
    };

    const socketListeners: Record<string, Function> = {};
    const mockSocket = {
      rooms: new Set(),
      on: (event: string, cb: Function) => {
        socketListeners[event] = cb;
      },
      emit: () => {},
    } as any;

    registerSocketHandlers({
      socket: mockSocket,
      clientId: "chief_1",
      activeClientSockets: new Map(),
      connectionState: mockConnectionState,
      lifecycle,
      dayFlow,
      nightFlow,
      elementalFlow,
    } as any);

    // Change phase to day to resolve night actions
    socketListeners.changePhase?.({ roomId: room.id, phase: "day" });

    // Protector should be alive and Chief should be bitten (delayed bite)
    assert.ok(!(room.deadPlayers || []).includes("protector_1"));
    assert.ok(!(room.deadPlayers || []).includes("chief_1"));
    assert.deepStrictEqual(room.villageChiefPendingWolfDeath?.playerId, "chief_1");

    // Check if the shield redirection log was appended
    const nightLog = room.gameLog?.find((n) => n.night === 1);
    const shieldLog = nightLog?.entries.find(
      (e: any) => e.type === "custom_log" && e.message.includes("đỡ thay vết cắn")
    );
    assert.ok(shieldLog);
  });
});
