import type { Room } from "./serverTypes.js";

export const CURSED_ROLE = "Kẻ bị nguyền";
export const MERCHANT_ROLE = "Tay Buôn";

export const MERCHANT_ITEM_IDS = [
  "invisibility-cloak",
  "poppy-glasses",
  "iron-armor",
  "gunpowder-barrel",
  "mint",
  "moth-cocoon",
] as const;

export type MerchantItemId = (typeof MERCHANT_ITEM_IDS)[number];
export type MerchantDecision = "up" | "down";

export type MerchantItemRecord = {
  id: MerchantItemId;
  receivedNight: number;
  appliesNight: number;
};

export type MerchantTradeResult = "success" | "failed_wolf" | "failed_villager";

export type MerchantTradeOffer = {
  actorId: string;
  targetId: string;
  itemId: MerchantItemId;
  merchantChoice: MerchantDecision;
  targetChoice?: MerchantDecision | null;
  resolved?: boolean;
  result?: MerchantTradeResult | null;
  night: number;
  appliesNight: number;
  createdAt: number;
};

export const MERCHANT_ITEM_LABELS: Record<MerchantItemId, string> = {
  "invisibility-cloak": "Áo choàng ẩn thân",
  "poppy-glasses": "Kính anh túc",
  "iron-armor": "Áo giáp sắt",
  "gunpowder-barrel": "Thùng thuốc súng",
  "mint": "Cỏ bạc hà",
  "moth-cocoon": "Kén bướm đêm",
};

export function isMerchantItemId(value: unknown): value is MerchantItemId {
  return typeof value === "string" && (MERCHANT_ITEM_IDS as readonly string[]).includes(value);
}

export function isMerchantDecision(value: unknown): value is MerchantDecision {
  return value === "up" || value === "down";
}

function getParticipantIds(room: Room) {
  return room.players.filter((player) => player.id !== room.hostId).map((player) => player.id);
}

export function getAdjacentPlayerIds(room: Room, playerId: string) {
  const ids = getParticipantIds(room);
  const index = ids.indexOf(playerId);
  if (index < 0 || ids.length <= 1) return [];

  const left = ids[(index - 1 + ids.length) % ids.length];
  const right = ids[(index + 1) % ids.length];
  return Array.from(new Set([left, right].filter((id): id is string => !!id && id !== playerId)));
}

export function getCursedSniffAreaIds(room: Room, targetId: string) {
  return Array.from(new Set([targetId, ...getAdjacentPlayerIds(room, targetId)]));
}

export function getActiveMerchantItems(room: Room, playerId: string, night = room.nightCount || 0) {
  return (room.merchantItemsByPlayerId?.[playerId] || []).filter((item) => item.appliesNight <= night);
}

export function hasActiveMerchantItem(
  room: Room,
  playerId: string,
  itemId: MerchantItemId,
  night = room.nightCount || 0,
) {
  return getActiveMerchantItems(room, playerId, night).some((item) => item.id === itemId);
}

export function addMerchantItemToPlayer(
  room: Room,
  playerId: string,
  itemId: MerchantItemId,
  appliesNight: number,
) {
  room.merchantItemsByPlayerId = room.merchantItemsByPlayerId || {};
  const receivedNight = room.nightCount || 0;
  const records = room.merchantItemsByPlayerId[playerId] || [];
  room.merchantItemsByPlayerId[playerId] = [
    ...records,
    {
      id: itemId,
      receivedNight,
      appliesNight,
    },
  ];
}

export function getMerchantAvailableItemIds(room: Room) {
  if (!room.gameRules?.merchantSingleUseItems) return [...MERCHANT_ITEM_IDS];
  const used = new Set(room.merchantUsedItemIds || []);
  return MERCHANT_ITEM_IDS.filter((itemId) => !used.has(itemId));
}

export function getActiveGuardianProtectedTargetIds(room: Room) {
  const currentNight = room.nightCount || 0;
  const ids: string[] = [];
  if (room.protectedTonight) ids.push(room.protectedTonight);
  if (
    room.merchantGuardianCarryoverTargetId &&
    room.merchantGuardianCarryoverNight === currentNight
  ) {
    ids.push(room.merchantGuardianCarryoverTargetId);
  }
  return Array.from(new Set(ids));
}

export function getVisibleGuardianProtectionTargetId(room: Room) {
  return room.protectedTonight || getActiveGuardianProtectedTargetIds(room)[0] || null;
}

export function isProtectedByGuardian(room: Room, targetId: string, saveCutoffAt: number | null) {
  if (room.protectedTonight === targetId) {
    if (!saveCutoffAt) return true;
    return !!room.protectedTonightAt && room.protectedTonightAt <= saveCutoffAt;
  }

  const currentNight = room.nightCount || 0;
  return (
    room.merchantGuardianCarryoverTargetId === targetId &&
    room.merchantGuardianCarryoverNight === currentNight
  );
}

export function prepareMerchantNightState(room: Room) {
  const currentNight = room.nightCount || 0;
  room.cursedTargetTonight = {};
  room.merchantTradeOffersTonight = {};
  room.merchantGunpowderExplodedPlayerIdsTonight = [];
  room.merchantWolfBiteDisabledTonight = room.merchantWolfBiteDisabledNextNight === true;
  room.merchantWolfBiteDisabledNextNight = false;
  room.merchantCheeseMarkedPlayerIds = [...(room.merchantCheeseMarkedPlayerIdsNextNight || [])];
  room.merchantCheeseMarkedPlayerIdsNextNight = [];

  if (
    room.merchantGuardianCarryoverNight !== null &&
    typeof room.merchantGuardianCarryoverNight !== "undefined" &&
    room.merchantGuardianCarryoverNight < currentNight
  ) {
    room.merchantGuardianCarryoverTargetId = null;
    room.merchantGuardianCarryoverBy = null;
    room.merchantGuardianCarryoverNight = null;
  }
}

export function resetMerchantRoundState(room: Room) {
  room.cursedTargetTonight = {};
  room.cursedLastTargetByPlayerId = {};
  room.merchantTradeOffersTonight = {};
  room.merchantLastTargetByPlayerId = {};
  room.merchantItemsByPlayerId = {};
  room.merchantUsedItemIds = [];
  room.merchantWolfBiteDisabledTonight = false;
  room.merchantWolfBiteDisabledNextNight = false;
  room.merchantCheeseMarkedPlayerIds = [];
  room.merchantCheeseMarkedPlayerIdsNextNight = [];
  room.merchantGuardianCarryoverTargetId = null;
  room.merchantGuardianCarryoverBy = null;
  room.merchantGuardianCarryoverNight = null;
  room.merchantGunpowderExplodedPlayerIdsTonight = [];
}
