import test from "node:test";
import assert from "node:assert";
import * as fs from "fs";
import * as path from "path";
import { appendGameEvent } from "../gameEvent.js";
import { saveMatchHistory, loadSavedMatch, listSavedMatches } from "../gameHistory.js";
import { buildGameSummaryFromRoom } from "../scoring/gameLogMapper.js";
import { ScoringEngine } from "../scoring/scoringEngine.js";
import type { Room } from "../serverTypes.js";

const HISTORY_DIR = path.join(process.cwd(), "data", "history");

test("Game Event Logging: appendGameEvent builds expected events", () => {
  const mockRoom: Room = {
    id: "test_room_1",
    players: [],
    hostId: "host_1",
    gameEventLog: [],
  };

  const event = appendGameEvent(mockRoom, {
    type: "WOLF_BITE",
    phase: "night",
    actorIds: ["p1"],
    targetIds: ["p2"],
    metadata: { votes: { p1: "p2" } },
  });

  assert.ok(event.id.startsWith("ev_"));
  assert.ok(typeof event.timestamp === "number");
  assert.strictEqual(event.type, "WOLF_BITE");
  assert.strictEqual(event.phase, "night");
  assert.deepStrictEqual(event.actorIds, ["p1"]);
  assert.deepStrictEqual(event.targetIds, ["p2"]);

  assert.strictEqual(mockRoom.gameEventLog?.length, 1);
  assert.strictEqual(mockRoom.gameEventLog[0]?.type, "WOLF_BITE");
});

test("Match History Persistence: save, list, load", () => {
  // Clean up potential existing test files or ensure directory
  if (fs.existsSync(HISTORY_DIR)) {
    const files = fs.readdirSync(HISTORY_DIR);
    for (const f of files) {
      if (f.startsWith("match_test_history_")) {
        try {
          fs.unlinkSync(path.join(HISTORY_DIR, f));
        } catch {}
      }
    }
  }

  const mockRoom: Room = {
    id: "test_history_1",
    players: [
      { id: "p1", name: "Player 1", connected: true },
      { id: "p2", name: "Player 2", connected: true },
    ],
    playerRoles: {
      p1: "Tiên tri",
      p2: "Sói",
    },
    hostId: "p1",
    gameEventLog: [
      {
        id: "ev_1",
        timestamp: Date.now(),
        type: "WOLF_BITE",
        phase: "night",
        actorIds: ["p2"],
        targetIds: ["p1"],
      }
    ],
    winner: "wolves",
  };

  // Save match
  saveMatchHistory(mockRoom);

  // List saved matches
  const matches = listSavedMatches();
  const testMatchFile = matches.find(m => m.includes("test_history_1"));
  assert.ok(testMatchFile, "Should find the saved test match file");

  // Load match
  const loaded = loadSavedMatch(testMatchFile!);
  assert.ok(loaded);
  assert.strictEqual(loaded.gameId, "test_history_1");
  assert.strictEqual(loaded.playerCount, 2);
  assert.strictEqual(loaded.winner, "wolves");
  assert.strictEqual(loaded.players.length, 2);
  assert.strictEqual(loaded.players[0].role, "Tiên tri");
  assert.strictEqual(loaded.gameEventLog.length, 1);
  assert.strictEqual(loaded.gameEventLog[0].type, "WOLF_BITE");

  // Clean up
  try {
    fs.unlinkSync(path.join(HISTORY_DIR, testMatchFile!));
  } catch {}
});

test("Scoring Exporter: buildGameSummaryFromRoom mappings and scoring output", () => {
  const mockRoom: Room = {
    id: "test_scoring_1",
    players: [
      { id: "p1", name: "Seer", connected: true },
      { id: "p2", name: "Guard", connected: true },
      { id: "p3", name: "Wolf", connected: true },
      { id: "host_1", name: "Host Player", connected: true },
    ],
    playerRoles: {
      p1: "Tiên tri",
      p2: "Bảo vệ",
      p3: "Sói",
      host_1: "Dân làng",
    },
    hostId: "host_1",
    deadPlayers: ["p3"],
    winner: "villagers",
    gameEventLog: [
      // Night 1 events
      {
        id: "ev_1",
        timestamp: Date.now(),
        type: "SEER_CHECK",
        phase: "night",
        actorIds: ["p1"],
        targetIds: ["p3"],
        metadata: { isWolf: true },
      },
      {
        id: "ev_2",
        timestamp: Date.now(),
        type: "GUARD_SAVE",
        phase: "night",
        actorIds: ["p2"],
        targetIds: ["p1"],
      },
      // Day 1 events
      {
        id: "ev_3",
        timestamp: Date.now(),
        type: "TRIAL_VERDICT",
        phase: "day",
        targetIds: ["p3"],
        metadata: {
          executed: true,
          liveVotes: 0,
          dieVotes: 2,
          liveVoterIds: [],
          dieVoterIds: ["p1", "p2"],
        },
      },
    ],
  };

  const summary = buildGameSummaryFromRoom(mockRoom);

  // Check mapped properties
  assert.strictEqual(summary.gameId, "test_scoring_1");
  assert.strictEqual(summary.playerCount, 3);
  assert.strictEqual(summary.winningTeam, "villagers");
  assert.ok(!summary.players.some(p => p.id === "host_1"), "Host should be excluded from summary players");

  // Verify Seer (p1) role is lowercase mapped and team is villagers
  const p1 = summary.players.find(p => p.id === "p1");
  assert.ok(p1);
  assert.strictEqual(p1.role, "seer");
  assert.strictEqual(p1.team, "villagers");

  // Verify Wolf (p3)
  const p3 = summary.players.find(p => p.id === "p3");
  assert.ok(p3);
  assert.strictEqual(p3.role, "sói");
  assert.strictEqual(p3.team, "wolves");
  assert.strictEqual(p3.aliveAtEnd, false);

  // Check generated events
  assert.strictEqual(summary.events.length, 4); // SEER_FOUND_WOLF + ledToWolfExecution + GUARD_BLOCKED_WOLF_KILL + VILLAGER_VOTED_EXECUTED_WOLF (x2 for p1 and p2) -> wait:
  // Let's count them:
  // 1. GUARD_SAVE -> GUARD_BLOCKED_WOLF_KILL (actor: p2, target: p1, targetIsCoreRole: true)
  // 2. SEER_CHECK -> SEER_FOUND_WOLF (actor: p1, target: p3, ledToWolfExecutionNextDay: true because p3 is executed in ev_3)
  // 3. TRIAL_VERDICT -> VILLAGER_VOTED_EXECUTED_WOLF (actor: p1, target: p3)
  // 4. TRIAL_VERDICT -> VILLAGER_VOTED_EXECUTED_WOLF (actor: p2, target: p3)
  
  const guardBlock = summary.events.find(e => e.type === "GUARD_BLOCKED_WOLF_KILL");
  assert.ok(guardBlock);
  assert.strictEqual(guardBlock.actorId, "p2");
  assert.strictEqual(guardBlock.targetId, "p1");
  assert.strictEqual(guardBlock.metadata?.targetIsCoreRole, true);

  const seerCheck = summary.events.find(e => e.type === "SEER_FOUND_WOLF");
  assert.ok(seerCheck);
  assert.strictEqual(seerCheck.actorId, "p1");
  assert.strictEqual(seerCheck.targetId, "p3");
  assert.strictEqual(seerCheck.metadata?.ledToWolfExecutionNextDay, true);

  // Calculate scores using ScoringEngine
  const engine = new ScoringEngine();
  const result = engine.calculateScore(summary);

  // Seer: villagersWin (5) + aliveAtEnd (1) + foundWolf (2) + ledToExecution (1) + votedExecutedWolf (1) = 10
  const p1Card = result.ranking.find(r => r.playerId === "p1");
  assert.ok(p1Card);
  assert.strictEqual(p1Card.totalScore, 10);

  // Guard: villagersWin (5) + aliveAtEnd (1) + blockedWolfKill (4) + votedExecutedWolf (1) = 11
  const p2Card = result.ranking.find(r => r.playerId === "p2");
  assert.ok(p2Card);
  assert.strictEqual(p2Card.totalScore, 11);

  // MVP is Guard (p2)
  if (Array.isArray(result.mvp)) {
    assert.fail("Should have a single MVP");
  } else {
    assert.strictEqual(result.mvp.playerId, "p2");
    assert.strictEqual(result.mvp.score, 11);
  }
});
