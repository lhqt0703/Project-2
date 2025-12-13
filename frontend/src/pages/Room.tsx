import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { socket } from "../socket";
import React from "react";
import PositionEditor from "../components/PositionEditor";
import { useRoomContext } from "../context/RoomContext";


interface Player {
  id: string;
  name: string;
}

interface RoomData {
  id: string;
  players: Player[];
  hostId: string;
  positions?: PlayerPosition[];
  positionEditors?: string[];
}

interface PlayerPosition {
  playerId: string;
  x: number;
  y: number;
}


export default function Room() {
  const { room, setRoom, setRole } = useRoomContext();
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    player: Player | null;
  } | null>(null);
  const location = useLocation();
  const nav = useNavigate();

  // lấy roomId từ URL (?roomId=xxxxx)
  const query = new URLSearchParams(location.search);
  const roomId = query.get("roomId");

  const [showEditor, setShowEditor] = useState(false);
  const [positionEditors, setPositionEditors] = useState<string[]>([]);

  useEffect(() => {
    if (roomId) {
      socket.emit("getRoom", roomId);
    }
  }, [roomId]);

  useEffect(() => {
    // Khi server gửi cập nhật phòng
    const handleRoom = (data: RoomData) => {
      setRoom(data);
      localStorage.setItem("hostId", data.hostId);
    };
    socket.on("roomCreated", handleRoom);
    socket.on("roomJoined", handleRoom);
    socket.on("roomUpdated", handleRoom);
    socket.on("roomUpdated", (data) => console.log("ROOM UPDATED:", data));


    socket.on("positionsUpdated", (positions: PlayerPosition[]) => {
      setRoom(prev => prev ? { ...prev, positions } : prev);
    });

    socket.on("positionEditorsUpdated", (editors: string[]) => {
      setPositionEditors(editors ?? []);
      setRoom(prev => prev ? { ...prev, positionEditors: editors } : prev);
    });


    // Lắng nghe hostChanged để cập nhật hostId realtime
    const handleHostChanged = (newHostId: string) => {
      setRoom(prev => prev ? { ...prev, hostId: newHostId } : prev);
      localStorage.setItem("hostId", newHostId);
    };
    socket.on("hostChanged", handleHostChanged);

    return () => {
      socket.off("roomCreated", handleRoom);
      socket.off("roomJoined", handleRoom);
      socket.off("roomUpdated", handleRoom);
      socket.off("hostChanged", handleHostChanged);
      socket.off("positionsUpdated"); 
      socket.off("positionEditorsUpdated"); 
    };
  }, []); // cần là mảng rỗng để tránh gây lãng phí tài nguyên và lỡ sự kiện

  useEffect(() => {
    const handleYourRole = (role: string) => {
      // Chỉ lưu role nếu chưa có hoặc khác role hiện tại
      setRole(role);
  const targetRoomId = room?.id ?? roomId;
  if (targetRoomId) {
    nav(`/game?roomId=${targetRoomId}`);
  } else {
    nav("/game");
  }
};

    const handleGameStarted = () => {
      // nếu cần thì trigger UI chung
    };

    socket.on("yourRole", handleYourRole);
    socket.on("gameStarted", handleGameStarted);

    return () => {
      socket.off("yourRole", handleYourRole);
      socket.off("gameStarted", handleGameStarted);
    };
  }, [nav, room, roomId, setRole]);

  useEffect(() => {
    interface RoleMismatchData {
      newPlayers: Player[];
      missingRoles: number;
    }

    const handleMismatch = (data: RoleMismatchData) => {
      const { newPlayers, missingRoles } = data;

      const names = newPlayers.map((p: Player) => p.name).join(", ");

      const ok = window.confirm(
        `Có người chơi mới (${names}) đã vào phòng sau khi bạn đã xác nhận vai trò.\n` +
        `Bạn đang thiếu ${missingRoles} vai trò.\n\n` +
        `Bạn có muốn tự động thêm ${missingRoles} Dân làng không?`
      );

      if (ok) {
        socket.emit("addAutoRoles", { roomId: room?.id, count: missingRoles });
      } else {
        alert("Hãy quay lại màn hình chọn vai trò để chỉnh sửa lại!");
      }
    };

    socket.on("roleMismatch", handleMismatch);
    return () => {
      socket.off("roleMismatch", handleMismatch);
    };
  }, [room]);

  useEffect(() => {
    // Khi host rời khi game đang diễn ra
    const handleHostDisconnected = () => {
      alert("Chủ phòng đã rời đi. Bạn có thể chờ chủ phòng quay lại hoặc thoát khỏi phòng.");
      // Có thể thêm logic cho phép người chơi tự thoát hoặc chờ
    };
    socket.on("hostDisconnected", handleHostDisconnected);
    return () => {
      socket.off("hostDisconnected", handleHostDisconnected);
    };
  }, []);

  // Xử lý click chuột phải vào tên người chơi
  const handlePlayerRightClick = (e: React.MouseEvent, player: Player) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, player });
  };

  // Xử lý nhường quyền
  const handleTransferHost = () => {
    if (contextMenu?.player && room) {
      socket.emit("transferHost", { roomId: room.id, targetId: contextMenu.player.id });
      setContextMenu(null);
    }
  };

  // Xử lý kick
  const handleKick = () => {
    if (contextMenu?.player && room) {
      socket.emit("kickPlayer", { roomId: room.id, targetId: contextMenu.player.id });
      setContextMenu(null);
    }
  };

  // Xử lý trao quyền sắp xếp vị trí
  const handleGrantPosition = () => {
    if (contextMenu?.player && room) {
      socket.emit("grantPositionEdit", { roomId: room.id, targetId: contextMenu.player.id });
      setContextMenu(null);
    }
  };

  // Xử lý thu lại quyền sắp xếp vị trí
  const handleRevokePosition = () => {
    if (contextMenu?.player && room) {
      socket.emit("revokePositionEdit", { roomId: room.id, targetId: contextMenu.player.id });
      setContextMenu(null);
    }
  };

  // Đóng menu khi click ngoài
  useEffect(() => {
    const closeMenu = () => setContextMenu(null);
    if (contextMenu) {
      window.addEventListener("click", closeMenu);
      return () => window.removeEventListener("click", closeMenu);
    }
  }, [contextMenu]);

  // Lắng nghe bị kick
  useEffect(() => {
    const handleKicked = () => {
      alert("Bạn đã bị chủ phòng kick khỏi phòng!");
      nav("/");
    };
    socket.on("kicked", handleKicked);
    return () => {
      socket.off("kicked", handleKicked);
    };
  }, [nav]);

  if (!room) return <p>Đang tải phòng...</p>;

  const amIHost = socket.id === room.hostId;
  const amIPositionEditor = (room.positionEditors || []).includes(socket.id || "");

  return (
      <div style={{ padding: 20, position: "relative" }}>
        <h1>Phòng: {room.id}</h1>
        <div style={{ display: "flex", gap: 20 }}>
        {/* left: players list */}
        <div style={{ minWidth: 220 }}>
          <h3>Người chơi:</h3>
          <ul>
            {room.players.map((p) => (
              <li
                key={p.id}
                onContextMenu={amIHost && p.id !== room.hostId ? (e) => handlePlayerRightClick(e, p) : undefined}
                style={{ cursor: amIHost && p.id !== room.hostId ? "context-menu" : undefined }}
              >
                {p.name} {p.id === room.hostId && "(Chủ phòng)"} {room.positionEditors?.includes(p.id) && " • (Quyền sắp xếp)"}
              </li>
            ))}
          </ul>

          { (amIHost || amIPositionEditor) && (
            <div style={{ marginTop: 12 }}>
              <button onClick={() => setShowEditor(true)}>Sắp xếp vị trí (Drag & Drop)</button>
            </div>
          )}

          {amIHost && (
            <>
              <div style={{ marginTop: 12 }}>
                <button onClick={() => nav(`/roleselect?roomId=${room.id}`)}>Chọn vai trò</button>
              </div>
              <div style={{ marginTop: 8 }}>
                <button onClick={() => socket.emit("startGame", room.id)}>Bắt đầu trò chơi</button>
              </div>
            </>
          )}
        </div>

        {/* right: visual layout preview */}
        <div style={{ flex: 1 }}>
          <h3>Bố cục (Preview):</h3>
          <div style={{ width: "100%", maxWidth: 600, height: 400, background: "#f0f0f0", borderRadius: 10, position: "relative" }}>
            {/* center marker */}
            <div style={{ position: "absolute", left: "50%", top: "50%", transform: "translate(-50%,-50%)", pointerEvents: "none" }}>
              <div style={{ width: 6, height: 6, borderRadius: 3, background: "#666" }} />
            </div>

            {(room.positions || []).map((pos) => {
              const p = room.players.find(x => x.id === pos.playerId);
if (!p) return null;
              const left = `${pos.x * 100}%`;
              const top = `${pos.y * 100}%`;
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
                  }}
                >
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontWeight: "bold" }}>{p.name || "?"}</div>
                    <div style={{ opacity: 0.6, fontSize: 11 }}>{p.id === socket.id ? "(Bạn)" : ""}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

        {/* Menu chuột phải cho host */}
        {contextMenu && (
          <div
            style={{
              position: "fixed",
              top: contextMenu.y,
              left: contextMenu.x,
              background: "#fff",
              border: "1px solid #ccc",
              borderRadius: 6,
              boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
              zIndex: 1000,
              minWidth: 120,
            }}
          >
            <button style={{ width: "100%", padding: 8, border: "none", background: "none", cursor: "pointer" }} onClick={handleTransferHost}>
              Nhường quyền chủ phòng
            </button>
            <button style={{ width: "100%", padding: 8, border: "none", background: "none", cursor: "pointer", color: "red" }} onClick={handleKick}>
              Kick khỏi phòng
            </button>
            <button style={{ width: "100%", padding: 8, border: "none", background: "none", cursor: "pointer" }} onClick={handleGrantPosition}>
              Trao quyền sắp xếp vị trí
            </button>
            <button style={{ width: "100%", padding: 8, border: "none", background: "none", cursor: "pointer" }} onClick={handleRevokePosition}>
              Thu lại quyền sắp xếp
            </button>

          </div>
        )}

        {showEditor && room && (
          <PositionEditor
            roomId={room.id}
            players={room.players}
            positionsFromServer={room.positions}
            isEditor={socket.id === room.hostId || positionEditors.includes(socket.id || "")}
            onClose={() => setShowEditor(false)}
          />
        )}
    </div>
  );
}
