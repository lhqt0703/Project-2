import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useRoomContext } from "../context/RoomContext";
import { clientId, socket } from "../socket";
import "./CoTyPhuRoom.css";

const formatMoney = (value: number) => `${Math.max(0, value || 0).toLocaleString("vi-VN")}đ`;
const parseMoney = (value: string) => Number(value.replace(/\D/g, ""));

export default function CoTyPhuRoom() {
  const { room, setRoom } = useRoomContext();
  const nav = useNavigate();
  const roomId = new URLSearchParams(useLocation().search).get("roomId");
  const [startingMoney, setStartingMoney] = useState(() =>
    room?.coTyPhuState?.startingMoney?.toLocaleString("vi-VN") || "10.000",
  );
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (!roomId) return;
    const handleGameStarted = () => nav(`/game?roomId=${roomId}`);
    const handleError = (message: string) => setNotice(message);

    socket.on("gameStarted", handleGameStarted);
    socket.on("errorMessage", handleError);
    return () => {
      socket.off("gameStarted", handleGameStarted);
      socket.off("errorMessage", handleError);
    };
  }, [nav, roomId, setRoom]);

  if (!room || room.gameMode !== "co_ty_phu") return null;

  const isHost = room.hostId === clientId;
  const isPlaying = room.phase === "playing" && !room.gameOver;
  const configuredMoney = room.coTyPhuState?.startingMoney ?? 10_000;

  const saveStartingMoney = () => {
    const value = parseMoney(startingMoney);
    socket.emit(
      "coTyPhuSetStartingMoney",
      { roomId: room.id, startingMoney: value },
      (result: { ok: boolean; message?: string }) => {
        setNotice(result.ok ? `Đã đặt vốn ban đầu là ${formatMoney(value)}.` : result.message || "Không thể lưu thiết lập.");
      },
    );
  };

  const leaveRoom = () => {
    socket.emit("leaveRoom", { roomId: room.id });
    setRoom(null);
    nav("/lobby?mode=co_ty_phu");
  };

  return (
    <main className="ctp-room-page">
      <div className="ctp-room-glow ctp-room-glow-one" />
      <div className="ctp-room-glow ctp-room-glow-two" />

      <header className="ctp-room-header">
        <button className="ctp-ghost-button" onClick={leaveRoom}>← Rời phòng</button>
        <div>
          <span className="ctp-eyebrow">PHÒNG CỜ TỶ PHÚ</span>
          <h1>Mã phòng <strong>{room.id}</strong></h1>
        </div>
        <button
          className="ctp-ghost-button"
          onClick={() => navigator.clipboard?.writeText(room.id).then(() => setNotice("Đã sao chép mã phòng."))}
        >
          Sao chép mã
        </button>
      </header>

      <section className="ctp-room-grid">
        <div className="ctp-glass-card ctp-player-panel">
          <div className="ctp-section-heading">
            <div>
              <span className="ctp-eyebrow">NGƯỜI THAM GIA</span>
              <h2>{room.players.length} người trong phòng</h2>
            </div>
            <span className="ctp-live-dot">Realtime</span>
          </div>

          <div className="ctp-player-list">
            {room.players.map((player, index) => (
              <div className="ctp-player-row" key={player.id}>
                <span className="ctp-player-number">{String(index + 1).padStart(2, "0")}</span>
                <span className="ctp-player-avatar">{player.name.trim().charAt(0).toUpperCase() || "?"}</span>
                <div className="ctp-player-name">
                  <strong>{player.name || "Người chơi"}{player.id === clientId ? " (Bạn)" : ""}</strong>
                  <small>{player.connected === false ? "Mất kết nối" : "Đã sẵn sàng"}</small>
                </div>
                {player.id === room.hostId && <span className="ctp-host-badge">HOST · CÓ THAM GIA</span>}
              </div>
            ))}
          </div>
        </div>

        <aside className="ctp-glass-card ctp-settings-panel">
          <span className="ctp-eyebrow">THIẾT LẬP VÁN</span>
          <h2>Vốn ban đầu</h2>
          <p>Mọi người, kể cả host, sẽ bắt đầu với số tiền bằng nhau.</p>

          {isHost ? (
            <div className="ctp-money-setting">
              <label htmlFor="starting-money">Số tiền mỗi người nhận</label>
              <div className="ctp-money-input-wrap">
                <input
                  id="starting-money"
                  inputMode="numeric"
                  value={startingMoney}
                  disabled={isPlaying}
                  onChange={(event) => {
                    const value = parseMoney(event.target.value);
                    setStartingMoney(value ? value.toLocaleString("vi-VN") : "");
                  }}
                />
                <span>đ</span>
              </div>
              <button className="ctp-secondary-button" disabled={isPlaying} onClick={saveStartingMoney}>
                Lưu thiết lập
              </button>
            </div>
          ) : (
            <div className="ctp-capital-display">{formatMoney(configuredMoney)}</div>
          )}

          <div className="ctp-rule-note">
            <strong>Luật phá sản</strong>
            <span>Nếu không đủ tiền, người nhận vẫn nhận đủ và người trả về 0đ, phá sản ngay.</span>
          </div>

          {notice && <p className="ctp-notice">{notice}</p>}

          {isHost ? (
            <button
              className="ctp-primary-button"
              disabled={room.players.length < 2}
              onClick={() => isPlaying ? nav(`/game?roomId=${room.id}`) : socket.emit("startGame", room.id)}
            >
              {isPlaying ? "Trở lại ván đang chơi" : "Bắt đầu trò chơi"}
            </button>
          ) : (
            <div className="ctp-waiting-copy">Đang chờ host bắt đầu…</div>
          )}
        </aside>
      </section>
    </main>
  );
}
