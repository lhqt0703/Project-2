import { socket } from "../socket";
import { useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import GameRulesModal from "../components/GameRulesModal";
import { DEFAULT_ROOM_GAME_RULES, type RoomGameRules } from "../context/RoomContext";

const PLAYER_NAME_STORAGE_KEY = "werewolfPlayerName";

export default function Lobby() {
  const nav = useNavigate();
  const [name, setName] = useState(() => localStorage.getItem(PLAYER_NAME_STORAGE_KEY) || "");
  const [roomIdInput, setRoomIdInput] = useState("");
  const [showRulesModal, setShowRulesModal] = useState(false);
  const [gameRules, setGameRules] = useState<RoomGameRules>(DEFAULT_ROOM_GAME_RULES);

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
    <div className="page-shell lobby-page" style={{ minHeight: "100vh", padding: 24, background: "radial-gradient(circle at top, rgba(255,190,92,0.18), transparent 30%), linear-gradient(180deg, #09111f, #050813)", color: "#f4f6fb" }}>
      <div style={{ maxWidth: 980, margin: "0 auto", display: "grid", gap: 18 }}>
        <div style={{ padding: 28, borderRadius: 24, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(10,14,26,0.78)", boxShadow: "0 24px 80px rgba(0,0,0,0.35)" }}>
          <h1 style={{ margin: 0, fontSize: 40, letterSpacing: -0.03 }}>Sảnh chờ</h1>
          <p style={{ margin: "10px 0 0", maxWidth: 760, lineHeight: 1.6, color: "rgba(244,246,251,0.75)" }}>
            Tạo phòng, thiết lập luật chơi trước khi bắt đầu, hoặc tham gia một phòng đã có sẵn bằng mã phòng.
          </p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
          <section style={{ padding: 24, borderRadius: 24, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.04)" }}>
            <h2 style={{ marginTop: 0 }}>Tham gia phòng</h2>
            <div style={{ display: "grid", gap: 12 }}>
              <input
                placeholder="Tên của bạn"
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
                style={{ padding: "12px 14px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.14)", background: "rgba(255,255,255,0.05)", color: "inherit" }}
              />
              <input
                inputMode="numeric"
                placeholder="Mã phòng"
                onChange={(e) => setRoomIdInput(e.target.value)}
                style={{ padding: "12px 14px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.14)", background: "rgba(255,255,255,0.05)", color: "inherit" }}
              />
              <button onClick={joinRoom} style={{ padding: "13px 14px", cursor: "pointer" }}>
                Tham gia phòng
              </button>
            </div>
          </section>
          
          <section style={{ padding: 24, borderRadius: 24, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.04)" }}>
            <h2 style={{ marginTop: 0 }}>Tạo phòng</h2>
            <div style={{ display: "grid", gap: 12 }}>
              <input
                placeholder="Tên của bạn"
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
                style={{ padding: "12px 14px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.14)", background: "rgba(255,255,255,0.05)", color: "inherit" }}
              />
              <button onClick={() => setShowRulesModal(true)} style={{ padding: "12px 14px", cursor: "pointer" }}>
                Thiết lập luật chơi
              </button>
              <button
                onClick={createRoom}
                style={{
                  padding: "13px 14px",
                  cursor: "pointer",
                  background: "linear-gradient(135deg, #f6c85f, #ff8f42)",
                  color: "#111",
                  border: "none",
                  fontWeight: 800,
                }}
              >
                Tạo phòng
              </button>
              <div style={{ fontSize: 13, lineHeight: 1.5, color: "rgba(244,246,251,0.68)" }}>
                Luật hiện tại: đồng thời {gameRules.allNightActionsSimultaneous ? "bật" : "tắt"}, phù thủy chỉ thấy vết cắn khi còn bình {gameRules.witchSeeBiteOnlyIfHasHealPotion ? "bật" : "tắt"},
                lượt tương tác: {gameRules.trialInteractionSelectionLimit}.
              </div>
            </div>
          </section>


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
