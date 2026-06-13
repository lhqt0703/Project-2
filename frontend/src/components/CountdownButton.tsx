import React, { useState, useEffect, useMemo } from "react";

interface CountdownButtonProps {
  showCountdown: boolean;
  countdownSeconds: number | null;
  isPaused?: boolean;
}

export const CountdownButton: React.FC<CountdownButtonProps> = ({
  showCountdown,
  countdownSeconds,
  isPaused = false,
}) => {
  const [maxCountdownSec, setMaxCountdownSec] = useState<number>(0);

  useEffect(() => {
    if (showCountdown && countdownSeconds !== null) {
      if (countdownSeconds > maxCountdownSec) {
        setMaxCountdownSec(countdownSeconds);
      }
    } else {
      setMaxCountdownSec(0);
    }
  }, [showCountdown, countdownSeconds, maxCountdownSec]);

  const pulseDuration = useMemo(() => {
    if (!showCountdown || countdownSeconds === null || maxCountdownSec <= 0 || isPaused) return null;

    const halfTime = Math.min(maxCountdownSec / 2, 30);
    if (countdownSeconds > halfTime) return null;
    if (countdownSeconds <= 0) return null;

    if (halfTime > 10) {
      if (countdownSeconds > 10) {
        // Giai đoạn từ halfTime (tối đa 30) xuống 10: thời lượng nháy giảm dần từ 2.0s xuống 1.0s
        const ratio = (countdownSeconds - 10) / (halfTime - 10);
        const minDuration = 1.0;
        const maxDuration = 2.0;
        return minDuration + (maxDuration - minDuration) * ratio;
      } else {
        // Giai đoạn từ 10 xuống 0: thời lượng nháy giảm dần từ 1.0s xuống 0.001s
        const ratio = countdownSeconds / 10;
        const minDuration = 0.001;
        const maxDuration = 1.0;
        return minDuration + (maxDuration - minDuration) * ratio;
      }
    } else {
      // Nếu halfTime ban đầu <= 10, chạy thẳng từ halfTime về 0 với thời lượng nháy giảm dần từ 1.0s xuống 0.001s
      const ratio = countdownSeconds / halfTime;
      const minDuration = 0.001;
      const maxDuration = 1.0;
      return minDuration + (maxDuration - minDuration) * ratio;
    }
  }, [showCountdown, countdownSeconds, maxCountdownSec, isPaused]);

  if (!showCountdown) return null;

  const isHalfWay = maxCountdownSec > 0 && countdownSeconds !== null && countdownSeconds <= maxCountdownSec / 2;
  const isTimeUp = countdownSeconds === 0;

  let buttonClass = "visible border button-gradient";
  let styleOverride: React.CSSProperties = { cursor: "default" };
  let gradient0Style: React.CSSProperties = {};

  if (isPaused) {
    buttonClass += " paused";
    styleOverride = {
      ...styleOverride,
      opacity: 0.85,
      boxShadow: "0 0 10px rgba(245, 158, 11, 0.15)",
    };
  } else if (isTimeUp) {
    buttonClass += " time-up";
    gradient0Style = { opacity: 1, filter: "blur(0)", transform: "scale(1)" };
  } else if (isHalfWay && pulseDuration !== null) {
    buttonClass += " pulse-alert";
    styleOverride = { ...styleOverride, ["--pulse-duration" as any]: `${pulseDuration}s` };
  }

  return (
    <button className={buttonClass} style={styleOverride}>
      <div className="btn-content">
        <span>Còn {countdownSeconds}s</span> {" "}
        <span className="paused-text"> (tạm ngưng)</span>
      </div>
      <div className="border"></div>
      <div className="gradient-0" style={gradient0Style}></div>
      <div className="gradient-1"></div>
      <div className="glass"></div>
      <div className="gradient-2">
        <div className="color-1 color" style={{ transform: "translate(3%, 54%)" }}></div>
        <div className="color-2 color" style={{ transform: "translate(-5%, 64%)" }}></div>
        <div className="color-3 color" style={{ transform: "translate(-100%, -60%)" }}></div>
        <div className="color-4 color" style={{ transform: "translate(-98%, 86%)" }}></div>
        <div className="color-5 color" style={{ transform: "translate(-13%, -27%)" }}></div>
        <div className="color-6 color" style={{ transform: "translate(6%, -39%)" }}></div>
      </div>
    </button>
  );
};
