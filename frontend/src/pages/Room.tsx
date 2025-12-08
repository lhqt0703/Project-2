import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { socket } from "../socket";
import React from "react";

interface Player {
  id: string;
  name: string;
}

interface RoomData {
  id: string;
  players: Player[];
  hostId: string;
}

export default function Room() {
  const [room, setRoom] = useState<RoomData | null>(null);
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

    // Lắng nghe hostChanged để cập nhật hostId realtime
    const handleHostChanged = (newHostId: string) => {
      if (room) {
        setRoom({ ...room, hostId: newHostId });
        localStorage.setItem("hostId", newHostId);
      }
    };
    socket.on("hostChanged", handleHostChanged);

    return () => {
      socket.off("roomCreated", handleRoom);
      socket.off("roomJoined", handleRoom);
      socket.off("roomUpdated", handleRoom);
      socket.off("hostChanged", handleHostChanged);
    };
  }, [room]);

  useEffect(() => {
    const handleYourRole = (role: string) => {
      // lưu role vào state, chuyển sang trang game (kèm roomId)
      localStorage.setItem("role", role); // tạm dùng localStorage
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
  }, [nav, room, roomId]);

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

  return (
    <div style={{ padding: 20, position: "relative" }}>
      <h1>Phòng: {room.id}</h1>
      <h2>Người chơi:</h2>
      <ul>
        {room.players.map((p) => (
          <li
            key={p.id}
            onContextMenu={socket.id === room.hostId && p.id !== room.hostId ? (e) => handlePlayerRightClick(e, p) : undefined}
            style={{ cursor: socket.id === room.hostId && p.id !== room.hostId ? "context-menu" : undefined }}
          >
            {p.name} {p.id === room.hostId && "(Chủ phòng)"}
          </li>
        ))}
      </ul>

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
        </div>
      )}

      {socket.id === room.hostId && (
        <button
          style={{ marginTop: 20 }}
          onClick={() => nav(`/roleselect?roomId=${room.id}`)}
        >
          Chọn vai trò
        </button>
      )}

      {socket.id === room.hostId && (
        <button
          style={{ marginTop: 20 }}
          onClick={() => socket.emit("startGame", room.id)}
        >
          Bắt đầu trò chơi
        </button>
      )}
    </div>
  );
}
