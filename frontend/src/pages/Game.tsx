

import { useEffect, useState } from "react";
import { socket } from "../socket";
import { useLocation } from "react-router-dom";
import { useRoomContext } from "../context/RoomContext";

export default function Game() {
  const { role, room } = useRoomContext();
  const [phase, setPhase] = useState<"day" | "night">("day");
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [seerResult, setSeerResult] = useState<{ playerId: string; isWolf: boolean } | null>(null);
  const location = useLocation();
  const query = new URLSearchParams(location.search);
  const roomId = query.get("roomId");
  const hostId = localStorage.getItem("hostId");

  useEffect(() => {
    const handlePhaseChanged = (newPhase: "day" | "night") => {
      setPhase(newPhase);
      setSelectedPlayerId(null);
      setShowConfirm(false);
      setSeerResult(null);
    };
    socket.on("phaseChanged", handlePhaseChanged);
    return () => {
      socket.off("phaseChanged", handlePhaseChanged);
    };
  }, []);

  useEffect(() => {
    // Khi host rời khi game đang diễn ra
    const handleHostDisconnected = () => {
      alert(
        "Chủ phòng đã rời đi. Bạn có thể chờ chủ phòng quay lại hoặc thoát khỏi phòng."
      );
      // Có thể thêm logic cho phép người chơi tự thoát hoặc chờ
    };
    socket.on("hostDisconnected", handleHostDisconnected);
    return () => {
      socket.off("hostDisconnected", handleHostDisconnected);
    };
  }, []);

  // Lắng nghe kết quả tiên tri từ server
  useEffect(() => {
    socket.on("seerResult", ({ playerId, isWolf }) => {
      setSeerResult({ playerId, isWolf });
      setShowConfirm(false);
    });
    return () => {
      socket.off("seerResult");
    };
  }, []);

  // Xử lý click vào avatar người chơi
  const handlePlayerClick = (playerId: string) => {
    if (phase === "night" && role === "Tiên tri" && !seerResult) {
      setSelectedPlayerId(playerId);
      setShowConfirm(true);
    }
  };

  // Xác nhận chọn người để soi
  const handleConfirmSeer = () => {
    if (roomId && selectedPlayerId) {
      socket.emit("seerCheck", { roomId, targetId: selectedPlayerId });
    }
  };

  return (
    <div style={{ padding: 20 }}>
      <h1>Trò chơi bắt đầu!</h1>
      <h2>Vai trò của bạn là: {role}</h2>
      {phase === "day" ? (
        <h1>🌞 Ban ngày – Thảo luận</h1>
      ) : (
        <h1>🌙 Ban đêm – Các vai trò thực hiện hành động</h1>
      )}
      {/* Hiển thị bố cục vị trí người chơi khi có room.positions */}
      {room?.positions && (
        <div style={{ width: "100%", maxWidth: 600, height: 400, background: "#f0f0f0", borderRadius: 10, position: "relative", margin: "32px auto" }}>
          {/* center marker */}
          <div style={{ position: "absolute", left: "50%", top: "50%", transform: "translate(-50%,-50%)", pointerEvents: "none" }}>
            <div style={{ width: 6, height: 6, borderRadius: 3, background: "#666" }} />
          </div>
          {(room.positions || []).map((pos) => {
            const p = room.players.find(x => x.id === pos.playerId);
            if (!p) return null;
            const left = `${pos.x * 100}%`;
            const top = `${pos.y * 100}%`;
            // Hiệu ứng bóng nếu là kết quả soi
            let boxShadow = "";
            if (seerResult && seerResult.playerId === pos.playerId) {
              boxShadow = seerResult.isWolf ? "0 0 0 8px #d00, 0 0 16px 8px #222" : "0 0 0 8px #222, 0 0 16px 8px #d00";
            }
            return (
              <div
                key={pos.playerId}
                style={{
                  position: "absolute",
                  left,
                  top,
                  transform: "translate(-50%,-50%)",
                  width: 72,
                  height: 72,
                  borderRadius: 36,
                  background: "#fff",
                  border: "2px solid #333",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 12,
                  cursor: phase === "night" && role === "Tiên tri" && !seerResult ? "pointer" : "default",
                  boxShadow,
                  transition: "box-shadow 0.3s"
                }}
                onClick={() => handlePlayerClick(pos.playerId)}
              >
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontWeight: "bold" }}>{p.name || "?"}</div>
                  <div style={{ opacity: 0.6, fontSize: 11 }}>{p.id === socket.id ? "(Bạn)" : ""}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {/* Popup xác nhận cho tiên tri */}
      {showConfirm && selectedPlayerId && (
        <div style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: "100vw",
          height: "100vh",
          background: "rgba(0,0,0,0.3)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 9999
        }}>
          <div style={{ background: "#fff", padding: 32, borderRadius: 12, minWidth: 320, boxShadow: "0 2px 16px rgba(0,0,0,0.2)" }}>
            <h2>Xác nhận lựa chọn</h2>
            <p>Bạn có chắc muốn soi người này?</p>
            <div style={{ display: "flex", gap: 16, marginTop: 24 }}>
              <button onClick={handleConfirmSeer}>Xác nhận</button>
              <button onClick={() => setShowConfirm(false)}>Huỷ</button>
            </div>
          </div>
        </div>
      )}
      {/* Host controls */}
      {socket.id === hostId && (
        <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
          <button
            onClick={() =>
              socket.emit("changePhase", { roomId, phase: "night" })
            }
          >
            Bắt đầu đêm
          </button>
          <button
            onClick={() =>
              socket.emit("changePhase", { roomId, phase: "day" })
            }
          >
            Bắt đầu ngày
          </button>
        </div>
      )}
    </div>
  );
}
