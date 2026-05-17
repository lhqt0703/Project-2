import type { ServerContext } from "./serverContext.js";
import type { EliminationCause, GameLogEntryPhase, Room } from "./serverTypes.js";
import { appendLogEntry } from "./gameLog.js";
import { getHunters } from "./roomState.js";
import { markEliminatedWithLoveChain } from "./love.js";
import { type ProtectorSaveRecord } from "./specialRoles.js";
import { emitProtectorTarget } from "./serverEmitters.js";

type HunterShotResolution = {
  killedIds: string[];
  causesByTarget: Record<string, EliminationCause[]>;
};

type ResolveHunterShotOptions = {
  appendEliminationLog?: boolean;
};

export function resolveHunterShotsForDeaths(
  ctx: ServerContext,
  roomId: string,
  room: Room,
  newlyDeadIds: string[],
  phase: GameLogEntryPhase,
  options: ResolveHunterShotOptions = {},
): HunterShotResolution {
  const appendEliminationLog = options.appendEliminationLog ?? true;
  const killedIds: string[] = [];
  const causesByTarget: Record<string, EliminationCause[]> = {};
  const queue = Array.from(new Set(newlyDeadIds));
  const processed = new Set<string>();
  const hunterIds = new Set(getHunters(room));
  const protectorSaves: ProtectorSaveRecord[] = [];

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
    const newlyDead = markEliminatedWithLoveChain(ctx, roomId, room, targetId, cause, phase, {
      eliminatedIds: killedIds,
      causesByTarget,
      protectorSaves,
    });

    while (protectorSaves.length) {
      const save = protectorSaves.shift()!;
      appendLogEntry(room, {
        type: "protector_save",
        phase,
        actorId: save.actorId,
        targetId: save.targetId,
        cause: save.cause,
        permanent: save.permanent,
      });
      if (save.actorId) {
        emitProtectorTarget(roomId, save.actorId);
      }
    }

    if (appendEliminationLog && newlyDead.length) {
      appendLogEntry(room, {
        type: "eliminated",
        phase,
        targetIds: newlyDead,
        causesByTarget: Object.fromEntries(newlyDead.map((id) => [id, causesByTarget[id] || []])),
      });
    }

    queue.push(...newlyDead);
  }

  return { killedIds, causesByTarget };
}
