import { useEffect, useRef } from "react";
import "./PlayerNameVaporize.css";

interface PlayerNameVaporizeProps {
  active: boolean;
  isDead?: boolean;
  text: string;
  left: string;
  top: string;
  tokenTransform: string;
  tokenSize: number;
  fontSize: number;
  nameAtBottom: boolean;
}

interface NameParticle {
  x: number;
  y: number;
  originX: number;
  originY: number;
  driftX: number;
  driftY: number;
  red: number;
  green: number;
  blue: number;
  alpha: number;
  fadesQuickly: boolean;
}

const PARTICLE_SAMPLE_STEP = 1; // 1 = dày hạt, 2+ = thưa hạt hơn
const PARTICLE_ALPHA_BOOST = 8; // Tăng độ đậm của hạt
const DURATION_MS = 2_200;
const SPREAD_PX = 200; // càng cao càng bắn ra xa
const DENSITY = 10; // 0-10: càng cao càng giữ các hạt tồn tại lâu

export default function PlayerNameVaporize({
  active,
  isDead = false,
  text,
  left,
  top,
  tokenTransform,
  tokenSize,
  fontSize,
  nameAtBottom,
}: PlayerNameVaporizeProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wasActiveRef = useRef(active);
  // ponytail: track if player already vaporized so phase toggles (night->day) don't re-trigger for old dead players
  const hasVaporizedRef = useRef(isDead);

  useEffect(() => {
    if (!isDead) {
      hasVaporizedRef.current = false;
      wasActiveRef.current = active;
      return;
    }

    const shouldStart = active && !wasActiveRef.current && !hasVaporizedRef.current;
    wasActiveRef.current = active;
    if (!shouldStart) return;

    hasVaporizedRef.current = true;

    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context || !text) return;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const scaledFontSize = fontSize * dpr;
    context.font = `600 ${scaledFontSize}px 'Inter', system-ui, sans-serif`;
    const textWidth = context.measureText(text).width;
    const padding = (SPREAD_PX + 8) * dpr;
    const width = Math.ceil(textWidth + padding * 2);
    const height = Math.ceil(scaledFontSize * 2.4 + padding * 2);

    canvas.width = width;
    canvas.height = height;
    canvas.style.width = `${width / dpr}px`;
    canvas.style.height = `${height / dpr}px`;
    canvas.style.visibility = "visible";

    context.clearRect(0, 0, width, height);
    context.font = `600 ${scaledFontSize}px 'Inter', system-ui, sans-serif`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillStyle = "#f8fafc";
    context.shadowColor = "rgba(0, 0, 0, 0.95)";
    context.shadowBlur = 6 * dpr;
    context.shadowOffsetY = 2 * dpr;
    context.fillText(text, width / 2, height / 2);

    const source = context.getImageData(0, 0, width, height);
    const particles: NameParticle[] = [];
    const sampleStep = Math.max(1, Math.round(PARTICLE_SAMPLE_STEP));
    const slowFadeRatio = 0.3 + Math.min(10, Math.max(0, DENSITY)) * 0.07;

    for (let y = 0; y < height; y += sampleStep) {
      for (let x = 0; x < width; x += sampleStep) {
        const index = (y * width + x) * 4;
        const alpha = source.data[index + 3] ?? 0;
        if (alpha < 12) continue;

        const angle = Math.random() * Math.PI * 2;
        const distance = (0.35 + Math.random() * 0.65) * SPREAD_PX * dpr;
        particles.push({
          x,
          y,
          originX: x,
          originY: y,
          driftX: Math.cos(angle) * distance,
          driftY: Math.sin(angle) * distance * 0.55,
          red: source.data[index] ?? 248,
          green: source.data[index + 1] ?? 250,
          blue: source.data[index + 2] ?? 252,
          alpha: alpha / 255,
          fadesQuickly: Math.random() > slowFadeRatio,
        });
      }
    }

    const frame = context.createImageData(width, height);
    let animationFrame = 0;
    const startedAt = performance.now();

    const draw = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / DURATION_MS);
      const eased = 1 - Math.pow(1 - progress, 3);
      frame.data.fill(0);

      for (const particle of particles) {
        const x = Math.round(particle.originX + particle.driftX * eased);
        const y = Math.round(particle.originY + particle.driftY * eased);
        if (x < 0 || x >= width || y < 0 || y >= height) continue;

        const index = (y * width + x) * 4;
        frame.data[index] = particle.red;
        frame.data[index + 1] = particle.green;
        frame.data[index + 2] = particle.blue;
        const fadeProgress = particle.fadesQuickly ? Math.min(1, eased * 2) : eased;
        frame.data[index + 3] = Math.min(
          255,
          Math.round(particle.alpha * (1 - fadeProgress) * 255 * PARTICLE_ALPHA_BOOST),
        );
      }

      context.putImageData(frame, 0, 0);
      if (progress < 1) {
        animationFrame = requestAnimationFrame(draw);
      } else {
        canvas.style.visibility = "hidden";
      }
    };

    animationFrame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animationFrame);
  }, [active, isDead, fontSize, text]);

  return (
    <div
      className="player-name-vaporize-layer"
      style={{
        left,
        top,
        width: tokenSize,
        height: tokenSize,
        transform: tokenTransform,
      }}
      aria-hidden="true"
    >
      <div
        className="player-name-vaporize-anchor"
        style={{
          transform: nameAtBottom ? "translate(-50%, 2.5em)" : "translate(-50%, -50%)",
          fontSize,
        }}
      >
        <canvas ref={canvasRef} className="player-name-vaporize-canvas" />
      </div>
    </div>
  );
}
