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
import { useGameSocketSync } from "./gameRoles/useGameSocketSync";
import { useDayVoteRole } from "./gameRoles/useDayVoteRole";
import { useMock8Test } from "./gameRoles/useMock8Test";
import { useDietQuyRole } from "./gameRoles/useDietQuyRole";
import angleCircleLeftSvg from "../assets/angle-circle-left.svg";
import angleCircleRightSvg from "../assets/angle-circle-right.svg";
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

const DIET_QUY_DIET_QUY_ROLE_SKILL_HINTS: Record<string, string> = {
  "Thợ giặt": "Hãy chờ Quản trò gửi thông tin về 1 vai trò Dân làng của 1 trong 2 người chơi",
  "Thủ thư": "Hãy chờ Quản trò gửi thông tin về 1 vai trò Tay sai của 1 trong 2 người chơi (hoặc không có)",
  "Điều tra viên": "Hãy chờ Quản trò gửi thông tin về 1 vai trò Ác quỷ của 1 trong 2 người chơi",
  "Đầu bếp": "Hãy chờ Quản trò gửi thông tin số lượng cặp người chơi xấu ngồi cạnh nhau",
  "Đồng cảm": "Hãy chờ Quản trò gửi thông tin số lượng người chơi xấu ngồi sát cạnh bạn",
  "Thầy bói": "Chọn đúng 2 người chơi trên vòng tròn để kiểm tra xem có ai là Quỷ không",
  "Chôn cất": "Hãy chờ Quản trò gửi thông tin về vai trò thực sự của người vừa bị treo cổ ban ngày",
  "Nhà sư": "Chọn một người chơi khác mà bạn muốn bảo vệ khỏi sự tấn công của Ác Quỷ đêm nay hoặc không hành động để bỏ qua",
  "Nuôi quạ": "Chọn một người chơi để tìm hiểu vai trò thực sự của họ nếu bạn bị chết trong đêm nay",
  "Trinh nữ": "Hãy ngủ yên và chờ đợi ngày mới bắt đầu",
  "Diệt quỷ": "Hãy ngủ yên và chờ đợi ngày mới bắt đầu",
  "Chiến sĩ": "Hãy ngủ yên và chờ đợi ngày mới bắt đầu",
  "Thị trưởng": "Hãy ngủ yên và chờ đợi ngày mới bắt đầu",
  "Độc thủ": "Chọn một người chơi để đầu độc kỹ năng của họ trong đêm nay hoặc không hành động để bỏ qua",
  "Gián điệp": "Hãy xem toàn bộ danh sách vai trò hiện tại (tất cả mọi người) trên màn hình của bạn",
  "Phò": "Chọn một người chơi để quyến rũ họ, bảo vệ họ khỏi Ác quỷ hoặc chặn kỹ năng của họ đêm nay",
  "Ác Quỷ": "Chọn cắn một người chơi đêm nay để tiêu diệt họ hoặc không hành động để bỏ qua",
  "Người ẩn dật": "Hãy ngủ yên và chờ đợi ngày mới bắt đầu",
  "Thánh nhân": "Hãy ngủ yên và chờ đợi ngày mới bắt đầu"
};

const renderInfoCard = (text: string) => (
  <div 
    style={{
      padding: "20px 24px",
      background: "rgba(255, 255, 255, 0.02)",
      border: "1px solid rgba(255, 255, 255, 0.06)",
      borderRadius: "12px",
      color: "rgba(255, 255, 255, 0.95)",
      fontSize: text.length > 50 ? "0.95rem" : "1.1rem",
      fontWeight: "500",
      textAlign: "center",
      boxSizing: "border-box",
      backdropFilter: "blur(8px)",
      WebkitBackdropFilter: "blur(8px)",
      textShadow: "0 2px 4px rgba(0,0,0,0.6)",
      boxShadow: "0 4px 16px rgba(0, 0, 0, 0.25)",
      fontFamily: "var(--font-family, sans-serif)",
      minHeight: "100px",
      display: "flex",
      alignItems: "center",
      justifyContent: "center"
    }}
  >
    {text}
  </div>
);

const HUNTER_BULLET_ANIM_MS = 4000;
type TargetRoleDisplayOrder = "player-role" | "role-player";

export default function GameDietQuy() {
  const { role: contextRole, room, setRoom } = useRoomContext();
  const nav = useNavigate();
  const location = useLocation();
  const query = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const roomId = query.get("roomId");
  const [roleOverride, setRoleOverride] = useState<string | null>("Thần tình yêu");
  const role = roomId === "mock-8" ? roleOverride : contextRole;
  const debugAnim = query.get("debugAnim") === "1";
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
    role === "Độc thủ" ||
    role === "Gián điệp" ||
    role === "Phò" ||
    role === "Ác Quỷ";

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

  const [dietQuyNightStartPlayerId, setDietQuyNightStartPlayerId] = useState<string | null>(null);
  const [selectedDirection, setSelectedDirection] = useState<"clockwise" | "counter_clockwise" | null>(null);
  const [triggerBlink, setTriggerBlink] = useState(false);
  const [slayerSelectMode, setSlayerSelectMode] = useState(false);
  const [slayerTargetId, setSlayerTargetId] = useState<string | null>(null);
  const [showSlayerConfirm, setShowSlayerConfirm] = useState(false);

  useEffect(() => {
    if (phase !== "day" && phase !== "dusk") {
      setDietQuyNightStartPlayerId(null);
      setSelectedDirection(null);
      setTriggerBlink(false);
    }
  }, [phase]);

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

  const dietQuy = useDietQuyRole({ roomId, phase, role, room, deadPlayers });

  const confirmSlayerAction = () => {
    if (!roomId || !slayerTargetId) return;
    socket.emit("dietQuySlayerAbility", { roomId, targetId: slayerTargetId });
    setShowSlayerConfirm(false);
    setSlayerSelectMode(false);
    setSlayerTargetId(null);
  };

  const hasVisibleActionPanel = useMemo(() => {
    if (phase !== "night" || !role || isCurrentPlayerDeadForNightActions || !isNightInfoVisible) return false;
    if (role === "Phù thủy") return true;
    if (role === "Tay Buôn") return true;
    if (ELEMENTAL_ROLE_SET.has(role) && sync.elementalActionMode === "buff" && (allNightActionsSimultaneous || currentNightTurnRole === role)) return true;
    if (role === "Thần tình yêu") {
      return !!love.targetId;
    }
    return false;
  }, [phase, role, isCurrentPlayerDeadForNightActions, sync.elementalActionMode, allNightActionsSimultaneous, currentNightTurnRole, loveActionPlacement, love.targetId]);

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
      let baseHintText = DIET_QUY_ROLE_SKILL_HINTS[role] || "";
      if (role === "Bán sói") {
        if (isBanSoiAligned || isWildWolfConverted) {
          baseHintText = DIET_QUY_ROLE_SKILL_HINTS["Sói"];
        } else {
          baseHintText = "Bạn hiện vẫn là một dân làng nên chưa có khả năng thực hiện hành động đêm. Nhưng hãy cẩn thận vì nếu bạn bị sói tấn công thì dòng máu sói của bạn sẽ trỗi dậy";
        }
      }
      if (!baseHintText && ELEMENTAL_ROLE_SET.has(role)) {
        baseHintText = "Chọn một người mà bạn nghĩ họ cũng là dân làng nắm giữ nguyên tố";
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

    return (
      <>
        <style>{`
          @keyframes fadeInUp {
            from {
              opacity: 0;
              transform: translateY(8px);
            }
            to {
              opacity: 1;
              transform: translateY(0);
            }
          }
          .role-skill-hint {
            animation: fadeInUp 0.4s ease-out forwards;
          }
          @media (max-width: 768px) {
            .role-skill-hint {
              max-width: 58% !important;
              
              margin-right: auto !important;
            }
          }
          @media (min-width: 769px) {
            .role-skill-hint {
              max-width: 550px !important;
              margin: 0 auto !important;
            }
          }
        `}</style>
        <div 
          className="role-skill-hint"
          style={{
            background: "rgba(18, 14, 38, 0.65)",
            backdropFilter: "blur(10px)",
            WebkitBackdropFilter: "blur(10px)",
            border: "1px solid rgba(168, 85, 247, 0.22)",
            borderRadius: "10px",
            padding: "8px 12px",
            color: "#e2e8f0",
            fontSize: "0.85rem",
            lineHeight: "1.4",
            boxShadow: "0 6px 24px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.05)",
            textAlign: "left",
            pointerEvents: "auto",
            marginTop: "10px",
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
    const publicRoleBadges = roomForDisplay?.publicRevealedRolesByPlayerId || {};
    const allRoleBadges = sync.revealedRolesByPlayerId || {};

    if (isHost) {
      return { ...allRoleBadges, ...publicRoleBadges };
    }

    const extraBadges: Record<string, string> = {};
    const myId = clientId;
    if (myId) {
      if (role === "Đầu bếp" && dietQuy.chefInfo !== null) {
        extraBadges[myId] = `Đầu bếp (${dietQuy.chefInfo})`;
      }
      if (role === "Đồng cảm" && dietQuy.empathInfo !== null) {
        extraBadges[myId] = `Đồng cảm (${dietQuy.empathInfo})`;
      }
      if (role === "Chôn cất" && dietQuy.undertakerInfo && roomForDisplay?.dietQuyExecutedPlayerId) {
        extraBadges[roomForDisplay.dietQuyExecutedPlayerId] = dietQuy.undertakerInfo;
      }
      if (role === "Nuôi quạ" && dietQuy.ravenkeeperResult && roomForDisplay?.dietQuyRavenkeeperTargetId) {
        extraBadges[roomForDisplay.dietQuyRavenkeeperTargetId] = dietQuy.ravenkeeperResult;
      }
    }
    return { ...publicRoleBadges, ...extraBadges };
  }, [
    isHost,
    roomForDisplay?.publicRevealedRolesByPlayerId,
    sync.revealedRolesByPlayerId,
    role,
    dietQuy.chefInfo,
    dietQuy.empathInfo,
    dietQuy.undertakerInfo,
    dietQuy.ravenkeeperResult,
    roomForDisplay?.dietQuyExecutedPlayerId,
    roomForDisplay?.dietQuyRavenkeeperTargetId,
    clientId
  ]);

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
    if (dayVote.onPlayerClick(playerId)) return;
    if (slayerSelectMode) {
      if (deadPlayers.includes(playerId)) return;
      setSlayerTargetId(playerId);
      setShowSlayerConfirm(true);
      return;
    }
    if (isHost && (phase === "day" || phase === "dusk")) {
      setDietQuyNightStartPlayerId((prev) => (prev === playerId ? null : playerId));
      return;
    }
    if (dietQuy.onPlayerClick(playerId)) return;
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
  const rolePortraitAvifImagesForGame = useMemo(
    () => import.meta.glob<string>("../assets/Diệt Quỷ/C *.avif", { eager: true, import: "default" }),
    []
  );
  const normalizeRoleName = useCallback((value: string) => value.normalize("NFC").trim().toLowerCase(), []);
  const getAssetNameFromPath = useCallback((path: string) => path.split("/").pop()?.replace(/\.(png|avif)$/i, "") ?? "", []);
  const rolePortraitByNameForGame = useMemo(
    () => {
      const avifEntries = Object.entries(rolePortraitAvifImagesForGame).map(([path, src]) => [normalizeRoleName(getAssetNameFromPath(path)), src]);
      return Object.fromEntries(avifEntries);
    },
    [getAssetNameFromPath, normalizeRoleName, rolePortraitAvifImagesForGame]
  );
  const normalizedRole = shouldShowRolePortrait && role ? normalizeRoleName(role) : null;
  const companionAssetCandidates = useMemo(() => {
    if (!normalizedRole || !role) return [] as string[];
    const inferredCompanion = `C ${role.normalize("NFC").trim()}`;
    return [inferredCompanion];
  }, [normalizedRole, role]);

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
      {new URLSearchParams(window.location.search).get("debugWitch") === "1" && (
        <div style={{
          position: "fixed",
          top: 80,
          right: 20,
          zIndex: 999999,
          display: "flex",
          flexDirection: "column",
          gap: 10,
          background: "rgba(15, 23, 42, 0.9)",
          padding: 12,
          borderRadius: 8,
          border: "1px solid rgba(255, 255, 255, 0.1)",
          boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)"
        }}>
          <div style={{ fontSize: "12px", fontWeight: "bold", color: "#94a3b8", marginBottom: 4 }}>WITCH TEST PANEL</div>
          <button
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
            style={{
              padding: "8px 12px",
              background: "rgba(168, 85, 247, 0.2)",
              border: "1px solid rgba(168, 85, 247, 0.4)",
              color: "#d8b4fe",
              borderRadius: 4,
              cursor: "pointer",
              fontSize: "12px",
              fontWeight: "bold"
            }}
          >
            Test Cứu (Rainbow)
          </button>
          <button
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
            style={{
              padding: "8px 12px",
              background: "rgba(244, 63, 94, 0.2)",
              border: "1px solid rgba(244, 63, 94, 0.4)",
              color: "#fda4af",
              borderRadius: 4,
              cursor: "pointer",
              fontSize: "12px",
              fontWeight: "bold"
            }}
          >
            Test Giết (Rose Red)
          </button>
        </div>
      )}
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

      {debugAnim && (
        <div className="game-top-actions" style={{ marginTop: "0.625rem" }}>
          <button
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
          >
            Test shot
          </button>

          <button
            onClick={() => {
              const last = lastHunterShotRef.current;
              if (!last) return;
              playHunterShotAnim(last.hunterId, last.targetId);
            }}
          >
            Replay last shot
          </button>

          <div style={{ opacity: 0.7, fontSize: "0.75rem", alignSelf: "center" }}>
            Tip: Shift+H để random shot
          </div>
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
            <div style={{ margin: "2rem auto", position: "relative" }}>
              {isHost && (phase === "day" || phase === "dusk") && (
                <>
                  <style>{`
                    @keyframes highlightBlink {
                      0%, 100% { border-color: rgba(255, 255, 255, 0.1); box-shadow: none; }
                      50% { border-color: #f1c40f; box-shadow: 0 0 20px #f1c40f; }
                    }
                    .angle-btn {
                      transition: all 0.3s ease-in-out !important;
                    }
                    .angle-btn:hover {
                      transform: scale(1.08) !important;
                      border-color: var(--accent) !important;
                      box-shadow: 0 0 15px rgba(255, 255, 255, 0.2) !important;
                      opacity: 1 !important;
                    }
                  `}</style>
                  <button
                    type="button"
                    onClick={() => setSelectedDirection("counter_clockwise")}
                    className="angle-btn"
                    onAnimationEnd={() => setTriggerBlink(false)}
                    style={{
                      width: "56px",
                      height: "56px",
                      borderRadius: "50%",
                      background: selectedDirection === "counter_clockwise" ? "rgba(16, 185, 129, 0.15)" : "rgba(255, 255, 255, 0.05)",
                      border: selectedDirection === "counter_clockwise" ? "2px solid var(--accent)" : "1px solid rgba(255, 255, 255, 0.1)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      cursor: "pointer",
                      opacity: selectedDirection === "counter_clockwise" ? 1 : (selectedDirection === "clockwise" ? 0.25 : 0.7),
                      animation: triggerBlink ? "highlightBlink 1.2s ease-in-out 2" : "none",
                      boxShadow: selectedDirection === "counter_clockwise" ? "0 0 15px var(--accent)" : "none",
                      padding: 0,
                      outline: "none",
                      position: "absolute",
                      left: "15px",
                      top: "50%",
                      transform: "translateY(-50%)",
                      zIndex: 100
                    }}
                    title="Ngược chiều kim đồng hồ"
                  >
                    <img src={angleCircleLeftSvg} style={{ width: "32px", height: "32px", filter: "brightness(0) invert(1)", display: "block" }} />
                  </button>

                  <button
                    type="button"
                    onClick={() => setSelectedDirection("clockwise")}
                    className="angle-btn"
                    onAnimationEnd={() => setTriggerBlink(false)}
                    style={{
                      width: "56px",
                      height: "56px",
                      borderRadius: "50%",
                      background: selectedDirection === "clockwise" ? "rgba(16, 185, 129, 0.15)" : "rgba(255, 255, 255, 0.05)",
                      border: selectedDirection === "clockwise" ? "2px solid var(--accent)" : "1px solid rgba(255, 255, 255, 0.1)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      cursor: "pointer",
                      opacity: selectedDirection === "clockwise" ? 1 : (selectedDirection === "counter_clockwise" ? 0.25 : 0.7),
                      animation: triggerBlink ? "highlightBlink 1.2s ease-in-out 2" : "none",
                      boxShadow: selectedDirection === "clockwise" ? "0 0 15px var(--accent)" : "none",
                      padding: 0,
                      outline: "none",
                      position: "absolute",
                      right: "15px",
                      top: "50%",
                      transform: "translateY(-50%)",
                      zIndex: 100
                    }}
                    title="Theo chiều kim đồng hồ"
                  >
                    <img src={angleCircleRightSvg} style={{ width: "32px", height: "32px", filter: "brightness(0) invert(1)", display: "block" }} />
                  </button>
                </>
              )}
              
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
                seerResults={null}
                deadPlayersOverride={deadPlayersOverrideForRender}
                bulletAnimation={hunterBulletAnim}
                witchPotionEffect={sync.witchPotionEffect}
                onWitchPotionEffectComplete={() => sync.setWitchPotionEffect(null)}
                highlightPlayerId={highlightPlayerId}
                secondaryHighlightPlayerIds={secondaryHighlightPlayerIds}
                cursedHighlightPlayerIds={[]}
                cursedHighlightIsDanger={false}
                verdictLivePlayerIds={autoTrialHighlightSuppressed ? undefined : autoTrialHighlight?.secondaryIds}
                verdictDiePlayerIds={autoTrialHighlightSuppressed ? undefined : autoTrialHighlight?.dangerIds}
                showRoleBadges={!!roleBadgesForDisplay}
                roleBadges={roleBadgesForDisplay}
                activeNightRole={isHost && isSequentialNight ? currentNightTurnRole : null}
                suppressNightActionProgress={autoTrialHighlightSuppressed}
                selectedOutlinePlayerId={
                  (isHost && (phase === "day" || phase === "dusk") ? dietQuyNightStartPlayerId : null) ||
                  dietQuy.playerPositionsProps.selectedOutlinePlayerId ||
                  slayerTargetId ||
                  null
                }
                selectedOutlinePlayerIds={[]}
                dangerPlayerIds={dangerHighlightPlayerIds}
                showWolfVoteBadges={false}
                wolfVoteVoterIds={[]}
                voteWeightsByVoterId={dayVote.playerPositionsProps.showWolfVoteBadges ? dayVoteWeightsByVoterId : undefined}
                showWolfBadges={false}
                wolfBadgePlayerIds={[]}
                wolfBadgeRoles={{}}
                cheesePlayerIds={[]}
                trialOrangePlayerId={dayVote.playerPositionsProps.trialOrangePlayerId}
                trialWhitePlayerIds={dayVote.playerPositionsProps.trialWhitePlayerIds}
                trialGreenPlayerId={dayVote.playerPositionsProps.trialGreenPlayerId}
                replayActorIds={replayActorIds}
                replayTargetIds={replayTargetIds}
                dietQuyOrangeHighlightPlayerIds={dietQuy.playerPositionsProps.dietQuyOrangeHighlightPlayerIds}
                dietQuyRedHighlightPlayerIds={dietQuy.playerPositionsProps.dietQuyRedHighlightPlayerIds}
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
              {!hasVisibleActionPanel && renderSkillHint()}
            
            </div>
            <RoleCharacterPortrait
              role={shouldShowRolePortrait ? role : null}
              backgroundAssetOverride={null}
              gameMode="diet_quy"
            />
            <RoleCompanionOverlay
              companionRoleSrc={shouldRevealMyRole && !(sync.gameEnded && canViewLog) ? companionRoleSrc : null}
              normalizedRole={normalizedRole}
              playerFrameHeightPx={playerFrameHeightPx}
              seerResults={null}
            />
          </>
        );
      })()}

      {!sync.gameEnded && dietQuy.panel}

      {/* Game controls */}
      {canShowGameControls && (
        <div className="game-host-controls">
          
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

      {/* Slayer Button Day */}
      {phase === "day" && role === "Diệt quỷ" && !isCurrentPlayerDead && !room?.dietQuySlayerUsed && (
        <div style={{ margin: "15px auto", textAlign: "center" }}>
          <button
            onClick={() => setSlayerSelectMode(!slayerSelectMode)}
            style={{
              padding: "10px 20px",
              background: slayerSelectMode ? "#e74c3c" : "var(--accent)",
              color: "#fff",
              border: "none",
              borderRadius: "8px",
              cursor: "pointer",
              fontWeight: "bold",
              boxShadow: "0 4px 12px rgba(0,0,0,0.2)"
            }}
          >
            {slayerSelectMode ? "❌ Hủy chọn mục tiêu bắn" : "🎯 Diệt Quỷ (Slayer): Bắn một người"}
          </button>
          {slayerSelectMode && (
            <p style={{ color: "#ff9800", marginTop: 8 }}>Hãy click chọn 1 người trên vòng tròn để tiêu diệt.</p>
          )}
        </div>
      )}

      {/* Slayer Confirm Modal */}
      <ConfirmModal
        open={showSlayerConfirm && !!slayerTargetId}
        title="Xác nhận diệt quỷ"
        message={`Bạn có chắc chắn muốn sử dụng kỹ năng Slayer bắn ${room?.players.find(p => p.id === slayerTargetId)?.name}? (Kỹ năng chỉ dùng được 1 lần duy nhất trong game)`}
        onConfirm={confirmSlayerAction}
        onCancel={() => {
          setShowSlayerConfirm(false);
          setSlayerTargetId(null);
        }}
      />

      {/* Host Setup Night controls */}
      {isHost && (phase === "day" || phase === "dusk") && !sync.gameEnded && (
        <div style={{
          background: "var(--surface-muted)",
          padding: 16,
          borderRadius: 12,
          border: "1px solid var(--accent)",
          marginTop: 15,
          color: "#fff",
          maxWidth: 400,
          margin: "15px auto",
          textAlign: "center",
          boxShadow: "0 4px 12px rgba(0,0,0,0.2)"
        }}>
          <p style={{ margin: "0 0 10px 0", fontWeight: 600, fontSize: "1rem" }}>
            Chọn người chơi sẽ đi theo lượt vòng nào đầu tiên
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, margin: "12px 0", textAlign: "left" }}>
            <div style={{ fontSize: "0.95rem" }}>
              👤 Người đi đầu tiên: {dietQuyNightStartPlayerId ? (
                <span style={{ color: "var(--accent)", fontWeight: 700 }}>
                  {room.players.find(p => p.id === dietQuyNightStartPlayerId)?.name}
                </span>
              ) : (
                <span style={{ color: "#888", fontStyle: "italic" }}>Chưa chọn (Click trên vòng tròn)</span>
              )}
            </div>
            
            <div style={{ fontSize: "0.95rem" }}>
              ➡️ Chiều đi đêm: {selectedDirection ? (
                <span style={{ color: "var(--accent)", fontWeight: 700 }}>
                  {selectedDirection === "clockwise" ? "Theo chiều kim đồng hồ ➡️" : "Ngược chiều kim đồng hồ ⬅️"}
                </span>
              ) : (
                <span style={{ color: "#888", fontStyle: "italic" }}>Chưa chọn (Chọn nút mũi tên ở hai bên)</span>
              )}
            </div>
          </div>

          <div style={{ marginTop: 15 }}>
            <button
              onClick={() => {
                if (!dietQuyNightStartPlayerId || !selectedDirection) {
                  if (!selectedDirection) {
                    setTriggerBlink(true);
                  }
                  return;
                }
                socket.emit("changePhase", {
                  roomId,
                  phase: "night",
                  dietQuyNightDirection: selectedDirection,
                  dietQuyNightStartPlayerId
                });
              }}
              onMouseEnter={() => {
                if (!selectedDirection) {
                  setTriggerBlink(true);
                }
              }}
              style={{
                width: "100%",
                padding: "10px",
                background: (!dietQuyNightStartPlayerId || !selectedDirection) ? "#333" : "var(--accent)",
                border: "none",
                color: (!dietQuyNightStartPlayerId || !selectedDirection) ? "#888" : "#fff",
                borderRadius: 8,
                cursor: (!dietQuyNightStartPlayerId || !selectedDirection) ? "not-allowed" : "pointer",
                fontWeight: 700,
                boxShadow: (!dietQuyNightStartPlayerId || !selectedDirection) ? "none" : "0 2px 8px rgba(0,0,0,0.3)",
                transition: "all 0.3s ease"
              }}
            >
              <AvifIcon name="🌙" style={{ marginRight: 6 }} /> Bắt đầu đêm
            </button>
          </div>
        </div>
      )}

      {/* Info Cards Panel for Clocktower info */}
      <div id="info-TiếtLộ" style={{
        display: "flex",
        flexDirection: "column",
        gap: 10,
        maxWidth: 600,
        margin: "25px auto",
        textAlign: "center"
      }}>
        {role === "Đầu bếp" && dietQuy.chefInfo !== null && (
          renderInfoCard(`Thông tin Đầu bếp: Có ${dietQuy.chefInfo} cặp người chơi phe ác ngồi cạnh nhau.`)
        )}
        {role === "Đồng cảm" && dietQuy.empathInfo !== null && (
          renderInfoCard(`Thông tin Đồng cảm: Có ${dietQuy.empathInfo} người ngồi cạnh là phe ác.`)
        )}
        {role === "Chôn cất" && dietQuy.undertakerInfo !== null && (
          renderInfoCard(`Người bị treo cổ hôm nay có vai trò thực sự là ${dietQuy.undertakerInfo}.`)
        )}
        {role === "Thợ giặt" && dietQuy.washerwomanInfo && (
          renderInfoCard(`Một trong hai người này là ${dietQuy.washerwomanInfo.townsfolkRole}`)
        )}
        {role === "Thủ thư" && dietQuy.librarianInfo && (
          renderInfoCard(`Thông tin Thủ thư: Một trong hai người chơi ${dietQuy.librarianInfo.targetIds.map(id => room.players.find(p => p.id === id)?.name || id).join(" hoặc ")} có vai trò là ${dietQuy.librarianInfo.role}.`)
        )}
        {role === "Điều tra viên" && dietQuy.investigatorInfo && (
          renderInfoCard(`Thông tin Điều tra viên: Một trong hai người chơi ${dietQuy.investigatorInfo.targetIds.map(id => room.players.find(p => p.id === id)?.name || id).join(" hoặc ")} có vai trò là Tay sai ${dietQuy.investigatorInfo.minionRole}.`)
        )}
        {role === "Thầy bói" && dietQuy.fortuneTellerResult !== null && (
          renderInfoCard(`Thông tin Thầy bói: ${dietQuy.fortuneTellerResult === "yes" ? "Có ít nhất một người là Quỷ (hoặc Red Charm) trong 2 người bạn đã kiểm tra." : "Không có ai là Quỷ (hoặc Red Charm) trong 2 người bạn đã kiểm tra."}`)
        )}
      </div>

      {isHost && logPanel}

      
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
