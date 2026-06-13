import React, { useState } from "react";
import firstPlaceSvg from "../assets/1st.svg";
import secondPlaceSvg from "../assets/2nd.svg";
import thirdPlaceSvg from "../assets/3rd.svg";
import { AvifIcon } from "./AvifIcon";


interface ScoreBreakdownEntry {
  category: string;
  points: number;
  reason: string;
}

interface PlayerRanking {
  playerId: string;
  name: string;
  role: string;
  team: string;
  finalTeam: string;
  aliveAtEnd: boolean;
  totalScore: number;
  breakdown: ScoreBreakdownEntry[];
  clutchPoints: number;
  actionPoints: number;
  isWinner: boolean;
}

interface ScoreboardModalProps {
  open: boolean;
  onClose: () => void;
  scoreResult: {
    gameId: string;
    mvp: { playerId: string; name: string; score: number } | { playerId: string; name: string; score: number }[];
    ranking: PlayerRanking[];
  } | null;
}

const CATEGORY_LABELS: Record<string, string> = {
  team_result: "Thắng phe",
  survival: "Sống sót",
  action: "Hành động",
  clutch: "Xoay trận (Clutch)",
  special_win: "Thắng riêng",
  penalty: "Điểm trừ",
};

const CATEGORY_COLORS: Record<string, string> = {
  team_result: "#3498db",
  survival: "#2ecc71",
  action: "#9b59b6",
  clutch: "#e67e22",
  special_win: "#f1c40f",
  penalty: "#e74c3c",
};

export const ScoreboardModal: React.FC<ScoreboardModalProps> = ({ open, onClose, scoreResult }) => {
  const [expandedPlayerId, setExpandedPlayerId] = useState<string | null>(null);

  if (!open || !scoreResult) return null;

  const mvps = Array.isArray(scoreResult.mvp) ? scoreResult.mvp : [scoreResult.mvp];
  const mvpIds = new Set(mvps.map((m) => m.playerId));

  const togglePlayerBreakdown = (playerId: string) => {
    setExpandedPlayerId((prev) => (prev === playerId ? null : playerId));
  };

  const getRoleDisplay = (role: string) => {
    const r = role.toLowerCase();
    let emoji = "🎭";
    if (r === "seer" || r === "tiên tri") emoji = "🔮";
    else if (r === "witch" || r === "phù thủy") emoji = "🧪";
    else if (r === "guard" || r === "bảo vệ") emoji = "🛡️";
    else if (r === "hunter" || r === "thợ săn") emoji = "🏹";
    else if (r === "merchant" || r === "tay buôn") emoji = "⚖️";
    else if (r === "love_god" || r === "thần tình yêu") emoji = "💘";
    else if (r === "wolf" || r === "sói") emoji = "🐺";
    else if (r === "spirit_wolf" || r === "linh sói") emoji = "👻";
    else if (r === "cursed" || r === "kẻ bị nguyền") emoji = "💀";

    let label = role;
    if (r === "seer" || r === "tiên tri") label = "Tiên Tri";
    else if (r === "witch" || r === "phù thủy") label = "Phù Thủy";
    else if (r === "guard" || r === "bảo vệ") label = "Bảo Vệ";
    else if (r === "hunter" || r === "thợ săn") label = "Thợ Săn";
    else if (r === "merchant" || r === "tay buôn") label = "Tay Buôn";
    else if (r === "love_god" || r === "thần tình yêu") label = "Thần Tình Yêu";
    else if (r === "wolf" || r === "sói") label = "Sói Thường";
    else if (r === "spirit_wolf" || r === "linh sói") label = "Linh Sói";
    else if (r === "cursed" || r === "kẻ bị nguyền") label = "Kẻ Bị Nguyền";

    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
        <AvifIcon name={emoji} style={{ width: "1.15em", height: "1.15em" }} />
        {label}
      </span>
    );
  };

  const getTeamBadge = (team: string) => {
    const t = team.toLowerCase();
    if (t === "villagers") return <span style={{ color: "#3498db", fontWeight: 700 }}>Phe Dân</span>;
    if (t === "wolves") return <span style={{ color: "#e74c3c", fontWeight: 700 }}>Phe Sói</span>;
    if (t === "couple") return <span style={{ color: "#fd79a8", fontWeight: 700 }}>Cặp Đôi</span>;
    if (t === "merchant") return <span style={{ color: "#f1c40f", fontWeight: 700 }}>Tay Buôn</span>;
    return <span style={{ color: "#bdc581", fontWeight: 700 }}>Trung Lập</span>;
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
        backdropFilter: "blur(12px)",
      }}
    >
      <div //chỉnh giao diện bảng điểm
        style={{
          width: "min(720px, 100%)",
          maxHeight: "min(90vh, 840px)",
          overflowY: "auto",
          color: "#f8fbff",
          border: "1px solid rgba(255, 255, 255, 0.12)",
          borderRadius: 16,
          background: "linear-gradient(#131722b3 0%, #0c0f16e6 100%)",
          boxShadow: "0 24px 64px rgba(0, 0, 0, 0.65)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "20px 24px",
            borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
            display: "flex",
            alignItems: "center",
            justifyContent: "between",
            background: "linear-gradient(90deg, rgba(155, 89, 182, 0.1) 0%, transparent 60%)",
          }}
        >
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: "#9b59b6", textTransform: "uppercase", letterSpacing: 1 }}>
              Kết Quả Trận Đấu
            </div>
            <h2 style={{ margin: "4px 0 0", fontSize: 24, fontWeight: 900 }}>🏆 BẢNG ĐIỂM CHI TIẾT & MVP</h2>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "rgba(255, 255, 255, 0.08)",
              border: "1px solid rgba(255, 255, 255, 0.15)",
              color: "#fff",
              cursor: "pointer",
              padding: "6px 12px",
              borderRadius: 8,
              fontWeight: 700,
            }}
          >
            Đóng
          </button>
        </div>

        {/* MVP Card */}
        <div style={{ padding: "24px 24px 12px" }}>
          <div
            style={{
              padding: 20,
              borderRadius: 12,
              background: "linear-gradient(135deg, rgba(241, 196, 15, 0.15) 0%, rgba(155, 89, 182, 0.08) 100%)",
              border: "1px solid rgba(241, 196, 15, 0.35)",
              boxShadow: "0 8px 24px rgba(241, 196, 15, 0.08)",
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: 32, lineHeight: 1 }}>👑</div>
            <h3 style={{ margin: "8px 0 2px", fontSize: 20, fontWeight: 900, color: "#f1c40f", letterSpacing: 0.5 }}>
              {mvps.length > 1 ? "ĐỒNG MVP CỦA TRẬN ĐẤU" : "MVP CỦA TRẬN ĐẤU"}
            </h3>
            <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 16, marginTop: 12 }}>
              {mvps.map((mvp) => {
                const fullState = scoreResult.ranking.find((r) => r.playerId === mvp.playerId);
                return (
                  <div key={mvp.playerId} style={{ minWidth: 160, padding: "8px 16px", background: "rgba(0,0,0,0.25)", borderRadius: 8, border: "1px solid rgba(255,255,255,0.06)" }}>
                    <div style={{ fontSize: 17, fontWeight: 800, color: "#fff" }}>{mvp.name}</div>
                    <div style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", marginTop: 4 }}>
                      {fullState ? getRoleDisplay(fullState.role) : ""}
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 800, color: "#f1c40f", marginTop: 6 }}>
                      {mvp.score} Điểm
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Players List */}
        <div style={{ padding: "12px 24px 24px", flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 700, opacity: 0.6, marginBottom: 10 }}>Danh Sách Xếp Hạng Đóng Góp</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {scoreResult.ranking.map((player, index) => {
              const isMVP = mvpIds.has(player.playerId);
              const isExpanded = expandedPlayerId === player.playerId;

              return (
                <div
                  key={player.playerId}
                  style={{
                    border: `1px solid ${isExpanded ? "rgba(155, 89, 182, 0.4)" : "rgba(255, 255, 255, 0.08)"}`,
                    borderRadius: 10,
                    background: isExpanded ? "rgba(155, 89, 182, 0.05)" : "rgba(255, 255, 255, 0.02)",
                    overflow: "hidden",
                    transition: "all 0.2s ease",
                  }}
                >
                  {/* Row Summary */}
                  <div
                    onClick={() => togglePlayerBreakdown(player.playerId)}
                    style={{
                      padding: "12px 16px",
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      cursor: "pointer",
                    }}
                  >
                    {/* Rank indicator */}
                    {index === 0 ? (
                      <img src={firstPlaceSvg} alt="1st" style={{ width: 30, height: 30, flexShrink: 0 }} />
                    ) : index === 1 ? (
                      <img src={secondPlaceSvg} alt="2nd" style={{ width: 30, height: 30, flexShrink: 0 }} />
                    ) : index === 2 ? (
                      <img src={thirdPlaceSvg} alt="3rd" style={{ width: 30, height: 30, flexShrink: 0 }} />
                    ) : (
                      <div
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: "50%",
                          background: isMVP
                            ? "#f1c40f"
                            : "rgba(255,255,255,0.08)",
                          color: isMVP ? "#000" : "#fff",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontWeight: 800,
                          fontSize: 13,
                          flexShrink: 0,
                        }}
                      >
                        {isMVP ? "👑" : index + 1}
                      </div>
                    )}

                    {/* Name & Role */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontWeight: 800, fontSize: 15 }}>{player.name}</span>
                        {isMVP && (
                          <span style={{ fontSize: 10, padding: "2px 6px", background: "rgba(241, 196, 15, 0.15)", color: "#f1c40f", borderRadius: 4, fontWeight: 800, display: "inline-flex", alignItems: "center", gap: "2px" }}>
                            👑 MVP
                          </span>
                        )}
                        {player.aliveAtEnd && (
                          <span style={{ fontSize: 10, padding: "2px 6px", background: "rgba(46, 204, 113, 0.2)", color: "#2ecc71", borderRadius: 4, fontWeight: 700 }}>
                            SỐNG
                          </span>
                        )}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12, marginTop: 2, color: "rgba(255,255,255,0.5)" }}>
                        <span>{getRoleDisplay(player.role)}</span>
                        <span>•</span>
                        <span>{getTeamBadge(player.finalTeam)}</span>
                      </div>
                    </div>

                    {/* Score */}
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      <div style={{ fontSize: 16, fontWeight: 900, color: isMVP ? "#f1c40f" : "#fff" }}>
                        {player.totalScore}
                      </div>
                      <div style={{ fontSize: 10, opacity: 0.5, marginTop: 1 }}>Chi tiết ▾</div>
                    </div>
                  </div>

                  {/* Collapsible Breakdown */}
                  {isExpanded && (
                    <div
                      style={{
                        padding: "4px 16px 16px",
                        borderTop: "1px solid rgba(255, 255, 255, 0.05)",
                        background: "rgba(0, 0, 0, 0.15)",
                      }}
                    >
                      <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.4)", marginBottom: 8, textTransform: "uppercase" }}>
                        Lịch sử cộng/trừ điểm chi tiết
                      </div>
                      {player.breakdown.length === 0 ? (
                        <div style={{ fontSize: 13, fontStyle: "italic", opacity: 0.5 }}>Không có hoạt động tính điểm</div>
                      ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          {player.breakdown.map((item, bIdx) => (
                            <div
                              key={bIdx}
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                                gap: 12,
                                fontSize: 13,
                                padding: "6px 10px",
                                background: "rgba(255,255,255,0.02)",
                                borderRadius: 6,
                              }}
                            >
                              <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0 }}>
                                <span
                                  style={{
                                    fontSize: 10,
                                    padding: "2px 6px",
                                    borderRadius: 4,
                                    background: CATEGORY_COLORS[item.category] || "#7f8c8d",
                                    color: "#fff",
                                    fontWeight: 700,
                                    flexShrink: 0,
                                  }}
                                >
                                  {CATEGORY_LABELS[item.category] || item.category}
                                </span>
                                <span style={{ opacity: 0.9, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                  {item.reason}
                                </span>
                              </div>
                              <span
                                style={{
                                  fontWeight: 800,
                                  color: item.points >= 0 ? "#2ecc71" : "#e74c3c",
                                  flexShrink: 0,
                                }}
                              >
                                {item.points >= 0 ? `+${item.points}` : item.points}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
