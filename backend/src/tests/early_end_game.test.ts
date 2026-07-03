import test from "node:test";
import assert from "node:assert";
import { createLifecycleFlow } from "../lifecycle.js";
import { setServerContext } from "../serverContext.js";
import type { Room } from "../serverTypes.js";

// Mock socket.io
const mockIo = {
  to: () => ({
    emit: () => {},
  }),
  in: () => ({
    socketsJoin: () => {},
    socketsLeave: () => {},
  }),
} as any;

test("Early End Game logic verification", async (t) => {
  const rooms: Record<string, Room> = {};
  const ctx = {
    io: mockIo,
    rooms,
    activeRooms: new Set<string>(),
  } as any;

  setServerContext(ctx);
  const { checkAndEndGame } = createLifecycleFlow(ctx);

  await t.test("Case 1: 2 villagers (Seer, Village Chief) and 1 Wolf. No defense -> Wolves win early during day", () => {
    const roomId = "room_case_1";
    const room: Room = {
      id: roomId,
      hostId: "host_1",
      phase: "day",
      nightCount: 1,
      players: [
        { id: "p1", name: "Seer", connected: true },
        { id: "p2", name: "Village Chief", connected: true },
        { id: "p3", name: "Wolf", connected: true },
        { id: "host_1", name: "Host", connected: true },
      ],
      playerRoles: {
        p1: "Tiên tri",
        p2: "Trưởng làng",
        p3: "Sói",
        host_1: "Dân làng",
      },
      deadPlayers: [],
      gameLog: [],
      gameOver: false,
    };
    rooms[roomId] = room;

    checkAndEndGame(roomId, "test_check");

    assert.strictEqual(room.gameOver, true);
    assert.strictEqual(room.winner, "wolves");
    
    // Check if custom log was appended
    const nightLog = room.gameLog?.find((n) => n.night === 1);
    const customLog = nightLog?.entries.find((e) => e.type === "custom_log");
    assert.ok(customLog);
    assert.match((customLog as any).message, /Đoản hậu sớm/);
  });

  await t.test("Case 2: 2 villagers (Hunter, Seer) and 1 Wolf. Hunter is alive -> No early win", () => {
    const roomId = "room_case_2";
    const room: Room = {
      id: roomId,
      hostId: "host_1",
      phase: "day",
      nightCount: 1,
      players: [
        { id: "p1", name: "Hunter", connected: true },
        { id: "p2", name: "Seer", connected: true },
        { id: "p3", name: "Wolf", connected: true },
        { id: "host_1", name: "Host", connected: true },
      ],
      playerRoles: {
        p1: "Thợ săn",
        p2: "Tiên tri",
        p3: "Sói",
        host_1: "Dân làng",
      },
      deadPlayers: [],
      gameLog: [],
      gameOver: false,
    };
    rooms[roomId] = room;

    checkAndEndGame(roomId, "test_check");

    // Game should NOT be over because Hunter can retaliate
    assert.strictEqual(room.gameOver, false);
  });

  await t.test("Case 3: 2 villagers (Bodyguard, Seer) and 1 Wolf. Bodyguard is alive -> No early win", () => {
    const roomId = "room_case_3";
    const room: Room = {
      id: roomId,
      hostId: "host_1",
      phase: "day",
      nightCount: 1,
      players: [
        { id: "p1", name: "Bodyguard", connected: true },
        { id: "p2", name: "Seer", connected: true },
        { id: "p3", name: "Wolf", connected: true },
        { id: "host_1", name: "Host", connected: true },
      ],
      playerRoles: {
        p1: "Bảo vệ",
        p2: "Tiên tri",
        p3: "Sói",
        host_1: "Dân làng",
      },
      deadPlayers: [],
      gameLog: [],
      gameOver: false,
    };
    rooms[roomId] = room;

    checkAndEndGame(roomId, "test_check");

    // Game should NOT be over because Bodyguard can defend
    assert.strictEqual(room.gameOver, false);
  });

  await t.test("Case 4: 2 villagers (Witch with potions, Seer) and 1 Wolf -> No early win", () => {
    const roomId = "room_case_4";
    const room: Room = {
      id: roomId,
      hostId: "host_1",
      phase: "day",
      nightCount: 1,
      players: [
        { id: "p1", name: "Witch", connected: true },
        { id: "p2", name: "Seer", connected: true },
        { id: "p3", name: "Wolf", connected: true },
        { id: "host_1", name: "Host", connected: true },
      ],
      playerRoles: {
        p1: "Phù thủy",
        p2: "Tiên tri",
        p3: "Sói",
        host_1: "Dân làng",
      },
      witchPotions: {
        p1: { healUsed: false, poisonUsed: false },
      },
      deadPlayers: [],
      gameLog: [],
      gameOver: false,
    };
    rooms[roomId] = room;

    checkAndEndGame(roomId, "test_check");

    // Game should NOT be over because Witch has potions
    assert.strictEqual(room.gameOver, false);
  });

  await t.test("Case 5: 2 villagers (Witch with no potions, Seer) and 1 Wolf -> Wolves win early", () => {
    const roomId = "room_case_5";
    const room: Room = {
      id: roomId,
      hostId: "host_1",
      phase: "day",
      nightCount: 1,
      players: [
        { id: "p1", name: "Witch", connected: true },
        { id: "p2", name: "Seer", connected: true },
        { id: "p3", name: "Wolf", connected: true },
        { id: "host_1", name: "Host", connected: true },
      ],
      playerRoles: {
        p1: "Phù thủy",
        p2: "Tiên tri",
        p3: "Sói",
        host_1: "Dân làng",
      },
      witchPotions: {
        p1: { healUsed: true, poisonUsed: true },
      },
      deadPlayers: [],
      gameLog: [],
      gameOver: false,
    };
    rooms[roomId] = room;

    checkAndEndGame(roomId, "test_check");

    // Game should end because Witch has no potions left
    assert.strictEqual(room.gameOver, true);
    assert.strictEqual(room.winner, "wolves");
  });

  await t.test("Case 6: 2 villagers (Lovers with escape unused, Wolf) -> No early win", () => {
    const roomId = "room_case_6";
    const room: Room = {
      id: roomId,
      hostId: "host_1",
      phase: "day",
      nightCount: 1,
      players: [
        { id: "p1", name: "Cupid Lover", connected: true },
        { id: "p2", name: "Target Lover", connected: true },
        { id: "p3", name: "Wolf", connected: true },
      ],
      playerRoles: {
        p1: "Thần tình yêu",
        p2: "Dân làng",
        p3: "Sói",
      },
      loveCupidId: "p1",
      loveTargetId: "p2",
      loveEscapeUsed: false,
      deadPlayers: [],
      gameLog: [],
      gameOver: false,
    };
    rooms[roomId] = room;

    checkAndEndGame(roomId, "test_check");

    // Game should NOT end because lovers can escape tonight
    assert.strictEqual(room.gameOver, false);
  });

  await t.test("Case 7: 2 villagers (Lovers with escape used, Wolf) -> Wolves win early", () => {
    const roomId = "room_case_7";
    const room: Room = {
      id: roomId,
      hostId: "host_1",
      phase: "day",
      nightCount: 1,
      players: [
        { id: "p1", name: "Cupid Lover", connected: true },
        { id: "p2", name: "Target Lover", connected: true },
        { id: "p3", name: "Wolf", connected: true },
      ],
      playerRoles: {
        p1: "Thần tình yêu",
        p2: "Dân làng",
        p3: "Sói",
      },
      loveCupidId: "p1",
      loveTargetId: "p2",
      loveEscapeUsed: true,
      deadPlayers: [],
      gameLog: [],
      gameOver: false,
    };
    rooms[roomId] = room;

    checkAndEndGame(roomId, "test_check");

    // Game should end because escape is already used
    assert.strictEqual(room.gameOver, true);
    assert.strictEqual(room.winner, "wolves");
  });

  await t.test("Case 8: 2 villagers (one has Guardian shield, one doesn't) and 1 Wolf -> No early win", () => {
    const roomId = "room_case_8";
    const room: Room = {
      id: roomId,
      hostId: "host_1",
      phase: "day",
      nightCount: 1,
      players: [
        { id: "p1", name: "Protected Seer", connected: true },
        { id: "p2", name: "Village Chief", connected: true },
        { id: "p3", name: "Wolf", connected: true },
      ],
      playerRoles: {
        p1: "Tiên tri",
        p2: "Trưởng làng",
        p3: "Sói",
      },
      protectorTargetId: "p1",
      deadPlayers: [],
      gameLog: [],
      gameOver: false,
    };
    rooms[roomId] = room;

    checkAndEndGame(roomId, "test_check");

    // Game should NOT end because p1 has a shield
    assert.strictEqual(room.gameOver, false);
  });
});
