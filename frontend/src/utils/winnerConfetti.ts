import confetti from "canvas-confetti";

const PheDân = ["#f97316", "#facc15", "#22c55e", "#38bdf8", "#a855f7", "#ec4899"];
const CặpĐôi = ["#f91616", "#fa1515", "#c52222", "#f83838", "#f75555", "#ec4899"];
const PheSói = ["#220e0e", "#3f0b0b", "#422b2b", "#300d0d", "#5a1717", "#000000"];

export function shootWinnerConfettiFromSides(winner?: string, loveState?: any) {
  // Check if Thần tình yêu (Cupid) and a Wolf are the couple and won
  let isCupidWolfCouple = false;
  if (winner === "lovers" && loveState && Array.isArray(loveState.pairIds) && loveState.pairIds.length >= 2) {
    const p1 = loveState.pairIds[0];
    const p2 = loveState.pairIds[1];
    const r1 = (loveState.rolesByPlayerId?.[p1] || "").toLowerCase();
    const r2 = (loveState.rolesByPlayerId?.[p2] || "").toLowerCase();

    const isCupid = (role: string) => role === "thần tình yêu" || role === "cupid" || role === "love_god";
    const isWolf = (role: string) => role.includes("sói") || role.includes("wolf");

    isCupidWolfCouple = (isCupid(r1) && isWolf(r2)) || (isCupid(r2) && isWolf(r1));
  }

  if (isCupidWolfCouple) {
    const cupidOptions = {
      particleCount: 1969,
      startVelocity: 152,
      ticks: 1000,
      colors: CặpĐôi,
      disableForReducedMotion: true,
      zIndex: 10000,
      spread: 90,
    };

    // Bắn 1 phát ở khắp màn hình từ dưới lên 1 tý
    confetti({
      ...cupidOptions,
      angle: 90,
      origin: { x: 0.5, y: 3 },
    });

    // Bắn 1 phát ở khắp màn hình từ dưới lên nhiều hơn 1 tý
    setTimeout(() => {
      confetti({
        ...cupidOptions,
        angle: 90,
        origin: { x: 0.5, y: 2 },
      });
    }, 1000);

    // Bắn 1 phát cuối từ dưới màn lên cái đùng
    setTimeout(() => {
      confetti({
        ...cupidOptions,
        angle: 90,
        origin: { x: 0.5, y: 1 },
      });
    }, 2500);

    return;
  }

  // Determine colors based on winner
  const isWolfWin = winner === "wolves" || winner === "demons";
  const colors = isWolfWin ? PheSói : PheDân;
  const spread = isWolfWin ? 1 : 68;
  const particleCount = isWolfWin ? 186 : 86;

  const sharedOptions = {
    particleCount: particleCount,
    spread: spread,
    startVelocity: 52,
    decay: 0.91,
    gravity: 0.92,
    scalar: 0.95,
    ticks: 330,
    colors: colors,
    //disableForReducedMotion: true, //vô hiệu hóa hiệu ứng nếu người dùng bật chế độ giảm chuyển động
    zIndex: 10000,
  };

  const yPositions = [1, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3];

  yPositions.forEach((y, index) => {
    setTimeout(() => {
      confetti({
        ...sharedOptions,
        angle: 55,
        origin: { x: 0, y },
      });
      confetti({
        ...sharedOptions,
        angle: 125,
        origin: { x: 1, y },
      });

      if (isWolfWin) {
        confetti({
          particleCount: 400,
          spread: 68,
          startVelocity: 52,
          decay: 0.91,
          gravity: 1.92,
          scalar: 0.95,
          ticks: 430,
          colors: PheSói,
          angle: 90,
          origin: { x: 0.5, y: 0 },
          zIndex: 10000,
        });
      }
    }, index * 120);
  });
}
