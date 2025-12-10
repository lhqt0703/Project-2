import { useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { socket } from "../socket";

export default function Home() {
  const nav = useNavigate();
  useEffect(() => {
  const query = new URLSearchParams(window.location.search);
  const autoRoom = query.get("roomId");
  const autoName = query.get("name");

  if (autoRoom && autoName) {
    socket.emit("joinRoom", { roomId: autoRoom, name: autoName });
    nav(`/room?roomId=${autoRoom}`);
  }
}, []);


  return (
    <div style={{ padding: 20 }}>
      <h1>Trang Chủ</h1>
      <button onClick={() => nav("/lobby")}>
        Tạo phòng / Tham gia phòng (tạm thời)
      </button>
    </div>
  );
}
