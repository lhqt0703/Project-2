import { useEffect, useState, type CSSProperties } from "react";
import RoleCard3D from "./RoleCard3D";
import "./NightCardTransition.css";

interface NightCardTransitionProps {
  active: boolean;
  durationMs: number;
  role: string | null;
  revealed: boolean;
  backdropImage?: string;
  lowPerformanceMode?: boolean;
  onComplete?: () => void;
}

export default function NightCardTransition({
  active,
  durationMs,
  role,
  revealed,
  backdropImage,
  lowPerformanceMode,
  onComplete,
}: NightCardTransitionProps) {
  if (!active) return null;

  return (
    <ActiveNightCardTransition
      durationMs={durationMs}
      role={role}
      revealed={revealed}
      backdropImage={backdropImage}
      lowPerformanceMode={lowPerformanceMode}
      onComplete={onComplete}
    />
  );
}

function ActiveNightCardTransition({
  durationMs,
  role,
  revealed,
  backdropImage,
  lowPerformanceMode,
  onComplete,
}: Omit<NightCardTransitionProps, "active">) {
  const [transitionRevealed, setTransitionRevealed] = useState(revealed);
  const flipDurationMs = Math.min(720, Math.max(0, durationMs - 1));
  const effectDurationMs = Math.max(1, durationMs - flipDurationMs);

  useEffect(() => {
    if (!revealed) return;
    const frame = requestAnimationFrame(() => setTransitionRevealed(false));
    return () => cancelAnimationFrame(frame);
  }, [revealed]);

  return (
    <div
      className="night-card-transition"
      style={{
        "--night-card-flip-duration": `${flipDurationMs}ms`,
        "--night-card-effect-duration": `${effectDurationMs}ms`,
      } as CSSProperties}
      onAnimationEnd={(event) => {
        if (event.target === event.currentTarget && event.animationName === "nightCardTransitionFade") {
          onComplete?.();
        }
      }}
      aria-hidden="true"
    >
      <div
        className="night-card-transition__backdrop"
        style={backdropImage ? { backgroundImage: `url(${backdropImage})` } : undefined}
      />
      <RoleCard3D
        role={role}
        revealed={transitionRevealed}
        lowPerformanceMode={lowPerformanceMode}
      />
      <div className="night-card-transition__whiteout" />
    </div>
  );
}
