

import { useEffect, useState } from "react";
import { socket } from "../socket";
import { useLocation } from "react-router-dom";
import { useRoomContext } from "../context/RoomContext";

export default function Game() {
  const { role, room, setRoom } = useRoomContext();
  const [phase, setPhase] = useState<"day" | "night">("day");
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [seerResult, setSeerResult] = useState<{ playerId: string; isWolf: boolean } | null>(null);
  const location = useLocation();
  const query = new URLSearchParams(location.search);
  const roomId = query.get("roomId");
  const hostId = localStorage.getItem("hostId");
  // --- state cho sói ---
  const [wolfVotes, setWolfVotes] = useState<Record<string, string | null> | null>(null);
  const [wolfLocked, setWolfLocked] = useState<Record<string, boolean> | null>(null); // trạng thái lock vote của từng sói
  const [wolfDeadline, setWolfDeadline] = useState<number | null>(null); 
  const [localSelectedTarget, setLocalSelectedTarget] = useState<string | null>(null); // khi sói click avatar -> chọn tạm
  const [_killedTonight, setKilledTonight] = useState<string | null>(null); // dấu _ để tránh cảnh báo không dùng
  const [deadPlayers, setDeadPlayers] = useState<string[]>([]); // danh sách người chơi đã bị cắn
  const [_now, setNow] = useState(Date.now()); // để cập nhật thời gian hiện tại
  const [wolves, setWolves] = useState<string[]>([]);
  const [activeWolves, setActiveWolves] = useState<string[]>([]);


  if (!room) return <p>Hình như có gì đó sai sai... Lẽ ra bạn không nên thấy được những dòng này</p>;

  // keep room state in sync while in Game (for connected/disconnected badge, positions, etc.)
  useEffect(() => {
    if (roomId) {
      socket.emit("getRoom", roomId);
    }

    const handleRoomUpdated = (data: any) => {
      setRoom(data);
    };
    const handlePositionsUpdated = (positions: any) => {
      setRoom((prev) => (prev ? { ...prev, positions } : prev));
    };

    socket.on("roomUpdated", handleRoomUpdated);
    socket.on("positionsUpdated", handlePositionsUpdated);

    return () => {
      socket.off("roomUpdated", handleRoomUpdated);
      socket.off("positionsUpdated", handlePositionsUpdated);
    };
  }, [roomId, setRoom]);


  useEffect(() => {
  const t = setInterval(() => setNow(Date.now()), 1000);
  return () => clearInterval(t);
}, []);
  
  useEffect(() => {
  const handleWolfVotesUpdated = (votes: Record<string, string | null>) => {
    setWolfVotes(votes);
  };
  const handleWolfLockedUpdated = (locked: Record<string, boolean>) => {
    setWolfLocked(locked);
  };
  const handleWolfPhaseStarted = ({ wolves, activeWolves, deadline }: { wolves: string[]; activeWolves: string[]; deadline: number }) => {
    setWolves(wolves);         // LƯU DANH SÁCH SÓI
    setActiveWolves(activeWolves || []);
    setWolfDeadline(deadline);
    setWolfVotes(null);
    setWolfLocked(null);
    setLocalSelectedTarget(null);
    setKilledTonight(null);
  };
  const handleWolfVoteFinished = ({ target }: { target: string | null }) => {
    setKilledTonight(target || null);
    // server sẽ thực tế công bố vào lúc chuyển sang day; nhưng client có thể hiển thị sơ bộ
  };
  const handlePlayerKilled = (playerId: string) => {
    setDeadPlayers(prev => prev.includes(playerId) ? prev : [...prev, playerId]);
  };

  socket.on("wolfVotesUpdated", handleWolfVotesUpdated);
  socket.on("wolfLockedUpdated", handleWolfLockedUpdated);
  socket.on("wolfPhaseStarted", handleWolfPhaseStarted);
  socket.on("wolfVoteFinished", handleWolfVoteFinished);
  socket.on("playerKilled", handlePlayerKilled);

  return () => {
    socket.off("wolfVotesUpdated", handleWolfVotesUpdated);
    socket.off("wolfLockedUpdated", handleWolfLockedUpdated);
    socket.off("wolfPhaseStarted", handleWolfPhaseStarted);
    socket.off("wolfVoteFinished", handleWolfVoteFinished);
    socket.off("playerKilled", handlePlayerKilled);
  };
}, []);


  useEffect(() => {
    const handlePhaseChanged = (newPhase: "day" | "night") => {
      setPhase(newPhase);
      setSelectedPlayerId(null);
      setShowConfirm(false);
      setSeerResult(null);
      setWolfVotes(null); // reset cái badge vote của sói
      setLocalSelectedTarget(null); // reset lựa chọn tạm thời của sói
      if (newPhase === "day") {
        setActiveWolves([]);
      }
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

  // Lắng nghe kết quả tiên tri từ server
  useEffect(() => {
    socket.on("seerResult", ({ playerId, isWolf }) => {
      setSeerResult({ playerId, isWolf });
      setShowConfirm(false);
    });
    return () => {
      socket.off("seerResult");
    };
  }, []);

  // Xử lý click vào avatar người chơi
  const handlePlayerClick = (playerId: string) => {
    // Nếu người chơi đã chết thì không được chọn họ nữa
    if (deadPlayers.includes(playerId)) return;

    // Nếu là Tiên tri
    if (phase === "night" && role === "Tiên tri" && !seerResult) {
      if (deadPlayers.includes(socket.id!)) return; // tiên tri chết → không soi
      
      setSelectedPlayerId(playerId);
      setShowConfirm(true);
      return;
    }

    // Nếu là Sói
    if (phase === "night" && role === "Sói") {
      // nếu bản thân đã bị chết thì không được chọn
      if (deadPlayers.includes(socket.id!)) return;
      // không cho chọn chính mình
      if (playerId === socket.id) return;
      // không cho chọn sói khác
      if (wolves.includes(playerId)) return;
      // lock vote rồi thì không được chọn nữa
      if (wolfLocked?.[socket.id!]) return;
      // hoặc là hết thời gian
      if (wolfDeadline && Date.now() >= wolfDeadline) return;


      // set local selection và gửi lên server để sói khác thấy
      setLocalSelectedTarget(playerId);
      socket.emit("wolfChooseTarget", { roomId, targetId: playerId });
    }
  };

  // Xác nhận chọn người để soi
  const handleConfirmSeer = () => {
    if (roomId && selectedPlayerId) {
      socket.emit("seerCheck", { roomId, targetId: selectedPlayerId });
    }
  };

  return (
    <div style={{ padding: 20 }}>
      <h1>Trò chơi bắt đầu!</h1>
      <h2>Vai trò của bạn là: {role}</h2>
      {phase === "day" ? (
        <h1>🌞 Ban ngày – Thảo luận</h1>
      ) : (
        <h1>🌙 Ban đêm – Các vai trò thực hiện hành động</h1>
      )}
      {/* Hiển thị bố cục vị trí người chơi khi có room.positions */}
      {room?.positions && (
        <div style={{ width: "100%", maxWidth: 600, height: 400, background: "#f0f0f0", borderRadius: 10, position: "relative", margin: "32px auto" }}>
          {/* center marker */}
          <div style={{ position: "absolute", left: "50%", top: "50%", transform: "translate(-50%,-50%)", pointerEvents: "none" }}>
            <div style={{ width: 6, height: 6, borderRadius: 3, background: "#666" }} />
          </div>
          {(room.positions || []).map((pos) => {
            const p = room.players.find(x => x.id === pos.playerId);
            if (!p) return null;
            const left = `${pos.x * 100}%`;
            const top = `${pos.y * 100}%`;
            // Hiệu ứng bóng nếu là kết quả soi
            let boxShadow = "";
            if (seerResult && seerResult.playerId === pos.playerId) {
              boxShadow = seerResult.isWolf ? "0 0 0 8px #d00, 0 0 16px 8px #222" : "0 0 0 8px #222, 0 0 16px 8px #d00";
            }
            // xác định wolves sống hiện tại (từ room.playerRoles)
            const activeWolvesAlive = (activeWolves.length ? activeWolves : wolves)
              .filter(id => !deadPlayers.includes(id))
              .filter(id => room.players.find(pp => pp.id === id)?.connected !== false);
            const wolfCount = activeWolvesAlive.length;

            // trong map: tính voteCount cho từng avatar
            const voteCountForThis = wolfVotes
              ? activeWolvesAlive.filter(wid => wolfVotes[wid] === pos.playerId).length
              : 0;

            // isSelectedLocal (nếu bạn là sói và bạn đã chọn mục tiêu này)
            const isLocalSelected = localSelectedTarget === pos.playerId;

            // opacity nếu đã chết
            const isDead = deadPlayers.includes(pos.playerId);
            return (
              <div
                key={pos.playerId}
                style={{
                  position: "absolute",
                  left,
                  top,
                  transform: "translate(-50%,-50%)",
                  width: 72,
                  height: 72,
                  borderRadius: 36,
                  background: "#fff",
                  border: "2px solid #333",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 12,
                  cursor: (phase === "night" && (role === "Tiên tri" || role === "Sói") && !seerResult) ? "pointer" : "default",
                  boxShadow,
                  transition: "box-shadow 0.3s",
                  opacity: isDead ? 0.4 : 1,
                  outline: isLocalSelected ? "3px solid rgba(255,165,0,0.9)" : undefined,
                }}
                onClick={() => handlePlayerClick(pos.playerId)}
              >
                {/* small badge x/y - chỉ hiện khi bạn là sói hoặc mọi người nên thấy? 
                    Yêu cầu là: những người chơi là sói sẽ thấy đối tượng mà sói khác muốn chọn trong đêm đó.
                    => badge chỉ hiển thị cho sói. */}
                {role === "Sói" && wolfCount >= 2 && voteCountForThis > 0 && (
                  <div style={{
                    position: "absolute",
                    top: -10,
                    right: -10,
                    background: "#b71c1c",
                    color: "#fff",
                    borderRadius: 10,
                    padding: "2px 6px",
                    fontSize: 11,
                    fontWeight: "bold",
                  }}>
                    {voteCountForThis}/{wolfCount}
                  </div>
                )}

                {p.connected === false && (
                  <div style={{
                    position: "absolute",
                    bottom: -10,
                    left: "50%",
                    transform: "translateX(-50%)",
                    background: "#555",
                    color: "#fff",
                    padding: "2px 6px",
                    borderRadius: 6,
                    fontSize: 11,
                    fontWeight: "bold",
                    opacity: 0.9,
                  }}>
                    Mất kết nối
                  </div>
                )}

                <div style={{ textAlign: "center" }}>
                  <div style={{ fontWeight: "bold" }}>{p.name || "?"}</div>
                  <div style={{ opacity: 0.6, fontSize: 11 }}>{p.id === socket.id ? "(Bạn)" : ""}</div>
                  {role === "Sói" && phase === "night" && wolves.includes(p.id) && (
                  <div style={{
                    position: "absolute",
                    top: -10,
                    left: -10,
                    background: "#000",
                    color: "#fff",
                    padding: "2px 6px",
                    borderRadius: 6,
                    fontSize: 11,
                    fontWeight: "bold",
                    opacity: 0.9
                  }}>
                    Sói
                  </div>
                )}

                </div>
              </div>
            );
          })}
        </div>
      )}
      {/* Popup xác nhận cho tiên tri */}
      {showConfirm && selectedPlayerId && (
        <div style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: "100vw",
          height: "100vh",
          background: "rgba(0,0,0,0.3)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 9999
        }}>
          <div style={{ background: "#fff", padding: 32, borderRadius: 12, minWidth: 320, boxShadow: "0 2px 16px rgba(0,0,0,0.2)" }}>
            <h2>Xác nhận lựa chọn</h2>
            <p>Bạn có chắc muốn soi người này?</p>
            <div style={{ display: "flex", gap: 16, marginTop: 24 }}>
              <button onClick={handleConfirmSeer}>Xác nhận</button>
              <button onClick={() => setShowConfirm(false)}>Huỷ</button>
            </div>
          </div>
        </div>
      )}


    {/* Host controls */}
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

    {/* Nút CẮN cho sói (ban đêm) */}
    {role === "Sói" && phase === "night" && !deadPlayers.includes(socket.id!) && (
      <div style={{ marginTop: 12 }}>
        <div>Chọn người để cắn: <b>{localSelectedTarget ? room.players.find(p => p.id === localSelectedTarget)?.name || "?" : "Chưa chọn"}</b></div>
        <button
          onClick={() => {
            // nếu chưa chọn target thì nhắc
            if (!localSelectedTarget) {
              alert("Bạn chưa chọn mục tiêu để cắn.");
              return;
            }
            // mở popup xác nhận (dùng same popup style như tiên tri hoặc riêng)
            const ok = window.confirm(`Bạn có chắc chắn muốn cắn ${room.players.find(p => p.id === localSelectedTarget)?.name || "đối tượng"}?`);
            if (ok) {
              // gửi lock vote (bấm CẮN)
              socket.emit("wolfLockVote", { roomId });
            }
          }}
          style={{ marginTop: 8, padding: "8px 12px", cursor: "pointer" }}
        >
          🐺 CẮN!
        </button>
        {/* Hiển thị countdown (nếu có) */}
        {wolfDeadline && (
          <div style={{ marginTop: 6 }}>
            Thời gian còn lại: {Math.max(0, Math.ceil((wolfDeadline - Date.now()) / 1000))}s
          </div>
        )}
      </div>
    )}
  
    </div>
  );
}
