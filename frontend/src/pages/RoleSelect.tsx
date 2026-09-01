import { useState, useEffect, useMemo, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { socket, clientId } from "../socket";
import ConfirmModal from "../components/ConfirmModal";
import { ELEMENTAL_ROLE_ORDER } from "../constants/elemental";
import { getAvatarUrlByFileName, MASKED_AVATAR_MAP } from "../components/PlayerPositions";
import nenLungAsset from "../assets/nền lưng.avif";
import ArrowLeft from "../assets/arrow-left.svg";
import coffeeMakerCardAsset from "../assets/C Người pha cà phê.avif";
import linhChiCardAsset from "../assets/C Linh Chi.avif";
import dongTrungCardAsset from "../assets/C Đông Trùng.avif";

const NON_VILLAGER_ROLES = ["Dân làng", "Sói", "Bán sói", "Sói con", "Sói Dại", "Linh sói", "Kẻ bị nguyền", "Tay Buôn", "Thiên Sứ", "Trưởng làng", "Hộ nhân", "Tiên tri", "Bảo vệ", "Phù thủy", "Thợ săn", "Thần tình yêu", "Song Trùng", "Người pha cà phê", "Linh Chi", "Đông Trùng"] as const;
type NonVillagerRole = (typeof NON_VILLAGER_ROLES)[number];

const SOI_MU_ROLES = ["Dân làng", "Sói", "Bảo vệ", "Phù thủy", "Tiên tri", "Trưởng làng", "Tay Buôn", "Thợ săn", "Bác sĩ ung thư", "Nam Thư", "Đàn bà", "Suy Thận"] as const;

// Glob only .avif character card images
export const CARD_IMAGES = import.meta.glob<string>("../assets/F *.avif", {
  eager: true,
  import: "default",
});

const COFFEE_ROLE_CARD_IMAGES: Record<string, string> = {
  "người pha cà phê": coffeeMakerCardAsset,
  "linh chi": linhChiCardAsset,
  "đông trùng": dongTrungCardAsset,
};

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
  return entry ? entry[1] : COFFEE_ROLE_CARD_IMAGES[cleanName.normalize("NFC").toLowerCase()] || null;
}

const getGlowColor = (role: string) => {
  if (["Sói", "Sói con", "Sói Dại", "Linh sói", "Bán sói"].includes(role)) return "#ef4444";
  if (ELEMENTAL_ROLE_ORDER.includes(role as any)) return "#ED6E7B";
  if (["Tiên tri", "Thợ săn"].includes(role)) return "#60a5fa";
  if (["Bảo vệ", "Phù thủy", "Hộ nhân", "Trưởng làng"].includes(role)) return "#34d399";
  if (["Người pha cà phê", "Linh Chi", "Đông Trùng"].includes(role)) return "#34d399";
  if (["Kẻ bị nguyền", "Thiên Sứ", "Thần tình yêu", "Tay Buôn", "Song Trùng"].includes(role)) return "#a855f7";
  return "#ff9800"; // fallback gold glow
};
interface PlayerInfo {
  id: string;
  name: string;
  playerAvatar?: string;
}

const hasAvatar = (p: PlayerInfo) => {
  if (!p) return false;
  if (p.playerAvatar && getAvatarUrlByFileName(p.playerAvatar)) {
    return true;
  }
  if (MASKED_AVATAR_MAP[p.id]) {
    return true;
  }
  if (p.id.startsWith("dev-")) {
    const parts = p.id.split("-");
    const lastPart = parts[parts.length - 1];
    const idx = parseInt(lastPart, 10);
    if (!isNaN(idx) && idx >= 1 && idx <= 7) {
      return true;
    }
  }
  return false;
};

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
          "d64474be-88b2-4f67-bf0d-310c3c9de7f5",
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
    gameMode?: "da_nghich" | "soi_mu";
    gameRules?: { coffeeHerbCardMode?: "primary" | "secondary" };
    pendingGameRules?: { coffeeHerbCardMode?: "primary" | "secondary" };
    roleVotes?: Record<string, string[]>;
  } | null>(null);
  const [pendingRolesApply, setPendingRolesApply] = useState<string[] | null>(null);
  const [infoModal, setInfoModal] = useState<{ title: string; message: string } | null>(null);
  const didInitFromServer = useRef(false);

  const amIHost = roomSnapshot?.hostId === clientId;
  const coffeeHerbCardMode = roomSnapshot?.pendingGameRules?.coffeeHerbCardMode
    ?? roomSnapshot?.gameRules?.coffeeHerbCardMode
    ?? "primary";

  const playerCount = useMemo(() => {
    if (!roomSnapshot) return 0;
    return roomSnapshot.players.filter((p) => p.id !== roomSnapshot.hostId).length;
  }, [roomSnapshot]);

  const elementalCount = useMemo(
    () => Object.values(selectedElementalRoles).filter(Boolean).length,
    [selectedElementalRoles]
  );
  const secondaryHerbCount = coffeeHerbCardMode === "secondary"
    ? selectedRoles.filter((role) => role === "Linh Chi" || role === "Đông Trùng").length
    : 0;
  const totalSelected = selectedRoles.length + elementalCount - secondaryHerbCount;

  useEffect(() => {
    if (!roomId) return;
    socket.emit("getRoom", roomId);

    interface Room {
      id?: string;
      hostId: string;
      players: PlayerInfo[];
      roles?: string[];
      gameMode?: "da_nghich" | "soi_mu";
      gameRules?: { coffeeHerbCardMode?: "primary" | "secondary" };
      pendingGameRules?: { coffeeHerbCardMode?: "primary" | "secondary" };
      roleVotes?: Record<string, string[]>;
    }

    const handleRoom = (room: Room) => {
      if (roomId && room.id && room.id !== roomId) return;
      setRoomSnapshot(room);

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

    const handleRolesReady = () => {
      // Do not redirect, let the user return manually.
    };

    socket.on("gameStarted", handleGameStarted);
    socket.on("rolesReady", handleRolesReady);

    return () => {
      socket.off("gameStarted", handleGameStarted);
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

    const primaryRoleCount = currentRoles.filter((role) => (
      coffeeHerbCardMode !== "secondary"
      || (role !== "Linh Chi" && role !== "Đông Trùng")
    )).length;

    if (primaryRoleCount < playerCount) {
      setInfoModal({
        title: "Thiếu vai trò",
        message: `Bạn đang thiếu ${playerCount - primaryRoleCount} vai trò chính. Hãy chọn thêm vai trò trước khi xác nhận.`,
      });
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
      return p ? hasAvatar(p) : false;
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

      {roomSnapshot?.gameMode === "soi_mu" ? (
        <div className="roleselect-grid">
          {SOI_MU_ROLES.map((role) => renderRoleCard(role))}
        </div>
      ) : (
        <div className="roleselect-grid">
          {(["Tiên tri", "Bảo vệ", "Phù thủy", "Thợ săn", "Trưởng làng", "Hộ nhân", "Kẻ bị nguyền", "Thần tình yêu", "Người pha cà phê", "Linh Chi", "Đông Trùng"] as const).map((role) => renderRoleCard(role))}
          {(["Bán sói", "Linh sói", "Tay Buôn", "Thiên Sứ", "Song Trùng"] as const).map((role) => renderRoleCard(role))}
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

      <ConfirmModal
        open={!!infoModal}
        title={infoModal?.title || "Thông báo"}
        message={infoModal?.message || ""}
        infoOnly
        onConfirm={() => setInfoModal(null)}
        onCancel={() => setInfoModal(null)}
      />
    </div>
  );
}
