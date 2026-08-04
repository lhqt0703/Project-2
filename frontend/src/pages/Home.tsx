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
      <h2>Mừng bạn đến buổi off của Gummy Bears Force~</h2>
      <button onClick={() => nav("/lobby?mode=da_nghich")} style={{ marginRight: 10 }}>
        Dạ Nghịch
      </button>
      
      <button onClick={() => nav("/lobby?mode=soi_mu")} style={{ marginRight: 10 }}>
        Sói Mù
      </button>
      
      <button onClick={() => nav("/lobby?mode=diet_quy")} style={{ marginRight: 10 }}>
        Diệt Quỷ
      </button>

      <button onClick={() => nav("/lobby?mode=co_ty_phu")}>
        Cờ tỷ phú
      </button>
    </div>
  );
}
