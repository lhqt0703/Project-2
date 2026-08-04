import { useEffect, useId, useRef, useState, type MouseEvent, type ReactNode } from "react";
import "./StunActionGuard.css";

interface StunActionGuardProps {
  blocked: boolean;
  children: ReactNode;
  blockedLabel?: string;
  className?: string;
}

export default function StunActionGuard({
  blocked,
  children,
  blockedLabel = "Bạn đang bị choáng và không thể thực hiện hành động này",
  className = "",
}: StunActionGuardProps) {
  const [burstId, setBurstId] = useState<number | null>(null);
  const nextBurstIdRef = useRef(0);
  const hideTimerRef = useRef<number | null>(null);
  const gradientId = `stun-spiral-${useId().replace(/:/g, "")}`;

  useEffect(() => () => {
    if (hideTimerRef.current !== null) window.clearTimeout(hideTimerRef.current);
  }, []);

  const handleClickCapture = (event: MouseEvent<HTMLSpanElement>) => {
    if (!blocked) return;

    event.preventDefault();
    event.stopPropagation();
    if (hideTimerRef.current !== null) return;

    nextBurstIdRef.current += 1;
    setBurstId(nextBurstIdRef.current);
    hideTimerRef.current = window.setTimeout(() => {
      setBurstId(null);
      hideTimerRef.current = null;
    }, 1500);
  };

  return (
    <span
      className={`stun-action-guard${burstId !== null ? " stun-action-guard--active" : ""}${className ? ` ${className}` : ""}`}
      onClickCapture={handleClickCapture}
    >
      {children}
      {blocked && burstId !== null && (
        <span
          key={burstId}
          className="stun-action-overlay"
          role="status"
          aria-label={blockedLabel}
        >
          <svg className="stun-action-spiral" viewBox="0 0 100 100" aria-hidden="true">
            <defs>
              <linearGradient id={gradientId} x1="20" y1="10" x2="76" y2="94" gradientUnits="userSpaceOnUse">
                <stop offset="0" stopColor="#ff79f2" />
                <stop offset="0.52" stopColor="#d83ee9" />
                <stop offset="1" stopColor="#8f18e7" />
              </linearGradient>
            </defs>
            <path
              d="M50 50c0-10 13-15 21-8 10 9 4 26-9 31-19 8-40-6-39-27 1-28 31-46 57-33 33 16 34 61 6 82"
              fill="none"
              stroke={`url(#${gradientId})`}
              strokeWidth="13"
              strokeLinecap="round"
            />
          </svg>
        </span>
      )}
    </span>
  );
}
