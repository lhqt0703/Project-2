import { socket, clientId } from "../socket";
import { useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import GameRulesModal from "../components/GameRulesModal";
import { DEFAULT_ROOM_GAME_RULES, type RoomGameRules } from "../context/RoomContext";
import Aurora from "../components/Aurora";

const PLAYER_NAME_STORAGE_KEY = "werewolfPlayerName";
const ALLOWED_CREATOR_IDS = [
  "16ab4278-4d7a-40e5-a856-c9bf490d5fc3",
  "84bcb975-46ec-4be3-87bb-cd1b4d976633"
];

export default function Lobby() {
  const nav = useNavigate();
  const [name, setName] = useState(() => localStorage.getItem(PLAYER_NAME_STORAGE_KEY) || "");
  const [roomIdInput, setRoomIdInput] = useState("");
  const [showRulesModal, setShowRulesModal] = useState(false);
  const [gameRules, setGameRules] = useState<RoomGameRules>(DEFAULT_ROOM_GAME_RULES);

  const isDev = ALLOWED_CREATOR_IDS.includes(clientId);

  useEffect(() => {
    const handleRoomCreated = (room: { id: string }) => {
      nav(`/room?roomId=${room.id}`);
    };
    const handleRoomJoined = (room: { id: string }) => {
      nav(`/room?roomId=${room.id}`);
    };

    socket.on("roomCreated", handleRoomCreated);
    socket.on("roomJoined", handleRoomJoined);
    return () => {
      socket.off("roomCreated", handleRoomCreated);
      socket.off("roomJoined", handleRoomJoined);
    };
  }, [nav]);

  const createRoom = () => {
    socket.emit("createRoom", { name, gameRules });
  };

  const joinRoom = () => {
    socket.emit("joinRoom", { roomId: roomIdInput, name });
  };

  const handleNameChange = (nextName: string) => {
    setName(nextName);

    if (nextName.trim()) {
      localStorage.setItem(PLAYER_NAME_STORAGE_KEY, nextName);
    } else {
      localStorage.removeItem(PLAYER_NAME_STORAGE_KEY);
    }
  };

  return (
    <div className="page-shell lobby-page" style={{ 
      position: "relative",
      minHeight: "100vh", 
      padding: "40px 16px 40px", 
      background: "#04060f",
      color: "#f4f6fb",
      display: "flex",
      alignItems: "center",
      justifyContent: "center"
    }}>
      {/* CSS Styles injection */}
      <style>{`
        .lobby-input {
          padding: 14px 16px;
          border-radius: 12px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          background: rgba(255, 255, 255, 0.03);
          color: #fff;
          transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
          outline: none;
          font-size: 15px;
        }
        .lobby-input:focus {
          border-color: #ff8f42;
          background: rgba(255, 255, 255, 0.07);
          box-shadow: 0 0 16px rgba(255, 143, 66, 0.2);
        }
        .lobby-btn {
          padding: 14px 20px;
          border-radius: 12px;
          border: none;
          font-weight: 800;
          cursor: pointer;
          font-size: 15px;
          transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
        }
        .lobby-btn-primary {
          background: linear-gradient(135deg, #f6c85f, #ff8f42);
          color: #0b0e14;
          box-shadow: 0 4px 20px rgba(255, 143, 66, 0.25);
        }
        .lobby-btn-primary:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 25px rgba(255, 143, 66, 0.4);
          filter: brightness(1.05);
        }
        .lobby-btn-primary:active {
          transform: translateY(0);
        }
        .lobby-btn-secondary {
          background: rgba(255, 255, 255, 0.05);
          color: #fff;
          border: 1px solid rgba(255, 255, 255, 0.08);
        }
        .lobby-btn-secondary:hover {
          background: rgba(255, 255, 255, 0.09);
          border-color: rgba(255, 255, 255, 0.15);
          transform: translateY(-2px);
        }
        .lobby-btn-secondary:active {
          transform: translateY(0);
        }
        .lobby-card {
          padding: 32px;
          border-radius: 24px;
          border: 1px solid rgba(255, 255, 255, 0.06);
          background: rgba(10, 14, 28, 0.75);
          backdrop-filter: blur(30px);
          -webkit-backdrop-filter: blur(30px);
          box-shadow: 0 30px 80px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.05);
          transition: all 0.3s ease;
          display: flex;
          flex-direction: column;
          gap: 20px;
        }
        .lobby-card:hover {
          border-color: rgba(255, 255, 255, 0.12);
          box-shadow: 0 30px 80px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.08);
        }
        .dev-badge {
          background: linear-gradient(135deg, rgba(82, 39, 255, 0.2), rgba(239, 68, 68, 0.2));
          border: 1px solid rgba(255, 255, 255, 0.15);
          color: #ff8f42;
          font-size: 11px;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          padding: 4px 10px;
          border-radius: 20px;
          align-self: flex-start;
          display: flex;
          align-items: center;
          gap: 5px;
          box-shadow: 0 0 15px rgba(255, 143, 66, 0.15);
        }
        .dev-pulse {
          width: 6px;
          height: 6px;
          background-color: #ff8f42;
          border-radius: 50%;
          animation: pulse 1.5s infinite;
        }
        @keyframes pulse {
          0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(255, 143, 66, 0.7); }
          70% { transform: scale(1); box-shadow: 0 0 0 6px rgba(255, 143, 66, 0); }
          100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(255, 143, 66, 0); }
        }
      `}</style>

      {/* Stunning Aurora Component Background */}
      <div style={{ position: "absolute", inset: 0, zIndex: 0, opacity: 0.45, pointerEvents: "none" }}>
        <Aurora
          colorStops={["#7cff67", "#EF4444", "#5227FF"]}
          blend={0.6}
          amplitude={1.1}
          speed={1.4}
        />
      </div>

      <div style={{ 
        position: "relative",
        zIndex: 1,
        width: "100%",
        maxWidth: isDev ? 1040 : 500, 
        margin: "0 auto", 
        display: "grid", 
        gap: 24 
      }}>
        {/* Lobby Header Card */}
        <div className="lobby-card" style={{ padding: "32px 36px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
            <h1 style={{ 
              margin: 0, 
              fontSize: 42, 
              fontWeight: 900,
              letterSpacing: "-0.03em", 
              background: "linear-gradient(135deg, #ffffff 30%, #a5b4fc 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent"
            }}>
              Sảnh Chờ
            </h1>
            {isDev && (
              <div className="dev-badge">
                <span className="dev-pulse"></span>
                Dev Mode
              </div>
            )}
          </div>
          <p style={{ margin: 0, lineHeight: 1.6, color: "rgba(244,246,251,0.72)", fontSize: 16 }}>
            {isDev 
              ? "Bạn đang ở chế độ Nhà phát triển. Có thể tạo phòng mới, tùy chỉnh luật chơi nâng cao hoặc tham gia phòng chơi có sẵn."
              : "Chào mừng đến với Dạ Nghịch! Hãy nhập tên của bạn và mã phòng để bắt đầu tham gia trò chơi cùng mọi người"}
          </p>
        </div>

        {/* Action Sections Grid */}
        <div style={{ 
          display: "grid", 
          gridTemplateColumns: isDev ? "repeat(auto-fit, minmax(320px, 1fr))" : "1fr", 
          gap: 24 
        }}>
          {/* Join Room Section */}
          <section className="lobby-card">
            <h2 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: "#ff8f42" }}>Tham gia phòng</h2>
            <div style={{ display: "grid", gap: 16 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.5)" }}>Tên hiển thị</span>
                <input
                  placeholder="Nhập tên của bạn..."
                  value={name}
                  onChange={(e) => handleNameChange(e.target.value)}
                  className="lobby-input"
                />
              </div>
              
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.5)" }}>Mã phòng</span>
                <input
                  inputMode="numeric"
                  placeholder="Nhập mã phòng gồm 3 chữ số..."
                  value={roomIdInput}
                  onChange={(e) => setRoomIdInput(e.target.value)}
                  className="lobby-input"
                />
              </div>

              <button onClick={joinRoom} className="lobby-btn lobby-btn-primary" style={{ marginTop: 8 }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                  <polyline points="10 17 15 12 10 7" />
                  <line x1="15" y1="12" x2="3" y2="12" />
                </svg>
                Tham gia ngay
              </button>
            </div>
          </section>
          
          {/* Create Room Section (Developer Only) */}
          {isDev && (
            <section className="lobby-card" style={{ 
              border: "1px solid rgba(255, 143, 66, 0.15)",
              background: "rgba(12, 12, 34, 0.8)" 
            }}>
              <h2 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: "#a5b4fc" }}>Tạo phòng mới</h2>
              <div style={{ display: "grid", gap: 16 }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.5)" }}>Tên hiển thị</span>
                  <input
                    placeholder="Nhập tên của bạn..."
                    value={name}
                    onChange={(e) => handleNameChange(e.target.value)}
                    className="lobby-input"
                  />
                </div>
                
                <button onClick={() => setShowRulesModal(true)} className="lobby-btn lobby-btn-secondary" style={{ marginTop: 4 }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="3" />
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                  </svg>
                  Thiết lập luật chơi
                </button>

                <button onClick={createRoom} className="lobby-btn lobby-btn-primary">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                  Tạo phòng chơi
                </button>
                
                <div style={{ 
                  fontSize: 13, 
                  lineHeight: 1.5, 
                  color: "rgba(244,246,251,0.55)",
                  padding: "10px 12px",
                  borderRadius: 10,
                  background: "rgba(0,0,0,0.15)",
                  border: "1px solid rgba(255,255,255,0.03)"
                }}>
                  <strong>Luật hiện tại:</strong><br />
                  • Đồng thời: {gameRules.allNightActionsSimultaneous ? "Bật" : "Tắt"}<br />
                  • Phù thủy thấy vết cắn khi còn bình: {gameRules.witchSeeBiteOnlyIfHasHealPotion ? "Bật" : "Tắt"}<br />
                  • Lượt tương tác: {gameRules.trialInteractionSelectionLimit}<br />
                  • Ép sói cắn đêm đầu: {gameRules.forceWolfBiteFirstNight ? "Bật" : "Tắt"}<br />
                  • Cupid chọn trong 2 đêm đầu: {gameRules.loveCanChoosePartnerFirstTwoNights ? "Bật" : "Tắt"}
                </div>
              </div>
            </section>
          )}
        </div>
      </div>

      <GameRulesModal
        open={showRulesModal}
        initialRules={gameRules}
        onClose={() => setShowRulesModal(false)}
        onSave={(rules) => {
          setGameRules(rules);
          setShowRulesModal(false);
        }}
        saveText="Áp dụng"
      />
    </div>
  );
}
