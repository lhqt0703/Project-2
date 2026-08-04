import { ELEMENTAL_ROLE_SET } from "../constants/elemental";

const rolePortraitImages = import.meta.glob<string>("../assets/*.{png,avif}", {
  eager: true,
  import: "default",
});

const dietQuyRolePortraitImages = import.meta.glob<string>("../assets/Diệt Quỷ/C *.avif", {
  eager: true,
  import: "default",
});

const ROLE_IMAGE_ALIASES: Record<string, string> = {
  "tự nhiên": "Tự nhiên",
  "sấm sét": "Sét",
  "băng giá": "Băng",
};

const BLANK_ROLE_NAMES = new Set(["dân làng nguyên tố"]);
const NO_DARK_OVERLAY_ROLE_NAMES = new Set(["tiên tri", "phù thủy", "thợ săn"]);
const WOLF_ROLE_NAMES = new Set(["sói", "sói con", "sói dại"]);
const HYBRID_ROLE_NAMES = new Set(["bán sói", "linh sói", "tay buôn", "thiên sứ", "song trùng"]);
export const VILLAGER_BACKGROUND_ASSET = "Nền dân";
export const WOLF_BACKGROUND_ASSET = "Nền sói";
export const HYBRID_BACKGROUND_ASSET = "Nền lai";

function normalizeRoleName(value: string) {
  return value.normalize("NFC").trim().toLowerCase();
}

const ELEMENTAL_ROLE_NAMES = new Set(Array.from(ELEMENTAL_ROLE_SET, (role) => normalizeRoleName(role)));

function getAssetName(path: string) {
  return path.split("/").pop()?.replace(/\.(png|avif)$/i, "") ?? "";
}

const rolePortraitByName = Object.fromEntries(
  Object.entries(rolePortraitImages).map(([path, src]) => [normalizeRoleName(getAssetName(path)), src])
);

const dietQuyPortraitByName = Object.fromEntries(
  Object.entries(dietQuyRolePortraitImages).map(([path, src]) => [normalizeRoleName(getAssetName(path)), src])
);

export function hasDarkRolePortraitOverlay(role: string) {
  return !NO_DARK_OVERLAY_ROLE_NAMES.has(normalizeRoleName(role));
}

export function getRolePortraitSrc(
  role: string | null | undefined,
  backgroundAssetOverride?: string | null,
  gameMode?: string
) {
  if (!role) return null;

  const normalizedRole = normalizeRoleName(role);

  if (gameMode === "diet_quy") {
    const assetName = `C ${role}`;
    return dietQuyPortraitByName[normalizeRoleName(assetName)] ?? null;
  }

  if (BLANK_ROLE_NAMES.has(normalizedRole)) return null;

  const backgroundAsset = backgroundAssetOverride
    ? backgroundAssetOverride
    : HYBRID_ROLE_NAMES.has(normalizedRole)
      ? HYBRID_BACKGROUND_ASSET
      : WOLF_ROLE_NAMES.has(normalizedRole)
        ? WOLF_BACKGROUND_ASSET
        : !ELEMENTAL_ROLE_NAMES.has(normalizedRole)
          ? VILLAGER_BACKGROUND_ASSET
          : null;

  if (backgroundAsset) {
    return rolePortraitByName[normalizeRoleName(backgroundAsset)] ?? null;
  }

  const assetName = ROLE_IMAGE_ALIASES[normalizedRole] ?? role;
  return rolePortraitByName[normalizeRoleName(assetName)] ?? null;
}
