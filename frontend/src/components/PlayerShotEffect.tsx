import { useEffect, useState, useRef } from "react";
import { createPortal } from "react-dom";
import { gsap } from "gsap";
import Physics2DPlugin from "../libs/Physics2DPlugin";
import CustomWiggle from "../libs/CustomWiggle";
import type { PlayerPosition } from "./PlayerPositions";

// CustomEase will be loaded from window.gsap global core if available
const CustomEase = (gsap as any).core?.globals?.CustomEase;

const CUPID_EXPLOSION_ICONS = [
  encodeURI("/src/assets/icon/Tym.avif"),
  encodeURI("/src/assets/icon/Tym 1.avif"),
  encodeURI("/src/assets/icon/Tym 2.avif"),
  encodeURI("/src/assets/icon/Tym 3.avif"),
  encodeURI("/src/assets/icon/Tym 4.avif"),
  encodeURI("/src/assets/icon/Tym 5.avif"),
  encodeURI("/src/assets/icon/Lấp lánh.avif"),
];

const clamp = (val: number, min: number, max: number) => Math.min(Math.max(val, min), max);

export interface BulletAnimationPayload {
  fromPlayerId: string;
  toPlayerId: string;
  startedAt: number;
  durationMs: number;
  assetSrc?: string;
  alt?: string;
  rotationOffsetDeg?: number;
  kind?: "hunter" | "love";
}

interface PlayerShotEffectProps {
  bulletAnimation?: BulletAnimationPayload | null;
  positions: PlayerPosition[];
  containerRef: React.RefObject<HTMLDivElement | null>;
  onRecoilUpdate?: (recoil: { elapsedMs: number; totalMs: number } | null) => void;
}

export function PlayerShotEffect({ bulletAnimation, positions, containerRef, onRecoilUpdate }: PlayerShotEffectProps) {
  const [bulletFrame, setBulletFrame] = useState<{ x: number; y: number; elapsedMs: number; totalMs: number; rotationDeg?: number } | null>(null);
  const [targetingFrame, setTargetingFrame] = useState<{
    cursorX: number;
    cursorY: number;
    cursorOpacity: number;
    bulletX: number;
    bulletY: number;
    showBullet: boolean;
    color: string;
    elapsedMs: number;
  } | null>(null);
  const bulletRafRef = useRef<number | null>(null);
  const confettiTriggeredRef = useRef(false);
  const positionsRef = useRef(positions);

  const filterXRef = useRef<SVGFETurbulenceElement>(null);
  const filterYRef = useRef<SVGFETurbulenceElement>(null);
  const lineHorizontalRef = useRef<HTMLDivElement>(null);
  const lineVerticalRef = useRef<HTMLDivElement>(null);
  const lockNoiseTriggeredRef = useRef(false);

  useEffect(() => {
    positionsRef.current = positions;
  }, [positions]);

  // Register GSAP plugins
  useEffect(() => {
    if (Physics2DPlugin && CustomWiggle) {
      gsap.registerPlugin(Physics2DPlugin, CustomWiggle, CustomEase);
    }
  }, []);

  const triggerCupidConfetti = (to: PlayerPosition) => {
    if (!containerRef.current) return;

    // Create or reuse fixed viewport container to avoid extending body height
    let confettiContainer = document.getElementById("cupid-confetti-viewport-container");
    if (!confettiContainer) {
      confettiContainer = document.createElement("div");
      confettiContainer.id = "cupid-confetti-viewport-container";
      Object.assign(confettiContainer.style, {
        position: "fixed",
        top: "0",
        left: "0",
        width: "100vw",
        height: "100dvh",
        pointerEvents: "none",
        overflow: "hidden",
        zIndex: "99999",
      });
      document.body.appendChild(confettiContainer);
    }

    const rect = containerRef.current.getBoundingClientRect();
    
    // Fixed viewport target coordinates
    const targetX = rect.left + to.x * rect.width;
    const targetY = rect.top + to.y * rect.height;

    const count = 45;
    const gravity = 2200;

    for (let i = 0; i < count; i++) {
      const randomIcon = gsap.utils.random(CUPID_EXPLOSION_ICONS);
      const img = document.createElement("img");
      img.src = randomIcon;
      img.style.position = "absolute";
      img.style.pointerEvents = "none";
      img.style.left = `${targetX}px`;
      img.style.top = `${targetY}px`;
      img.style.width = `${gsap.utils.random(16, 32)}px`;
      img.style.height = "auto";
      img.style.zIndex = "99999";
      img.style.transform = "translate(-50%, -50%)";

      confettiContainer.appendChild(img);

      const angle = Math.random() * Math.PI * 2 * (180 / Math.PI);
      const velocity = gsap.utils.random(300, 900);
      const duration = 1.0 + Math.random() * 0.8;

      gsap.to(img, {
        physics2D: {
          angle: angle,
          velocity: velocity,
          gravity: gravity,
        },
        rotation: gsap.utils.random(-180, 180),
        duration: duration,
        ease: "power1.out",
      });

      gsap.to(img, {
        opacity: 0,
        duration: 0.3,
        delay: duration - 0.3,
        ease: "power1.out",
        onComplete: () => {
          img.remove();
        },
      });
    }
  };

  useEffect(() => {
    if (bulletRafRef.current != null) {
      cancelAnimationFrame(bulletRafRef.current);
      bulletRafRef.current = null;
    }

    if (!bulletAnimation) {
      setBulletFrame(null);
      setTargetingFrame(null);
      onRecoilUpdate?.(null);
      return;
    }

    confettiTriggeredRef.current = false;
    lockNoiseTriggeredRef.current = false;

    let turbulenceTimeline: gsap.core.Timeline | null = null;
    if (bulletAnimation.kind === "hunter") {
      const primitiveValues = { turbulence: 0 };
      turbulenceTimeline = gsap.timeline({
        onStart: () => {
          if (lineHorizontalRef.current) {
            lineHorizontalRef.current.style.filter = "url(#filter-noise-x)";
          }
          if (lineVerticalRef.current) {
            lineVerticalRef.current.style.filter = "url(#filter-noise-y)";
          }
        },
        onUpdate: () => {
          if (filterXRef.current && filterYRef.current) {
            filterXRef.current.setAttribute("baseFrequency", primitiveValues.turbulence.toString());
            filterYRef.current.setAttribute("baseFrequency", primitiveValues.turbulence.toString());
          }
        },
        onComplete: () => {
          if (lineHorizontalRef.current && lineVerticalRef.current) {
            lineHorizontalRef.current.style.filter = "none";
            lineVerticalRef.current.style.filter = "none";
          }
        }
      }).to(primitiveValues, {
        duration: 0.5,
        ease: "power1.out",
        startAt: { turbulence: 1 },
        turbulence: 0
      });
    }

    const tick = () => {
      const now = performance.now();
      const elapsedMs = now - bulletAnimation.startedAt;
      const to = positionsRef.current.find((p) => p.playerId === bulletAnimation.toPlayerId);

      if (!to) {
        setBulletFrame(null);
        setTargetingFrame(null);
        onRecoilUpdate?.(null);
        return;
      }

      if (bulletAnimation.kind === "love") {
        const aimDuration = 2000;
        const flyDuration = 400;
        const totalMs = aimDuration + flyDuration;
        const localElapsed = clamp(elapsedMs, 0, totalMs);

        const fromPos = { x: 0.05, y: 0.95 };

        const dx = to.x - fromPos.x;
        const dy = to.y - fromPos.y;
        const angleRad = Math.atan2(dy, dx);
        const rotationDeg = (angleRad * 180) / Math.PI;

        let x = fromPos.x;
        let y = fromPos.y;

        if (localElapsed <= aimDuration) {
          const tAim = localElapsed / aimDuration;
          const pullDistance = 0.04 * Math.sin((tAim * Math.PI) / 2);
          x = fromPos.x - pullDistance * Math.cos(angleRad);
          y = fromPos.y - pullDistance * Math.sin(angleRad);

          if (localElapsed > 1000) {
            const jitter = Math.sin(localElapsed * 0.15) * 0.002;
            x += jitter * Math.sin(angleRad);
            y -= jitter * Math.cos(angleRad);
          }
        } else {
          const tFly = clamp((localElapsed - aimDuration) / flyDuration, 0, 1);
          const s = tFly * tFly * tFly;
          x = fromPos.x + (to.x - fromPos.x) * s;
          y = fromPos.y + (to.y - fromPos.y) * s;

          if (tFly >= 1 && !confettiTriggeredRef.current) {
            confettiTriggeredRef.current = true;
            triggerCupidConfetti(to);
          }
        }

        setBulletFrame({
          x,
          y,
          elapsedMs: localElapsed,
          totalMs,
          rotationDeg,
        });
        onRecoilUpdate?.({ elapsedMs: localElapsed, totalMs });

        if (localElapsed < totalMs) {
          bulletRafRef.current = requestAnimationFrame(tick);
        } else {
          bulletRafRef.current = null;
        }
      } else if (bulletAnimation.kind === "hunter") {
        const from = positionsRef.current.find((p) => p.playerId === bulletAnimation.fromPlayerId);

        if (!from || !containerRef.current) {
          setBulletFrame(null);
          setTargetingFrame(null);
          onRecoilUpdate?.(null);
          return;
        }

        const rect = containerRef.current.getBoundingClientRect();
        const startX = window.innerWidth * 0.05;
        const startY = window.innerHeight * 0.95;
        const targetX = rect.left + to.x * rect.width;
        const targetY = rect.top + to.y * rect.height;
        const bulletStartX = rect.left + from.x * rect.width;
        const bulletStartY = rect.top + from.y * rect.height;

        const totalMs = 4000; // 1.5s blink + 1.0s travel + 0.5s hold + 1.0s bullet flight
        const localElapsed = clamp(elapsedMs, 0, totalMs);

        // combined target cursor + crosshair coordinates & opacity
        let cursorOpacity = 1;
        let cursorX = startX;
        let cursorY = startY;
        let showBullet = false;
        let bulletX = bulletStartX;
        let bulletY = bulletStartY;

        if (localElapsed < 1500) {
          // Phase 1: Blinking at bottom-left of viewport
          const isBlinkingOn = Math.floor(localElapsed / 100) % 2 === 0;
          cursorOpacity = isBlinkingOn ? 1 : 0.2;
          cursorX = startX;
          cursorY = startY;
        } else if (localElapsed < 2500) {
          // Phase 2: Moving to target (1s)
          const tMove = clamp((localElapsed - 1500) / 1000, 0, 1);
          const easeInOutCubic = (val: number) => val < 0.5 ? 4 * val * val * val : 1 - Math.pow(-2 * val + 2, 3) / 2;
          const easedT = easeInOutCubic(tMove);
          cursorX = startX + (targetX - startX) * easedT;
          cursorY = startY + (targetY - startY) * easedT;
          cursorOpacity = 1;
        } else if (localElapsed < 3000) {
          // Phase 3: Lock-on hold (0.5s)
          cursorX = targetX;
          cursorY = targetY;
          cursorOpacity = 1;

          // Trigger lock-on noise burst exactly once at 2500ms
          if (localElapsed >= 2500 && !lockNoiseTriggeredRef.current) {
            lockNoiseTriggeredRef.current = true;
            turbulenceTimeline?.restart();
          }
        } else {
          // Phase 4: Bullet fires and travels to target (1.0s)
          cursorX = targetX;
          cursorY = targetY;
          cursorOpacity = 1;
          showBullet = true;

          const bulletElapsed = localElapsed - 3000;
          const easeInCubic = (val: number) => val * val * val;
          const easeOutCubic = (val: number) => 1 - Math.pow(1 - val, 3);
          const easeInOutCubic = (val: number) => (val < 0.5 ? 4 * val * val * val : 1 - Math.pow(-2 * val + 2, 3) / 2);

          const burst1Ms = 800;
          const slowMoMs = 100;
          const burst2Ms = 100;

          const d1 = 0.35;
          const d2 = 0.7;

          let s = 0;
          if (bulletElapsed <= burst1Ms) {
            const u = clamp(bulletElapsed / burst1Ms, 0, 1);
            s = d1 * easeOutCubic(u);
          } else if (bulletElapsed <= burst1Ms + slowMoMs) {
            const u = clamp((bulletElapsed - burst1Ms) / slowMoMs, 0, 1);
            s = d1 + (d2 - d1) * easeInOutCubic(u);
          } else {
            const u = clamp((bulletElapsed - burst1Ms - slowMoMs) / burst2Ms, 0, 1);
            s = d2 + (1 - d2) * easeInCubic(u);
          }

          bulletX = bulletStartX + (targetX - bulletStartX) * s;
          bulletY = bulletStartY + (targetY - bulletStartY) * s;
        }

        // Color transition to red in Phase 4 (over 200ms)
        let color = "rgb(255, 255, 255)";
        if (localElapsed >= 3000) {
          const tFade = clamp((localElapsed - 3000) / 200, 0, 1);
          const g = Math.round(255 - 255 * tFade);
          const b = Math.round(255 - 255 * tFade);
          color = `rgb(255, ${g}, ${b})`;
        }

        setTargetingFrame({
          cursorX,
          cursorY,
          cursorOpacity,
          bulletX,
          bulletY,
          showBullet,
          color,
          elapsedMs: localElapsed,
        });

        // Trigger recoil update for player positions recoil effect (recoil starts at Phase 4)
        if (localElapsed >= 3000) {
          onRecoilUpdate?.({
            elapsedMs: localElapsed - 3000,
            totalMs: 1000,
          });
        } else {
          onRecoilUpdate?.({
            elapsedMs: 0,
            totalMs: 1000,
          });
        }

        if (localElapsed < totalMs) {
          bulletRafRef.current = requestAnimationFrame(tick);
        } else {
          bulletRafRef.current = null;
        }
      }
    };

    bulletRafRef.current = requestAnimationFrame(tick);
    return () => {
      if (bulletRafRef.current != null) {
        cancelAnimationFrame(bulletRafRef.current);
        bulletRafRef.current = null;
      }
      onRecoilUpdate?.(null);
      turbulenceTimeline?.kill();
      if (bulletAnimation && bulletAnimation.kind === "love" && !confettiTriggeredRef.current) {
        const to = positionsRef.current.find((p) => p.playerId === bulletAnimation.toPlayerId);
        if (to) {
          confettiTriggeredRef.current = true;
          triggerCupidConfetti(to);
        }
      }
    };
  }, [bulletAnimation]);

  if (!bulletAnimation) return null;

  if (bulletAnimation.kind === "hunter") {
    if (!targetingFrame) return null;

    const { cursorX, cursorY, cursorOpacity, bulletX, bulletY, showBullet, color } = targetingFrame;

    const to = positions.find((p) => p.playerId === bulletAnimation.toPlayerId);
    const from = positions.find((p) => p.playerId === bulletAnimation.fromPlayerId);
    let finalRotation = 0;
    if (from && to && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const dx = (to.x - from.x) * rect.width;
      const dy = (to.y - from.y) * rect.height;
      const angleRad = Math.atan2(dy, dx);
      const rotationDeg = (angleRad * 180) / Math.PI;
      finalRotation = rotationDeg + (bulletAnimation.rotationOffsetDeg ?? 45);
    }

    const targetEl = document.querySelector(`[data-player-id="${bulletAnimation.toPlayerId}"]`);
    const targetRect = targetEl?.getBoundingClientRect();
    const targetWidth = targetRect ? targetRect.width : 90;
    const targetHeight = targetRect ? targetRect.height : 90;

    const isOnTarget = targetingFrame.elapsedMs >= 2500;
    const cursorColor = isOnTarget ? "#F43F5E" : color;

    const boxWidth = isOnTarget ? targetWidth + 12 : 24;
    const boxHeight = isOnTarget ? targetHeight + 12 : 24;

    const bulletProgress = targetingFrame.elapsedMs >= 3700
      ? clamp((targetingFrame.elapsedMs - 3700) / 1000, 0, 1)
      : 0;
    const flyOffset = Math.pow(bulletProgress, 2) * 3600;
    const cornersOpacity = 1 - bulletProgress;

    return createPortal(
      <div
        style={{
          position: "fixed",
          inset: 0,
          pointerEvents: "none",
          zIndex: 99999,
        }}
      >
        <style>{`
          @keyframes targeting-spin {
            from { transform: translate(-50%, -50%) rotate(0deg); }
            to { transform: translate(-50%, -50%) rotate(360deg); }
          }
        `}</style>
        <svg
          style={{
            position: "fixed",
            left: 0,
            top: 0,
            width: "100%",
            height: "100%",
            pointerEvents: "none",
          }}
        >
          <defs>
            <filter id="filter-noise-x">
              <feTurbulence type="fractalNoise" baseFrequency="0.000001" numOctaves="1" ref={filterXRef} />
              <feDisplacementMap in="SourceGraphic" scale="40" />
            </filter>
            <filter id="filter-noise-y">
              <feTurbulence type="fractalNoise" baseFrequency="0.000001" numOctaves="1" ref={filterYRef} />
              <feDisplacementMap in="SourceGraphic" scale="40" />
            </filter>
          </defs>
        </svg>

        {/* Crosshair Horizontal Line */}
        <div
          ref={lineHorizontalRef}
          style={{
            position: "fixed",
            left: 0,
            top: `${cursorY}px`,
            width: "100%",
            height: "1px",
            background: cursorColor,
            pointerEvents: "none",
            transform: "translateY(-50%)",
            opacity: cursorOpacity,
            willChange: "top, opacity",
            transition: "background-color 0.3s",
          }}
        />

        {/* Crosshair Vertical Line */}
        <div
          ref={lineVerticalRef}
          style={{
            position: "fixed",
            left: `${cursorX}px`,
            top: 0,
            width: "1px",
            height: "100%",
            background: cursorColor,
            pointerEvents: "none",
            transform: "translateX(-50%)",
            opacity: cursorOpacity,
            willChange: "left, opacity",
            transition: "background-color 0.3s",
          }}
        />

        {/* Target Cursor corners & dot */}
        <div
          style={{
            position: "fixed",
            left: `${cursorX}px`,
            top: `${cursorY}px`,
            width: 0,
            height: 0,
            pointerEvents: "none",
            zIndex: 9999,
            mixBlendMode: isOnTarget ? "normal" : "difference",
            transform: "translate(-50%, -50%)",
            opacity: cursorOpacity,
            willChange: "left, top, opacity",
            transition: "mix-blend-mode 0.3s",
          }}
        >
          <div
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              width: "6px",
              height: "6px",
              background: cursorColor,
              borderRadius: "50%",
              transform: "translate(-50%, -50%)",
              transition: "background-color 0.3s",
            }}
          />
          <div
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              width: boxWidth,
              height: boxHeight,
              animation: isOnTarget ? "none" : "targeting-spin 4s linear infinite",
              transform: isOnTarget ? "translate(-50%, -50%) rotate(0deg)" : undefined,
              pointerEvents: "none",
              transition: "width 0.3s cubic-bezier(0.25, 1, 0.5, 1), height 0.3s cubic-bezier(0.25, 1, 0.5, 1), transform 0.3s ease",
            }}
          >
            <div
              style={{
                position: "absolute",
                width: "12px",
                height: "12px",
                borderTop: `2px solid ${cursorColor}`,
                borderLeft: `2px solid ${cursorColor}`,
                left: isOnTarget ? 0 : "50%",
                top: isOnTarget ? 0 : "50%",
                transform: isOnTarget 
                  ? `translate(-2px, -2px) translate(-${flyOffset}px, -${flyOffset}px)` 
                  : "translate(-150%, -150%)",
                opacity: cornersOpacity,
                transition: bulletProgress > 0 ? "none" : "all 0.3s cubic-bezier(0.25, 1, 0.5, 1)",
                willChange: "left, top, transform, border-color, opacity",
              }}
            />
            <div
              style={{
                position: "absolute",
                width: "12px",
                height: "12px",
                borderTop: `2px solid ${cursorColor}`,
                borderRight: `2px solid ${cursorColor}`,
                left: isOnTarget ? "100%" : "50%",
                top: isOnTarget ? 0 : "50%",
                transform: isOnTarget 
                  ? `translate(-100%, 0) translate(2px, -2px) translate(${flyOffset}px, -${flyOffset}px)` 
                  : "translate(50%, -150%)",
                opacity: cornersOpacity,
                transition: bulletProgress > 0 ? "none" : "all 0.3s cubic-bezier(0.25, 1, 0.5, 1)",
                willChange: "left, top, transform, border-color, opacity",
              }}
            />
            <div
              style={{
                position: "absolute",
                width: "12px",
                height: "12px",
                borderBottom: `2px solid ${cursorColor}`,
                borderRight: `2px solid ${cursorColor}`,
                left: isOnTarget ? "100%" : "50%",
                top: isOnTarget ? "100%" : "50%",
                transform: isOnTarget 
                  ? `translate(-100%, -100%) translate(2px, 2px) translate(${flyOffset}px, ${flyOffset}px)` 
                  : "translate(50%, 50%)",
                opacity: cornersOpacity,
                transition: bulletProgress > 0 ? "none" : "all 0.3s cubic-bezier(0.25, 1, 0.5, 1)",
                willChange: "left, top, transform, border-color, opacity",
              }}
            />
            <div
              style={{
                position: "absolute",
                width: "12px",
                height: "12px",
                borderBottom: `2px solid ${cursorColor}`,
                borderLeft: `2px solid ${cursorColor}`,
                left: isOnTarget ? 0 : "50%",
                top: isOnTarget ? "100%" : "50%",
                transform: isOnTarget 
                  ? `translate(0, -100%) translate(-2px, 2px) translate(-${flyOffset}px, ${flyOffset}px)` 
                  : "translate(-150%, 50%)",
                opacity: cornersOpacity,
                transition: bulletProgress > 0 ? "none" : "all 0.3s cubic-bezier(0.25, 1, 0.5, 1)",
                willChange: "left, top, transform, border-color, opacity",
              }}
            />
          </div>
        </div>

        {/* Bullet Image */}
        {showBullet && (
          <img
            src={bulletAnimation.assetSrc || "/src/assets/Đạn.svg"}
            alt={bulletAnimation.alt || "Đạn"}
            style={{
              position: "fixed",
              left: `${bulletX}px`,
              top: `${bulletY}px`,
              width: 24,
              height: 24,
              transform: `translate(-50%, -50%) rotate(${finalRotation}deg)`,
              pointerEvents: "none",
            }}
          />
        )}
      </div>,
      document.body
    );
  }

  if (!bulletFrame) return null;

  if (bulletAnimation.kind === "love" && bulletFrame.elapsedMs > 2398) {
    return null;
  }

  const rotationDeg = bulletFrame.rotationDeg ?? 0;
  const rotationOffset = bulletAnimation.rotationOffsetDeg ?? 0;
  const finalRotation = rotationDeg + rotationOffset;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        zIndex: 100,
      }}
    >
      <img
        src={bulletAnimation.assetSrc || "/src/assets/Mũi tên.svg"}
        alt={bulletAnimation.alt || "Mũi tên"}
        style={{
          position: "absolute",
          left: `${bulletFrame.x * 100}%`,
          top: `${bulletFrame.y * 100}%`,
          width: 48,
          height: 48,
          transform: `translate(-50%, -50%) rotate(${finalRotation}deg)`,
          pointerEvents: "none",
        }}
      />
    </div>
  );
}
export default PlayerShotEffect;
