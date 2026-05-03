import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import type { Room } from "./serverTypes.js";
import { setServerContext } from "./serverContext.js";
import { createConnectionState } from "./connectionState.js";
import { createLifecycleFlow } from "./lifecycle.js";
import { createElementalFlow } from "./elementalFlow.js";
import { createDayFlow } from "./dayFlow.js";
import { createNightFlow } from "./nightFlow.js";
import { registerSocketHandlers } from "./socketHandlers.js";

const app = express();
const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: { origin: "*" },
});

const rooms: Record<string, Room> = {};
const activeRooms = new Set<string>();
const disconnectedCleanupTimers: Record<string, NodeJS.Timeout> = {};
const activeClientSockets: Record<string, Set<string>> = {};
const DISCONNECTED_PLAYER_GRACE_MS = 5 * 60 * 1000;

const ctx = { io, rooms, activeRooms };
setServerContext(ctx);

const connectionState = createConnectionState(
  ctx,
  { activeClientSockets, disconnectedCleanupTimers, activeRooms }
);

// Initialize flows with proper dependencies
const lifecycle = createLifecycleFlow(ctx);
const elementalFlow = createElementalFlow(ctx);
const dayFlow = createDayFlow(ctx, { checkAndEndGame: lifecycle.checkAndEndGame });
const nightFlow = createNightFlow(ctx, {
  checkAndEndGame: lifecycle.checkAndEndGame,
  emitElementalNightState: elementalFlow.emitElementalNightState,
  resolveElementalBuffVote: elementalFlow.resolveElementalBuffVote,
});

io.on("connection", (socket) => {
  const clientId = connectionState.getClientIdFromSocket(socket);
  socket.join(clientId);
  activeClientSockets[clientId] = activeClientSockets[clientId] || new Set<string>();
  activeClientSockets[clientId].add(socket.id);

  console.log("Một client đã kết nối:", clientId);

  registerSocketHandlers({
    socket,
    clientId,
    activeClientSockets,
    connectionState,
    lifecycle,
    dayFlow,
    nightFlow,
    elementalFlow,
  });
});

httpServer.listen(3001, () => {
  console.log("Backend đang chạy tại http://localhost:3001");
});
