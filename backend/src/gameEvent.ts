import type { Room, GameEvent } from "./serverTypes.js";

/**
 * Appends a standardized game event to the room's event log.
 * Generates a unique event ID and sets the current timestamp.
 */
export function appendGameEvent(
  room: Room,
  event: Omit<GameEvent, "id" | "timestamp">
): GameEvent {
  room.gameEventLog = room.gameEventLog || [];

  const fullEvent: GameEvent = {
    id: `ev_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    timestamp: Date.now(),
    night: room.nightCount !== undefined ? room.nightCount : 0,
    ...event,
  };

  room.gameEventLog.push(fullEvent);
  return fullEvent;
}
