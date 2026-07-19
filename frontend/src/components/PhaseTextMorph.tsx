import { useEffect, useState, useRef } from "react";
import "./PhaseTextMorph.css";

interface PhaseTextMorphProps {
  text: string;
  className?: string;
  style?: React.CSSProperties;
}

export function PhaseTextMorph({ text, className = "", style }: PhaseTextMorphProps) {
  const [currentText, setCurrentText] = useState(text);
  const [prevText, setPrevText] = useState<string | null>(null);
  const [animKey, setAnimKey] = useState(0);
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    if (text !== currentText) {
      setPrevText(currentText);
      setCurrentText(text);
      setAnimKey((prev) => prev + 1);
    }
  }, [text, currentText]);

  const filterId = "gooey-filter-phase";

  return (
    <div className={`phase-text-morph-container ${className}`} style={style}>
      <svg className="gooey-svg-hidden" aria-hidden="true">
        <defs>
          <filter id={filterId}>
            <feColorMatrix
              in="SourceGraphic"
              type="matrix"
              values="1 0 0 0 0
                      0 1 0 0 0
                      0 0 1 0 0
                      0 0 0 25 -9"
              result="goo"
            />
            <feComposite in="SourceGraphic" in2="goo" operator="atop" />
          </filter>
        </defs>
      </svg>

      <div className="phase-text-morph-wrapper" style={{ filter: `url(#${filterId})` }}>
        {/* Chữ cũ (bay ra, mờ đi) */}
        {prevText && (
          <span
            key={`prev-${animKey}-${prevText}`}
            className="phase-text-morph-item morph-out"
          >
            {prevText}
          </span>
        )}

        {/* Chữ mới (bay vào, rõ lên) */}
        <span
          key={`curr-${animKey}-${currentText}`}
          className="phase-text-morph-item morph-in"
        >
          {currentText}
        </span>
      </div>
    </div>
  );
}
