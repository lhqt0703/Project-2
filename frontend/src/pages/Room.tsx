import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { socket, clientId } from "../socket";
import PlayerPositions from "../components/PlayerPositions";
import ConfirmModal from "../components/ConfirmModal";
import GameRulesModal from "../components/GameRulesModal";
import ElementalEffectGuideModal from "../components/ElementalEffectGuideModal";
import { DEFAULT_ROOM_GAME_RULES, type NightActionOrderRole, type Player, type RoomData } from "../context/RoomContext";
import { useRoomContext } from "../context/RoomContext";
import {
  ELEMENTAL_BUFFS,
  ELEMENTAL_GROUP_ROLE,
  ELEMENTAL_ROLE_SET,
} from "../constants/elemental";

type NightActionRole = NightActionOrderRole;

interface PlayerPosition {
  playerId: string;
  x: number;
  y: number;
}

const NIGHT_ACTION_ROLE_ORDER: NightActionRole[] = ["Thần tình yêu", "Tay Buôn", ELEMENTAL_GROUP_ROLE, "Sói", "Bảo vệ", "Hộ nhân", "Phù thủy", "Linh sói", "Thợ săn", "Tiên tri", "Kẻ bị nguyền"];
const WOLF_ROLES = new Set(["Sói", "Sói con", "Sói Dại", "Bán sói"]);

function getAvailableNightActionRoles(selectedRoles?: string[]) {
  const roles = selectedRoles || [];
  const available = new Set<NightActionRole>();

  if (roles.some((role) => WOLF_ROLES.has(role))) {
    available.add("Sói");
  }

  for (const role of NIGHT_ACTION_ROLE_ORDER) {
    if (role === ELEMENTAL_GROUP_ROLE && roles.some((item) => ELEMENTAL_ROLE_SET.has(item))) {
      available.add(role);
      continue;
    }
    if (role !== ELEMENTAL_GROUP_ROLE && roles.includes(role)) {
      available.add(role);
    }
  }

  return NIGHT_ACTION_ROLE_ORDER.filter((role) => available.has(role));
}

function isElementalQuickOrder(order: NightActionRole[]) {
  const firstEffectiveRole = order.find((role) => role !== "Thần tình yêu" && role !== "Tay Buôn");
  return firstEffectiveRole === ELEMENTAL_GROUP_ROLE;
}

function formatElementalBuffGuide() {
  const byTier = new Map<number, string[]>();
  for (const buff of ELEMENTAL_BUFFS) {
    byTier.set(buff.tier, [...(byTier.get(buff.tier) || []), buff.label]);
  }

  return Array.from(byTier.entries())
    .sort(([a], [b]) => a - b)
    .map(([tier, buffs]) => `Tier ${tier}\n${buffs.map((buff) => `- ${buff}`).join("\n")}`)
    .join("\n\n");
}

function countRoles(roles?: string[]) {
  const counts = new Map<string, number>();
  for (const role of roles || []) {
    counts.set(role, (counts.get(role) || 0) + 1);
  }
  return counts;
}

export default function Room() {
  const { room, setRoom, setRole } = useRoomContext();
  const [pendingKickByDoubleClick, setPendingKickByDoubleClick] = useState<Player | null>(null);
  const [noticeModal, setNoticeModal] = useState<{ title: string; message: string; onConfirm?: () => void } | null>(null);
  const [showRulesModal, setShowRulesModal] = useState(false);
  const [showCurrentRulesModal, setShowCurrentRulesModal] = useState(false);
  const [showElementalEffectGuide, setShowElementalEffectGuide] = useState(false);
  const [elementalInfoModal, setElementalInfoModal] = useState<{ title: string; message: string } | null>(null);
  const [pendingRulesUpdate, setPendingRulesUpdate] = useState<RoomData["gameRules"] | null>(null);
  const [showRulesApplyDecisionModal, setShowRulesApplyDecisionModal] = useState(false);
  const [leaveConfirmOpen, setLeaveConfirmOpen] = useState(false);
  const [rulesRestartOverlay, setRulesRestartOverlay] = useState<{
    message: string;
    totalMs: number;
    fadeInMs: number;
    holdMs: number;
    fadeOutMs: number;
    key: number;
  } | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    player: Player | null;
  } | null>(null);
  const [roleAssignmentPlayer, setRoleAssignmentPlayer] = useState<Player | null>(null);
  const contextMenuRef = useRef<HTMLDivElement | null>(null);
  const location = useLocation();
  const nav = useNavigate();

  const showNotice = useCallback((title: string, message: string, onConfirm?: () => void) => {
    setNoticeModal({ title, message, onConfirm });
  }, []);

  // lấy roomId từ URL (?roomId=xxxxx)
  const query = new URLSearchParams(location.search);
  const roomId = query.get("roomId");

  useEffect(() => {
    const syncRoomPresence = () => {
      if (!roomId) return;
      socket.emit("getRoom", roomId);
      socket.emit("setPlayerViewState", { roomId, view: "room" });
    };

    syncRoomPresence();
    socket.on("connect", syncRoomPresence);

    return () => {
      socket.off("connect", syncRoomPresence);
    };
  }, [roomId]);

  useEffect(() => {
    // Khi server gửi cập nhật phòng
    const handleRoom = (data: RoomData) => {
      if (roomId && data?.id !== roomId) return;
      setRoom((prev) => {
        const shouldKeepHostOnlyAssignments = data.hostId === clientId;
        const pendingRoleAssignments = shouldKeepHostOnlyAssignments
          ? data.pendingRoleAssignments ?? prev?.pendingRoleAssignments
          : undefined;
        const pendingRoleBlocks = shouldKeepHostOnlyAssignments
          ? data.pendingRoleBlocks ?? prev?.pendingRoleBlocks
          : undefined;

        return {
          ...data,
          ...(pendingRoleAssignments ? { pendingRoleAssignments } : {}),
          ...(pendingRoleBlocks ? { pendingRoleBlocks } : {}),
        };
      });
    };
    const handlePositionsUpdated = (positions: PlayerPosition[]) => {
      setRoom(prev => prev ? { ...prev, positions } : prev);
    };

    const handlePositionEditorsUpdated = (editors: string[]) => {
      setRoom(prev => prev ? { ...prev, positionEditors: editors } : prev);
    };

    const handlePendingRoleAssignmentsUpdated = (assignments: Record<string, string>) => {
      setRoom(prev => prev ? { ...prev, pendingRoleAssignments: assignments || {} } : prev);
    };
    const handlePendingRoleBlocksUpdated = (blocks: Record<string, string[]>) => {
      setRoom(prev => prev ? { ...prev, pendingRoleBlocks: blocks || {} } : prev);
    };

    socket.on("roomCreated", handleRoom);
    socket.on("roomJoined", handleRoom);
    socket.on("roomUpdated", handleRoom);
    socket.on("positionsUpdated", handlePositionsUpdated);
    socket.on("positionEditorsUpdated", handlePositionEditorsUpdated);
    socket.on("pendingRoleAssignmentsUpdated", handlePendingRoleAssignmentsUpdated);
    socket.on("pendingRoleBlocksUpdated", handlePendingRoleBlocksUpdated);


    // Lắng nghe hostChanged để cập nhật hostId realtime
    const handleHostChanged = (newHostId: string) => {
      setRoom(prev => prev ? { ...prev, hostId: newHostId } : prev);
    };
    socket.on("hostChanged", handleHostChanged);

    return () => {
      socket.off("roomCreated", handleRoom);
      socket.off("roomJoined", handleRoom);
      socket.off("roomUpdated", handleRoom);
      socket.off("hostChanged", handleHostChanged);
      socket.off("positionsUpdated", handlePositionsUpdated);
      socket.off("positionEditorsUpdated", handlePositionEditorsUpdated);
      socket.off("pendingRoleAssignmentsUpdated", handlePendingRoleAssignmentsUpdated);
      socket.off("pendingRoleBlocksUpdated", handlePendingRoleBlocksUpdated);
    };
  }, [roomId, setRoom]); // giữ listener ổn định và lọc đúng room theo URL

  useEffect(() => {
    const handleYourRole = (role: string) => {
      // Chỉ lưu role nếu chưa có hoặc khác role hiện tại
      setRole(role);
    };

    const handleGameStarted = (payload?: {
      hostRestartCinematic?: {
        roomId?: string;
        message?: string;
        fadeInMs?: number;
        holdMs?: number;
        fadeOutMs?: number;
      };
    }) => {
      const targetRoomId = room?.id ?? roomId;
      const cinematic = payload?.hostRestartCinematic;
      if (targetRoomId && cinematic) {
        sessionStorage.setItem(`hostRestartCinematic:${targetRoomId}`, JSON.stringify(cinematic));
      }
      if (targetRoomId) {
        nav(`/game?roomId=${targetRoomId}`);
      } else {
        nav("/game");
      }
    };

    socket.on("yourRole", handleYourRole);
    socket.on("gameStarted", handleGameStarted);

    return () => {
      socket.off("yourRole", handleYourRole);
      socket.off("gameStarted", handleGameStarted);
    };
  }, [nav, room?.id, roomId, setRole]);

  useEffect(() => {
    interface RoleMismatchData {
      newPlayers: Player[];
      missingRoles: number;
    }

    const handleMismatch = (data: RoleMismatchData) => {
      const { newPlayers, missingRoles } = data;

      const targetRoomId = room?.id ?? roomId;
      if (!targetRoomId) return;

      // Trường hợp server báo thiếu tiếp sau khi đã auto-add một phần (newPlayers có thể là [])
      if ((newPlayers?.length ?? 0) === 0) {
        showNotice(
          "Thiếu vai trò",
          `Danh sách vai trò vẫn đang thiếu ${missingRoles} vai trò so với số người chơi trong phòng.\nHãy quay lại màn hình chọn vai trò để bổ sung tiếp.`,
          () => nav(`/roleselect?roomId=${targetRoomId}`)
        );
        return;
      }

      const names = newPlayers.map((p: Player) => p.name).join(", ");

      // Auto-add đủ để hết thiếu
      const ok = window.confirm(
        `Có người chơi mới (${names}) đã vào phòng sau khi bạn đã xác nhận vai trò.\n` +
        `Bạn đang thiếu ${missingRoles} vai trò.\n\n` +
        `Bạn có muốn tự động thêm ${missingRoles} "Dân làng" không?`
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
  }, [room, roomId, nav, showNotice]);

  useEffect(() => {
    interface WolfRoleMismatchData {
      currentWolfCount: number;
      maxAllowedWolfCount: number;
      playerCount: number;
    }

    const handleWolfMismatch = (data: WolfRoleMismatchData) => {
      const targetRoomId = room?.id ?? roomId;
      if (!targetRoomId) return;

      const ok = window.confirm(
        `Danh sách vai trò hiện tại có ${data.currentWolfCount} sói, vượt quá mức tối đa ${data.maxAllowedWolfCount} cho phòng ${data.playerCount} người.\n\n` +
        `Hệ thống sẽ tự giảm bớt số lượng sói để tránh phe sói thắng ngay khi bắt đầu.\n` +
        `Nhấn OK để hệ thống tự điều chỉnh và bắt đầu trò chơi.\n` +
        `Nhấn Hủy để quay lại màn hình chọn vai trò.`
      );

      if (ok) {
        socket.emit("startGame", { roomId: targetRoomId, forceAdjustWolfCount: true });
      } else {
        nav(`/roleselect?roomId=${targetRoomId}`);
      }
    };

    socket.on("wolfRoleMismatch", handleWolfMismatch);
    return () => {
      socket.off("wolfRoleMismatch", handleWolfMismatch);
    };
  }, [nav, room, roomId]);

  useEffect(() => {
    // Khi host rời khi game đang diễn ra
    const handleHostDisconnected = () => {
      showNotice("Thông báo", "Quản trò đã rời đi. Bạn có thể chờ quản trò quay lại hoặc thoát khỏi phòng.");
      // Có thể thêm logic cho phép người chơi tự thoát hoặc chờ
    };
    socket.on("hostDisconnected", handleHostDisconnected);
    return () => {
      socket.off("hostDisconnected", handleHostDisconnected);
    };
  }, [showNotice]);

  useEffect(() => {
    const handleErrorMessage = (message: string) => {
      setNoticeModal({
        title: "Thông báo",
        message: message || "Có lỗi xảy ra. Hãy thử lại.",
        onConfirm: message?.includes("Phòng không tồn tại") ? () => nav("/lobby") : undefined,
      });
    };

    socket.on("errorMessage", handleErrorMessage);
    return () => {
      socket.off("errorMessage", handleErrorMessage);
    };
  }, [nav, showNotice]);

  // Xử lý click chuột trái vào tên người chơi
  const handlePlayerLeftClick = (e: React.MouseEvent, player: Player) => {
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, player });
  };

  useEffect(() => {
    if (!contextMenu) return;

    const adjustMenuPosition = () => {
      const menuElement = contextMenuRef.current;
      if (!menuElement) return;

      const VIEWPORT_PADDING = 8;
      const rect = menuElement.getBoundingClientRect();
      let nextX = contextMenu.x;
      let nextY = contextMenu.y;

      if (rect.right > window.innerWidth - VIEWPORT_PADDING) {
        nextX -= rect.right - (window.innerWidth - VIEWPORT_PADDING);
      }
      if (rect.bottom > window.innerHeight - VIEWPORT_PADDING) {
        nextY -= rect.bottom - (window.innerHeight - VIEWPORT_PADDING);
      }
      if (rect.left < VIEWPORT_PADDING) {
        nextX += VIEWPORT_PADDING - rect.left;
      }
      if (rect.top < VIEWPORT_PADDING) {
        nextY += VIEWPORT_PADDING - rect.top;
      }

      if (Math.abs(nextX - contextMenu.x) > 0.5 || Math.abs(nextY - contextMenu.y) > 0.5) {
        setContextMenu((prev) => (prev ? { ...prev, x: Math.round(nextX), y: Math.round(nextY) } : prev));
      }
    };

    const rafId = window.requestAnimationFrame(adjustMenuPosition);
    window.addEventListener("resize", adjustMenuPosition);

    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener("resize", adjustMenuPosition);
    };
  }, [contextMenu]);

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
      socket.emit("kickPlayer", { roomId: room.id, targetId: contextMenu.player.id, source: "room" });
      setContextMenu(null);
    }
  };

  const handleOpenRoleAssignment = () => {
    if (!contextMenu?.player) return;
    setRoleAssignmentPlayer(contextMenu.player);
    setContextMenu(null);
  };

  const handleSetPendingRoleAssignment = (role: string | null) => {
    if (!room || !roleAssignmentPlayer) return;
    socket.emit("setPendingRoleAssignment", {
      roomId: room.id,
      targetId: roleAssignmentPlayer.id,
      role,
    });
    setRoleAssignmentPlayer(null);
  };

  const handleTogglePendingRoleBlock = (role: string, blocked: boolean) => {
    if (!room || !roleAssignmentPlayer) return;
    socket.emit("setPendingRoleBlock", {
      roomId: room.id,
      targetId: roleAssignmentPlayer.id,
      role,
      blocked,
    });
  };

  const handlePlayerDoubleClickKick = (playerId: string) => {
    if (!room) return;
    if (!amIHost) return;
    if (playerId === room.hostId) return;

    const target = room.players.find((p) => p.id === playerId);
    if (!target) return;
    setPendingKickByDoubleClick(target);
  };

  const confirmDoubleClickKick = () => {
    if (!room || !pendingKickByDoubleClick) return;
    socket.emit("kickPlayer", {
      roomId: room.id,
      targetId: pendingKickByDoubleClick.id,
      source: "room",
    });
    setPendingKickByDoubleClick(null);
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
      showNotice("Bạn đã bị mời khỏi phòng", "Bạn đã bị quản trò kick khỏi phòng!", () => nav("/lobby"));
    };
    socket.on("kicked", handleKicked);
    return () => {
      socket.off("kicked", handleKicked);
    };
  }, [nav, showNotice]);

  useEffect(() => {
    const handleRoomClosed = (payload?: { roomId?: string }) => {
      if (payload?.roomId && roomId && payload.roomId !== roomId) return;
      showNotice("Phòng đã đóng", "Quản trò đã đóng phòng. Bạn sẽ được đưa về sảnh chờ.", () => {
        setRoom(null);
        nav("/lobby");
      });
    };
    socket.on("roomClosed", handleRoomClosed);
    return () => {
      socket.off("roomClosed", handleRoomClosed);
    };
  }, [nav, roomId, setRoom, showNotice]);

  useEffect(() => {
    const handleRulesRestartCinematic = (payload: {
      roomId?: string;
      message?: string;
      fadeInMs?: number;
      holdMs?: number;
      fadeOutMs?: number;
    }) => {
      if (!roomId) return;
      if (payload?.roomId && payload.roomId !== roomId) return;

      const fadeInMs = Math.max(0, payload?.fadeInMs ?? 1000);
      const holdMs = Math.max(0, payload?.holdMs ?? 2000);
      const fadeOutMs = Math.max(0, payload?.fadeOutMs ?? 500);
      const totalMs = fadeInMs + holdMs + fadeOutMs;
      const overlayKey = Date.now();

      setRulesRestartOverlay({
        message: payload?.message || "Quản trò đã thiết lập lại luật chơi và khởi động lại ván chơi mới",
        fadeInMs,
        holdMs,
        fadeOutMs,
        totalMs,
        key: overlayKey,
      });

      window.setTimeout(() => {
        setRulesRestartOverlay((prev) => (prev && prev.key === overlayKey ? null : prev));
      }, totalMs + 50);
    };

    socket.on("rulesRestartCinematic", handleRulesRestartCinematic);
    return () => {
      socket.off("rulesRestartCinematic", handleRulesRestartCinematic);
    };
  }, [roomId]);

  const availableNightActionRoles = useMemo(
    () => getAvailableNightActionRoles(room?.roles),
    [room?.roles]
  );

  const roleAssignmentOptions = useMemo(() => {
    if (!room || !roleAssignmentPlayer) return [];

    const roleCounts = countRoles(room.roles);
    const usedByOthers = new Map<string, number>();
    for (const [playerId, role] of Object.entries(room.pendingRoleAssignments || {})) {
      if (playerId === roleAssignmentPlayer.id) continue;
      usedByOthers.set(role, (usedByOthers.get(role) || 0) + 1);
    }

    return Array.from(roleCounts.entries()).map(([role, total]) => {
      const remaining = total - (usedByOthers.get(role) || 0);
      const selected = room.pendingRoleAssignments?.[roleAssignmentPlayer.id] === role;
      const blocked = room.pendingRoleBlocks?.[roleAssignmentPlayer.id]?.includes(role) === true;
      return {
        role,
        total,
        remaining,
        selected,
        blocked,
        disabled: blocked || (remaining <= 0 && !selected),
        blockDisabled: selected,
      };
    });
  }, [room, roleAssignmentPlayer]);

  if (!room) return <p>Đang tải phòng...</p>;

  const amIHost = clientId === room.hostId;
  const gameInProgress = !!room.phase && !room.gameOver;
  const hasInGamePlayers = room.players.some((p) => p.inGame === true);
  const participantCount = room.players.filter((p) => p.id !== room.hostId).length;
  const selectedRoleCount = room.roles?.length ?? 0;
  const hasElementalRole = (room.roles || []).some((role) => ELEMENTAL_ROLE_SET.has(role));
  const hasEnoughRolesToStart = selectedRoleCount >= participantCount && selectedRoleCount > 0;
  const startGameDisabled = !gameInProgress && hasInGamePlayers;
  const startGameTooltip = hasInGamePlayers
    ? "Trò chơi chỉ có thể bắt đầu ván mới khi tất cả người chơi đã quay về phòng chờ này"
    : undefined;

  const startButtonText = gameInProgress ? "Trở lại trò chơi" : "Bắt đầu trò chơi";
  const returnToCurrentGame = () => {
    socket.emit("returnToCurrentGame", { roomId: room.id });
    nav(`/game?roomId=${room.id}`);
  };

  const handleLeaveRoomConfirm = () => {
    if (!room) return;
    setLeaveConfirmOpen(false);
    socket.emit("leaveRoom", { roomId: room.id });
    setRoom(null);
    nav("/lobby");
  };

  const startButtonAction = () => {
    if (gameInProgress) {
      returnToCurrentGame();
      return;
    }
    if (!hasEnoughRolesToStart) {
      const missingRoles = Math.max(0, participantCount - selectedRoleCount);
      showNotice(
        "Chưa chọn vai trò",
        selectedRoleCount <= 0
          ? "Bạn cần chọn vai trò trước khi bắt đầu trò chơi."
          : `Danh sách vai trò đang thiếu ${missingRoles} vai trò. Hãy bổ sung trước khi bắt đầu trò chơi.`,
        () => nav(`/roleselect?roomId=${room.id}`)
      );
      return;
    }
    socket.emit("startGame", room.id);
  };

  const rulesRestartAnimationName = rulesRestartOverlay
    ? `roomRulesRestartOverlay_${rulesRestartOverlay.key}`
    : "";
  const rulesRestartTextAnimationName = rulesRestartOverlay
    ? `roomRulesRestartText_${rulesRestartOverlay.key}`
    : "";

  const leaveConfirmMessage = amIHost
    ? "Bạn có chắc muốn rời phòng? Phòng sẽ bị đóng và tất cả người chơi sẽ được đưa về sảnh chờ"
    : "Bạn có chắc muốn rời phòng và về sảnh chờ không?";

  return (
      <div className="page-shell room-page" style={{ padding: 20, position: "relative" }}>
        <h1>Phòng: {room.id}</h1>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
          {(() => {
            const isQuick = isElementalQuickOrder(room.gameRules?.nightActionOrder || DEFAULT_ROOM_GAME_RULES.nightActionOrder);
            const label = isQuick ? "Hiệu ứng hỗ trợ nhanh 🛼" : "Hiệu ứng hỗ trợ chậm 🕑";
            const tooltip = isQuick
              ? "Khi Dân làng nguyên tố thức đầu tiên trước các vai trò khác (không tính Thần tình yêu/Tay Buôn), buff sẽ có hiệu lực ngay trong đêm chọn buff"
              : "Khi Dân làng nguyên tố thức sau các vai trò khác (không tính Thần tình yêu/Tay Buôn), buff sẽ chỉ có hiệu lực từ đêm tiếp theo";
            return (
              <div
                title={tooltip}
                style={{
                  padding: "8px 12px",
                  borderRadius: 999,
                  border: `1px solid ${isQuick ? "#ED6E7B" : "#8b8f98"}`,
                  background: isQuick ? "rgba(237,110,123,0.14)" : "rgba(139,143,152,0.18)",
                  color: "#fff",
                  fontWeight: 700,
                }}
              >
                {label}
              </div>
            );
          })()}
        </div>
        <div className="room-main-layout">
        {/* left: players list */}

          {!amIHost && (
            <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 8 }}>
              <button
                onClick={() => setShowCurrentRulesModal(true)}
                title="Xem luật hiện tại của phòng"
              >
                Xem luật hiện tại
              </button>
              {hasElementalRole && (
                <>
                  <button
                    onClick={() => setElementalInfoModal({
                      title: "Buff nguyên tố theo tier",
                      message: formatElementalBuffGuide(),
                    })}
                    title="Xem các buff nguyên tố có thể được chọn"
                  >
                    Xem buff nguyên tố
                  </button>
                  <button
                    onClick={() => setShowElementalEffectGuide(true)}
                    title="Xem hậu quả khi dân làng nguyên tố bị giết"
                  >
                    Xem hiệu ứng nguyên tố
                  </button>
                </>
              )}
              {gameInProgress && (
                <button
                  onClick={returnToCurrentGame}
                  title="Trở lại ván đang diễn ra"
                >
                  Trở lại trò chơi
                </button>
              )}
              <button onClick={() => setLeaveConfirmOpen(true)} title="Rời phòng và về sảnh chờ">
                Quay về sảnh chờ
              </button>
            </div>
          )}

          {amIHost && (
            <>
              <div style={{ marginTop: 8 }}>
                <button
                  onClick={() => setShowRulesModal(true)}
                  title="Thiết lập luật chơi"
                >
                  Thiết lập luật chơi
                </button>
              </div>
              <div style={{ marginTop: 8 }}>
                <button onClick={() => nav(`/roleselect?roomId=${room.id}`)}>Chọn vai trò</button>
              </div>
              <div style={{ marginTop: 8 }}>
                <button
                  onClick={startButtonAction}
                  disabled={startGameDisabled}
                  title={gameInProgress ? "Trở lại ván đang diễn ra" : startGameTooltip}
                  style={{ opacity: startGameDisabled ? 0.6 : 1, cursor: startGameDisabled ? "not-allowed" : "pointer" }}
                >
                  {startButtonText}
                </button>
              </div>
              <div style={{ marginTop: 8 }}>
                <button onClick={() => setLeaveConfirmOpen(true)} title="Rời phòng và về sảnh chờ">
                  Quay về sảnh chờ
                </button>
              </div>
            </>
          )}
        </div>

        {/* right: visual layout preview */}
        <div className="room-board-panel">
          <h3>Bố cục:</h3>
          <PlayerPositions onPlayerClick={() => {
             // Handle click if needed, e.g. show profile or context menu
             // Currently context menu is handled by click on the list,
             // but we might want it here too. For now, just log or ignore.
          }} onPlayerDoubleClick={handlePlayerDoubleClickKick} />
        </div>

          
        <div className="room-sidebar">
          <h3>Người chơi:</h3>
          <ul>
            {room.players.map((p) => {
              const pendingRole = amIHost ? room.pendingRoleAssignments?.[p.id] : undefined;
              const blockedRoles = amIHost ? room.pendingRoleBlocks?.[p.id] || [] : [];
              return (
                <li
                  key={p.id}
                  onClick={amIHost && p.id !== room.hostId ? (e) => handlePlayerLeftClick(e, p) : undefined}
                  style={{ cursor: amIHost && p.id !== room.hostId ? "pointer" : undefined }}
                >
                  {p.name} {p.id === room.hostId && "(Quản trò)"} {room.positionEditors?.includes(p.id) && " • (Quyền sắp xếp)"}
                  {pendingRole && (
                    <span style={{ color: "var(--accent)", fontWeight: 700 }}>
                      {" • "}(Phát trước: {pendingRole})
                    </span>
                  )}
                  {blockedRoles.length > 0 && (
                    <span style={{ color: "var(--danger)", fontWeight: 700 }}>
                      {" • "}(Chặn: {blockedRoles.join(", ")})
                    </span>
                  )}
                </li>
              );
            })}
          </ul>

      </div>

        {/* Menu thao tác cho host */}
        {contextMenu && (
          <div
            ref={contextMenuRef}
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "fixed",
              top: contextMenu.y,
              left: contextMenu.x,
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 6,
              boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
              zIndex: 1000,
              minWidth: 190,
            }}
          >
            <button style={{ width: "100%", padding: 8, border: "none", background: "none", cursor: "pointer" }} onClick={handleTransferHost}>
              Nhường quyền chủ phòng
            </button>
            <button style={{ width: "100%", padding: 8, border: "none", background: "none", cursor: "pointer", color: "var(--danger)" }} onClick={handleKick}>
              Kick khỏi phòng
            </button>
            <button style={{ width: "100%", padding: 8, border: "none", background: "none", cursor: "pointer" }} onClick={handleOpenRoleAssignment}>
              Phát trước role
            </button>
            <button style={{ width: "100%", padding: 8, border: "none", background: "none", cursor: "pointer" }} onClick={handleOpenRoleAssignment}>
              Chặn trước role
            </button>
            <button style={{ width: "100%", padding: 8, border: "none", background: "none", cursor: "pointer" }} onClick={handleGrantPosition}>
              Trao quyền sắp xếp vị trí
            </button>
            <button style={{ width: "100%", padding: 8, border: "none", background: "none", cursor: "pointer" }} onClick={handleRevokePosition}>
              Thu lại quyền sắp xếp
            </button>

          </div>
        )}

        {roleAssignmentPlayer && (
          <div
            onClick={() => setRoleAssignmentPlayer(null)}
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 9999,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 20,
              background: "rgba(0,0,0,0.32)",
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                width: "min(92vw, 520px)",
                maxHeight: "82vh",
                overflowY: "auto",
                padding: 24,
                borderRadius: 10,
                border: "1px solid var(--border)",
                background: "var(--surface)",
                boxShadow: "0 12px 32px rgba(0,0,0,0.25)",
              }}
            >
              <h2 style={{ marginTop: 0 }}>Can thiệp role cho {roleAssignmentPlayer.name}</h2>

              {roleAssignmentOptions.length > 0 ? (
                <>
                  <h3 style={{ margin: "16px 0 10px" }}>Phát trước role</h3>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
                    {roleAssignmentOptions.map((option) => (
                      <button
                        key={option.role}
                        onClick={() => handleSetPendingRoleAssignment(option.role)}
                        disabled={option.disabled}
                        title={
                          option.blocked
                            ? "Role này đang bị chặn trước cho người chơi này"
                            : option.disabled
                              ? "Đã hết số lượng role này"
                              : undefined
                        }
                        style={{
                          minHeight: 46,
                          borderColor: option.selected ? "var(--accent)" : "var(--border)",
                          background: option.selected ? "var(--accent-surface)" : "var(--surface-muted)",
                          cursor: option.disabled ? "not-allowed" : "pointer",
                          opacity: option.disabled ? 0.5 : 1,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: 8,
                        }}
                      >
                        <span>{option.role}</span>
                        {option.total > 1 && (
                          <span style={{ fontSize: 12, opacity: 0.72 }}>
                            {option.remaining}/{option.total}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>

                  <h3 style={{ margin: "22px 0 10px" }}>Chặn trước role</h3>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
                    {roleAssignmentOptions.map((option) => (
                      <button
                        key={option.role}
                        onClick={() => handleTogglePendingRoleBlock(option.role, !option.blocked)}
                        disabled={option.blockDisabled}
                        title={option.blockDisabled ? "Role này đang được phát trước cho người chơi này" : undefined}
                        style={{
                          minHeight: 46,
                          borderColor: option.blocked ? "var(--danger)" : "var(--border)",
                          background: option.blocked ? "rgba(211,47,47,0.16)" : "var(--surface-muted)",
                          cursor: option.blockDisabled ? "not-allowed" : "pointer",
                          opacity: option.blockDisabled ? 0.5 : 1,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: 8,
                        }}
                      >
                        <span>{option.role}</span>
                        {option.blocked && <span style={{ fontSize: 12, opacity: 0.78 }}>Đang chặn</span>}
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <p>Chưa có vai trò để can thiệp.</p>
              )}

              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap", marginTop: 20 }}>
                <button
                  onClick={() => handleSetPendingRoleAssignment(null)}
                  disabled={!room.pendingRoleAssignments?.[roleAssignmentPlayer.id]}
                  style={{ opacity: room.pendingRoleAssignments?.[roleAssignmentPlayer.id] ? 1 : 0.55 }}
                >
                  Xóa phát trước
                </button>
                <button onClick={() => setRoleAssignmentPlayer(null)}>Hủy</button>
              </div>
            </div>
          </div>
        )}

        <ConfirmModal
          open={leaveConfirmOpen}
          title="Xác nhận rời phòng"
          message={leaveConfirmMessage}
          confirmText="Rời phòng"
          cancelText="Ở lại"
          onConfirm={handleLeaveRoomConfirm}
          onCancel={() => setLeaveConfirmOpen(false)}
        />

        <ConfirmModal
          open={!!pendingKickByDoubleClick}
          title="Xác nhận xóa người chơi"
          message={
            pendingKickByDoubleClick
              ? ((room?.phase && !room?.gameOver)
                  ? `Bạn có chắc muốn xóa ${pendingKickByDoubleClick.name} khỏi phòng? Trò chơi hiện tại sẽ kết thúc ngay và  tất cả người chơi sẽ được đưa về phòng chờ.`
                  : `Bạn có chắc muốn xóa ${pendingKickByDoubleClick.name} khỏi phòng?`)
              : ""
          }
          confirmText="Xóa"
          cancelText="Hủy"
          onConfirm={confirmDoubleClickKick}
          onCancel={() => setPendingKickByDoubleClick(null)}
        />

        <ConfirmModal
          open={!!noticeModal}
          infoOnly
          title={noticeModal?.title || "Thông báo"}
          message={noticeModal?.message || ""}
          closeText="Đóng"
          onConfirm={() => {
            const action = noticeModal?.onConfirm;
            setNoticeModal(null);
            action?.();
          }}
          onCancel={() => setNoticeModal(null)}
        />

        <ConfirmModal
          open={!!elementalInfoModal}
          infoOnly
          title={elementalInfoModal?.title || "Thông tin nguyên tố"}
          message={elementalInfoModal?.message || ""}
          closeText="Đóng"
          onConfirm={() => setElementalInfoModal(null)}
          onCancel={() => setElementalInfoModal(null)}
        />

        <ElementalEffectGuideModal
          open={showElementalEffectGuide}
          title="Hiệu ứng bất lợi của nguyên tố"
          onClose={() => setShowElementalEffectGuide(false)}
        />

        <GameRulesModal
          open={showRulesModal}
          title="Thiết lập luật chơi cho phòng"
          initialRules={room.pendingGameRules || room.gameRules || DEFAULT_ROOM_GAME_RULES}
          availableNightActionRoles={availableNightActionRoles}
          includedElementalRoles={(room.roles || []).filter((role) => ELEMENTAL_ROLE_SET.has(role))}
          onClose={() => setShowRulesModal(false)}
          onSave={(rules) => {
            if (gameInProgress) {
              setPendingRulesUpdate(rules);
              setShowRulesModal(false);
              setShowRulesApplyDecisionModal(true);
              return;
            }

            socket.emit("updateRoomGameRules", { roomId: room.id, rules });
            setRoom(prev => (prev ? { ...prev, gameRules: rules, pendingGameRules: undefined } : prev));
            setShowRulesModal(false);
          }}
          saveText="Cập nhật"
        />

        <GameRulesModal
          open={showCurrentRulesModal}
          title="Luật hiện tại của phòng"
          initialRules={room.gameRules || DEFAULT_ROOM_GAME_RULES}
          availableNightActionRoles={availableNightActionRoles}
          includedElementalRoles={(room.roles || []).filter((role) => ELEMENTAL_ROLE_SET.has(role))}
          onClose={() => setShowCurrentRulesModal(false)}
          readOnly
        />

        <ConfirmModal
          open={showRulesApplyDecisionModal && !!pendingRulesUpdate}
          title="Áp dụng luật chơi mới"
          message="Bạn muốn kết thúc trò chơi hiện tại ngay lập tức để áp dụng luật chơi mới hay tiếp tục ván hiện tại và áp dụng luật này vào ván sau?"
          confirmText="Kết thúc trận và áp dụng ngay"
          cancelText="Áp dụng vào ván sau"
          onConfirm={() => {
            if (!pendingRulesUpdate) return;
            socket.emit("updateRoomGameRules", {
              roomId: room.id,
              rules: pendingRulesUpdate,
              applyMode: "restart-now",
            });
            setRoom(prev => (prev ? { ...prev, gameRules: pendingRulesUpdate, pendingGameRules: undefined } : prev));
            setPendingRulesUpdate(null);
            setShowRulesApplyDecisionModal(false);
          }}
          onCancel={() => {
            if (!pendingRulesUpdate) return;
            socket.emit("updateRoomGameRules", {
              roomId: room.id,
              rules: pendingRulesUpdate,
              applyMode: "next-round",
            });
            setRoom(prev => (prev ? { ...prev, pendingGameRules: pendingRulesUpdate } : prev));
            setPendingRulesUpdate(null);
            setShowRulesApplyDecisionModal(false);
          }}
        />

        {rulesRestartOverlay && (
          <>
            <style>{`
              @keyframes ${rulesRestartAnimationName} {
                0% { opacity: 0; }
                ${((rulesRestartOverlay.fadeInMs / rulesRestartOverlay.totalMs) * 100).toFixed(4)}% { opacity: 1; }
                ${(((rulesRestartOverlay.fadeInMs + rulesRestartOverlay.holdMs) / rulesRestartOverlay.totalMs) * 100).toFixed(4)}% { opacity: 1; }
                100% { opacity: 0; }
              }

              @keyframes ${rulesRestartTextAnimationName} {
                0% { opacity: 0; }
                ${((rulesRestartOverlay.fadeInMs / rulesRestartOverlay.totalMs) * 100).toFixed(4)}% { opacity: 0; }
                ${((((rulesRestartOverlay.fadeInMs + Math.max(120, Math.min(220, rulesRestartOverlay.holdMs * 0.1))) / rulesRestartOverlay.totalMs)) * 100).toFixed(4)}% { opacity: 1; }
                ${(((rulesRestartOverlay.fadeInMs + rulesRestartOverlay.holdMs) / rulesRestartOverlay.totalMs) * 100).toFixed(4)}% { opacity: 1; }
                100% { opacity: 0; }
              }
            `}</style>

            <div
              style={{
                position: "fixed",
                inset: 0,
                zIndex: 10000,
                background: "#000",
                animation: `${rulesRestartAnimationName} ${rulesRestartOverlay.totalMs}ms linear forwards`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                pointerEvents: "none",
              }}
            >
              <div
                style={{
                  color: "#fff",
                  fontSize: 28,
                  fontWeight: 700,
                  textAlign: "center",
                  maxWidth: 980,
                  padding: "0 24px",
                  animation: `${rulesRestartTextAnimationName} ${rulesRestartOverlay.totalMs}ms linear forwards`,
                }}
              >
                {rulesRestartOverlay.message}
              </div>
            </div>
          </>
        )}
    </div>
  );
}
