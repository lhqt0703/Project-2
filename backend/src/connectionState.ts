import type { ServerContext } from "./serverContext.js";
import { desiredLayoutHeightPx, ensureNonOverlappingPositions, layoutOptsForRoom, rescaleRoomPositionsForHeight } from "./serverPositions.js";
import { getParticipantCount, getParticipantIds } from "./roomState.js";
import { toPublicRoom } from "./serverEmitters.js";

type ConnectionState = {
  activeClientSockets: Record<string, Set<string>>;
  disconnectedCleanupTimers: Record<string, NodeJS.Timeout>;
  activeRooms: Set<string>;
};

export function createConnectionState(ctx: ServerContext, state: ConnectionState) {
  function getClientIdFromSocket(socket: any) {
    const raw = socket.handshake?.auth?.clientId;
    return typeof raw === "string" && raw.trim() ? raw.trim() : socket.id;
  }

  function disconnectedCleanupKey(roomId: string, playerId: string) {
    return `${roomId}:${playerId}`;
  }

  function clearDisconnectedCleanup(roomId: string, playerId: string) {
    const key = disconnectedCleanupKey(roomId, playerId);
    const timer = state.disconnectedCleanupTimers[key];
    if (timer) {
      clearTimeout(timer);
      delete state.disconnectedCleanupTimers[key];
    }
  }

  function isClientCurrentlyConnected(playerId: string) {
    return (state.activeClientSockets[playerId]?.size || 0) > 0;
  }

  function scheduleDisconnectedCleanup(roomId: string, playerId: string) {
    clearDisconnectedCleanup(roomId, playerId);
    const key = disconnectedCleanupKey(roomId, playerId);
    state.disconnectedCleanupTimers[key] = setTimeout(() => {
      delete state.disconnectedCleanupTimers[key];
      const room = ctx.rooms[roomId];
      if (!room) return;
      const player = room.players.find((p) => p.id === playerId);
      if (!player || player.connected !== false) return;

      if (room.phase) return;

      const wasHost = room.hostId === playerId;
      room.players = room.players.filter((p) => p.id !== playerId);
      room.positions = (room.positions || []).filter((pos) => pos.playerId !== playerId);
      room.positionEditors = (room.positionEditors || []).filter((id) => id !== playerId);
      if (wasHost) {
        delete room.pendingRoleAssignments;
        delete room.pendingRoleBlocks;
      } else if (room.pendingRoleAssignments) {
        delete room.pendingRoleAssignments[playerId];
        if (Object.keys(room.pendingRoleAssignments).length === 0) {
          delete room.pendingRoleAssignments;
        }
      }
      if (!wasHost && room.pendingRoleBlocks) {
        delete room.pendingRoleBlocks[playerId];
        if (Object.keys(room.pendingRoleBlocks).length === 0) {
          delete room.pendingRoleBlocks;
        }
      }
      if (room.playerRoleHistory) {
        delete room.playerRoleHistory[playerId];
        if (Object.keys(room.playerRoleHistory).length === 0) {
          delete room.playerRoleHistory;
        }
      }

      if (room.players.length === 0) {
        delete ctx.rooms[roomId];
        state.activeRooms.delete(roomId);
        return;
      }

      if (wasHost && room.players[0]) {
        room.hostId = room.players[0].id;
        ctx.io.to(roomId).emit("hostChanged", room.hostId);
      }

      const nextHeightPx = desiredLayoutHeightPx(getParticipantCount(room));
      rescaleRoomPositionsForHeight(room, nextHeightPx);
      room.positions = ensureNonOverlappingPositions(getParticipantIds(room), room.positions, layoutOptsForRoom(room));
      ctx.io.to(roomId).emit("positionsUpdated", room.positions || []);
      ctx.io.to(room.hostId).emit("pendingRoleAssignmentsUpdated", room.pendingRoleAssignments || {});
      ctx.io.to(room.hostId).emit("pendingRoleBlocksUpdated", room.pendingRoleBlocks || {});
      ctx.io.to(roomId).emit("roomUpdated", toPublicRoom(room));
    }, 10 * 60 * 1000); // Tomedited điều chỉnh thời gian auto kick
  }

  return {
    getClientIdFromSocket,
    disconnectedCleanupKey,
    clearDisconnectedCleanup,
    isClientCurrentlyConnected,
    scheduleDisconnectedCleanup,
  };
}
