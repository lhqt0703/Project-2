import { useState } from "react";

export default function DevSpawn() {
  const [roomId, setRoomId] = useState("");
  const [count, setCount] = useState(5);
  const [prefix, setPrefix] = useState("P");

  const spawn = () => {
    for (let i = 1; i <= count; i++) {
      window.open(`/?roomId=${roomId}&name=${prefix}${i}`, "_blank");

    }
  };

  return (
    <div style={{ padding: 20 }}>
      <h1>Dev Player Spawner</h1>

      <label>Room ID:</label>
      <input
        value={roomId}
        onChange={(e) => setRoomId(e.target.value)}
        style={{ display: "block", marginBottom: 10 }}
      />

      <label>Số player muốn mở:</label>
      <input
        type="number"
        value={count}
        onChange={(e) => setCount(Number(e.target.value))}
        style={{ display: "block", marginBottom: 10 }}
      />

      <label>Prefix tên:</label>
      <input
        value={prefix}
        onChange={(e) => setPrefix(e.target.value)}
        style={{ display: "block", marginBottom: 10 }}
      />

      <button onClick={spawn} style={{ marginTop: 20 }}>
        Spawn Players 🚀
      </button>
    </div>
  );
}
