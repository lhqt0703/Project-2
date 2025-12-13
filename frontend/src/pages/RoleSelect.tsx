import { useState, useEffect, useMemo, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { socket } from "../socket";

const MAX_VILLAGERS = 10;
const NON_VILLAGER_ROLES = ["Sói", "Tiên tri", "Bảo vệ", "Phù thủy"] as const;
type NonVillagerRole = (typeof NON_VILLAGER_ROLES)[number];

export default function RoleSelect() {
  const nav = useNavigate();
  const location = useLocation();
  const query = new URLSearchParams(location.search);
  const roomId = query.get("roomId");

  // Non-villager roles (can include duplicates for "Sói")
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  // 10 separate villager slots
  const [villagerSlots, setVillagerSlots] = useState<boolean[]>(Array(MAX_VILLAGERS).fill(false));
  const [playerCount, setPlayerCount] = useState<number>(0);
  const didInitFromServer = useRef(false);

  const villagerCount = useMemo(
    () => villagerSlots.reduce((acc, v) => acc + (v ? 1 : 0), 0),
    [villagerSlots]
  );
  const totalSelected = selectedRoles.length + villagerCount;

  // 🟦 Khi mở trang: yêu cầu thông tin phòng
  useEffect(() => {
    if (!roomId) return;

    // Yêu cầu server gửi room hiện tại
    socket.emit("getRoom", roomId);

    // Định nghĩa kiểu dữ liệu cho phòng
    interface Room {
      players: { id: string; name: string }[];
      roles?: string[];
    }

    const handleRoom = (room: Room) => {
      setPlayerCount(room.players.length);

      // Prefill previous selection when entering RoleSelect again
      if (!didInitFromServer.current) {
        const roles = room.roles ?? [];
        const villagers = Math.min(
          MAX_VILLAGERS,
          roles.filter(r => r === "Dân").length
        );
        const nonVillagers = roles.filter(r => r !== "Dân");

        setSelectedRoles(nonVillagers);
        setVillagerSlots(Array.from({ length: MAX_VILLAGERS }, (_, i) => i < villagers));
        didInitFromServer.current = true;
      }
    };

    socket.on("roomUpdated", handleRoom);

    return () => {
      socket.off("roomUpdated", handleRoom);
    };
  }, [roomId]);

  const removeOne = (arr: string[], role: string) => {
    const idx = arr.indexOf(role);
    if (idx === -1) return arr;
    return [...arr.slice(0, idx), ...arr.slice(idx + 1)];
  };

  // Toggle for non-villager roles
  const toggleRole = (role: NonVillagerRole) => {
    setSelectedRoles(prev => {
      if (role === "Sói") {
        // Toggle add/remove ONE wolf
        const count = prev.filter(r => r === "Sói").length;
        return count > 0 ? removeOne(prev, "Sói") : [...prev, "Sói"];
      }

      // Single-instance roles
      return prev.includes(role) ? removeOne(prev, role) : [...prev, role];
    });
  };

  const toggleVillagerSlot = (index: number) => {
    setVillagerSlots(prev => prev.map((v, i) => (i === index ? !v : v)));
  };

  const buildFinalRoles = () => {
    const villagers = Math.min(MAX_VILLAGERS, villagerCount);
    return [...selectedRoles, ...Array.from({ length: villagers }, () => "Dân")];
  };

  const autoFillVillagersInState = (count: number) => {
    if (count <= 0) return;
    setVillagerSlots(prev => {
      const next = [...prev];
      let left = count;
      for (let i = 0; i < next.length && left > 0; i++) {
        if (!next[i]) {
          next[i] = true;
          left--;
        }
      }
      return next;
    });
  };

  // 🟦 Khi host nhấn "Xác nhận"
  const handleConfirm = () => {
    if (!roomId) return;

    const currentRoles = buildFinalRoles();

    // Nếu role chọn ít hơn số người → hỏi bổ sung dân làng
    if (currentRoles.length < playerCount) {
      const missing = playerCount - currentRoles.length;
      const availableVillagers = Math.max(0, MAX_VILLAGERS - villagerCount);
      const autoAddCount = Math.min(missing, availableVillagers);
      const stillMissingAfterAuto = Math.max(0, missing - autoAddCount);

      if (autoAddCount <= 0) {
        alert(
          `Bạn đang thiếu ${missing} vai trò.\n` +
          `Không thể tự thêm "Dân" nữa (tối đa ${MAX_VILLAGERS}).\n` +
          `Hãy tự chọn thêm các vai trò còn thiếu.`
        );
        return;
      }

      if (stillMissingAfterAuto > 0) {
        const ok = window.confirm(
          `Bạn đang thiếu ${missing} vai trò.\n\n` +
          `Hệ thống có thể tự thêm ${autoAddCount} vai trò "Dân" (tối đa ${MAX_VILLAGERS}).\n` +
          `Sau đó bạn vẫn còn thiếu ${stillMissingAfterAuto} vai trò và cần chọn thêm.\n\n` +
          `Bạn có muốn tự thêm ${autoAddCount} "Dân" ngay bây giờ không?`
        );
        if (ok) {
          autoFillVillagersInState(autoAddCount);
        }
        return;
      }

      const ok = window.confirm(
        `Bạn đang thiếu ${missing} vai trò.\n` +
        `Bạn có muốn tự động thêm ${missing} "Dân" không? (tối đa ${MAX_VILLAGERS})`
      );
      if (!ok) return;

      const finalRoles = [...currentRoles, ...Array.from({ length: missing }, () => "Dân")].slice(0, playerCount);

      socket.emit("rolesSelected", { roomId, roles: finalRoles });
      nav(`/room?roomId=${roomId}`);
      return;
    }

    // Nếu đủ số role thì gửi luôn
    socket.emit("rolesSelected", { roomId, roles: currentRoles });
    nav(`/room?roomId=${roomId}`);
  };

  return (
    <div style={{ padding: 20 }}>
      <h1>Chọn Vai Trò Cho Ván Chơi</h1>

      <p>Số người chơi: <b>{playerCount}</b></p>
      <p>Đã chọn: <b>{totalSelected}</b></p>

      {/* Lưới role card */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 15,
          marginTop: 20,
        }}
      >
        {/* Sói */}
        {(() => {
          const count = selectedRoles.filter(r => r === "Sói").length;
          return (
            <div
              key="Sói"
              onClick={() => toggleRole("Sói")}
              style={{
                padding: "16px 22px",
                borderRadius: 12,
                cursor: "pointer",
                border: count > 0 ? "3px solid #ff9800" : "2px solid #444",
                background: count > 0 ? "#ffe9c7" : "#f2f2f2",
                transition: "0.2s",
                fontSize: 18,
                userSelect: "none",
              }}
            >
              <div>
                Sói {count > 1 ? `x${count}` : ""}
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedRoles(prev => [...prev, "Sói"]);
                }}
                style={{ marginLeft: 10 }}
              >
                + Sói
              </button>
            </div>
          );
        })()}

        {/* 10 ô Dân */}
        {Array.from({ length: MAX_VILLAGERS }, (_, i) => {
          const selected = villagerSlots[i] === true;
          return (
            <div
              key={`villager-${i}`}
              onClick={() => toggleVillagerSlot(i)}
              style={{
                padding: "16px 22px",
                borderRadius: 12,
                cursor: "pointer",
                border: selected ? "3px solid #ff9800" : "2px solid #444",
                background: selected ? "#ffe9c7" : "#f2f2f2",
                transition: "0.2s",
                fontSize: 18,
                userSelect: "none",
              }}
            >
              <div>Dân {i + 1}</div>
            </div>
          );
        })}

        {/* Các role còn lại */}
        {(["Tiên tri", "Bảo vệ", "Phù thủy"] as const).map((role) => {
          const selected = selectedRoles.includes(role);
          return (
            <div
              key={role}
              onClick={() => toggleRole(role)}
              style={{
                padding: "16px 22px",
                borderRadius: 12,
                cursor: "pointer",
                border: selected ? "3px solid #ff9800" : "2px solid #444",
                background: selected ? "#ffe9c7" : "#f2f2f2",
                transition: "0.2s",
                fontSize: 18,
                userSelect: "none",
              }}
            >
              <div>{role}</div>
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
