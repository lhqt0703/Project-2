import { socket, clientId } from "../socket";
import { useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { DEFAULT_ROOM_GAME_RULES, useRoomContext, type RoomData } from "../context/RoomContext";
import Aurora from "../components/Aurora";
import ArrowLeft from "../assets/arrow-left.svg";
import UserIcon from "../assets/user.svg";
import { getAvatarUrlByFileName } from "../components/PlayerPositions";
import { VIP_REAL_NAMES } from "../constants/vip";
import { AvatarSelectModal } from "../components/AvatarSelectModal";

const PLAYER_NAME_STORAGE_KEY = "werewolfPlayerName";
const ALLOWED_CREATOR_IDS = [
  "16ab4278-4d7a-40e5-a856-c9bf490d5fc3",
  "bd1d4b2c-8c07-4f38-9ca7-e2d16e85f733",
  "53bc353c-f61b-4146-a53e-5ee6b7697039", //mac
  "1dd158d3-8a1f-44da-8e56-7f60160b18fd" //iphone
];

export default function Lobby() {
  const nav = useNavigate();
  const { setRoom } = useRoomContext();
  const realName = VIP_REAL_NAMES[clientId];
  const greeting = realName ? `Chào ${realName}` : "Chào bạn mới";
  const [name, setName] = useState(() => localStorage.getItem(PLAYER_NAME_STORAGE_KEY) || "");
  const [roomIdInput, setRoomIdInput] = useState("");
  const [showAvatarModal, setShowAvatarModal] = useState(false);
  const [myAvatar, setMyAvatar] = useState(() => localStorage.getItem("werewolfPlayerAvatar") || "");

  const currentAvatarUrl = getAvatarUrlByFileName(myAvatar);

  const selectAvatar = (fileName: string) => {
    setMyAvatar(fileName);
    localStorage.setItem("werewolfPlayerAvatar", fileName);
    setShowAvatarModal(false);
  };

  const clearAvatar = () => {
    setMyAvatar("");
    localStorage.removeItem("werewolfPlayerAvatar");
    setShowAvatarModal(false);
  };

  const query = new URLSearchParams(window.location.search);
  const gameMode = query.get("mode") || "da_nghich";

  useEffect(() => {
    const handleRoomCreated = (room: RoomData) => {
      if (room?.id) setRoom(room);
      nav(`/room?roomId=${room.id}`);
    };
    const handleRoomJoined = (room: RoomData) => {
      if (room?.id) setRoom(room);
      nav(`/room?roomId=${room.id}`);
    };

    socket.on("roomCreated", handleRoomCreated);
    socket.on("roomJoined", handleRoomJoined);
    return () => {
      socket.off("roomCreated", handleRoomCreated);
      socket.off("roomJoined", handleRoomJoined);
    };
  }, [nav, setRoom]);

  const isDev = ALLOWED_CREATOR_IDS.includes(clientId);

  const createRoom = () => {
    socket.emit("createRoom", { name, gameRules: DEFAULT_ROOM_GAME_RULES, gameMode });
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
        .lobby-btn-color {
          background: linear-gradient(135deg, #f6c85f, #ff8f42);
          color: #0b0e14;
        }
        .lobby-card {
          padding: 32px;
          border-radius: 24px;
          border: 1px solid rgba(255, 255, 255, 0.06);
          background: rgba(255, 255, 255, 0.06);
          backdrop-filter: blur(30px);
          box-shadow: 0 30px 80px rgba(0, 0, 0, 0.5);
          transition: all 0.3s ease;
          display: flex;
          flex-direction: column;
          gap: 20px;
        }
        @keyframes modalFadeIn {
          from {
            opacity: 0;
            transform: scale(0.95) translateY(10px);
          }
          to {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }
      `}</style>

      {/* Stunning Aurora Component Background */}
      <div style={{ position: "absolute", inset: 0, zIndex: 0, opacity: 0.45, pointerEvents: "none" }}>
        <Aurora
          colorStops={gameMode === "co_ty_phu" ? ["#59f2a5", "#f5c45e", "#073b2c"] : gameMode === "soi_mu" ? ["#9333ea", "#0c9170", "#118aec"] : ["#7cff67", "#EF4444", "#5227FF"]}
          blend={0.6}
          amplitude={1.1}
          speed={1.4}
        />
      </div>
      <div style={{
        position: "relative",
        zIndex: 1,
        width: "100%",
        maxWidth: 800,
        margin: "0 auto",
        display: "grid",
        gap: 24
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            onClick={() => nav('/')}
            aria-label="Quay lại"
            style={{
              border: "none",
              background: "transparent",
              padding: "0",
              cursor: "pointer",
              width: 28,
              height: 28,
              margin: "0",
            }}
          >
            <img src={ArrowLeft} alt="Quay lại" style={{ width: 22, height: 22, filter: "brightness(0.75)", display: "block" }} />
          </button>
          <h1 id="Sanh-cho">Sảnh Chờ</h1></div>

        {/* Lobby Header Card */}
        <div className="lobby-card" style={{ position: "relative", padding: "32px 36px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h1 style={{
              margin: 0,
              fontSize: 42,
              fontWeight: 900,
              letterSpacing: "-0.03em",
              background: "linear-gradient(135deg, #ffffff 30%, #a5b4fc 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent"
            }}>
              {greeting}
            </h1>

            {/* Player Circle Token */}
            <div
              onClick={() => setShowAvatarModal(true)}
              style={{
                width: 60,
                height: 60,
                borderRadius: "50%",
                border: "2px solid rgba(255, 255, 255, 0.2)",
                backgroundImage: currentAvatarUrl ? `url("${currentAvatarUrl}")` : undefined,
                backgroundColor: currentAvatarUrl ? undefined : "rgba(255, 255, 255, 0.05)",
                backgroundPosition: "center",
                backgroundSize: "cover",
                backgroundRepeat: "no-repeat",
                cursor: "pointer",
                transition: "all 0.25s ease",
                boxShadow: "0 4px 12px rgba(0, 0, 0, 0.3)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: currentAvatarUrl ? undefined : 24,
                color: "#ff8f42",
                overflow: "hidden"
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = "#ff8f42";
                e.currentTarget.style.transform = "scale(1.05)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.2)";
                e.currentTarget.style.transform = "scale(1)";
              }}
              title="Đổi Avatar VIP"
            >
              {!currentAvatarUrl && (
                <img
                  src={UserIcon}
                  alt="User"
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "contain",
                    transform: "scale(1.2) translateY(10%)",
                    opacity: 0.5
                  }}
                />
              )}
            </div>
          </div>
        </div>

        {/* Action Sections Grid */}
        <div style={{
          display: "grid",
          gridTemplateColumns: isDev ? "repeat(auto-fit, minmax(320px, 1fr))" : "1fr",
          gap: 24
        }}>
          {/* Create Room Section */}
          {isDev && (
            <section className="lobby-card">
              <h2 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: "#a5b4fc" }}>Tạo phòng mới</h2>
              <div style={{ display: "grid", gap: 16, height: "100%", justifyContent: "space-between" }}>
                <p style={{ fontSize: 14, color: "rgba(255,255,255,0.6)", margin: 0 }}>
                  Trở thành chủ phòng để mời bạn bè tham gia ván chơi {gameMode === "co_ty_phu" ? "Cờ tỷ phú" : gameMode === "soi_mu" ? "Sói Mù" : "Dạ Nghịch"}.
                </p>
                <button onClick={createRoom} className="lobby-btn lobby-btn-primary" style={{ alignSelf: "flex-end", width: "100%" }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                  Tạo phòng chơi
                </button>
              </div>
            </section>
          )}

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
        </div>
      </div>
      <AvatarSelectModal
        open={showAvatarModal}
        onClose={() => setShowAvatarModal(false)}
        myAvatar={myAvatar}
        clientId={clientId}
        onSelect={selectAvatar}
        onClear={clearAvatar}
      />
    </div>
  );
}
