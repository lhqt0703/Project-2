import { useRef } from "react";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";
import { soundManager } from "../utils/soundManager";

gsap.registerPlugin(useGSAP);

interface ElementalVFXProps {
  type: "ice" | "thunder" | "fire" | "darkness";
}

export default function ElementalVFX({ type }: ElementalVFXProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const container = containerRef.current;
      if (!container) return;

      // Kích hoạt âm thanh đặc trưng khi hiệu ứng nguyên tố xuất hiện
      if (type === "ice") soundManager.play("elementIce");
      else if (type === "thunder") soundManager.play("elementLightning");
      else if (type === "fire") soundManager.play("elementFire");
      else if (type === "darkness") soundManager.play("elementDarkness");

      // -------------------------------------------------------------
      // 1. Hoạt ảnh BĂNG GIÁ (Ice Shards Floating)
      // -------------------------------------------------------------
      if (type === "ice") {
        const shards = container.querySelectorAll(".ice-shard");
        shards.forEach((shard, index) => {
          // Reset trạng thái ban đầu của từng mảnh băng
          gsap.set(shard, {
            y: 40,
            x: gsap.utils.random(-15, 15),
            opacity: 0,
            scale: gsap.utils.random(0.4, 0.8),
            rotation: gsap.utils.random(0, 360),
          });

          // Chuỗi lặp vô hạn mảnh băng bay lên và tan biến
          gsap.to(shard, {
            y: -40,
            x: `+=${gsap.utils.random(-10, 10)}`,
            rotation: "+=180",
            opacity: gsap.utils.random(0.5, 0.95),
            duration: gsap.utils.random(1.8, 2.8),
            delay: index * 0.45,
            repeat: -1,
            ease: "power1.out",
          });
        });
      }

      // -------------------------------------------------------------
      // 2. Hoạt ảnh SẤM SÉT (Sporadic Lightning Flashes)
      // -------------------------------------------------------------
      else if (type === "thunder") {
        const sparks = container.querySelectorAll(".lightning-bolt");
        sparks.forEach((spark) => {
          gsap.set(spark, { opacity: 0, scale: 0.85 });

          // Tạo vòng lặp nhấp nháy sấm sét ngẫu nhiên cực đẹp
          const flash = () => {
            const delay = gsap.utils.random(1.2, 2.5); // Sét giật cách quãng ngẫu nhiên
            
            gsap.timeline({ delay, onComplete: flash })
              // Giật phát 1
              .to(spark, { opacity: 0.95, scale: 1.05, duration: 0.05, ease: "power4.in" })
              .to(spark, { opacity: 0.1, duration: 0.04 })
              // Giật phát 2 phụ
              .to(spark, { opacity: 0.85, scale: 0.95, duration: 0.03 })
              .to(spark, { opacity: 0, scale: 0.85, duration: 0.15, ease: "power2.out" });
          };
          
          flash();
        });
      }

      // -------------------------------------------------------------
      // 3. Hoạt ảnh LỬA (Rising Fire Embers)
      // -------------------------------------------------------------
      else if (type === "fire") {
        const embers = container.querySelectorAll(".fire-ember");
        embers.forEach((ember, index) => {
          gsap.set(ember, {
            y: 35,
            x: gsap.utils.random(-18, 18),
            opacity: 0,
            scale: gsap.utils.random(0.5, 1.0),
          });

          // Tàn tro bay lên zigzag và tắt dần
          gsap.to(ember, {
            y: -35,
            x: `+=${gsap.utils.random(-15, 15)}`,
            opacity: gsap.utils.random(0.7, 1.0),
            duration: gsap.utils.random(1.5, 2.3),
            delay: index * 0.3,
            repeat: -1,
            ease: "sine.out",
          });
        });
      }

      // -------------------------------------------------------------
      // 4. Hoạt ảnh BÓNG TỐI (Swirling Void Clouds)
      // -------------------------------------------------------------
      else if (type === "darkness") {
        const mist = container.querySelector(".dark-mist");
        if (mist) {
          gsap.to(mist, {
            rotation: 360,
            duration: 8,
            repeat: -1,
            ease: "none",
          });
        }

        const whisps = container.querySelectorAll(".void-whisp");
        whisps.forEach((whisp, index) => {
          gsap.set(whisp, {
            opacity: 0.2,
            scale: 0.9 + index * 0.05,
          });

          gsap.to(whisp, {
            scale: 1.15,
            opacity: 0.65,
            duration: 1.8 + index * 0.4,
            repeat: -1,
            yoyo: true,
            ease: "sine.inOut",
          });
        });
      }
    },
    { dependencies: [type], revertOnUpdate: true }
  );

  return (
    <div
      ref={containerRef}
      style={{
        position: "absolute",
        inset: -2,
        borderRadius: "inherit",
        pointerEvents: "none",
        overflow: "hidden",
        zIndex: 5, // Đè lên trên avatar nhưng dưới các badge đếm số
      }}
    >
      {/* ----------------- BĂNG GIÁ ----------------- */}
      {type === "ice" && (
        <>
          {/* Lớp phủ đông lạnh mờ xung quanh */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: "inherit",
              border: "2px solid rgba(34, 211, 238, 0.75)",
              boxShadow: "inset 0 0 12px rgba(6, 182, 212, 0.55), 0 0 10px rgba(6, 182, 212, 0.4)",
              background: "rgba(6, 182, 212, 0.08)",
            }}
          />
          {/* Các mảnh băng bay */}
          <div className="ice-shard" style={shardStyle}>❄️</div>
          <div className="ice-shard" style={shardStyle}>✧</div>
          <div className="ice-shard" style={shardStyle}>❄️</div>
          <div className="ice-shard" style={shardStyle}>✦</div>
        </>
      )}

      {/* ----------------- SẤM SÉT ----------------- */}
      {type === "thunder" && (
        <>
          <div
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: "inherit",
              border: "2.5px solid rgba(251, 191, 36, 0.8)",
              boxShadow: "0 0 15px rgba(245, 158, 11, 0.65), inset 0 0 8px rgba(245, 158, 11, 0.45)",
            }}
          />
          {/* SVG Tia Sét */}
          <svg
            className="lightning-bolt"
            viewBox="0 0 24 24"
            fill="none"
            style={{
              position: "absolute",
              top: "-5px",
              left: "20%",
              width: "24px",
              height: "24px",
              filter: "drop-shadow(0 0 6px #fbbf24)",
            }}
          >
            <path d="M13 2L3 14H12L11 22L21 10H12L13 2Z" fill="#fbbf24" />
          </svg>
          <svg
            className="lightning-bolt"
            viewBox="0 0 24 24"
            fill="none"
            style={{
              position: "absolute",
              bottom: "-5px",
              right: "20%",
              width: "20px",
              height: "20px",
              filter: "drop-shadow(0 0 6px #fbbf24)",
              transform: "rotate(180deg)",
            }}
          >
            <path d="M13 2L3 14H12L11 22L21 10H12L13 2Z" fill="#fbbf24" />
          </svg>
        </>
      )}

      {/* ----------------- LỬA ----------------- */}
      {type === "fire" && (
        <>
          <div
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: "inherit",
              border: "2px solid rgba(239, 68, 68, 0.85)",
              boxShadow: "0 0 14px rgba(239, 68, 68, 0.65), inset 0 0 10px rgba(239, 68, 68, 0.45)",
              background: "rgba(239, 68, 68, 0.05)",
            }}
          />
          {/* Tàn dư tàn tro đốm lửa bập bùng */}
          <div className="fire-ember" style={{ ...emberStyle, background: "#ef4444", boxShadow: "0 0 6px #ef4444" }} />
          <div className="fire-ember" style={{ ...emberStyle, background: "#f97316", boxShadow: "0 0 6px #f97316" }} />
          <div className="fire-ember" style={{ ...emberStyle, background: "#facc15", boxShadow: "0 0 6px #facc15" }} />
          <div className="fire-ember" style={{ ...emberStyle, background: "#ef4444", boxShadow: "0 0 4px #ef4444" }} />
          <div className="fire-ember" style={{ ...emberStyle, background: "#f97316", boxShadow: "0 0 4px #f97316" }} />
        </>
      )}

      {/* ----------------- BÓNG TỐI ----------------- */}
      {type === "darkness" && (
        <>
          {/* Nền bóng tối phủ mờ đen xì bí hiểm */}
          <div
            className="dark-mist"
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: "inherit",
              background: "radial-gradient(circle, rgba(8, 3, 18, 0.82) 0%, rgba(109, 40, 217, 0.48) 100%)",
              border: "2px solid rgba(139, 92, 246, 0.65)",
              boxShadow: "0 0 12px rgba(139, 92, 246, 0.5)",
            }}
          />
          {/* Quầng xoáy bóng đêm */}
          <div className="void-whisp" style={whispStyle} />
          <div className="void-whisp" style={{ ...whispStyle, transform: "rotate(90deg) scale(0.9)" }} />
        </>
      )}
    </div>
  );
}

// Style hỗ trợ nhanh
const shardStyle: React.CSSProperties = {
  position: "absolute",
  left: "50%",
  bottom: "10px",
  color: "#e2f8ff",
  fontSize: "11px",
  fontWeight: "bold",
  textShadow: "0 0 4px #22d3ee",
  opacity: 0,
};

const emberStyle: React.CSSProperties = {
  position: "absolute",
  left: "50%",
  bottom: "5px",
  width: "5px",
  height: "5px",
  borderRadius: "50%",
  opacity: 0,
};

const whispStyle: React.CSSProperties = {
  position: "absolute",
  inset: "6px",
  borderRadius: "inherit",
  border: "1.5px dashed rgba(167, 139, 250, 0.35)",
  pointerEvents: "none",
};
