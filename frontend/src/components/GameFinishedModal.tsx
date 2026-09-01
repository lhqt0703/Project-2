import React, { useEffect, useRef, useState } from "react";
import "./GameFinishedModal.css";
import SplitText from "./SplitText";
import StrokeText from "./StrokeText";
import danThangIcon from "../assets/icon/1-Dânthắng.avif";
import soiThangIcon from "../assets/icon/1-Sóithắng.avif";
import cupidThangIcon from "../assets/icon/1-Cupidthắng.avif";
import testMKTava from "../assets/Ava/testMKTava.avif";
import { getAvatarUrlByFileName, MASKED_AVATAR_MAP } from "./PlayerPositions";

const companionImages = import.meta.glob<string>("../assets/C *.{avif,png}", {
  eager: true,
  import: "default",
});

function normalizeRoleName(value: string) {
  return value.normalize("NFC").trim().toLowerCase();
}

function getCompanionSrc(roleName: string): string | null {
  if (!roleName) return null;
  const target = normalizeRoleName(roleName);
  for (const [path, src] of Object.entries(companionImages)) {
    const fileName = path.split("/").pop()?.replace(/\.(avif|png)$/i, "") ?? "";
    const cleanFileName = normalizeRoleName(fileName.replace(/^C\s+/i, ""));
    if (cleanFileName === target) {
      return src;
    }
  }
  return null;
}

function isWolfRoleName(roleName: string): boolean {
  const r = normalizeRoleName(roleName);
  return r.includes("sói") || r.includes("wolf") || r === "ma cà rồng";
}

function isCupidOrLoversRoleName(roleName: string): boolean {
  const r = normalizeRoleName(roleName);
  return r.includes("tình yêu") || r.includes("cupid") || r.includes("cặp đôi") || r.includes("lover");
}

export interface GameFinishedModalProps {
  open: boolean;
  winner?: string | undefined | null; // villagers | wolves | lovers | third | nobody
  scoreResult?: any;
  room?: any;
  testMode?: boolean;
  testRole?: string;
  testMvpName?: string;
  testWinner?: string;
  onClose: () => void;
  onBackToLobby?: () => void;
  onOpenScoreboard: () => void;
}

export const GameFinishedModal: React.FC<GameFinishedModalProps> = ({
  open,
  winner: rawWinner,
  scoreResult,
  room,
  testMode = false,
  testRole = "Thần tình yêu",
  testMvpName = "Paris Hilton Tipton London Hoàng Hy Cây Keo",
  testWinner,
  onClose,
  onOpenScoreboard,
}) => {
  const [isTitleComplete, setIsTitleComplete] = useState(false);
  const [starsActive, setStarsActive] = useState(false);
  const [roleIntroWhiteout, setRoleIntroWhiteout] = useState(false);
  const [roleIntroVariantDismissed, setRoleIntroVariantDismissed] = useState(false);
  const roleIntroTimerRef = useRef<number | null>(null);

  // Reset animation states khi mở modal
  useEffect(() => {
    if (roleIntroTimerRef.current !== null) {
      window.clearTimeout(roleIntroTimerRef.current);
      roleIntroTimerRef.current = null;
    }

    if (open) {
      setIsTitleComplete(false);
      setStarsActive(false);
      setRoleIntroWhiteout(false);
      setRoleIntroVariantDismissed(false);
    }

    return () => {
      if (roleIntroTimerRef.current !== null) {
        window.clearTimeout(roleIntroTimerRef.current);
        roleIntroTimerRef.current = null;
      }
    };
  }, [open, rawWinner, testRole]);

  if (!open) return null;

  // Xác định role và winner
  let effectiveWinner = testWinner || rawWinner;
  let effectiveRole = "Dân làng";
  let mvpName = "Người chơi";
  let mvpAvatarSrc: string | null = null;

  if (testMode) {
    effectiveRole = testRole || "Thần tình yêu";
    mvpName = testMvpName;

    if (!testWinner) {
      if (isWolfRoleName(effectiveRole)) {
        effectiveWinner = "wolves";
      } else if (isCupidOrLoversRoleName(effectiveRole)) {
        effectiveWinner = "lovers";
      } else {
        effectiveWinner = "villagers";
      }
    }
    mvpAvatarSrc = testMKTava;
  } else {
    // Game thực tế
    const mvps = scoreResult
      ? Array.isArray(scoreResult.mvp)
        ? scoreResult.mvp
        : scoreResult.mvp
          ? [scoreResult.mvp]
          : []
      : [];

    const topMvp = mvps[0];
    if (topMvp) {
      mvpName = topMvp.name || "Người chơi";
      const playerRank = scoreResult?.ranking?.find((r: any) => r.playerId === topMvp.playerId);
      effectiveRole = playerRank?.role || topMvp.role || "Dân làng";

      // Lấy avatar của player
      const p = room?.players?.find((pl: any) => pl.id === topMvp.playerId);
      if (p?.playerAvatar) {
        mvpAvatarSrc = getAvatarUrlByFileName(p.playerAvatar);
      } else if (p?.id && MASKED_AVATAR_MAP[p.id]) {
        mvpAvatarSrc = MASKED_AVATAR_MAP[p.id];
      }
    } else {
      mvpName = "Người chơi";
    }
  }

  const isWolves = effectiveWinner === "wolves";
  const isLovers = effectiveWinner === "lovers" || effectiveWinner === "third";
  const isNobody = effectiveWinner === "nobody";

  // Xác định icon chiến thắng
  let winnerIconSrc = danThangIcon;
  let winnerTitleText = "Phe dân thắng";

  if (isWolves) {
    winnerIconSrc = soiThangIcon;
    winnerTitleText = "Phe sói thắng";
  } else if (isLovers) {
    winnerIconSrc = cupidThangIcon;
    winnerTitleText = "Phe ba thắng";
  } else if (isNobody) {
    winnerTitleText = "Đù cái kết này chưa tính tới";
  }

  // Xác định tỷ lệ crop role companion
  const isWolfMVP = isWolfRoleName(effectiveRole);
  const cropClass = isWolfMVP ? "crop-wolf" : "crop-villager-third";
  const companionSrc = getCompanionSrc(effectiveRole);
  const introCompanionSrc = getCompanionSrc(`${effectiveRole} W`);
  const hasRoleIntroVariant = !!introCompanionSrc && !roleIntroVariantDismissed;
  const roleIntroFilterMs = normalizeRoleName(effectiveRole) === "tiên tri" ? 320 : 520;

  const handleMvpFillStart = () => {
    if (roleIntroTimerRef.current !== null) {
      window.clearTimeout(roleIntroTimerRef.current);
      roleIntroTimerRef.current = null;
    }
    setRoleIntroVariantDismissed(false);
    setRoleIntroWhiteout(true);
    setStarsActive(true);
  };

  const handleRoleIntroAnimationEnd = (event: React.AnimationEvent<HTMLDivElement>) => {
    if (event.currentTarget !== event.target || event.animationName !== "MKT-role-in") return;

    roleIntroTimerRef.current = window.setTimeout(() => {
      setRoleIntroWhiteout(false);
      roleIntroTimerRef.current = null;
    }, 150);
  };

  const handleOpenScoreboard = () => {
    onClose();
    onOpenScoreboard();
  };

  return (
    <div className="game-finished-overlay" role="dialog" aria-modal="true">
      <div className="awards-announcement-glow" />

      <div className="awards-announcement-content">
        {/* Kicker: MKTChữ1 */}
        <p className="MKTChữ1">TRẬN ĐẤU KẾT THÚC</p>

        {/* Icon: MKTicon */}
        <span className="MKTicon" aria-hidden="true">
          <img src={winnerIconSrc} alt="Winner Icon" />
        </span>

        {/* Tiêu đề thắng: MKTchữ2 */}
        <SplitText
          id="award-winner-title"
          tag="h2"
          className="MKTchữ2"
          text={winnerTitleText}
          delay={40}
          duration={1.1}
          startDelay={0.8}
          ease="power3.out"
          from={{ opacity: 0, y: 35 }}
          to={{ opacity: 1, y: 0 }}
          onAnimationComplete={() => setIsTitleComplete(true)}
        />

        {/* Phần MVP: MKTchữ3 & MKTtên */}
        {isTitleComplete && (
          <>
            <SplitText
              className="MKTchữ3"
              text="MVP CỦA VÁN"
              delay={0}
              duration={0.6}
              ease="power3.out"
              from={{ opacity: 0, y: -20 }}
              to={{ opacity: 1, y: 0 }}
            />

            <div className="MKTtên">
              <StrokeText
                key={mvpName}
                className="MKTtên-stroke"
                text={mvpName}
                strokeColor="#ffffff"
                fillColor="#F8FAFC"
                fillGradient={["#fff2c7", "#ff9ece"]}
                strokeWidth={1.4}
                drawDuration={2.4}
                fillDelay={0.2}
                stagger={0.08}
                strokeFadeDuration={0.2}
                ease="sine.inOut"
                trigger="mount"
                fillMode="wipe"
                fontSize={92}
                letterSpacing={-1}
                reverse={false}
                onFillStart={handleMvpFillStart}
              />

              {starsActive && (
                <span className="awards-winner-stars" aria-hidden="true">
                  {Array.from({ length: 6 }, (_, index) => (
                    <span className={`awards-winner-star awards-winner-star--${index + 1}`} key={index}>
                      <svg viewBox="0 0 784.11 815.53">
                        <path d="M392.05 0c-20.9 210.08-184.06 378.41-392.05 407.78 207.96 29.37 371.12 197.68 392.05 407.74 20.93-210.06 184.09-378.37 392.05-407.74C576.12 378.4 412.95 210.08 392.05 0Z" />
                      </svg>
                    </span>
                  ))}
                </span>
              )}
            </div>

            {/* Các nút hành động: MKTnút1 & MKTnút2 */}
            {starsActive && (
              <div className="MKT-actions-row">
                <button
                  className="MKTnút1"
                  onClick={handleOpenScoreboard}
                >
                  Xem chi tiết điểm
                </button>

                <button
                  className="MKTnút2"
                  onClick={onClose}
                >
                  Đóng
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Hiển thị Avatar và Role Companion ở phía dưới cùng khi có hiệu ứng chùm sao */}
      {starsActive && (
        <div className="MKT-bottom-showcase">
          {/* Avatar: MKTảnhava */}
          {mvpAvatarSrc && (
            <div className="MKTảnhava">
              <img src={mvpAvatarSrc} alt="MVP Avatar" />
            </div>
          )}

          {/* Role companion: MKTảnhrole */}
          {companionSrc && (
            <div
              className={`MKTảnhrole ${cropClass}${hasRoleIntroVariant ? " has-intro-variant" : ""}${roleIntroWhiteout ? " is-intro-whiteout" : ""}`}
              style={{ "--MKT-intro-filter-ms": `${roleIntroFilterMs}ms` } as React.CSSProperties}
              onAnimationEnd={handleRoleIntroAnimationEnd}
            >
              <img
                className="MKTảnhrole-image MKTảnhrole-image--base"
                src={companionSrc}
                alt={effectiveRole}
              />
              {hasRoleIntroVariant && introCompanionSrc && (
                <img
                  className="MKTảnhrole-image MKTảnhrole-image--intro"
                  src={introCompanionSrc}
                  alt=""
                  aria-hidden="true"
                  onTransitionEnd={(event) => {
                    if (event.propertyName === "opacity" && !roleIntroWhiteout) {
                      setRoleIntroVariantDismissed(true);
                    }
                  }}
                />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
