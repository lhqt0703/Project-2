import type { ServerContext } from "./serverContext.js";
import { ensureRoomGameRules, type EliminationCause, type GameLogEntryPhase, type Room } from "./serverTypes.js";
import { appendGameEvent } from "./gameEvent.js";
import { appendLogEntry } from "./gameLog.js";
import { clearProtectorTargetIfDead, tryUseProtectorImmortality, type ProtectorSaveRecord } from "./specialRoles.js";
import { markWildWolfConversionReadyIfWolfDied, markWolfCubExtraBiteReadyIfDied } from "./roomState.js";
import { emitAngelPrivateState, emitAngelPrivateStateForAll, markAngelReviveAvailable } from "./angel.js";

export const LOVE_ROLE = "Thần tình yêu";

export function getLovePartnerChoiceLastNight(room: Room) {
  return ensureRoomGameRules(room).loveCanChoosePartnerFirstTwoNights ? 2 : 1;
}

export function isLovePartnerChoiceNight(room: Room) {
  const currentNight = room.nightCount || 0;
  return currentNight >= 1 && currentNight <= getLovePartnerChoiceLastNight(room);
}

export function canLoveChoosePartnerTonight(room: Room) {
  return isLovePartnerChoiceNight(room) && !room.loveTargetId;
}

export type LoveStatePayload = {
  cupidId: string | null;
  targetId: string | null;
  partnerId: string | null;
  pairIds: string[];
  rolesByPlayerId: Record<string, string>;
  rolesBeforeConversion?: Record<string, string>;
  targetWolfAligned: boolean;
  escapeUsed: boolean;
  escapeActiveTonight: boolean;
  escapeVotes: string[];
};

export function getLovePairIds(room: Room): [string, string] | null {
  const cupidId = room.loveCupidId || null;
  const targetId = room.loveTargetId || null;
  if (!cupidId || !targetId) return null;
  if (!room.players.find((player) => player.id === cupidId)) return null;
  if (!room.players.find((player) => player.id === targetId)) return null;
  return [cupidId, targetId];
}

export function getLovePartnerId(room: Room, playerId: string): string | null {
  const pair = getLovePairIds(room);
  if (!pair) return null;
  if (pair[0] === playerId) return pair[1];
  if (pair[1] === playerId) return pair[0];
  return null;
}

export function isLovePairMember(room: Room, playerId: string) {
  return getLovePartnerId(room, playerId) !== null;
}

export function isLovePairMemberAwayAt(room: Room, playerId: string, actionAt: number, ignoreTimeSimultaneous = false) {
  if (!room.loveEscapeActiveTonight) return false;

  const rules = ensureRoomGameRules(room);
  if (rules.allNightActionsSimultaneous && rules.loveEscapeImmuneSimultaneous && ignoreTimeSimultaneous) {
    return isLovePairMember(room, playerId);
  }

  const escapedAt = room.loveEscapeActivatedAt;
  if (!escapedAt) return false;
  if (!isLovePairMember(room, playerId)) return false;
  return actionAt >= escapedAt;
}

export function buildLoveStateForPlayer(room: Room, playerId: string): LoveStatePayload {
  const pair = getLovePairIds(room);
  if (!pair || !pair.includes(playerId)) {
    return {
      cupidId: null,
      targetId: null,
      partnerId: null,
      pairIds: [],
      rolesByPlayerId: {},
      rolesBeforeConversion: {},
      targetWolfAligned: false,
      escapeUsed: false,
      escapeActiveTonight: false,
      escapeVotes: [],
    };
  }

  const rolesByPlayerId: Record<string, string> = {};
  for (const id of pair) {
    rolesByPlayerId[id] = room.playerRoles?.[id] || "";
  }

  return {
    cupidId: pair[0],
    targetId: pair[1],
    partnerId: pair[0] === playerId ? pair[1] : pair[0],
    pairIds: pair,
    rolesByPlayerId,
    rolesBeforeConversion: room.rolesBeforeConversion || {},
    targetWolfAligned: room.loveTargetWolfAligned === true,
    escapeUsed: room.loveEscapeUsed === true,
    escapeActiveTonight: room.loveEscapeActiveTonight === true,
    escapeVotes: pair.filter((id) => room.loveEscapeVotesTonight?.[id] === true),
  };
}

export function emitLoveStateToPlayer(ctx: ServerContext, roomId: string, room: Room, playerId: string) {
  const isLover = isLovePairMember(room, playerId);
  if (isLover) {
    ctx.io.in(playerId).socketsJoin(`lovers_${roomId}`);
  } else {
    ctx.io.in(playerId).socketsLeave(`lovers_${roomId}`);
  }
  ctx.io.to(playerId).emit("loveStateUpdated", buildLoveStateForPlayer(room, playerId));
}

export function emitLoveStateToPair(ctx: ServerContext, roomId: string, room: Room) {
  const pair = getLovePairIds(room);
  if (!pair) return;
  for (const playerId of pair) {
    emitLoveStateToPlayer(ctx, roomId, room, playerId);
  }
}

export function clearLoveStateForPlayers(ctx: ServerContext, room: Room, roomId: string) {
  for (const player of room.players) {
    ctx.io.in(player.id).socketsLeave(`lovers_${roomId}`);
    ctx.io.to(player.id).emit("loveStateUpdated", buildLoveStateForPlayer(room, player.id));
  }
}

type MarkEliminatedOptions = {
  initialDead?: Set<string>;
  eliminatedIds?: string[];
  causesByTarget?: Record<string, EliminationCause[]>;
  protectorSaves?: ProtectorSaveRecord[];
  loveLinkDeaths?: { sourceId: string; targetId: string }[];
};

function addCause(causesByTarget: Record<string, EliminationCause[]> | undefined, targetId: string, cause: EliminationCause) {
  if (!causesByTarget) return;
  causesByTarget[targetId] = causesByTarget[targetId] || [];
  causesByTarget[targetId]!.push(cause);
}

export function markEliminatedWithLoveChain(
  ctx: ServerContext,
  roomId: string,
  room: Room,
  targetId: string,
  cause: EliminationCause,
  _phase: GameLogEntryPhase,
  options: MarkEliminatedOptions = {},
): string[] {
  const deadPlayers = room.deadPlayers || [];
  if (room.songTrungRobbedPlayerId && room.loveTargetId && targetId === room.loveTargetId && !deadPlayers.includes(targetId)) {
    // Song Trùng bị chết!
    const robbedName = room.players.find(p => p.id === room.songTrungRobbedPlayerId)?.name || room.songTrungRobbedPlayerId;
    
    if (room.songTrungFoundByVictim !== true) {
      // Chưa tìm được -> không khôi phục, Cupid vẫn chết theo
      appendLogEntry(room, {
        type: "custom_log",
        phase: _phase,
        message: `Song Trùng đã chết nhưng người bị cướp vai trò chưa tìm thấy Song Trùng trước đó. Thần tình yêu sẽ chết theo.`
      });
    } else {
      // Đã tìm thấy
      let valid = true;
      const rules = ensureRoomGameRules(room);
      
      // 1. Kiểm tra luật treo cổ
      if (rules.songTrungReturnRoleOnlyIfVotedOut === true) {
        if (cause.type !== "day_vote" && cause.type !== "trial_verdict") {
          valid = false;
          appendLogEntry(room, {
            type: "custom_log",
            phase: _phase,
            message: `Song Trùng chết do nguyên nhân khác (không phải biểu quyết treo cổ). Điều kiện giải cứu không hợp lệ, Thần tình yêu vẫn chết theo.`
          });
        }
      }
      
      // 2. Kiểm tra luật Cupid vote
      if (valid && rules.songTrungReturnRoleRequiresCupidVote === true) {
        const cupidId = room.loveCupidId;
        const voterIds = (cause as any).voterIds || [];
        if (!cupidId || !voterIds.includes(cupidId)) {
          valid = false;
          appendLogEntry(room, {
            type: "custom_log",
            phase: _phase,
            message: `Song Trùng bị treo cổ nhưng Thần tình yêu không biểu quyết vote chết Song Trùng. Điều kiện giải cứu không hợp lệ, Thần tình yêu vẫn chết theo.`
          });
        }
      }
      
      if (valid) {
        // Hợp lệ! Khôi phục vai trò và liên kết tình yêu ban đầu
        const robbedId = room.songTrungRobbedPlayerId;
        
        // Cập nhật socket room join và emit state
        const targetSockets = ctx.io.in(targetId);
        targetSockets.socketsLeave(`lovers_${roomId}`);
        
        const robbedSockets = ctx.io.in(robbedId);
        robbedSockets.socketsJoin(`lovers_${roomId}`);
        
        room.loveTargetId = robbedId; // Trả Cupid target về người bị cướp
        room.songTrungRobbedPlayerId = null; // Trả lại chức năng cho người bị cướp
        room.songTrungVictimId = null;
        room.songTrungRobbedOriginalRole = null;
        
        emitLoveStateToPair(ctx, roomId, room);
        ctx.io.to(robbedId).emit("yourRole", room.playerRoles?.[robbedId]);
        
        appendLogEntry(room, {
          type: "custom_log",
          phase: _phase,
          message: `[Giải cứu thành công] Song Trùng đã chết. ${robbedName} lấy lại được chức năng vai trò của mình và Thần tình yêu không bị chết theo.`
        });
      }
    }
  }

  const initialDead = options.initialDead || new Set<string>();
  const eliminatedIds = options.eliminatedIds;
  const causesByTarget = options.causesByTarget;
  const playerIds = new Set(room.players.map((player) => player.id));
  const dead = new Set(room.deadPlayers || []);
  const newlyDead: string[] = [];

  const mark = (id: string, nextCause: EliminationCause): string[] => {
    if (initialDead.has(id)) return [];
    if (!playerIds.has(id)) return [];

    const protectorSave = tryUseProtectorImmortality(room, id, nextCause);
    if (protectorSave) {
      options.protectorSaves?.push(protectorSave);
      return [];
    }

    addCause(causesByTarget, id, nextCause);
    if (dead.has(id)) return [];

    dead.add(id);
    newlyDead.push(id);
    if (eliminatedIds && !eliminatedIds.includes(id)) {
      eliminatedIds.push(id);
    }

    room.deadPlayers = room.deadPlayers || [];
    if (!room.deadPlayers.includes(id)) {
      room.deadPlayers.push(id);
    }
    markWolfCubExtraBiteReadyIfDied(room, id);
    markWildWolfConversionReadyIfWolfDied(room, id);
    if (markAngelReviveAvailable(room, id)) {
      emitAngelPrivateState(ctx, roomId, room, id);
    }
    clearProtectorTargetIfDead(room, id);
    ctx.io.to(roomId).emit("playerKilled", id);

    appendGameEvent(room, {
      type: "PLAYER_ELIMINATED",
      phase: _phase,
      targetIds: [id],
      metadata: { cause: nextCause },
    });

    if (nextCause.type === "love_link") {
      appendGameEvent(room, {
        type: "LOVE_LINK_DEATH",
        phase: _phase,
        actorIds: [nextCause.sourceId],
        targetIds: [id],
      });
    }

    const partnerId = getLovePartnerId(room, id);
    if (partnerId && !dead.has(partnerId) && !initialDead.has(partnerId)) {
      const beforeCount = newlyDead.length;
      mark(partnerId, { type: "love_link", sourceId: id });
      if (newlyDead.length > beforeCount && newlyDead.includes(partnerId)) {
        options.loveLinkDeaths?.push({ sourceId: id, targetId: partnerId });
      }
    }
    return newlyDead;
  };

  const result = mark(targetId, cause);
  emitAngelPrivateStateForAll(ctx, roomId, room);
  return result;
}
