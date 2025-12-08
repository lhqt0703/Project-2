import { socket } from "../socket";
import { useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";

export default function Lobby() {
  const nav = useNavigate();
  const [name, setName] = useState("");
  const [roomIdInput, setRoomIdInput] = useState("");

  useEffect(() => {
    socket.on("roomCreated", (room) => {
      nav(`/room?roomId=${room.id}`);
    });
    socket.on("roomJoined", (room) => {
      nav(`/room?roomId=${room.id}`);
    });
    return () => {
      socket.off("roomCreated");
      socket.off("roomJoined");
    };
  }, [nav]);

  const createRoom = () => {
    socket.emit("createRoom", { name });
  };

  const joinRoom = () => {
    socket.emit("joinRoom", { roomId: roomIdInput, name });
  };

  return (
    <div style={{ padding: 20 }}>
      <h1>Phòng Chờ</h1>
      <input
        placeholder="Tên của bạn"
        onChange={(e) => setName(e.target.value)}
      />
      <button onClick={createRoom}>Tạo Phòng</button>
      <input
        placeholder="Mã phòng"
        onChange={(e) => setRoomIdInput(e.target.value)}
      />
      <button onClick={joinRoom}>Tham gia phòng</button>
    </div>
  );
}
