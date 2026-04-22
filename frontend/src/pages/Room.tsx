import { useEffect, useMemo, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { socket } from "../socket";
import PlayerPositions from "../components/PlayerPositions";
import ConfirmModal from "../components/ConfirmModal";
import GameRulesModal from "../components/GameRulesModal";
import { DEFAULT_ROOM_GAME_RULES, type NightActionRole, type Player, type RoomData } from "../context/RoomContext";
import { useRoomContext } from "../context/RoomContext";

interface PlayerPosition {
  playerId: string;
  x: number;
  y: number;
}

const NIGHT_ACTION_ROLE_ORDER: NightActionRole[] = ["Sói", "Bảo vệ", "Phù thủy", "Thợ săn", "Tiên tri"];
const WOLF_ROLES = new Set(["Sói", "Sói con", "Bán sói"]);

function getAvailableNightActionRoles(selectedRoles?: string[]) {
  const roles = selectedRoles || [];
  const available = new Set<NightActionRole>();

  if (roles.some((role) => WOLF_ROLES.has(role))) {
    available.add("Sói");
  }

  for (const role of NIGHT_ACTION_ROLE_ORDER.slice(1)) {
    if (roles.includes(role)) {
      available.add(role);
    }
  }

  return NIGHT_ACTION_ROLE_ORDER.filter((role) => available.has(role));
}


export default function Room() {
  const { room, setRoom, setRole } = useRoomContext();
  const [pendingKickByDoubleClick, setPendingKickByDoubleClick] = useState<Player | null>(null);
  const [noticeModal, setNoticeModal] = useState<{ title: string; message: string; onConfirm?: () => void } | null>(null);
  const [showRulesModal, setShowRulesModal] = useState(false);
  const [pendingRulesUpdate, setPendingRulesUpdate] = useState<RoomData["gameRules"] | null>(null);
  const [showRulesApplyDecisionModal, setShowRulesApplyDecisionModal] = useState(false);
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
  const location = useLocation();
  const nav = useNavigate();

  const showNotice = (title: string, message: string, onConfirm?: () => void) => {
    setNoticeModal({ title, message, onConfirm });
  };

  // lấy roomId từ URL (?roomId=xxxxx)
  const query = new URLSearchParams(location.search);
  const roomId = query.get("roomId");

  useEffect(() => {
    if (roomId) {
      socket.emit("getRoom", roomId);
      socket.emit("setPlayerViewState", { roomId, view: "room" });
    }
  }, [roomId]);

  useEffect(() => {
    // Khi server gửi cập nhật phòng
    const handleRoom = (data: RoomData) => {
      if (roomId && data?.id !== roomId) return;
      setRoom(data);
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

      // Server cap: tối đa 10 "Dân" trong toàn bộ danh sách role
      const MAX_VILLAGERS = 10;
      const currentRoles = room?.roles ?? [];
      const currentVillagers = currentRoles.filter(r => r === "Dân").length;
      const availableVillagers = Math.max(0, MAX_VILLAGERS - currentVillagers);
      const autoAddCount = Math.min(missingRoles, availableVillagers);
      const stillMissingAfterAuto = Math.max(0, missingRoles - autoAddCount);

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

      // Không thể auto-add thêm dân nữa
      if (autoAddCount <= 0) {
        showNotice(
          "Không thể tự thêm vai trò",
          `Có người chơi mới (${names}) đã vào phòng sau khi bạn đã xác nhận vai trò.\nBạn đang thiếu ${missingRoles} vai trò.\nHệ thống không thể tự thêm "Dân" nữa (tối đa ${MAX_VILLAGERS}).\n\nBạn sẽ được chuyển sang màn hình chọn vai trò để bổ sung tiếp.`,
          () => nav(`/roleselect?roomId=${targetRoomId}`)
        );
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
      showNotice("Thông báo", "Chủ phòng đã rời đi. Bạn có thể chờ chủ phòng quay lại hoặc thoát khỏi phòng.");
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
      socket.emit("kickPlayer", { roomId: room.id, targetId: contextMenu.player.id, source: "room" });
      setContextMenu(null);
    }
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
      showNotice("Bạn đã bị mời khỏi phòng", "Bạn đã bị chủ phòng kick khỏi phòng!", () => nav("/lobby"));
    };
    socket.on("kicked", handleKicked);
    return () => {
      socket.off("kicked", handleKicked);
    };
  }, [nav]);

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
        message: payload?.message || "Chủ phòng đã thiết lập lại luật chơi và khởi động lại ván chơi mới",
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

  if (!room) return <p>Đang tải phòng...</p>;

  const amIHost = socket.id === room.hostId;
  const gameInProgress = !!room.phase && !room.gameOver;
  const hasInGamePlayers = room.players.some((p) => p.inGame === true);
  const hasDisconnectedPlayers = room.players.some((p) => p.connected === false);
  const startGameDisabled = !gameInProgress && (hasInGamePlayers || hasDisconnectedPlayers);
  const startGameTooltip = hasInGamePlayers && hasDisconnectedPlayers
    ? "Trò chơi chỉ có thể bắt đầu ván mới khi tất cả người chơi đã quay về phòng chờ này và những người chơi đang mất kết nối cần kết nối lại hoặc bạn có thể xóa họ khỏi phòng"
    : hasInGamePlayers
      ? "Trò chơi chỉ có thể bắt đầu ván mới khi tất cả người chơi đã quay về phòng chờ này"
      : hasDisconnectedPlayers
        ? "Bạn cần chờ người chơi đang mất kết nối kết nối lại hoặc xóa họ khỏi phòng"
        : undefined;

  const startButtonText = gameInProgress ? "Trở lại trò chơi" : "Bắt đầu trò chơi";
  const startButtonAction = () => {
    if (gameInProgress) {
      socket.emit("returnToCurrentGame", { roomId: room.id });
      nav(`/game?roomId=${room.id}`);
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
          }} onPlayerDoubleClick={handlePlayerDoubleClickKick} />
        </div>
      </div>

        {/* Menu chuột phải cho host */}
        {contextMenu && (
          <div
            style={{
              position: "fixed",
              top: contextMenu.y,
              left: contextMenu.x,
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 6,
              boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
              zIndex: 1000,
              minWidth: 120,
            }}
          >
            <button style={{ width: "100%", padding: 8, border: "none", background: "none", cursor: "pointer" }} onClick={handleTransferHost}>
              Nhường quyền chủ phòng
            </button>
            <button style={{ width: "100%", padding: 8, border: "none", background: "none", cursor: "pointer", color: "var(--danger)" }} onClick={handleKick}>
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

        <GameRulesModal
          open={showRulesModal}
          title="Thiết lập luật chơi cho phòng"
          initialRules={room.pendingGameRules || room.gameRules || DEFAULT_ROOM_GAME_RULES}
          availableNightActionRoles={availableNightActionRoles}
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
