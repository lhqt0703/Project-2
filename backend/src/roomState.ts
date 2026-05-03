import { type Room, type NightActionRole } from "./serverTypes.js";

const WOLF_ROLES = new Set(["Sói", "Sói con"]);
const SPIRIT_WOLF_ROLE = "Linh sói";

export function isWolfRole(role: string | undefined) {
  return !!role && WOLF_ROLES.has(role);
}

export function getParticipantPlayers(room: Room) {
  return room.players.filter((p) => p.id !== room.hostId);
}

export function getParticipantIds(room: Room) {
  return getParticipantPlayers(room).map((p) => p.id);
}

export function getParticipantCount(room: Room) {
  return getParticipantIds(room).length;
}

export function getAlivePlayerIds(room: Room) {
  const dead = new Set(room.deadPlayers || []);
  return getParticipantIds(room).filter((id) => !dead.has(id));
}

export function getSpiritWolfId(room: Room): string | null {
  const cached = room.spiritWolfId;
  if (cached && room.players.find((p) => p.id === cached) && room.playerRoles?.[cached] === SPIRIT_WOLF_ROLE) {
    return cached;
  }
  const found = room.players.find((p) => room.playerRoles?.[p.id] === SPIRIT_WOLF_ROLE)?.id || null;
  room.spiritWolfId = found;
  return found;
}

export function isSpiritWolfAlive(room: Room) {
  const id = getSpiritWolfId(room);
  if (!id) return false;
  return !(room.deadPlayers || []).includes(id);
}

export function isWolfAlignedPlayer(room: Room, playerId: string) {
  const role = room.playerRoles?.[playerId];
  if (isWolfRole(role)) return true;
  return room.spiritWolfWolfAligned === true && getSpiritWolfId(room) === playerId;
}

export function isPlayerConnected(room: Room, playerId: string) {
  const player = room.players.find((p) => p.id === playerId);
  return player ? player.connected !== false : false;
}

export function getActiveWolves(room: Room) {
  const allWolves = room.players
    .filter((p) => isWolfRole(room.playerRoles?.[p.id]))
    .map((p) => p.id);
  const dead = new Set(room.deadPlayers || []);
  return allWolves.filter((id) => !dead.has(id) && isPlayerConnected(room, id));
}

export function getWitches(room: Room) {
  return room.players
    .filter((p) => room.playerRoles?.[p.id] === "Phù thủy")
    .map((p) => p.id);
}

export function getHunters(room: Room) {
  return room.players
    .filter((p) => room.playerRoles?.[p.id] === "Thợ săn")
    .map((p) => p.id);
}

export function getActiveDayVoters(room: Room) {
  const dead = new Set(room.deadPlayers || []);
  const base = (room.dayVoters && room.dayVoters.length)
    ? room.dayVoters
    : getParticipantIds(room).filter((id) => !dead.has(id));

  return base
    .filter((id) => !dead.has(id))
    .filter((id) => isPlayerConnected(room, id))
    .filter((id) => !!room.players.find((p) => p.id === id));
}

export function getTrialVoters(room: Room) {
  const targetId = room.trialTargetId;
  return getActiveDayVoters(room).filter((id) => id !== targetId);
}

export function clearTrialState(room: Room) {
  if (room.trialDefenseTimer) {
    clearTimeout(room.trialDefenseTimer);
    room.trialDefenseTimer = null;
  }
  if (room.trialVerdictTimer) {
    clearTimeout(room.trialVerdictTimer);
    room.trialVerdictTimer = null;
  }

  room.trialTargetId = null;
  room.trialStage = "none";
  room.trialDefenseDeadline = null;
  room.trialVerdictDeadline = null;
  room.trialInteractionCut = false;
  room.trialInteractionActiveIds = [];
  room.trialSelectedInteractorId = null;
  room.trialSelectedInteractorIds = [];
  room.trialInteractionSelectionLimit = 0;
  room.trialInteractionQueuedIds = [];
  room.trialVotes = {};
}

export function clearNightTurnTimer(room: Room) {
  if (room.nightTurnTimer) {
    clearTimeout(room.nightTurnTimer);
    room.nightTurnTimer = null;
  }
}

export function resetNightTurnState(room: Room) {
  clearNightTurnTimer(room);
  room.nightTurnIndex = -1;
  room.nightTurnRole = null;
  room.nightTurnDeadline = null;
  room.nightTurnPaused = false;
  room.nightTurnRemainingMs = null;
  delete room.nightTurnOrderSnapshot;
}

export function ensureWitchState(room: Room, witchId: string) {
  room.witchPotions = room.witchPotions || {};
  room.witchHealTargetTonight = room.witchHealTargetTonight || {};
  room.witchPoisonTargetTonight = room.witchPoisonTargetTonight || {};

  if (!room.witchPotions[witchId]) {
    room.witchPotions[witchId] = { healUsed: false, poisonUsed: false };
  }
  if (typeof room.witchHealTargetTonight[witchId] === "undefined") {
    room.witchHealTargetTonight[witchId] = null;
  }
  if (typeof room.witchPoisonTargetTonight[witchId] === "undefined") {
    room.witchPoisonTargetTonight[witchId] = null;
  }
}

export function clearGameTimers(room: Room) {
  clearNightTurnTimer(room);
  if (room.wolfTimer) {
    clearTimeout(room.wolfTimer);
    room.wolfTimer = null;
  }
  if (room.dayDiscussionTimer) {
    clearTimeout(room.dayDiscussionTimer);
    room.dayDiscussionTimer = null;
  }
  if (room.dayTimer) {
    clearTimeout(room.dayTimer);
    room.dayTimer = null;
  }
  if (room.trialDefenseTimer) {
    clearTimeout(room.trialDefenseTimer);
    room.trialDefenseTimer = null;
  }
  if (room.trialVerdictTimer) {
    clearTimeout(room.trialVerdictTimer);
    room.trialVerdictTimer = null;
  }
}

export function resetRoomFromGameToLobby(room: Room) {
  clearGameTimers(room);
  clearTrialState(room);
  resetNightTurnState(room);

  delete room.phase;
  room.gameOver = true;
  room.winner = undefined;

  room.wolves = [];
  room.wolfVotes = {};
  room.wolfVotes2 = {};
  room.wolfLocked = {};
  room.wolfDeadline = null;
  room.killedTonight = null;
  room.killedTonightExtra = null;
  room.wolfBonusBiteThisNight = false;
  room.wolfExtraBiteNextNight = false;

  room.dayVoters = [];
  room.dayVotes = {};
  room.dayLocked = {};
  room.dayDiscussionDeadline = null;
  room.dayDeadline = null;

  room.deadPlayers = [];
  room.sharedHeartsVisible = false;
  room.playerHearts = {};
  room.protectedTonight = null;
  room.lastProtected = null;
  room.seerUsedTonight = {};
  room.hunterTargetTonight = {};
  room.witchHealTargetTonight = {};
  room.witchPoisonTargetTonight = {};
  room.spiritWolfPendingPoisonedWolfId = null;

  room.players = room.players.map((p) => ({ ...p, inGame: false }));
}
