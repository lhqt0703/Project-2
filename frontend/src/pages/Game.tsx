export default function Game() {
  const role = localStorage.getItem("role");

  return (
    <div style={{ padding: 20 }}>
      <h1>Trò chơi bắt đầu!</h1>
      <h2>Vai trò của bạn là: {role}</h2>
    </div>
  );
}
