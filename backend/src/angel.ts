import type { ServerContext } from "./serverContext.js";
import type {
  AngelAlignmentGuess,
  AngelPrivateState,
  AngelReviveRecord,
  AngelTargetTeam,
  Room,
} from "./serverTypes.js";
import { MERCHANT_ROLE } from "./merchant.js";
import { isWolfAlignedPlayer, isWolfRole } from "./roomState.js";

export const ANGEL_ROLE = "Thiên Sứ";

export function isAngelGuess(value: unknown): value is AngelAlignmentGuess {
  return value === "wolves" || value === "villagers";
}

export function getAngelTargetTeam(room: Room, targetId: string): AngelTargetTeam {
  const role = room.playerRoles?.[targetId];
  if (role === MERCHANT_ROLE) return "third";
  if (isWolfAlignedPlayer(room, targetId) || isWolfRole(role)) return "wolves";
  return "villagers";
}

export function isAngelHiddenRevivedPlayer(room: Room, playerId: string) {
  return room.phase === "night" && (room.angelHiddenRevivedPlayerIds || []).includes(playerId);
}

export function getAngelReviveRecordForTarget(room: Room, targetId: string): AngelReviveRecord | null {
  return Object.values(room.angelReviveRecordsByAngelId || {}).find((record) => record.targetId === targetId) || null;
}

export function getEligibleAngelReviveTargetIds(room: Room, angelId: string) {
  const dead = new Set(room.deadPlayers || []);
  const alreadyChosenTargets = new Set(
    Object.values(room.angelReviveRecordsByAngelId || {}).map((record) => record.targetId),
  );

  return room.players
    .filter((player) => player.id !== room.hostId)
    .map((player) => player.id)
    .filter((playerId) => playerId !== angelId)
    .filter((playerId) => dead.has(playerId))
    .filter((playerId) => !alreadyChosenTargets.has(playerId));
}

export function markAngelReviveAvailable(room: Room, angelId: string) {
  if (room.playerRoles?.[angelId] !== ANGEL_ROLE) return false;
  if ((room.angelReviveUsedPlayerIds || []).includes(angelId)) return false;
  if (room.angelReviveRecordsByAngelId?.[angelId]) return false;

  room.angelReviveAvailableByPlayerId = room.angelReviveAvailableByPlayerId || {};
  const availableDay = room.nightCount || 0;
  if (room.angelReviveAvailableByPlayerId[angelId] === availableDay) return false;
  room.angelReviveAvailableByPlayerId[angelId] = availableDay;
  return true;
}

export function recordAngelReviveChoice(
  room: Room,
  angelId: string,
  targetId: string,
  guess: AngelAlignmentGuess,
) {
  const chosenDay = room.nightCount || 0;
  const record: AngelReviveRecord = {
    angelId,
    targetId,
    guess,
    targetTeam: getAngelTargetTeam(room, targetId),
    chosenDay,
    activeNight: chosenDay + 1,
  };

  room.angelReviveRecordsByAngelId = room.angelReviveRecordsByAngelId || {};
  room.angelReviveRecordsByAngelId[angelId] = record;
  room.angelReviveUsedPlayerIds = Array.from(new Set([...(room.angelReviveUsedPlayerIds || []), angelId]));
  if (room.angelReviveAvailableByPlayerId) {
    delete room.angelReviveAvailableByPlayerId[angelId];
  }

  return record;
}

export function expireUnusedAngelReviveOpportunities(room: Room) {
  const currentNight = room.nightCount || 0;
  const available = room.angelReviveAvailableByPlayerId || {};
  for (const [angelId, availableDay] of Object.entries(available)) {
    if (availableDay < currentNight) {
      delete available[angelId];
    }
  }
}

export function activateAngelRevivesForNight(room: Room) {
  const currentNight = room.nightCount || 0;
  const dead = new Set(room.deadPlayers || []);
  const activated: AngelReviveRecord[] = [];

  for (const record of Object.values(room.angelReviveRecordsByAngelId || {})) {
    if (record.activeNight !== currentNight) continue;
    if (!dead.has(record.targetId)) continue;
    if (!room.players.find((player) => player.id === record.targetId)) continue;
    activated.push(record);
  }

  if (activated.length) {
    room.angelHiddenRevivedPlayerIds = Array.from(
      new Set([...(room.angelHiddenRevivedPlayerIds || []), ...activated.map((record) => record.targetId)]),
    );
  }

  return activated;
}

export function revealAngelHiddenRevivesForDay(room: Room) {
  const hiddenIds = Array.from(new Set(room.angelHiddenRevivedPlayerIds || []));
  if (!hiddenIds.length) return [] as AngelReviveRecord[];

  const hiddenSet = new Set(hiddenIds);
  const dead = new Set(room.deadPlayers || []);
  const revealedRecords = Object.values(room.angelReviveRecordsByAngelId || {}).filter(
    (record) => hiddenSet.has(record.targetId) && dead.has(record.targetId),
  );

  if (revealedRecords.length) {
    const revealIds = new Set(revealedRecords.map((record) => record.targetId));
    room.deadPlayers = (room.deadPlayers || []).filter((playerId) => !revealIds.has(playerId));
  }
  room.angelHiddenRevivedPlayerIds = [];

  return revealedRecords;
}

export function shouldDeferEndGameForAngel(room: Room) {
  const dead = new Set(room.deadPlayers || []);
  const records = Object.values(room.angelReviveRecordsByAngelId || {});
  const hiddenRevived = new Set(room.angelHiddenRevivedPlayerIds || []);
  const currentNight = room.nightCount || 0;
  if (records.some((record) =>
    dead.has(record.targetId) &&
    (currentNight < record.activeNight || hiddenRevived.has(record.targetId))
  )) return true;

  if (room.phase !== "day") return false;
  for (const angelId of Object.keys(room.angelReviveAvailableByPlayerId || {})) {
    if (getEligibleAngelReviveTargetIds(room, angelId).length > 0) return true;
  }
  return false;
}

export function buildAngelPrivateState(room: Room, playerId: string): AngelPrivateState {
  const recordByAngel = room.angelReviveRecordsByAngelId?.[playerId] || null;
  const recordForTarget = getAngelReviveRecordForTarget(room, playerId);
  const hiddenRevived = isAngelHiddenRevivedPlayer(room, playerId);
  const currentNight = room.nightCount || 0;
  const pendingRevived =
    !!recordForTarget &&
    currentNight < recordForTarget.activeNight &&
    !hiddenRevived &&
    (room.deadPlayers || []).includes(playerId);
  const availableDay = room.angelReviveAvailableByPlayerId?.[playerId] ?? null;
  const isAngel = room.playerRoles?.[playerId] === ANGEL_ROLE;
  const canRevive =
    isAngel &&
    room.phase === "day" &&
    availableDay === (room.nightCount || 0) &&
    !recordByAngel &&
    !(room.angelReviveUsedPlayerIds || []).includes(playerId) &&
    getEligibleAngelReviveTargetIds(room, playerId).length > 0;

  return {
    canRevive,
    availableDay,
    selectedTargetId: recordByAngel?.targetId ?? null,
    selectedGuess: recordByAngel?.guess ?? null,
    reviveStage: hiddenRevived ? "hidden" : pendingRevived ? "pending" : "none",
  };
}

export function emitAngelPrivateState(ctx: ServerContext, roomId: string, room: Room, playerId: string) {
  ctx.io.to(playerId).emit("angelReviveStateUpdated", buildAngelPrivateState(room, playerId));
}

export function emitAngelPrivateStateForAll(ctx: ServerContext, roomId: string, room: Room) {
  for (const player of room.players) {
    emitAngelPrivateState(ctx, roomId, room, player.id);
  }
}
