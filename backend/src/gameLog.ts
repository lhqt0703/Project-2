import { getServerContext } from "./serverContext.js";
import type { GameLogEntry, Room } from "./serverTypes.js";
import { getActiveDayVoters, getActiveWolves } from "./roomState.js";
import { emitGameLogToSocket } from "./serverEmitters.js";

function getPlayerName(room: Room, playerId: string | null | undefined) {
  if (!playerId) return "(không rõ)";
  return room.players.find((p) => p.id === playerId)?.name || playerId;
}

export function ensureNightLog(room: Room) {
  room.gameLog = room.gameLog || [];
  const night = room.nightCount || 0;
  if (night <= 0) return null;

  let entry = room.gameLog.find((n) => n.night === night);
  if (!entry) {
    entry = { night, at: Date.now(), entries: [] };
    room.gameLog.push(entry);
  }
  return entry;
}

export function appendLogEntry(room: Room, entry: GameLogEntry) {
  const nightLog = ensureNightLog(room);
  if (!nightLog) return;
  nightLog.entries.push(entry);

  if (room.id && room.hostId) {
    const ctx = getServerContext();
    if (ctx) {
      emitGameLogToSocket(room.id, room.hostId);
    }
  }
}

export function buildWolfVoteBreakdown(room: Room, votes: Record<string, string | null>): GameLogEntry {
  const activeWolves = getActiveWolves(room);
  const map: Record<string, string[]> = {};
  for (const wid of activeWolves) {
    const t = votes[wid];
    if (!t) continue;
    map[t] = map[t] || [];
    map[t].push(wid);
  }
  const targets = Object.keys(map);
  targets.sort((a, b) => getPlayerName(room, a).localeCompare(getPlayerName(room, b)));
  const voteBreakdown = targets.map((targetId) => ({
    targetId,
    voterIds: map[targetId] || [],
  }));

  return {
    type: "wolf_vote",
    phase: "night",
    voteBreakdown,
  };
}

export function buildDayVoteBreakdown(room: Room, votes: Record<string, string | null>): GameLogEntry {
  const activeVoters = getActiveDayVoters(room);
  const map: Record<string, string[]> = {};
  for (const voterId of activeVoters) {
    const t = votes[voterId];
    if (!t) continue;
    map[t] = map[t] || [];
    map[t].push(voterId);
  }
  const targets = Object.keys(map);
  targets.sort((a, b) => getPlayerName(room, a).localeCompare(getPlayerName(room, b)));
  const voteBreakdown = targets.map((targetId) => ({
    targetId,
    voterIds: map[targetId] || [],
  }));

  return {
    type: "day_vote",
    phase: "day",
    voteBreakdown,
  };
}
