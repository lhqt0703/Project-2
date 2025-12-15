import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { socket } from "../socket";
import React from "react";
import PlayerPositions from "../components/PlayerPositions";
import { useRoomContext } from "../context/RoomContext";


interface Player {
  id: string;
  name: string;
  connected?: boolean;
}

interface RoomData {
  id: string;
  players: Player[];
  hostId: string;
  roles?: string[];
  rolesLocked?: boolean;
  lockedPlayerIds?: string[];
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

      const targetRoomId = room?.id ?? roomId;
      if (!targetRoomId) return;

      // Server cap: tối đa 10 "Dân" trong toàn bộ danh sách role
      const MAX_VILLAGERS = 10;
      const currentRoles = room?.roles ?? [];
      const currentVillagers = currentRoles.filter(r => r === "Dân").length;
      const availableVillagers = Math.max(0, MAX_VILLAGERS - currentVillagers);
      const autoAddCount = Math.min(missingRoles, availableVillagers);
      const stillMissingAfterAuto = Math.max(0, missingRoles - autoAddCount);

      // Trường hợp server báo thiếu tiếp sau khi đã auto-add một phần (newPlayers có thể là [])
      if ((newPlayers?.length ?? 0) === 0) {
        alert(
          `Danh sách vai trò vẫn đang thiếu ${missingRoles} vai trò so với số người chơi trong phòng.\n` +
          `Hãy quay lại màn hình chọn vai trò để bổ sung tiếp.`
        );
        nav(`/roleselect?roomId=${targetRoomId}`);
        return;
      }

      const names = newPlayers.map((p: Player) => p.name).join(", ");

      // Không thể auto-add thêm dân nữa
      if (autoAddCount <= 0) {
        alert(
          `Có người chơi mới (${names}) đã vào phòng sau khi bạn đã xác nhận vai trò.\n` +
          `Bạn đang thiếu ${missingRoles} vai trò.\n` +
          `Hệ thống không thể tự thêm "Dân" nữa (tối đa ${MAX_VILLAGERS}).\n\n` +
          `Bạn sẽ được chuyển sang màn hình chọn vai trò để bổ sung tiếp.`
        );
        nav(`/roleselect?roomId=${targetRoomId}`);
        return;
      }

      // Auto-add được nhưng vẫn còn thiếu sau khi thêm tối đa
      if (stillMissingAfterAuto > 0) {
        const ok = window.confirm(
          `Có người chơi mới (${names}) đã vào phòng sau khi bạn đã xác nhận vai trò.\n` +
          `Bạn đang thiếu ${missingRoles} vai trò.\n\n` +
          `Hệ thống có thể tự động thêm ${autoAddCount} vai trò "Dân" (tối đa ${MAX_VILLAGERS}).\n` +
          `Tuy nhiên sau đó vẫn còn thiếu ${stillMissingAfterAuto} vai trò.\n\n` +
          `Bạn có muốn tự thêm ${autoAddCount} "Dân" ngay bây giờ không?\n` +
          `Sau đó bạn sẽ được chuyển sang màn hình chọn vai trò để chọn tiếp.`
        );

        if (ok) {
          socket.emit("addAutoRoles", { roomId: targetRoomId, count: autoAddCount });
          nav(`/roleselect?roomId=${targetRoomId}`);
        } else {
          nav(`/roleselect?roomId=${targetRoomId}`);
        }
        return;
      }

      // Auto-add đủ để hết thiếu
      const ok = window.confirm(
        `Có người chơi mới (${names}) đã vào phòng sau khi bạn đã xác nhận vai trò.\n` +
        `Bạn đang thiếu ${missingRoles} vai trò.\n\n` +
        `Bạn có muốn tự động thêm ${missingRoles} "Dân" không? (tối đa ${MAX_VILLAGERS})`
      );
      if (ok) {
        socket.emit("addAutoRoles", { roomId: targetRoomId, count: missingRoles });
      } else {
        nav(`/roleselect?roomId=${targetRoomId}`);
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
          <h3>Bố cục:</h3>
          <PlayerPositions onPlayerClick={() => {
             // Handle click if needed, e.g. show profile or context menu
             // Currently context menu is handled by onContextMenu on the list, 
             // but we might want it here too. For now, just log or ignore.
          }} />
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
    </div>
  );
}
