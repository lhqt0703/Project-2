import React, { useEffect, useState, useMemo } from "react";
import confetti from "canvas-confetti";
import "./VillagerVictoryAnimation.css";

// Load portraits C *.avif in assets
const cAvifPortraits = import.meta.glob<string>("../assets/C *.avif", {
  eager: true,
  import: "default",
});

// Load Diet Quy portraits
const dietQuyPortraits = import.meta.glob<string>("../assets/Diệt Quỷ/C *.avif", {
  eager: true,
  import: "default",
});

interface VillagerVictoryAnimationProps {
  open: boolean;
  villagerRole: string | null;
  wolfRole: string | null;
  gameMode?: string;
  onComplete: () => void;
}

function normalizeRole(name: string) {
  return name.normalize("NFC").trim().toLowerCase();
}

function getPortraitSrc(role: string | null | undefined, gameMode?: string) {
  if (!role) return null;
  const normalized = normalizeRole(role);

  // Ánh xạ một số vai trò đặc biệt
  let targetName = normalized;
  if (targetName === "sói thường" || targetName === "sói") targetName = "sói";
  if (targetName === "phù thủy") targetName = "phù thủy";
  if (targetName === "tiên tri") targetName = "tiên tri";
  if (targetName === "bảo vệ") targetName = "bảo vệ";
  if (targetName === "thợ săn") targetName = "thợ săn";
  if (targetName === "trưởng làng") targetName = "trưởng làng";
  if (targetName === "bán sói") targetName = "bán sói";
  if (targetName === "linh sói") targetName = "linh sói";
  if (targetName === "kẻ bị nguyền") targetName = "kẻ bị nguyền";
  if (targetName === "tay buôn" || targetName === "ariana") targetName = "tay buôn";
  if (targetName === "thần tình yêu" || targetName === "cupid") targetName = "thần tình yêu";
  if (targetName === "thiên sứ" || targetName === "angel") targetName = "thiên sứ";
  if (targetName === "sói con") targetName = "sói con";
  if (targetName === "sói dại") targetName = "sói dại";

  // Diet Quy mode
  if (gameMode === "diet_quy") {
    const key = Object.keys(dietQuyPortraits).find((path) => {
      const filename = path.split("/").pop()?.toLowerCase() || "";
      const cleaned = filename.replace(/^c\s+/, "").replace(/\.avif$/i, "").trim();
      return cleaned === targetName || cleaned.includes(targetName) || targetName.includes(cleaned);
    });
    if (key) return dietQuyPortraits[key];
  }

  // Normal / Fallback mode: find in cAvifPortraits
  const key = Object.keys(cAvifPortraits).find((path) => {
    const filename = path.split("/").pop()?.toLowerCase() || "";
    const cleaned = filename.replace(/^c\s+/, "").replace(/\.avif$/i, "").trim();
    return cleaned === targetName || cleaned.includes(targetName) || targetName.includes(cleaned);
  });
  
  if (key) return cAvifPortraits[key];

  // Fallback to C Thiên Sứ or C Sói if not found
  const fallbackKey = targetName.includes("sói") || targetName.includes("wolf")
    ? Object.keys(cAvifPortraits).find((k) => k.toLowerCase().includes("sói"))
    : Object.keys(cAvifPortraits).find((k) => k.toLowerCase().includes("thiên sứ"));

  return fallbackKey ? cAvifPortraits[fallbackKey] : null;
}

export const VillagerVictoryAnimation: React.FC<VillagerVictoryAnimationProps> = ({
  open,
  villagerRole,
  wolfRole,
  gameMode,
  onComplete,
}) => {
  const [phase, setPhase] = useState<"idle" | "enter" | "shot" | "blown" | "complete">("idle");

  const villagerSrc = useMemo(() => getPortraitSrc(villagerRole, gameMode), [villagerRole, gameMode]);
  const wolfSrc = useMemo(() => getPortraitSrc(wolfRole, gameMode), [wolfRole, gameMode]);

  useEffect(() => {
    if (!open) {
      setPhase("idle");
      return;
    }

    // ponytail: step-by-step game ending animation sequence
    setPhase("enter");

    // 1. Slide in from sides (duration ~ 1000ms)
    const shotTimer = setTimeout(() => {
      setPhase("shot");

      // Bắn confetti cực mạnh từ bên trái (x: 0.15, y: 0.65) xéo lên hướng bên phải (angle: 12)
      confetti({
        particleCount: 169,
        angle: 12,
        spread: 68,
        origin: { x: 0.2, y: 0.6 },
        startVelocity: 88,
        colors: ["#f97316", "#facc15", "#22c55e", "#38bdf8", "#a855f7", "#ec4899"],
        zIndex: 10005,
      });

      // Thêm phát phụ nhỏ tạo độ dày cho tia bắn
      setTimeout(() => {
        confetti({
          particleCount: 88,
          angle: 18,
          spread: 45,
          origin: { x: 0.2, y: 0.62 },
          startVelocity: 78,
          colors: ["#ffffff", "#facc15", "#22c55e"],
          zIndex: 10005,
        });
      }, 120);

      // 2. Sói bị văng (delay 100ms sau khi bắn)
      const blownTimer = setTimeout(() => {
        setPhase("blown");
      }, 100);

      // 3. Hoàn thành hoạt ảnh và đóng overlay nhanh hơn (1300ms)
      const completeTimer = setTimeout(() => {
        setPhase("complete");
        onComplete();
      }, 1600);

      return () => {
        clearTimeout(blownTimer);
        clearTimeout(completeTimer);
      };
    }, 1200);


    return () => {
      clearTimeout(shotTimer);
    };
  }, [open, onComplete]);

  if (!open || phase === "idle") return null;

  return (
    <div className={`villager-victory-overlay phase-${phase}`}>
      <div className="victory-particles-spark" />
      
      {/* Phe dân portrait bên trái, flip horizontal */}
      {villagerSrc && (
        <div className="victory-portrait-wrapper villager-wrapper">
          <img
            src={villagerSrc}
            alt={villagerRole || "Dân"}
            className="victory-portrait villager-portrait"
          />
        </div>
      )}

      {/* Sói portrait bên phải, bị bắn văng */}
      {wolfSrc && (
        <div className="victory-portrait-wrapper wolf-wrapper">
          <img
            src={wolfSrc}
            alt={wolfRole || "Sói"}
            className="victory-portrait wolf-portrait"
          />
        </div>
      )}
    </div>
  );

};
