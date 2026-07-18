import type { CSSProperties } from "react";
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
    <div
      className="night-card-transition"
      style={{ "--night-card-transition-duration": `${Math.max(1, durationMs)}ms` } as CSSProperties}
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
        revealed={revealed}
        lowPerformanceMode={lowPerformanceMode}
      />
      <div className="night-card-transition__whiteout" />
    </div>
  );
}
