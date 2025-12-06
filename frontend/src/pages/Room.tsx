import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { socket } from "../socket";

interface Player {
  id: string;
  name: string;
}

interface RoomData {
  id: string;
  players: Player[];
  hostId: string;
}

export default function Room() {
  const [room, setRoom] = useState<RoomData | null>(null);
  const location = useLocation();
  const nav = useNavigate();

  // lấy roomId từ URL (?roomId=xxxxx)
  const query = new URLSearchParams(location.search);
  const roomId = query.get("roomId");

  useEffect(() => {
    if (roomId) {
      socket.emit("getRoom", roomId);
    }
  }, [roomId]);

  useEffect(() => {
    // Khi server gửi cập nhật phòng
    socket.on("roomCreated", (data) => setRoom(data));
    socket.on("roomJoined", (data) => setRoom(data));
    socket.on("roomUpdated", (data) => setRoom(data));

    return () => {
      socket.off("roomCreated");
      socket.off("roomJoined");
      socket.off("roomUpdated");
    };
  }, []);

  useEffect(() => {
    socket.on("yourRole", (role) => {
      // lưu role vào state, chuyển sang trang game
      localStorage.setItem("role", role); // tạm dùng localStorage
      nav("/game");
    });

    socket.on("gameStarted", () => {
      // nếu cần thì trigger UI chung
    });

    return () => {
      socket.off("yourRole");
      socket.off("gameStarted");
    };
  }, [nav]);

  if (!room) return <p>Đang tải phòng...</p>;

  return (
    <div style={{ padding: 20 }}>
      <h1>Phòng: {room.id}</h1>
      <h2>Người chơi:</h2>

      <ul>
        {room.players.map((p) => (
          <li key={p.id}>
            {p.name} {p.id === room.hostId && "(Chủ phòng)"}
          </li>
        ))}
      </ul>

      {socket.id === room.hostId && (
        <button
          style={{ marginTop: 20 }}
          onClick={() => socket.emit("startGame", room.id)}
        >
          Bắt đầu trò chơi
        </button>
      )}
    </div>
  );
}
