import confetti from "canvas-confetti";

const WINNER_CONFETTI_COLORS = ["#f97316", "#facc15", "#22c55e", "#38bdf8", "#a855f7", "#ec4899"];

export function shootWinnerConfettiFromSides() {
  const sharedOptions = {
    particleCount: 86,
    spread: 68,
    startVelocity: 52,
    decay: 0.91,
    gravity: 0.92,
    scalar: 0.95,
    ticks: 230,
    colors: WINNER_CONFETTI_COLORS,
    disableForReducedMotion: true,
    zIndex: 10000,
  };

  confetti({
    ...sharedOptions,
    angle: 55,
    origin: { x: 0, y: 0.58 },
  });
  confetti({
    ...sharedOptions,
    angle: 125,
    origin: { x: 1, y: 0.58 },
  });
}
