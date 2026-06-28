import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { socket, clientId } from "../socket";
import { useLocation, useNavigate } from "react-router-dom";
import { useRoomContext } from "../context/RoomContext";
import PlayerPositions, { AVA_IMAGES, getAvatarUrlByFileName } from "../components/PlayerPositions";
import GameLogPanel from "../components/GameLogPanel";
import ConfirmModal from "../components/ConfirmModal";
import RoleCharacterPortrait, { HYBRID_BACKGROUND_ASSET } from "../components/RoleCharacterPortrait";
import type { GamePhase } from "./gameRoles/socketEvents";
import type { NightActionRole } from "../context/RoomContext";
import { ELEMENTAL_ROLE_SET } from "../constants/elemental";
import { useSeerRole } from "./gameRoles/useSeerRole";
import { useWolfRole } from "./gameRoles/useWolfRole";
import { useGuardianRole } from "./gameRoles/useGuardianRole";
import { useProtectorRole } from "./gameRoles/useProtectorRole";
import { useGameSocketSync } from "./gameRoles/useGameSocketSync";
import { useWitchRole } from "./gameRoles/useWitchRole";
import { useHunterRole } from "./gameRoles/useHunterRole";
import { useSpiritWolfRole } from "./gameRoles/useSpiritWolfRole";
import { useDayVoteRole } from "./gameRoles/useDayVoteRole";
import { useElementalRole } from "./gameRoles/useElementalRole";
import { useLoveRole } from "./gameRoles/useLoveRole";
import { useCursedRole } from "./gameRoles/useCursedRole";
import { useMerchantRole } from "./gameRoles/useMerchantRole";
import { useAngelRole } from "./gameRoles/useAngelRole";
import { useMock8Test } from "./gameRoles/useMock8Test";
import { ScoreboardModal } from "../components/ScoreboardModal";
import RoleCard3D from "../components/RoleCard3D";
import Masonry from "../components/Masonry";
import nenLungAsset from "../assets/nền lưng.avif";
import RoomBg from "../assets/Nền phòng.avif";
import ChieuBg from "../assets/nền chiều.avif";
import { gsap } from "gsap";
import { GameRoleStatusBar } from "../components/GameRoleStatusBar";
import medalSvg from "../assets/medal.svg";
import trashIcon from "../assets/trash-x.svg";
import GridMotionOverlay from "../components/GridMotionOverlay";
import RoleCompanionOverlay from "../components/RoleCompanionOverlay";
import { AvifIcon } from "../components/AvifIcon";
import { CountdownButton } from "../components/CountdownButton";
import { shootWinnerConfettiFromSides } from "../utils/winnerConfetti";
import StickerPeel from "../components/StickerPeel";
import { getStickerUrlByFileName } from "../utils/stickerAssets";
import { VIP_REAL_NAMES } from "../constants/vip";

const WOLF_TEAM_REVEAL_ROLES = new Set(["Sói", "Sói con", "Sói Dại", "Bán sói"]);
const NIGHT_ACTION_ROLE_SET = new Set([
  "Sói",
  "Sói con",
  "Sói Dại",
  "Bán sói",
  "Bảo vệ",
  "Hộ nhân",
  "Phù thủy",
  "Linh sói",
  "Thợ săn",
  "Tiên tri",
  "Thần tình yêu",
  "Kẻ bị nguyền",
  "Tay Buôn",
]);
const HUNTER_BULLET_ANIM_MS = 4000;
type TargetRoleDisplayOrder = "player-role" | "role-player";

function doesRoleMatchNightTurn(roleName: string | null | undefined, nightTurnRole: NightActionRole | null) {
  if (!roleName || !nightTurnRole) return false;
  if (nightTurnRole === "Sói") return WOLF_TEAM_REVEAL_ROLES.has(roleName);
  return roleName === nightTurnRole;
}


const ROLE_SKILL_HINTS: Record<string, string> = {
  "Tiên tri": "Chọn một người mà bạn nghĩ họ là sói để xem quả cầu có chuyển sang ánh sáng đỏ không",
  "Bảo vệ": "Chọn một người mà bạn muốn bảo vệ khỏi vết cắn của sói hoặc không hành động gì để bỏ qua",
  "Hộ nhân": "Chọn một người mà bạn muốn trao hộ thân giúp chặn mọi hiệu ứng gây chết cho họ trong một lần hoặc không hành động gì để bỏ qua",
  "Phù thủy": "Hãy lựa chọn cẩn thận hoặc không hành động gì để bỏ qua",
  "Thợ săn": "Chọn một mục tiêu để ghim hoặc không hành động gì để bỏ qua. Nếu bạn bị giết, mục tiêu sẽ bị giết theo",
  "Sói": "chọn một người để cắn và hãy nhớ cẩn trọng đến việc thống nhất lựa chọn với những sói khác",
  "Sói con": "chọn một người để cắn và hãy cẩn trọng đến việc thống nhất lựa chọn với những sói khác",
  "Sói Dại": "chọn một người để cắn và hãy cẩn trọng đến việc thống nhất lựa chọn với những sói khác",
  "Bán sói": "Bạn không cần hành động đêm khi chưa bị cắn và sẽ trở thành phe sói nếu đã bị cắn",
  "Tay Buôn": "Chọn một món đồ và dạng khóa để gửi cho người mà bạn muốn hoặc không hành động gì để bỏ qua",
  "Kẻ bị nguyền": "Chọn một người mà bạn muốn ngửi xem liệu người đó và 2 người bên cạnh liệu có sói hay không",
  "Linh sói": " ",
  "Thần tình yêu": "Chọn một người mà bạn muốn ghép đôi bản thân với họ",
  "Thiên Sứ": "Hãy quan sát kỹ mọi người, khi bạn bị giết, bạn sẽ có thể âm thầm hồi sinh một người đã chết mà bạn đặt niềm tin ở họ",
  "Dân làng": "Bạn không cần hành động đêm",
  "Trưởng làng": "Bạn không cần hành động đêm"
};

export default function GameDaNghich() {
  const { role: contextRole, room, setRoom } = useRoomContext();
  const nav = useNavigate();
  const location = useLocation();
  const query = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const roomId = query.get("roomId");
  const [roleOverride, setRoleOverride] = useState<string | null>("Thần tình yêu");
  const role = roomId === "mock-8" ? roleOverride : contextRole;
  const debugAnim = query.get("debugAnim") === "1";
  const debugCupid = query.get("debugCupid") === "1";
  const debugHeartExplosion = query.get("debugHeartExplosion") === "1";
  const debugWitch = query.get("debugWitch") === "1";
  const isDebugMode = roomId === "mock-8" || debugAnim || debugCupid || debugHeartExplosion || debugWitch;
  const [testHeartExplosionTrigger, setTestHeartExplosionTrigger] = useState(0);
  const [windowDimensions, setWindowDimensions] = useState({
    width: window.innerWidth,
    height: window.innerHeight,
  });

  useEffect(() => {
    const handleResize = () => {
      setWindowDimensions({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    };
    window.addEventListener("resize", handleResize);
    window.addEventListener("orientationchange", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("orientationchange", handleResize);
    };
  }, []);

  const sync = useGameSocketSync({ roomId, setRoom });
  const [dismissedStickerIds, setDismissedStickerIds] = useState<string[]>([]);

  useEffect(() => {
    setDismissedStickerIds([]);
  }, [sync.phase]);

  const handleSendPlayerMessage = useCallback((text: string, channel: "wolf" | "lovers") => {
    if (roomId === "mock-8") {
      const id = Math.random().toString(36).substring(2, 9);
      const msg = {
        id,
        senderId: clientId || "me",
        text,
        channel,
        createdAt: Date.now()
      };
      sync.setPlayerMessages((prev: any) => [...prev, msg]);
      return;
    }

    const id = Math.random().toString(36).substring(2, 9);
    socket.emit("placePlayerMessage", {
      roomId,
      message: {
        id,
        text,
        channel,
        createdAt: Date.now()
      }
    });
  }, [roomId, clientId, sync]);
  const phase: GamePhase = sync.phase;
  const isDusk = phase === "dusk";
  const isDayDiscussion =
    phase === "day" &&
    !sync.dayDeadline &&
    sync.trialStage === "none" &&
    !sync.gameEnded;
  const deadPlayers = sync.deadPlayers;
  const isHost = !!room?.hostId && clientId === room.hostId;
  const isPositionEditor = !!room?.positionEditors?.includes(clientId);
  const canControlTrialFlow = isHost || isPositionEditor;
  const isCurrentPlayerDead = !!clientId && deadPlayers.includes(clientId);
  const isCurrentPlayerHiddenRevived = sync.angelReviveState.reviveStage === "hidden";
  const isCurrentPlayerDeadForNightActions = isCurrentPlayerDead && !isCurrentPlayerHiddenRevived;

  const handleSelectSticker = useCallback((filename: string, channel: "wolf" | "lovers", event?: React.MouseEvent | React.TouchEvent | null) => {
    const id = `sticker-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const isStaticPaste = !event; // Nếu không có event -> dán tĩnh luôn (click/tap nhanh)

    let xPct = 0.5;
    let yPct = 0.5;
    let clientX = windowDimensions.width / 2;
    let clientY = windowDimensions.height / 2;

    if (event) {
      const nativeEvent = 'nativeEvent' in event ? event.nativeEvent : event;
      if ('touches' in nativeEvent) {
        const touches = (nativeEvent as TouchEvent).touches;
        if (touches && touches.length > 0) {
          clientX = touches[0].clientX;
          clientY = touches[0].clientY;
        }
      } else if ('clientX' in nativeEvent) {
        clientX = (nativeEvent as MouseEvent).clientX;
        clientY = (nativeEvent as MouseEvent).clientY;
      }

      const frameEl = document.querySelector(".player-position-frame");
      const frameRect = frameEl ? frameEl.getBoundingClientRect() : null;
      const stickerWidth = 100;

      if (frameRect) {
        const absX = clientX - frameRect.left - stickerWidth / 2;
        const absY = clientY - frameRect.top - stickerWidth / 2;
        xPct = absX / frameRect.width;
        yPct = absY / frameRect.height;
      } else {
        const absX = clientX - stickerWidth / 2;
        const absY = clientY - stickerWidth / 2;
        xPct = absX / windowDimensions.width;
        yPct = absY / windowDimensions.height;
      }
    }

    const rotate = Math.floor(Math.random() * 40 - 20);
    const createdAt = Date.now();

    const sticker: any = {
      id,
      imageSrc: filename,
      x: xPct,
      y: yPct,
      rotate,
      channel,
      createdAt,
      owner: clientId,
      isPasted: isStaticPaste,
      pastedAt: isStaticPaste ? Date.now() : undefined
    };

    if (event) {
      sticker.startDragEvent = 'nativeEvent' in event ? event.nativeEvent : event;
    }

    // Always update local state for fast UI response
    sync.setStickers((prev: any) => [...prev, sticker]);

    if (roomId === "mock-8") {
      return;
    }

    socket.emit("placeSticker", {
      roomId,
      sticker: {
        id,
        imageSrc: filename,
        x: xPct,
        y: yPct,
        rotate,
        channel,
        createdAt,
        isPasted: isStaticPaste,
        pastedAt: isStaticPaste ? Date.now() : undefined
      }
    });
  }, [roomId, sync, clientId, windowDimensions]);

  const handleDragUpdateSticker = useCallback((
    stickerId: string, 
    xPct: number, 
    yPct: number, 
    channel: "wolf" | "lovers", 
    isPasted?: boolean, 
    pastedAt?: number, 
    rotate?: number
  ) => {
    // Always update local state for fast UI response
    sync.setStickers((prev: any) =>
      prev.map((s: any) => (s.id === stickerId ? { ...s, x: xPct, y: yPct, isPasted: isPasted ?? s.isPasted, pastedAt: pastedAt ?? s.pastedAt, rotate: rotate ?? s.rotate } : s))
    );

    if (roomId === "mock-8") {
      return;
    }

    socket.emit("moveSticker", {
      roomId,
      stickerId,
      x: xPct,
      y: yPct,
      channel,
      isPasted,
      pastedAt,
      rotate
    });
  }, [roomId, sync]);

  const handleDragStartSticker = useCallback((stickerId: string, channel: "wolf" | "lovers") => {
    // Set isPasted to false locally
    sync.setStickers((prev: any) =>
      prev.map((s: any) => (s.id === stickerId ? { ...s, isPasted: false } : s))
    );

    if (roomId === "mock-8") {
      return;
    }

    const sticker = sync.stickers.find((s: any) => s.id === stickerId);
    if (!sticker) return;

    socket.emit("moveSticker", {
      roomId,
      stickerId,
      x: sticker.x,
      y: sticker.y,
      channel,
      isPasted: false,
      rotate: sticker.rotate
    });
  }, [roomId, sync]);

  const handleDeleteSticker = useCallback((stickerId: string, channel: "wolf" | "lovers") => {
    // Always update local state for fast UI response
    sync.setStickers((prev: any) => prev.filter((s: any) => s.id !== stickerId));

    if (roomId === "mock-8") {
      return;
    }

    socket.emit("deleteSticker", {
      roomId,
      stickerId,
      channel
    });
  }, [roomId, sync]);
  const shouldForceHideAngelReviveIdentity =
    phase === "day" &&
    isCurrentPlayerDead &&
    !sync.gameEnded &&
    (role === "Thiên Sứ" || sync.angelReviveState.reviveStage === "pending");
  const deadPlayersForNightActions = useMemo(
    () => (isCurrentPlayerHiddenRevived && clientId ? deadPlayers.filter((id) => id !== clientId) : deadPlayers),
    [deadPlayers, isCurrentPlayerHiddenRevived]
  );
  const shouldBlockDeadNightRoleReveal = phase === "night" && isCurrentPlayerDeadForNightActions;
  const shouldHidePlayerRoleText = !isHost && (!!room?.hidePlayerRoleText || shouldBlockDeadNightRoleReveal || shouldForceHideAngelReviveIdentity);
  const allNightActionsSimultaneous = room?.gameRules?.allNightActionsSimultaneous === true;
  const isBanSoiAligned = room?.banSoiWolfAligned === true;
  const isWildWolfConverted = room?.wildWolfConvertedSelf === true;
  const isBanSoiOrWildConverted = isBanSoiAligned || isWildWolfConverted;
  const shouldRevealHunterShotInDay = room?.gameRules?.hunterShotPublicInDay !== false;
  const currentNightTurnRole = (room?.nightTurnRole || null) as NightActionRole | null;
  const nightTurnPaused = !!room?.nightTurnPaused;
  const nightTurnDeadline = room?.nightTurnDeadline ?? null;
  const nightTurnRemainingMs = room?.nightTurnRemainingMs ?? null;
  const serverTimeOffset = useMemo(() => {
    if (!room?.serverTime) return 0;
    return room.serverTime - Date.now();
  }, [room?.serverTime]);
  const [nightTurnNow, setNightTurnNow] = useState(() => Date.now() + serverTimeOffset);
  const [noticeModal, setNoticeModal] = useState<{ title: string; message: string; onConfirm?: () => void } | null>(null);
  const [isNightInfoVisible, setIsNightInfoVisible] = useState(true);
  const [draggingStickerId, setDraggingStickerId] = useState<string | null>(null);
  const [isOverTrash, setIsOverTrash] = useState(false);
  const [cardFlippedToFront, setCardFlippedToFront] = useState(false);
  const [endGameConfirmOpen, setEndGameConfirmOpen] = useState(false);
  const [scoreboardOpen, setScoreboardOpen] = useState(false);
  const [hostPlayerActionTargetId, setHostPlayerActionTargetId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"real-names" | "nick-names" | "real-names-roles" | "nick-names-roles">(() => {
    const saved = localStorage.getItem("game-view-mode");
    if (saved === "real-names" || saved === "real-names-roles") return "real-names";
    return "nick-names";
  });
  const handleViewModeChange = (newMode: "real-names" | "nick-names" | "real-names-roles" | "nick-names-roles") => {
    setViewMode(newMode);
    localStorage.setItem("game-view-mode", newMode);
  };

  useEffect(() => {
    if (isHost) {
      if (viewMode === "real-names") {
        handleViewModeChange("real-names-roles");
      } else if (viewMode === "nick-names") {
        handleViewModeChange("nick-names-roles");
      }
    } else {
      if (!sync.gameEnded) {
        if (viewMode === "real-names-roles") {
          handleViewModeChange("real-names");
        } else if (viewMode === "nick-names-roles") {
          handleViewModeChange("nick-names");
        }
      } else {
        if (viewMode === "real-names") {
          handleViewModeChange("real-names-roles");
        } else if (viewMode === "nick-names") {
          handleViewModeChange("nick-names-roles");
        }
      }
    }
  }, [isHost, sync.gameEnded, viewMode]);
  const [editingRealName, setEditingRealName] = useState("");
  const [editingAvatar, setEditingAvatar] = useState("");
  const [avatarSearch, setAvatarSearch] = useState("");
  const [avatarTab, setAvatarTab] = useState("all");

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

  useEffect(() => {
    if (hostPlayerActionTargetId) {
      const p = room?.players.find((x) => x.id === hostPlayerActionTargetId);
      setEditingRealName(p?.playerRealName || "");
      setEditingAvatar(p?.playerAvatar || "");
      setAvatarSearch("");
      setAvatarTab("all");
    }
  }, [hostPlayerActionTargetId, room?.players]);

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
            if (isUnknownSaved && isAssignedServer) {
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
    if (myPlayer && mySavedAvatar && myPlayer.playerAvatar !== mySavedAvatar) {
      socket.emit("hostSetPlayerAvatar", {
        roomId: room.id,
        targetId: clientId,
        playerAvatar: mySavedAvatar
      });
    }
  }, [room?.players, room?.id, clientId, socket]);

  const [targetRoleDisplayOrderByPlayerId, setTargetRoleDisplayOrderByPlayerId] = useState<Record<string, TargetRoleDisplayOrder>>({});
  const [hostRuleEliminateTargetId, setHostRuleEliminateTargetId] = useState<string | null>(null);
  const [hostDisconnected, setHostDisconnected] = useState(false);
  const [frozenRoomSnapshot, setFrozenRoomSnapshot] = useState<any | null>(null);
  const [rulesRestartOverlay, setRulesRestartOverlay] = useState<{
    message: string;
    totalMs: number;
    fadeInMs: number;
    holdMs: number;
    fadeOutMs: number;
    key: number;
  } | null>(null);

  const [duskTransitionActive, setDuskTransitionActive] = useState(false);
  const [lowPerformanceMode, setLowPerformanceMode] = useState(() => {
    if (typeof window !== "undefined") {
      return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.matchMedia("(pointer: coarse)").matches;
    }
    return false;
  });
  const [isAnimatingLeaf, setIsAnimatingLeaf] = useState(false);
  const [showLowPerfToast, setShowLowPerfToast] = useState(false);

  useEffect(() => {
    if (lowPerformanceMode) {
      setShowLowPerfToast(true);
      const timer = setTimeout(() => {
        setShowLowPerfToast(false);
      }, 3000);
      return () => clearTimeout(timer);
    } else {
      setShowLowPerfToast(false);
    }
  }, [lowPerformanceMode]);

  const [duskRevealGameUI, setDuskRevealGameUI] = useState(false);
  const duskPlayedRef = useRef(false);

  const [masonryComplete, setMasonryComplete] = useState(false);
  const prevPhaseRef = useRef<string | null>(null);
  const isSelectingLocally = useRef(false);

  useEffect(() => {
    if (phase === "dusk") {
      const hasChosen = room?.duskCardSelections && room.duskCardSelections[clientId] !== undefined;
      if (hasChosen) {
        if (!isSelectingLocally.current) {
          setMasonryComplete(true);
        }
      } else {
        if (prevPhaseRef.current === "dusk") {
          const container = document.querySelector(".float-up-container") as HTMLElement;
          if (container) {
            container.style.animation = "none";
            gsap.to(container, {
              y: window.innerHeight + 300,
              opacity: 0,
              duration: 0.6,
              ease: "power2.in",
              onComplete: () => {
                setMasonryComplete(false);
                setCardFlippedToFront(false);
                isSelectingLocally.current = false;
              }
            });
          } else {
            setMasonryComplete(false);
            setCardFlippedToFront(false);
            isSelectingLocally.current = false;
          }
        } else {
          setMasonryComplete(false);
          setCardFlippedToFront(false);
          isSelectingLocally.current = false;
        }
      }
    } else {
      setMasonryComplete(false);
      isSelectingLocally.current = false;
    }
    prevPhaseRef.current = phase;
  }, [phase, room?.duskCardSelections, clientId]);

  useEffect(() => {
    if (phase === "dusk" && room?.phase === "dusk") {
      if (!duskPlayedRef.current) {
        setDuskTransitionActive(true);
        duskPlayedRef.current = true;
        setDuskRevealGameUI(false);
        const timer = window.setTimeout(() => {
          setDuskRevealGameUI(true);
        }, 1200);
        return () => window.clearTimeout(timer);
      }
    } else if (phase !== "dusk") {
      duskPlayedRef.current = false;
      setDuskRevealGameUI(true);
    }
  }, [phase, room?.phase]);

  const showNotice = useCallback((title: string, message: string, onConfirm?: () => void) => {
    setNoticeModal({ title, message, onConfirm });
  }, []);

  useEffect(() => {
    setTargetRoleDisplayOrderByPlayerId({});
  }, [roomId]);

  const [highlightPlayerId, setHighlightPlayerId] = useState<string | null>(null);
  const [secondaryHighlightPlayerIds, setSecondaryHighlightPlayerIds] = useState<string[]>([]);
  const [dangerHighlightPlayerIds, setDangerHighlightPlayerIds] = useState<string[]>([]);
  const [autoTrialHighlight, setAutoTrialHighlight] = useState<{
    primaryId: string | null;
    secondaryIds: string[];
    dangerIds: string[];
  } | null>(null);
  const [autoTrialHighlightSuppressed, setAutoTrialHighlightSuppressed] = useState(false);
  const lastDayDeadlineRef = useRef<number | null>(null);
  const lastGameLogCountRef = useRef<number>(0);
  const lastTrialVotesRef = useRef<Record<string, "live" | "die" | null> | null>(null);
  const lastTrialVerdictHighlightSeqRef = useRef<number>(0);
  
  const clearVerdictHighlight = useCallback(() => {
    setAutoTrialHighlight(null);
    setAutoTrialHighlightSuppressed(false);
    setHighlightPlayerId(null);
    setSecondaryHighlightPlayerIds([]);
    setDangerHighlightPlayerIds([]);
  }, []);

  const handleLogHighlightPlayer = useCallback((payload: { primaryId: string | null; secondaryIds?: string[]; dangerIds?: string[] }) => {
    const secondaryIds = payload.secondaryIds || [];
    const dangerIds = payload.dangerIds || [];
    const isClear = !payload.primaryId && secondaryIds.length === 0 && dangerIds.length === 0;
    if (!isClear) {
      setAutoTrialHighlightSuppressed(true);
    }
    if (!isClear && dangerIds.length > 0) {
      setAutoTrialHighlight({
        primaryId: payload.primaryId,
        secondaryIds,
        dangerIds,
      });
    }
    if (isClear && autoTrialHighlight) {
      setAutoTrialHighlightSuppressed(false);
      setHighlightPlayerId(autoTrialHighlight.primaryId);
      setSecondaryHighlightPlayerIds(autoTrialHighlight.secondaryIds);
      setDangerHighlightPlayerIds(autoTrialHighlight.dangerIds);
      return;
    }
    if (isClear) {
      setAutoTrialHighlightSuppressed(false);
    }
    setHighlightPlayerId(payload.primaryId);
    setSecondaryHighlightPlayerIds(secondaryIds);
    setDangerHighlightPlayerIds(dangerIds);
  }, [autoTrialHighlight]);

  useEffect(() => {
    if (sync.trialStage === "defense" || sync.trialStage === "verdict") {
      lastTrialVotesRef.current = null;
    }
  }, [sync.trialStage, sync.trialTargetId]);

  useEffect(() => {
    if (!sync.trialVotes) return;
    lastTrialVotesRef.current = sync.trialVotes;
  }, [sync.trialVotes]);

  useEffect(() => {
    if (!sync.trialVerdictFinished || !sync.trialVerdictFinishedSeq) return;
    if (lastTrialVerdictHighlightSeqRef.current === sync.trialVerdictFinishedSeq) return;
    lastTrialVerdictHighlightSeqRef.current = sync.trialVerdictFinishedSeq;
    const targetId = sync.trialVerdictFinished.targetId;
    if (!targetId) return;
    const votes = (lastTrialVotesRef.current || {}) as Record<string, "live" | "die" | null>;
    let liveVoterIds = Object.entries(votes)
      .filter(([, vote]) => vote === "live")
      .map(([id]) => id);
    let dieVoterIds = Object.entries(votes)
      .filter(([, vote]) => vote === "die")
      .map(([id]) => id);

    if (liveVoterIds.length === 0 && dieVoterIds.length === 0) {
      const lastNight = (sync.gameLogNights || []).slice().sort((a, b) => (a.night || 0) - (b.night || 0)).pop();
      const lastVerdict = (lastNight?.entries || []).slice().reverse().find(
        (entry) => entry.type === "trial_verdict" && entry.targetId === targetId
      );
      if (lastVerdict && lastVerdict.type === "trial_verdict") {
        liveVoterIds = lastVerdict.liveVoterIds || [];
        dieVoterIds = lastVerdict.dieVoterIds || [];
      }
    }

    const highlightPayload = {
      primaryId: null,
      secondaryIds: liveVoterIds,
      dangerIds: dieVoterIds,
    };
    setAutoTrialHighlight(highlightPayload);
    setAutoTrialHighlightSuppressed(false);
    setHighlightPlayerId(highlightPayload.primaryId);
    setSecondaryHighlightPlayerIds(highlightPayload.secondaryIds);
    setDangerHighlightPlayerIds(highlightPayload.dangerIds);
  }, [sync.gameLogNights, sync.trialVerdictFinished, sync.trialVerdictFinishedSeq]);

  useEffect(() => {
    if (phase !== "night" && phase !== "dusk") return;
    clearVerdictHighlight();
    lastTrialVotesRef.current = null;
  }, [clearVerdictHighlight, phase]);

  useEffect(() => {
    const nextDayDeadline = sync.dayDeadline ?? null;
    if (nextDayDeadline && nextDayDeadline !== lastDayDeadlineRef.current) {
      clearVerdictHighlight();
    }
    lastDayDeadlineRef.current = nextDayDeadline;
  }, [clearVerdictHighlight, sync.dayDeadline]);

  useEffect(() => {
    if (!sync.dayPhaseSeq) return;
    const id = window.setTimeout(clearVerdictHighlight, 0);
    return () => window.clearTimeout(id);
  }, [clearVerdictHighlight, sync.dayPhaseSeq]);

  useEffect(() => {
    const count = (sync.gameLogNights || []).length;
    if (count === 0 && lastGameLogCountRef.current > 0) {
      lastTrialVerdictHighlightSeqRef.current = 0;
      clearVerdictHighlight();
    }
    lastGameLogCountRef.current = count;
  }, [clearVerdictHighlight, sync.gameLogNights]);

  const canViewLog = room?.isReplay === true || (!isDusk && (isHost || phase === "day" || !!sync.gameEnded));
  const canViewRoles = isHost || !!sync.gameEnded;

  useEffect(() => {
    if (phase !== "night") return;
    if (nightTurnPaused) return;
    setNightTurnNow(Date.now() + serverTimeOffset);
    const t = setInterval(() => setNightTurnNow(Date.now() + serverTimeOffset), 1000);
    return () => clearInterval(t);
  }, [nightTurnPaused, phase, serverTimeOffset]);

  const isSimultaneousNight = phase === "night" && allNightActionsSimultaneous;

  const witchBonusApplies = useMemo(() => {
    const rules = room?.gameRules;
    if (!rules) return false;
    const nonWolf = rules.nonWolfNightActionDurationSec || 0;
    const wolf = rules.wolfNightActionDurationSec || 0;
    return nonWolf > 0 && wolf === nonWolf;
  }, [room?.gameRules]);

  const witchBonusNeedsUsablePotion = room?.gameRules?.witchBonusTimeRequiresUsablePotion !== false;
  const witchHasUsablePotion = !(
    sync.witchPotions?.healUsed === true &&
    sync.witchPotions?.poisonUsed === true
  );
  const myNightActionExtraMs = useMemo(() => {
    if (!clientId) return 0;
    const value = room?.nightActionExtraTimeMsByPlayerId?.[clientId] || 0;
    return Math.max(0, Math.floor(value));
  }, [room?.nightActionExtraTimeMsByPlayerId]);
  const baseWolfDeadline = room?.wolfDeadline ?? sync.wolfDeadline ?? null;

  const isWolfTeamRole =
    role === "Sói" ||
    role === "Sói con" ||
    role === "Sói Dại" ||
    (role === "Bán sói" && isBanSoiOrWildConverted);

  const myWolfDeadline = useMemo(() => {
    if (!isSimultaneousNight) return baseWolfDeadline;
    const activeBaseDeadline = baseWolfDeadline ?? nightTurnDeadline ?? null;
    if (!activeBaseDeadline) return null;
    return activeBaseDeadline + myNightActionExtraMs;
  }, [baseWolfDeadline, isSimultaneousNight, myNightActionExtraMs, nightTurnDeadline]);

  const mySimultaneousDeadline = useMemo(() => {
    if (!isSimultaneousNight) return null;
    if (!role) return null;
    if (role === "Bán sói" && !isBanSoiOrWildConverted) return null;
    if (!NIGHT_ACTION_ROLE_SET.has(role) && !ELEMENTAL_ROLE_SET.has(role)) return null;

    if (isWolfTeamRole) return myWolfDeadline;
    if (role === "Linh sói") {
      if (!sync.spiritWolfDecisionTargetId) return null;
      const spiritBaseDeadline = room ? room.spiritWolfDecisionDeadline ?? null : sync.spiritWolfDecisionDeadline ?? null;
      if (!spiritBaseDeadline) return null;
      return spiritBaseDeadline + myNightActionExtraMs;
    }

    const baseDeadline = nightTurnDeadline ?? null;
    if (!baseDeadline) return null;
    let deadline = baseDeadline + myNightActionExtraMs;
    if (
      role === "Phù thủy" &&
      witchBonusApplies &&
      (!witchBonusNeedsUsablePotion || witchHasUsablePotion)
    ) {
      deadline += 10_000;
    }
    return deadline;
  }, [
    isBanSoiOrWildConverted,
    isSimultaneousNight,
    isWolfTeamRole,
    myNightActionExtraMs,
    myWolfDeadline,
    nightTurnDeadline,
    role,
    room?.spiritWolfDecisionDeadline,
    sync.spiritWolfDecisionDeadline,
    sync.spiritWolfDecisionTargetId,
    witchBonusApplies,
    witchBonusNeedsUsablePotion,
    witchHasUsablePotion,
  ]);


  const isSequentialNight = phase === "night" && !allNightActionsSimultaneous;

  const nightTurnRemainingSec = useMemo(() => {
    if (!isSequentialNight || !currentNightTurnRole) return null;
    if (nightTurnPaused) {
      if (nightTurnRemainingMs == null) return null;
      return Math.max(0, Math.ceil(nightTurnRemainingMs / 1000));
    }
    if (!nightTurnDeadline) return null;
    return Math.max(0, Math.ceil((nightTurnDeadline - nightTurnNow) / 1000));
  }, [currentNightTurnRole, isSequentialNight, nightTurnDeadline, nightTurnNow, nightTurnPaused, nightTurnRemainingMs]);

  const simultaneousRemainingSec = useMemo(() => {
    if (!isSimultaneousNight) return null;
    if (nightTurnPaused) {
      if (nightTurnRemainingMs == null) return null;
      return Math.max(0, Math.ceil(nightTurnRemainingMs / 1000));
    }
    if (!mySimultaneousDeadline) return null;
    return Math.max(0, Math.ceil((mySimultaneousDeadline - nightTurnNow) / 1000));
  }, [isSimultaneousNight, mySimultaneousDeadline, nightTurnNow, nightTurnPaused, nightTurnRemainingMs]);

  const isRoomSimultaneousCountdownExpired = useMemo(() => {
    if (!isSimultaneousNight || nightTurnPaused) return false;
    if (!nightTurnDeadline) return false;
    return nightTurnDeadline <= nightTurnNow;
  }, [isSimultaneousNight, nightTurnPaused, nightTurnDeadline, nightTurnNow]);

  const canHostToggleNightTimer = useMemo(() => {
    if (phase !== "night" || !!sync.gameEnded) return false;
    if (isSequentialNight) return !!currentNightTurnRole;
    if (!allNightActionsSimultaneous) return false;
    const wolfDeadline = room?.wolfDeadline ?? sync.wolfDeadline ?? null;
    const spiritDeadline = room?.spiritWolfDecisionDeadline ?? sync.spiritWolfDecisionDeadline ?? null;
    return nightTurnPaused || !!nightTurnDeadline || !!wolfDeadline || !!spiritDeadline;
  }, [
    allNightActionsSimultaneous,
    currentNightTurnRole,
    isSequentialNight,
    nightTurnDeadline,
    nightTurnPaused,
    phase,
    room?.spiritWolfDecisionDeadline,
    room?.wolfDeadline,
    sync.gameEnded,
    sync.spiritWolfDecisionDeadline,
    sync.wolfDeadline,
  ]);

  const isSeerTurnActive = useMemo(() => {
    if (phase !== "night") return false;
    if (allNightActionsSimultaneous) return true;
    return currentNightTurnRole === "Tiên tri";
  }, [allNightActionsSimultaneous, currentNightTurnRole, phase]);

  const doesNightTurnMatchMyRole = useMemo(() => {
    if (!currentNightTurnRole) return false;
    if (currentNightTurnRole === "Sói") return isWolfTeamRole;
    if (role === "Bán sói" && !isBanSoiOrWildConverted) return false;
    return role === currentNightTurnRole;
  }, [currentNightTurnRole, isBanSoiOrWildConverted, isWolfTeamRole, role]);

  const isNightActionTimeExpired = useMemo(() => {
    if (phase !== "night" || sync.gameEnded) return false;
    if (isSequentialNight) {
      if (!doesNightTurnMatchMyRole) return false;
      return nightTurnRemainingSec !== null && nightTurnRemainingSec <= 0;
    } else {
      if (mySimultaneousDeadline) {
        return simultaneousRemainingSec !== null && simultaneousRemainingSec <= 0;
      }
      return isRoomSimultaneousCountdownExpired;
    }
  }, [
    phase,
    sync.gameEnded,
    isSequentialNight,
    doesNightTurnMatchMyRole,
    nightTurnRemainingSec,
    mySimultaneousDeadline,
    simultaneousRemainingSec,
    isRoomSimultaneousCountdownExpired,
  ]);

  useEffect(() => {
    if (phase !== "night") {
      setIsNightInfoVisible(true);
      return;
    }
    if (isNightActionTimeExpired) {
      setIsNightInfoVisible(false);
    } else {
      setIsNightInfoVisible(true);
    }
  }, [isNightActionTimeExpired, phase]);

  const hasSecretConditionalRolePrompt =
    !!sync.spiritWolfDecisionTargetId &&
    (allNightActionsSimultaneous || currentNightTurnRole === "Linh sói");

  useEffect(() => {
    if (!roomId) return;
    if (!canViewLog) return;
    socket.emit("requestGameLog", { roomId });
  }, [canViewLog, roomId]);

  useEffect(() => {
    if (!roomId) return;
    const syncGamePresence = () => {
      socket.emit("setPlayerViewState", { roomId, view: "game" });
    };

    syncGamePresence();
    socket.on("connect", syncGamePresence);

    return () => {
      socket.off("connect", syncGamePresence);
    };
  }, [roomId]);

  useEffect(() => {
    if (!roomId) return;
    const storageKey = `hostRestartCinematic:${roomId}`;
    const raw = sessionStorage.getItem(storageKey);
    if (!raw) return;

    sessionStorage.removeItem(storageKey);

    try {
      const parsed = JSON.parse(raw) as {
        message?: string;
        fadeInMs?: number;
        holdMs?: number;
        fadeOutMs?: number;
      };

      const fadeInMs = Math.max(0, parsed?.fadeInMs ?? 1000);
      const holdMs = Math.max(0, parsed?.holdMs ?? 2000);
      const fadeOutMs = Math.max(0, parsed?.fadeOutMs ?? 500);
      const totalMs = fadeInMs + holdMs + fadeOutMs;
      const overlayKey = Date.now();

      setRulesRestartOverlay({
        message: parsed?.message || "Đang khởi tạo ván chơi mới",
        fadeInMs,
        holdMs,
        fadeOutMs,
        totalMs,
        key: overlayKey,
      });

      window.setTimeout(() => {
        setRulesRestartOverlay((prev) => (prev && prev.key === overlayKey ? null : prev));
      }, totalMs + 50);
    } catch {
      // ignore
    }
  }, [roomId]);

  useEffect(() => {
    const handleReturnResult = (payload: { ok: boolean; roomId?: string; reason?: "kicked" | "room_closed" }) => {
      if (!roomId) return;
      if (payload?.roomId && payload.roomId !== roomId) return;

      if (payload?.ok) {
        nav(`/room?roomId=${roomId}`);
        return;
      }

      if (payload?.reason === "kicked") {
        showNotice(
          "Không thể quay về phòng",
          "Bạn đã bị quản trò mời khỏi phòng. Bạn sẽ được chuyển về Lobby.",
          () => nav("/lobby")
        );
        return;
      }

      showNotice(
        "Phòng đã đóng",
        "Quản trò đã đóng phòng hoặc phòng không còn tồn tại. Bạn sẽ được chuyển về Lobby.",
        () => nav("/lobby")
      );
    };

    const handleForceReturnToRoom = (payload: { roomId?: string }) => {
      if (!roomId) return;
      if (payload?.roomId && payload.roomId !== roomId) return;
      nav(`/room?roomId=${roomId}`);
    };

    socket.on("returnToRoomResult", handleReturnResult);
    socket.on("forceReturnToRoom", handleForceReturnToRoom);

    return () => {
      socket.off("returnToRoomResult", handleReturnResult);
      socket.off("forceReturnToRoom", handleForceReturnToRoom);
    };
  }, [nav, roomId, showNotice]);

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

  useEffect(() => {
    if (!roomId) return;
    if (!sync.gameEnded) return;
    socket.emit("requestGameLog", { roomId });
  }, [roomId, sync.gameEnded]);

  useEffect(() => {
    const handleGameStarted = () => {
      setNoticeModal(null);
      lastTrialVerdictHighlightSeqRef.current = 0;
      clearVerdictHighlight();
    };
    socket.on("gameStarted", handleGameStarted);
    return () => {
      socket.off("gameStarted", handleGameStarted);
    };
  }, [clearVerdictHighlight]);

  useEffect(() => {
    if (!roomId) return;
    if (!isHost) return;
    socket.emit("requestRolesReveal", { roomId });
  }, [roomId, isHost]);

  useEffect(() => {
    if (!roomId) return;
    if (!sync.gameEnded) return;
    socket.emit("requestRolesReveal", { roomId });
  }, [roomId, sync.gameEnded]);

  useEffect(() => {
    if (!sync.gameEnded || isHost || !room) return;
    if (frozenRoomSnapshot) return;
    setFrozenRoomSnapshot({
      ...room,
      players: (room.players || []).map((p: any) => ({ ...p })),
      positions: (room.positions || []).map((p: any) => ({ ...p })),
      deadPlayers: [...((room.deadPlayers || []) as string[])],
    });
  }, [frozenRoomSnapshot, isHost, room, sync.gameEnded]);

  useEffect(() => {
    if (sync.gameEnded) return;
    if (frozenRoomSnapshot) {
      setFrozenRoomSnapshot(null);
    }
  }, [frozenRoomSnapshot, sync.gameEnded]);

  const roomForDisplay = useMemo(
    () => (!isHost && sync.gameEnded && frozenRoomSnapshot ? frozenRoomSnapshot : room),
    [frozenRoomSnapshot, isHost, room, sync.gameEnded]
  );
  const displayNightNumber = roomForDisplay?.nightCount ?? 0;

  const displayDeadPlayers = useMemo<string[]>(() => {
    if (!isHost && sync.gameEnded && frozenRoomSnapshot) {
      return (frozenRoomSnapshot.deadPlayers || []) as string[];
    }
    if (isCurrentPlayerHiddenRevived && clientId) {
      return deadPlayers.filter((id) => id !== clientId);
    }
    return deadPlayers;
  }, [deadPlayers, frozenRoomSnapshot, isCurrentPlayerHiddenRevived, isHost, sync.gameEnded]);

  const playerNamesById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const p of roomForDisplay?.players || []) {
      map[p.id] = p.name;
    }
    return map;
  }, [roomForDisplay?.players]);

  const playerRealNamesById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const p of roomForDisplay?.players || []) {
      if (p.playerRealName) {
        map[p.id] = p.playerRealName;
      }
    }
    return map;
  }, [roomForDisplay?.players]);

  const logPanel = canViewLog ? (
    <GameLogPanel
      nights={sync.gameLogNights || []}
      rolesByPlayerId={sync.revealedRolesByPlayerId || {}}
      playerNamesById={playerNamesById}
      playerRealNamesById={playerRealNamesById}
      viewMode={viewMode}
      onViewModeChange={handleViewModeChange}
      targetRoleDisplayOrderByPlayerId={targetRoleDisplayOrderByPlayerId}
      onHighlightPlayer={handleLogHighlightPlayer}
      canViewNightLogs={true}
      isHost={isHost}
      myPlayerId={clientId || undefined}
      myRole={role || undefined}
      loveState={sync.loveState}
      wolves={sync.wolves}
      wolfBadgeRoles={sync.wolfBadgeRolesByPlayerId}
      gameRules={room?.gameRules}
      gameEnded={!!sync.gameEnded}
      isReplay={room?.isReplay}
    />
  ) : null;

  const visibleLoveRoleBadges = useMemo(() => {
    if (!clientId) return {};
    const partnerId = sync.loveState.partnerId;
    if (!partnerId || !sync.loveState.pairIds.includes(clientId)) return {};
    if (!sync.gameEnded) {
      if (phase !== "night") return {};
      if (!isNightInfoVisible) return {};
      if (!allNightActionsSimultaneous && !doesNightTurnMatchMyRole) return {};
    }
    const partnerRole = sync.loveState.rolesByPlayerId?.[partnerId];
    return partnerRole ? { [partnerId]: partnerRole } : {};
  }, [
    allNightActionsSimultaneous,
    doesNightTurnMatchMyRole,
    phase,
    sync.gameEnded,
    sync.loveState.pairIds,
    sync.loveState.partnerId,
    sync.loveState.rolesByPlayerId,
    isNightInfoVisible,
  ]);

  const dayVoteWeightsByVoterId = useMemo(() => {
    const publicRoles = roomForDisplay?.publicRevealedRolesByPlayerId || {};
    const entries = Object.entries(publicRoles).filter(([, publicRole]) => publicRole === "Trưởng làng");
    if (!entries.length) return undefined;
    return Object.fromEntries(entries.map(([playerId]) => [playerId, 2]));
  }, [roomForDisplay?.publicRevealedRolesByPlayerId]);

  const roomForRoles = useMemo(
    () =>
      room ??
      ({
        players: [],
        wolfVotes: undefined,
        wolfVotes2: undefined,
        deadPlayers: [],
        playerRoles: {},
      } as any),
    [room]
  );

  const [hunterBulletAnim, setHunterBulletAnim] = useState<
    | {
        fromPlayerId: string;
        toPlayerId: string;
        startedAt: number;
        durationMs: number;
        assetSrc?: string;
        alt?: string;
        rotationOffsetDeg?: number;
        kind: "hunter" | "love";
      }
    | null
  >(null);
  const hunterBulletTimeoutRef = useRef<number | null>(null);
  const lastHunterShotRef = useRef<{ hunterId: string; targetId: string } | null>(null);
  const lastDayVoteNoticeSeqRef = useRef(0);
  const lastTrialVerdictNoticeSeqRef = useRef(0);

  const playHunterShotAnim = useCallback((
    hunterId: string,
    targetId: string,
    options?: { assetSrc?: string; alt?: string; rotationOffsetDeg?: number; kind?: "hunter" | "love" }
  ) => {
    if (!hunterId || !targetId || hunterId === targetId) return;

    if (hunterBulletTimeoutRef.current) {
      window.clearTimeout(hunterBulletTimeoutRef.current);
      hunterBulletTimeoutRef.current = null;
    }

    const duration = options?.kind === "love" ? 4400 : HUNTER_BULLET_ANIM_MS;

    setHunterBulletAnim({
      fromPlayerId: hunterId,
      toPlayerId: targetId,
      startedAt: performance.now(),
      durationMs: duration,
      assetSrc: options?.assetSrc,
      alt: options?.alt,
      rotationOffsetDeg: options?.rotationOffsetDeg,
      kind: options?.kind ?? "hunter",
    });

    hunterBulletTimeoutRef.current = window.setTimeout(() => {
      setHunterBulletAnim(null);
      hunterBulletTimeoutRef.current = null;
    }, duration);
  }, []);

  useEffect(() => {
    const shot = sync.hunterShot;
    if (!shot?.hunterId || !shot?.targetId) return;

    lastHunterShotRef.current = { hunterId: shot.hunterId, targetId: shot.targetId };
    if (phase === "day" && !shouldRevealHunterShotInDay) return;

    const frame = window.requestAnimationFrame(() => {
      playHunterShotAnim(shot.hunterId, shot.targetId);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [phase, playHunterShotAnim, shouldRevealHunterShotInDay, sync.hunterShot, sync.hunterShotSeq]);

  useEffect(() => {
    const shot = sync.loveArrowShot;
    if (!shot?.cupidId || !shot?.targetId) return;

    const frame = window.requestAnimationFrame(() => {
      playHunterShotAnim(shot.cupidId, shot.targetId, {
        assetSrc: encodeURI("/Mũi tên.svg"),
        alt: "Mũi tên",
        rotationOffsetDeg: -45,
        kind: "love",
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [playHunterShotAnim, sync.loveArrowShot, sync.loveArrowShotSeq]);

  const mock8 = useMock8Test({
    roomId,
    room,
    deadPlayers,
    playHunterShotAnim,
    setIsNightInfoVisible,
    setCardFlippedToFront,
    debugAnim,
    roleOverride,
    setRoleOverride,
  });

  const handleToggleNightInfoVisible = useCallback((visible: boolean | ((prev: boolean) => boolean)) => {
    if (room?.id === "mock-8") {
      // Danh sách các vai trò để kiểm thử giao diện
      const TEST_ROLES = ["Thần tình yêu", "Phù thủy", "Sói Dại", "Tiên tri", "Bảo vệ", "Thợ săn"];
      const currentRole = roleOverride || "Thần tình yêu";
      const nextIndex = (TEST_ROLES.indexOf(currentRole) + 1) % TEST_ROLES.length;
      const nextRole = TEST_ROLES[nextIndex]!;
      setRoleOverride(nextRole);
      // Luôn bật hiển thị để giao diện role mới được vẽ ra
      setIsNightInfoVisible(true);
      setCardFlippedToFront(true);
    } else {
      setIsNightInfoVisible(visible);
    }
  }, [room?.id, roleOverride, setRoleOverride, setIsNightInfoVisible, setCardFlippedToFront]);

  const deadPlayersOverrideForRender = useMemo(() => {
    if (!hunterBulletAnim) return displayDeadPlayers;
    const { fromPlayerId, toPlayerId } = hunterBulletAnim;
    return displayDeadPlayers.filter((id) => id !== fromPlayerId && id !== toPlayerId);
  }, [displayDeadPlayers, hunterBulletAnim]);

  const shouldDelayConfirmModals =
    phase === "day" && shouldRevealHunterShotInDay && hunterBulletAnim?.kind === "hunter";
  const canShowConfirmModals = !shouldDelayConfirmModals;

  const seerMaxChecksTonight = useMemo(() => {
    const buff = sync.elementalBuffResult;
    if (!buff || buff.buffId !== "seer-check-two") return 1;
    if (buff.appliesNight !== room?.nightCount) return 1;
    return 2;
  }, [sync.elementalBuffResult, room?.nightCount]);

  const seer = useSeerRole({
    roomId,
    phase,
    role,
    deadPlayers: deadPlayersForNightActions,
    seerResults: sync.seerResults,
    allNightActionsSimultaneous,
    currentNightTurnRole,
    nightTurnPaused,
    nightActionDeadline: mySimultaneousDeadline,
    nightActionNow: nightTurnNow,
    maxChecksTonight: seerMaxChecksTonight,
  });
  const cursed = useCursedRole({
    roomId,
    phase,
    role,
    nightCount: room?.nightCount,
    deadPlayers: deadPlayersForNightActions,
    cursedResult: sync.cursedResult,
    cursedTargetId: sync.cursedTargetId,
    cursedLastTargetId: sync.cursedLastTargetId,
    cursedUsesRemaining: sync.cursedUsesRemaining,
    allNightActionsSimultaneous,
    currentNightTurnRole,
    nightActionDeadline: mySimultaneousDeadline,
    nightActionNow: nightTurnNow,
  });
  const merchant = useMerchantRole({
    roomId,
    phase,
    role,
    room: roomForRoles,
    deadPlayers: deadPlayersForNightActions,
    merchantState: sync.merchantPrivateState,
    allNightActionsSimultaneous,
    currentNightTurnRole,
    nightActionDeadline: mySimultaneousDeadline,
    nightActionNow: nightTurnNow,
  });
  const wolf = useWolfRole({
    roomId,
    phase,
    role,
    room: roomForRoles,
    deadPlayers: deadPlayersForNightActions,
    wolfBadgeRoles: sync.wolfBadgeRolesByPlayerId,
    wolfLocked: sync.wolfLocked,
    wolfDeadline: myWolfDeadline,
    wolves: sync.wolves,
    activeWolves: sync.activeWolves,
    wolfMaxTargets: sync.wolfMaxTargets,
    wolfBiteDisabled: sync.wolfBiteDisabled,
    allNightActionsSimultaneous,
    currentNightTurnRole,
    nightTurnPaused,
    nightActionNow: nightTurnNow,
  });
  const guardian = useGuardianRole({
    roomId,
    phase,
    role,
    deadPlayers: deadPlayersForNightActions,
    guardianProtectedSeq: sync.guardianProtectedSeq,
    guardianProtectedTargetId: sync.guardianProtectedTargetId,
    allNightActionsSimultaneous,
    currentNightTurnRole,
    nightTurnPaused,
    nightActionDeadline: mySimultaneousDeadline,
    nightActionNow: nightTurnNow,
  });

  const protector = useProtectorRole({
    roomId,
    phase,
    role,
    room: roomForRoles,
    deadPlayers: deadPlayersForNightActions,
    protectorTargetId: sync.protectorTargetId,
    protectorHasUsed: sync.protectorHasUsed,
    allNightActionsSimultaneous,
    currentNightTurnRole,
    nightActionDeadline: mySimultaneousDeadline,
    nightActionNow: nightTurnNow,
  });

  const witch = useWitchRole({
    roomId,
    phase,
    role,
    room: roomForRoles,
    deadPlayers: deadPlayersForNightActions,
    witchPendingDeathTargetIds: sync.witchPendingDeathTargetIds,
    witchPotions: sync.witchPotions,
    allNightActionsSimultaneous,
    currentNightTurnRole,
    nightTurnPaused,
    nightActionDeadline: mySimultaneousDeadline,
    nightActionNow: nightTurnNow,
    isNightInfoVisible,
  });

  const hunter = useHunterRole({
    roomId,
    phase,
    role,
    deadPlayers: deadPlayersForNightActions,
    hunterTargetSeq: sync.hunterTargetSeq,
    hunterTargetId: sync.hunterTargetId,
    allNightActionsSimultaneous,
    currentNightTurnRole,
    nightTurnPaused,
    nightActionDeadline: mySimultaneousDeadline,
    nightActionNow: nightTurnNow,
  });

  const love = useLoveRole({
    roomId,
    phase,
    role,
    room: roomForRoles,
    deadPlayers: deadPlayersForNightActions,
    loveState: sync.loveState,
    allNightActionsSimultaneous,
    currentNightTurnRole,
    nightActionDeadline: allNightActionsSimultaneous ? mySimultaneousDeadline : nightTurnDeadline,
    nightActionNow: nightTurnNow,
    doesNightTurnMatchMyRole,
  });

  const spiritWolf = useSpiritWolfRole({
    roomId,
    phase,
    role,
    room: roomForRoles,
    deadPlayers: deadPlayersForNightActions,
    decisionTargetId: sync.spiritWolfDecisionTargetId,
    allNightActionsSimultaneous,
    currentNightTurnRole,
    nightTurnPaused,
    nightActionDeadline: allNightActionsSimultaneous ? mySimultaneousDeadline : nightTurnDeadline,
    nightActionNow: nightTurnNow,
  });

  const elemental = useElementalRole({
    roomId,
    phase,
    role,
    room: roomForRoles,
    deadPlayers: deadPlayersForNightActions,
    elementalTargetSeq: sync.elementalTargetSeq,
    elementalTargetId: sync.elementalTargetId,
    elementalActionMode: sync.elementalActionMode,
    elementalBuffVoteState: sync.elementalBuffVoteState,
    availableBuffTier: sync.elementalBuffVoteState.availableBuffTier || 0,
    allNightActionsSimultaneous,
    currentNightTurnRole,
    nightActionDeadline: mySimultaneousDeadline,
    nightActionNow: nightTurnNow,
  });

  const loveActionPlacement =
    isWolfTeamRole
      ? "wolf"
      : role === "Phù thủy" || (!!role && ELEMENTAL_ROLE_SET.has(role))
        ? "role-actions"
        : "general";

  const dayVote = useDayVoteRole({
    roomId,
    phase,
    room: roomForRoles,
    deadPlayers,
    dayVotes: sync.dayVotes,
    dayLocked: sync.dayLocked,
    dayDiscussionDeadline: room?.dayDiscussionDeadline ?? sync.dayDiscussionDeadline,
    dayDeadline: room?.dayDeadline ?? sync.dayDeadline,
    dayVoters: sync.dayVoters,
    trialTargetId: room?.trialTargetId ?? sync.trialTargetId,
    trialStage: room?.trialStage ?? sync.trialStage,
    trialDefenseDeadline: room?.trialDefenseDeadline ?? sync.trialDefenseDeadline,
    trialVerdictDeadline: room?.trialVerdictDeadline ?? sync.trialVerdictDeadline,
    trialInteractionCut: room?.trialInteractionCut ?? sync.trialInteractionCut,
    trialInteractionActiveIds: room?.trialInteractionActiveIds ?? sync.trialInteractionActiveIds,
    trialSelectedInteractorId: room?.trialSelectedInteractorId ?? sync.trialSelectedInteractorId,
    trialSelectedInteractorIds: room?.trialSelectedInteractorIds ?? sync.trialSelectedInteractorIds,
    trialInteractionSelectionLimit: room?.trialInteractionSelectionLimit ?? sync.trialInteractionSelectionLimit,
    trialVotes: sync.trialVotes,
    serverTimeOffset,
    dayPaused: !!(room?.dayPaused ?? sync.dayPaused),
    dayRemainingMs: room?.dayRemainingMs ?? sync.dayRemainingMs,
  });

  const angel = useAngelRole({
    roomId,
    phase,
    role,
    room: roomForRoles,
    deadPlayers,
    angelState: sync.angelReviveState,
  });

  // ponytail: hasVisibleActionPanel was declared but never read, so deleted

  const renderSkillHint = () => {
    if (phase !== "night" || !role || isCurrentPlayerDeadForNightActions || !isNightInfoVisible) return null;
    
    let hintText = "";
    if (role === "Thần tình yêu") {
      if (!love.targetId) {
        hintText = "Hãy chọn một người mà bạn muốn ghép đôi bản thân với họ";
      } else {
        if (love.canUseEscape) {
          hintText = "Bạn có thể gửi tín hiệu muốn ra khỏi làng cho nửa kia và nếu cả hai đều đồng ý thì cả bạn và người đó sẽ đều né được mọi sự kiện nhắm vào trong đêm, tuy nhiên điều này sẽ chỉ có thể thực hiện được một lần";
        } else {
          hintText = "Hãy cẩn trọng và cố gắng sống sót, vì nửa kia cũng như vì chính bản thân bạn";
        }
      }
    } else {
      let baseHintText = ROLE_SKILL_HINTS[role] || "";
      if (role === "Bán sói") {
        if (isBanSoiAligned || isWildWolfConverted) {
          baseHintText = ROLE_SKILL_HINTS["Sói"];
        } else {
          baseHintText = "Bạn hiện vẫn là một dân làng nên chưa có khả năng thực hiện hành động đêm. Nhưng hãy cẩn thận vì nếu bạn bị sói tấn công thì dòng máu sói của bạn sẽ trỗi dậy";
        }
      }
      if (role === "Tiên tri" && seer.seerResults && seer.seerResults.length > 0) {
        const lastResult = seer.seerResults[seer.seerResults.length - 1];
        if (lastResult) {
          const targetPlayer = roomForDisplay?.players?.find((p: any) => p.id === lastResult.playerId);
          const targetName = targetPlayer ? targetPlayer.name : "Người chơi";
          baseHintText = lastResult.isWolf 
            ? `${targetName} có lẽ thật sự là sói . . .` 
            : `${targetName} có lẽ là một con người`;
        }
      }
      if (!baseHintText && ELEMENTAL_ROLE_SET.has(role)) {
        baseHintText = "Chọn một người mà bạn nghĩ họ cũng là dân làng nắm giữ nguyên tố";
      }

      const isWolfTeamAction = role === "Sói" || role === "Sói con" || role === "Sói Dại" || (role === "Bán sói" && (isBanSoiAligned || isWildWolfConverted));
      if (isWolfTeamAction && sync.wolfMaxTargets >= 2) {
        baseHintText = baseHintText.replace("chọn một người", 'Chọn <span class="breath-glow-2">2</span> người');
      }
      
      hintText = baseHintText;
      if (love.isPaired) {
        if (love.canUseEscape) {
          hintText = baseHintText + "<br><br>* Bạn có thể gửi tín hiệu muốn ra khỏi làng cho nửa kia và nếu cả hai đều đồng ý thì cả bạn và người đó sẽ đều né được mọi sự kiện nhắm vào trong đêm, tuy nhiên điều này sẽ chỉ có thể thực hiện được một lần";
        } else {
          hintText = baseHintText + "<br><br>* Hãy cẩn trọng và cố gắng sống sót, vì nửa kia cũng như vì chính bản thân bạn";
        }
      }
    }
    
    if (!hintText) return null;

    const isWolf =
      isWolfTeamRole ||
      (role === "Linh sói" && !!room?.spiritWolfWolfAligned) ||
      (role === "Thiên Sứ" && sync.angelReviveState.selectedGuess === "wolves");

    const isHybrid =
      role === "Thần tình yêu" ||
      role === "Tay Buôn" ||
      (role === "Thiên Sứ" && !sync.angelReviveState.selectedGuess) ||
      (role === "Linh sói" && !room?.spiritWolfWolfAligned) ||
      !!loveHybridBackgroundAsset;

    let borderStyle = "1px solid rgba(85, 99, 247, 0.22)";
    let backgroundStyle = "rgba(14, 18, 38, 0.65)";

    if (isHybrid) {
      borderStyle = "1px solid transparent";
      backgroundStyle = "linear-gradient(rgba(18, 14, 38, 0.65), rgba(18, 14, 38, 0.65)) padding-box, linear-gradient(135deg, rgba(85, 99, 247, 0.22), rgba(247, 85, 85, 0.22)) border-box";
    } else if (isWolf) {
      borderStyle = "1px solid rgba(247, 85, 85, 0.22)";
      backgroundStyle = "rgba(38, 14, 14, 0.65)";
    }

    return (
      <>
        <style>{`
          @keyframes fadeBlurIn {
            0% {
              opacity: 0;
              filter: blur(5px);
              transform: translateY(4px);
            }
            100% {
              opacity: 0.9;
              filter: blur(0px);
              transform: translateY(0);
            }
          }
          @keyframes breathGlow {
            0%, 100% {
              text-shadow: 0 0 2px rgba(244, 63, 94, 0.4);
              opacity: 0.8;
            }
            50% {
              text-shadow: 0 0 8px rgba(244, 63, 94, 0.9), 0 0 12px rgba(244, 63, 94, 0.4);
              opacity: 1;
            }
          }
          .breath-glow-2 {
            color: #F43F5E;
            font-weight: bold;
            animation: breathGlow 2s ease-in-out infinite;
            display: inline-block;
          }
          .role-skill-hint {
            animation: fadeBlurIn 0.5s cubic-bezier(0.25, 1, 0.5, 1) forwards;
          }
          @media (max-width: 768px) {
            .role-skill-hint {
              max-width: ${role === "Sói Dại" ? "63%" : role === "Tay Buôn" ? "57%" : role === "Phù thủy" ? "61%" : role === "Tiên tri" ? "71%" : role === "Bảo vệ" ? "76%" : role === "Thần tình yêu" ? "57.5%" : "62%"} !important;
              margin-right: auto !important;
            }
          }
          @media (min-width: 769px) {
            .role-skill-hint {
              max-width: 550px !important;
              margin-right: auto !important;
            }
          }
        `}</style>
        <div 
          key={hintText}
          className="role-skill-hint"
          style={{
            background: backgroundStyle,
            backdropFilter: "blur(10px)",
            border: borderStyle,
            borderRadius: "10px",
            padding: "8px 12px",
            color: "#e2e8f0",
            fontSize: "0.69rem",
            lineHeight: "1.4",
            boxShadow: "0 6px 24px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.05)",
            textAlign: "left",
            pointerEvents: "auto",
            marginTop: "12px",
            zIndex: 5,
            fontStyle: "italic",
            opacity: 0.9,
          }}
          dangerouslySetInnerHTML={{ __html: hintText }}
        />
      </>
    );
  };

  const roleBadgesForDisplay = useMemo(() => {
    const loveRoleBadges = visibleLoveRoleBadges;
    const publicRoleBadges = roomForDisplay?.publicRevealedRolesByPlayerId || {};
    const hasLoveRoleBadges = Object.keys(loveRoleBadges).length > 0;
    const hasPublicRoleBadges = Object.keys(publicRoleBadges).length > 0;
    const allRoleBadges = sync.revealedRolesByPlayerId || {};

    if (isHost) {
      return { ...allRoleBadges, ...publicRoleBadges };
    }

    if (!canViewRoles) {
      const mergedPublic = { ...publicRoleBadges, ...loveRoleBadges };
      return hasPublicRoleBadges || hasLoveRoleBadges ? mergedPublic : undefined;
    }

    if (!isSequentialNight || sync.gameEnded) return { ...allRoleBadges, ...publicRoleBadges, ...loveRoleBadges };

    const filteredBadges = Object.fromEntries(
      Object.entries(allRoleBadges).filter(([, playerRole]) => {
        if (playerRole === "Bán sói" && !isBanSoiAligned) return false;
        return doesRoleMatchNightTurn(playerRole, currentNightTurnRole);
      })
    );
    return { ...filteredBadges, ...publicRoleBadges, ...loveRoleBadges };
  }, [canViewRoles, currentNightTurnRole, isBanSoiAligned, isHost, isSequentialNight, roomForDisplay?.publicRevealedRolesByPlayerId, sync.gameEnded, sync.revealedRolesByPlayerId, visibleLoveRoleBadges]);

  const isLocalPlayerAbleToAct = useMemo(() => {
    if (room?.id === "mock-8") return true;
    if (!clientId || !room || room.gameOver) return false;
    const isDead = deadPlayers.includes(clientId);

    if (isDead) {
      if (role === "Thiên Sứ") {
        return sync.angelReviveState?.canRevive === true;
      }
      return false;
    }

    if (phase === "night") {
      const isMyNightTurnActive = allNightActionsSimultaneous || doesNightTurnMatchMyRole;
      if (!isMyNightTurnActive) return false;

      if (role === "Phù thủy") {
        const potions = sync.witchPotions;
        const hasPoison = potions ? !potions.poisonUsed : true;
        const hasHeal = potions ? !potions.healUsed : true;
        const pendingDeaths = sync.witchPendingDeathTargetIds || [];
        return hasPoison || (hasHeal && pendingDeaths.length > 0);
      }

      if (role === "Bảo vệ") {
        return true;
      }

      if (role === "Tiên tri") {
        return true;
      }

      if (role === "Thợ săn") {
        return true;
      }

      if (isWolfTeamRole) {
        return !sync.wolfBiteDisabled;
      }

      if (role === "Hộ nhân") {
        return !sync.protectorHasUsed && !sync.protectorTargetId;
      }

      if (role === "Thần tình yêu") {
        const currentNight = room.nightCount || 0;
        const loveChoiceLastNight = room?.gameRules?.loveCanChoosePartnerFirstTwoNights ? 2 : 1;
        const canChoosePartner = currentNight >= 1 && currentNight <= loveChoiceLastNight && !sync.loveState?.targetId;
        return canChoosePartner;
      }

      if (role === "Kẻ nguyền rủa" || role === "Kẻ bị nguyền") {
        const hasUsesRemaining = sync.cursedUsesRemaining === null || sync.cursedUsesRemaining > 0;
        return hasUsesRemaining && !sync.cursedTargetId;
      }

      if (role && ["Băng Giá", "Sấm Sét", "Lửa", "Bóng Tối"].includes(role)) {
        return true;
      }

      if (role === "Tay Buôn") {
        const hasMerchantTradeTonight = !!sync.merchantPrivateState?.trade && sync.merchantPrivateState.trade.actorId === clientId;
        const availableStockCount = sync.merchantPrivateState?.availableStockIds?.length ?? 0;
        return !hasMerchantTradeTonight && availableStockCount > 0;
      }
    }

    return false;
  }, [
    clientId,
    room,
    role,
    phase,
    deadPlayers,
    sync.angelReviveState,
    sync.witchPotions,
    sync.witchPendingDeathTargetIds,
    sync.wolfBiteDisabled,
    sync.protectorHasUsed,
    sync.protectorTargetId,
    sync.loveState,
    sync.cursedUsesRemaining,
    sync.cursedTargetId,
    sync.merchantPrivateState,
    allNightActionsSimultaneous,
    doesNightTurnMatchMyRole,
    isWolfTeamRole
  ]);

  const [showActionGlow, setShowActionGlow] = useState(false);
  void showActionGlow;
  const lastGlowTriggeredKeyRef = useRef("");

  const currentGlowKey = useMemo(() => {
    if (!isLocalPlayerAbleToAct || !room) return "";
    const nightCount = room.nightCount || 0;
    if (phase === "day") {
      return `${nightCount}-day-revive`;
    }
    if (phase === "night") {
      if (role === "Phù thủy") {
        const potions = sync.witchPotions;
        const hasPoison = potions ? !potions.poisonUsed : true;
        const hasHeal = potions ? !potions.healUsed : true;
        const pendingDeaths = sync.witchPendingDeathTargetIds || [];
        if (hasPoison) {
          return `${nightCount}-night-witch-poison`;
        }
        if (hasHeal && pendingDeaths.length > 0) {
          return `${nightCount}-night-witch-heal`;
        }
      }
      return `${nightCount}-night-action`;
    }
    return "";
  }, [isLocalPlayerAbleToAct, room, phase, role, sync.witchPotions, sync.witchPendingDeathTargetIds]);

  useEffect(() => {
    if (!currentGlowKey) {
      setShowActionGlow(false);
      return;
    }
    if (lastGlowTriggeredKeyRef.current !== currentGlowKey) {
      lastGlowTriggeredKeyRef.current = currentGlowKey;
      setShowActionGlow(true);
    }
  }, [currentGlowKey]);

  const canStartVillageChiefExtraVote =
    role === "Trưởng làng" &&
    phase === "day" &&
    !!room?.villageChiefExtraVoteReady &&
    !room?.villageChiefExtraVoteUsed &&
    !!clientId &&
    !deadPlayers.includes(clientId) &&
    !sync.dayDeadline &&
    !sync.dayDiscussionDeadline &&
    sync.trialStage === "none" &&
    !sync.gameEnded;

  const villageChiefExtraVotePanel = canStartVillageChiefExtraVote ? (
    <div style={{ marginTop: 12 }}>
      <button
        onClick={() => socket.emit("villageChiefStartExtraVote", { roomId })}
        style={{ padding: "8px 12px", cursor: "pointer" }}
      >
        Mở thêm một lượt biểu quyết
      </button>
    </div>
  ) : null;

  useEffect(() => {
    const handleHostDisconnected = () => {
      setHostDisconnected(true);
      showNotice(
        "Thông báo",
        "Quản trò đã rời đi. Bạn có thể chờ quản trò quay lại hoặc thoát khỏi phòng."
      );
    };
    socket.on("hostDisconnected", handleHostDisconnected);
    return () => {
      socket.off("hostDisconnected", handleHostDisconnected);
    };
  }, [showNotice]);

  useEffect(() => {
    const handleErrorMessage = (msg: string) => {
      if (msg) {
        const onConfirm = msg.includes("Phòng không tồn tại") ? () => nav("/lobby") : undefined;
        showNotice("Thông báo", msg, onConfirm);
      }
    };
    socket.on("errorMessage", handleErrorMessage);
    return () => {
      socket.off("errorMessage", handleErrorMessage);
    };
  }, [showNotice, nav]);

  useEffect(() => {
    const handleRoomClosed = (payload?: { roomId?: string }) => {
      if (!roomId) return;
      if (payload?.roomId && payload.roomId !== roomId) return;
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
    if (!sync.gameEnded) return;
    if (sync.gameEnded.winner === "nobody") {
      showNotice("Trò chơi kết thúc", "Quản trò đã cho ngừng ván chơi này");
      return;
    }
    const winnerText =
      sync.gameEnded.winner === "wolves"
        ? "Phe Sói"
        : sync.gameEnded.winner === "lovers"
          ? "Cặp đôi"
          : "Phe Dân";
    showNotice("Trò chơi kết thúc", `${winnerText} chiến thắng`);
    shootWinnerConfettiFromSides(sync.gameEnded.winner, sync.loveState);
  }, [showNotice, sync.gameEnded, sync.loveState]);

  useEffect(() => {
    const seq = sync.dayVoteFinishedSeq;
    if (!seq || !sync.dayVoteFinished) return;
    if (lastDayVoteNoticeSeqRef.current === seq) return;
    lastDayVoteNoticeSeqRef.current = seq;

    if (sync.dayVoteFinished.targetId) {
      const targetName = room?.players.find((p) => p.id === sync.dayVoteFinished?.targetId)?.name || "một người chơi";
      if (sync.dayVoteFinished.startedTrial) {
        showNotice("Kết quả biểu quyết", `${targetName} bị đưa lên giàn`);
      } else {
        showNotice("Kết quả biểu quyết", `${targetName} bị loại`);
      }
      return;
    }
    showNotice("Kết quả biểu quyết", "Không ai bị lên giàn");
  }, [room?.players, showNotice, sync.dayVoteFinished, sync.dayVoteFinishedSeq]);

  useEffect(() => {
    const seq = sync.trialVerdictFinishedSeq;
    if (!seq || !sync.trialVerdictFinished) return;
    if (lastTrialVerdictNoticeSeqRef.current === seq) return;
    lastTrialVerdictNoticeSeqRef.current = seq;

    const targetName = room?.players.find((p) => p.id === sync.trialVerdictFinished?.targetId)?.name || "người bị biểu quyết";
    if (sync.trialVerdictFinished.chiefRevealed) {
      showNotice(
        "Kết quả cuối",
        `${targetName} hiện lên và nói:\n"Rồi rồi mày không thoát được đâu con trai, tu bi cân tì niu"`
      );
      return;
    }
    if (sync.trialVerdictFinished.executed) {
      const executedNotices = [
        `${targetName} bị bắn xử tử`,
        `${targetName} bị hỏa thiêu`,
        `${targetName} bị thả trôi sông`,
        `${targetName} bị treo cổ`,
        `${targetName} bị bóp mũi tới chết`,
      ];
      const noticeIndex = Math.abs(seq) % executedNotices.length;
      showNotice("Kết quả cuối", executedNotices[noticeIndex]!);
      return;
    }
    showNotice("Kết quả cuối", `${targetName} được tha (sống).`);
  }, [room?.players, showNotice, sync.trialVerdictFinished, sync.trialVerdictFinishedSeq]);

  const handlePlayerClick = (playerId: string) => {
    if (sync.gameEnded) return;
    if (angel.onPlayerClick(playerId)) return;
    if (deadPlayers.includes(playerId) && !(isCurrentPlayerHiddenRevived && playerId === clientId)) return;

    if (dayVote.onPlayerClick(playerId)) return;

    if (love.onPlayerClick(playerId)) return;
    if (merchant.onPlayerClick(playerId)) return;
    if (cursed.onPlayerClick(playerId)) return;
    if (seer.onPlayerClick(playerId)) return;
    if (wolf.onPlayerClick(playerId)) return;
    if (guardian.onPlayerClick(playerId)) return;
    if (protector.onPlayerClick(playerId)) return;
    if (witch.onPlayerClick(playerId)) return;
    if (hunter.onPlayerClick(playerId)) return;
    if (elemental.onPlayerClick(playerId)) return;
  };

  const handlePlayerDoubleClick = (playerId: string) => {
    if (!isHost) return;
    if (!roomId) return;
    if (sync.gameEnded) return;
    setHostPlayerActionTargetId(playerId);
  };

  const requestReturnToRoom = () => {
    if (!roomId) return;
    socket.emit("requestReturnToRoom", { roomId });
  };

  const handleBackToRoomClick = () => {
    requestReturnToRoom();
  };

  const handleEndGameConfirm = () => {
    if (!roomId) return;
    setEndGameConfirmOpen(false);
    socket.emit("hostEndGameNow", { roomId });
  };

  const isHostPlayerActionTargetDead =
    !!hostPlayerActionTargetId && deadPlayers.includes(hostPlayerActionTargetId);
  const canShowStartDayVotingControl = canControlTrialFlow && phase === "day" && !sync.gameEnded;
  const canShowFinishTrialInteractionControl =
    canControlTrialFlow && phase === "day" && !sync.gameEnded && sync.trialStage === "defense";
  const canShowAddTrialInteractionControl =
    canControlTrialFlow && phase === "day" && !sync.gameEnded && sync.trialStage === "defense";
  const canShowGameControls =
    isHost ||
    canShowStartDayVotingControl ||
    canShowFinishTrialInteractionControl ||
    canShowAddTrialInteractionControl;
  const hostPlayerActionTargetName = hostPlayerActionTargetId
    ? room?.players.find((p) => p.id === hostPlayerActionTargetId)?.name || "người chơi này"
    : "người chơi này";
  const hostTargetRoleDisplayOrder = hostPlayerActionTargetId
    ? targetRoleDisplayOrderByPlayerId[hostPlayerActionTargetId]
    : undefined;
  const setHostTargetRoleDisplayOrder = (order: TargetRoleDisplayOrder | null) => {
    if (!hostPlayerActionTargetId) return;
    setTargetRoleDisplayOrderByPlayerId((prev) => {
      const next = { ...prev };
      if (order) {
        next[hostPlayerActionTargetId] = order;
      } else {
        delete next[hostPlayerActionTargetId];
      }
      return next;
    });
  };
  const hostRuleEliminateTargetName = hostRuleEliminateTargetId
    ? room?.players.find((p) => p.id === hostRuleEliminateTargetId)?.name || "người chơi này"
    : "người chơi này";

  const rulesRestartAnimationName = rulesRestartOverlay
    ? `gameRulesRestartOverlay_${rulesRestartOverlay.key}`
    : "";
  const rulesRestartTextAnimationName = rulesRestartOverlay
    ? `gameRulesRestartText_${rulesRestartOverlay.key}`
    : "";
  const isRoleRevealLimitedToCurrentNightTurn = isSequentialNight && !sync.gameEnded;
  const shouldRevealMyRole =
    room?.id === "mock-8"
      ? true
      : (!isHost &&
         !!role &&
         (!!sync.gameEnded ||
           (!shouldBlockDeadNightRoleReveal &&
             (phase === "night" ? isNightInfoVisible : true) &&
             (isRoleRevealLimitedToCurrentNightTurn ? doesNightTurnMatchMyRole : !shouldHidePlayerRoleText))));

  const masonryItems = useMemo(() => {
    const roles = room?.roles || [];
    return roles.map((roleName, index) => ({
      id: String(index),
      img: nenLungAsset,
      height: 360,
      roleName
    }));
  }, [room?.roles]);

  useEffect(() => {
    setCardFlippedToFront(shouldRevealMyRole);
  }, [shouldRevealMyRole]);

  useEffect(() => {
    if (!shouldRevealMyRole) {
      setCardFlippedToFront(false);
    }
  }, [role, shouldRevealMyRole]);
  const shouldShowRolePortrait = shouldRevealMyRole;
  const loveHybridBackgroundAsset =
    clientId && sync.loveState.targetWolfAligned && sync.loveState.pairIds.includes(clientId)
      ? HYBRID_BACKGROUND_ASSET
      : null;
  const visiblePlayerCount = (roomForDisplay?.players || []).filter((p: any) => p.id !== roomForDisplay?.hostId).length;
  const playerFrameHeightPx = visiblePlayerCount > 18 ? 570 : 470;
  const rolePortraitImagesForGame = useMemo(
    () => import.meta.glob<string>("../assets/*.png", { eager: true, import: "default" }),
    []
  );
  const rolePortraitAvifImagesForGame = useMemo(
    () => import.meta.glob<string>("../assets/C *.avif", { eager: true, import: "default" }),
    []
  );
  const normalizeRoleName = useCallback((value: string) => value.normalize("NFC").trim().toLowerCase(), []);
  const getAssetNameFromPath = useCallback((path: string) => path.split("/").pop()?.replace(/\.(png|avif)$/i, "") ?? "", []);
  const rolePortraitByNameForGame = useMemo(
    () => {
      const pngEntries = Object.entries(rolePortraitImagesForGame).map(([path, src]) => [normalizeRoleName(getAssetNameFromPath(path)), src]);
      const avifEntries = Object.entries(rolePortraitAvifImagesForGame).map(([path, src]) => [normalizeRoleName(getAssetNameFromPath(path)), src]);
      return Object.fromEntries([...pngEntries, ...avifEntries]);
    },
    [getAssetNameFromPath, normalizeRoleName, rolePortraitImagesForGame, rolePortraitAvifImagesForGame]
  );
  const roleCompanionAssetMap = useMemo(
    () =>
      ({
        [normalizeRoleName("Gió")]: "C Gió",
        [normalizeRoleName("Sói")]: "C Sói",
        [normalizeRoleName("Sói con")]: "C Sói Con",
        [normalizeRoleName("Sói Dại")]: "C Sói Dại",
        [normalizeRoleName("Phù thủy")]: "C Phù Thủy",
        [normalizeRoleName("Tiên tri")]: "C Tiên Tri",
        [normalizeRoleName("Bán sói")]: "C Bán Sói",
        [normalizeRoleName("Bảo vệ")]: "C Bảo Vệ",
        [normalizeRoleName("Trưởng làng")]: "C Trưởng Làng",
        [normalizeRoleName("Hộ nhân")]: "C Hộ Nhân",
        [normalizeRoleName("Băng Giá")]: "C Băng",
        [normalizeRoleName("Thợ săn")]: "C Thợ Săn",
        [normalizeRoleName("Thần tình yêu")]: "C Thần Tình Yêu",
        [normalizeRoleName("Tay Buôn")]: "C Tay Buôn",
        [normalizeRoleName("Thiên Sứ")]: "C Thiên Sứ",
      }) as Record<string, string>,
    [normalizeRoleName]
  );
  const normalizedRole = shouldShowRolePortrait && role ? normalizeRoleName(role) : null;
  const companionAssetCandidates = useMemo(() => {
    if (!normalizedRole || !role) return [] as string[];

    const explicitCompanion = roleCompanionAssetMap[normalizedRole];
    const inferredCompanion = `C ${role.normalize("NFC").trim()}`;
    return Array.from(new Set([explicitCompanion, inferredCompanion].filter(Boolean) as string[]));
  }, [normalizedRole, role, roleCompanionAssetMap]);

  const companionRoleSrc = useMemo(() => {
    for (const candidate of companionAssetCandidates) {
      const src = rolePortraitByNameForGame[normalizeRoleName(candidate)] ?? null;
      if (src) return src;
    }
    return null;
  }, [companionAssetCandidates, normalizeRoleName, rolePortraitByNameForGame]);
  const showVillageChiefDyingFrame =
    phase === "night" &&
    !isHost &&
    role === "Trưởng làng" &&
    !!clientId &&
    !sync.gameEnded &&
    (room?.villageChiefDyingFramePlayerIds || []).includes(clientId);

  if (!room) {
    return (
      <div 
        className="page-shell game-page" 
        style={{ 
          padding: "1.25rem", 
          minHeight: "100vh", 
          backgroundColor: "#0f1115",
          display: "flex",
          alignItems: "center",
          justifyContent: "center"
        }}
      />
    );
  }

  const isDuskTransitionPending = room.phase === "dusk" && !duskRevealGameUI;
  const gameUIOpacity = isDuskTransitionPending ? 0 : 1;
  const gameUIPointerEvents = isDuskTransitionPending ? "none" : "auto";

  const hasNightAction = useMemo(() => {
    if (!role) return false;
    if (role === "Bán sói" && !isBanSoiOrWildConverted) return false;
    if (isWolfTeamRole) return true;
    if (role === "Linh sói") return !!sync.spiritWolfDecisionTargetId;
    return NIGHT_ACTION_ROLE_SET.has(role) || ELEMENTAL_ROLE_SET.has(role);
  }, [role, isBanSoiOrWildConverted, isWolfTeamRole, sync.spiritWolfDecisionTargetId]);
  void hasNightAction;

  const hostNightRemainingSec = useMemo(() => {
    if (phase !== "night") return null;

    // Tự động cộng thêm 10 giây thời gian của Phù thủy cho Host nếu Phù thủy còn sống và có bonus
    let witchExtraMs = 0;
    if (isSimultaneousNight && room?.players && sync.revealedRolesByPlayerId) {
      const witchPlayer = room.players.find(p => sync.revealedRolesByPlayerId?.[p.id] === "Phù thủy");
      const isWitchAlive = !!witchPlayer && !deadPlayers.includes(witchPlayer.id);

      const rules = room?.gameRules;
      const nonWolf = rules?.nonWolfNightActionDurationSec || 0;
      const wolf = rules?.wolfNightActionDurationSec || 0;
      const witchBonusApplies = nonWolf > 0 && wolf === nonWolf;

      if (isWitchAlive && witchBonusApplies) {
        witchExtraMs = 10000;
      }
    }

    if (nightTurnPaused) {
      if (nightTurnRemainingMs == null) return null;
      return Math.max(0, Math.ceil((nightTurnRemainingMs + witchExtraMs) / 1000));
    }
    if (!nightTurnDeadline) return null;
    return Math.max(0, Math.ceil((nightTurnDeadline + witchExtraMs - nightTurnNow) / 1000));
  }, [phase, nightTurnPaused, nightTurnRemainingMs, nightTurnDeadline, nightTurnNow, isSimultaneousNight, room?.players, sync.revealedRolesByPlayerId, deadPlayers, room?.gameRules]);

  const countdownSeconds = isHost
    ? hostNightRemainingSec
    : (isSequentialNight
        ? nightTurnRemainingSec
        : (mySimultaneousDeadline ? simultaneousRemainingSec : hostNightRemainingSec)
      );

  const showCountdown = !sync.gameEnded && (
    isHost ? (phase === "night" && countdownSeconds !== null) : (
      !isCurrentPlayerDeadForNightActions && (
        (isSequentialNight && currentNightTurnRole && doesNightTurnMatchMyRole && nightTurnRemainingSec !== null) ||
        (isSimultaneousNight && countdownSeconds !== null)
      )
    )
  );



  return (
    <div 
      className={`page-shell game-page${shouldShowRolePortrait ? " has-role-portrait" : ""}`} 
      style={{ 
        pointerEvents: gameUIPointerEvents,
        opacity: gameUIOpacity,
      }}
    >

      {(phase === "day" || phase === "dusk") && (
        <div
          className="game-bg-layer"
          style={{
            backgroundImage: `url(${phase === "day" ? RoomBg : ChieuBg})`
          }}
        />
      )}
      {showVillageChiefDyingFrame && (
        <>
          <style>{`
            @keyframes villageChiefDyingFramePulse {
              0%, 100% {
                opacity: 0.42;
                box-shadow:
                  inset 0 0 0 3px rgba(236, 58, 58, 0.62),
                  inset 0 0 42px 12px rgba(236, 58, 58, 0.22);
              }
              50% {
                opacity: 0.84;
                box-shadow:
                  inset 0 0 0 5px rgba(255, 79, 79, 0.9),
                  inset 0 0 70px 20px rgba(255, 49, 49, 0.34);
              }
            }
          `}</style>
          <div
            aria-hidden="true"
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 27,
              pointerEvents: "none",
              borderRadius: 0,
              animation: "villageChiefDyingFramePulse 1400ms ease-in-out infinite",
            }}
          />
        </>
      )}

      {(() => {
        const isLover = roomId === "mock-8" ? true : (sync.loveState?.pairIds?.includes(clientId || "") === true);
        const showStickersButton = roomId === "mock-8" || (phase === "night" && !sync.gameEnded && !isCurrentPlayerDeadForNightActions && (isWolfTeamRole || isLover));
        const isWolfForStatus = roomId === "mock-8" ? true : isWolfTeamRole;
        return (
          <GameRoleStatusBar
            isHost={isHost}
            role={role}
            cardFlippedToFront={cardFlippedToFront}
            lowPerformanceMode={lowPerformanceMode}
            setLowPerformanceMode={setLowPerformanceMode}
            showLowPerfToast={showLowPerfToast}
            isAnimatingLeaf={isAnimatingLeaf}
            setIsAnimatingLeaf={setIsAnimatingLeaf}
            phase={phase}
            roles={room?.roles}
            gameMode={room?.gameMode}
            showEyeIcon={phase === "night" && !sync.gameEnded && !isCurrentPlayerDeadForNightActions}
            isNightInfoVisible={isNightInfoVisible}
            setIsNightInfoVisible={handleToggleNightInfoVisible}
            showStickersButton={showStickersButton}
            isWolf={isWolfForStatus}
            isLover={isLover}
            onSelectSticker={handleSelectSticker}
            onSendPlayerMessage={handleSendPlayerMessage}
          />
        );
      })()}
      
      {sync.gameEnded && (
        <h2>
          {sync.gameEnded.winner === "nobody" ? (
            "Kết thúc: Ván chơi đã được ngừng lại"
          ) : (
            <>
              Kết thúc:{" "}
              {sync.gameEnded.winner === "wolves"
                ? "Phe Sói"
                : sync.gameEnded.winner === "lovers"
                  ? "Cặp đôi"
                  : "Phe Dân"}{" "}
              chiến thắng
            </>
          )}
        </h2>
      )}
      {!sync.gameEnded && (
        <>
          {phase === "dusk" ? (
            <>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-start", gap: "12px" }}>
                <h1 style={{ display: "flex", alignItems: "center" }}><AvifIcon name="🌥️" style={{ marginRight: 8 }} /> Hoàng hôn</h1>
              </div>
              {!isHost && !duskTransitionActive && (
                <>
                  {!masonryComplete ? (
                    <Masonry
                      items={masonryItems}
                      duskCardSelections={room.duskCardSelections || {}}
                      clientId={clientId}
                      onSelectCard={(index) => {
                        isSelectingLocally.current = true;
                        socket.emit("duskSelectCard", { roomId, cardIndex: index });
                      }}
                      onSelectionComplete={() => {
                        isSelectingLocally.current = false;
                        setMasonryComplete(true);
                      }}
                    />
                  ) : (
                    <>
                      <style>{`
                        @keyframes floatUp {
                          0% {
                            transform: translateY(100vh);
                            opacity: 0;
                          }
                          100% {
                            transform: translateY(0);
                            opacity: 1;
                          }
                        }
                        .float-up-container {
                          opacity: 0;
                          transform: translateY(100vh);
                          animation: floatUp 0.8s cubic-bezier(0.25, 1, 0.5, 1) forwards;
                        }
                        .encrypted {
                          font-family: 'Courier New', Courier, monospace;
                          color: #a78bfa;
                          letter-spacing: 2px;
                          opacity: 0.7;
                        }
                        .revealed {
                          color: #10b981;
                          text-shadow: 0 0 10px rgba(16, 185, 129, 0.5);
                          font-weight: 800;
                          transition: all 0.3s ease;
                        }
                      `}</style>
                      <div className="float-up-container" style={{ opacity: 0, transform: "translateY(100vh)" }}>
                        <RoleCard3D
                          role={role}
                          revealed={cardFlippedToFront}
                          onToggleReveal={() => setCardFlippedToFront((p) => !p)}
                          lowPerformanceMode={lowPerformanceMode}
                        />
                      </div>
                    </>
                  )}
                </>
              )}
            </>
          ) : (
            //Height 46 để cố định chiều cao của cái dòng div này cho nó đừng có nhảy layout khi hiển thị nút đếm ngược
            <div id="infoThờiGian" style={{ display: "flex", alignItems: "center", gap: "0.9rem", flexWrap: "wrap", height: "46px" }}> 
              {phase === "day" ? (
                <h1 
                  onClick={room?.id === "mock-8" ? (mock8.handleHeaderClick || undefined) : undefined}
                  style={{ 
                    margin: 0, 
                    display: "flex", 
                    alignItems: "center", 
                    cursor: (room?.id === "mock-8" && mock8.handleHeaderClick) ? "pointer" : "default" 
                  }}
                >
                  <AvifIcon name="🌞" style={{ marginRight: 8 }} /> Ngày {displayNightNumber}
                </h1>
              ) : (
                <h1 
                  onClick={room?.id === "mock-8" ? (mock8.handleHeaderClick || undefined) : undefined}
                  style={{ 
                    margin: 0, 
                    display: "flex", 
                    alignItems: "center", 
                    cursor: (room?.id === "mock-8" && mock8.handleHeaderClick) ? "pointer" : "default" 
                  }}
                >
                  <AvifIcon name="🌙" style={{ marginRight: 8 }} /> Đêm {displayNightNumber}
                </h1>
              )}

              <CountdownButton
                showCountdown={room?.id === "mock-8" ? true : !!showCountdown}
                countdownSeconds={room?.id === "mock-8" ? mock8.countdownSeconds : countdownSeconds}
                isPaused={room?.id === "mock-8" ? mock8.isPaused : !!nightTurnPaused}
              />
              <CountdownButton
                showCountdown={phase === "day" && !sync.gameEnded && dayVote.remainingSec !== null}
                countdownSeconds={dayVote.remainingSec}
                isPaused={!!dayVote.dayPaused}
              />
            </div>
          )}
        </>
      )}

      {isSequentialNight && currentNightTurnRole && isHost && (
        <div style={{ marginTop: "0.5rem", fontWeight: 700 }}>
          Lượt hiện tại: {currentNightTurnRole}
          {nightTurnRemainingSec !== null ? ` - còn ${nightTurnRemainingSec}s` : ""}
          {nightTurnPaused ? " (đang tạm ngưng)" : ""}
        </div>
      )}

      {isHost && hasSecretConditionalRolePrompt && (
        <div style={{ marginTop: "0.5rem", fontWeight: 700 }}>
          🤐 Có vai trò kích hoạt bí mật đang chờ phản ứng
        </div>
      )}
      {(() => {
        const buff = sync.elementalBuffResult;
        if (!buff?.buffId) return null;
        const currentNight = room?.nightCount || 0;
        if (buff.appliesNight == null) return null;
        const isActiveTonight = buff.appliesNight === currentNight && phase === "night";
        const isPending = buff.appliesNight > currentNight;
        return (
          <div style={{ marginTop: "0.75rem", padding: "0.75rem", borderRadius: "0.5rem", background: "rgba(109, 68, 232, 0.12)", border: "0.0625rem solid rgba(109, 68, 232, 0.3)" }}>
            <div style={{ fontWeight: 700, color: "#6d44e8" }}>
              ✨ Buff nguyên tố {isActiveTonight ? "đang kích hoạt" : isPending ? `sẽ kích hoạt đêm ${buff.appliesNight}` : `đã kích hoạt đêm ${buff.appliesNight}`}
            </div>
            <div style={{ marginTop: "0.25rem" }}>
              <span style={{ fontWeight: 600 }}>{buff.label}</span>
              {" "}(Tier {buff.tier})
              {buff.randomTieBreak ? (
                <span style={{ fontStyle: "italic", opacity: 0.75 }}> - Được chọn ngẫu nhiên do hòa phiếu</span>
              ) : null}
            </div>
          </div>
        );
      })()}



      {(isHost || !!sync.gameEnded || hostDisconnected) && (
        <div className="game-top-actions" style={{ marginTop: "0.75rem" }}>
          {!!sync.gameEnded && room?.scoreResult && (
            <button
              onClick={() => setScoreboardOpen(true)}
              style={{
                background: "linear-gradient(135deg, #9b59b6 0%, #8e44ad 100%)",
                color: "#fff",
                border: "none",
                fontWeight: 700,
                cursor: "pointer",
                padding: "8px 16px",
                borderRadius: "8px",
                boxShadow: "0 4px 12px rgba(155, 89, 182, 0.3)",
                display: "inline-flex",
                alignItems: "center",
                gap: "8px"
              }}
            >
              <img src={medalSvg} alt="medal" style={{ width: "18px", height: "18px" }} />
              Xem điểm
            </button>
          )}
          {!hostDisconnected && (
            <button onClick={handleBackToRoomClick}>Quay về phòng chờ</button>
          )}
          {hostDisconnected && (
            <button onClick={() => {
              setNoticeModal(null);
              nav("/lobby");
            }}>Quay về sảnh chờ</button>
          )}
        </div>
      )}


      {/* Hiển thị bố cục vị trí người chơi khi có room.positions */}
      {roomForDisplay?.positions && (phase !== "dusk" || isHost) && (() => {
        const activeReplayEvent = roomForDisplay?.isReplay && roomForDisplay?.replayEvents && roomForDisplay?.replayIndex !== undefined
          ? roomForDisplay.replayEvents[roomForDisplay.replayIndex - 1]
          : null;
        const replayActorIds = activeReplayEvent?.actorIds || [];
        const replayTargetIds = activeReplayEvent?.targetIds || [];

        return (
          <>
            <div style={{ margin: "2rem auto 0" }}>
              <PlayerPositions
                mode="view"
                roomOverride={roomForDisplay}
                setRoom={setRoom}
                viewMode={viewMode}
                onPlayerClick={handlePlayerClick}
                onPlayerDoubleClick={handlePlayerDoubleClick}
                activeMessages={sync.playerMessages}
                onDismissMessage={(id) => sync.setPlayerMessages((prev: any) => prev.filter((m: any) => m.id !== id))}
                isNightInfoVisible={isNightInfoVisible}
                seerResults={(isSeerTurnActive && isNightInfoVisible) ? seer.seerResults : null}
                deadPlayersOverride={deadPlayersOverrideForRender}
                bulletAnimation={hunterBulletAnim}
                witchPotionEffect={sync.witchPotionEffect}
                onWitchPotionEffectComplete={() => sync.setWitchPotionEffect(null)}
                testHeartExplosionTrigger={testHeartExplosionTrigger}
                highlightPlayerId={highlightPlayerId}
                secondaryHighlightPlayerIds={secondaryHighlightPlayerIds}
                cursedHighlightPlayerIds={cursed.playerPositionsProps.cursedHighlightPlayerIds}
                cursedHighlightIsDanger={cursed.playerPositionsProps.cursedHighlightIsDanger}
                verdictLivePlayerIds={autoTrialHighlightSuppressed ? undefined : autoTrialHighlight?.secondaryIds}
                verdictDiePlayerIds={autoTrialHighlightSuppressed ? undefined : autoTrialHighlight?.dangerIds}
                showRoleBadges={!!roleBadgesForDisplay}
                roleBadges={roleBadgesForDisplay}
                activeNightRole={isHost && isSequentialNight ? currentNightTurnRole : null}
                suppressNightActionProgress={autoTrialHighlightSuppressed}
                selectedOutlinePlayerId={
                  (phase !== "night" || isNightInfoVisible) ? (
                    dayVote.playerPositionsProps.selectedOutlinePlayerId ||
                    guardian.playerPositionsProps.selectedOutlinePlayerId ||
                    protector.playerPositionsProps.selectedOutlinePlayerId ||
                    merchant.playerPositionsProps.selectedOutlinePlayerId ||
                    cursed.playerPositionsProps.selectedOutlinePlayerId ||
                    witch.playerPositionsProps.selectedOutlinePlayerId ||
                    elemental.playerPositionsProps.selectedOutlinePlayerId ||
                    hunter.playerPositionsProps.selectedOutlinePlayerId ||
                    love.playerPositionsProps.selectedOutlinePlayerId ||
                    angel.playerPositionsProps.selectedOutlinePlayerId ||
                    null
                  ) : null
                }
                selectedOutlinePlayerIds={
                  (phase !== "night" || isNightInfoVisible) ? (
                    (wolf.playerPositionsProps.selectedOutlinePlayerIds || []).filter(
                      (id): id is string => !!id
                    )
                  ) : []
                }
                dangerPlayerIds={Array.from(new Set([
                  ...(witch.playerPositionsProps.dangerPlayerIds || []),
                  ...dangerHighlightPlayerIds,
                ]))}
                showWolfVoteBadges={
                  (phase !== "night" || isNightInfoVisible) && (dayVote.playerPositionsProps.showWolfVoteBadges || wolf.playerPositionsProps.showWolfVoteBadges)
                }
                wolfVoteVoterIds={
                  dayVote.playerPositionsProps.showWolfVoteBadges
                    ? dayVote.playerPositionsProps.wolfVoteVoterIds
                    : wolf.playerPositionsProps.wolfVoteVoterIds
                }
                voteWeightsByVoterId={dayVote.playerPositionsProps.showWolfVoteBadges ? dayVoteWeightsByVoterId : undefined}
                wolfMaxTargets={sync.wolfMaxTargets}
                showWolfBadges={(phase !== "night" || isNightInfoVisible) && wolf.playerPositionsProps.showWolfBadges}
                wolfBadgePlayerIds={wolf.playerPositionsProps.wolfBadgePlayerIds}
                wolfBadgeRoles={wolf.playerPositionsProps.wolfBadgeRoles}
                cheesePlayerIds={sync.merchantCheeseMarkPlayerIds}
                trialOrangePlayerId={dayVote.playerPositionsProps.trialOrangePlayerId}
                trialWhitePlayerIds={dayVote.playerPositionsProps.trialWhitePlayerIds}
                trialGreenPlayerId={dayVote.playerPositionsProps.trialGreenPlayerId}
                replayActorIds={replayActorIds}
                replayTargetIds={replayTargetIds}
                showVoteReview={dayVote.playerPositionsProps.showVoteReview}
                dayVotes={dayVote.playerPositionsProps.dayVotes}
              >
                {phase === "night" && !sync.gameEnded && (
                  <div
                    className="stickers-board"
                    style={{
                      position: "absolute",
                      inset: 0,
                      pointerEvents: "none",
                      zIndex: 999,
                      opacity: isNightInfoVisible ? 1 : 0,
                      transition: "opacity 0.3s ease",
                      touchAction: "none"
                    }}
                  >
                    {sync.stickers
                      .filter((s: any) => !dismissedStickerIds.includes(s.id))
                      .map((sticker: any) => {
                        const resolvedUrl = getStickerUrlByFileName(sticker.imageSrc);
                        if (!resolvedUrl) return null;

                        return (
                          <StickerPeel
                            key={sticker.id}
                            imageSrc={resolvedUrl}
                            createdAt={sticker.createdAt}
                            isOwner={sticker.owner === clientId}
                            isPasted={sticker.isPasted}
                            pastedAt={sticker.pastedAt}
                            startDragEvent={sticker.startDragEvent}
                            onDismiss={() => setDismissedStickerIds(prev => [...prev, sticker.id])}
                            onDragStart={() => {
                              if (sticker.owner === clientId) {
                                setDraggingStickerId(sticker.id);
                                handleDragStartSticker(sticker.id, sticker.channel);
                              }
                            }}
                            onDragUpdate={(_x, _y, overTrash, _rotateVal) => {
                              if (sticker.owner === clientId) {
                                setIsOverTrash(overTrash);
                              }
                            }}
                            onRelease={() => {
                              if (sticker.owner === clientId) {
                                setDraggingStickerId(null);
                                setIsOverTrash(false);
                              }
                            }}
                            onDragEnd={(isDeleted, finalX, finalY, finalRotation) => {
                              if (sticker.owner === clientId) {
                                if (isDeleted) {
                                  handleDeleteSticker(sticker.id, sticker.channel);
                                } else {
                                  setDraggingStickerId(null);
                                  setIsOverTrash(false);
                                  handleDragUpdateSticker(
                                    sticker.id,
                                    finalX,
                                    finalY,
                                    sticker.channel,
                                    true,
                                    Date.now(),
                                    finalRotation !== undefined ? finalRotation : sticker.rotate
                                  );
                                }
                              }
                            }}
                            onDeleteClick={() => handleDeleteSticker(sticker.id, sticker.channel)}
                            onAnimationEnd={() => {
                              if (sticker.owner === clientId) {
                                handleDeleteSticker(sticker.id, sticker.channel);
                              }
                            }}
                            rotate={sticker.rotate}
                            x={sticker.x}
                            y={sticker.y}
                          />
                        );
                      })}
                  </div>
                )}
              </PlayerPositions>
            </div>
            <RoleCharacterPortrait
              role={shouldShowRolePortrait ? role : null}
              backgroundAssetOverride={
                room?.id === "mock-8"
                  ? mock8.backgroundAssetOverride
                  : (shouldShowRolePortrait ? loveHybridBackgroundAsset : null)
              }
            />
            <RoleCompanionOverlay
              companionRoleSrc={shouldRevealMyRole && !(sync.gameEnded && canViewLog) ? companionRoleSrc : null}
              normalizedRole={normalizedRole}
              playerFrameHeightPx={playerFrameHeightPx}
              seerResults={isNightInfoVisible ? sync.seerResults : null}
            />
          </>
        );
      })()}

      {shouldRevealMyRole && !sync.gameEnded && canShowConfirmModals && seer.modal}
      {shouldRevealMyRole && !sync.gameEnded && canShowConfirmModals && cursed.modal}
      {shouldRevealMyRole && !sync.gameEnded && canShowConfirmModals && merchant.modal}
      {!sync.gameEnded && canShowConfirmModals && angel.modal}
      {shouldRevealMyRole && !sync.gameEnded && canShowConfirmModals && guardian.modal}
      {shouldRevealMyRole && !sync.gameEnded && canShowConfirmModals && protector.modal}
      {shouldRevealMyRole && !sync.gameEnded && canShowConfirmModals && love.modals}
      {shouldRevealMyRole && !sync.gameEnded && loveActionPlacement === "general" && love.actionButton && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, alignItems: "flex-start", marginTop: 10 }}>
          {love.actionButton}
        </div>
      )}

      {shouldRevealMyRole && !sync.gameEnded && canShowConfirmModals && hunter.modal}
      {shouldRevealMyRole && !sync.gameEnded && canShowConfirmModals && elemental.modal}

      {shouldRevealMyRole && !sync.gameEnded && canShowConfirmModals && spiritWolf.modal}

      {shouldRevealMyRole && !sync.gameEnded && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, alignItems: "flex-start" }}>
          {role === "Tay Buôn" && renderSkillHint()}
          <div style={{ display: "flex", gap: 10, alignItems: "flex-start", flexWrap: "wrap" }}>
            {witch.panel}
            {protector.panel}
            {elemental.panel}
            {merchant.panel}
            {loveActionPlacement === "role-actions" ? love.actionButton : null}
          </div>
        </div>
      )}
      {!sync.gameEnded && angel.panel}

      {/* Game controls */}
      {canShowGameControls && (
        <div className="game-host-controls">
          {isHost && (
            <button
              onClick={() =>
                socket.emit("changePhase", { roomId, phase: "night" })
              }
            >
              Bắt đầu đêm
            </button>
          )}
          {isHost && (
            <button onClick={() => socket.emit("restartGame", { roomId })}>
              Chia bài lại
            </button>
          )}
          {phase === "night" && !sync.gameEnded && (
            <button
              onClick={() =>
                socket.emit("changePhase", { roomId, phase: "day" })
              }
            >
              Bắt đầu ngày
            </button>
          )}
          {phase === "night" && !sync.gameEnded && isSequentialNight && (
            <button
              onClick={() => socket.emit("hostNightTurnNext", { roomId })}
              disabled={!currentNightTurnRole}
              style={{ opacity: currentNightTurnRole ? 1 : 0.6 }}
            >
              Chuyển sang lượt tiếp theo
            </button>
          )}
          {canHostToggleNightTimer && (
            countdownSeconds !== null && countdownSeconds <= 0 ? (
              <button
                onClick={() => socket.emit("hostAddAllNightTurnTime", { roomId })}
                disabled={isSequentialNight ? !currentNightTurnRole : false}
                style={{ opacity: isSequentialNight && !currentNightTurnRole ? 0.6 : 1 }}
              >
                Cộng thêm thời gian
              </button>
            ) : (
              <button
                onClick={() => socket.emit("hostToggleNightTurnPause", { roomId })}
                disabled={isSequentialNight ? !currentNightTurnRole : false}
                style={{ opacity: isSequentialNight && !currentNightTurnRole ? 0.6 : 1 }}
              >
                {nightTurnPaused ? "Tiếp tục thời gian" : "Tạm ngưng thời gian"}
              </button>
            )
          )}
          {phase === "day" && !sync.gameEnded && dayVote.remainingSec !== null && (
            <button
              onClick={() => socket.emit("hostToggleDayPause", { roomId })}
            >
              {!!(room?.dayPaused ?? sync.dayPaused) ? "Tiếp tục thời gian" : "Tạm ngưng thời gian"}
            </button>
          )}
          {canShowStartDayVotingControl && (
            <button
              onClick={() => socket.emit("hostStartDayVoting", { roomId })}
              disabled={!isDayDiscussion}
              style={{ opacity: isDayDiscussion ? 1 : 0.6 }}
            >
              Bắt đầu biểu quyết
            </button>
          )}
          {canShowFinishTrialInteractionControl && (
            <button onClick={() => socket.emit("hostForceFinishDayVote", { roomId })}>
              Kết thúc tương tác ngay
            </button>
          )}
          {isHost && phase === "day" && !sync.gameEnded && (sync.dayDeadline || sync.trialStage === "verdict") && (
            <button onClick={() => socket.emit("hostForceFinishDayVote", { roomId })}>
              Chốt vote ngay
            </button>
          )}
          {canShowAddTrialInteractionControl && (
            <button onClick={() => socket.emit("trialAddInteractionTurn", { roomId })}>
              Bổ sung lượt tương tác
            </button>
          )}
          {isHost && (
            <button onClick={() => socket.emit("hostTogglePlayerRoleText", { roomId })}>
              {room?.hidePlayerRoleText ? "Hiện vai trò người chơi" : "Ẩn vai trò người chơi"}
            </button>
          )}
          {isHost && !sync.gameEnded && (
            <button 
              onClick={() => setEndGameConfirmOpen(true)}
              style={{ background: "#e74c3c", color: "#fff" }}
            >
              Kết thúc ngay trò chơi
            </button>
          )}
        </div>
      )}

      {isHost && logPanel}

      {shouldRevealMyRole && !sync.gameEnded && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, alignItems: "flex-start" }}>
          <div style={{ display: "flex", gap: 10, alignItems: "flex-start", flexWrap: "wrap" }}>
            {wolf.panel}
            {loveActionPlacement === "wolf" ? love.actionButton : null}
          </div>
        </div>
      )}
      {role !== "Tay Buôn" && renderSkillHint()}
      {isDebugMode && (() => {
        const btnStyle = {
          width: "18px",
          height: "18px",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: "50%",
          border: "1px solid rgba(255, 255, 255, 0.2)",
          background: "rgba(0, 0, 0, 0.4)",
          cursor: "pointer",
          fontSize: "0.5rem",
          transition: "all 0.2s",
        };
        return (
          <div style={{
            marginTop: "18px",
            maxWidth: "450px",
            width: "100%",
            display: "flex",
            justifyContent: "flex-start",
            flexDirection: "column",
            gap: "10px",
            zIndex: 9999,
            pointerEvents: "auto",
          }}>
            {/* Left side: Role switcher */}
            {roomId === "mock-8" && (
              <div style={{ display: "flex", gap: "4px", alignItems: "center", fontSize: "0.75rem", color: "#cbd5e1" }}>
                <select
                  value={roleOverride || ""}
                  onChange={(e) => setRoleOverride(e.target.value || null)}
                  style={{
                    background: "rgba(0, 0, 0, 0.5)",
                    color: "#fff",
                    border: "1px solid rgba(255, 255, 255, 0.15)",
                    borderRadius: "4px",
                    padding: "2px 4px",
                    fontSize: "0.72rem",
                    outline: "none"
                  }}
                >
                  <option value="Thần tình yêu">💘</option>
                  <option value="Thợ săn">🏹</option>
                  <option value="Phù thủy">🧙</option>
                  <option value="Sói Dại">🐺</option>
                  <option value="Tiên tri">🔮</option>
                  <option value="Bảo vệ">🛡️</option>
                </select>
              </div>
            )}

            {/* Right side: Action Emojis */}
            <div style={{ display: "flex", gap: "10px", alignItems: "center", }}>
              <div
                title="Bắn Thợ Săn (🔫)"
                onClick={() => {
                  if (!room) return;
                  const alive = room.players
                    .map(p => p.id)
                    .filter(id => !deadPlayers.includes(id));
                  if (alive.length < 2) return;
                  const from = alive[Math.floor(Math.random() * alive.length)]!;
                  let to = from;
                  for (let i = 0; i < 10 && to === from; i++) {
                    to = alive[Math.floor(Math.random() * alive.length)]!;
                  }
                  if (to === from) return;
                  playHunterShotAnim(from, to);
                }}
                style={{ ...btnStyle, borderColor: "rgba(239, 68, 68, 0.4)", background: "rgba(239, 68, 68, 0.15)" }}
                onMouseOver={(e) => (e.currentTarget.style.transform = "scale(1.15)")}
                onMouseOut={(e) => (e.currentTarget.style.transform = "scale(1)")}
              >
                🔫
              </div>

              <div
                title="Cupid Bắn (🏹)"
                onClick={() => {
                  if (!room) return;
                  const alive = room.players
                    .map((p: any) => p.id)
                    .filter((id: string) => !deadPlayers.includes(id));
                  if (alive.length === 0) return;
                  const to = alive[Math.floor(Math.random() * alive.length)]!;
                  playHunterShotAnim("P1", to, {
                    assetSrc: encodeURI("/Mũi tên.svg"),
                    alt: "Mũi tên",
                    rotationOffsetDeg: -45,
                    kind: "love",
                  });
                }}
                style={{ ...btnStyle, borderColor: "rgba(244, 63, 94, 0.4)", background: "rgba(244, 63, 94, 0.15)" }}
                onMouseOver={(e) => (e.currentTarget.style.transform = "scale(1.15)")}
                onMouseOut={(e) => (e.currentTarget.style.transform = "scale(1)")}
              >
                🏹
              </div>
              <div
                title="Test Văng Tim (💖)"
                onClick={() => {
                  setTestHeartExplosionTrigger(prev => prev + 1);
                }}
                style={{ ...btnStyle, borderColor: "rgba(236, 72, 153, 0.4)", background: "rgba(236, 72, 153, 0.15)" }}
                onMouseOver={(e) => (e.currentTarget.style.transform = "scale(1.15)")}
                onMouseOut={(e) => (e.currentTarget.style.transform = "scale(1)")}
              >
                💖
              </div>
              <div
                title="Bật/Tắt Tim (🔄)"
                onClick={() => {
                  setRoom((prev: any) => {
                    if (!prev) return prev;
                    const currentHeartsVisible = !!prev.sharedHeartsVisible;
                    return {
                      ...prev,
                      sharedHeartsVisible: !currentHeartsVisible,
                      playerHearts: currentHeartsVisible ? {} : {
                        P2: 2, P3: 2, P4: 2, P5: 2, P6: 2, P7: 2, P8: 2
                      }
                    };
                  });
                }}
                style={{ ...btnStyle, borderColor: "rgba(59, 130, 246, 0.4)", background: "rgba(59, 130, 246, 0.15)" }}
                onMouseOver={(e) => (e.currentTarget.style.transform = "scale(1.15)")}
                onMouseOut={(e) => (e.currentTarget.style.transform = "scale(1)")}
              >
                🔄
              </div>
              <div
                title="Phù Thủy Cứu (🧪)"
                onClick={() => {
                  const alive = room?.players
                    ?.map((p: any) => p.id)
                    ?.filter((id: string) => !(room.deadPlayers || []).includes(id)) || [];
                  if (alive.length > 0) {
                    const to = alive[Math.floor(Math.random() * alive.length)]!;
                    sync.setWitchPotionEffect({
                      targetId: to,
                      type: "heal",
                      startedAt: performance.now()
                    });
                  }
                }}
                style={{ ...btnStyle, borderColor: "rgba(168, 85, 247, 0.4)", background: "rgba(168, 85, 247, 0.15)" }}
                onMouseOver={(e) => (e.currentTarget.style.transform = "scale(1.15)")}
                onMouseOut={(e) => (e.currentTarget.style.transform = "scale(1)")}
              >
                🧪
              </div>
              <div
                title="Phù Thủy Giết (💀)"
                onClick={() => {
                  const alive = room?.players
                    ?.map((p: any) => p.id)
                    ?.filter((id: string) => !(room.deadPlayers || []).includes(id)) || [];
                  if (alive.length > 0) {
                    const to = alive[Math.floor(Math.random() * alive.length)]!;
                    sync.setWitchPotionEffect({
                      targetId: to,
                      type: "poison",
                      startedAt: performance.now()
                    });
                  }
                }}
                style={{ ...btnStyle, borderColor: "rgba(244, 63, 94, 0.4)", background: "rgba(244, 63, 94, 0.15)" }}
                onMouseOver={(e) => (e.currentTarget.style.transform = "scale(1.15)")}
                onMouseOut={(e) => (e.currentTarget.style.transform = "scale(1)")}
              >
                💀
              </div>
            </div>
          </div>
        );
      })()}
      {!isHost && dayVote.panel}
      {!isHost && villageChiefExtraVotePanel}
      {!isHost && logPanel}

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
                fontSize: "1.75rem",
                fontWeight: 700,
                textAlign: "center",
                maxWidth: "61.25rem",
                padding: "0 1.5rem",
                animation: `${rulesRestartTextAnimationName} ${rulesRestartOverlay.totalMs}ms linear forwards`,
              }}
            >
              {rulesRestartOverlay.message}
            </div>
          </div>
        </>
      )}

      <ConfirmModal
        open={!!noticeModal && canShowConfirmModals}
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
        open={endGameConfirmOpen && canShowConfirmModals}
        title="Kết thúc trò chơi"
        message="Bạn có chắc chắn muốn kết thúc trò chơi ngay bây giờ? Hành động này sẽ dừng trò chơi và hiển thị vai trò của tất cả người chơi."
        confirmText="Kết thúc"
        cancelText="Hủy"
        onConfirm={handleEndGameConfirm}
        onCancel={() => setEndGameConfirmOpen(false)}
      />

      {hostPlayerActionTargetId && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            background: "rgba(0,0,0,0.3)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
        >
          <div id="host-god"
            style={{
              width: "min(92vw, 420px)",
              maxHeight: "90vh",
              overflowY: "auto",
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 12,
              padding: 24,
              boxShadow: "0 2px 16px rgba(0,0,0,0.2)",
            }}
          >
            <h2 style={{ marginTop: 0 }}>Thao tác với {hostPlayerActionTargetName}</h2>
            <div style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 12 }}>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>Thứ tự targetId trong log</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button
                  type="button"
                  onClick={() => setHostTargetRoleDisplayOrder("player-role")}
                  style={{
                    background: hostTargetRoleDisplayOrder === "player-role" ? "var(--accent)" : undefined,
                    color: hostTargetRoleDisplayOrder === "player-role" ? "#fff" : undefined,
                  }}
                >
                  Tên trước role
                </button>
                <button
                  type="button"
                  onClick={() => setHostTargetRoleDisplayOrder("role-player")}
                  style={{
                    background: hostTargetRoleDisplayOrder === "role-player" ? "var(--accent)" : undefined,
                    color: hostTargetRoleDisplayOrder === "role-player" ? "#fff" : undefined,
                  }}
                >
                  Role trước tên
                </button>
                <button type="button" onClick={() => setHostTargetRoleDisplayOrder(null)}>
                  Tự động
                </button>
              </div>
            </div>
            
            <div style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 12, marginTop: 12 }}>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>Tên thật của người chơi</div>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  type="text"
                  value={editingRealName}
                  onChange={(e) => setEditingRealName(e.target.value)}
                  placeholder="Nhập tên thật..."
                  style={{
                    flex: 1,
                    background: "rgba(255, 255, 255, 0.05)",
                    border: "1px solid var(--border)",
                    borderRadius: 6,
                    color: "#fff",
                    padding: "6px 10px",
                    fontSize: "14px",
                    outline: "none"
                  }}
                />
                <button
                  type="button"
                  onClick={() => {
                    if (!roomId || !hostPlayerActionTargetId) return;
                    socket.emit("hostSetPlayerRealName", {
                      roomId,
                      targetId: hostPlayerActionTargetId,
                      playerRealName: editingRealName.trim()
                    });
                  }}
                  style={{
                    background: "var(--accent)",
                    color: "#fff",
                    border: "none",
                    borderRadius: 6,
                    padding: "6px 12px",
                    fontWeight: "bold",
                    cursor: "pointer"
                  }}
                >
                  Lưu
                </button>
              </div>
              {hostPlayerActionTargetId && VIP_REAL_NAMES[hostPlayerActionTargetId] && (
                <div style={{ marginTop: 6 }}>
                  <button
                    type="button"
                    onClick={() => setEditingRealName(VIP_REAL_NAMES[hostPlayerActionTargetId] || "")}
                    style={{
                      background: "transparent",
                      border: "none",
                      color: "var(--accent)",
                      padding: 0,
                      fontSize: "12px",
                      textDecoration: "underline",
                      cursor: "pointer"
                    }}
                  >
                    Gợi ý VIP: {VIP_REAL_NAMES[hostPlayerActionTargetId]}
                  </button>
                </div>
              )}
            </div>

            <div style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 12, marginTop: 12 }}>
              <div style={{ fontWeight: 600, marginBottom: 12 }}>Ảnh đại diện của người chơi</div>
              
              {/* Row 1: Preview & Current Selection Info & Clear Button */}
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
                {/* Vòng tròn xem trước (Avatar Preview) */}
                {(() => {
                  const previewUrl = getAvatarUrlByFileName(editingAvatar);
                  const isMaskedPreview = editingAvatar.trim().toUpperCase().startsWith("M ");
                  return (
                    <div
                      style={{
                        width: 52,
                        height: 52,
                        borderRadius: "50%",
                        border: "2px solid rgba(255, 255, 255, 0.15)",
                        background: isMaskedPreview 
                          ? `url(${nenLungAsset}) center/cover no-repeat` 
                          : (previewUrl ? `url(${previewUrl}) center/cover no-repeat` : "rgba(255, 255, 255, 0.05)"),
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
                        <span style={{ fontSize: "20px", color: "rgba(255, 255, 255, 0.25)" }}>👤</span>
                      )}
                    </div>
                  );
                })()}

                {/* Tên file hiện tại và nút xóa */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: 0.5 }}>Đang chọn:</div>
                  <div style={{ 
                    fontSize: "13px", 
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
                        fontSize: "11px",
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
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 10 }}>
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
                    padding: "6px 10px",
                    fontSize: "13px",
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
                          padding: "4px 0",
                          fontSize: "11px",
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
                maxHeight: "150px",
                overflowY: "auto",
                border: "1px solid var(--border)",
                borderRadius: 8,
                padding: 6,
                background: "rgba(0,0,0,0.15)",
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(42px, 1fr))",
                gap: 6,
                marginBottom: 12
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
                        border: isSelected ? "2px solid var(--accent)" : "1px solid rgba(255, 255, 255, 0.1)",
                        background: isMasked 
                          ? `url(${nenLungAsset}) center/cover no-repeat` 
                          : "rgba(255, 255, 255, 0.03)",
                        position: "relative",
                        cursor: "pointer",
                        overflow: "hidden",
                        padding: 0,
                        outline: "none",
                        boxShadow: isSelected ? "0 0 6px var(--accent)" : "none",
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
                  <div style={{ gridColumn: "1 / -1", textAlign: "center", color: "rgba(255,255,255,0.3)", fontSize: "12px", padding: "16px 0" }}>
                    Không tìm thấy avatar
                  </div>
                )}
              </div>

              {/* Row 4: Nút Gắn ảnh */}
              <button
                type="button"
                onClick={() => {
                  if (!roomId || !hostPlayerActionTargetId) return;
                  // 1. Gửi qua socket lên server
                  socket.emit("hostSetPlayerAvatar", {
                    roomId,
                    targetId: hostPlayerActionTargetId,
                    playerAvatar: editingAvatar
                  });
                  // 2. Lưu local để F5 không mất
                  try {
                    const customAvatars = JSON.parse(localStorage.getItem("game-custom-avatars") || "{}");
                    if (editingAvatar) {
                      customAvatars[hostPlayerActionTargetId] = editingAvatar;
                    } else {
                      delete customAvatars[hostPlayerActionTargetId];
                    }
                    localStorage.setItem("game-custom-avatars", JSON.stringify(customAvatars));
                  } catch (e) {
                    console.error("Lỗi lưu avatar vào localStorage:", e);
                  }
                }}
                style={{
                  width: "100%",
                  background: "var(--accent)",
                  color: "#fff",
                  border: "none",
                  borderRadius: 6,
                  padding: "8px 12px",
                  fontWeight: "bold",
                  cursor: "pointer",
                  fontSize: "14px",
                  transition: "background 0.2s",
                }}
              >
                Gắn ảnh
              </button>
            </div>

            {!isHostPlayerActionTargetDead ? (
              <>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 16 }}>
                  <button
                    disabled={phase !== "night"}
                    style={{ opacity: phase === "night" ? 1 : 0.55 }}
                    onClick={() => {
                      if (!roomId || !hostPlayerActionTargetId || phase !== "night") return;
                      socket.emit("hostAddNightActionTime", {
                        roomId,
                        targetId: hostPlayerActionTargetId,
                      });
                      setHostPlayerActionTargetId(null);
                    }}
                  >
                    +10 giây lượt hành động
                  </button>
                  <button
                    style={{ background: "#e74c3c", color: "#fff" }}
                    onClick={() => {
                      setHostRuleEliminateTargetId(hostPlayerActionTargetId);
                      setHostPlayerActionTargetId(null);
                    }}
                  >
                    Loại vì phạm luật
                  </button>
                  <button onClick={() => setHostPlayerActionTargetId(null)}>Đóng</button>
                </div>
                {phase !== "night" && (
                  <div style={{ marginTop: 12, fontSize: 13, opacity: 0.72 }}>
                    Chỉ có thể cộng thời gian khi đang trong ban đêm.
                  </div>
                )}
              </>
            ) : (
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 16 }}>
                <button onClick={() => setHostPlayerActionTargetId(null)}>Đóng</button>
              </div>
            )}
          </div>
        </div>
      )}

      <ConfirmModal
        open={!!hostRuleEliminateTargetId && canShowConfirmModals}
        title="Loại người chơi vì phạm luật"
        message={`Bạn có chắc muốn loại ${hostRuleEliminateTargetName} vì phạm luật không? Người chơi này sẽ chết ngay lập tức trong ván hiện tại.`}
        confirmText="Loại người chơi"
        cancelText="Hủy"
        onConfirm={() => {
          if (!roomId || !hostRuleEliminateTargetId) return;
          socket.emit("hostEliminatePlayerForRules", {
            roomId,
            targetId: hostRuleEliminateTargetId,
          });
          setHostRuleEliminateTargetId(null);
        }}
        onCancel={() => setHostRuleEliminateTargetId(null)}
      />
      <ScoreboardModal
        open={scoreboardOpen}
        onClose={() => setScoreboardOpen(false)}
        scoreResult={room?.scoreResult || null}
      />

      {duskTransitionActive && (
        <GridMotionOverlay
          active={duskTransitionActive}
          onComplete={() => setDuskTransitionActive(false)}
        />
      )}



      {/* Trash Zone */}
      <div
        id="sticker-trash-zone"
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          height: "12dvh",
          zIndex: 1010,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          pointerEvents: "none",
          transform: draggingStickerId ? "translateY(0)" : "translateY(100%)",
          opacity: draggingStickerId ? 1 : 0,
          transition: draggingStickerId
            ? "transform 0.4s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.4s ease"
            : "transform 0.35s cubic-bezier(0.3, 0, 0.8, 0.15), opacity 0.35s ease-in",
          overflow: "hidden"
        }}
      >
        {/* Lớp nền đen mặc định */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "linear-gradient(to top, rgba(0, 0, 0, 0.9) 0%, rgba(0, 0, 0, 0.3) 60%, transparent 100%)",
            zIndex: -1
          }}
        />
        
        {/* Lớp nền đỏ khi rê sticker vào - Transition opacity tạo hiệu ứng chuyển màu gradient cực mượt */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "linear-gradient(to top, rgba(239, 68, 68, 0.95) 0%, rgba(239, 68, 68, 0.4) 60%, transparent 100%)",
            opacity: isOverTrash ? 1 : 0,
            transition: "opacity 0.3s ease-in-out",
            zIndex: -1
          }}
        />

        <img
          src={trashIcon}
          alt="Thùng rác"
          style={{
            width: "36px",
            height: "36px",
            filter: isOverTrash 
              ? "invert(21%) sepia(84%) saturate(7415%) hue-rotate(354deg) brightness(93%) contrast(92%)"
              : "invert(100%) brightness(200%)",
            transform: isOverTrash ? "translateY(-10px) scale(1.15)" : "translateY(0) scale(1.0)",
            transition: "transform 0.25s cubic-bezier(0.16, 1, 0.3, 1), filter 0.25s ease"
          }}
        />
      </div>
    </div>
  );
}
