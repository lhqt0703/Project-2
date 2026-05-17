import type { EliminationCause, Room } from "./serverTypes.js";

export const VILLAGE_CHIEF_ROLE = "Trưởng làng";
export const PROTECTOR_ROLE = "Hộ nhân";
export const PROTECTOR_PERMANENT_BUFF_ID = "protector-immortality-permanent";

export type ProtectorSaveRecord = {
  actorId: string | null;
  targetId: string;
  cause: EliminationCause;
  permanent: boolean;
};

export function getVillageChiefId(room: Room): string | null {
  return room.players.find((player) => room.playerRoles?.[player.id] === VILLAGE_CHIEF_ROLE)?.id || null;
}

export function isVillageChief(room: Room, playerId: string) {
  return room.playerRoles?.[playerId] === VILLAGE_CHIEF_ROLE;
}

export function isVillageChiefRevealed(room: Room, playerId: string) {
  return room.publicRevealedRolesByPlayerId?.[playerId] === VILLAGE_CHIEF_ROLE;
}

export function revealRolePublicly(room: Room, playerId: string) {
  const role = room.playerRoles?.[playerId];
  if (!role) return false;
  room.publicRevealedRolesByPlayerId = room.publicRevealedRolesByPlayerId || {};
  if (room.publicRevealedRolesByPlayerId[playerId] === role) return false;
  room.publicRevealedRolesByPlayerId[playerId] = role;
  return true;
}

export function getDayVoteWeight(room: Room, voterId: string) {
  if (isVillageChief(room, voterId)) return 2;
  return 1;
}

export function isProtectorImmortalityPermanent(room: Room) {
  if (room.protectorImmortalityPermanent) return true;
  if (room.elementalSelectedBuffId !== PROTECTOR_PERMANENT_BUFF_ID) return false;
  const appliesNight = room.elementalSelectedBuffAppliesNight;
  if (!appliesNight) return false;
  return appliesNight <= (room.nightCount || 0);
}

export function tryUseProtectorImmortality(
  room: Room,
  targetId: string,
  cause: EliminationCause,
): ProtectorSaveRecord | null {
  if (cause.type === "day_vote" || cause.type === "trial_verdict") return null;
  if (!room.protectorTargetId || room.protectorTargetId !== targetId) return null;
  if (!room.players.find((player) => player.id === targetId)) return null;

  const permanent = isProtectorImmortalityPermanent(room);
  const record: ProtectorSaveRecord = {
    actorId: room.protectorActorId || null,
    targetId,
    cause,
    permanent,
  };

  if (!permanent) {
    room.protectorTargetId = null;
    room.protectorTargetSetNight = null;
  }

  return record;
}

export function clearProtectorTargetIfDead(room: Room, playerId: string) {
  if (room.protectorTargetId !== playerId) return;
  room.protectorTargetId = null;
  room.protectorTargetSetNight = null;
}
