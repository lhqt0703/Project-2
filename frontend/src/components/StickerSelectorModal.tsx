import React, { useState, useRef, useEffect } from "react";
import { STICKER_LIST } from "../utils/stickerAssets";

interface StickerSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectSticker: (filename: string, channel: "wolf" | "lovers", event: React.MouseEvent | React.TouchEvent | null) => void;
  onSendPlayerMessage?: (text: string, channel: "wolf" | "lovers") => void;
  isWolf: boolean;
  isLover: boolean;
}

interface StickerItemProps {
  sticker: { filename: string; url: string };
  activeChannel: "wolf" | "lovers";
  onSelectSticker: (filename: string, channel: "wolf" | "lovers", event: any) => void;
  onClose: () => void;
}

const StickerItem: React.FC<StickerItemProps> = ({ sticker, activeChannel, onSelectSticker, onClose }) => {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startPosRef = useRef<{ x: number; y: number } | null>(null);
  const isTriggeredRef = useRef(false);

  const startTimer = (clientX: number, clientY: number, originalEvent: any) => {
    isTriggeredRef.current = false;
    startPosRef.current = { x: clientX, y: clientY };

    const mockEvent = {
      clientX,
      clientY,
      touches: originalEvent.touches ? [{ clientX, clientY }] : undefined,
      nativeEvent: originalEvent.nativeEvent || originalEvent
    };

    timerRef.current = setTimeout(() => {
      isTriggeredRef.current = true;
      onSelectSticker(sticker.filename, activeChannel, mockEvent);
      onClose();
    }, 180); // 180ms long-press detection
  };

  const handleMove = (clientX: number, clientY: number) => {
    if (!startPosRef.current || isTriggeredRef.current) return;
    const dx = clientX - startPosRef.current.x;
    const dy = clientY - startPosRef.current.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    // Hủy timer nếu người dùng vuốt/di chuyển quá 8px (đang cuộn danh sách)
    if (dist > 8) {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    }
  };

  const handleEnd = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;

      // Click/Tap nhanh -> dán tĩnh ngay
      if (!isTriggeredRef.current) {
        onSelectSticker(sticker.filename, activeChannel, null);
        onClose();
      }
    }
  };

  // Mouse Handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return; // Chỉ chuột trái
    startTimer(e.clientX, e.clientY, e);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    handleMove(e.clientX, e.clientY);
  };

  const handleMouseUp = () => {
    handleEnd();
  };

  // Touch Handlers
  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    startTimer(touch.clientX, touch.clientY, e);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    handleMove(touch.clientX, touch.clientY);
  };

  const handleTouchEnd = () => {
    handleEnd();
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return (
    <div
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      className="sticker-grid-item"
    >
      <img
        src={sticker.url}
        alt=""
        style={{ width: "42px", height: "42px", objectFit: "contain" }}
        draggable="false"
      />
    </div>
  );
};

const WolfPawIcon: React.FC<{ active: boolean; onClick?: () => void; style?: React.CSSProperties }> = ({ active, onClick, style }) => {
  const mainColor = active ? "#8C5A3C" : "rgba(255, 255, 255, 0.28)";
  const clawColor = active ? "#9CA3AF" : "rgba(255, 255, 255, 0.28)";
  return (
    <svg
      viewBox="0 0 64 64"
      width="22"
      height="22"
      onClick={onClick}
      style={{
        cursor: onClick ? "pointer" : "default",
        transition: "all 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
        filter: active ? "drop-shadow(0 0 5px rgba(140, 90, 60, 0.8))" : "none",
        opacity: active ? 1 : 0.5,
        transform: active ? "scale(1.1)" : "scale(0.95)",
        display: "block",
        ...style,
      }}
    >
      <path
        d="m32 57a13.811 13.811 0 0 0 -8.841 3.2 7.764 7.764 0 0 1 -4.969 1.8 8.19 8.19 0 0 1 -8.19-8.19 6.478 6.478 0 0 1 3.331-5.661l1.3-.723a14.383 14.383 0 0 0 6.292-7.041 12 12 0 0 1 11.077-7.385 12 12 0 0 1 11.076 7.385 14.383 14.383 0 0 0 6.292 7.041l1.3.723a6.478 6.478 0 0 1 3.332 5.661 8.19 8.19 0 0 1 -8.19 8.19 7.764 7.764 0 0 1 -4.969-1.8 13.811 13.811 0 0 0 -8.841-3.2z"
        fill={mainColor}
      />
      <ellipse cx="23" cy="24" rx="6" ry="9" fill={mainColor} />
      <ellipse cx="41" cy="24" rx="6" ry="9" fill={mainColor} />
      <ellipse cx="11" cy="37" rx="6" ry="8" fill={mainColor} />
      <ellipse cx="53" cy="37" rx="6" ry="8" fill={mainColor} />
      <path
        d="m9.572 26a2.428 2.428 0 0 0 2.428-2.428 2.423 2.423 0 0 0 -.257-1.086 7.046 7.046 0 0 1 -.743-3.148v-3.338l-.343.458a13.28 13.28 0 0 0 -2.657 7.97 1.572 1.572 0 0 0 1.572 1.572z"
        fill={clawColor}
      />
      <path
        d="m23.572 12a2.428 2.428 0 0 0 2.428-2.428 2.423 2.423 0 0 0 -.257-1.086 7.046 7.046 0 0 1 -.743-3.148v-3.338l-.343.458a13.28 13.28 0 0 0 -2.657 7.97 1.572 1.572 0 0 0 1.572 1.572z"
        fill={clawColor}
      />
      <path
        d="m54.428 26a2.428 2.428 0 0 1 -2.428-2.428 2.423 2.423 0 0 1 .257-1.086 7.046 7.046 0 0 0 .743-3.148v-3.338l.343.458a13.28 13.28 0 0 1 2.657 7.97 1.572 1.572 0 0 1 -1.572 1.572z"
        fill={clawColor}
      />
      <path
        d="m40.428 12a2.428 2.428 0 0 1 -2.428-2.428 2.423 2.423 0 0 1 .257-1.086 7.046 7.046 0 0 0 .743-3.148v-3.338l.343.458a13.28 13.28 0 0 1 2.657 7.97 1.572 1.572 0 0 1 -1.572 1.572z"
        fill={clawColor}
      />
    </svg>
  );
};

const LoverHeartIcon: React.FC<{ active: boolean; onClick?: () => void; style?: React.CSSProperties }> = ({ active, onClick, style }) => {
  const frontHeartColor = active ? "#f96b84" : "rgba(255, 255, 255, 0.28)";
  const backHeartColor = active ? "#f3506d" : "rgba(255, 255, 255, 0.28)";
  const starColor = active ? "#F59E0B" : "rgba(255, 255, 255, 0.28)";
  const dotColor = active ? "#F59E0B" : "rgba(255, 255, 255, 0.28)";
  return (
    <svg
      viewBox="0 0 36 36"
      width="22"
      height="22"
      onClick={onClick}
      style={{
        cursor: onClick ? "pointer" : "default",
        transition: "all 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
        filter: active ? "drop-shadow(0 0 5px rgba(244, 63, 94, 0.8))" : "none",
        opacity: active ? 1 : 0.5,
        transform: active ? "scale(1.1)" : "scale(0.95)",
        display: "block",
        ...style,
      }}
    >
      <g fillRule="evenodd">
        <path d="m30 8.62a1.15 1.15 0 0 1 0 2.29 1.15 1.15 0 1 1 0-2.29z" fill={dotColor} />
        <path d="m5.17 27.58a1.15 1.15 0 1 1 1.15-1.15 1.15 1.15 0 0 1 -1.15 1.15z" fill={dotColor} />
        <path
          d="m23.49 12a7.89 7.89 0 0 0 -9-1.24c-3 1.61-4.74 5.57-4.35 10.41a15.6 15.6 0 0 1 -4.53-3.32c-3.39-3.61-4.51-7.85-2.86-10.5s6.07-3.88 9.42-.27c1.09-4.79 5.51-6 8.28-4.47 2.55 1.39 3.73 5.06 3.04 9.39z"
          fill={backHeartColor}
        />
        <path
          d="m30.43 28c-2.43 2.71-7.23 4.8-11.11 6-2.42-2.63-5.15-6.19-6.23-9.45-1.56-4.19-.77-10.31 2.45-11.79a5.61 5.61 0 0 1 7.26 2 7 7 0 0 1 1 2.47c.16-.17.34-.32.47-.47 3.27-3 7.38-1.83 9 .75s.5 6.87-2.84 10.49z"
          fill={frontHeartColor}
        />
        <path
          d="m28.35 3.08a.46.46 0 0 1 .29-.43.44.44 0 0 1 .51.11l.45.5a.47.47 0 0 0 .35.15h.67a.45.45 0 0 1 .32.79l-.49.45a.44.44 0 0 0 -.15.35v.67a.46.46 0 0 1 -.8.32l-.45-.49a.44.44 0 0 0 -.35-.15h-.67a.47.47 0 0 1 -.44-.29.45.45 0 0 1 .12-.51l.49-.45a.44.44 0 0 0 .15-.35c0-.16 0-.41 0-.67z"
          fill={starColor}
        />
        <path
          d="m9.65 31.42a.46.46 0 0 1 -.86 0l-.23-.63a.51.51 0 0 0 -.27-.27l-.63-.23a.46.46 0 0 1 0-.86l.63-.23a.45.45 0 0 0 .27-.27c.06-.15.14-.38.23-.62a.46.46 0 0 1 .86 0c.09.24.18.47.23.62a.45.45 0 0 0 .27.27l.63.23a.46.46 0 0 1 0 .86l-.63.23a.51.51 0 0 0 -.27.27c-.05.16-.14.39-.23.63z"
          fill={starColor}
        />
      </g>
    </svg>
  );
};

const SendIcon: React.FC<{ activeChannel: "wolf" | "lovers" }> = ({ activeChannel }) => {
  const isWolf = activeChannel === "wolf";
  if (isWolf) {
    return (
      <svg fill="none" height="18" viewBox="0 0 24 24" width="18" xmlns="http://www.w3.org/2000/svg">
        <path
          d="m22.1012 10.5616-19.34831-9.43824c-.1664-.08117-.53427-.12336-.53427-.12336-.67302 0-1.21862.5456-1.21862 1.21862v.03517c0 .16352.02005.32643.05971.48507l1.85597 7.42384.32326 1.3817c.07012.2997.07012.6115 0 .9112l-.32326 1.3817-1.85597 7.4238c-.03966.1587-.05971.3216-.05971.4851v.0352c0 .673.5456 1.2186 1.21862 1.2186.18515 0 .36787-.0422.53427-.1234l19.34831-9.4382c.5499-.2682.8988-.8265.8988-1.4384s-.3489-1.1702-.8988-1.4384z"
          fill="#8C5A3C"
        />
        <path
          d="m2.91553 13.838c.05069-.2028.22197-.352.42968-.375l8.15769-.9063c.2829-.0314.4971-.272.4971-.5566 0-.2847-.2142-.5233-.4971-.5547l-8.15769-.9063c-.2027-.0225-.37071-.1651-.42581-.3604l.31954 1.3657c.07012.2998.07012.6116 0 .9113z"
          fill="#5C3A24"
        />
      </svg>
    );
  }
  return (
    <svg fill="none" height="18" viewBox="0 0 24 24" width="18" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="send_gradient" gradientUnits="userSpaceOnUse" x1="0" x2="24" y1="0" y2="24">
          <stop offset=".0833333" stopColor="#ff6a6a"/>
          <stop offset="1" stopColor="#f72257"/>
        </linearGradient>
      </defs>
      <path
        d="m22.1012 10.5616-19.34831-9.43824c-.1664-.08117-.53427-.12336-.53427-.12336-.67302 0-1.21862.5456-1.21862 1.21862v.03517c0 .16352.02005.32643.05971.48507l1.85597 7.42384.32326 1.3817c.07012.2997.07012.6115 0 .9112l-.32326 1.3817-1.85597 7.4238c-.03966.1587-.05971.3216-.05971.4851v.0352c0 .673.5456 1.2186 1.21862 1.2186.18515 0 .36787-.0422.53427-.1234l19.34831-9.4382c.5499-.2682.8988-.8265.8988-1.4384s-.3489-1.1702-.8988-1.4384z"
        fill="url(#send_gradient)"
      />
      <path
        d="m2.91553 13.838c.05069-.2028.22197-.352.42968-.375l8.15769-.9063c.2829-.0314.4971-.272.4971-.5566 0-.2847-.2142-.5233-.4971-.5547l-8.15769-.9063c-.2027-.0225-.37071-.1651-.42581-.3604l.31954 1.3657c.07012.2998.07012.6116 0 .9113z"
        fill="#850026"
      />
    </svg>
  );
};

let lastSelectedChannel: "wolf" | "lovers" | null = null;

export const StickerSelectorModal: React.FC<StickerSelectorModalProps> = ({
  isOpen,
  onClose,
  onSelectSticker,
  onSendPlayerMessage,
  isWolf,
  isLover,
}) => {
  const isBoth = isWolf && isLover;
  const [activeChannel, setActiveChannel] = useState<"wolf" | "lovers">(() => {
    if (lastSelectedChannel) {
      if (lastSelectedChannel === "wolf" && isWolf) return "wolf";
      if (lastSelectedChannel === "lovers" && isLover) return "lovers";
    }
    return isWolf ? "wolf" : "lovers";
  });
  const [animatingTarget, setAnimatingTarget] = useState<"wolf" | "lovers" | null>(null);
  const [showText, setShowText] = useState<string | null>(null);
  const [chatText, setChatText] = useState("");

  const handleSendMessage = () => {
    if (!chatText.trim()) return;
    if (onSendPlayerMessage) {
      onSendPlayerMessage(chatText.trim(), activeChannel);
    }
    setChatText("");
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSendMessage();
    }
  };

  useEffect(() => {
    if (isOpen) {
      if (lastSelectedChannel) {
        if (lastSelectedChannel === "wolf" && !isWolf) {
          setActiveChannel("lovers");
          lastSelectedChannel = "lovers";
        } else if (lastSelectedChannel === "lovers" && !isLover) {
          setActiveChannel("wolf");
          lastSelectedChannel = "wolf";
        } else {
          setActiveChannel(lastSelectedChannel);
        }
      } else {
        setActiveChannel(isWolf ? "wolf" : "lovers");
      }
      setAnimatingTarget(null);
      setShowText(null);
    }
  }, [isOpen, isWolf, isLover]);

  const handleWolfClick = () => {
    if (animatingTarget) return;
    setActiveChannel("wolf");
    lastSelectedChannel = "wolf";
    setAnimatingTarget("wolf");
    setShowText("Phe sói");
    setTimeout(() => {
      setShowText(null);
      setTimeout(() => {
        setAnimatingTarget(null);
      }, 300);
    }, 1500);
  };

  const handleLoverClick = () => {
    if (animatingTarget) return;
    setActiveChannel("lovers");
    lastSelectedChannel = "lovers";
    setAnimatingTarget("lovers");
    setShowText("Nửa kia");
    setTimeout(() => {
      setShowText(null);
      setTimeout(() => {
        setAnimatingTarget(null);
      }, 300);
    }, 1500);
  };

  const getWolfIconStyle = (): React.CSSProperties => {
    if (animatingTarget === "wolf") {
      return showText
        ? { opacity: 0, transform: "translateX(-20px) scale(0.9)", transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)", filter: "none" }
        : { opacity: 1, transform: "translateX(0) scale(1.1)", transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)", filter: "none" };
    }
    if (animatingTarget === "lovers") {
      return showText
        ? { opacity: 0, transform: "translateX(-20px) scale(0.9)", transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)", filter: "none" }
        : { opacity: 0.5, transform: "translateX(0) scale(0.95)", transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)", filter: "none" };
    }
    return {};
  };

  const getLoverIconStyle = (): React.CSSProperties => {
    if (animatingTarget === "lovers") {
      return showText
        ? { opacity: 0, transform: "translateX(-20px) scale(0.9)", transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)", filter: "none" }
        : { opacity: 1, transform: "translateX(0) scale(1.1)", transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)", filter: "none" };
    }
    if (animatingTarget === "wolf") {
      return showText
        ? { opacity: 0, transform: "translateX(0) scale(0.9)", transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)", filter: "none" }
        : { opacity: 0.5, transform: "translateX(0) scale(0.95)", transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)", filter: "none" };
    }
    return {};
  };

  return (
    <div style={{ display: isOpen ? "block" : "none" }}>
      {/* Backdrop to close click outside */}
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 9990,
          background: "transparent",
        }}
      />
      
      {/* Selector Panel */}
      <div
        style={{
          position: "absolute",
          bottom: "50px",
          right: "0px",
          width: "260px",
          background: "rgba(10, 16, 29, 0.6)",
          backdropFilter: "blur(16px)",
          border: "1px solid rgba(255, 255, 255, 0.12)",
          borderRadius: "16px",
          padding: "16px",
          boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.5)",
          zIndex: 9995,
          color: "#fff",
          display: "flex",
          flexDirection: "column",
          gap: "12px",
          animation: "slideUpStickerSelector 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards",
          userSelect: "none",
        }}
      >
        <style>{`
          @keyframes slideUpStickerSelector {
            from {
              opacity: 0;
              transform: translateY(10px);
            }
            to {
              opacity: 1;
              transform: translateY(0);
            }
          }
          .sticker-grid-item {
            cursor: pointer;
            transition: all 0.2s ease;
            border-radius: 8px;
            padding: 4px;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          .sticker-grid-item:hover {
            background: rgba(255, 255, 255, 0.08);
            transform: scale(1.12);
          }
          .sticker-chat-input-container:focus-within {
            border-color: rgba(255, 255, 255, 0.24) !important;
            background: rgba(255, 255, 255, 0.12) !important;
          }
        `}</style>
        
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontSize: "14px", fontWeight: "600", letterSpacing: "0.5px" }}>Gửi Sticker cho:</span>
            <div style={{ display: "inline-flex", alignItems: "center", position: "relative", minWidth: "60px", height: "24px" }}>
              {/* Chữ hiệu ứng */}
              <span
                style={{
                  fontSize: "13px",
                  fontWeight: "600",
                  color: animatingTarget === "wolf" ? "#A76F53" : "#F43F5E",
                  textShadow: animatingTarget === "wolf" 
                    ? "0 0 8px rgba(167, 111, 83, 0.5)" 
                    : "0 0 8px rgba(244, 63, 94, 0.5)",
                  transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
                  opacity: showText ? 1 : 0,
                  transform: showText ? "translateX(0)" : "translateX(-15px)",
                  position: "absolute",
                  left: 0,
                  whiteSpace: "nowrap",
                  pointerEvents: "none",
                }}
              >
                {showText}
              </span>

              {/* Các Icon container */}
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                {!isBoth && (
                  activeChannel === "wolf" ? (
                    <WolfPawIcon 
                      active={true} 
                      onClick={handleWolfClick}
                      style={{
                        opacity: showText ? 0 : 1,
                        transform: showText ? "translateX(-20px) scale(0.9)" : "translateX(0) scale(1.1)",
                        transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
                        filter: animatingTarget ? "none" : undefined,
                      }}
                    />
                  ) : (
                    <LoverHeartIcon 
                      active={true} 
                      onClick={handleLoverClick}
                      style={{
                        opacity: showText ? 0 : 1,
                        transform: showText ? "translateX(-20px) scale(0.9)" : "translateX(0) scale(1.1)",
                        transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
                        filter: animatingTarget ? "none" : undefined,
                      }}
                    />
                  )
                )}
                {isBoth && (
                  <>
                    <WolfPawIcon 
                      active={activeChannel === "wolf"} 
                      onClick={handleWolfClick}
                      style={getWolfIconStyle()}
                    />
                    <LoverHeartIcon 
                      active={activeChannel === "lovers"} 
                      onClick={handleLoverClick}
                      style={getLoverIconStyle()}
                    />
                  </>
                )}
              </div>
            </div>
          </div>
          <button 
            onClick={onClose} 
            style={{ 
              background: "transparent", 
              border: "none", 
              color: "rgba(255, 255, 255, 0.4)", 
              cursor: "pointer", 
              fontSize: "18px",
              padding: "0 4px"
            }}
          >
            ×
          </button>
        </div>

        {/* Sticker Grid */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: "8px",
            maxHeight: "220px",
            overflowX: "hidden",
            paddingRight: "4px"
          }}
        >
          {STICKER_LIST.map((sticker) => (
            <StickerItem
              key={sticker.filename}
              sticker={sticker}
              activeChannel={activeChannel}
              onSelectSticker={onSelectSticker}
              onClose={onClose}
            />
          ))}
        </div>

        {/* Khung Chat */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            position: "relative",
            background: "rgba(255, 255, 255, 0.08)",
            border: "1px solid rgba(255, 255, 255, 0.12)",
            borderRadius: "10px",
            padding: "6px 10px",
            gap: "8px",
            marginTop: "4px",
            transition: "all 0.2s ease"
          }}
          className="sticker-chat-input-container"
        >
          <input
            type="text"
            placeholder="Nhập tin nhắn..."
            value={chatText}
            onChange={(e) => setChatText(e.target.value)}
            onKeyDown={handleKeyDown}
            style={{
              flex: 1,
              background: "transparent",
              border: "none",
              outline: "none",
              color: "#fff",
              fontSize: "13px",
              padding: 0,
              width: "100%"
            }}
          />
          <button
            onClick={handleSendMessage}
            disabled={!chatText.trim()}
            style={{
              background: "transparent",
              border: "none",
              padding: 0,
              cursor: chatText.trim() ? "pointer" : "default",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              opacity: chatText.trim() ? 1 : 0.4,
              transition: "all 0.2s ease",
            }}
          >
            <SendIcon activeChannel={activeChannel} />
          </button>
        </div>
      </div>
    </div>
  );
};
