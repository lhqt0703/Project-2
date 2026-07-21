import { useLayoutEffect, useRef } from "react";
import "./PhaseTextMorph.css";

interface PhaseTextMorphProps {
  text: string;
  className?: string;
  style?: React.CSSProperties;
}

const MORPH_DURATION_MS = 600;

function blurAlpha(source: Uint8ClampedArray, width: number, height: number, radius: number) {
  if (radius < 1) return source;

  const horizontal = new Float32Array(source.length);
  const output = new Uint8ClampedArray(source.length);

  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    let sum = 0;
    let count = Math.min(width, radius + 1);

    for (let x = 0; x < count; x += 1) sum += source[row + x];

    for (let x = 0; x < width; x += 1) {
      horizontal[row + x] = sum / count;

      const added = x + radius + 1;
      const removed = x - radius;
      if (added < width) {
        sum += source[row + added];
        count += 1;
      }
      if (removed >= 0) {
        sum -= source[row + removed];
        count -= 1;
      }
    }
  }

  for (let x = 0; x < width; x += 1) {
    let sum = 0;
    let count = Math.min(height, radius + 1);

    for (let y = 0; y < count; y += 1) sum += horizontal[y * width + x];

    for (let y = 0; y < height; y += 1) {
      output[y * width + x] = sum / count;

      const added = y + radius + 1;
      const removed = y - radius;
      if (added < height) {
        sum += horizontal[added * width + x];
        count += 1;
      }
      if (removed >= 0) {
        sum -= horizontal[removed * width + x];
        count -= 1;
      }
    }
  }

  return output;
}

function readColor(color: string) {
  const channels = color.match(/[\d.]+/g)?.map(Number) ?? [];
  return {
    red: channels[0] ?? 255,
    green: channels[1] ?? 255,
    blue: channels[2] ?? 255,
  };
}

export function PhaseTextMorph({ text, className = "", style }: PhaseTextMorphProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const currentTextRef = useRef(text);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const outputContext = canvas.getContext("2d", { willReadFrequently: true });
    if (!outputContext) return;

    const previousText = currentTextRef.current;
    const shouldAnimate = previousText !== text && !matchMedia("(prefers-reduced-motion: reduce)").matches;
    currentTextRef.current = text;

    const computedStyle = getComputedStyle(canvas);
    const font = computedStyle.font;
    const fontSize = Number.parseFloat(computedStyle.fontSize) || 32;
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    const measuringContext = document.createElement("canvas").getContext("2d");
    if (!measuringContext) return;

    measuringContext.font = font;
    const textWidth = Math.max(
      measuringContext.measureText(previousText).width,
      measuringContext.measureText(text).width,
    );
    const cssWidth = Math.ceil(textWidth + fontSize * 1.25);
    const cssHeight = Math.ceil(fontSize * 1.65);
    const width = Math.ceil(cssWidth * pixelRatio);
    const height = Math.ceil(cssHeight * pixelRatio);

    canvas.width = width;
    canvas.height = height;
    canvas.style.width = `${cssWidth}px`;
    canvas.style.height = `${cssHeight}px`;
    canvas.style.marginInline = `${-fontSize * 0.625}px`;

    const oldMaskCanvas = document.createElement("canvas");
    const newMaskCanvas = document.createElement("canvas");
    oldMaskCanvas.width = newMaskCanvas.width = width;
    oldMaskCanvas.height = newMaskCanvas.height = height;
    const oldMaskContext = oldMaskCanvas.getContext("2d", { willReadFrequently: true });
    const newMaskContext = newMaskCanvas.getContext("2d", { willReadFrequently: true });
    if (!oldMaskContext || !newMaskContext) return;

    const color = readColor(computedStyle.color);

    const drawMask = (
      context: CanvasRenderingContext2D,
      value: string,
      opacity: number,
      scale: number,
      blurRadius: number,
    ) => {
      context.clearRect(0, 0, width, height);
      context.save();
      context.scale(pixelRatio, pixelRatio);
      context.translate(cssWidth / 2, cssHeight / 2);
      context.scale(scale, scale);
      context.globalAlpha = opacity;
      context.fillStyle = "#fff";
      context.font = font;
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText(value, 0, 0);
      context.restore();

      const pixels = context.getImageData(0, 0, width, height).data;
      const alpha = new Uint8ClampedArray(width * height);
      for (let index = 0; index < alpha.length; index += 1) {
        alpha[index] = pixels[index * 4 + 3];
      }
      return blurAlpha(alpha, width, height, Math.round(blurRadius * pixelRatio));
    };

    const drawStatic = () => {
      outputContext.clearRect(0, 0, width, height);
      outputContext.save();
      outputContext.scale(pixelRatio, pixelRatio);
      outputContext.fillStyle = computedStyle.color;
      outputContext.font = font;
      outputContext.textAlign = "center";
      outputContext.textBaseline = "middle";
      outputContext.fillText(text, cssWidth / 2, cssHeight / 2);
      outputContext.restore();
    };

    if (!shouldAnimate) {
      drawStatic();
      return;
    }

    let animationFrame = 0;
    const startedAt = performance.now();

    const drawFrame = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / MORPH_DURATION_MS);
      const eased = progress * progress * (3 - 2 * progress);

      if (progress >= 1) {
        drawStatic();
        return;
      }

      const oldAlpha = drawMask(
        oldMaskContext,
        previousText,
        1 - eased * 0.45,
        1 + eased * 0.1,
        eased * 8,
      );
      const newAlpha = drawMask(
        newMaskContext,
        text,
        0.55 + eased * 0.45,
        0.9 + eased * 0.1,
        (1 - eased) * 8,
      );
      const image = outputContext.createImageData(width, height);

      for (let index = 0; index < oldAlpha.length; index += 1) {
        const combinedAlpha = Math.min(255, oldAlpha[index] + newAlpha[index]);
        const gooeyAlpha = Math.max(0, Math.min(255, (combinedAlpha - 70) * 4.6));
        const pixelIndex = index * 4;
        image.data[pixelIndex] = color.red;
        image.data[pixelIndex + 1] = color.green;
        image.data[pixelIndex + 2] = color.blue;
        image.data[pixelIndex + 3] = gooeyAlpha;
      }

      outputContext.putImageData(image, 0, 0);
      animationFrame = requestAnimationFrame(drawFrame);
    };

    animationFrame = requestAnimationFrame(drawFrame);
    return () => cancelAnimationFrame(animationFrame);
  }, [text]);

  return (
    <span className={`phase-text-morph-container ${className}`} style={style}>
      <canvas
        ref={canvasRef}
        className="phase-text-morph-canvas"
        role="img"
        aria-label={text}
      />
    </span>
  );
}
