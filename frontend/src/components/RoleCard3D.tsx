import React, { useEffect, useRef, useState, useCallback, useMemo, useId } from "react";
import { soundManager } from "../utils/soundManager";
import nenLungAsset from "../assets/nền lưng.avif";
import moonSvgUrl from "../assets/moon.svg";
import "./RoleCard3D.css";

interface RoleCard3DProps {
  role: string | null;
  revealed: boolean;
  onToggleReveal?: () => void;
  backgroundAssetOverride?: string | null;
  lowPerformanceMode?: boolean;
}

// Khởi tạo glob import toàn bộ các file ảnh mặt trước (F role.png) và ảnh gốc của Gió
const roleCardImages = import.meta.glob<string>("../assets/*.{png,avif}", { eager: true, import: "default" });

// Helper chuẩn hóa chuỗi để tìm kiếm chính xác
const normalizeName = (name: string) => name.normalize("NFC").trim().toLowerCase();

// Hàm tìm ảnh mặt trước phù hợp với vai trò
const getRoleCardImage = (roleName: string | null) => {
  if (!roleName) return roleCardImages["../assets/F Dân Làng.png"] || "";
  const normalizedSearch = normalizeName(roleName);

  // Xử lý các trường hợp đặc biệt trước
  if (normalizedSearch === "gió") {
    return roleCardImages["../assets/Full Gió.png"] || roleCardImages["../assets/Gió.png"] || "";
  }
  if (normalizedSearch === "băng gia" || normalizedSearch === "băng giá") {
    return roleCardImages["../assets/F Băng.png"] || "";
  }
  if (normalizedSearch === "sấm sét") {
    return roleCardImages["../assets/F Sét.png"] || "";
  }

  // Tìm kiếm tương thích với định dạng "F <Tên Vai Trò>"
  const matchKey = Object.keys(roleCardImages).find(key => {
    const filename = key.split("/").pop()?.replace(/\.(png|avif)$/i, "") || "";
    if (filename.startsWith("F ")) {
      const cleanFilename = filename.substring(2);
      return normalizeName(cleanFilename) === normalizedSearch;
    }
    return false;
  });

  if (matchKey) {
    return roleCardImages[matchKey];
  }

  // Fallback thông minh
  if (normalizedSearch.includes("sói")) {
    return roleCardImages["../assets/F Sói.png"] || "";
  }

  return roleCardImages["../assets/F Dân Làng.png"] || "";
};

const ANIMATION_CONFIG = {
  INITIAL_DURATION: 1200,
  INITIAL_X_OFFSET: 70,
  INITIAL_Y_OFFSET: 60,
  DEVICE_BETA_OFFSET: 20,
  ENTER_TRANSITION_MS: 180
} as const;

// Các hàm phụ trợ tính toán tọa độ
const clamp = (v: number, min = 0, max = 100): number => Math.min(Math.max(v, min), max);
const round = (v: number, precision = 3): number => parseFloat(v.toFixed(precision));
const adjust = (v: number, fMin: number, fMax: number, tMin: number, tMax: number): number =>
  round(tMin + ((tMax - tMin) * (v - fMin)) / (fMax - fMin));

export default function RoleCard3D({
  role,
  revealed,
  onToggleReveal,
  lowPerformanceMode = (() => {
    if (typeof window !== "undefined") {
      return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.matchMedia("(pointer: coarse)").matches;
    }
    return false;
  })(),
}: RoleCard3DProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const gradRef = useRef<SVGLinearGradientElement>(null);

  const uniqueId = useId();
  const gradId = `holoGrad-${uniqueId.replace(/:/g, "")}`;

  const enterTimerRef = useRef<number | null>(null);
  const leaveRafRef = useRef<number | null>(null);

  // State lật nội bộ hỗ trợ lật thủ công
  const [isRevealed, setIsRevealed] = useState(revealed);
  const [displayedRole, setDisplayedRole] = useState(role);

  useEffect(() => {
    setIsRevealed(revealed);
    soundManager.play("cardFlip");
  }, [revealed]);

  const prevRoleRef = useRef(role);

  useEffect(() => {
    if (role !== prevRoleRef.current) {
      prevRoleRef.current = role;

      // Nếu thẻ bài đang mở (face up), lật úp nó lại trước khi đổi hình ảnh nhân vật
      if (isRevealed) {
        setIsRevealed(false);
        const timer = setTimeout(() => {
          setDisplayedRole(role);
        }, 720); // 720ms khớp với transition 0.72s trong CSS
        return () => clearTimeout(timer);
      } else {
        // Nếu thẻ bài đang úp (face down), đổi hình ảnh ngay lập tức
        setDisplayedRole(role);
      }
    }
  }, [role, isRevealed]);

  const cardFrontImage = getRoleCardImage(displayedRole);

  // 1. Khởi tạo bộ máy Easing 3D Spring (Tính toán gia tốc mượt mà 60 FPS)
  const tiltEngine = useMemo(() => {
    let rafId: number | null = null;
    let running = false;
    let lastTs = 0;
    let lastRenderTime = 0;

    // Tự động phát hiện di động/cảm ứng để khóa 30 FPS tiết kiệm pin/CPU, giữ 60 FPS trên desktop
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.matchMedia("(pointer: coarse)").matches;
    const targetFps = isMobile ?   60 : 60;
    const frameInterval = 1000 / targetFps;

    let currentX = 0;
    let currentY = 0;
    let targetX = 0;
    let targetY = 0;

    const DEFAULT_TAU = 0.14; // Độ trễ mềm của spring
    const INITIAL_TAU = 0.6;
    let initialUntil = 0;

    const setVarsFromXY = (x: number, y: number) => {
      const shell = shellRef.current;
      const wrap = wrapRef.current;
      if (!shell || !wrap) return;

      const width = shell.clientWidth || 1;
      const height = shell.clientHeight || 1;

      const percentX = clamp((100 / width) * x);
      const percentY = clamp((100 / height) * y);

      const centerX = percentX - 50;
      const centerY = percentY - 50;

      // Thiết lập toàn bộ các biến CSS tùy biến cho cơ chế ánh sáng của ProfileCard
      const properties = {
        "--pointer-x": `${percentX}%`,
        "--pointer-y": `${percentY}%`,
        "--background-x": `${adjust(percentX, 0, 100, 35, 65)}%`,
        "--background-y": `${adjust(percentY, 0, 100, 35, 65)}%`,
        "--pointer-from-center": `${clamp(Math.hypot(percentY - 50, percentX - 50) / 50, 0, 1)}`,
        "--pointer-from-top": `${percentY / 100}`,
        "--pointer-from-left": `${percentX / 100}`,
        "--rotate-x": `${round(-(centerX / 4.8))}deg`,
        "--rotate-y": `${round(centerY / 3.8)}deg`
      } as Record<string, string>;

      for (const [k, v] of Object.entries(properties)) {
        wrap.style.setProperty(k, v);
      }
    };

    const step = (ts: number) => {
      if (!running) return;

      // Đăng ký frame tiếp theo ngay lập tức để duy trì vòng lặp
      rafId = requestAnimationFrame(step);

      // Throttling FPS: Kiểm tra xem đã đủ thời gian giãn cách giữa các frame chưa
      const elapsed = ts - lastRenderTime;
      if (elapsed < frameInterval) return;

      // Cập nhật mốc thời gian vẽ cuối cùng (giảm thiểu sai số trôi)
      lastRenderTime = ts - (elapsed % frameInterval);

      if (lastTs === 0) lastTs = ts;
      const dt = (ts - lastTs) / 1000;
      lastTs = ts;

      const tau = ts < initialUntil ? INITIAL_TAU : DEFAULT_TAU;
      const k = 1 - Math.exp(-dt / tau);

      currentX += (targetX - currentX) * k;
      currentY += (targetY - currentY) * k;

      setVarsFromXY(currentX, currentY);

      const stillFar = Math.abs(targetX - currentX) > 0.05 || Math.abs(targetY - currentY) > 0.05;

      if (!stillFar && !document.hasFocus()) {
        running = false;
        lastTs = 0;
        if (rafId) {
          cancelAnimationFrame(rafId);
          rafId = null;
        }
      }
    };

    const start = () => {
      if (running) return;
      running = true;
      lastTs = 0;
      lastRenderTime = performance.now();
      rafId = requestAnimationFrame(step);
    };

    return {
      setImmediate(x: number, y: number) {
        currentX = x;
        currentY = y;
        setVarsFromXY(currentX, currentY);
      },
      setTarget(x: number, y: number) {
        targetX = x;
        targetY = y;
        start();
      },
      toCenter() {
        const shell = shellRef.current;
        if (!shell) return;
        this.setTarget(shell.clientWidth / 2, shell.clientHeight / 2);
      },
      beginInitial(durationMs: number) {
        initialUntil = performance.now() + durationMs;
        start();
      },
      getCurrent() {
        return { x: currentX, y: currentY, tx: targetX, ty: targetY };
      },
      cancel() {
        if (rafId) cancelAnimationFrame(rafId);
        rafId = null;
        running = false;
        lastTs = 0;
      }
    };
  }, []);

  const getOffsets = (evt: PointerEvent, el: HTMLElement) => {
    const rect = el.getBoundingClientRect();
    return { x: evt.clientX - rect.left, y: evt.clientY - rect.top };
  };

  const handlePointerMove = useCallback(
    (event: PointerEvent) => {
      const shell = shellRef.current;
      if (!shell || !tiltEngine) return;
      const { x, y } = getOffsets(event, shell);
      tiltEngine.setTarget(x, y);
    },
    [tiltEngine]
  );

  const handlePointerEnter = useCallback(
    (event: PointerEvent) => {
      const shell = shellRef.current;
      if (!shell || !tiltEngine) return;

      shell.classList.add("active");
      shell.classList.add("entering");
      if (enterTimerRef.current) window.clearTimeout(enterTimerRef.current);
      enterTimerRef.current = window.setTimeout(() => {
        shell.classList.remove("entering");
      }, ANIMATION_CONFIG.ENTER_TRANSITION_MS);

      const { x, y } = getOffsets(event, shell);
      tiltEngine.setTarget(x, y);
    },
    [tiltEngine]
  );

  const handlePointerLeave = useCallback(() => {
    const shell = shellRef.current;
    if (!shell || !tiltEngine) return;

    tiltEngine.toCenter();

    const checkSettle = () => {
      const { x, y, tx, ty } = tiltEngine.getCurrent();
      const settled = Math.hypot(tx - x, ty - y) < 0.6;
      if (settled) {
        shell.classList.remove("active");
        leaveRafRef.current = null;
      } else {
        leaveRafRef.current = requestAnimationFrame(checkSettle);
      }
    };
    if (leaveRafRef.current) cancelAnimationFrame(leaveRafRef.current);
    leaveRafRef.current = requestAnimationFrame(checkSettle);
  }, [tiltEngine]);

  const handleDeviceOrientation = useCallback(
    (event: DeviceOrientationEvent) => {
      const shell = shellRef.current;
      if (!shell || !tiltEngine) return;

      const { beta, gamma } = event;
      if (beta == null || gamma == null) return;

      const centerX = shell.clientWidth / 2;
      const centerY = shell.clientHeight / 2;
      
      // Độ nhạy nghiêng di động mặc định là 5.5
      const sensitivity = 5.5;
      const x = clamp(centerX + gamma * sensitivity, 0, shell.clientWidth);
      const y = clamp(
        centerY + (beta - ANIMATION_CONFIG.DEVICE_BETA_OFFSET) * sensitivity,
        0,
        shell.clientHeight
      );

      tiltEngine.setTarget(x, y);
    },
    [tiltEngine]
  );

  useEffect(() => {
    if (!tiltEngine) return;

    const shell = shellRef.current;
    if (!shell) return;

    const pointerMoveHandler = handlePointerMove as EventListener;
    const pointerEnterHandler = handlePointerEnter as EventListener;
    const pointerLeaveHandler = handlePointerLeave as EventListener;
    const deviceOrientationHandler = handleDeviceOrientation as EventListener;

    shell.addEventListener("pointerenter", pointerEnterHandler);
    shell.addEventListener("pointermove", pointerMoveHandler);
    shell.addEventListener("pointerleave", pointerLeaveHandler);

    // Kích hoạt xin quyền con quay hồi chuyển trên điện thoại
    const handleClick = () => {
      if (window.location.protocol !== "https:") return;
      const anyMotion = window.DeviceMotionEvent as any;
      if (anyMotion && typeof anyMotion.requestPermission === "function") {
        anyMotion
          .requestPermission()
          .then((state: string) => {
            if (state === "granted") {
              window.addEventListener("deviceorientation", deviceOrientationHandler);
            }
          })
          .catch(console.error);
      } else {
        window.addEventListener("deviceorientation", deviceOrientationHandler);
      }
    };
    shell.addEventListener("click", handleClick);

    // Thiết lập vị trí quét sáng lướt ban đầu đẹp mắt
    const initialX = (shell.clientWidth || 0) - ANIMATION_CONFIG.INITIAL_X_OFFSET;
    const initialY = ANIMATION_CONFIG.INITIAL_Y_OFFSET;
    tiltEngine.setImmediate(initialX, initialY);
    tiltEngine.toCenter();
    tiltEngine.beginInitial(ANIMATION_CONFIG.INITIAL_DURATION);

    return () => {
      shell.removeEventListener("pointerenter", pointerEnterHandler);
      shell.removeEventListener("pointermove", pointerMoveHandler);
      shell.removeEventListener("pointerleave", pointerLeaveHandler);
      shell.removeEventListener("click", handleClick);
      window.removeEventListener("deviceorientation", deviceOrientationHandler);
      if (enterTimerRef.current) window.clearTimeout(enterTimerRef.current);
      if (leaveRafRef.current) cancelAnimationFrame(leaveRafRef.current);
      tiltEngine.cancel();
      shell.classList.remove("entering");
    };
  }, [
    tiltEngine,
    handlePointerMove,
    handlePointerEnter,
    handlePointerLeave,
    handleDeviceOrientation
  ]);

  // Cấu hình CSS variables cho thẻ bài
  const cardStyle = useMemo(
    () =>
      ({
        "--icon": `url(${moonSvgUrl})`,
        "--grain": `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
        "--inner-gradient": "linear-gradient(135deg, #1d122e 0%, #0d1e28 100%)",
        "--behind-glow-color": isRevealed ? "rgba(255, 255, 255, 0.22)" : "rgba(186, 85, 211, 0.45)",
        "--behind-glow-size": "65%",
        "--base-rotation-y": isRevealed ? "180deg" : "0deg",
      }) as React.CSSProperties,
    [isRevealed]
  );

  const handleClickCard = () => {
    if (onToggleReveal) {
      onToggleReveal();
    } else {
      setIsRevealed(prev => !prev);
    }
  };

  return (
    <div
      ref={wrapRef}
      className={`pc-card-wrapper ${lowPerformanceMode ? "performance-mode" : ""}`}
      style={cardStyle}
    >
      {/* Hào quang nền neon lộng lẫy phía sau */}
      <div className="pc-behind" />

      <div ref={shellRef} className="pc-card-shell" onClick={handleClickCard}>
        <div className="pc-card">
          
          {/* ================= MẶT SAU LÁ BÀI (CARD BACK) ================= */}
          <div
            className="pc-card-back"
            style={{
              backgroundImage: `url(${nenLungAsset})`,
            }}
          >
            {/* Vệt quét sáng Holographic phủ kín nền mặt sau */}
            <div className="pc-shine" style={{ position: "absolute", inset: 0, opacity: 0.12, pointerEvents: "none" }} />
            <div className="pc-glare" style={{ opacity: 0.18 }} />

            {/* Logo Moon SVG ở giữa mặt sau */}
            <svg
              viewBox="0 0 511.99928 511"
              style={{
                width: "120px",
                height: "120px",
                filter: "drop-shadow(0 0 25px rgba(243, 85, 218, 0.6)) drop-shadow(0 0 8px rgba(0, 242, 254, 0.4))",
                zIndex: 2,
                position: "relative",
              }}
            >
              <defs>
                {/* Gradient Holographic duy nhất cho từng card, dùng trực tiếp mã màu HSL chói lọi từ React Bits */}
                <linearGradient id={gradId} ref={gradRef} x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="hsl(2, 100%, 73%)" />
                  <stop offset="20%" stopColor="hsl(53, 100%, 69%)" />
                  <stop offset="35%" stopColor="hsl(93, 100%, 69%)" />
                  <stop offset="50%" stopColor="#ffffff" />
                  <stop offset="65%" stopColor="hsl(176, 100%, 76%)" />
                  <stop offset="80%" stopColor="hsl(228, 100%, 74%)" />
                  <stop offset="100%" stopColor="hsl(283, 100%, 73%)" />
                </linearGradient>
              </defs>
              <path fill={`url(#${gradId})`} d="m504.753906 305.828125c-5.824218-3.59375-13.34375-2.933594-18.386718 1.675781-36.726563 33.3125-84.234376 51.667969-133.746094 51.667969-109.894532 0-199.304688-89.410156-199.304688-199.304687 0-49.515626 18.355469-97.019532 51.667969-133.746094 4.59375-5.0625 5.285156-12.5625 1.675781-18.386719-3.609375-5.808594-10.675781-8.503906-17.203125-6.660156-111.558593 31.589843-189.457031 134.714843-189.457031 250.777343 0 143.71875 116.917969 260.632813 260.632812 260.632813 116.0625 0 219.191407-77.898437 250.78125-189.453125 1.871094-6.589844-.851562-13.597656-6.660156-17.203125zm0 0" />
              <path fill={`url(#${gradId})`} d="m253.882812 202.820312 36.320313 18.144532 18.144531 36.324218c2.589844 5.195313 7.90625 8.472657 13.714844 8.472657 5.8125 0 11.109375-3.277344 13.714844-8.472657l18.164062-36.324218 36.304688-18.144532c5.195312-2.605468 8.472656-7.90625 8.472656-13.714843 0-5.808594-3.277344-11.109375-8.472656-13.714844l-36.304688-18.148437-18.164062-36.320313c-5.210938-10.390625-22.246094-10.390625-27.429688 0l-18.144531 36.320313-36.320313 18.148437c-5.195312 2.589844-8.476562 7.90625-8.476562 13.714844 0 5.808593 3.28125 11.125 8.476562 13.714843zm0 0" />
              <path fill={`url(#${gradId})`} d="m413.945312 83.207031h15.332032v15.332031c0 8.472657 6.859375 15.332032 15.332031 15.332032s15.332031-6.859375 15.332031-15.332032v-15.332031h15.332032c8.472656 0 15.332031-6.855469 15.332031-15.332031 0-8.472656-6.859375-15.328125-15.332031-15.328125h-15.332032v-15.332031c0-8.476563-6.859375-15.332032-15.332031-15.332032s-15.332031 6.855469-15.332031 15.332032v15.332031h-15.332032c-8.472656 0-15.328124 6.855469-15.328124 15.328125 0 8.476562 6.855468 15.332031 15.328124 15.332031zm0 0" />
            </svg>
          </div>

          {/* ================= MẶT TRƯỚC LÁ BÀI (CARD FRONT) ================= */}
          <div className="pc-card-front">
            <img
              src={cardFrontImage}
              alt={role || "Vai Trò"}
              className="pc-front-img"
              loading="lazy"
            />
            {/* Lớp phủ nhũ Holographic Foil óng ánh chói lóa trên mặt thẻ nhân vật */}
            <div className="pc-shine pc-front-holo-overlay" />
            <div className="pc-glare" />
          </div>

        </div>
      </div>
    </div>
  );
}
