import test from "node:test";
import assert from "node:assert";
import type { Room, RoomGameRules } from "../serverTypes.js";
import { calculateWolfBiteResults } from "../nightFlow.js";

const createMockRoom = (rules: Partial<RoomGameRules>, votes: Record<string, string | null>, votes2: Record<string, string | null>): Room => {
  return {
    id: "test_room",
    hostId: "host_1",
    players: [
      { id: "host_1", name: "Host" },
      { id: "w1", name: "Wolf 1" },
      { id: "w2", name: "Wolf 2" },
      { id: "w3", name: "Wolf 3" },
      { id: "A", name: "Player A" },
      { id: "B", name: "Player B" },
      { id: "C", name: "Player C" },
      { id: "D", name: "Player D" },
      { id: "E", name: "Player E" },
    ],
    playerRoles: {
      w1: "Sói",
      w2: "Sói",
      w3: "Sói",
    },
    deadPlayers: [],
    gameRules: {
      twoHeartsFirstTwoNights: true,
      forceWolfBiteFirstNight: false,
      allNightActionsSimultaneous: false,
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
      ...rules,
    },
    daNghichState: {
      wolfVotes: votes,
      wolfVotes2: votes2,
    },
    wolfBonusBiteThisNight: true,
    killedTonight: null,
    killedTonightExtra: null,
  };
};

test("Wolf Bonus Bite: smooth tied rule enabled", () => {
  // Case 1: w1 votes A & B, w2 votes B -> Bites both A and B
  const room1 = createMockRoom(
    { wolfBonusBiteSmoothTied: true },
    { w1: "A", w2: "B" },
    { w1: "B", w2: null }
  );
  const results1 = calculateWolfBiteResults(room1, room1.daNghichState!.wolfVotes!, room1.daNghichState!.wolfVotes2!, ["w1", "w2"], room1.gameRules, () => null);
  assert.strictEqual(results1.killedTonight, "B");
  assert.strictEqual(results1.killedTonightExtra, "A");

  // Case 2: w1 votes A & B, w2 votes A & C -> Bites A, B & C tied (not bitten)
  const room2 = createMockRoom(
    { wolfBonusBiteSmoothTied: true },
    { w1: "A", w2: "A" },
    { w1: "B", w2: "C" }
  );
  const results2 = calculateWolfBiteResults(room2, room2.daNghichState!.wolfVotes!, room2.daNghichState!.wolfVotes2!, ["w1", "w2"], room2.gameRules, () => null);
  assert.strictEqual(results2.killedTonight, "A");
  assert.strictEqual(results2.killedTonightExtra, null);

  // Case 3: w1 votes A & B, w2 votes C & D, w3 votes E -> w1(A,B), w2(C,D), w3(E).
  // Counts: A: 1, B: 1, C: 1, D: 1, E: 1. Max vote is 1, and 5 people are tied for max.
  // Since 5 >= 3, it should bite no one.
  const room3 = createMockRoom(
    { wolfBonusBiteSmoothTied: true },
    { w1: "A", w2: "C", w3: "E" },
    { w1: "B", w2: "D", w3: null }
  );
  const results3 = calculateWolfBiteResults(room3, room3.daNghichState!.wolfVotes!, room3.daNghichState!.wolfVotes2!, ["w1", "w2", "w3"], room3.gameRules, () => null);
  assert.strictEqual(results3.killedTonight, null);
  assert.strictEqual(results3.killedTonightExtra, null);
});

test("Wolf Bonus Bite: smooth tied rule disabled (fallback to old logic)", () => {
  // Under old logic: w1 votes A & B, w2 votes B.
  // counts: A: 1, B: 2. Only B has >= 2 votes. So eligible is [B].
  // Result should be killedTonight = B, killedTonightExtra = null.
  const room1 = createMockRoom(
    { wolfBonusBiteSmoothTied: false },
    { w1: "A", w2: "B" },
    { w1: "B", w2: null }
  );
  const results1 = calculateWolfBiteResults(room1, room1.daNghichState!.wolfVotes!, room1.daNghichState!.wolfVotes2!, ["w1", "w2"], room1.gameRules, () => null);
  assert.strictEqual(results1.killedTonight, "B");
  assert.strictEqual(results1.killedTonightExtra, null);

  // Under old logic: w1 votes A & B, w2 votes A & C.
  // counts: A: 2, B: 1, C: 1. Only A has >= 2 votes. eligible is [A].
  // Result: killedTonight = A, killedTonightExtra = null.
  const room2 = createMockRoom(
    { wolfBonusBiteSmoothTied: false },
    { w1: "A", w2: "A" },
    { w1: "B", w2: "C" }
  );
  const results2 = calculateWolfBiteResults(room2, room2.daNghichState!.wolfVotes!, room2.daNghichState!.wolfVotes2!, ["w1", "w2"], room2.gameRules, () => null);
  assert.strictEqual(results2.killedTonight, "A");
  assert.strictEqual(results2.killedTonightExtra, null);
});
