import { useEffect, useState, type CSSProperties } from "react";
import MagicRings from "./MagicRings";

export default function RoleCompanionOverlay({
  companionRoleSrc,
  introCompanionRoleSrc,
  normalizedRole,
  playerFrameHeightPx,
  seerResults,
  isRobbed,
  introWhiteout = false,
}: {
  companionRoleSrc: string | null;
  introCompanionRoleSrc?: string | null;
  normalizedRole: string | null;
  playerFrameHeightPx: number;
  seerResults: { playerId: string; isWolf: boolean }[] | null;
  isRobbed?: boolean;
  introWhiteout?: boolean;
}) {
  const [renderedSrc, setRenderedSrc] = useState<string | null>(null);
  const [renderedRole, setRenderedRole] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);
  const [introVariantDismissed, setIntroVariantDismissed] = useState(false);

  useEffect(() => {
    if (!introWhiteout) return;
    const frame = window.requestAnimationFrame(() => setIntroVariantDismissed(false));
    return () => window.cancelAnimationFrame(frame);
  }, [introWhiteout]);

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
  const hasIntroVariant = !!introCompanionRoleSrc && !introVariantDismissed;
  const showIntroVariant = hasIntroVariant && introWhiteout && visible;
  const introFilterTransitionMs = isSeer ? 320 : 520;
  const introVariantOpacityTransition = introWhiteout
    ? "opacity 0ms"
    : `opacity 320ms ease ${introFilterTransitionMs}ms`;

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
          right: "-5dvw",
          bottom: "-4dvh",
          height: `${playerFrameHeightPx}px`,
          maxHeight: "calc(50vw * 1.5)",
          maxWidth: "min(50vw, 360px)",
          aspectRatio: "2 / 3",
          pointerEvents: "none",
          userSelect: "none",
          zIndex: 27,
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
            opacity: showIntroVariant ? 0 : 1,
            filter: !hasIntroVariant && introWhiteout && visible
              ? "brightness(100) saturate(1) drop-shadow(2px 4px 6px white)"
              : (isRobbed && visible) ? "brightness(0.1) blur(1px)" : undefined,
            transition: hasIntroVariant
              ? introVariantOpacityTransition
              : "filter 320ms ease",
          }}
        />
        {hasIntroVariant && introCompanionRoleSrc && (
          <img
            className="role-companion-overlay"
            src={introCompanionRoleSrc}
            alt=""
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: "cover",
              objectPosition: "right bottom",
              pointerEvents: "none",
              userSelect: "none",
              opacity: showIntroVariant ? 1 : 0,
              filter: introWhiteout && visible
                ? "brightness(100) saturate(1) drop-shadow(2px 4px 6px white)"
                : (isRobbed && visible) ? "brightness(0.1) blur(1px)" : undefined,
              transition: `filter ${introFilterTransitionMs}ms ease, ${introVariantOpacityTransition}`,
            }}
            onTransitionEnd={(event) => {
              if (event.propertyName === "opacity" && !introWhiteout) {
                setIntroVariantDismissed(true);
              }
            }}
          />
        )}
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

  const companionImageStyle: CSSProperties = {
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
    transform: visible ? "scale(1)" : "scale(1.008)",
  };

  return (
    <>
      <img
        className={`role-companion-overlay ${visible ? "is-visible" : "is-hiding"}`}
        src={renderedSrc}
        alt=""
        style={{
          ...companionImageStyle,
          zIndex: 27,
          opacity: visible && !showIntroVariant ? 1 : 0,
          filter: !hasIntroVariant && introWhiteout && visible
            ? "brightness(100) drop-shadow(2px 4px 6px white)"
            : (isRobbed && visible) ? "brightness(0.1) blur(1px)" : undefined,
          transition: hasIntroVariant
            ? `${introVariantOpacityTransition}, transform 520ms cubic-bezier(0.16, 1, 0.3, 1), filter 520ms ease`
            : "opacity 320ms ease, transform 520ms cubic-bezier(0.16, 1, 0.3, 1), filter 520ms ease",
        }}
      />
      {hasIntroVariant && introCompanionRoleSrc && (
        <img
          className={`role-companion-overlay ${visible ? "is-visible" : "is-hiding"}`}
          src={introCompanionRoleSrc}
          alt=""
          style={{
            ...companionImageStyle,
            zIndex: 28,
            opacity: showIntroVariant ? 1 : 0,
            filter: introWhiteout && visible
              ? "brightness(100) drop-shadow(2px 4px 6px white)"
              : (isRobbed && visible) ? "brightness(0.1) blur(1px)" : undefined,
            transition: `filter ${introFilterTransitionMs}ms ease, transform 520ms cubic-bezier(0.16, 1, 0.3, 1), ${introVariantOpacityTransition}`,
          }}
          onTransitionEnd={(event) => {
            if (event.propertyName === "opacity" && !introWhiteout) {
              setIntroVariantDismissed(true);
            }
          }}
        />
      )}
    </>
  );
}
