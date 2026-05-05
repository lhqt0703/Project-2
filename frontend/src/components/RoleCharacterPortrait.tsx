import { useEffect, useMemo, useState } from "react";

const rolePortraitImages = import.meta.glob<string>("../assets/*.png", {
  eager: true,
  import: "default",
});

const ROLE_IMAGE_ALIASES: Record<string, string> = {
  "tự nhiên": "Tự nhiên",
  "sấm sét": "Sét",
  "băng giá": "Băng",
};

const BLANK_ROLE_NAMES = new Set(["dân làng", "dân làng nguyên tố"]);
const NO_DARK_OVERLAY_ROLE_NAMES = new Set(["tiên tri", "phù thủy", "thợ săn"]);
const FADE_OUT_MS = 280;

function normalizeRoleName(value: string) {
  return value.normalize("NFC").trim().toLowerCase();
}

function getAssetName(path: string) {
  return path.split("/").pop()?.replace(/\.png$/i, "") ?? "";
}

const rolePortraitByName = Object.fromEntries(
  Object.entries(rolePortraitImages).map(([path, src]) => [normalizeRoleName(getAssetName(path)), src])
);

function getRolePortraitSrc(role: string | null | undefined) {
  if (!role) return null;

  const normalizedRole = normalizeRoleName(role);
  if (BLANK_ROLE_NAMES.has(normalizedRole)) return null;

  const assetName = ROLE_IMAGE_ALIASES[normalizedRole] ?? role;
  return rolePortraitByName[normalizeRoleName(assetName)] ?? null;
}

export default function RoleCharacterPortrait({ role }: { role: string | null }) {
  const [renderedRole, setRenderedRole] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);

  const portraitSrc = useMemo(() => getRolePortraitSrc(renderedRole), [renderedRole]);
  const hasDarkOverlay = renderedRole ? !NO_DARK_OVERLAY_ROLE_NAMES.has(normalizeRoleName(renderedRole)) : false;

  useEffect(() => {
    const nextPortraitSrc = getRolePortraitSrc(role);
    let firstFrame: number | null = null;
    let secondFrame: number | null = null;
    let timeout: number | null = null;

    if (role && nextPortraitSrc) {
      firstFrame = window.requestAnimationFrame(() => {
        setVisible(false);
        setRenderedRole(role);

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
      }, FADE_OUT_MS);
    });

    return () => {
      if (firstFrame !== null) window.cancelAnimationFrame(firstFrame);
      if (timeout !== null) window.clearTimeout(timeout);
    };
  }, [role]);

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
