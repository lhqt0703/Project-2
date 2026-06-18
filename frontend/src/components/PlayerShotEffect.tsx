import { useEffect, useState, useRef } from "react";
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
  const bulletRafRef = useRef<number | null>(null);
  const confettiTriggeredRef = useRef(false);

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
      onRecoilUpdate?.(null);
      return;
    }

    confettiTriggeredRef.current = false;

    const tick = () => {
      const now = performance.now();
      const elapsedMs = now - bulletAnimation.startedAt;
      const to = positions.find((p) => p.playerId === bulletAnimation.toPlayerId);

      if (!to) {
        setBulletFrame(null);
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
      } else {
        const easeInCubic = (t: number) => t * t * t;
        const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
        const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

        const burst1Ms = 800;
        const slowMoMs = 100;
        const burst2Ms = 100;
        const totalMs = burst1Ms + slowMoMs + burst2Ms;

        const localElapsed = clamp(elapsedMs, 0, totalMs);
        const t = clamp(localElapsed / totalMs, 0, 1);
        const from = positions.find((p) => p.playerId === bulletAnimation.fromPlayerId);

        if (!from) {
          setBulletFrame(null);
          onRecoilUpdate?.(null);
          return;
        }

        const d1 = 0.35;
        const d2 = 0.7;

        let s = 0;
        if (localElapsed <= burst1Ms) {
          const u = clamp(localElapsed / burst1Ms, 0, 1);
          s = d1 * easeOutCubic(u);
        } else if (localElapsed <= burst1Ms + slowMoMs) {
          const u = clamp((localElapsed - burst1Ms) / slowMoMs, 0, 1);
          s = d1 + (d2 - d1) * easeInOutCubic(u);
        } else {
          const u = clamp((localElapsed - burst1Ms - slowMoMs) / burst2Ms, 0, 1);
          s = d2 + (1 - d2) * easeInCubic(u);
        }

        setBulletFrame({
          x: from.x + (to.x - from.x) * s,
          y: from.y + (to.y - from.y) * s,
          elapsedMs: localElapsed,
          totalMs,
        });
        onRecoilUpdate?.({ elapsedMs: localElapsed, totalMs });

        if (t < 1) {
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
      if (bulletAnimation && bulletAnimation.kind === "love" && !confettiTriggeredRef.current) {
        const to = positions.find((p) => p.playerId === bulletAnimation.toPlayerId);
        if (to) {
          confettiTriggeredRef.current = true;
          triggerCupidConfetti(to);
        }
      }
    };
  }, [bulletAnimation, positions]);

  if (!bulletAnimation || !bulletFrame) return null;

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
        src={bulletAnimation.assetSrc || "/Mũi tên.svg"}
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
