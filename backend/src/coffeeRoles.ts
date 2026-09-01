import { appendLogEntry } from "./gameLog.js";
import { isWolfAlignedPlayer, isWolfRole } from "./roomState.js";
import {
  ensureRoomGameRules,
  type CoffeeDelayedPoison,
  type CoffeeHerbRole,
  type CoffeeRoleState,
  type Room,
  type RoomGameRules,
} from "./serverTypes.js";

export const COFFEE_MAKER_ROLE = "Người pha cà phê" as const;
export const LINH_CHI_ROLE = "Linh Chi" as const;
export const DONG_TRUNG_ROLE = "Đông Trùng" as const;
export const COFFEE_HERB_ROLES: readonly CoffeeHerbRole[] = [LINH_CHI_ROLE, DONG_TRUNG_ROLE];

const SECONDARY_INELIGIBLE_ROLES = new Set([
  COFFEE_MAKER_ROLE,
  "Bán sói",
  "Linh sói",
  "Tay Buôn",
  "Thiên Sứ",
  "Song Trùng",
]);

export type CoffeePrivateState = {
  secondaryRole: CoffeeHerbRole | null;
  makerTargetsTonight: [string, string] | null;
  makerUsesUsed: number;
  makerMaxUses: number;
  makerFoundBoth: boolean;
  herbTargetTonight: string | null;
  herbFoundMaker: boolean;
  wolfToxinLevel: 0 | 1 | 2;
  wolfVotingStunned: boolean;
  wolfStunPersistent: boolean;
};

export type CoffeeMakerSearchResult =
  | { ok: true; foundBoth: boolean }
  | { ok: false; reason: "invalid_targets" | "already_used_tonight" | "no_uses_left" | "already_completed" };

export type CoffeeHerbSearchResult =
  | { ok: true; foundMaker: boolean; makerId: string | null }
  | { ok: false; reason: "invalid_target" | "already_used_tonight" | "secondary_card" | "bonus_already_granted" };

export type CoffeeHerbBiteEffect = {
  herbRole: CoffeeHerbRole;
  branch: "toxin" | "stun";
  level: 1 | 2;
  persistent: boolean;
};

export function createCoffeeRoleState(): CoffeeRoleState {
  return {
    secondaryRolesByPlayerId: {},
    makerSearchByPlayerId: {},
    makerUseCountByPlayerId: {},
    makerBonusUsesByPlayerId: {},
    makerFoundHerbsByPlayerId: {},
    makerFoundBothPlayerIds: [],
    makerKilledByWolfPlayerIds: [],
    herbSearchByPlayerId: {},
    herbBonusGrantedPlayerIds: [],
    preFoundBittenHerbs: [],
    postFoundBittenHerbs: [],
    wolfToxinLevel: 0,
    delayedPoisons: [],
    wolfStunnedNight: null,
    wolfStunPersistent: false,
  };
}

export function ensureCoffeeRoleState(room: Room): CoffeeRoleState {
  room.coffeeRoleState = room.coffeeRoleState || createCoffeeRoleState();
  room.coffeeRoleState.makerFoundHerbsByPlayerId ||= {};
  return room.coffeeRoleState;
}

export function resetCoffeeRoleState(room: Room) {
  room.coffeeRoleState = createCoffeeRoleState();
}

export function resetCoffeeNightState(room: Room) {
  const state = ensureCoffeeRoleState(room);
  state.makerSearchByPlayerId = {};
  state.herbSearchByPlayerId = {};
}

export function isCoffeeHerbRole(role: string | null | undefined): role is CoffeeHerbRole {
  return role === LINH_CHI_ROLE || role === DONG_TRUNG_ROLE;
}

export function getSelectedCoffeeHerbRoles(room: Room): CoffeeHerbRole[] {
  return COFFEE_HERB_ROLES.filter((role) => (room.roles || []).includes(role));
}

export function getPrimaryRolesFromSelection(roles: readonly string[], rules: RoomGameRules): string[] {
  if (rules.coffeeHerbCardMode !== "secondary") return [...roles];
  return roles.filter((role) => !isCoffeeHerbRole(role));
}

export function getPrimaryRolesForDeal(room: Room): string[] {
  return getPrimaryRolesFromSelection(room.roles || [], ensureRoomGameRules(room));
}

export function getPrimaryRoleCount(room: Room) {
  return getPrimaryRolesForDeal(room).length;
}

function getPlayerName(room: Room, playerId: string) {
  return room.players.find((player) => player.id === playerId)?.name || playerId;
}

function shuffled<T>(values: T[], random: () => number): T[] {
  const next = [...values];
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [next[index], next[swapIndex]] = [next[swapIndex]!, next[index]!];
  }
  return next;
}

function canReceiveSecondaryHerb(room: Room, playerId: string) {
  const role = room.playerRoles?.[playerId];
  if (!role || SECONDARY_INELIGIBLE_ROLES.has(role) || isWolfRole(role)) return false;
  return true;
}

export function assignCoffeeSecondaryRoles(
  room: Room,
  random: () => number = Math.random,
): { ok: true } | { ok: false; required: number; eligible: number } {
  const state = ensureCoffeeRoleState(room);
  const rules = ensureRoomGameRules(room);
  if (rules.coffeeHerbCardMode !== "secondary") {
    state.secondaryRolesByPlayerId = {};
    return { ok: true };
  }

  const herbs = getSelectedCoffeeHerbRoles(room);
  const eligibleIds = shuffled(
    Object.keys(room.playerRoles || {}).filter((playerId) => canReceiveSecondaryHerb(room, playerId)),
    random,
  );
  if (eligibleIds.length < herbs.length) {
    return { ok: false, required: herbs.length, eligible: eligibleIds.length };
  }

  const secondaryRolesByPlayerId: CoffeeRoleState["secondaryRolesByPlayerId"] = {};
  herbs.forEach((herbRole, index) => {
    secondaryRolesByPlayerId[eligibleIds[index]!] = herbRole;
  });
  state.secondaryRolesByPlayerId = secondaryRolesByPlayerId;
  return { ok: true };
}

export function getCoffeeHerbRoleForPlayer(room: Room, playerId: string): CoffeeHerbRole | null {
  const primaryRole = room.playerRoles?.[playerId];
  if (isCoffeeHerbRole(primaryRole)) return primaryRole;
  return ensureCoffeeRoleState(room).secondaryRolesByPlayerId[playerId] || null;
}

export function getCoffeeMakerIds(room: Room) {
  return Object.entries(room.playerRoles || {})
    .filter(([, role]) => role === COFFEE_MAKER_ROLE)
    .map(([playerId]) => playerId);
}

export function hasCoffeeMakerFoundBoth(room: Room) {
  return ensureCoffeeRoleState(room).makerFoundBothPlayerIds.length > 0;
}

export function getCoffeeMakerMaxUses(room: Room, playerId: string) {
  const rules = ensureRoomGameRules(room);
  const baseUses = Math.max(0, Math.floor(rules.coffeeMakerMaxUses ?? 3));
  if (baseUses === 0) return 0;
  return baseUses + (ensureCoffeeRoleState(room).makerBonusUsesByPlayerId[playerId] || 0);
}

export function performCoffeeMakerSearch(
  room: Room,
  actorId: string,
  targetIds: readonly string[],
): CoffeeMakerSearchResult {
  const uniqueTargetIds = [...new Set(targetIds)];
  const participantIds = new Set(room.players.filter((player) => player.id !== room.hostId).map((player) => player.id));
  const deadIds = new Set(room.deadPlayers || []);
  if (
    uniqueTargetIds.length !== 2
    || uniqueTargetIds.includes(actorId)
    || uniqueTargetIds.some((targetId) => !participantIds.has(targetId) || deadIds.has(targetId))
  ) {
    return { ok: false, reason: "invalid_targets" };
  }

  const state = ensureCoffeeRoleState(room);
  const night = room.nightCount || 0;
  if (state.makerFoundBothPlayerIds.includes(actorId)) return { ok: false, reason: "already_completed" };
  if (state.makerSearchByPlayerId[actorId]?.night === night) return { ok: false, reason: "already_used_tonight" };
  const used = state.makerUseCountByPlayerId[actorId] || 0;
  const maxUses = getCoffeeMakerMaxUses(room, actorId);
  if (maxUses > 0 && used >= maxUses) return { ok: false, reason: "no_uses_left" };

  const targets = [uniqueTargetIds[0]!, uniqueTargetIds[1]!] as [string, string];
  const matches = targets.flatMap((targetId) => {
    const herbRole = getCoffeeHerbRoleForPlayer(room, targetId);
    return herbRole ? [{ targetId, herbRole }] : [];
  });
  const selectedHerbs = new Set(matches.map(({ herbRole }) => herbRole));
  const rules = ensureRoomGameRules(room);
  const previouslyFoundHerbs = state.makerFoundHerbsByPlayerId[actorId] || [];
  const foundHerbs = rules.coffeeMakerHardMode === true
    ? [...selectedHerbs]
    : [...new Set([...previouslyFoundHerbs, ...selectedHerbs])];
  const foundBoth = foundHerbs.includes(LINH_CHI_ROLE) && foundHerbs.includes(DONG_TRUNG_ROLE);

  state.makerSearchByPlayerId[actorId] = { night, targetIds: targets };
  state.makerUseCountByPlayerId[actorId] = used + 1;
  state.makerFoundHerbsByPlayerId[actorId] = foundHerbs;
  if (foundBoth) state.makerFoundBothPlayerIds.push(actorId);

  appendLogEntry(room, {
    type: "coffee_maker_search",
    phase: "night",
    actorId,
    targetIds: targets,
    ...(rules.coffeeMakerRevealSearchResults === true ? { matches, foundHerbs } : {}),
  });
  appendLogEntry(room, {
    type: "custom_log",
    phase: "night",
    message: `${getPlayerName(room, actorId)} (${COFFEE_MAKER_ROLE}) đã chọn ${targets.map((id) => getPlayerName(room, id)).join(" và ")}. Kết quả: ${matches.length > 0 ? matches.map(({ targetId, herbRole }) => `${getPlayerName(room, targetId)} là ${herbRole}`).join(", ") : "không trúng thảo dược nào"}; ${foundBoth ? "đã tìm đủ Linh Chi và Đông Trùng" : rules.coffeeMakerHardMode === true ? "không tìm đủ cặp trong cùng đêm" : `tiến độ cộng dồn ${foundHerbs.length}/2`}.`,
  });

  return { ok: true, foundBoth };
}

export function performCoffeeHerbSearch(room: Room, actorId: string, targetId: string): CoffeeHerbSearchResult {
  const herbRole = getCoffeeHerbRoleForPlayer(room, actorId);
  if (!herbRole || room.playerRoles?.[actorId] !== herbRole) return { ok: false, reason: "secondary_card" };
  const deadIds = new Set(room.deadPlayers || []);
  const isParticipant = room.players.some((player) => player.id === targetId && player.id !== room.hostId);
  if (!isParticipant || targetId === actorId || deadIds.has(targetId)) return { ok: false, reason: "invalid_target" };

  const state = ensureCoffeeRoleState(room);
  const night = room.nightCount || 0;
  if (state.herbSearchByPlayerId[actorId]?.night === night) return { ok: false, reason: "already_used_tonight" };
  if (state.herbBonusGrantedPlayerIds.includes(actorId)) return { ok: false, reason: "bonus_already_granted" };

  const foundMaker = room.playerRoles?.[targetId] === COFFEE_MAKER_ROLE;
  state.herbSearchByPlayerId[actorId] = { night, targetId };
  if (foundMaker) {
    state.herbBonusGrantedPlayerIds.push(actorId);
    state.makerBonusUsesByPlayerId[targetId] = (state.makerBonusUsesByPlayerId[targetId] || 0) + 1;
  }

  appendLogEntry(room, { type: "coffee_herb_search", phase: "night", actorId, targetId, herbRole });
  appendLogEntry(room, {
    type: "custom_log",
    phase: "night",
    message: `${getPlayerName(room, actorId)} (${herbRole}) đã chọn ${getPlayerName(room, targetId)}. Kết quả: ${foundMaker ? `tìm đúng ${COFFEE_MAKER_ROLE}` : "không tìm thấy"}.`,
  });

  return { ok: true, foundMaker, makerId: foundMaker ? targetId : null };
}

export function recordCoffeeHerbWolfBite(room: Room, targetId: string): CoffeeHerbBiteEffect | null {
  const herbRole = getCoffeeHerbRoleForPlayer(room, targetId);
  if (!herbRole) return null;
  const state = ensureCoffeeRoleState(room);
  const foundBoth = hasCoffeeMakerFoundBoth(room);
  const bittenHerbs = foundBoth ? state.postFoundBittenHerbs : state.preFoundBittenHerbs;
  if (bittenHerbs.includes(herbRole)) return null;
  bittenHerbs.push(herbRole);

  const level = Math.min(2, bittenHerbs.length) as 1 | 2;
  if (!foundBoth) {
    state.wolfToxinLevel = level;
    appendLogEntry(room, {
      type: "custom_log",
      phase: "night",
      message: `Phe Sói cắn trúng ${getPlayerName(room, targetId)} (${herbRole}) và nhận ${level === 1 ? "Giảm hấp thụ độc tố" : "Miễn nhiễm độc tố"}.`,
    });
    return { herbRole, branch: "toxin", level, persistent: false };
  }

  state.wolfStunnedNight = room.nightCount || 0;
  const unkilledFoundMakerIds = state.makerFoundBothPlayerIds.filter(
    (playerId) => !state.makerKilledByWolfPlayerIds.includes(playerId),
  );
  state.wolfStunPersistent = level === 2 && unkilledFoundMakerIds.length > 0;
  if (level === 2 && !state.wolfStunPersistent) {
    state.wolfStunnedNight = null;
  }
  appendLogEntry(room, {
    type: "custom_log",
    phase: "night",
    message: level === 2 && !state.wolfStunPersistent
      ? `Phe Sói cắn trúng ${getPlayerName(room, targetId)} (${herbRole}), nhưng hiệu ứng choáng kéo dài được hóa giải vì ${COFFEE_MAKER_ROLE} đã bị Sói giết trước đó.`
      : `Phe Sói cắn trúng ${getPlayerName(room, targetId)} (${herbRole}) và bị choáng ${level === 2 ? `cho đến khi giết được ${COFFEE_MAKER_ROLE}` : "trong buổi sáng kế tiếp"}.`,
  });
  return { herbRole, branch: "stun", level, persistent: state.wolfStunPersistent };
}

export function clearCoffeeWolfStunWhenMakerKilled(room: Room, targetId: string) {
  if (room.playerRoles?.[targetId] !== COFFEE_MAKER_ROLE) return false;
  const state = ensureCoffeeRoleState(room);
  if (!state.makerKilledByWolfPlayerIds.includes(targetId)) {
    state.makerKilledByWolfPlayerIds.push(targetId);
  }
  if (!state.wolfStunPersistent) return false;
  const hasUnkilledFoundMaker = state.makerFoundBothPlayerIds.some(
    (playerId) => !state.makerKilledByWolfPlayerIds.includes(playerId),
  );
  if (hasUnkilledFoundMaker) return false;
  state.wolfStunPersistent = false;
  state.wolfStunnedNight = null;
  appendLogEntry(room, {
    type: "custom_log",
    phase: "night",
    message: `Phe Sói đã giết ${getPlayerName(room, targetId)} (${COFFEE_MAKER_ROLE}) nên hiệu ứng choáng được giải trừ.`,
  });
  return true;
}

export function isCoffeeWolfVotingStunned(room: Room, playerId: string) {
  if (room.gameMode !== "da_nghich") return false;
  if (!isWolfAlignedPlayer(room, playerId)) return false;
  const state = ensureCoffeeRoleState(room);
  return state.wolfStunPersistent || state.wolfStunnedNight === (room.nightCount || 0);
}

export function getCoffeeWolfPoisonDisposition(room: Room, targetId: string): "normal" | "delayed" | "immune" {
  if (room.gameMode !== "da_nghich") return "normal";
  if (!isWolfAlignedPlayer(room, targetId)) return "normal";
  const level = ensureCoffeeRoleState(room).wolfToxinLevel;
  return level === 2 ? "immune" : level === 1 ? "delayed" : "normal";
}

export function scheduleCoffeeDelayedPoison(room: Room, targetId: string, sourceActorId?: string) {
  const state = ensureCoffeeRoleState(room);
  const poisonedNight = room.nightCount || 0;
  if (state.delayedPoisons.some((poison) => poison.targetId === targetId)) return;
  const poison: CoffeeDelayedPoison = { targetId, poisonedNight, dueNight: poisonedNight + 1 };
  if (sourceActorId) poison.sourceActorId = sourceActorId;
  state.delayedPoisons.push(poison);
  appendLogEntry(room, {
    type: "custom_log",
    phase: "night",
    message: `${getPlayerName(room, targetId)} thuộc phe Sói bị trúng bình độc nhưng hiệu lực được trì hoãn đến sáng kế tiếp nữa.`,
  });
}

export function takeDueCoffeeDelayedPoisons(room: Room): CoffeeDelayedPoison[] {
  const state = ensureCoffeeRoleState(room);
  const currentNight = room.nightCount || 0;
  const due = state.delayedPoisons.filter((poison) => poison.dueNight <= currentNight);
  state.delayedPoisons = state.delayedPoisons.filter((poison) => poison.dueNight > currentNight);
  return due;
}

export function getCoffeePrivateState(room: Room, playerId: string): CoffeePrivateState {
  const state = ensureCoffeeRoleState(room);
  const makerSearch = state.makerSearchByPlayerId[playerId];
  const herbSearch = state.herbSearchByPlayerId[playerId];
  const makerUsesUsed = state.makerUseCountByPlayerId[playerId] || 0;
  const isWolfAligned = room.gameMode === "da_nghich" && isWolfAlignedPlayer(room, playerId);
  return {
    secondaryRole: state.secondaryRolesByPlayerId[playerId] || null,
    makerTargetsTonight: makerSearch?.night === (room.nightCount || 0) ? makerSearch.targetIds : null,
    makerUsesUsed,
    makerMaxUses: getCoffeeMakerMaxUses(room, playerId),
    makerFoundBoth: state.makerFoundBothPlayerIds.includes(playerId),
    herbTargetTonight: herbSearch?.night === (room.nightCount || 0) ? herbSearch.targetId : null,
    herbFoundMaker: state.herbBonusGrantedPlayerIds.includes(playerId),
    wolfToxinLevel: isWolfAligned ? state.wolfToxinLevel : 0,
    wolfVotingStunned: isCoffeeWolfVotingStunned(room, playerId),
    wolfStunPersistent: isWolfAligned && state.wolfStunPersistent,
  };
}
