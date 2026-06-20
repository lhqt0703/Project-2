import type { ServerContext } from "./serverContext.js";
import { ensureRoomGameRules, type EliminationCause, type GameLogEntryPhase, type Room } from "./serverTypes.js";
import { appendLogEntry } from "./gameLog.js";
import { appendGameEvent } from "./gameEvent.js";
import { getHunters } from "./roomState.js";
import { markEliminatedWithLoveChain, isLovePairMemberAwayAt } from "./love.js";
import { triggerMerchantGunpowderExplosion } from "./merchantEffects.js";
import { hasActiveMerchantItem } from "./merchant.js";
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
  const loveLinkDeaths: { sourceId: string; targetId: string }[] = [];

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

    if (isLovePairMemberAwayAt(room, targetId, Date.now(), true)) {
      const playerName = room.players.find(p => p.id === targetId)?.name || targetId;
      appendLogEntry(room, {
        type: "custom_log",
        phase,
        message: `[Cặp đôi bỏ trốn] Thợ săn bắn ${playerName} nhưng không trúng do cặp đôi đã quyết định ra khỏi làng.`
      });
      continue;
    }

    const blockedByArmor = hasActiveMerchantItem(room, targetId, "iron-armor");
    appendLogEntry(room, {
      type: "hunter_shot",
      phase,
      actorId: hunterId,
      targetId,
      ...(blockedByArmor ? { blockedByMerchantItem: "iron-armor" as const } : {}),
    });
    appendGameEvent(room, {
      type: "HUNTER_SHOT",
      phase,
      actorIds: [hunterId],
      targetIds: [targetId],
      metadata: { blockedByArmor },
    });
    const rules = ensureRoomGameRules(room);
    if (!(phase === "day" && !rules.hunterShotPublicInDay)) {
      ctx.io.to(roomId).emit("hunterShot", { hunterId, targetId });
    }

    if (blockedByArmor) continue;

    const cause: EliminationCause = { type: "hunter_shot" };
    const newlyDead = markEliminatedWithLoveChain(ctx, roomId, room, targetId, cause, phase, {
      eliminatedIds: killedIds,
      causesByTarget,
      protectorSaves,
      loveLinkDeaths,
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

    if (newlyDead.length) {
      while (loveLinkDeaths.length) {
        const death = loveLinkDeaths.shift()!;
        appendLogEntry(room, {
          type: "love_link_death",
          phase,
          sourceId: death.sourceId,
          targetId: death.targetId,
        });
      }
    }

    const gunpowderDeaths = newlyDead.includes(targetId)
      ? triggerMerchantGunpowderExplosion(ctx, roomId, room, targetId, phase, {
          eliminatedIds: killedIds,
          causesByTarget,
          protectorSaves,
          loveLinkDeaths,
        })
      : [];

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

    if (gunpowderDeaths.length) {
      while (loveLinkDeaths.length) {
        const death = loveLinkDeaths.shift()!;
        appendLogEntry(room, {
          type: "love_link_death",
          phase,
          sourceId: death.sourceId,
          targetId: death.targetId,
        });
      }
    }

    if (appendEliminationLog && newlyDead.length) {
      appendLogEntry(room, {
        type: "eliminated",
        phase,
        targetIds: Array.from(new Set([...newlyDead, ...gunpowderDeaths])),
        causesByTarget: Object.fromEntries(
          Array.from(new Set([...newlyDead, ...gunpowderDeaths])).map((id) => [id, causesByTarget[id] || []]),
        ),
      });
    }

    queue.push(...newlyDead, ...gunpowderDeaths);
  }

  return { killedIds, causesByTarget };
}
