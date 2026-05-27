import test from "node:test";
import assert from "node:assert";
import { ScoringEngine } from "../scoring/scoringEngine.js";
import { DEFAULT_SCORING_CONFIG } from "../scoring/scoringConfig.js";
import type { GameSummary } from "../scoring/scoringTypes.js";

const engine = new ScoringEngine();

test("Case 1: Phe dân thắng, tiên tri soi trúng sói, dân vote đúng sói", (t) => {
  const summary: GameSummary = {
    gameId: "game_1",
    playerCount: 12,
    winningTeam: "villagers",
    players: [
      { id: "p1", name: "Player 1", role: "seer", team: "villagers", finalTeam: "villagers", aliveAtEnd: false },
      { id: "p2", name: "Player 2", role: "wolf", team: "wolves", finalTeam: "wolves", aliveAtEnd: false },
      { id: "p3", name: "Player 3", role: "villager", team: "villagers", finalTeam: "villagers", aliveAtEnd: true },
    ],
    events: [
      {
        type: "SEER_FOUND_WOLF",
        actorId: "p1",
        targetId: "p2",
        night: 1,
        metadata: { targetRole: "wolf", ledToWolfExecutionNextDay: true },
      },
      {
        type: "VILLAGER_VOTED_EXECUTED_WOLF",
        actorId: "p3",
        targetId: "p2",
        night: 1,
      },
    ],
  };

  const result = engine.calculateScore(summary);

  // Check p1 (seer): team_result (5), action (2 - seerFoundWolf), clutch (1 - ledToWolfExecutionNextDay) -> Total: 8
  const p1Card = result.ranking.find((p) => p.playerId === "p1");
  assert.ok(p1Card);
  assert.strictEqual(p1Card.totalScore, 8);

  const teamResultBreakdown = p1Card.breakdown.find((b) => b.category === "team_result");
  assert.ok(teamResultBreakdown);
  assert.strictEqual(teamResultBreakdown.points, 5);

  const actionBreakdown = p1Card.breakdown.find((b) => b.category === "action" && b.reason.includes("soi trúng sói"));
  assert.ok(actionBreakdown);
  assert.strictEqual(actionBreakdown.points, 2);

  const clutchBreakdown = p1Card.breakdown.find((b) => b.category === "clutch" && b.reason.includes("treo sói ngày hôm sau"));
  assert.ok(clutchBreakdown);
  assert.strictEqual(clutchBreakdown.points, 1);

  // Check p3 (villager): team_result (5), survival (1), action (1 - vote) -> Total: 7
  const p3Card = result.ranking.find((p) => p.playerId === "p3");
  assert.ok(p3Card);
  assert.strictEqual(p3Card.totalScore, 7);

  // MVP should be p1
  if (Array.isArray(result.mvp)) {
    assert.fail("Should have a single MVP");
  } else {
    assert.strictEqual(result.mvp.playerId, "p1");
    assert.strictEqual(result.mvp.score, 8);
  }
});

test("Case 2: Phe sói thắng, sói còn sống, sói vote treo chết tiên tri", (t) => {
  const summary: GameSummary = {
    gameId: "game_2",
    playerCount: 12,
    winningTeam: "wolves",
    players: [
      { id: "p1", name: "Player 1", role: "seer", team: "villagers", finalTeam: "villagers", aliveAtEnd: false },
      { id: "p2", name: "Player 2", role: "wolf", team: "wolves", finalTeam: "wolves", aliveAtEnd: true },
    ],
    events: [
      {
        type: "WOLF_VOTED_EXECUTED_CORE_ROLE",
        actorId: "p2",
        targetId: "p1",
        metadata: { targetIsCoreRole: true },
      },
    ],
  };

  const result = engine.calculateScore(summary);

  // Check p2 (wolf): team_result (6), survival (2), action (2 - vote core role) -> Total: 10
  const p2Card = result.ranking.find((p) => p.playerId === "p2");
  assert.ok(p2Card);
  assert.strictEqual(p2Card.totalScore, 10);

  if (Array.isArray(result.mvp)) {
    assert.fail("Should have a single MVP");
  } else {
    assert.strictEqual(result.mvp.playerId, "p2");
    assert.strictEqual(result.mvp.score, 10);
  }
});

test("Case 3: Bảo vệ chặn đúng cắn vào vai chủ lực", (t) => {
  const summary: GameSummary = {
    gameId: "game_3",
    playerCount: 12,
    winningTeam: "villagers",
    players: [
      { id: "p1", name: "Player 1", role: "guard", team: "villagers", finalTeam: "villagers", aliveAtEnd: true },
      { id: "p2", name: "Player 2", role: "seer", team: "villagers", finalTeam: "villagers", aliveAtEnd: true },
    ],
    events: [
      {
        type: "GUARD_BLOCKED_WOLF_KILL",
        actorId: "p1",
        targetId: "p2",
        metadata: { targetIsCoreRole: true },
      },
    ],
  };

  const result = engine.calculateScore(summary);

  // Check p1 (guard): team_result (5), survival (1), action (4 - saved core role) -> Total: 10
  const p1Card = result.ranking.find((p) => p.playerId === "p1");
  assert.ok(p1Card);
  assert.strictEqual(p1Card.totalScore, 10);

  const guardAction = p1Card.breakdown.find((b) => b.category === "action");
  assert.ok(guardAction);
  assert.strictEqual(guardAction.points, 4);
});

test("Case 4: Phù thủy giết trúng sói và một case phù thủy giết nhầm dân", (t) => {
  const summary: GameSummary = {
    gameId: "game_4",
    playerCount: 12,
    winningTeam: "villagers",
    players: [
      { id: "p1", name: "Player 1", role: "witch", team: "villagers", finalTeam: "villagers", aliveAtEnd: true },
      { id: "p2", name: "Player 2", role: "wolf", team: "wolves", finalTeam: "wolves", aliveAtEnd: false },
      { id: "p3", name: "Player 3", role: "villager", team: "villagers", finalTeam: "villagers", aliveAtEnd: false },
    ],
    events: [
      {
        type: "WITCH_KILLED_WOLF",
        actorId: "p1",
        targetId: "p2",
      },
      {
        type: "WITCH_KILLED_VILLAGER",
        actorId: "p1",
        targetId: "p3",
      },
    ],
  };

  const result = engine.calculateScore(summary);

  // Check p1 (witch): team_result (5), survival (1), action (3 - killed wolf), penalty (-2 - killed villager) -> Total: 7
  const p1Card = result.ranking.find((p) => p.playerId === "p1");
  assert.ok(p1Card);
  assert.strictEqual(p1Card.totalScore, 7);

  const penaltyBreakdown = p1Card.breakdown.find((b) => b.category === "penalty");
  assert.ok(penaltyBreakdown);
  assert.strictEqual(penaltyBreakdown.points, -2);
});

test("Case 5: Cặp đôi khác phe thắng riêng trong game 12 người", (t) => {
  const summary: GameSummary = {
    gameId: "game_5",
    playerCount: 12,
    winningTeam: "couple",
    players: [
      { id: "p1", name: "Player 1", role: "love_god", team: "villagers", finalTeam: "couple", aliveAtEnd: true, specialWin: true },
      { id: "p2", name: "Player 2", role: "wolf", team: "wolves", finalTeam: "couple", aliveAtEnd: true, specialWin: true },
    ],
    events: [
      {
        type: "LOVE_COUPLE_SPECIAL_WIN",
        actorIds: ["p1", "p2"],
        metadata: { playerCount: 12 },
      },
    ],
  };

  const result = engine.calculateScore(summary);

  // p1 & p2: special_win (18), survival (2) -> Total: 20
  // No double counting with teamResult.villagersWin/wolvesWin!
  const p1Card = result.ranking.find((p) => p.playerId === "p1");
  const p2Card = result.ranking.find((p) => p.playerId === "p2");

  assert.ok(p1Card);
  assert.ok(p2Card);

  assert.strictEqual(p1Card.totalScore, 20);
  assert.strictEqual(p2Card.totalScore, 20);

  // Confirms no teamResult scores exist since their finalTeam is "couple"
  const teamResult1 = p1Card.breakdown.find((b) => b.category === "team_result");
  assert.strictEqual(teamResult1, undefined);
});

test("Case 6: Cặp đôi khác phe thắng riêng trong game 20 người", (t) => {
  const summary: GameSummary = {
    gameId: "game_6",
    playerCount: 20,
    winningTeam: "couple",
    players: [
      { id: "p1", name: "Player 1", role: "love_god", team: "villagers", finalTeam: "couple", aliveAtEnd: true, specialWin: true },
      { id: "p2", name: "Player 2", role: "wolf", team: "wolves", finalTeam: "couple", aliveAtEnd: true, specialWin: true },
    ],
    events: [
      {
        type: "LOVE_COUPLE_SPECIAL_WIN",
        actorIds: ["p1", "p2"],
        metadata: { playerCount: 20 },
      },
    ],
  };

  const result = engine.calculateScore(summary);

  // p1 & p2: special_win (20), survival (2) -> Total: 22
  const p1Card = result.ranking.find((p) => p.playerId === "p1");
  assert.ok(p1Card);
  assert.strictEqual(p1Card.totalScore, 22);
});

test("Case 7: Tay buôn hoàn thành 5 giao dịch và thắng riêng", (t) => {
  const summary: GameSummary = {
    gameId: "game_7",
    playerCount: 12,
    winningTeam: "merchant",
    players: [
      { id: "p1", name: "Player 1", role: "merchant", team: "neutral", finalTeam: "merchant", aliveAtEnd: true, specialWin: true },
    ],
    events: [
      { type: "MERCHANT_SUCCESSFUL_TRADE", actorId: "p1", targetId: "p2", night: 1 },
      { type: "MERCHANT_SUCCESSFUL_TRADE", actorId: "p1", targetId: "p3", night: 2 },
      { type: "MERCHANT_SUCCESSFUL_TRADE", actorId: "p1", targetId: "p4", night: 3 },
      { type: "MERCHANT_SUCCESSFUL_TRADE", actorId: "p1", targetId: "p5", night: 4 },
      { type: "MERCHANT_SUCCESSFUL_TRADE", actorId: "p1", targetId: "p6", night: 5 },
      {
        type: "MERCHANT_COMPLETED_PERSONAL_WIN",
        actorId: "p1",
        metadata: { successfulTrades: 5 },
      },
    ],
  };

  const result = engine.calculateScore(summary);

  // Check diminishing returns for p1:
  // Trade 1: +1
  // Trade 2: +1
  // Trade 3: +1
  // Trade 4: +0.5
  // Trade 5: +0.5
  // Completed personal win (trades count 5 > 3 -> hard win): +18
  // Survival neutralAliveOnSpecialWin: +2
  // Total expected: 1 + 1 + 1 + 0.5 + 0.5 + 18 + 2 = 24.0
  const p1Card = result.ranking.find((p) => p.playerId === "p1");
  assert.ok(p1Card);
  assert.strictEqual(p1Card.totalScore, 24);
});

test("Case 8: Hai người bằng điểm và tie-breaker chọn đúng MVP", (t) => {
  const summary: GameSummary = {
    gameId: "game_8",
    playerCount: 12,
    winningTeam: "villagers",
    players: [
      // Both will end up with 10 points
      { id: "p1", name: "Player 1", role: "seer", team: "villagers", finalTeam: "villagers", aliveAtEnd: true },
      { id: "p2", name: "Player 2", role: "guard", team: "villagers", finalTeam: "villagers", aliveAtEnd: true },
    ],
    events: [
      {
        type: "SEER_FOUND_WOLF",
        actorId: "p1",
        targetId: "p3",
        metadata: { ledToWolfExecutionNextDay: true },
      },
      // p1 has: team_result (5) + survival (1) + action (2) + clutch (1) + manual clutch (1) = 10
      {
        type: "GUARD_BLOCKED_WOLF_KILL",
        actorId: "p2",
        targetId: "p1",
        metadata: { targetIsCoreRole: true },
      },
      // p2 has: team_result (5) + survival (1) + action (4) = 10
    ],
    manualBonuses: [
      { playerId: "p1", category: "clutch", points: 1, reason: "Extra clutch" },
    ],
  };

  const result = engine.calculateScore(summary);

  const p1Card = result.ranking.find((p) => p.playerId === "p1");
  const p2Card = result.ranking.find((p) => p.playerId === "p2");

  assert.ok(p1Card);
  assert.ok(p2Card);

  assert.strictEqual(p1Card.totalScore, 10);
  assert.strictEqual(p2Card.totalScore, 10);

  // Tie-breakers:
  // p1 clutch: 1 (seerInfoLedToExecutionBonus) + 1 (manual clutch) = 2
  // p2 clutch: 0
  // p1 has higher clutch, so p1 should be ranked #1 and be MVP
  assert.strictEqual(result.ranking[0]?.playerId, "p1");
  assert.strictEqual(result.ranking[1]?.playerId, "p2");

  if (Array.isArray(result.mvp)) {
    assert.fail("Should have a single MVP because tie-breaker decided it");
  } else {
    assert.strictEqual(result.mvp.playerId, "p1");
  }
});

test("Case 9: Manual clutch bonus làm thay đổi MVP", (t) => {
  const summary: GameSummary = {
    gameId: "game_9",
    playerCount: 12,
    winningTeam: "villagers",
    players: [
      { id: "p1", name: "Player 1", role: "seer", team: "villagers", finalTeam: "villagers", aliveAtEnd: true },
      { id: "p2", name: "Player 2", role: "guard", team: "villagers", finalTeam: "villagers", aliveAtEnd: true },
    ],
    events: [
      {
        type: "SEER_FOUND_WOLF",
        actorId: "p1",
        targetId: "p3",
      },
      // p1 base: team_result (5) + survival (1) + action (2) = 8
      {
        type: "GUARD_BLOCKED_WOLF_KILL",
        actorId: "p2",
        targetId: "p1",
        metadata: { targetIsCoreRole: true },
      },
      // p2 base: team_result (5) + survival (1) + action (4) = 10
    ],
    // Add manual clutch to p1 to push them to 11, surpassing p2
    manualBonuses: [
      { playerId: "p1", category: "clutch", points: 3, reason: "Game deciding clutch call" },
    ],
  };

  const result = engine.calculateScore(summary);

  const p1Card = result.ranking.find((p) => p.playerId === "p1");
  const p2Card = result.ranking.find((p) => p.playerId === "p2");

  assert.ok(p1Card);
  assert.ok(p2Card);

  assert.strictEqual(p1Card.totalScore, 11);
  assert.strictEqual(p2Card.totalScore, 10);

  // MVP is p1 due to manual clutch
  if (Array.isArray(result.mvp)) {
    assert.fail("Should have a single MVP");
  } else {
    assert.strictEqual(result.mvp.playerId, "p1");
  }
});

test("Case 10: Diminishing returns cho merchantSuccessfulTrade", (t) => {
  const summary: GameSummary = {
    gameId: "game_10",
    playerCount: 12,
    winningTeam: "merchant",
    players: [
      { id: "p1", name: "Player 1", role: "merchant", team: "neutral", finalTeam: "merchant", aliveAtEnd: false, specialWin: true },
    ],
    events: [
      { type: "MERCHANT_SUCCESSFUL_TRADE", actorId: "p1", targetId: "p2", night: 1 },
      { type: "MERCHANT_SUCCESSFUL_TRADE", actorId: "p1", targetId: "p3", night: 2 },
      { type: "MERCHANT_SUCCESSFUL_TRADE", actorId: "p1", targetId: "p4", night: 3 },
      { type: "MERCHANT_SUCCESSFUL_TRADE", actorId: "p1", targetId: "p5", night: 4 },
    ],
  };

  const result = engine.calculateScore(summary);

  // Check action points for p1:
  // Trade 1: +1
  // Trade 2: +1
  // Trade 3: +1
  // Trade 4: +0.5
  // Total actions score: 3.5
  // Since not alive and no COMPLETED_PERSONAL_WIN event: Total score = 3.5
  const p1Card = result.ranking.find((p) => p.playerId === "p1");
  assert.ok(p1Card);
  assert.strictEqual(p1Card.totalScore, 3.5);
});

test("Case 11: Love God linking with a same-team partner and winning with that team", (t) => {
  const summary: GameSummary = {
    gameId: "game_11",
    playerCount: 12,
    winningTeam: "villagers",
    players: [
      { id: "p1", name: "Love God", role: "love_god", team: "villagers", finalTeam: "villagers", aliveAtEnd: true },
      { id: "p2", name: "Villager Partner", role: "villager", team: "villagers", finalTeam: "villagers", aliveAtEnd: true },
    ],
    events: [
      {
        type: "LOVE_COUPLE_SAME_TEAM_SURVIVED_TO_END",
        actorIds: ["p1", "p2"],
      },
    ],
  };

  const result = engine.calculateScore(summary);

  // Love God (p1): teamResult (5) + survival (1) + LOVE_COUPLE_SAME_TEAM_SURVIVED_TO_END (2) = 8
  const p1Card = result.ranking.find((p) => p.playerId === "p1");
  assert.ok(p1Card);
  assert.strictEqual(p1Card.totalScore, 8);

  const teamRes = p1Card.breakdown.find((b) => b.category === "team_result");
  assert.ok(teamRes);
  assert.strictEqual(teamRes.points, 5);

  const surv = p1Card.breakdown.find((b) => b.category === "survival" && b.reason.includes("Sống sót"));
  assert.ok(surv);
  assert.strictEqual(surv.points, 1);

  const coupleSurv = p1Card.breakdown.find((b) => b.category === "survival" && b.reason.includes("Cặp đôi cùng phe"));
  assert.ok(coupleSurv);
  assert.strictEqual(coupleSurv.points, 2);

  // Villager Partner (p2): teamResult (5) + survival (1) + LOVE_COUPLE_SAME_TEAM_SURVIVED_TO_END (2) = 8
  const p2Card = result.ranking.find((p) => p.playerId === "p2");
  assert.ok(p2Card);
  assert.strictEqual(p2Card.totalScore, 8);
});

test("Case 12: Phù thủy dùng bình độc giết nhầm dân (deduplicated)", (t) => {
  const summary: GameSummary = {
    gameId: "game_12",
    playerCount: 12,
    winningTeam: "villagers",
    players: [
      { id: "p1", name: "Phù thủy", role: "witch", team: "villagers", finalTeam: "villagers", aliveAtEnd: true },
      { id: "p2", name: "Dân làng", role: "villager", team: "villagers", finalTeam: "villagers", aliveAtEnd: false },
    ],
    events: [
      // Raw WITCH_POISON event (should be no-op/ignored for scoring now)
      {
        type: "WITCH_KILLED_VILLAGER", // Mapper event generated originally, but now we get it from PLAYER_ELIMINATED
        actorId: "p1",
        targetId: "p2",
        night: 1,
        phase: "night",
      },
      // PLAYER_ELIMINATED event (cause type = witch_poison)
      {
        type: "WITCH_KILLED_VILLAGER", // The actual event mapped from PLAYER_ELIMINATED
        actorId: "p1",
        targetId: "p2",
        night: 1,
        phase: "night",
      },
    ],
  };

  const result = engine.calculateScore(summary);

  const p1Card = result.ranking.find((p) => p.playerId === "p1");
  assert.ok(p1Card);

  // Check how many penalties are listed
  const penalties = p1Card.breakdown.filter((b) => b.category === "penalty" && b.reason.includes("giết nhầm dân"));
  // Should be exactly 1 due to seenEventKeys deduplication!
  assert.strictEqual(penalties.length, 1, "Should have exactly one penalty for killing villager");
  assert.strictEqual(penalties[0]?.points, -2);
});

test("Case 13: Phù thủy tự cứu chính mình (+3) vs cứu vai chủ lực khác (+4)", (t) => {
  const summary: GameSummary = {
    gameId: "game_13",
    playerCount: 12,
    winningTeam: "villagers",
    players: [
      { id: "p1", name: "Phù thủy", role: "witch", team: "villagers", finalTeam: "villagers", aliveAtEnd: true },
      { id: "p2", name: "Tiên tri", role: "seer", team: "villagers", finalTeam: "villagers", aliveAtEnd: true },
    ],
    events: [
      // Witch saves themselves (p1 saves p1) -> Should score +3 points
      {
        type: "WITCH_SAVED_PLAYER",
        actorId: "p1",
        targetId: "p1",
        night: 1,
        phase: "night",
        metadata: { targetIsCoreRole: true },
      },
      // Witch saves seer (p1 saves p2) -> Should score +4 points
      {
        type: "WITCH_SAVED_PLAYER",
        actorId: "p1",
        targetId: "p2",
        night: 2,
        phase: "night",
        metadata: { targetIsCoreRole: true },
      },
    ],
  };

  const result = engine.calculateScore(summary);

  const p1Card = result.ranking.find((p) => p.playerId === "p1");
  assert.ok(p1Card);

  // Find the self-save breakdown
  const selfSave = p1Card.breakdown.find((b) => b.reason.includes("giải cứu chính mình"));
  assert.ok(selfSave, "Should find self-save event breakdown");
  assert.strictEqual(selfSave?.points, 3, "Self-save should yield exactly +3 points");

  // Find the core role save breakdown
  const seerSave = p1Card.breakdown.find((b) => b.reason.includes("giải cứu vai chủ lực bị sói cắn"));
  assert.ok(seerSave, "Should find core role save event breakdown");
  assert.strictEqual(seerSave?.points, 4, "Core role save should yield exactly +4 points");
});

