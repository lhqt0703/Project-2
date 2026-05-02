import { useState, useEffect, useMemo, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { socket } from "../socket";
import ConfirmModal from "../components/ConfirmModal";
import { ELEMENTAL_ROLE_ORDER } from "../constants/elemental";

const NON_VILLAGER_ROLES = ["Dân làng", "Sói", "Bán sói", "Sói con", "Linh sói", "Kẻ bị nguyền", "Tiên tri", "Bảo vệ", "Phù thủy", "Thợ săn"] as const;
type NonVillagerRole = (typeof NON_VILLAGER_ROLES)[number];

export default function RoleSelect() {
  const nav = useNavigate();
  const location = useLocation();
  const query = new URLSearchParams(location.search);
  const roomId = query.get("roomId");

  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [selectedElementalRoles, setSelectedElementalRoles] = useState<Record<string, boolean>>(
    () => Object.fromEntries(ELEMENTAL_ROLE_ORDER.map((role) => [role, false]))
  );
  const [playerCount, setPlayerCount] = useState<number>(0);
  const [roomSnapshot, setRoomSnapshot] = useState<{
    hostId: string;
    players: { id: string; name: string }[];
    roles?: string[];
    phase?: string;
    gameOver?: boolean;
  } | null>(null);
  const [pendingRolesApply, setPendingRolesApply] = useState<string[] | null>(null);
  const didInitFromServer = useRef(false);

  const elementalCount = useMemo(
    () => Object.values(selectedElementalRoles).filter(Boolean).length,
    [selectedElementalRoles]
  );
  const totalSelected = selectedRoles.length + elementalCount;

  useEffect(() => {
    if (!roomId) return;
    socket.emit("getRoom", roomId);

    interface Room {
      hostId: string;
      players: { id: string; name: string }[];
      roles?: string[];
    }

    const handleRoom = (room: Room) => {
      setRoomSnapshot(room);
      setPlayerCount(room.players.filter((p) => p.id !== room.hostId).length);

      if (!didInitFromServer.current) {
        const roles = room.roles ?? [];
        const elementalRoleSet = new Set(ELEMENTAL_ROLE_ORDER);
        const nextElemental = Object.fromEntries(
          ELEMENTAL_ROLE_ORDER.map((role) => [role, roles.includes(role)])
        );
        const nonElemental = roles.filter((role) => !elementalRoleSet.has(role as any));

        setSelectedRoles(nonElemental);
        setSelectedElementalRoles(nextElemental);
        didInitFromServer.current = true;
      }
    };

    socket.on("roomUpdated", handleRoom);
    return () => {
      socket.off("roomUpdated", handleRoom);
    };
  }, [roomId]);

  useEffect(() => {
    interface WolfRoleMismatchData {
      currentWolfCount: number;
      maxAllowedWolfCount: number;
      playerCount: number;
    }

    const handleGameStarted = (payload?: {
      hostRestartCinematic?: {
        roomId?: string;
        message?: string;
        fadeInMs?: number;
        holdMs?: number;
        fadeOutMs?: number;
      };
    }) => {
      if (!roomId) return;
      const cinematic = payload?.hostRestartCinematic;
      if (cinematic) {
        sessionStorage.setItem(`hostRestartCinematic:${roomId}`, JSON.stringify(cinematic));
      }
      nav(`/game?roomId=${roomId}`);
    };

    const handleWolfMismatch = (data: WolfRoleMismatchData) => {
      if (!roomId) return;

      const ok = window.confirm(
        `Danh sách vai trò hiện tại có ${data.currentWolfCount} sói, vượt quá mức tối đa ${data.maxAllowedWolfCount} cho phòng ${data.playerCount} người.\n\n` +
        `Hệ thống sẽ tự giảm bớt số lượng sói để tránh phe sói thắng ngay khi bắt đầu.\n` +
        `Nhấn OK để hệ thống tự điều chỉnh và tiếp tục khởi tạo ván chơi mới.\n` +
        `Nhấn Hủy để ở lại màn hình chọn vai trò.`
      );

      if (!ok) {
        return;
      }

      const rolesToUse = buildFinalRoles();
      socket.emit("rolesSelected", {
        roomId,
        roles: rolesToUse,
        applyMode: "restart-now",
        forceAdjustWolfCount: true,
      });
    };

    const handleRolesReady = () => {
      if (!roomId) return;
      nav(`/room?roomId=${roomId}`);
    };

    socket.on("gameStarted", handleGameStarted);
    socket.on("wolfRoleMismatch", handleWolfMismatch);
    socket.on("rolesReady", handleRolesReady);

    return () => {
      socket.off("gameStarted", handleGameStarted);
      socket.off("wolfRoleMismatch", handleWolfMismatch);
      socket.off("rolesReady", handleRolesReady);
    };
  }, [nav, roomId, selectedRoles, selectedElementalRoles]);

  const removeOne = (arr: string[], role: string) => {
    const idx = arr.indexOf(role);
    if (idx === -1) return arr;
    return [...arr.slice(0, idx), ...arr.slice(idx + 1)];
  };

  const toggleRole = (role: NonVillagerRole) => {
    setSelectedRoles((prev) => {
      if (role === "Sói" || role === "Dân làng") {
        const count = prev.filter((r) => r === role).length;
        return count > 0 ? removeOne(prev, role) : [...prev, role];
      }
      return prev.includes(role) ? removeOne(prev, role) : [...prev, role];
    });
  };

  const toggleElementalRole = (role: string) => {
    setSelectedElementalRoles((prev) => ({ ...prev, [role]: !prev[role] }));
  };

  const buildFinalRoles = () => {
    const elementalRoles = ELEMENTAL_ROLE_ORDER.filter((role) => selectedElementalRoles[role]);
    return [...selectedRoles, ...elementalRoles];
  };

  const handleConfirm = () => {
    if (!roomId) return;

    const currentRoles = buildFinalRoles();
    const gameInProgress = !!roomSnapshot?.phase && !roomSnapshot.gameOver;

    if (currentRoles.length < playerCount) {
      alert(`Bạn đang thiếu ${playerCount - currentRoles.length} vai trò. Hãy chọn thêm vai trò trước khi xác nhận.`);
      return;
    }

    if (gameInProgress) {
      setPendingRolesApply(currentRoles);
      return;
    }

    socket.emit("rolesSelected", { roomId, roles: currentRoles });
  };

  return (
    <div className="page-shell roleselect-page" style={{ padding: 20 }}>
      <h1>Chọn Vai Trò Cho Ván Chơi</h1>

      <p>Số người chơi: <b>{playerCount}</b></p>
      <p>Đã chọn: <b>{totalSelected}</b></p>

      <div className="roleselect-grid">
        {(() => {
          const count = selectedRoles.filter((r) => r === "Dân làng").length;
          return (
            <div
              className="role-card"
              key="Dân làng"
              onClick={() => toggleRole("Dân làng")}
              style={{
                padding: "16px 22px",
                borderRadius: 12,
                cursor: "pointer",
                border: count > 0 ? "3px solid var(--accent)" : "2px solid var(--border-strong)",
                background: count > 0 ? "var(--accent-surface)" : "var(--surface-muted)",
                transition: "0.2s",
                fontSize: 18,
                userSelect: "none",
              }}
            >
              <div>Dân làng {count > 1 ? `x${count}` : ""}</div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedRoles((prev) => [...prev, "Dân làng"]);
                }}
                style={{ marginLeft: 10 }}
              >
                + Dân làng
              </button>
            </div>
          );
        })()}

        {(() => {
          const count = selectedRoles.filter((r) => r === "Sói").length;
          return (
            <div
              className="role-card"
              key="Sói"
              onClick={() => toggleRole("Sói")}
              style={{
                padding: "16px 22px",
                borderRadius: 12,
                cursor: "pointer",
                border: count > 0 ? "3px solid var(--accent)" : "2px solid var(--border-strong)",
                background: count > 0 ? "var(--accent-surface)" : "var(--surface-muted)",
                transition: "0.2s",
                fontSize: 18,
                userSelect: "none",
              }}
            >
              <div>Sói {count > 1 ? `x${count}` : ""}</div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedRoles((prev) => [...prev, "Sói"]);
                }}
                style={{ marginLeft: 10 }}
              >
                + Sói
              </button>
            </div>
          );
        })()}

        {ELEMENTAL_ROLE_ORDER.map((role) => {
          const selected = selectedElementalRoles[role];
          return (
            <div
              className="role-card"
              key={role}
              onClick={() => toggleElementalRole(role)}
              style={{
                padding: "16px 22px",
                borderRadius: 12,
                cursor: "pointer",
                border: selected ? "3px solid #ED6E7B" : "2px solid var(--border-strong)",
                background: selected ? "rgba(237,110,123,0.16)" : "var(--surface-muted)",
                transition: "0.2s",
                fontSize: 18,
                userSelect: "none",
              }}
            >
              <div>{role}</div>
            </div>
          );
        })}

        {(["Bán sói", "Sói con", "Linh sói", "Kẻ bị nguyền", "Tiên tri", "Bảo vệ", "Phù thủy", "Thợ săn"] as const).map((role) => {
          const selected = selectedRoles.includes(role);
          return (
            <div
              className="role-card"
              key={role}
              onClick={() => toggleRole(role)}
              style={{
                padding: "16px 22px",
                borderRadius: 12,
                cursor: "pointer",
                border: selected ? "3px solid var(--accent)" : "2px solid var(--border-strong)",
                background: selected ? "var(--accent-surface)" : "var(--surface-muted)",
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

      <ConfirmModal
        open={!!pendingRolesApply}
        title="Áp dụng danh sách vai trò mới"
        message="Bạn muốn kết thúc trò chơi hiện tại ngay lập tức để áp dụng danh sách vai trò mới hay tiếp tục trò chơi hiện tại và áp dụng danh sách vai trò này vào ván sau?"
        confirmText="Kết thúc trận và áp dụng ngay"
        cancelText="Áp dụng vào ván sau"
        onConfirm={() => {
          if (!roomId || !pendingRolesApply) return;
          socket.emit("rolesSelected", {
            roomId,
            roles: pendingRolesApply,
            applyMode: "restart-now",
          });
          setPendingRolesApply(null);
        }}
        onCancel={() => {
          if (!roomId || !pendingRolesApply) return;
          socket.emit("rolesSelected", {
            roomId,
            roles: pendingRolesApply,
            applyMode: "next-round",
          });
          setPendingRolesApply(null);
          nav(`/room?roomId=${roomId}`);
        }}
      />
    </div>
  );
}
