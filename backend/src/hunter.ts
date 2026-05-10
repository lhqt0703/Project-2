import type { ServerContext } from "./serverContext.js";
import type { EliminationCause, GameLogEntryPhase, Room } from "./serverTypes.js";
import { appendLogEntry } from "./gameLog.js";
import { getHunters } from "./roomState.js";

export function resolveHunterShotsForDeaths(
  ctx: ServerContext,
  roomId: string,
  room: Room,
  newlyDeadIds: string[],
  phase: GameLogEntryPhase,
) {
  const queue = Array.from(new Set(newlyDeadIds));
  const processed = new Set<string>();
  const hunterIds = new Set(getHunters(room));

  room.hunterShotPlayerIds = room.hunterShotPlayerIds || [];
  const firedHunterIds = new Set(room.hunterShotPlayerIds);

  while (queue.length > 0) {
    const hunterId = queue.shift();
    if (!hunterId) continue;
    if (processed.has(hunterId)) continue;
    processed.add(hunterId);

    if (!hunterIds.has(hunterId)) continue;
    if (firedHunterIds.has(hunterId)) continue;
    if (!(room.deadPlayers || []).includes(hunterId)) continue;

    const targetId = room.hunterTargetTonight?.[hunterId] ?? null;
    firedHunterIds.add(hunterId);
    room.hunterShotPlayerIds = Array.from(firedHunterIds);

    if (!targetId) continue;
    if (targetId === hunterId) continue;
    if (!room.players.find((player) => player.id === targetId)) continue;
    if ((room.deadPlayers || []).includes(targetId)) continue;

    appendLogEntry(room, { type: "hunter_shot", phase, actorId: hunterId, targetId });
    ctx.io.to(roomId).emit("hunterShot", { hunterId, targetId });

    const cause: EliminationCause = { type: "hunter_shot" };
    room.deadPlayers = room.deadPlayers || [];
    room.deadPlayers.push(targetId);
    ctx.io.to(roomId).emit("playerKilled", targetId);

    appendLogEntry(room, {
      type: "eliminated",
      phase,
      targetIds: [targetId],
      causesByTarget: {
        [targetId]: [cause],
      },
    });

    queue.push(targetId);
  }
}
