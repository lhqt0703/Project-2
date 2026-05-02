import type { Server } from "socket.io";
import type { Room } from "./serverTypes.js";

export type ServerContext = {
  io: Server;
  rooms: Record<string, Room>;
  activeRooms?: Set<string>;
};

let serverContext: ServerContext | null = null;

export function setServerContext(context: ServerContext) {
  serverContext = context;
}

export function getServerContext() {
  return serverContext;
}