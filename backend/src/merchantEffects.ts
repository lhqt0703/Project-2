import type { ServerContext } from "./serverContext.js";
import type { EliminationCause, GameLogEntryPhase, Room } from "./serverTypes.js";
import { markEliminatedWithLoveChain } from "./love.js";
import { getAdjacentPlayerIds, hasActiveMerchantItem } from "./merchant.js";
import type { ProtectorSaveRecord } from "./specialRoles.js";

type GunpowderOptions = {
  initialDead?: Set<string>;
  eliminatedIds?: string[];
  causesByTarget?: Record<string, EliminationCause[]>;
  protectorSaves?: ProtectorSaveRecord[];
  loveLinkDeaths?: { sourceId: string; targetId: string }[];
};

export function triggerMerchantGunpowderExplosion(
  ctx: ServerContext,
  roomId: string,
  room: Room,
  sourceId: string,
  phase: GameLogEntryPhase,
  options: GunpowderOptions = {},
) {
  if (!hasActiveMerchantItem(room, sourceId, "gunpowder-barrel")) return [];
  if ((room.merchantGunpowderExplodedPlayerIdsTonight || []).includes(sourceId)) return [];

  room.merchantGunpowderExplodedPlayerIdsTonight = Array.from(
    new Set([...(room.merchantGunpowderExplodedPlayerIdsTonight || []), sourceId]),
  );

  const newlyDead: string[] = [];
  for (const targetId of getAdjacentPlayerIds(room, sourceId)) {
    if ((room.deadPlayers || []).includes(targetId)) continue;
    const cause: EliminationCause = { type: "merchant_gunpowder", sourceId };
    const killed = markEliminatedWithLoveChain(ctx, roomId, room, targetId, cause, phase, options);
    for (const id of killed) {
      if (!newlyDead.includes(id)) newlyDead.push(id);
    }
  }
  return newlyDead;
}
