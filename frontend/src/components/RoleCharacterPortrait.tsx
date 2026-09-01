import { useEffect, useMemo, useState } from "react";
import {
  getRolePortraitSrc,
  hasDarkRolePortraitOverlay,
} from "../utils/rolePortraitAssets";

const FADE_OUT_MS = 280;

export default function RoleCharacterPortrait({
  role,
  backgroundAssetOverride,
  gameMode,
}: {
  role: string | null;
  backgroundAssetOverride?: string | null;
  gameMode?: string;
}) {
  const [renderedRole, setRenderedRole] = useState<string | null>(null);
  const [renderedBackgroundAssetOverride, setRenderedBackgroundAssetOverride] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);

  const portraitSrc = useMemo(
    () => getRolePortraitSrc(renderedRole, renderedBackgroundAssetOverride, gameMode),
    [renderedBackgroundAssetOverride, renderedRole, gameMode]
  );
  const hasDarkOverlay = renderedRole ? hasDarkRolePortraitOverlay(renderedRole) : false;

  useEffect(() => {
    const nextPortraitSrc = getRolePortraitSrc(role, backgroundAssetOverride, gameMode);
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
  }, [backgroundAssetOverride, role, gameMode]);

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
