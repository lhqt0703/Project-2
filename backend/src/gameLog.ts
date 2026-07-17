import { getServerContext } from "./serverContext.js";
import type { GameLogEntry, Room } from "./serverTypes.js";
import { getActiveDayVoters, getActiveWolves, getAlivePlayerIds } from "./roomState.js";
import { emitGameLogToSocket, emitPublicDayGameLogToRoom, isPublicGameLogEntry } from "./serverEmitters.js";

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
      if (isPublicGameLogEntry(entry)) {
        emitPublicDayGameLogToRoom(room.id);
      }
    }
  }
}

export function buildWolfVoteBreakdown(
  room: Room,
  ...voteMaps: Array<Record<string, string | null> | undefined>
): GameLogEntry {
  const activeWolves = getActiveWolves(room);
  const map: Record<string, string[]> = {};
  for (const wid of activeWolves) {
    for (const votes of voteMaps) {
      const t = votes?.[wid];
      if (!t) continue;
      map[t] = map[t] || [];
      if (!map[t].includes(wid)) {
        map[t].push(wid);
      }
    }
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

export function updateSoiMuActionLog(room: Room, actorId: string) {
  const nightLog = ensureNightLog(room);
  if (!nightLog) return;

  const targetId = room.soiMuState!.targets?.[actorId] || null;
  const role = room.playerRoles?.[actorId];
  if (!role) return;

  // HÀM REMOVE LOG CŨ CỦA ACTOR NÀY
  const removeOldActorLogs = () => {
    nightLog.entries = nightLog.entries.filter((e) => {
      if (
        (e.type === "guardian_protect" && e.actorId === actorId) ||
        (e.type === "soi_mu_villager_choose" && e.actorId === actorId) ||
        (e.type === "soi_mu_wolf_bite" && e.actorId === actorId) ||
        (e.type === "soi_mu_wolf_suicide" && e.actorId === actorId) ||
        (e.type === "soi_mu_wolf_inactive_choose" && e.actorId === actorId) ||
        (e.type === "soi_mu_ariana_trade" && e.actorId === actorId)
      ) {
        return false;
      }
      return true;
    });
  };

  // Nếu targetId là null, tức là người chơi bỏ chọn -> chỉ cần xóa log cũ của họ là xong
  if (!targetId) {
    removeOldActorLogs();
    if (room.id && room.hostId) {
      const ctx = getServerContext();
      if (ctx) {
        emitGameLogToSocket(room.id, room.hostId);
      }
    }
    return;
  }

  // Nếu có targetId, chúng ta sẽ tạo log mới cho người này tùy theo role
  let newEntry: GameLogEntry | null = null;

  if (role === "Bảo vệ") {
    newEntry = { type: "guardian_protect", phase: "night", actorId, targetId };
  } else if (role === "Dân làng" || role === "Trưởng làng") {
    newEntry = { type: "soi_mu_villager_choose", phase: "night", actorId, targetId };
  } else if (role === "Sói") {
    // Sói
    const aliveIds = getAlivePlayerIds(room).filter(id => id !== room.hostId);
    const dead = new Set(room.deadPlayers || []);
    // Xác định active wolf
    const aliveWolves = (room.daNghichState!.wolves || []).filter(wid => !dead.has(wid));
    const activeWolfId = aliveWolves[0] || "";
    const isActive = (actorId === activeWolfId);

    // Xác định nhãn của sói này
    const totalWolves = (room.daNghichState!.wolves || []).length;
    const wolfIndex = (room.daNghichState!.wolves || []).indexOf(actorId);
    const wolfLabel = totalWolves <= 1 ? "Sói" : `Sói ${wolfIndex !== -1 ? wolfIndex + 1 : 1}`;

    if (isActive) {
      if (targetId === actorId) {
        newEntry = { type: "soi_mu_wolf_suicide", phase: "night", actorId, wolfLabel };
      } else {
        newEntry = { type: "soi_mu_wolf_bite", phase: "night", actorId, targetId, wolfLabel };
      }
    } else {
      // Sói không hoạt động
      const activeWolfIndex = (room.daNghichState!.wolves || []).indexOf(activeWolfId);
      const activeWolfLabel = totalWolves <= 1 ? "Sói" : `Sói ${activeWolfIndex !== -1 ? activeWolfIndex + 1 : 1}`;
      newEntry = {
        type: "soi_mu_wolf_inactive_choose",
        phase: "night",
        actorId,
        targetId,
        wolfLabel,
        activeWolfLabel,
      };
    }
  } else if (role === "Tay Buôn") {
    // Ariana (Tay Buôn)
    const actorThumb = room.soiMuState!.thumbDecisions?.[actorId] || null;
    if (actorThumb) {
      const targetThumb = room.soiMuState!.thumbDecisions?.[targetId] || null;
      newEntry = {
        type: "soi_mu_ariana_trade",
        phase: "night",
        actorId,
        targetId,
        actorThumb,
        targetThumb,
      };
    }
  } else {
    // Tất cả các vai trò khác (Tiên tri, Phù thủy, Thợ săn, v.v.)
    newEntry = { type: "soi_mu_villager_choose", phase: "night", actorId, targetId };
  }

  if (newEntry) {
    removeOldActorLogs();
    nightLog.entries.push(newEntry);
  }

  if (room.id && room.hostId) {
    const ctx = getServerContext();
    if (ctx) {
      emitGameLogToSocket(room.id, room.hostId);
    }
  }
}
