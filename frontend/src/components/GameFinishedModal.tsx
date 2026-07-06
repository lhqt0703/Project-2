import React from "react";
import "./GameFinishedModal.css";
import medalSvg from "../assets/medal.svg";
import { AvifIcon } from "./AvifIcon";

interface GameFinishedModalProps {
  open: boolean;
  winner: string | undefined | null; // villagers | wolves | lovers | nobody
  scoreResult: any;
  onClose: () => void;
  onBackToLobby: () => void;
  onOpenScoreboard: () => void;
}

export const GameFinishedModal: React.FC<GameFinishedModalProps> = ({
  open,
  winner,
  scoreResult,
  onClose,
  onBackToLobby,
  onOpenScoreboard,
}) => {
  if (!open) return null;

  const isVillagers = winner !== "wolves" && winner !== "lovers" && winner !== "nobody";
  const isWolves = winner === "wolves";
  const isLovers = winner === "lovers";

  let titleText = "TRÒ CHƠI KẾT THÚC";
  let winnerText = "Phe Dân";
  let themeClass = "theme-villagers";

  if (isWolves) {
    winnerText = "Phe Sói";
    themeClass = "theme-wolves";
  } else if (isLovers) {
    winnerText = "Cặp Đôi";
    themeClass = "theme-lovers";
  } else if (winner === "nobody") {
    winnerText = "Hòa";
    titleText = "VÁN ĐẤU BỊ HỦY BỞI QUẢN TRÒ";
    themeClass = "theme-nobody";
  }

  // Lấy MVP từ scoreResult
  const mvps = scoreResult
    ? Array.isArray(scoreResult.mvp)
      ? scoreResult.mvp
      : scoreResult.mvp
        ? [scoreResult.mvp]
        : []
    : [];

  const getRoleEmoji = (role: string) => {
    const r = role.toLowerCase();
    if (r === "seer" || r === "tiên tri") return "🔮";
    if (r === "witch" || r === "phù thủy") return "🧪";
    if (r === "guard" || r === "bảo vệ") return "🛡️";
    if (r === "hunter" || r === "thợ săn") return "🏹";
    if (r === "merchant" || r === "tay buôn") return "⚖️";
    if (r === "love_god" || r === "thần tình yêu") return "💘";
    if (r === "wolf" || r === "sói") return "🐺";
    if (r === "spirit_wolf" || r === "linh sói") return "👻";
    if (r === "cursed" || r === "kẻ bị nguyền") return "💀";
    return "🎭";
  };

  return (
    <div className="game-finished-overlay">
      <div className={`game-finished-container ${themeClass}`}>
        
        {/* Header Section */}
        <div className="game-finished-header">
          <div className="game-finished-subtitle">{titleText}</div>
          {winner !== "nobody" ? (
            <h1 className="game-finished-title">
              {winnerText} Thắng
            </h1>
          ) : (
            <h1 className="game-finished-title">Ván đấu đã kết thúc</h1>
          )}
        </div>

        {/* MVP Showcase */}
        {mvps.length > 0 && (
          <div className="game-finished-mvp-section">
            <div className="mvp-title">👑 MVP CỦA TRẬN ĐẤU 👑</div>
            <div className="mvp-list">
              {mvps.map((mvp: any) => {
                const playerRank = scoreResult?.ranking?.find((r: any) => r.playerId === mvp.playerId);
                const roleName = playerRank?.role || "Dân làng";
                return (
                  <div key={mvp.playerId} className="mvp-card">
                    <div className="mvp-name">{mvp.name}</div>
                    <div className="mvp-role">
                      <AvifIcon name={getRoleEmoji(roleName)} style={{ marginRight: 4, width: "1.1em", height: "1.1em" }} />
                      {roleName}
                    </div>
                    <div className="mvp-score">{mvp.score} Điểm</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Main description info */}
        <p className="game-finished-desc">
          Cảm ơn bạn đã tham gia! Hãy xem lại bảng điểm chi tiết hoặc bấm Quay về phòng chờ để bắt đầu một ván chơi mới.
        </p>

        {/* Action Buttons */}
        <div className="game-finished-actions">
          {scoreResult && (
            <button className="btn-action btn-score" onClick={onOpenScoreboard}>
              <img src={medalSvg} alt="medal" className="btn-icon" />
              Xem điểm chi tiết
            </button>
          )}
          <button className="btn-action btn-lobby" onClick={onClose}>
            Đóng
          </button>
        </div>


      </div>
    </div>
  );
};
