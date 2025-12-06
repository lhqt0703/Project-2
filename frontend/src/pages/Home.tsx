import { useNavigate } from "react-router-dom";

export default function Home() {
  const nav = useNavigate();

  return (
    <div style={{ padding: 20 }}>
      <h1>Trang Chủ</h1>

      <button onClick={() => nav("/lobby")}>
        Tạo phòng / Tham gia phòng (tạm thời)
      </button>
    </div>
  );
}
