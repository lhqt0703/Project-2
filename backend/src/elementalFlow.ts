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
import { PROTECTOR_PERMANENT_BUFF_ID } from "./specialRoles.js";

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
    const availableBuffTier = getBuffTier(room.elementalCorrectGuessCountForBuff ?? 0);
    ctx.io.to(playerId).emit("elementalBuffVoteStateUpdated", {
      pendingVote,
      quickMode: room.elementalBuffQuickMode !== false,
      selectedBuffId,
      availableBuffTier,
    });
  }

  function emitElementalNightState(roomId: string, playerId: string) {
    emitElementalTarget(roomId, playerId);
    emitElementalBuffVoteState(roomId, playerId);
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

    let chosen: ElementalBuffId | null = null;
    let wasRandom = false;
    let tiedBuffIds: ElementalBuffId[] = [];
    if (counts.size > 0) {
      const top = Math.max(...Array.from(counts.values()));
      const finalists = Array.from(counts.entries())
        .filter(([, count]) => count === top)
        .map(([buffId]) => buffId);
      wasRandom = finalists.length > 1;
      tiedBuffIds = wasRandom ? finalists : [];
      chosen = finalists[Math.floor(Math.random() * finalists.length)] || null;
    }
    const chosenVoterIds = chosen
      ? (buffVoteBreakdown.find((item) => item.buffId === chosen)?.voterIds || [])
      : [];

    room.elementalSelectedBuffId = chosen;
    const appliesNight = chosen
      ? (room.elementalBuffQuickMode !== false ? (room.nightCount || 0) : (room.nightCount || 0) + 1)
      : null;
    room.elementalSelectedBuffAppliesNight = appliesNight;
    if (chosen === PROTECTOR_PERMANENT_BUFF_ID && appliesNight !== null && appliesNight <= (room.nightCount || 0)) {
      room.protectorImmortalityPermanent = true;
    }
    room.elementalBuffVotesResolvedNight = room.nightCount || 0;
    room.elementalPendingBuffVoteNight = null;
    room.elementalBuffVotesTonight = {};

    appendLogEntry(room, {
      type: "elemental_buff_vote",
      phase: "night",
      voteBreakdown: buffVoteBreakdown,
      chosenBuffId: chosen,
      tier: chosen ? availableTier : 0,
      randomTieBreak: wasRandom,
      tiedBuffIds,
      chosenVoterIds,
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
    emitElementalNightState,
    resolveElementalBuffVote,
  };
}
