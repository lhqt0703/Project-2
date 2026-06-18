import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { socket, clientId } from "../socket";
import { useLocation, useNavigate } from "react-router-dom";
import { useRoomContext } from "../context/RoomContext";
import PlayerPositions, { AVA_IMAGES, getAvatarUrlByFileName } from "../components/PlayerPositions";
import GameLogPanel from "../components/GameLogPanel";
import ConfirmModal from "../components/ConfirmModal";
import RoleCharacterPortrait from "../components/RoleCharacterPortrait";
import type { GamePhase } from "./gameRoles/socketEvents";
import { useGameSocketSync } from "./gameRoles/useGameSocketSync";
import { useDayVoteRole } from "./gameRoles/useDayVoteRole";
import { useDietQuyRole } from "./gameRoles/useDietQuyRole";
import { ScoreboardModal } from "../components/ScoreboardModal";
import RoleCard3D from "../components/RoleCard3D";
import Masonry from "../components/Masonry";
import nenLungAsset from "../assets/nền lưng.avif";
import RoomBg from "../assets/Nền phòng.avif";
import ChieuBg from "../assets/nền chiều.avif";
import { gsap } from "gsap";
import { GameRoleStatusBar } from "../components/GameRoleStatusBar";
import medalSvg from "../assets/medal.svg";
import angleCircleLeftSvg from "../assets/angle-circle-left.svg";
import angleCircleRightSvg from "../assets/angle-circle-right.svg";
import GridMotionOverlay from "../components/GridMotionOverlay";
import RoleCompanionOverlay from "../components/RoleCompanionOverlay";
import { AvifIcon } from "../components/AvifIcon";
import { CountdownButton } from "../components/CountdownButton";
import { shootWinnerConfettiFromSides } from "../utils/winnerConfetti";


const VIP_REAL_NAMES: Record<string, string> = {
  "046fa88a-a719-47c3-8b97-ddfc8337cf83": "Phúc 🍫",
  "f7d9652f-ac74-4557-81a2-7c2731a77d37": "Din Phạm",
  "397d9740-e21b-4ade-941f-25912aefd591": "Hà Việt",
  "client_1780242307126_pmozg54dmra": "San",
  "client_1780242348813_swid1tk0trh": "Huythuhai",
  "8dfc1d63-988f-460d-8569-8a1964be99a0": "Cường",
  "ec0c6c66-9ce7-4d86-ac12-25824af15b79": "Việt Thắng",
  "9bc9009c-13b3-4ba6-bbdd-a7189b477ccd": "Duy"
};

type TargetRoleDisplayOrder = "player-role" | "role-player";

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

const DIET_QUY_ROLE_SKILL_HINTS: Record<string, string> = {
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

export default function GameDietQuy() {
  const { role, room, setRoom } = useRoomContext();
  const nav = useNavigate();
  const location = useLocation();
  const query = new URLSearchParams(location.search);
  const roomId = query.get("roomId");
  const sync = useGameSocketSync({ roomId, setRoom });
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
  const isCurrentPlayerDeadForNightActions = isCurrentPlayerDead;
  const deadPlayersForNightActions = deadPlayers;
  const shouldBlockDeadNightRoleReveal = phase === "night" && isCurrentPlayerDeadForNightActions;
  const shouldHidePlayerRoleText = !isHost && (!!room?.hidePlayerRoleText || shouldBlockDeadNightRoleReveal);

  const [noticeModal, setNoticeModal] = useState<{ title: string; message: string; onConfirm?: () => void } | null>(null);
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
  useEffect(() => {
    if (hostPlayerActionTargetId) {
      const p = room?.players.find((x) => x.id === hostPlayerActionTargetId);
      setEditingRealName(p?.playerRealName || "");
      setEditingAvatar(p?.playerAvatar || "");
    }
  }, [hostPlayerActionTargetId, room?.players]);

  // Tự động đồng bộ ảnh đại diện tùy chỉnh từ localStorage lên server (dành cho Host)
  useEffect(() => {
    if (!room || clientId !== room.hostId || !socket) return;
    try {
      const customAvatars = JSON.parse(localStorage.getItem("game-custom-avatars") || "{}");
      room.players.forEach((p) => {
        const savedAvatar = customAvatars[p.id];
        if (savedAvatar && p.playerAvatar !== savedAvatar) {
          socket.emit("hostSetPlayerAvatar", {
            roomId: room.id,
            targetId: p.id,
            playerAvatar: savedAvatar,
          });
        }
      });
    } catch (e) {
      console.error("Lỗi đồng bộ avatar từ localStorage:", e);
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
  const [cardFlippedToFront, setCardFlippedToFront] = useState(false);

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
      primaryId: targetId,
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
    return deadPlayers;
  }, [deadPlayers, frozenRoomSnapshot, isHost, sync.gameEnded]);

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

  const roomForRoles = useMemo(
    () =>
      room ??
      ({
        players: [],
        deadPlayers: [],
        playerRoles: {},
      } as any),
    [room]
  );

  const currentNightTurnPlayerId = room?.nightTurnPlayerId ?? null;

  const nightTurnPaused = room?.nightTurnPaused ?? false;
  const nightTurnRemainingMs = room?.nightTurnRemainingMs ?? null;
  const nightTurnDeadline = room?.nightTurnDeadline ?? null;
  const serverTimeOffset = useMemo(() => {
    if (!room?.serverTime) return 0;
    return room.serverTime - Date.now();
  }, [room?.serverTime]);

  const [nightTurnNow, setNightTurnNow] = useState(() => Date.now() + serverTimeOffset);

  useEffect(() => {
    if (phase !== "night") return;
    if (nightTurnPaused) return;
    setNightTurnNow(Date.now() + serverTimeOffset);
    const t = setInterval(() => setNightTurnNow(Date.now() + serverTimeOffset), 1000);
    return () => clearInterval(t);
  }, [nightTurnPaused, phase, serverTimeOffset]);

  const nightTurnRemainingSec = useMemo(() => {
    if (phase !== "night" || !currentNightTurnPlayerId) return null;
    if (nightTurnPaused) {
      if (nightTurnRemainingMs == null) return null;
      return Math.max(0, Math.ceil(nightTurnRemainingMs / 1000));
    }
    if (!nightTurnDeadline) return null;
    return Math.max(0, Math.ceil((nightTurnDeadline - nightTurnNow) / 1000));
  }, [currentNightTurnPlayerId, phase, nightTurnDeadline, nightTurnNow, nightTurnPaused, nightTurnRemainingMs]);

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

  const dietQuy = useDietQuyRole({
    roomId,
    phase,
    role,
    room: roomForRoles,
    deadPlayers: deadPlayersForNightActions,
  });

  const hasVisibleActionPanel = useMemo(() => {
    if (phase !== "night" || !role || isCurrentPlayerDeadForNightActions) return false;
    if (isHost) return false;
    return room?.nightTurnPlayerId === clientId && room?.nightTurnRole === role;
  }, [phase, role, isCurrentPlayerDeadForNightActions, isHost, room, clientId]);

  const renderSkillHint = () => {
    if (phase !== "night" || !role || isCurrentPlayerDeadForNightActions) return null;
    
    let hintText = DIET_QUY_ROLE_SKILL_HINTS[role] || "Hãy ngủ yên và chờ đợi ngày mới bắt đầu";
    
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
              max-width: 62% !important;
              margin-left: 8px !important;
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
        >
          {hintText}
        </div>
      </>
    );
  };

  const confirmSlayerAction = () => {
    if (!roomId || !slayerTargetId) return;
    socket.emit("dietQuySlayerAbility", { roomId, targetId: slayerTargetId });
    setSlayerSelectMode(false);
    setSlayerTargetId(null);
    setShowSlayerConfirm(false);
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

  const canShowConfirmModals = true;

  const dayVoteWeightsByVoterId = useMemo(() => {
    const publicRoles = roomForDisplay?.publicRevealedRolesByPlayerId || {};
    const entries = Object.entries(publicRoles).filter(([, publicRole]) => publicRole === "Trưởng làng");
    if (!entries.length) return undefined;
    return Object.fromEntries(entries.map(([playerId]) => [playerId, 2]));
  }, [roomForDisplay?.publicRevealedRolesByPlayerId]);

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

  const lastDayVoteNoticeSeqRef = useRef(0);
  const lastTrialVerdictNoticeSeqRef = useRef(0);

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
    const winnerText = (sync.gameEnded.winner as string) === "demons" ? "Phe Quỷ" : "Phe Dân";
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
    if (isHost && (phase === "day" || phase === "dusk")) {
      setDietQuyNightStartPlayerId(playerId);
      return;
    }
    if (slayerSelectMode) {
      if (deadPlayers.includes(playerId)) return;
      setSlayerTargetId(playerId);
      setShowSlayerConfirm(true);
      return;
    }
    if (dietQuy.onPlayerClick(playerId)) return;
    if (deadPlayers.includes(playerId)) return;
    if (dayVote.onPlayerClick(playerId)) return;
  };

  const handlePlayerDoubleClick = (playerId: string) => {
    if (!isHost) return;
    if (!roomId) return;
    if (sync.gameEnded) return;
    setHostPlayerActionTargetId(playerId);
  };

  const handleBackToRoomClick = () => {
    if (!roomId) return;
    socket.emit("requestReturnToRoom", { roomId });
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
  const shouldRevealMyRole = !isHost && !!role && (!shouldHidePlayerRoleText || !!sync.gameEnded);

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

  const isDuskTransitionPending = room?.phase === "dusk" && !duskRevealGameUI;
  const gameUIOpacity = isDuskTransitionPending ? 0 : 1;
  const gameUIPointerEvents = isDuskTransitionPending ? "none" : "auto";
  const deadPlayersOverrideForRender = displayDeadPlayers;

  const countdownSeconds = nightTurnRemainingSec;
  const showCountdown = !sync.gameEnded && (
    isHost ? (phase === "night" && countdownSeconds !== null) : (
      phase === "night" && currentNightTurnPlayerId === clientId && !isCurrentPlayerDeadForNightActions && countdownSeconds !== null
    )
  );

  return (
    <div
      className={`page-shell game-page${shouldShowRolePortrait ? " has-role-portrait" : ""}`}
      style={{
        padding: "1.25rem",
        opacity: gameUIOpacity,
        transition: "opacity 0.4s ease-in-out",
        pointerEvents: gameUIPointerEvents,
        isolation: "isolate"
      }}
    >
      {(phase === "day" || phase === "dusk") && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            backgroundImage: `url(${phase === "day" ? RoomBg : ChieuBg})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
            backgroundRepeat: "no-repeat",
            filter: "blur(4px)",
            zIndex: -1,
            transform: "scale(1.08)",
          }}
        />
      )}
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
      />

      {sync.gameEnded && (
        <h2>
          {sync.gameEnded.winner === "nobody" ? (
            "Kết thúc: Ván chơi đã được ngừng lại"
          ) : (
            <>
              Kết thúc:{" "}
              {(sync.gameEnded.winner as string) === "demons" ? "Phe Quỷ" : "Phe Dân"}{" "}
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
            <div style={{ display: "flex", alignItems: "center", gap: "2rem", flexWrap: "wrap" }}>
              {phase === "day" ? (
                <h1 style={{ margin: 0, display: "flex", alignItems: "center" }}><AvifIcon name="🌞" style={{ marginRight: 8 }} /> Ngày {displayNightNumber}</h1>
              ) : (
                <h1 style={{ margin: 0, display: "flex", alignItems: "center" }}><AvifIcon name="🌙" style={{ marginRight: 8 }} /> Đêm {displayNightNumber}</h1>
              )}
              <CountdownButton
                showCountdown={!!showCountdown}
                countdownSeconds={countdownSeconds}
                isPaused={!!nightTurnPaused}
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



      {phase === "night" && room.nightTurnPlayerId && isHost && (
        <div style={{
          marginTop: "0.5rem",
          fontWeight: 700,
          background: "rgba(231, 76, 60, 0.15)",
          padding: "8px 16px",
          borderRadius: 8,
          border: "1px solid rgba(231, 76, 60, 0.3)",
          display: "inline-block",
          color: "#fff"
        }}>
          <AvifIcon name="🌙" style={{ marginRight: 6 }} /> Lượt của: <span style={{ color: "var(--accent)", textShadow: "0 0 8px var(--accent)" }}>{room.players.find((p: any) => p.id === room.nightTurnPlayerId)?.name || "Người chơi"}</span>
          {room.nightTurnRole && ` (${room.nightTurnRole})`}
          {nightTurnRemainingSec !== null ? ` - còn ${nightTurnRemainingSec}s` : ""}
          {nightTurnPaused ? " (đang tạm ngưng)" : ""}
        </div>
      )}









      {phase === "day" && role === "Diệt quỷ" && !isCurrentPlayerDead && !room?.dietQuySlayerUsed && (
        <div style={{ margin: "15px auto", textAlign: "center" }}>
          <button
            onClick={() => setSlayerSelectMode(p => !p)}
            style={{
              padding: "10px 20px",
              background: slayerSelectMode ? "#e74c3c" : "var(--accent)",
              color: "#fff",
              border: "none",
              borderRadius: 8,
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
            <button onClick={handleBackToRoomClick}>
              Về phòng chờ
            </button>
          )}
        </div>
      )}

      {roomForDisplay?.positions && (phase !== "dusk" || isHost) && (() => {
        const replayActorIds: string[] = [];
        const replayTargetIds: string[] = [];

        return (
          <>
            <div
              style={{
                height: playerFrameHeightPx,
                width: "100%",
                maxWidth: "60rem",
                margin: "0 auto",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                position: "relative"
              }}
            >
              {isHost && (phase === "day" || phase === "dusk") && !sync.gameEnded && (
                <>
                  <style>{`
                    @keyframes highlightBlink {
                      0%, 100% {
                        opacity: 0.4;
                        transform: scale(1);
                        box-shadow: 0 0 5px rgba(255, 255, 255, 0.1);
                        border-color: rgba(255, 255, 255, 0.1);
                      }
                      50% {
                        opacity: 1;
                        transform: scale(1.1);
                        box-shadow: 0 0 20px var(--accent);
                        border-color: var(--accent);
                      }
                    }
                    .angle-btn {
                      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
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
                viewMode={viewMode}
                onPlayerClick={handlePlayerClick}
                onPlayerDoubleClick={handlePlayerDoubleClick}
                deadPlayersOverride={deadPlayersOverrideForRender}
                highlightPlayerId={highlightPlayerId}
                secondaryHighlightPlayerIds={secondaryHighlightPlayerIds}
                dangerPlayerIds={dangerHighlightPlayerIds}
                verdictLivePlayerIds={autoTrialHighlightSuppressed ? undefined : autoTrialHighlight?.secondaryIds}
                verdictDiePlayerIds={autoTrialHighlightSuppressed ? undefined : autoTrialHighlight?.dangerIds}
                showRoleBadges={!!roleBadgesForDisplay}
                roleBadges={roleBadgesForDisplay}
                selectedOutlinePlayerId={
                  (isHost && (phase === "day" || phase === "dusk") ? dietQuyNightStartPlayerId : null) ||
                  dietQuy.playerPositionsProps.selectedOutlinePlayerId ||
                  dayVote.playerPositionsProps.selectedOutlinePlayerId ||
                  null
                }
                dietQuyOrangeHighlightPlayerIds={dietQuy.playerPositionsProps.dietQuyOrangeHighlightPlayerIds}
                dietQuyRedHighlightPlayerIds={dietQuy.playerPositionsProps.dietQuyRedHighlightPlayerIds}
                selectedOutlinePlayerIds={[]}
                showWolfVoteBadges={dayVote.playerPositionsProps.showWolfVoteBadges}
                wolfVoteVoterIds={
                  dayVote.playerPositionsProps.showWolfVoteBadges
                    ? dayVote.playerPositionsProps.wolfVoteVoterIds
                    : []
                }
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
                suppressNightActionProgress={autoTrialHighlightSuppressed}
              />
              {!hasVisibleActionPanel && renderSkillHint()}
            </div>
            <RoleCharacterPortrait
              role={shouldShowRolePortrait ? role : null}
              backgroundAssetOverride={null}
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

      <div id="info-TiếtLộ" style={{
        display: "flex",
        flexDirection: "column",
        gap: 10,
        maxWidth: 600,
        margin: "25px auto",
        textAlign: "center"
      }}>
        {/* Chef info */}
        {role === "Đầu bếp" && dietQuy.chefInfo !== null && (
          renderInfoCard(`Thông tin Đầu bếp: Có ${dietQuy.chefInfo} cặp người chơi phe ác ngồi cạnh nhau.`)
        )}

        {/* Empath info */}
        {role === "Đồng cảm" && dietQuy.empathInfo !== null && (
          renderInfoCard(`Thông tin Đồng cảm: Có ${dietQuy.empathInfo} người ngồi cạnh là phe ác.`)
        )}

        {/* Undertaker info */}
        {role === "Chôn cất" && dietQuy.undertakerInfo !== null && (
          renderInfoCard(`Người bị treo cổ hôm nay có vai trò thực sự là ${dietQuy.undertakerInfo}.`)
        )}

        {/* Washerwoman info */}
        {role === "Thợ giặt" && dietQuy.washerwomanInfo && (
          renderInfoCard(`Một trong hai người này là ${dietQuy.washerwomanInfo.townsfolkRole}`)
        )}

        {/* Librarian info */}
        {role === "Thủ thư" && dietQuy.librarianInfo && (
          renderInfoCard(`Thông tin Thủ thư: Một trong hai người chơi ${dietQuy.librarianInfo.targetIds.map(id => room.players.find(p => p.id === id)?.name || id).join(" hoặc ")} có vai trò là ${dietQuy.librarianInfo.role}.`)
        )}

        {/* Investigator info */}
        {role === "Điều tra viên" && dietQuy.investigatorInfo && (
          renderInfoCard(`Thông tin Điều tra viên: Một trong hai người chơi ${dietQuy.investigatorInfo.targetIds.map(id => room.players.find(p => p.id === id)?.name || id).join(" hoặc ")} có vai trò là Tay sai ${dietQuy.investigatorInfo.minionRole}.`)
        )}

        {/* Fortune Teller result */}
        {role === "Thầy bói" && dietQuy.fortuneTellerResult !== null && (
          renderInfoCard(`Thông tin Thầy bói: ${dietQuy.fortuneTellerResult === "yes" ? "Có ít nhất một người là Quỷ (hoặc Red Charm) trong 2 người bạn đã kiểm tra." : "Không có ai là Quỷ (hoặc Red Charm) trong 2 người bạn đã kiểm tra."}`)
        )}

        {/* Ravenkeeper result */}
        {role === "Nuôi quạ" && dietQuy.ravenkeeperResult !== null && (
          renderInfoCard(`Thông tin Nuôi quạ: Người chơi bạn chọn có vai trò thực sự là ${dietQuy.ravenkeeperResult}.`)
        )}
      </div>


      {!sync.gameEnded && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, alignItems: "flex-start" }}>
          {dietQuy.panel}
          {hasVisibleActionPanel && renderSkillHint()}
        </div>
      )}

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
          {phase === "night" && !sync.gameEnded && (
            <button
              onClick={() => socket.emit("hostNightTurnNext", { roomId })}
              disabled={!currentNightTurnPlayerId}
              style={{ opacity: currentNightTurnPlayerId ? 1 : 0.6 }}
            >
              Chuyển sang lượt tiếp theo
            </button>
          )}
          {phase === "night" && !sync.gameEnded && (
            countdownSeconds !== null && countdownSeconds <= 0 ? (
              <button
                onClick={() => socket.emit("hostAddAllNightTurnTime", { roomId })}
                disabled={!currentNightTurnPlayerId}
                style={{ opacity: currentNightTurnPlayerId ? 1 : 0.6 }}
              >
                Cộng thêm thời gian
              </button>
            ) : (
              <button
                onClick={() => socket.emit("hostToggleNightTurnPause", { roomId })}
                disabled={!currentNightTurnPlayerId}
                style={{ opacity: currentNightTurnPlayerId ? 1 : 0.6 }}
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

      {!isHost && dayVote.panel}
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

      {slayerTargetId && (
        <ConfirmModal
          open={showSlayerConfirm}
          title="Xác nhận diệt quỷ"
          message={`Bạn có chắc chắn muốn tiêu diệt ${room.players.find(p => p.id === slayerTargetId)?.name || "người chơi này"} không? Chức năng chỉ được dùng một lần duy nhất.`}
          confirmText="Bắn"
          cancelText="Hủy"
          onConfirm={confirmSlayerAction}
          onCancel={() => {
            setShowSlayerConfirm(false);
            setSlayerTargetId(null);
          }}
        />
      )}

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
          <div
            style={{
              width: "min(92vw, 420px)",
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
              <div style={{ fontWeight: 600, marginBottom: 8 }}>Ảnh đại diện của người chơi</div>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
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

                {/* Dropdown select và Nút Gắn ảnh */}
                <div style={{ flex: 1, display: "flex", gap: 8 }}>
                  <select
                    value={editingAvatar}
                    onChange={(e) => setEditingAvatar(e.target.value)}
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
                  >
                    <option value="" style={{ background: "#1e1e24", color: "#ccc" }}>-- Chọn ảnh đại diện --</option>
                    {Object.keys(AVA_IMAGES)
                      .map((path) => path.split("/").pop() || "")
                      .filter(Boolean)
                      .sort()
                      .map((fileName) => {
                        let label = fileName;
                        if (fileName.startsWith("M ")) {
                          label = `🖼️ [Tách nền] ${fileName.substring(2)}`;
                        } else if (fileName.startsWith("S ")) {
                          label = `👤 [Thường] ${fileName.substring(2)}`;
                        }
                        return (
                          <option key={fileName} value={fileName} style={{ background: "#1e1e24", color: "#fff" }}>
                            {label}
                          </option>
                        );
                      })}
                  </select>
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
                      background: "var(--accent)",
                      color: "#fff",
                      border: "none",
                      borderRadius: 6,
                      padding: "6px 12px",
                      fontWeight: "bold",
                      cursor: "pointer"
                    }}
                  >
                    Gắn ảnh
                  </button>
                </div>
              </div>
            </div>
            {!isHostPlayerActionTargetDead ? (
              <>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 16 }}>
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
    </div>
  );
}
