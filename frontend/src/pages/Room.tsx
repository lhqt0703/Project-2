import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { socket, clientId } from "../socket";
import PlayerPositions, { AVA_IMAGES, getAvatarUrlByFileName } from "../components/PlayerPositions";
import ConfirmModal from "../components/ConfirmModal";
import { AvatarSelectModal } from "../components/AvatarSelectModal";
import nenLungAsset from "../assets/nền lưng.avif";
import chieuBgAsset from "../assets/nền chiều.avif";
import moonAsset from "../assets/moon.svg";
import leafAsset from "../assets/leaf.svg";
import sunBehindCloudAsset from "../assets/icon/sun-behind-cloud_26c5.avif";
import GameRulesModal from "../components/GameRulesModal";
import ElementalEffectGuideModal from "../components/ElementalEffectGuideModal";
import { DEFAULT_ROOM_GAME_RULES, type NightActionOrderRole, type Player, type RoomData } from "../context/RoomContext";
import { useRoomContext } from "../context/RoomContext";
import ArrowLeft from "../assets/arrow-left.svg";
import UserIcon from "../assets/user.svg";
import RoomBg from "../assets/Nền phòng.avif";
import {
  ELEMENTAL_GROUP_ROLE,
  ELEMENTAL_ROLE_SET,
} from "../constants/elemental";
import { preloadImages } from "../utils/preloadImages";
import { normalizeRoleName, getAssetName } from "../utils/rolePortraitAssets";

const duskRoleCardAssets = Object.values(
  import.meta.glob<string>("../assets/F *.avif", { eager: true, import: "default" })
);

const rolePortraitAvifImages = import.meta.glob<string>("../assets/C *.avif", {
  eager: true,
  import: "default",
});
function getRoomRolePortrait(role: string, _gameMode?: string) {
  if (!role) return null;
  const targetCName = normalizeRoleName(`C ${role}`);

  for (const [path, src] of Object.entries(rolePortraitAvifImages)) {
    if (normalizeRoleName(getAssetName(path)) === targetCName) {
      return src;
    }
  }

  return null;
}




type NightActionRole = NightActionOrderRole;

interface PlayerPosition {
  playerId: string;
  x: number;
  y: number;
}

const NIGHT_ACTION_ROLE_ORDER: NightActionRole[] = ["Thần tình yêu", "Song Trùng", "Người pha cà phê", "Linh Chi", "Đông Trùng", "Tay Buôn", ELEMENTAL_GROUP_ROLE, "Sói", "Bảo vệ", "Hộ nhân", "Phù thủy", "Linh sói", "Thợ săn", "Tiên tri", "Kẻ bị nguyền", "Trưởng làng"];
const WOLF_ROLES = new Set(["Sói", "Sói con", "Sói Dại", "Bán sói"]);
const COFFEE_HERB_ROLES = new Set(["Linh Chi", "Đông Trùng"]);


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

  if (roles.includes("Trưởng làng") && roles.includes("Hộ nhân")) {
    available.add("Trưởng làng");
  }

  return NIGHT_ACTION_ROLE_ORDER.filter((role) => available.has(role));
}

function isElementalQuickOrder(order: NightActionRole[]) {
  const firstEffectiveRole = order.find((role) => role !== "Thần tình yêu" && role !== "Tay Buôn");
  return firstEffectiveRole === ELEMENTAL_GROUP_ROLE;
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
  const getRoleDisplayName = (roleName: string | undefined | null) => {
    if (!roleName) return "";
    if (room?.gameMode === "soi_mu" && roleName === "Tay Buôn") return "Ariana";
    return roleName;
  };
  const [noticeModal, setNoticeModal] = useState<{ title: string; message: string; onConfirm?: () => void } | null>(null);
  const [showRulesModal, setShowRulesModal] = useState(false);
  const [showCurrentRulesModal, setShowCurrentRulesModal] = useState(false);
  const [showElementalEffectGuide, setShowElementalEffectGuide] = useState(false);
  const [elementalInfoModal, setElementalInfoModal] = useState<{ title: string; message: string } | null>(null);
  const [pendingRulesUpdate, setPendingRulesUpdate] = useState<RoomData["gameRules"] | null>(null);
  const [showRulesApplyDecisionModal, setShowRulesApplyDecisionModal] = useState(false);
  const [leaveConfirmOpen, setLeaveConfirmOpen] = useState(false);
  const [roleMismatchConfirm, setRoleMismatchConfirm] = useState<{
    names: string;
    missingRoles: number;
    targetRoomId: string;
  } | null>(null);

  const [wolfMismatchConfirm, setWolfMismatchConfirm] = useState<{
    data: {
      currentWolfCount: number;
      maxAllowedWolfCount: number;
      playerCount: number;
    };
    targetRoomId: string;
  } | null>(null);
  const [rulesRestartOverlay, setRulesRestartOverlay] = useState<{
    message: string;
    totalMs: number;
    fadeInMs: number;
    holdMs: number;
    fadeOutMs: number;
    key: number;
  } | null>(null);
  const [hostPlayerActionTarget, setHostPlayerActionTarget] = useState<Player | null>(null);
  const [roleAssignmentPlayer, setRoleAssignmentPlayer] = useState<Player | null>(null);
  const [avatarAssignmentPlayer, setAvatarAssignmentPlayer] = useState<Player | null>(null);
  const [editingAvatar, setEditingAvatar] = useState("");
  const [avatarSearch, setAvatarSearch] = useState("");
  const [avatarTab, setAvatarTab] = useState("all");
  const [showAvatarModal, setShowAvatarModal] = useState(false);
  const [myAvatar, setMyAvatar] = useState(() => localStorage.getItem("werewolfPlayerAvatar") || "");


  const myPlayerInRoom = useMemo(() => {
    return room?.players.find((p) => p.id === clientId);
  }, [room?.players, clientId]);

  const activeAvatarFile = myPlayerInRoom?.playerAvatar || myAvatar;
  const currentAvatarUrl = getAvatarUrlByFileName(activeAvatarFile);

  const selectAvatar = (fileName: string) => {
    setMyAvatar(fileName);
    localStorage.setItem("werewolfPlayerAvatar", fileName);
    setShowAvatarModal(false);
    if (room) {
      socket.emit("hostSetPlayerAvatar", {
        roomId: room.id,
        targetId: clientId,
        playerAvatar: fileName
      });
    }
  };

  const clearAvatar = () => {
    setMyAvatar("");
    localStorage.removeItem("werewolfPlayerAvatar");
    setShowAvatarModal(false);
    if (room) {
      socket.emit("hostSetPlayerAvatar", {
        roomId: room.id,
        targetId: clientId,
        playerAvatar: ""
      });
    }
  };

  const allAvatars = useMemo(() => {
    return Object.keys(AVA_IMAGES)
      .map((path) => path.split("/").pop() || "")
      .filter(Boolean)
      .sort();
  }, []);

  const filteredAvatars = useMemo(() => {
    return allAvatars.filter((fileName) => {
      if (avatarSearch && !fileName.toLowerCase().includes(avatarSearch.toLowerCase())) {
        return false;
      }
      if (avatarTab === "masked") {
        return fileName.includes("M-") || fileName.startsWith("M ");
      }
      if (avatarTab === "normal") {
        return !fileName.includes("M-") && !fileName.startsWith("M ");
      }
      return true;
    });
  }, [allAvatars, avatarSearch, avatarTab]);
  const location = useLocation();
  const nav = useNavigate();

  const showNotice = useCallback((title: string, message: string, onConfirm?: () => void) => {
    setNoticeModal({ title, message, onConfirm });
  }, []);

  // lấy roomId từ URL (?roomId=xxxxx)
  const query = new URLSearchParams(location.search);
  const roomId = query.get("roomId");

  useEffect(() => {
    preloadImages([
      chieuBgAsset,
      nenLungAsset,
      moonAsset,
      leafAsset,
      sunBehindCloudAsset,
      ...duskRoleCardAssets,
    ]);
  }, []);

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

  // Tải trước (prefetch) component Game tương ứng với chế độ chơi để tránh bị khựng khi chuyển trang
  useEffect(() => {
    if (!room?.gameMode) return;
    if (room.gameMode === "soi_mu") {
      import("./GameSoiMu").catch((err) => {
        console.error("Lỗi tải trước GameSoiMu:", err);
      });
    } else {
      import("./GameDaNghich").catch((err) => {
        console.error("Lỗi tải trước GameDaNghich:", err);
      });
    }
  }, [room?.gameMode]);

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
      setRoleMismatchConfirm({ names, missingRoles, targetRoomId });
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

      setWolfMismatchConfirm({ data, targetRoomId });
    };

    socket.on("wolfRoleMismatch", handleWolfMismatch);
    return () => {
      socket.off("wolfRoleMismatch", handleWolfMismatch);
    };
  }, [nav, room, roomId]);



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

  // Xử lý nhường quyền
  const handleTransferHost = () => {
    if (hostPlayerActionTarget && room) {
      socket.emit("transferHost", { roomId: room.id, targetId: hostPlayerActionTarget.id });
      setHostPlayerActionTarget(null);
    }
  };

  // Xử lý kick
  const handleKick = () => {
    if (hostPlayerActionTarget && room) {
      socket.emit("kickPlayer", { roomId: room.id, targetId: hostPlayerActionTarget.id, source: "room" });
      setHostPlayerActionTarget(null);
    }
  };

  const handleOpenRoleAssignment = () => {
    if (!hostPlayerActionTarget) return;
    setRoleAssignmentPlayer(hostPlayerActionTarget);
    setHostPlayerActionTarget(null);
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

  const handlePlayerDoubleClickMenu = (playerId: string) => {
    if (!room) return;
    if (!amIHost) return;
    if (playerId === room.hostId) return;

    const target = room.players.find((p) => p.id === playerId);
    if (!target) return;
    setHostPlayerActionTarget(target);
  };

  // Xử lý trao quyền sắp xếp vị trí
  const handleGrantPosition = () => {
    if (hostPlayerActionTarget && room) {
      socket.emit("grantPositionEdit", { roomId: room.id, targetId: hostPlayerActionTarget.id });
      setHostPlayerActionTarget(null);
    }
  };

  // Xử lý thu lại quyền sắp xếp vị trí
  const handleRevokePosition = () => {
    if (hostPlayerActionTarget && room) {
      socket.emit("revokePositionEdit", { roomId: room.id, targetId: hostPlayerActionTarget.id });
      setHostPlayerActionTarget(null);
    }
  };

  // Xử lý mở modal gán avatar
  const handleOpenAvatarAssignment = () => {
    if (!hostPlayerActionTarget) return;
    setAvatarAssignmentPlayer(hostPlayerActionTarget);
    setEditingAvatar(hostPlayerActionTarget.playerAvatar || "");
    setAvatarSearch("");
    setAvatarTab("all");
    setHostPlayerActionTarget(null);
  };

  // Tự động đồng bộ ảnh đại diện tùy chỉnh từ localStorage lên server (dành cho Host)
  useEffect(() => {
    if (!room || clientId !== room.hostId || !socket) return;
    try {
      const customAvatars = JSON.parse(localStorage.getItem("game-custom-avatars") || "{}");
      let changed = false;
      room.players.forEach((p) => {
        const savedAvatar = customAvatars[p.id];
        if (savedAvatar) {
          if (p.playerAvatar !== savedAvatar) {
            const isUnknownSaved = /^M unknownID \d+/i.test(savedAvatar);
            const isAssignedServer = (p.playerAvatar || "").includes("M-");
            const isPlayerOwnVip = !p.playerAvatar || p.playerAvatar.toLowerCase().includes(p.id.toLowerCase());

            if ((isUnknownSaved && isAssignedServer) || isPlayerOwnVip) {
              customAvatars[p.id] = p.playerAvatar;
              changed = true;
            } else {
              socket.emit("hostSetPlayerAvatar", {
                roomId: room.id,
                targetId: p.id,
                playerAvatar: savedAvatar,
              });
            }
          }
        }
      });
      if (changed) {
        localStorage.setItem("game-custom-avatars", JSON.stringify(customAvatars));
      }
    } catch (e) {
      console.error("Lỗi đồng bộ avatar từ localStorage:", e);
    }
  }, [room?.players, room?.id, clientId, socket]);

  // Tự động đồng bộ ảnh đại diện cá nhân của chính người chơi lên server
  useEffect(() => {
    if (!room || !socket) return;
    const myPlayer = room.players.find(p => p.id === clientId);
    const mySavedAvatar = localStorage.getItem("werewolfPlayerAvatar");

    if (myPlayer) {
      if (myPlayer.playerAvatar) {
        // Nếu server có avatar, đồng bộ ngược về localStorage nếu khác biệt
        if (mySavedAvatar !== myPlayer.playerAvatar) {
          localStorage.setItem("werewolfPlayerAvatar", myPlayer.playerAvatar);
          setMyAvatar(myPlayer.playerAvatar);
        }
      } else if (mySavedAvatar) {
        // Nếu server chưa có avatar nhưng local có, đồng bộ lên server
        socket.emit("hostSetPlayerAvatar", {
          roomId: room.id,
          targetId: clientId,
          playerAvatar: mySavedAvatar
        });
      }
    }
  }, [room?.players, room?.id, clientId, socket]);



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

    const coffeeHerbCardMode = room.pendingGameRules?.coffeeHerbCardMode
      ?? room.gameRules?.coffeeHerbCardMode;
    return Array.from(roleCounts.entries()).filter(([role]) => (
      coffeeHerbCardMode !== "secondary" || !COFFEE_HERB_ROLES.has(role)
    )).map(([role, total]) => {
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

  if (!room)
    return (
      <div
        style={{
          padding: 20,
          backgroundImage: `url(${RoomBg})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
          minHeight: "100vh",
          position: "fixed",
          inset: 0,
          filter: "blur(4px)",
        }}
      >
        <p>Có gì đó sai sai lẽ ra bạn ko nên thấy được những dòng này ...</p>
        <div style={{ marginTop: 12 }}>
          <button
            onClick={() => {
              setRoom(null);
              nav("/lobby");
            }}
            style={{ padding: "8px 12px", borderRadius: 6, cursor: "pointer" }}
          >
            Trở về sảnh chờ
          </button>
        </div>
      </div>
    );

  const amIHost = clientId === room.hostId;
  const gameInProgress = !!room.phase && !room.gameOver;
  const hasPlayedMatch = room.hasPlayedMatch === true || room.gameOver === true || !!room.phase || (!!room.playerRoles && Object.keys(room.playerRoles).length > 0);
  const participantCount = room.players.filter((p) => p.id !== room.hostId).length;
  const coffeeHerbCardModeForNextGame = room.pendingGameRules?.coffeeHerbCardMode
    ?? room.gameRules?.coffeeHerbCardMode;
  const selectedRoleCount = (room.roles || []).filter((role) => (
    coffeeHerbCardModeForNextGame !== "secondary" || !COFFEE_HERB_ROLES.has(role)
  )).length;
  const hasElementalRole = (room.roles || []).some((role) => ELEMENTAL_ROLE_SET.has(role));
  const hasEnoughRolesToStart = selectedRoleCount >= participantCount && selectedRoleCount > 0;

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
    <div
      className="page-shell room-page"
      style={{
        padding: 20,
        position: "relative",
        minHeight: "100dvh",
        isolation: "isolate",
      }}
    >
      <style>{`
          .lobby-card {
            padding: 32px;
            border-radius: 24px;
            border: 1px solid rgba(255, 255, 255, 0.06);
            background: rgba(11, 14, 20, 0.95);
            backdrop-filter: blur(30px);
            box-shadow: 0 30px 80px rgba(0, 0, 0, 0.5);
            transition: all 0.3s ease;
            display: flex;
            flex-direction: column;
            gap: 20px;
          }
          .lobby-card:hover {
            border-color: rgba(255, 255, 255, 0.12);
            box-shadow: 0 30px 80px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.08);
          }
          @keyframes modalFadeIn {
            from {
              opacity: 0;
              transform: scale(0.95) translateY(10px);
            }
            to {
              opacity: 1;
              transform: scale(1) translateY(0);
            }
          }
        `}</style>
      <div
        style={{
          position: "fixed",
          inset: 0,
          backgroundImage: `url(${RoomBg})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
          filter: "blur(4px)",
          zIndex: -1,
          transform: "scale(1.08)", // Scale nhẹ để che viền trắng mờ do bộ lọc blur tạo ra ở rìa màn hình
        }}
      />
      <div id="Phần-trên-cùng" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            onClick={() => setLeaveConfirmOpen(true)}
            aria-label="Quay về sảnh chờ"
            title="Rời phòng và về sảnh chờ"
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
              flexShrink: 0, // tránh bị co lại khi có tên phòng dài
            }}
          >
            <img src={ArrowLeft} alt="Quay về sảnh chờ" style={{ width: 22, height: 22, display: "block" }} />
          </button>
          <h1 id="Ma-phong">Phòng: {room.id}</h1>
        </div>

        {/* Player Circle Token ở góc phải */}
        <div
          onClick={() => setShowAvatarModal(true)}
          style={{
            width: 36,
            height: 36,
            borderRadius: "50%",
            border: "2px solid rgba(255, 255, 255, 0.2)",
            backgroundImage: currentAvatarUrl ? `url("${currentAvatarUrl}")` : undefined,
            backgroundColor: currentAvatarUrl ? undefined : "rgba(255, 255, 255, 0.05)",
            backgroundPosition: "center",
            backgroundSize: "cover",
            backgroundRepeat: "no-repeat",
            cursor: "pointer",
            transition: "all 0.25s ease",
            boxShadow: "0 4px 12px rgba(0, 0, 0, 0.3)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: currentAvatarUrl ? undefined : 16,
            color: "#ff8f42",
            overflow: "hidden",
            marginRight: 4
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = "#ff8f42";
            e.currentTarget.style.transform = "scale(1.05)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.2)";
            e.currentTarget.style.transform = "scale(1)";
          }}
          title="Đổi Avatar VIP"
        >
          {!currentAvatarUrl && (
            <img
              src={UserIcon}
              alt="User"
              style={{
                width: "100%",
                height: "100%",
                objectFit: "contain",
                transform: "scale(1.1) translateY(10%)",
                opacity: 0.5
              }}
            />
          )}
        </div>
      </div>
      {room.gameMode !== "soi_mu" && hasElementalRole && (

        <div id="Luat-phong" style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
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
      )}
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
            <button
              onClick={() => nav(`/roleselect?roomId=${room.id}`)}
              title="Bầu chọn vai trò bạn muốn chơi"
            >
              Bầu chọn vai trò
            </button>
            {hasElementalRole && (
              <button
                onClick={() => setShowElementalEffectGuide(true)}
                title="Xem hậu quả khi dân làng nguyên tố bị giết"
              >
                Xem hiệu ứng nguyên tố
              </button>
            )}
            {gameInProgress && (
              <button
                onClick={returnToCurrentGame}
                title="Trở lại ván đang diễn ra"
              >
                Trở lại trò chơi
              </button>
            )}
            {hasPlayedMatch && (
              <button
                onClick={() => nav(`/game?roomId=${room.id}`)}
                title="Xem lại kết quả và nhật ký trận đấu"
              >
                Xem lại kết quả
              </button>
            )}
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
                title={gameInProgress ? "Trở lại ván đang diễn ra" : undefined}
              >
                {startButtonText}
              </button>
            </div>
            {hasPlayedMatch && (
              <div style={{ marginTop: 8 }}>
                <button
                  onClick={() => nav(`/game?roomId=${room.id}`)}
                  title="Xem lại kết quả và nhật ký trận đấu"
                >
                  Xem lại kết quả
                </button>
              </div>
            )}
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
        }} onPlayerDoubleClick={handlePlayerDoubleClickMenu} />
      </div>

      {/* Menu thao tác cho host */}
      {hostPlayerActionTarget && (
        <div
          onClick={() => setHostPlayerActionTarget(null)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            background: "rgba(0,0,0,0.32)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "min(92vw, 360px)",
              maxHeight: "90vh",
              overflowY: "auto",
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 12,
              padding: 24,
              boxShadow: "0 12px 32px rgba(0,0,0,0.25)",
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}
          >
            <h2 style={{ marginTop: 0, marginBottom: 8, fontSize: 20, textAlign: "center" }}>
              Thao tác với {hostPlayerActionTarget.name}
            </h2>

            <button
              onClick={handleTransferHost}
              style={{ width: "100%", padding: "10px 12px", borderRadius: 6, cursor: "pointer" }}
            >
              Nhường quyền chủ phòng
            </button>

            {room?.positionEditors?.includes(hostPlayerActionTarget.id) ? (
              <button
                onClick={handleRevokePosition}
                style={{ width: "100%", padding: "10px 12px", borderRadius: 6, cursor: "pointer" }}
              >
                Thu lại quyền sắp xếp vị trí
              </button>
            ) : (
              <button
                onClick={handleGrantPosition}
                style={{ width: "100%", padding: "10px 12px", borderRadius: 6, cursor: "pointer" }}
              >
                Trao quyền sắp xếp vị trí
              </button>
            )}

            <button
              onClick={handleOpenRoleAssignment}
              style={{ width: "100%", padding: "10px 12px", borderRadius: 6, cursor: "pointer" }}
            >
              Can thiệp role
            </button>

            <button
              onClick={handleOpenAvatarAssignment}
              style={{ width: "100%", padding: "10px 12px", borderRadius: 6, cursor: "pointer" }}
            >
              Gắn ảnh đại diện
            </button>

            <button
              onClick={handleKick}
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: 6,
                cursor: "pointer",
                background: "rgba(211, 47, 47, 0.1)",
                color: "var(--danger)",
                border: "1px solid var(--danger)",
              }}
            >
              Kick khỏi phòng
            </button>

            <button
              onClick={() => setHostPlayerActionTarget(null)}
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: 6,
                cursor: "pointer",
                background: "rgba(255, 255, 255, 0.08)",
                border: "none",
                marginTop: 8,
              }}
            >
              Đóng
            </button>
          </div>
        </div>
      )}

      {avatarAssignmentPlayer && (
        <div
          onClick={() => setAvatarAssignmentPlayer(null)}
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
              width: "min(92vw, 480px)",
              maxHeight: "82vh",
              overflowY: "auto",
              padding: 24,
              borderRadius: 10,
              border: "1px solid var(--border)",
              background: "var(--surface)",
              boxShadow: "0 12px 32px rgba(0,0,0,0.25)",
            }}
          >
            <h2 style={{ marginTop: 0, marginBottom: 16 }}>Đặt ảnh đại diện cho {avatarAssignmentPlayer.name}</h2>

            {/* Row 1: Preview & Current Selection Info & Clear Button */}
            <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 16, border: "1px solid var(--border)", borderRadius: 8, padding: 12 }}>
              {/* Vòng tròn xem trước (Avatar Preview) */}
              {(() => {
                const previewUrl = getAvatarUrlByFileName(editingAvatar);
                const isMaskedPreview = editingAvatar.trim().toUpperCase().startsWith("M ");
                return (
                  <div
                    style={{
                      width: 56,
                      height: 56,
                      borderRadius: "50%",
                      border: "2px solid rgba(255, 255, 255, 0.15)",
                      background: isMaskedPreview
                        ? `url(${nenLungAsset}) center/cover no-repeat`
                        : (previewUrl ? `url("${previewUrl}") center/cover no-repeat` : "rgba(255, 255, 255, 0.05)"),
                      position: "relative",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                      overflow: isMaskedPreview ? "visible" : "hidden",
                    }}
                  >
                    {isMaskedPreview && previewUrl && (
                      <>
                        {/* Thân dưới bo tròn */}
                        <div style={{ position: "absolute", inset: 0, borderRadius: "50%", overflow: "hidden" }}>
                          <img
                            src={previewUrl}
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
                        {/* Đầu nhô ra ngoài */}
                        <img
                          src={previewUrl}
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
                            clipPath: "inset(0 0 45% 0)",
                          }}
                        />
                      </>
                    )}
                    {!previewUrl && (
                      <span style={{ fontSize: "24px", color: "rgba(255, 255, 255, 0.25)" }}>👤</span>
                    )}
                  </div>
                );
              })()}

              {/* Tên file hiện tại và nút xóa */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: 0.5 }}>Đang chọn:</div>
                <div style={{
                  fontSize: "14px",
                  fontWeight: 500,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  color: editingAvatar ? "#fff" : "rgba(255,255,255,0.3)"
                }}>
                  {editingAvatar ? (
                    (editingAvatar.includes("M-") || editingAvatar.startsWith("M ")) ? `🖼️ Tách nền: ${editingAvatar.substring(editingAvatar.indexOf(" ") + 1)}` :
                      editingAvatar.startsWith("S ") ? `👤 Thường: ${editingAvatar.substring(2)}` : editingAvatar
                  ) : "Chưa chọn (Ẩn avatar)"}
                </div>
                {editingAvatar && (
                  <button
                    type="button"
                    onClick={() => setEditingAvatar("")}
                    style={{
                      background: "transparent",
                      border: "none",
                      color: "#e74c3c",
                      padding: "2px 0 0 0",
                      fontSize: "12px",
                      cursor: "pointer",
                      textDecoration: "underline",
                      display: "block",
                    }}
                  >
                    Bỏ chọn / Xóa avatar
                  </button>
                )}
              </div>
            </div>

            {/* Row 2: Tìm kiếm và Tabs */}
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
              <input
                type="text"
                placeholder="Tìm kiếm avatar..."
                value={avatarSearch}
                onChange={(e) => setAvatarSearch(e.target.value)}
                style={{
                  width: "100%",
                  background: "rgba(255, 255, 255, 0.05)",
                  border: "1px solid var(--border)",
                  borderRadius: 6,
                  color: "#fff",
                  padding: "8px 10px",
                  fontSize: "14px",
                  outline: "none"
                }}
              />

              {/* Tabs */}
              <div style={{ display: "flex", gap: 2, background: "rgba(0, 0, 0, 0.2)", borderRadius: 6, padding: 2 }}>
                {[
                  { id: "all", label: "Tất cả" },
                  { id: "masked", label: "Tách nền" },
                  { id: "normal", label: "Ảnh thường" }
                ].map((t) => {
                  const isActive = avatarTab === t.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setAvatarTab(t.id)}
                      style={{
                        flex: 1,
                        background: isActive ? "rgba(255, 255, 255, 0.1)" : "transparent",
                        border: "none",
                        borderRadius: 4,
                        color: isActive ? "#fff" : "rgba(255, 255, 255, 0.5)",
                        padding: "6px 0",
                        fontSize: "12px",
                        cursor: "pointer",
                        fontWeight: isActive ? 600 : 400,
                        transition: "all 0.1s ease"
                      }}
                    >
                      {t.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Row 3: Lưới Sticker (Grid) */}
            <div style={{
              maxHeight: "220px",
              overflowY: "auto",
              border: "1px solid var(--border)",
              borderRadius: 8,
              padding: 8,
              background: "rgba(0,0,0,0.15)",
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(46px, 1fr))",
              gap: 8,
              marginBottom: 20
            }}>
              {filteredAvatars.map((fileName) => {
                const url = getAvatarUrlByFileName(fileName);
                const isMasked = fileName.startsWith("M ");
                const isSelected = fileName === editingAvatar;
                return (
                  <button
                    key={fileName}
                    type="button"
                    onClick={() => setEditingAvatar(fileName)}
                    title={fileName}
                    style={{
                      aspectRatio: "1",
                      borderRadius: "50%",
                      border: isSelected ? "2.5px solid var(--accent)" : "1px solid rgba(255, 255, 255, 0.1)",
                      background: isMasked
                        ? `url(${nenLungAsset}) center/cover no-repeat`
                        : "rgba(255, 255, 255, 0.03)",
                      position: "relative",
                      cursor: "pointer",
                      overflow: "hidden",
                      padding: 0,
                      outline: "none",
                      boxShadow: isSelected ? "0 0 8px var(--accent)" : "none",
                      transform: isSelected ? "scale(1.05)" : "none",
                      transition: "all 0.1s ease",
                    }}
                  >
                    {url && (
                      <img
                        src={url}
                        alt={fileName}
                        style={{
                          width: "100%",
                          height: "100%",
                          objectFit: "contain",
                          opacity: isSelected ? 1 : 0.8,
                        }}
                      />
                    )}
                  </button>
                );
              })}
              {filteredAvatars.length === 0 && (
                <div style={{ gridColumn: "1 / -1", textAlign: "center", color: "rgba(255,255,255,0.3)", fontSize: "13px", padding: "20px 0" }}>
                  Không tìm thấy avatar
                </div>
              )}
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button
                type="button"
                onClick={() => setAvatarAssignmentPlayer(null)}
                style={{
                  background: "rgba(255, 255, 255, 0.08)",
                  color: "#fff",
                  border: "none",
                  borderRadius: 6,
                  padding: "8px 16px",
                  cursor: "pointer",
                }}
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!roomId || !avatarAssignmentPlayer) return;
                  // 1. Gửi qua socket lên server
                  socket.emit("hostSetPlayerAvatar", {
                    roomId,
                    targetId: avatarAssignmentPlayer.id,
                    playerAvatar: editingAvatar
                  });
                  // 2. Lưu local để F5 không mất
                  try {
                    const customAvatars = JSON.parse(localStorage.getItem("game-custom-avatars") || "{}");
                    if (editingAvatar) {
                      customAvatars[avatarAssignmentPlayer.id] = editingAvatar;
                    } else {
                      delete customAvatars[avatarAssignmentPlayer.id];
                    }
                    localStorage.setItem("game-custom-avatars", JSON.stringify(customAvatars));
                  } catch (e) {
                    console.error("Lỗi lưu avatar vào localStorage:", e);
                  }
                  setAvatarAssignmentPlayer(null);
                }}
                style={{
                  background: "var(--accent)",
                  color: "#fff",
                  border: "none",
                  borderRadius: 6,
                  padding: "8px 16px",
                  fontWeight: "bold",
                  cursor: "pointer"
                }}
              >
                Lưu
              </button>
            </div>
          </div>
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
                      <span>{getRoleDisplayName(option.role)}</span>
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
                      <span>{getRoleDisplayName(option.role)}</span>
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
        gameMode={room.gameMode === "co_ty_phu" ? undefined : room.gameMode}
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
        gameMode={room.gameMode === "co_ty_phu" ? undefined : room.gameMode}
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

      <ConfirmModal
        open={!!roleMismatchConfirm}
        title="Xác nhận thêm vai trò"
        message={
          roleMismatchConfirm
            ? `Có người chơi mới (${roleMismatchConfirm.names}) đã vào phòng sau khi bạn đã xác nhận vai trò.\n` +
            `Bạn đang thiếu ${roleMismatchConfirm.missingRoles} vai trò.\n\n` +
            `Bạn có muốn tự động thêm ${roleMismatchConfirm.missingRoles} "Dân làng" không?`
            : ""
        }
        confirmText="Thêm"
        cancelText="Hủy"
        onConfirm={() => {
          if (roleMismatchConfirm) {
            socket.emit("addAutoRoles", {
              roomId: roleMismatchConfirm.targetRoomId,
              count: roleMismatchConfirm.missingRoles,
            });
          }
          setRoleMismatchConfirm(null);
        }}
        onCancel={() => {
          if (roleMismatchConfirm) {
            nav(`/roleselect?roomId=${roleMismatchConfirm.targetRoomId}`);
          }
          setRoleMismatchConfirm(null);
        }}
      />

      <ConfirmModal
        open={!!wolfMismatchConfirm}
        title="Xác nhận điều chỉnh vai trò"
        message={
          wolfMismatchConfirm
            ? `Danh sách vai trò hiện tại có ${wolfMismatchConfirm.data.currentWolfCount} sói, vượt quá mức tối đa ${wolfMismatchConfirm.data.maxAllowedWolfCount} cho phòng ${wolfMismatchConfirm.data.playerCount} người.\n\n` +
            `Hệ thống sẽ tự giảm bớt số lượng sói để tránh phe sói thắng ngay khi bắt đầu.\n` +
            `Nhấn OK để hệ thống tự điều chỉnh và bắt đầu trò chơi.\n` +
            `Nhấn Hủy để quay lại màn hình chọn vai trò.`
            : ""
        }
        confirmText="OK"
        cancelText="Hủy"
        onConfirm={() => {
          if (wolfMismatchConfirm) {
            socket.emit("startGame", {
              roomId: wolfMismatchConfirm.targetRoomId,
              forceAdjustWolfCount: true,
            });
          }
          setWolfMismatchConfirm(null);
        }}
        onCancel={() => {
          if (wolfMismatchConfirm) {
            nav(`/roleselect?roomId=${wolfMismatchConfirm.targetRoomId}`);
          }
          setWolfMismatchConfirm(null);
        }}
      />

      <AvatarSelectModal
        open={showAvatarModal}
        onClose={() => setShowAvatarModal(false)}
        myAvatar={myAvatar}
        clientId={clientId}
        onSelect={selectAvatar}
        onClear={clearAvatar}
      />

      {room.roles && room.roles.length > 0 && (() => {
        // 1. Filter roles that have valid portraits
        const rolesWithPortraits = room.roles.filter(role => getRoomRolePortrait(role, room.gameMode) !== null);
        if (rolesWithPortraits.length === 0) return null;

        const isThirdPartyFaction = (r: string) => {
          const norm = normalizeRoleName(r);
          return (
            norm === "thiên sứ" ||
            norm === "tay buôn" ||
            norm === "thần tình yêu" ||
            norm === "song trùng"
          );
        };

        // Helper to check if a role is Villager faction (phe dân)
        const isVillagerFaction = (r: string) => {
          const norm = normalizeRoleName(r);
          // Werewolf faction (phe sói): contains "sói", "wolf", or is "ác quỷ", "độc thủ", "gián điệp", "phò"
          if (
            norm.includes("sói") ||
            norm.includes("wolf") ||
            norm === "ác quỷ" ||
            norm === "độc thủ" ||
            norm === "gián điệp" ||
            norm === "phò"
          ) {
            return false;
          }
          // Third party faction (phe ba): "thiên sứ", "tay buôn", "thần tình yêu", "song trùng"
          if (isThirdPartyFaction(r)) {
            return false;
          }
          // All other roles belong to Villager faction (phe dân)
          return true;
        };

        // Phe dân: priority thấp hơn nằm gần ranh giới đối đầu hơn.
        const getLeftRolePriority = (r: string) => {
          const norm = normalizeRoleName(r);
          switch (norm) {
            case "tiên tri": return 0;
            case "hộ nhân": return 1;
            case "trưởng làng": return 2;
            case "bảo vệ": return 3;
            case "phù thủy": return 4;
            case "thợ săn": return 5;
            case "kẻ bị nguyền": return 6;
            case "dân làng": return 100;
            default: return 50;
          }
        };

        // Right roles (phe sói & phe ba) priority order (lower value is closer to the center)
        const getRightRolePriority = (r: string) => {
          const norm = normalizeRoleName(r);
          switch (norm) {
            // Phe Sói (đứng trước - gần tâm nhất)
            case "bán sói": return 0;
            case "sói": return 1;
            case "sói con": return 2;
            case "sói dại": return 3;
            case "linh sói": return 4;
            case "ác quỷ": return 5;
            case "độc thủ": return 6;
            case "gián điệp": return 7;
            case "phò": return 8;
            // Phe Ba (đứng sau - xa tâm hơn)
            case "thiên sứ": return 10;
            case "thần tình yêu": return 11;
            case "tay buôn": return 12;
            case "song trùng": return 13;
            default:
              if (norm.includes("sói") || norm.includes("wolf")) {
                return 4.5;
              }
              return 20;
          }
        };

        const villagerRoles = rolesWithPortraits
          .filter(isVillagerFaction)
          .sort((a, b) => getLeftRolePriority(b) - getLeftRolePriority(a));
        const wolfRoles = rolesWithPortraits
          .filter(r => !isVillagerFaction(r) && !isThirdPartyFaction(r))
          .sort((a, b) => getRightRolePriority(a) - getRightRolePriority(b));
        const thirdPartyRoles = rolesWithPortraits
          .filter(isThirdPartyFaction)
          .sort((a, b) => getRightRolePriority(a) - getRightRolePriority(b));
        const lineupRoles = [...villagerRoles, ...wolfRoles, ...thirdPartyRoles];
        const factionStartIndexes = new Set([
          villagerRoles.length,
          villagerRoles.length + wolfRoles.length,
        ]);

        const hasTruongLang = villagerRoles.some(r => normalizeRoleName(r) === "trưởng làng");

        const renderRolePortrait = (role: string, idx: number, isVillager: boolean) => {
          const src = getRoomRolePortrait(role, room.gameMode);
          if (!src) return null;

          const norm = normalizeRoleName(role);

          // Determine flip
          const flipX = isVillager ? -1 : 1;

          // Determine custom styling
          let scale = 1.0;
          let zIndex = 1;
          let marginLeft: string | undefined = undefined;
          let marginRight: string | undefined = undefined;
          let marginBottom: string | undefined = undefined;

          // TofuEdited
          if (norm === "trưởng làng") {
            scale = 1.2;
            zIndex = 1;
            marginLeft = "-1.2rem";

          } else if (norm === "hộ nhân") {
            scale = 1.0;
            zIndex = 2;
            if (hasTruongLang) {
              marginLeft = "-1.5rem";
            }

          } else if (norm === "tiên tri") {
            scale = 0.9;
            marginLeft = "-2.3rem";

          } else if (norm === "bán sói") {
            scale = 0.8;

          } else if (norm === "thiên sứ") {
            scale = 1.15;
          } else if (norm === "sói") {
            scale = 1.15;
            marginLeft = "-2.3rem";

            marginBottom = "-1.1rem";

          } else if (norm === "sói con") {
            scale = 0.85;
            marginBottom = "-1.1rem";
            marginRight = "-2.3rem";

          } else if (norm === "sói dại") {
            scale = 1.1;
            marginBottom = "-1.1rem";
            marginLeft = "-0.5rem";

          } else if (norm === "phù thủy") {
            scale = 1.3;
            marginLeft = "-0.5rem";
            marginRight = "-1.5rem";
          }
          // End of TofuEdited

          return (
            <div
              key={`${role}-${idx}`}
              className={`room-role-portrait-item ${flipX === -1 ? "is-left-slide" : "is-right-slide"}${idx > 0 && factionStartIndexes.has(idx) ? " is-faction-start" : ""}`}
              style={{
                animationDelay: `${idx * 0.05}s`,
                zIndex,
                marginLeft,
                marginRight,
                marginBottom
              }}
            >
              <div
                className="room-role-portrait-inner"
                style={{
                  transform: `scale(${scale}) scaleX(${flipX})`,
                  transformOrigin: "bottom center",
                  height: "100%",
                  display: "flex",
                  alignItems: "flex-end",
                }}
              >
                <img
                  className="room-role-portrait-image"
                  src={src}
                  alt={role}
                  title={role}
                />
              </div>
            </div>
          );
        };

        return (
          <div className="room-role-portraits-wrapper">
            <div className="room-role-portraits-lineup">
              {lineupRoles.map((role, idx) =>
                renderRolePortrait(role, idx, idx < villagerRoles.length)
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );
}

