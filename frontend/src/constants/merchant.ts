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

export type MerchantTradeView = {
  actorId: string;
  targetId: string;
  itemId: MerchantItemId | null;
  merchantChoice: MerchantDecision | null;
  targetChoice: MerchantDecision | null;
  resolved: boolean;
  result: MerchantTradeResult | null;
  appliesNight: number | null;
};

export type MerchantPrivateState = {
  items: MerchantItemRecord[];
  activeItemIds: MerchantItemId[];
  availableStockIds: MerchantItemId[];
  trade: MerchantTradeView | null;
  lastTargetId: string | null;
  poppyGlassesProtectedTargetId: string | null;
};

export const MERCHANT_ITEM_LABELS: Record<MerchantItemId, string> = {
  "invisibility-cloak": "Áo choàng ẩn thân",
  "poppy-glasses": "Kính anh túc",
  "iron-armor": "Áo giáp sắt",
  "gunpowder-barrel": "Thùng thuốc súng",
  "mint": "Cỏ bạc hà",
  "moth-cocoon": "Kén bướm đêm",
};

export const MERCHANT_ITEM_DESCRIPTIONS: Record<MerchantItemId, string> = {
  "invisibility-cloak": "Tiên Tri soi không ra.",
  "poppy-glasses": "Thấy kết giới hoa của Bảo Vệ.",
  "iron-armor": "Chặn đạn của Thợ Săn.",
  "gunpowder-barrel": "Bị Thợ Săn bắn hoặc Phù Thủy giết sẽ nổ hai bên.",
  "mint": "Kẻ Bị Nguyền không ngửi ra nếu bản thân là sói.",
  "moth-cocoon": "Được Bảo Vệ chọn thì kết giới tồn tại thêm một đêm.",
};

export const EMPTY_MERCHANT_PRIVATE_STATE: MerchantPrivateState = {
  items: [],
  activeItemIds: [],
  availableStockIds: [...MERCHANT_ITEM_IDS],
  trade: null,
  lastTargetId: null,
  poppyGlassesProtectedTargetId: null,
};
