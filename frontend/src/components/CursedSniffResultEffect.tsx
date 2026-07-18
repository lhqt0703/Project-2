import { useEffect, useState, type CSSProperties } from "react";

import "./CursedSniffResultEffect.css";

const APPEAR_DURATION_MS = 1400;
const DISAPPEAR_DURATION_MS = 1550;

type EffectPhase = "appearing" | "disappearing" | "hidden";

export default function CursedSniffResultEffect({
  targetId,
  hasWolf,
}: {
  targetId: string;
  hasWolf: boolean;
}) {
  const [phase, setPhase] = useState<EffectPhase>("appearing");
  const text = hasWolf ? "chính nó" : "không có";

  useEffect(() => {
    setPhase("appearing");

    const disappearTimer = window.setTimeout(
      () => setPhase("disappearing"),
      APPEAR_DURATION_MS
    );
    const hideTimer = window.setTimeout(
      () => setPhase("hidden"),
      APPEAR_DURATION_MS + DISAPPEAR_DURATION_MS
    );

    return () => {
      window.clearTimeout(disappearTimer);
      window.clearTimeout(hideTimer);
    };
  }, [hasWolf, targetId, text]);

  if (phase === "hidden") return null;

  let visibleIndex = 0;

  return (
    <div
      className={`cursed-sniff-result cursed-sniff-result--${phase}${hasWolf ? " cursed-sniff-result--wolf" : ""}`}
      role="status"
      aria-live="polite"
      aria-label={text}
    >
      <span className="cursed-sniff-result__text" aria-hidden="true">
        {Array.from(text).map((character, index) => {
          if (character === " ") {
            return <span className="cursed-sniff-result__space" key={`${index}-space`} />;
          }

          const characterIndex = visibleIndex++;
          const style = {
            "--cursed-character-index": characterIndex,
          } as CSSProperties;

          return (
            <span className="cursed-sniff-result__character" style={style} key={`${index}-${character}`}>
              {character}
            </span>
          );
        })}
      </span>
    </div>
  );
}
