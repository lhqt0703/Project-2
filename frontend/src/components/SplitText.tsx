import { useEffect, useLayoutEffect, useRef, type ElementType } from "react";
import { gsap } from "gsap";
import { SplitText as GSAPSplitText } from "gsap/SplitText";
import "./SplitText.css";

gsap.registerPlugin(GSAPSplitText);

type SplitTextProps = {
  text: string;
  className?: string;
  delay?: number;
  duration?: number;
  startDelay?: number;
  ease?: string;
  from?: gsap.TweenVars;
  to?: gsap.TweenVars;
  tag?: "h2" | "p" | "span";
  id?: string;
  onAnimationComplete?: () => void;
};

export default function SplitText({
  text,
  className = "",
  delay = 50,
  duration = 1.25,
  startDelay = 0,
  ease = "power3.out",
  from = { opacity: 0, y: 40 },
  to = { opacity: 1, y: 0 },
  tag = "p",
  id,
  onAnimationComplete,
}: SplitTextProps) {
  const elementRef = useRef<HTMLElement>(null);
  const onAnimationCompleteRef = useRef(onAnimationComplete);
  const fromKey = JSON.stringify(from);
  const toKey = JSON.stringify(to);

  useEffect(() => {
    onAnimationCompleteRef.current = onAnimationComplete;
  }, [onAnimationComplete]);

  useLayoutEffect(() => {
    const element = elementRef.current;
    if (!element || !text) return;

    let cancelled = false;
    let split: GSAPSplitText | null = null;
    let animation: gsap.core.Tween | null = null;

    const animate = async () => {
      await document.fonts?.ready;
      if (cancelled) return;

      split = new GSAPSplitText(element, {
        type: "lines",
        linesClass: "split-text__line",
        smartWrap: true,
      });
      const lines = split.lines;
      gsap.set(lines, from);
      element.classList.add("is-ready");

      if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
        gsap.set(lines, to);
        animation = gsap.to({}, {
          duration: startDelay,
          onComplete: () => onAnimationCompleteRef.current?.(),
        });
        return;
      }

      animation = gsap.to(lines, {
        ...to,
        delay: startDelay,
        duration,
        ease,
        stagger: delay / 1000,
        force3D: true,
        willChange: "transform, opacity",
        onComplete: () => onAnimationCompleteRef.current?.(),
      });
    };

    void animate();
    return () => {
      cancelled = true;
      animation?.kill();
      split?.revert();
      element.classList.remove("is-ready");
    };
  }, [delay, duration, ease, fromKey, startDelay, text, toKey]);

  const Tag = tag as ElementType;
  return (
    <Tag ref={elementRef} id={id} className={`split-text ${className}`.trim()}>
      {text}
    </Tag>
  );
}
