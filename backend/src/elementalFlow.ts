import type { ServerContext } from "./serverContext.js";
import {
  ELEMENTAL_BUFFS,
  getBuffTier,
  type ElementalBuffId,
} from "./elemental.js";
import { appendLogEntry } from "./gameLog.js";
import {
  broadcastElementalBuffSelection,
  shouldElementalsVoteBuffTonight,
  toPublicRoom,
} from "./serverEmitters.js";

export function createElementalFlow(ctx: ServerContext) {
  function emitElementalTarget(roomId: string, playerId: string) {
    const room = ctx.rooms[roomId];
    if (!room) return;
    const mode = shouldElementalsVoteBuffTonight(room) ? "buff" : "guess";
    const targetId = room.elementalTargetTonight?.[playerId] ?? null;
    ctx.io.to(playerId).emit("elementalTargetUpdated", { targetId, mode });
  }

  function emitElementalBuffVoteState(roomId: string, playerId: string) {
    const room = ctx.rooms[roomId];
    if (!room) return;
    const pendingVote = shouldElementalsVoteBuffTonight(room);
    const selectedBuffId = room.elementalBuffVotesTonight?.[playerId] ?? null;
    const availableBuffTier = room.elementalCorrectGuessCountForBuff ?? 0;
    ctx.io.to(playerId).emit("elementalBuffVoteStateUpdated", {
      pendingVote,
      quickMode: room.elementalBuffQuickMode !== false,
      selectedBuffId,
      availableBuffTier,
    });
  }

  function resolveElementalBuffVote(roomId: string) {
    const room = ctx.rooms[roomId];
    if (!room) return;
    if (!shouldElementalsVoteBuffTonight(room)) return;

    const availableTier = getBuffTier(room.elementalCorrectGuessCountForBuff || 0);
    const voteMap = room.elementalBuffVotesTonight || {};
    const counts = new Map<ElementalBuffId, number>();

    for (const buffId of Object.values(voteMap)) {
      if (!buffId) continue;
      const buff = ELEMENTAL_BUFFS.find((item) => item.id === buffId);
      if (!buff || buff.tier !== availableTier) continue;
      counts.set(buffId, (counts.get(buffId) || 0) + 1);
    }

    const buffVoteBreakdown: { buffId: ElementalBuffId; voterIds: string[] }[] = [];
    for (const buffId of counts.keys()) {
      const voterIds = Object.entries(voteMap)
        .filter(([, votedBuffId]) => votedBuffId === buffId)
        .map(([voterId]) => voterId);
      buffVoteBreakdown.push({ buffId, voterIds });
    }
    appendLogEntry(room, {
      type: "elemental_buff_vote",
      phase: "night",
      voteBreakdown: buffVoteBreakdown,
    });

    let chosen: ElementalBuffId | null = null;
    let wasRandom = false;
    if (counts.size > 0) {
      const top = Math.max(...Array.from(counts.values()));
      const finalists = Array.from(counts.entries())
        .filter(([, count]) => count === top)
        .map(([buffId]) => buffId);
      wasRandom = finalists.length > 1;
      chosen = finalists[Math.floor(Math.random() * finalists.length)] || null;
    }

    room.elementalSelectedBuffId = chosen;
    room.elementalSelectedBuffAppliesNight = chosen
      ? (room.elementalBuffQuickMode !== false ? (room.nightCount || 0) : (room.nightCount || 0) + 1)
      : null;
    room.elementalBuffVotesResolvedNight = room.nightCount || 0;
    room.elementalPendingBuffVoteNight = null;
    room.elementalBuffVotesTonight = {};

    appendLogEntry(room, {
      type: "elemental_buff",
      phase: "night",
      buffId: chosen,
      tier: chosen ? availableTier : 0,
      randomTieBreak: wasRandom,
    });

    broadcastElementalBuffSelection(roomId, {
      buffId: chosen,
      tier: chosen ? availableTier : 0,
      appliesNight: room.elementalSelectedBuffAppliesNight ?? null,
      randomTieBreak: wasRandom,
    });
    ctx.io.to(roomId).emit("roomUpdated", toPublicRoom(room));
  }

  return {
    emitElementalTarget,
    emitElementalBuffVoteState,
    resolveElementalBuffVote,
  };
}
