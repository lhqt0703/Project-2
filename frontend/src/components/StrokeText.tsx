import { type CSSProperties, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import "./StrokeText.css";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger);
}

export type StrokeTextTrigger = "mount" | "hover" | "scroll" | "loop";
export type StrokeTextFillMode = "wipe" | "fade" | "none";

export interface StrokeTextProps {
  text?: string;
  strokeColor?: string;
  fillColor?: string;
  fillGradient?: readonly [string, string];
  strokeWidth?: number;
  drawDuration?: number;
  fillDelay?: number;
  stagger?: number;
  strokeFadeDuration?: number;
  ease?: string;
  trigger?: StrokeTextTrigger;
  fillMode?: StrokeTextFillMode;
  fontSize?: number;
  fontWeight?: number | string;
  letterSpacing?: number;
  reverse?: boolean;
  className?: string;
  style?: CSSProperties;
  onFillStart?: () => void;
  onAnimationComplete?: () => void;
}

interface StrokeTextBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export default function StrokeText({
  text = "Draw Attention",
  strokeColor = "#A78BFA",
  fillColor = "#F8FAFC",
  fillGradient,
  strokeWidth = 1.4,
  drawDuration = 1.6,
  fillDelay = 0.2,
  stagger = 0.05,
  strokeFadeDuration = 0.2,
  ease = "power2.out",
  trigger = "mount",
  fillMode = "wipe",
  fontSize = 128,
  fontWeight = 800,
  letterSpacing = -4,
  reverse = false,
  className = "",
  style = {},
  onFillStart,
  onAnimationComplete,
}: StrokeTextProps) {
  const rootRef = useRef<HTMLSpanElement | null>(null);
  const strokeTextRef = useRef<SVGTextElement | null>(null);
  const wipeRectRef = useRef<SVGRectElement | null>(null);
  const onFillStartRef = useRef(onFillStart);
  const onAnimationCompleteRef = useRef(onAnimationComplete);
  const [box, setBox] = useState<StrokeTextBox | null>(null);

  const rawId = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const wipeId = `stroke-text-wipe-${rawId}`;
  const gradientId = `stroke-text-gradient-${rawId}`;
  const characters = useMemo(() => Array.from(String(text ?? "")), [text]);
  const dash = Math.max(fontSize * 7, 200);
  const fontStyle = useMemo<CSSProperties>(() => ({
    fontSize: `${fontSize}px`,
    fontWeight,
    letterSpacing: `${letterSpacing}px`,
  }), [fontSize, fontWeight, letterSpacing]);

  useEffect(() => {
    onFillStartRef.current = onFillStart;
    onAnimationCompleteRef.current = onAnimationComplete;
  }, [onAnimationComplete, onFillStart]);

  useLayoutEffect(() => {
    const node = strokeTextRef.current;
    if (!node) return;

    let cancelled = false;
    const measure = () => {
      if (cancelled || !strokeTextRef.current) return;

      let bounds: DOMRect;
      try {
        bounds = strokeTextRef.current.getBBox();
      } catch {
        return;
      }
      if (!bounds.width) return;

      const padding = Math.max(Number(strokeWidth) || 1, fontSize * 0.1);
      const nextBox = {
        x: bounds.x - padding,
        y: bounds.y - padding,
        width: bounds.width + padding * 2,
        height: bounds.height + padding * 2,
      };
      setBox((current) => current
        && Math.abs(current.x - nextBox.x) < 0.5
        && Math.abs(current.width - nextBox.width) < 0.5
        && Math.abs(current.y - nextBox.y) < 0.5
        ? current
        : nextBox);
    };

    measure();
    document.fonts?.ready.then(measure).catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [characters, fontSize, fontWeight, letterSpacing, strokeWidth]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || !box) return;

    const strokes = gsap.utils.toArray(root.querySelectorAll("[data-stroke-char]"));
    const fills = gsap.utils.toArray(root.querySelectorAll("[data-fill-char]"));
    const wipe = wipeRectRef.current;
    if (!strokes.length) return;

    const fillEnabled = fillMode !== "none";
    const useWipe = fillEnabled && fillMode === "wipe";
    const fillDuration = Math.max(0.4, drawDuration * 0.5);
    const staggerConfig: number | gsap.StaggerVars = reverse ? { each: stagger, from: "end" } : stagger;
    const targets = [...strokes, ...fills, wipe].filter(Boolean);

    const setStart = () => {
      gsap.killTweensOf(targets);
      gsap.set(strokes, { opacity: 1, strokeDasharray: dash, strokeDashoffset: dash });
      gsap.set(fills, { opacity: useWipe ? 1 : 0 });
      if (wipe) gsap.set(wipe, { attr: { width: 0 } });
    };
    const setEnd = () => {
      gsap.killTweensOf(targets);
      gsap.set(strokes, {
        opacity: fillEnabled ? 0 : 1,
        strokeDasharray: dash,
        strokeDashoffset: 0,
      });
      gsap.set(fills, { opacity: fillEnabled ? 1 : 0 });
      if (wipe) gsap.set(wipe, { attr: { width: fillEnabled ? box.width : 0 } });
    };

    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setEnd();
      onFillStartRef.current?.();
      onAnimationCompleteRef.current?.();
      return () => gsap.killTweensOf(targets);
    }

    const buildTimeline = () => {
      setStart();
      const timeline = gsap.timeline({
        paused: true,
        repeat: trigger === "loop" ? -1 : 0,
        repeatDelay: trigger === "loop" ? 0.9 : 0,
        defaults: { overwrite: "auto" },
        onComplete: () => onAnimationCompleteRef.current?.(),
      });
      timeline.to(strokes, {
        strokeDashoffset: 0,
        duration: drawDuration,
        ease,
        stagger: staggerConfig,
      }, 0);

      let fillFinishedAt = drawDuration;
      if (useWipe && wipe) {
        timeline.call(() => onFillStartRef.current?.(), [], drawDuration + fillDelay);
        timeline.to(wipe, {
          attr: { width: box.width },
          duration: fillDuration,
          ease: "power2.inOut",
        }, drawDuration + fillDelay);
        fillFinishedAt = drawDuration + fillDelay + fillDuration;
      } else if (fillEnabled) {
        timeline.call(() => onFillStartRef.current?.(), [], drawDuration + fillDelay);
        timeline.to(fills, {
          opacity: 1,
          duration: fillDuration,
          ease: "power2.out",
          stagger: staggerConfig,
        }, drawDuration + fillDelay);
        fillFinishedAt = drawDuration + fillDelay + fillDuration + stagger * Math.max(0, fills.length - 1);
      }

      if (fillEnabled) {
        timeline.to(strokes, {
          opacity: 0,
          duration: strokeFadeDuration,
          ease: "power2.out",
        }, fillFinishedAt);
      }

      return timeline;
    };

    let timeline: gsap.core.Timeline | null = null;
    let scrollTrigger: ReturnType<typeof ScrollTrigger.create> | null = null;
    let removeHover: (() => void) | null = null;

    if (trigger === "hover") {
      setEnd();
      const play = () => {
        timeline?.kill();
        timeline = buildTimeline();
        timeline.play(0);
      };
      root.addEventListener("pointerenter", play);
      removeHover = () => root.removeEventListener("pointerenter", play);
    } else {
      timeline = buildTimeline();
      if (trigger === "scroll") {
        scrollTrigger = ScrollTrigger.create({
          trigger: root,
          start: "top 82%",
          once: true,
          onEnter: () => timeline?.play(0),
        });
      } else {
        timeline.play(0);
      }
    }

    return () => {
      removeHover?.();
      scrollTrigger?.kill();
      timeline?.kill();
      gsap.killTweensOf(targets);
    };
  }, [
    box,
    dash,
    drawDuration,
    fillDelay,
    stagger,
    strokeFadeDuration,
    ease,
    trigger,
    fillMode,
    reverse,
  ]);

  const viewBox = box
    ? `${box.x} ${box.y} ${box.width} ${box.height}`
    : `0 ${-fontSize} 600 ${fontSize * 1.3}`;
  const resolvedFill = fillGradient ? `url(#${gradientId})` : fillColor;

  return (
    <span
      ref={rootRef}
      className={`stroke-text ${trigger === "hover" ? "stroke-text--hover" : ""} ${className}`.trim()}
      style={{ ...style, "--stroke-text-height": `${Math.round(fontSize * 1.3)}px` } as CSSProperties}
      role="img"
      aria-label={String(text ?? "")}
    >
      <svg className="stroke-text__svg" viewBox={viewBox} preserveAspectRatio="xMidYMid meet" aria-hidden="true">
        {(fillGradient || (fillMode === "wipe" && box)) && (
          <defs>
            {fillGradient && (
              <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor={fillGradient[0]} />
                <stop offset="100%" stopColor={fillGradient[1]} />
              </linearGradient>
            )}
            {fillMode === "wipe" && box && (
              <clipPath id={wipeId} clipPathUnits="userSpaceOnUse">
                <rect ref={wipeRectRef} x={box.x} y={box.y} width="0" height={box.height} />
              </clipPath>
            )}
          </defs>
        )}

        <text
          ref={strokeTextRef}
          className="stroke-text__stroke"
          x="0"
          y="0"
          fill="none"
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          strokeLinejoin="round"
          strokeLinecap="round"
          style={fontStyle}
        >
          {characters.map((character, index) => (
            <tspan data-stroke-char key={`stroke-${index}`}>{character}</tspan>
          ))}
        </text>

        <text
          className="stroke-text__fill"
          x="0"
          y="0"
          fill={resolvedFill}
          stroke="none"
          style={fontStyle}
          clipPath={fillMode === "wipe" && box ? `url(#${wipeId})` : undefined}
        >
          {characters.map((character, index) => (
            <tspan data-fill-char key={`fill-${index}`}>{character}</tspan>
          ))}
        </text>
      </svg>
    </span>
  );
}
