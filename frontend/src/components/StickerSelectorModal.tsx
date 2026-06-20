import React, { useState } from "react";
import { STICKER_LIST } from "../utils/stickerAssets";

interface StickerSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectSticker: (filename: string, channel: "wolf" | "lovers", event: React.MouseEvent | React.TouchEvent) => void;
  isWolf: boolean;
  isLover: boolean;
}

export const StickerSelectorModal: React.FC<StickerSelectorModalProps> = ({
  isOpen,
  onClose,
  onSelectSticker,
  isWolf,
  isLover,
}) => {
  const isBoth = isWolf && isLover;
  const [activeChannel, setActiveChannel] = useState<"wolf" | "lovers">(isWolf ? "wolf" : "lovers");

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
            touch-action: none;
          }
          .sticker-grid-item:hover {
            background: rgba(255, 255, 255, 0.08);
            transform: scale(1.12);
          }
          .sticker-tab-btn {
            flex: 1;
            padding: 6px 12px;
            border: none;
            border-radius: 8px;
            background: rgba(255, 255, 255, 0.05);
            color: rgba(255, 255, 255, 0.6);
            cursor: pointer;
            font-size: 13px;
            font-weight: 500;
            transition: all 0.2s ease;
            text-align: center;
          }
          .sticker-tab-btn.active {
            background: var(--accent, #10b981);
            color: #fff;
            box-shadow: 0 0 10px rgba(16, 185, 129, 0.4);
          }
        `}</style>
        
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: "14px", fontWeight: "600", letterSpacing: "0.5px" }}>Chọn Sticker</span>
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

        {/* Channel Selection Tab */}
        {isBoth && (
          <div style={{ display: "flex", gap: "6px", background: "rgba(0,0,0,0.2)", padding: "4px", borderRadius: "10px" }}>
            <button
              onClick={() => setActiveChannel("wolf")}
              className={`sticker-tab-btn ${activeChannel === "wolf" ? "active" : ""}`}
            >
              Phe Sói
            </button>
            <button
              onClick={() => setActiveChannel("lovers")}
              className={`sticker-tab-btn ${activeChannel === "lovers" ? "active" : ""}`}
            >
              Cặp Đôi
            </button>
          </div>
        )}

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
            <div
              key={sticker.filename}
              onMouseDown={(e) => {
                if (e.button !== 0) return; // Chỉ chuột trái
                e.preventDefault();
                onSelectSticker(sticker.filename, activeChannel, e);
                onClose();
              }}
              onTouchStart={(e) => {
                e.preventDefault();
                onSelectSticker(sticker.filename, activeChannel, e);
                onClose();
              }}
              className="sticker-grid-item"
            >
              <img
                src={sticker.url}
                alt=""
                style={{ width: "42px", height: "42px", objectFit: "contain" }}
                draggable="false"
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
