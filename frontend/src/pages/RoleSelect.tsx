import { useState, useEffect, useMemo, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { socket, clientId } from "../socket";
import ConfirmModal from "../components/ConfirmModal";
import { ELEMENTAL_ROLE_ORDER } from "../constants/elemental";
import { getAvatarUrlByFileName, MASKED_AVATAR_MAP } from "../components/PlayerPositions";
import nenLungAsset from "../assets/nền lưng.avif";
import ArrowLeft from "../assets/arrow-left.svg";

const NON_VILLAGER_ROLES = ["Dân làng", "Sói", "Bán sói", "Sói con", "Sói Dại", "Linh sói", "Kẻ bị nguyền", "Tay Buôn", "Thiên Sứ", "Trưởng làng", "Hộ nhân", "Tiên tri", "Bảo vệ", "Phù thủy", "Thợ săn", "Thần tình yêu"] as const;
type NonVillagerRole = (typeof NON_VILLAGER_ROLES)[number];

const SOI_MU_ROLES = ["Dân làng", "Sói", "Bảo vệ", "Phù thủy", "Tiên tri", "Trưởng làng", "Tay Buôn"] as const;

const DIET_QUY_TOWNSFOLK = ["Thợ giặt", "Thủ thư", "Điều tra viên", "Đầu bếp", "Đồng cảm", "Thầy bói", "Chôn cất", "Nhà sư", "Nuôi quạ", "Trinh nữ", "Diệt quỷ", "Chiến sĩ", "Thị trưởng"] as const;
const DIET_QUY_TRAVELERS = ["Người ẩn dật", "Thánh nhân"] as const;
const DIET_QUY_MINIONS = ["Độc thủ", "Gián điệp", "Phò"] as const;
const DIET_QUY_DEMON = ["Ác Quỷ"] as const;

// Glob only .avif character card images
export const CARD_IMAGES = import.meta.glob<string>("../assets/F *.avif", {
  eager: true,
  import: "default",
});

export function getCardUrlByRoleName(roleName: string, gameMode?: string): string | null {
  if (!roleName) return null;
  let cleanName = roleName.trim();
  if (cleanName === "Sấm Sét") cleanName = "Sét";
  if (cleanName === "Băng Giá") cleanName = "Băng";
  if (gameMode === "soi_mu" && cleanName === "Tay Buôn") {
    cleanName = "Tay Buôn ari";
  }

  const entry = Object.entries(CARD_IMAGES).find(([path]) => {
    const lowerPath = path.normalize("NFC").toLowerCase();
    const targetAvif = `/f ${cleanName.normalize("NFC").toLowerCase()}.avif`;
    return lowerPath.endsWith(targetAvif);
  });
  return entry ? entry[1] : null;
}

const getGlowColor = (role: string) => {
  if (DIET_QUY_TOWNSFOLK.includes(role as any)) return "#34d399";
  if (DIET_QUY_TRAVELERS.includes(role as any)) return "#60a5fa";
  if (DIET_QUY_MINIONS.includes(role as any)) return "#fb923c";
  if (DIET_QUY_DEMON.includes(role as any)) return "#f87171";

  if (["Sói", "Sói con", "Sói Dại", "Linh sói", "Bán sói"].includes(role)) return "#ef4444";
  if (ELEMENTAL_ROLE_ORDER.includes(role as any)) return "#ED6E7B";
  if (["Tiên tri", "Thợ săn"].includes(role)) return "#60a5fa";
  if (["Bảo vệ", "Phù thủy", "Hộ nhân", "Trưởng làng"].includes(role)) return "#34d399";
  if (["Kẻ bị nguyền", "Thiên Sứ", "Thần tình yêu", "Tay Buôn"].includes(role)) return "#a855f7";
  return "#ff9800"; // fallback gold glow
};

interface PlayerInfo {
  id: string;
  name: string;
  playerAvatar?: string;
}

const MiniToken = ({ playerId, players }: { playerId: string; players: PlayerInfo[] }) => {
  const p = players.find((x) => x.id === playerId);
  if (!p) return null;

  let avatarUrl: string | undefined = undefined;
  let maskedAvatarUrl: string | undefined = undefined;

  if (p.playerAvatar) {
    const customUrl = getAvatarUrlByFileName(p.playerAvatar);
    if (customUrl) {
      if (p.playerAvatar.trim().toUpperCase().startsWith("M ")) {
        maskedAvatarUrl = customUrl;
      } else {
        avatarUrl = customUrl;
      }
    }
  }

  if (!avatarUrl && !maskedAvatarUrl) {
    maskedAvatarUrl = MASKED_AVATAR_MAP[playerId];
    if (playerId.startsWith("dev-")) {
      const parts = playerId.split("-");
      const lastPart = parts[parts.length - 1];
      const idx = parseInt(lastPart, 10);
      if (!isNaN(idx) && idx >= 1 && idx <= 7) {
        const VIP_IDS = [
          "046fa88a-a719-47c3-8b97-ddfc8337cf83",
          "f7d9652f-ac74-4557-81a2-7c2731a77d37",
          "397d9740-e21b-4ade-941f-25912aefd591",
          "client_1780242307126_pmozg54dmra",
          "8dfc1d63-988f-460d-8569-8a1964be99a0",
          "ec0c6c66-9ce7-4d86-ac12-25824af15b79",
          "9bc9009c-13b3-4ba6-bbdd-a7189b477ccd"
        ];
        const vipId = VIP_IDS[idx - 1];
        if (!maskedAvatarUrl) maskedAvatarUrl = MASKED_AVATAR_MAP[vipId];
      }
    }
  }

  return (
    <div
      title={p.name}
      style={{
        width: 24,
        height: 24,
        borderRadius: "50%",
        backgroundImage: maskedAvatarUrl 
          ? `url(${nenLungAsset})` 
          : (avatarUrl ? `url(${avatarUrl})` : undefined),
        backgroundPosition: "center",
        backgroundSize: "cover",
        backgroundRepeat: "no-repeat",
        position: "relative",
        border: "1px solid rgba(255, 255, 255, 0.45)",
        boxShadow: "0 1px 3px rgba(0,0,0,0.5)",
        overflow: maskedAvatarUrl ? "visible" : "hidden",
        flexShrink: 0
      }}
    >
      {maskedAvatarUrl && (
        <>
          <div style={{ position: "absolute", inset: 0, borderRadius: "50%", overflow: "hidden" }}>
            <img
              src={maskedAvatarUrl}
              alt=""
              style={{
                position: "absolute",
                bottom: 0,
                left: "50%",
                transform: "translateX(-50%)",
                width: "115%",
                height: "115%",
                objectFit: "contain",
                objectPosition: "bottom center",
              }}
            />
          </div>
          <img
            src={maskedAvatarUrl}
            alt=""
            style={{
              position: "absolute",
              bottom: 0,
              left: "50%",
              transform: "translateX(-50%)",
              width: "115%",
              height: "115%",
              objectFit: "contain",
              objectPosition: "bottom center",
              clipPath: "inset(0 0 20% 0)",
            }}
          />
        </>
      )}
    </div>
  );
};

export default function RoleSelect() {
  const nav = useNavigate();
  const location = useLocation();
  const query = new URLSearchParams(location.search);
  const roomId = query.get("roomId");

  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [selectedElementalRoles, setSelectedElementalRoles] = useState<Record<string, boolean>>(
    () => Object.fromEntries(ELEMENTAL_ROLE_ORDER.map((role) => [role, false]))
  );
  const [roomSnapshot, setRoomSnapshot] = useState<{
    hostId: string;
    players: PlayerInfo[];
    roles?: string[];
    phase?: string;
    gameOver?: boolean;
    gameMode?: "da_nghich" | "diet_quy" | "soi_mu";
    roleVotes?: Record<string, string[]>;
  } | null>(null);
  const [pendingRolesApply, setPendingRolesApply] = useState<string[] | null>(null);
  const didInitFromServer = useRef(false);

  const amIHost = roomSnapshot?.hostId === clientId;
  const isDietQuy = roomSnapshot?.gameMode === "diet_quy";

  const playerCount = useMemo(() => {
    if (!roomSnapshot) return 0;
    return roomSnapshot.players.filter((p) => p.id !== roomSnapshot.hostId).length;
  }, [roomSnapshot]);

  const elementalCount = useMemo(
    () => Object.values(selectedElementalRoles).filter(Boolean).length,
    [selectedElementalRoles]
  );
  const totalSelected = isDietQuy ? selectedRoles.length : selectedRoles.length + elementalCount;

  useEffect(() => {
    if (!roomId) return;
    socket.emit("getRoom", roomId);

    interface Room {
      id?: string;
      hostId: string;
      players: PlayerInfo[];
      roles?: string[];
      gameMode?: "da_nghich" | "diet_quy" | "soi_mu";
      roleVotes?: Record<string, string[]>;
    }

    const handleRoom = (room: Room) => {
      if (roomId && room.id && room.id !== roomId) return;
      setRoomSnapshot(room);

      if (!didInitFromServer.current) {
        const roles = room.roles ?? [];
        if (room.gameMode === "diet_quy") {
          setSelectedRoles(roles);
        } else {
          const elementalRoleSet = new Set(ELEMENTAL_ROLE_ORDER);
          const nextElemental = Object.fromEntries(
            ELEMENTAL_ROLE_ORDER.map((role) => [role, roles.includes(role)])
          );
          const nonElemental = roles.filter((role) => !elementalRoleSet.has(role as any));

          setSelectedRoles(nonElemental);
          setSelectedElementalRoles(nextElemental);
        }
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
        `Danh sách vai trò hiện tại có ${data.currentWolfCount} sói/quỷ, vượt quá mức tối đa ${data.maxAllowedWolfCount} cho phòng ${data.playerCount} người.\n\n` +
        `Hệ thống sẽ tự giảm bớt số lượng sói/quỷ để tránh phe ác thắng ngay khi bắt đầu.\n` +
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
      // Do not redirect, let the user return manually.
    };

    socket.on("gameStarted", handleGameStarted);
    socket.on("wolfRoleMismatch", handleWolfMismatch);
    socket.on("rolesReady", handleRolesReady);

    return () => {
      socket.off("gameStarted", handleGameStarted);
      socket.off("wolfRoleMismatch", handleWolfMismatch);
      socket.off("rolesReady", handleRolesReady);
    };
  }, [nav, roomId, selectedRoles, selectedElementalRoles, isDietQuy]);

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
    if (isDietQuy) return selectedRoles;
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

  const handleVoteRole = (role: string) => {
    if (!roomId || !roomSnapshot) return;
    const voterIds = roomSnapshot.roleVotes?.[role] || [];
    const isVoted = voterIds.includes(clientId);
    socket.emit("voteRole", { roomId, role, voted: !isVoted });
  };

  const renderRoleCard = (role: string) => {
    const isCountable = role === "Dân làng" || role === "Sói";
    const count = selectedRoles.filter((r) => r === role).length;

    const isSelected = amIHost
      ? (isCountable ? count > 0 : (selectedElementalRoles[role] || selectedRoles.includes(role)))
      : (roomSnapshot?.roles?.includes(role) ?? false);

    const voterIds = roomSnapshot?.roleVotes?.[role] || [];
    const votersWithAvatar = voterIds.filter((pid) => {
      const p = roomSnapshot?.players.find((x) => x.id === pid);
      return !!p?.playerAvatar;
    });
    const hasVotes = voterIds.length > 0;
    const glowColor = getGlowColor(role);
    const cardImgUrl = getCardUrlByRoleName(role, roomSnapshot?.gameMode);
    const myVote = voterIds.includes(clientId);

    const handleCardClick = () => {
      if (!amIHost) {
        if (isSelected) return; // Locked by host selection
        handleVoteRole(role);
      } else {
        if (isCountable) {
          if (count > 0) {
            setSelectedRoles((prev) => prev.filter((r) => r !== role));
          } else {
            setSelectedRoles((prev) => [...prev, role]);
          }
        } else if (ELEMENTAL_ROLE_ORDER.includes(role as any)) {
          toggleElementalRole(role);
        } else {
          toggleRole(role as any);
        }
      }
    };

    return (
      <div
        className={`role-card-premium ${isSelected ? "host-selected" : ""}`}
        key={role}
        onClick={handleCardClick}
        style={{
          "--glow-color": glowColor,
          border: isSelected ? `2.5px solid ${glowColor}` : (myVote ? "2px solid rgba(255, 255, 255, 0.6)" : undefined),
          cursor: isSelected && !amIHost ? "not-allowed" : "pointer"
        } as React.CSSProperties}
      >
        {cardImgUrl ? (
          <img src={cardImgUrl} alt={role} className="card-image" />
        ) : (
          <div className="card-image" style={{ background: "rgba(255, 255, 255, 0.05)", display: "grid", placeItems: "center" }}>
            <span style={{ fontSize: 48, opacity: 0.15 }}>🃏</span>
          </div>
        )}

        <div className="card-gradient-overlay" />

        <div className="role-name-banner" title={role}>
          {roomSnapshot?.gameMode === "soi_mu" && role === "Tay Buôn" ? "Ariana" : role} {isCountable && isSelected && amIHost && `x${count}`}
        </div>

        {!isSelected && hasVotes && (
          <div className="vote-badge">
            {voterIds.length}/{playerCount}
          </div>
        )}

        {!isSelected && hasVotes && (
          <div className="voters-container">
            {votersWithAvatar.map((pid) => (
              <MiniToken key={pid} playerId={pid} players={roomSnapshot?.players || []} />
            ))}
          </div>
        )}

        {amIHost && isCountable && isSelected && (
          <div 
            style={{ 
              display: "flex", 
              gap: 8, 
              alignItems: "center", 
              justifyContent: "center", 
              position: "absolute", 
              bottom: 8, 
              left: 8, 
              right: 8, 
              zIndex: 4 
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => {
                setSelectedRoles((prev) => removeOne(prev, role));
              }}
              style={{ 
                padding: "2px 6px", 
                fontSize: 12, 
                background: "rgba(0,0,0,0.7)", 
                color: "#fff", 
                border: "1px solid rgba(255,255,255,0.3)",
                borderRadius: "4px",
                cursor: "pointer"
              }}
            >
              -
            </button>
            <span style={{ fontWeight: "bold", textShadow: "0 1px 3px #000", fontSize: 13, color: "#fff" }}>{count}</span>
            <button
              onClick={() => {
                setSelectedRoles((prev) => [...prev, role]);
              }}
              style={{ 
                padding: "2px 6px", 
                fontSize: 12, 
                background: "rgba(0,0,0,0.7)", 
                color: "#fff", 
                border: "1px solid rgba(255,255,255,0.3)",
                borderRadius: "4px",
                cursor: "pointer"
              }}
            >
              +
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="page-shell roleselect-page" style={{ padding: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
        <button
          onClick={() => nav(`/room?roomId=${roomId}`)}
          aria-label="Quay về phòng chờ"
          title="Quay về phòng chờ"
          style={{
            border: "none",
            background: "transparent",
            padding: 0,
            width: 28,
            height: 28,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "left",
            cursor: "pointer",
          }}
        >
          <img src={ArrowLeft} alt="Quay về phòng chờ" style={{ width: 22, height: 22, display: "block" }} />
        </button>
        <h1 style={{ margin: 0, fontSize: "1.5rem", lineHeight: 1, display: "contents" }}>Chọn Vai Trò Cho Ván Chơi</h1>
      </div>

      <p>Số người chơi: <b>{playerCount}</b></p>
      {amIHost && <p>Đã chọn: <b>{totalSelected}</b></p>}

      {isDietQuy ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div>
            <h2 style={{ color: "#34d399", margin: "10px 0" }}>Phe Dân Làng (Townsfolk)</h2>
            <div className="roleselect-grid">
              {DIET_QUY_TOWNSFOLK.map((role) => renderRoleCard(role))}
            </div>
          </div>
          <div>
            <h2 style={{ color: "#60a5fa", margin: "10px 0" }}>Phe Lữ Khách (Travelers)</h2>
            <div className="roleselect-grid">
              {DIET_QUY_TRAVELERS.map((role) => renderRoleCard(role))}
            </div>
          </div>
          <div>
            <h2 style={{ color: "#fb923c", margin: "10px 0" }}>Phe Tay Sai (Minions)</h2>
            <div className="roleselect-grid">
              {DIET_QUY_MINIONS.map((role) => renderRoleCard(role))}
            </div>
          </div>
          <div>
            <h2 style={{ color: "#f87171", margin: "10px 0" }}>Phe Quỷ (Demons)</h2>
            <div className="roleselect-grid">
              {DIET_QUY_DEMON.map((role) => renderRoleCard(role))}
            </div>
          </div>
        </div>
      ) : roomSnapshot?.gameMode === "soi_mu" ? (
        <div className="roleselect-grid">
          {SOI_MU_ROLES.map((role) => renderRoleCard(role))}
        </div>
      ) : (
        <div className="roleselect-grid">
          {(["Tiên tri", "Bảo vệ", "Phù thủy", "Thợ săn", "Trưởng làng", "Hộ nhân", "Kẻ bị nguyền", "Thần tình yêu"] as const).map((role) => renderRoleCard(role))}
          {(["Bán sói", "Linh sói", "Tay Buôn", "Thiên Sứ"] as const).map((role) => renderRoleCard(role))}
          {(["Sói", "Sói con", "Sói Dại"] as const).map((role) => renderRoleCard(role))}
          {ELEMENTAL_ROLE_ORDER.map((role) => renderRoleCard(role))}
          {renderRoleCard("Dân làng")}
        </div>
      )}

      {amIHost && (
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
      )}

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
        }}
      />
    </div>
  );
}
