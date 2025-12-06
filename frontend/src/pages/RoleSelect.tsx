import { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { socket } from "../socket";

// Danh sách role của game
const ALL_ROLES = [
  "Sói",
  "Dân",
  "Tiên tri",
  "Bảo vệ",
  "Phù thủy"
];

export default function RoleSelect() {
  const nav = useNavigate();
  const location = useLocation();
  const query = new URLSearchParams(location.search);
  const roomId = query.get("roomId");

  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [playerCount, setPlayerCount] = useState<number>(0);

  // 🟦 Khi mở trang: yêu cầu thông tin phòng
  useEffect(() => {
    if (!roomId) return;

    // Yêu cầu server gửi room hiện tại
    socket.emit("getRoom", roomId);

    // Định nghĩa kiểu dữ liệu cho phòng
    interface Room {
      players: { id: string; name: string }[];
      // Thêm các trường khác nếu cần
    }

    // Lắng nghe cập nhật phòng
    const handleRoom = (room: Room) => {
      setPlayerCount(room.players.length);
    };

    socket.on("roomUpdated", handleRoom);

    return () => {
      socket.off("roomUpdated", handleRoom);
    };
  }, [roomId]);

  // 🟩 Toggle role khi click vào
  const toggleRole = (role: string) => {
    setSelectedRoles(prev =>
      prev.includes(role)
        ? prev.filter(r => r !== role)
        : [...prev, role]
    );
  };

  // 🟦 Khi host nhấn "Xác nhận"
  const handleConfirm = () => {
    if (!roomId) return;

    // Nếu role chọn ít hơn số người → hỏi bổ sung dân làng
    if (selectedRoles.length < playerCount) {
      const missing = playerCount - selectedRoles.length;

      const autoFill = window.confirm(
        `Bạn đang thiếu ${missing} vai trò.\nBạn có muốn tự động thêm ${missing} Dân làng không?`
      );

      if (autoFill) {
        const finalRoles = [...selectedRoles];

        for (let i = 0; i < missing; i++) {
          finalRoles.push("Dân");
        }

        // Gửi roles lên server
        socket.emit("rolesSelected", { roomId, roles: finalRoles });

        nav(`/room?roomId=${roomId}`);
        return;
      } else {
        // Nếu host không muốn autoFill → quay lại chỉnh tiếp
        return;
      }
    }

    // Nếu đủ số role thì gửi luôn
    socket.emit("rolesSelected", { roomId, roles: selectedRoles });
    nav(`/room?roomId=${roomId}`);
  };

  return (
    <div style={{ padding: 20 }}>
      <h1>Chọn Vai Trò Cho Ván Chơi</h1>

      <p>Số người chơi: <b>{playerCount}</b></p>
      <p>Đã chọn: <b>{selectedRoles.length}</b></p>

      {/* Lưới role card */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 15,
          marginTop: 20,
        }}
      >
        {ALL_ROLES.map(role => {
          const isSelected = selectedRoles.includes(role);

          return (
            <div
              key={role}
              onClick={() => toggleRole(role)}
              style={{
                padding: "16px 22px",
                borderRadius: 12,
                cursor: "pointer",
                border: isSelected ? "3px solid #ff9800" : "2px solid #444",
                background: isSelected ? "#ffe9c7" : "#f2f2f2",
                transition: "0.2s",
                fontSize: 18,
                userSelect: "none",
              }}
            >
              {role}
            </div>
          );
        })}
      </div>

      {/* Nút xác nhận */}
      <button
        onClick={handleConfirm}
        style={{
          marginTop: 30,
          padding: "10px 20px",
          fontSize: 18,
          cursor: "pointer",
          borderRadius: 10,
        }}
      >
        Xác nhận vai trò
      </button>
    </div>
  );
}
