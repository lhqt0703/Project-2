import { useEffect, useState } from "react";
import { socket } from "../socket";
import { useLocation } from "react-router-dom";

export default function Game() {
  const role = localStorage.getItem("role");
  const [phase, setPhase] = useState<"day" | "night">("day");
  const location = useLocation();
  const query = new URLSearchParams(location.search);
  const roomId = query.get("roomId");
  const hostId = localStorage.getItem("hostId");

  useEffect(() => {
    const handlePhaseChanged = (newPhase: "day" | "night") => {
      setPhase(newPhase);
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

  return (
    <div style={{ padding: 20 }}>
      <h1>Trò chơi bắt đầu!</h1>
      <h2>Vai trò của bạn là: {role}</h2>
      {phase === "day" ? (
        <h1>🌞 Ban ngày – Thảo luận</h1>
      ) : (
        <h1>🌙 Ban đêm – Các vai trò thực hiện hành động</h1>
      )}

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
