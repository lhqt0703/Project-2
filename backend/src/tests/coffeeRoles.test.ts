import assert from "node:assert/strict";
import test from "node:test";
import {
  COFFEE_MAKER_ROLE,
  DONG_TRUNG_ROLE,
  LINH_CHI_ROLE,
  assignCoffeeSecondaryRoles,
  clearCoffeeWolfStunWhenMakerKilled,
  createCoffeeRoleState,
  getCoffeeMakerMaxUses,
  getCoffeePrivateState,
  getCoffeeWolfPoisonDisposition,
  getPrimaryRolesForDeal,
  isCoffeeWolfVotingStunned,
  performCoffeeHerbSearch,
  performCoffeeMakerSearch,
  recordCoffeeHerbWolfBite,
  resetCoffeeNightState,
  scheduleCoffeeDelayedPoison,
  takeDueCoffeeDelayedPoisons,
} from "../coffeeRoles.js";
import { toPublicRoom } from "../serverEmitters.js";
import { buildRoomGameRules, type Player, type Room } from "../serverTypes.js";
import { buildGameSummaryFromRoom } from "../scoring/gameLogMapper.js";
import { ScoringEngine } from "../scoring/scoringEngine.js";

const PLAYERS: Player[] = [
  { id: "host", name: "Quản trò" },
  { id: "maker", name: "Người pha" },
  { id: "linh", name: "Linh" },
  { id: "dong", name: "Đông" },
  { id: "wolf-a", name: "Sói A" },
  { id: "wolf-b", name: "Sói B" },
  { id: "villager", name: "Dân" },
  { id: "witch", name: "Phù thủy" },
];

function createRoom(options: {
  cardMode?: "primary" | "secondary";
  maxUses?: number;
  playerRoles?: Record<string, string>;
  roles?: string[];
} = {}): Room {
  const cardMode = options.cardMode ?? "primary";
  return {
    id: "coffee-test-room",
    hostId: "host",
    gameMode: "da_nghich",
    players: PLAYERS.map((player) => ({ ...player })),
    phase: "night",
    nightCount: 1,
    deadPlayers: [],
    daNghichState: {},
    roles: options.roles ?? [
      COFFEE_MAKER_ROLE,
      LINH_CHI_ROLE,
      DONG_TRUNG_ROLE,
      "Sói",
      "Sói con",
      "Dân làng",
      "Phù thủy",
    ],
    playerRoles: options.playerRoles ?? {
      maker: COFFEE_MAKER_ROLE,
      linh: LINH_CHI_ROLE,
      dong: DONG_TRUNG_ROLE,
      "wolf-a": "Sói",
      "wolf-b": "Sói con",
      villager: "Dân làng",
      witch: "Phù thủy",
    },
    gameRules: buildRoomGameRules({
      coffeeHerbCardMode: cardMode,
      coffeeMakerMaxUses: options.maxUses ?? 3,
    }, "da_nghich"),
    coffeeRoleState: createCoffeeRoleState(),
    gameLog: [],
  };
}

test("thẻ phụ chỉ phát cho role chính phe dân và không lộ qua public room", () => {
  const room = createRoom({
    cardMode: "secondary",
    playerRoles: {
      maker: COFFEE_MAKER_ROLE,
      linh: "Phù thủy",
      dong: "Tiên tri",
      "wolf-a": "Sói",
      "wolf-b": "Sói con",
      villager: "Dân làng",
      witch: "Bảo vệ",
    },
  });

  assert.deepEqual(getPrimaryRolesForDeal(room), [
    COFFEE_MAKER_ROLE,
    "Sói",
    "Sói con",
    "Dân làng",
    "Phù thủy",
  ]);
  assert.deepEqual(assignCoffeeSecondaryRoles(room, () => 0), { ok: true });

  const assignments = Object.entries(room.coffeeRoleState!.secondaryRolesByPlayerId);
  assert.equal(assignments.length, 2);
  assert.deepEqual(new Set(assignments.map(([, role]) => role)), new Set([LINH_CHI_ROLE, DONG_TRUNG_ROLE]));
  assert.ok(assignments.every(([playerId]) => ["linh", "dong", "villager", "witch"].includes(playerId)));
  assert.equal(room.coffeeRoleState!.secondaryRolesByPlayerId.maker, undefined);
  assert.equal(room.coffeeRoleState!.secondaryRolesByPlayerId["wolf-a"], undefined);

  const [holderId, holderRole] = assignments[0]!;
  const otherPlayerId = holderId === "linh" ? "dong" : "linh";
  assert.equal(getCoffeePrivateState(room, holderId).secondaryRole, holderRole);
  assert.equal(getCoffeePrivateState(room, otherPlayerId).secondaryRole, room.coffeeRoleState!.secondaryRolesByPlayerId[otherPlayerId] || null);

  const publicRoom = toPublicRoom(room);
  assert.equal(Object.prototype.hasOwnProperty.call(publicRoom, "coffeeRoleState"), false);

  const failedRoom = createRoom({
    cardMode: "secondary",
    playerRoles: {
      maker: COFFEE_MAKER_ROLE,
      linh: "Sói",
      dong: "Sói con",
    },
  });
  failedRoom.coffeeRoleState!.secondaryRolesByPlayerId = { maker: LINH_CHI_ROLE };
  assert.deepEqual(assignCoffeeSecondaryRoles(failedRoom, () => 0), { ok: false, required: 2, eligible: 0 });
  assert.deepEqual(failedRoom.coffeeRoleState!.secondaryRolesByPlayerId, { maker: LINH_CHI_ROLE });
});

test("Người pha cà phê phải tìm đúng cả hai trong cùng một đêm", () => {
  const room = createRoom();

  assert.deepEqual(performCoffeeMakerSearch(room, "maker", ["linh", "villager"]), { ok: true, foundBoth: false });
  room.nightCount = 2;
  resetCoffeeNightState(room);
  assert.deepEqual(performCoffeeMakerSearch(room, "maker", ["dong", "villager"]), { ok: true, foundBoth: false });
  assert.deepEqual(room.coffeeRoleState!.makerFoundBothPlayerIds, []);

  room.nightCount = 3;
  resetCoffeeNightState(room);
  assert.deepEqual(performCoffeeMakerSearch(room, "maker", ["dong", "linh"]), { ok: true, foundBoth: true });
  assert.deepEqual(room.coffeeRoleState!.makerFoundBothPlayerIds, ["maker"]);
  assert.equal(room.coffeeRoleState!.makerUseCountByPlayerId.maker, 3);

  const typedLogs = room.gameLog!
    .flatMap((night) => night.entries)
    .filter((entry) => entry.type === "coffee_maker_search");
  const fullLogs = room.gameLog!
    .flatMap((night) => night.entries)
    .filter((entry) => entry.type === "custom_log");
  assert.equal(typedLogs.length, 3);
  assert.ok(fullLogs.some((entry) => entry.type === "custom_log" && entry.message.includes("không tìm đủ cặp")));
  assert.ok(fullLogs.some((entry) => entry.type === "custom_log" && entry.message.includes("tìm đúng Linh Chi và Đông Trùng")));
});

test("tìm đủ tạo đúng một event +5 action, không biến thành thắng riêng", () => {
  const room = createRoom();
  assert.deepEqual(performCoffeeMakerSearch(room, "maker", ["linh", "dong"]), { ok: true, foundBoth: true });
  room.gameOver = true;
  room.winner = "wolves";

  const summary = buildGameSummaryFromRoom(room);
  const foundEvents = summary.events.filter((event) => event.type === "COFFEE_MAKER_FOUND_BOTH");
  assert.equal(foundEvents.length, 1);
  assert.equal(foundEvents[0]?.actorId, "maker");
  assert.equal(foundEvents[0]?.phase, "night");
  assert.notEqual(summary.players.find((player) => player.id === "maker")?.specialWin, true);

  const makerScore = new ScoringEngine().calculateScore(summary).ranking.find((player) => player.playerId === "maker");
  assert.ok(makerScore);
  assert.equal(makerScore.isWinner, false);
  assert.deepEqual(makerScore.breakdown.filter((entry) => entry.category === "action"), [{
    category: "action",
    points: 5,
    reason: "Người pha cà phê tìm đúng cả Linh Chi và Đông Trùng trong cùng một đêm",
  }]);
});

test("giới hạn lượt, lượt thưởng một lần và luật 0 = không giới hạn", () => {
  const room = createRoom({ maxUses: 2 });

  assert.deepEqual(performCoffeeMakerSearch(room, "maker", ["villager", "witch"]), { ok: true, foundBoth: false });
  room.nightCount = 2;
  resetCoffeeNightState(room);
  assert.deepEqual(performCoffeeMakerSearch(room, "maker", ["villager", "wolf-a"]), { ok: true, foundBoth: false });
  room.nightCount = 3;
  resetCoffeeNightState(room);
  assert.deepEqual(performCoffeeMakerSearch(room, "maker", ["villager", "wolf-b"]), { ok: false, reason: "no_uses_left" });

  assert.deepEqual(performCoffeeHerbSearch(room, "linh", "maker"), {
    ok: true,
    foundMaker: true,
    makerId: "maker",
  });
  assert.equal(getCoffeeMakerMaxUses(room, "maker"), 3);
  assert.deepEqual(performCoffeeMakerSearch(room, "maker", ["villager", "wolf-b"]), { ok: true, foundBoth: false });

  room.nightCount = 4;
  resetCoffeeNightState(room);
  assert.deepEqual(performCoffeeHerbSearch(room, "linh", "maker"), { ok: false, reason: "bonus_already_granted" });
  assert.equal(room.coffeeRoleState!.makerBonusUsesByPlayerId.maker, 1);

  const unlimitedRoom = createRoom({ maxUses: 0 });
  assert.equal(getCoffeeMakerMaxUses(unlimitedRoom, "maker"), 0);
  for (let night = 1; night <= 5; night += 1) {
    unlimitedRoom.nightCount = night;
    resetCoffeeNightState(unlimitedRoom);
    assert.deepEqual(performCoffeeMakerSearch(unlimitedRoom, "maker", ["villager", "witch"]), {
      ok: true,
      foundBoth: false,
    });
  }
});

test("chỉ Linh Chi/Đông Trùng dạng role chính mới được tìm Người pha cà phê", () => {
  const primaryRoom = createRoom();

  assert.deepEqual(performCoffeeHerbSearch(primaryRoom, "linh", "villager"), {
    ok: true,
    foundMaker: false,
    makerId: null,
  });
  assert.deepEqual(performCoffeeHerbSearch(primaryRoom, "linh", "maker"), {
    ok: false,
    reason: "already_used_tonight",
  });

  primaryRoom.nightCount = 2;
  resetCoffeeNightState(primaryRoom);
  assert.deepEqual(performCoffeeHerbSearch(primaryRoom, "linh", "maker"), {
    ok: true,
    foundMaker: true,
    makerId: "maker",
  });
  assert.equal(primaryRoom.coffeeRoleState!.makerBonusUsesByPlayerId.maker, 1);

  const secondaryRoom = createRoom({
    cardMode: "secondary",
    playerRoles: {
      maker: COFFEE_MAKER_ROLE,
      linh: "Phù thủy",
      dong: "Tiên tri",
      "wolf-a": "Sói",
      villager: "Dân làng",
    },
  });
  secondaryRoom.coffeeRoleState!.secondaryRolesByPlayerId.linh = LINH_CHI_ROLE;
  assert.deepEqual(performCoffeeHerbSearch(secondaryRoom, "linh", "maker"), {
    ok: false,
    reason: "secondary_card",
  });
});

test("cắn thảo dược trước khi tìm đủ tạo độc trì hoãn rồi miễn nhiễm", () => {
  const room = createRoom();

  assert.deepEqual(recordCoffeeHerbWolfBite(room, "linh"), {
    herbRole: LINH_CHI_ROLE,
    branch: "toxin",
    level: 1,
    persistent: false,
  });
  assert.equal(recordCoffeeHerbWolfBite(room, "linh"), null);
  assert.equal(getCoffeeWolfPoisonDisposition(room, "wolf-a"), "delayed");
  assert.equal(getCoffeeWolfPoisonDisposition(room, "villager"), "normal");

  scheduleCoffeeDelayedPoison(room, "wolf-a", "witch");
  scheduleCoffeeDelayedPoison(room, "wolf-a", "witch");
  assert.deepEqual(takeDueCoffeeDelayedPoisons(room), []);
  room.nightCount = 2;
  assert.deepEqual(recordCoffeeHerbWolfBite(room, "dong"), {
    herbRole: DONG_TRUNG_ROLE,
    branch: "toxin",
    level: 2,
    persistent: false,
  });
  assert.equal(getCoffeeWolfPoisonDisposition(room, "wolf-a"), "immune");
  assert.equal(getCoffeeWolfPoisonDisposition(room, "wolf-b"), "immune");
  assert.deepEqual(takeDueCoffeeDelayedPoisons(room), [{
    targetId: "wolf-a",
    sourceActorId: "witch",
    poisonedNight: 1,
    dueNight: 2,
  }]);
});

test("cắn thảo dược sau khi tìm đủ gây choáng một ngày rồi choáng bền vững", () => {
  const room = createRoom();
  assert.deepEqual(performCoffeeMakerSearch(room, "maker", ["linh", "dong"]), { ok: true, foundBoth: true });

  assert.deepEqual(recordCoffeeHerbWolfBite(room, "linh"), {
    herbRole: LINH_CHI_ROLE,
    branch: "stun",
    level: 1,
    persistent: false,
  });
  assert.equal(isCoffeeWolfVotingStunned(room, "wolf-a"), true);
  assert.equal(isCoffeeWolfVotingStunned(room, "villager"), false);

  room.nightCount = 2;
  assert.equal(isCoffeeWolfVotingStunned(room, "wolf-a"), false);
  assert.deepEqual(recordCoffeeHerbWolfBite(room, "dong"), {
    herbRole: DONG_TRUNG_ROLE,
    branch: "stun",
    level: 2,
    persistent: true,
  });
  room.nightCount = 3;
  assert.equal(isCoffeeWolfVotingStunned(room, "wolf-a"), true);
  assert.equal(clearCoffeeWolfStunWhenMakerKilled(room, "villager"), false);
  assert.equal(isCoffeeWolfVotingStunned(room, "wolf-a"), true);
  assert.equal(clearCoffeeWolfStunWhenMakerKilled(room, "maker"), true);
  assert.equal(isCoffeeWolfVotingStunned(room, "wolf-a"), false);

  const makerKilledEarlyRoom = createRoom();
  assert.deepEqual(performCoffeeMakerSearch(makerKilledEarlyRoom, "maker", ["linh", "dong"]), { ok: true, foundBoth: true });
  assert.equal(recordCoffeeHerbWolfBite(makerKilledEarlyRoom, "linh")?.level, 1);
  assert.equal(clearCoffeeWolfStunWhenMakerKilled(makerKilledEarlyRoom, "maker"), false);
  assert.equal(isCoffeeWolfVotingStunned(makerKilledEarlyRoom, "wolf-a"), true);

  makerKilledEarlyRoom.nightCount = 2;
  assert.deepEqual(recordCoffeeHerbWolfBite(makerKilledEarlyRoom, "dong"), {
    herbRole: DONG_TRUNG_ROLE,
    branch: "stun",
    level: 2,
    persistent: false,
  });
  assert.equal(isCoffeeWolfVotingStunned(makerKilledEarlyRoom, "wolf-a"), false);
  assert.deepEqual(makerKilledEarlyRoom.coffeeRoleState!.makerKilledByWolfPlayerIds, ["maker"]);
});

test("choáng bền vững chỉ gỡ khi mọi Coffee đã tìm đủ đều bị Sói giết", () => {
  const room = createRoom({
    playerRoles: {
      maker: COFFEE_MAKER_ROLE,
      witch: COFFEE_MAKER_ROLE,
      linh: LINH_CHI_ROLE,
      dong: DONG_TRUNG_ROLE,
      "wolf-a": "Sói",
      "wolf-b": "Sói con",
      villager: "Dân làng",
    },
  });
  assert.equal(performCoffeeMakerSearch(room, "maker", ["linh", "dong"]).ok, true);
  assert.equal(performCoffeeMakerSearch(room, "witch", ["linh", "dong"]).ok, true);
  assert.equal(recordCoffeeHerbWolfBite(room, "linh")?.level, 1);
  assert.equal(recordCoffeeHerbWolfBite(room, "dong")?.persistent, true);

  assert.equal(clearCoffeeWolfStunWhenMakerKilled(room, "maker"), false);
  assert.equal(isCoffeeWolfVotingStunned(room, "wolf-a"), true);
  assert.equal(clearCoffeeWolfStunWhenMakerKilled(room, "witch"), true);
  assert.equal(isCoffeeWolfVotingStunned(room, "wolf-a"), false);
});

test("helper Coffee không truy cập daNghichState ở mode khác", () => {
  const room = createRoom();
  room.gameMode = "diet_quy";
  delete room.daNghichState;
  room.coffeeRoleState!.wolfToxinLevel = 2;
  room.coffeeRoleState!.wolfStunPersistent = true;

  assert.equal(isCoffeeWolfVotingStunned(room, "villager"), false);
  assert.equal(getCoffeeWolfPoisonDisposition(room, "wolf-a"), "normal");
  assert.deepEqual(getCoffeePrivateState(room, "wolf-a"), {
    secondaryRole: null,
    makerTargetsTonight: null,
    makerUsesUsed: 0,
    makerMaxUses: 3,
    makerFoundBoth: false,
    herbTargetTonight: null,
    herbFoundMaker: false,
    wolfToxinLevel: 0,
    wolfVotingStunned: false,
    wolfStunPersistent: false,
  });
});
