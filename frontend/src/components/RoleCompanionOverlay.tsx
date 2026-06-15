import { useEffect, useState } from "react";
import MagicRings from "./MagicRings";

export default function RoleCompanionOverlay({
  companionRoleSrc,
  normalizedRole,
  playerFrameHeightPx,
  seerResults,
}: {
  companionRoleSrc: string | null;
  normalizedRole: string | null;
  playerFrameHeightPx: number;
  seerResults: { playerId: string; isWolf: boolean }[] | null;
}) {
  const [renderedSrc, setRenderedSrc] = useState<string | null>(null);
  const [renderedRole, setRenderedRole] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let firstFrame: number | null = null;
    let secondFrame: number | null = null;
    let timeout: number | null = null;

    if (companionRoleSrc) {
      firstFrame = window.requestAnimationFrame(() => {
        setVisible(false);
        setRenderedSrc(companionRoleSrc);
        setRenderedRole(normalizedRole);

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
        setRenderedSrc(null);
        setRenderedRole(null);
      }, 280); // FADE_OUT_MS
    });

    return () => {
      if (firstFrame !== null) window.cancelAnimationFrame(firstFrame);
      if (timeout !== null) window.clearTimeout(timeout);
    };
  }, [companionRoleSrc, normalizedRole]);

  if (!renderedSrc) return null;

  const isSeer = renderedRole === "tiên tri";

  if (isSeer) {
    let ringColor = "#a855f7"; // default purple
    let ringColorTwo = "#3b82f6"; // default blue
    let pulse = false;
    const lastResult = seerResults && seerResults.length > 0 ? seerResults[seerResults.length - 1] : null;
    if (lastResult) {
      pulse = !!lastResult.isWolf;
      if (lastResult.isWolf) {
        ringColor = "#f38991"; // wolf red/pink
        ringColorTwo = "#e4acb5";
      } else {
        ringColor = "#e9e4ff"; // villager white/lavender
        ringColorTwo = "#acade4";
      }
    }

    return (
      <div
        className={`role-companion-overlay-wrapper ${visible ? "is-visible" : "is-hiding"}`}
        style={{
          position: "fixed",
          right: "var(--companion-right, -5dvw)",
          bottom: 0,
          height: `${playerFrameHeightPx}px`,
          maxHeight: "calc(50vw * 1.5)",
          maxWidth: "min(50vw, 360px)",
          aspectRatio: "2 / 3",
          pointerEvents: "none",
          userSelect: "none",
          zIndex: 10,
          transition: "opacity 320ms ease, transform 520ms cubic-bezier(0.16, 1, 0.3, 1)",
          opacity: visible ? 1 : 0,
          transform: visible ? "scale(1)" : "scale(1.008)",
          overflow: "hidden",
        }}
      >
        <img
          className="role-companion-overlay"
          src={renderedSrc}
          alt=""
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            objectPosition: "right bottom",
            pointerEvents: "none",
            userSelect: "none",
          }}
        />
        <div
          style={{
            position: "absolute",
            left: "45%",
            top: "46.5%",
            transform: "translate(-50%, -50%)",
            width: "47%",
            height: "47%",
            pointerEvents: "none",
            zIndex: 11,
          }}
        >
          <MagicRings
            color={ringColor}
            colorTwo={ringColorTwo}
            pulse={pulse}
            ringCount={4}
            speed={1.0}
            attenuation={10}
            lineThickness={2}
            baseRadius={0.35}
            radiusStep={0.1}
            scaleRate={0.1}
            opacity={1.0}
          />
        </div>
      </div>
    );
  }

  return (
    <img
      className={`role-companion-overlay ${visible ? "is-visible" : "is-hiding"}`}
      src={renderedSrc}
      alt=""
      style={{
        position: "fixed",
        right: 0,
        bottom: 0,
        width: "auto",
        height: `${playerFrameHeightPx}px`,
        maxWidth: "min(50vw, 360px)",
        objectFit: "contain",
        objectPosition: "right bottom",
        pointerEvents: "none",
        userSelect: "none",
        zIndex: 10,
        transition: "opacity 320ms ease, transform 520ms cubic-bezier(0.16, 1, 0.3, 1)",
        opacity: visible ? 1 : 0,
        transform: visible ? "scale(1)" : "scale(1.008)",
      }}
    />
  );
}
