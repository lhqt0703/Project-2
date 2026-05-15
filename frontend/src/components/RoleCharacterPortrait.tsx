import { useEffect, useMemo, useState } from "react";
import { ELEMENTAL_ROLE_SET } from "../constants/elemental";

const rolePortraitImages = import.meta.glob<string>("../assets/*.png", {
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
const FADE_OUT_MS = 280;
const WOLF_ROLE_NAMES = new Set(["sói", "sói con"]);
const HYBRID_ROLE_NAMES = new Set(["bán sói", "linh sói"]);
const VILLAGER_BACKGROUND_ASSET = "Nền dân";
const WOLF_BACKGROUND_ASSET = "Nền sói";
export const HYBRID_BACKGROUND_ASSET = "Nền lai";

function normalizeRoleName(value: string) {
  return value.normalize("NFC").trim().toLowerCase();
}

const ELEMENTAL_ROLE_NAMES = new Set(Array.from(ELEMENTAL_ROLE_SET, (role) => normalizeRoleName(role)));

function getAssetName(path: string) {
  return path.split("/").pop()?.replace(/\.png$/i, "") ?? "";
}

const rolePortraitByName = Object.fromEntries(
  Object.entries(rolePortraitImages).map(([path, src]) => [normalizeRoleName(getAssetName(path)), src])
);

function getRolePortraitSrc(role: string | null | undefined, backgroundAssetOverride?: string | null) {
  if (!role) return null;

  const normalizedRole = normalizeRoleName(role);
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

export default function RoleCharacterPortrait({ role, backgroundAssetOverride }: { role: string | null; backgroundAssetOverride?: string | null }) {
  const [renderedRole, setRenderedRole] = useState<string | null>(null);
  const [renderedBackgroundAssetOverride, setRenderedBackgroundAssetOverride] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);

  const portraitSrc = useMemo(() => getRolePortraitSrc(renderedRole, renderedBackgroundAssetOverride), [renderedBackgroundAssetOverride, renderedRole]);
  const hasDarkOverlay = renderedRole ? !NO_DARK_OVERLAY_ROLE_NAMES.has(normalizeRoleName(renderedRole)) : false;

  useEffect(() => {
    const nextPortraitSrc = getRolePortraitSrc(role, backgroundAssetOverride);
    let firstFrame: number | null = null;
    let secondFrame: number | null = null;
    let timeout: number | null = null;

    if (role && nextPortraitSrc) {
      firstFrame = window.requestAnimationFrame(() => {
        setVisible(false);
        setRenderedRole(role);
        setRenderedBackgroundAssetOverride(backgroundAssetOverride || null);

        secondFrame = window.requestAnimationFrame(() => {
          setVisible(true);
        });
      });

      return () => {
        if (firstFrame !== null) window.cancelAnimationFrame(firstFrame);
        if (secondFrame !== null) window.cancelAnimationFrame(secondFrame);
      };
    }

    firstFrame = window.requestAnimationFrame(() => {
      setVisible(false);
      timeout = window.setTimeout(() => {
        setRenderedRole(null);
        setRenderedBackgroundAssetOverride(null);
      }, FADE_OUT_MS);
    });

    return () => {
      if (firstFrame !== null) window.cancelAnimationFrame(firstFrame);
      if (timeout !== null) window.clearTimeout(timeout);
    };
  }, [backgroundAssetOverride, role]);

  if (!renderedRole || !portraitSrc) return null;

  return (
    <div
      className={`role-character-portrait ${visible ? "is-visible" : "is-hiding"} ${hasDarkOverlay ? "has-dark-overlay" : ""}`}
      aria-hidden="true"
    >
      <img className="role-character-portrait__image" src={portraitSrc} alt="" />
    </div>
  );
}
