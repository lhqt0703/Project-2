import { useRef } from "react";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";
import { soundManager } from "../utils/soundManager";

gsap.registerPlugin(useGSAP);

interface PhaseTransitionOverlayProps {
  phase: "night" | "day" | "dusk";
  number: number;
  active: boolean;
  onComplete: () => void;
}

export default function PhaseTransitionOverlay({
  phase,
  number,
  active,
  onComplete,
}: PhaseTransitionOverlayProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const skyRef = useRef<HTMLDivElement>(null);
  const celestialRef = useRef<HTMLDivElement>(null);
  const titleContainerRef = useRef<HTMLDivElement>(null);
  const subtitleRef = useRef<HTMLDivElement>(null);
  const fogRef1 = useRef<HTMLDivElement>(null);
  const fogRef2 = useRef<HTMLDivElement>(null);
  const sunRaysRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      if (!active) return;

      const overlay = overlayRef.current;
      const sky = skyRef.current;
      const celestial = celestialRef.current;
      const titleContainer = titleContainerRef.current;
      const subtitle = subtitleRef.current;

      if (!overlay) return;

      // Phát âm thanh chuyển pha tương ứng
      if (phase === "night") {
        soundManager.play("nightFall");
      } else if (phase === "day") {
        soundManager.play("sunrise");
      }

      // Xây dựng Timeline chính cho chuyển cảnh
      const tl = gsap.timeline({
        onComplete: () => {
          // Khi chạy xong toàn bộ, gọi callback kết thúc chuyển cảnh để đóng component
          onComplete();
        },
      });

      // Reset các trạng thái trước khi chạy hoạt ảnh
      gsap.set(overlay, { display: "flex", opacity: 1 });
      gsap.set(sky, { opacity: 0 });
      gsap.set(celestial, { y: 150, scale: 0.5, opacity: 0 });
      gsap.set(subtitle, { opacity: 0, y: 15 });

      // Lấy danh sách các ký tự trong tiêu đề pha để làm hiệu ứng stagger
      const titleChars = titleContainer?.querySelectorAll(".char");
      if (titleChars && titleChars.length) {
        gsap.set(titleChars, { opacity: 0, scale: 0.2, y: 30, rotationX: -90 });
      }

      // 1. Fade in bầu trời nền (Sky gradient)
      tl.to(sky, {
        opacity: 1,
        duration: 0.75,
        ease: "power2.out",
      });

      // 2. Mặt Trăng hoặc Mặt Trời mọc lên
      tl.to(
        celestial,
        {
          y: 0,
          scale: 1,
          opacity: 1,
          duration: 1.1,
          ease: "back.out(1.2)",
        },
        "-=0.4"
      );

      // Hiệu ứng đặc biệt theo từng pha
      if (phase === "night") {
        // Hoạt ảnh Sương mù (Fog) di chuyển lững lờ sang ngang
        if (fogRef1.current && fogRef2.current) {
          gsap.fromTo(
            fogRef1.current,
            { xPercent: -100, opacity: 0 },
            { xPercent: 100, opacity: 0.18, duration: 3.2, ease: "power1.inOut" }
          );
          gsap.fromTo(
            fogRef2.current,
            { xPercent: 100, opacity: 0 },
            { xPercent: -100, opacity: 0.15, duration: 3.2, ease: "power1.inOut" }
          );
        }
      } else if (phase === "day") {
        // Mặt trời quay tia nắng nhẹ nhàng lấp lánh
        if (sunRaysRef.current) {
          gsap.to(sunRaysRef.current, {
            rotation: 360,
            duration: 8,
            repeat: -1,
            ease: "none",
          });
        }
      }

      // 3. Tiêu đề chính lật chữ Stagger từng ký tự
      if (titleChars && titleChars.length) {
        tl.to(
          titleChars,
          {
            opacity: 1,
            scale: 1,
            y: 0,
            rotationX: 0,
            duration: 0.55,
            stagger: 0.06,
            ease: "elastic.out(1.1, 0.75)",
          },
          "-=0.6"
        );
      }

      // 4. Tiêu đề phụ hiện lên
      tl.to(
        subtitle,
        {
          opacity: 0.75,
          y: 0,
          duration: 0.45,
          ease: "power2.out",
        },
        "-=0.2"
      );

      // 5. Chờ hiển thị cao trào
      tl.to({}, { duration: 1.2 }); // Hold 1.2s

      // 6. Kết thúc: Toàn bộ chuyển cảnh co giãn và biến mất mượt mà
      tl.to(overlay, {
        opacity: 0,
        scale: 1.05,
        duration: 0.65,
        ease: "power2.inOut",
      });
    },
    { dependencies: [active, phase, number], revertOnUpdate: true }
  );

  if (!active) return null;

  const isNight = phase === "night";
  const titleText = isNight ? `ĐÊM THỨ ${number}` : `NGÀY THỨ ${number}`;
  const subtitleText = isNight
    ? "Bóng tối bao phủ... Mọi người nhắm mắt, phe Sói thức giấc"
    : "Bình minh hé rạng... Mọi người mở mắt, thảo luận tìm Sói";

  return (
    <div
      ref={overlayRef}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10001,
        display: "none", // Được quản lý bởi GSAP show/hide
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column",
        overflow: "hidden",
        pointerEvents: "auto", // Khóa click dưới màn hình trong thời gian hoạt cảnh
      }}
    >
      {/* 1. Nền bầu trời theo từng pha (Sky Gradient) */}
      <div
        ref={skyRef}
        style={{
          position: "absolute",
          inset: 0,
          background: isNight
            ? "radial-gradient(circle at center, #0f1124 0%, #030409 100%)"
            : "radial-gradient(circle at center, #351c0a 0%, #0f1116 100%)",
          zIndex: 1,
          opacity: 0,
        }}
      />

      {/* 2. Hiệu ứng sương mù bổ trợ ban đêm */}
      {isNight && (
        <>
          <div
            ref={fogRef1}
            style={{
              position: "absolute",
              bottom: "10%",
              left: 0,
              width: "100%",
              height: "250px",
              background: "radial-gradient(circle, rgba(108, 92, 231, 0.16) 0%, transparent 70%)",
              filter: "blur(60px)",
              zIndex: 2,
              pointerEvents: "none",
            }}
          />
          <div
            ref={fogRef2}
            style={{
              position: "absolute",
              top: "15%",
              right: 0,
              width: "100%",
              height: "220px",
              background: "radial-gradient(circle, rgba(59, 130, 246, 0.14) 0%, transparent 70%)",
              filter: "blur(50px)",
              zIndex: 2,
              pointerEvents: "none",
            }}
          />
        </>
      )}

      {/* 3. Khối thiên thể chính (Mặt Trời hoặc Mặt Trăng) */}
      <div
        ref={celestialRef}
        style={{
          width: "140px",
          height: "140px",
          borderRadius: "50%",
          position: "relative",
          zIndex: 3,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: "28px",
          opacity: 0,
        }}
      >
        {isNight ? (
          // Khối mặt trăng khuyết bạc neon lộng lẫy
          <div
            style={{
              width: "110px",
              height: "110px",
              borderRadius: "50%",
              boxShadow: "inset 20px -20px 0 0 #a29bfe",
              filter: "drop-shadow(0 0 25px rgba(162, 155, 254, 0.85))",
              transform: "rotate(-25deg)",
            }}
          />
        ) : (
          // Khối mặt trời vàng sáng ấm rực rỡ
          <div style={{ position: "relative", width: "100%", height: "100%" }}>
            {/* Tia nắng mặt trời tự quay */}
            <div
              ref={sunRaysRef}
              style={{
                position: "absolute",
                inset: -25,
                background: "repeating-conic-gradient(from 0deg, rgba(253, 186, 116, 0.18) 0deg 15deg, transparent 15deg 30deg)",
                borderRadius: "50%",
                pointerEvents: "none",
              }}
            />
            {/* Thân mặt trời phát sáng tròn */}
            <div
              style={{
                position: "absolute",
                inset: 15,
                borderRadius: "50%",
                background: "radial-gradient(circle, #fde047 20%, #ea580c 100%)",
                boxShadow: "0 0 45px rgba(234, 88, 12, 0.95), 0 0 80px rgba(253, 224, 71, 0.55)",
              }}
            />
          </div>
        )}
      </div>

      {/* 4. Tiêu đề chuyển pha chữ lật hoành tráng */}
      <div
        ref={titleContainerRef}
        style={{
          zIndex: 3,
          fontSize: "40px",
          fontWeight: 950,
          color: "#ffffff",
          letterSpacing: "5px",
          textShadow: isNight
            ? "0 0 20px rgba(162, 155, 254, 0.65), 0 3px 6px rgba(0,0,0,0.9)"
            : "0 0 25px rgba(234, 88, 12, 0.65), 0 3px 6px rgba(0,0,0,0.9)",
          display: "flex",
          gap: "2px",
          marginBottom: "16px",
          perspective: "300px",
        }}
      >
        {/* Tách từng ký tự thành các thẻ span riêng biệt để làm hiệu ứng stagger chữ chuẩn điện ảnh */}
        {titleText.split("").map((char, index) => (
          <span
            key={index}
            className="char"
            style={{
              display: "inline-block",
              transformOrigin: "center bottom",
              backfaceVisibility: "hidden",
            }}
          >
            {char === " " ? "\u00A0" : char}
          </span>
        ))}
      </div>

      {/* 5. Tiêu đề phụ (mô tả pha) */}
      <div
        ref={subtitleRef}
        style={{
          zIndex: 3,
          fontSize: "14px",
          fontWeight: 600,
          color: isNight ? "#a29bfe" : "#fdbb74",
          textAlign: "center",
          maxWidth: "340px",
          lineHeight: 1.6,
          padding: "0 16px",
          letterSpacing: "0.2px",
          textShadow: "0 2px 4px rgba(0,0,0,0.85)",
          opacity: 0,
        }}
      >
        {subtitleText}
      </div>
    </div>
  );
}
