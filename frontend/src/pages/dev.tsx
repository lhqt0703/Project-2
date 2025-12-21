import { useState } from "react";

export default function DevSpawn() {
  const [roomId, setRoomId] = useState("");
  const [count, setCount] = useState(5);
  const [prefix, setPrefix] = useState("P");
  const [debugAnim, setDebugAnim] = useState(true);

  const spawn = () => {
    for (let i = 1; i <= count; i++) {
      window.open(`/?roomId=${roomId}&name=${prefix}${i}`, "_blank");

    }
  };

  const openGame = (opts?: { debugAnim?: boolean }) => {
    const rid = (roomId || "").trim();
    if (!rid) return;
    const params = new URLSearchParams();
    params.set("roomId", rid);
    if (opts?.debugAnim) params.set("debugAnim", "1");
    window.open(`/game?${params.toString()}`, "_blank");
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

      <label style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10 }}>
        <input
          type="checkbox"
          checked={debugAnim}
          onChange={(e) => setDebugAnim(e.target.checked)}
        />
        Debug hunter animation (Game)
      </label>

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

      <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button onClick={() => openGame({ debugAnim })}>
          Open Game {debugAnim ? "(debug)" : ""}
        </button>
        <button onClick={() => openGame({ debugAnim: true })}>
          Open Game (debug)
        </button>
      </div>
    </div>
  );
}
