import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { socket, clientId, startRoomRecovery } from "../socket";
import { useLocation, useNavigate } from "react-router-dom";
import { useRoomContext } from "../context/RoomContext";
import PlayerPositions from "../components/PlayerPositions";
import ConfirmModal from "../components/ConfirmModal";
import HostDisconnectButton from "../components/HostDisconnectButton";
import Masonry from "../components/Masonry";
import GameLogPanel from "../components/GameLogPanel";
import { useDayVoteRole } from "./gameRoles/useDayVoteRole";
import { CountdownButton } from "../components/CountdownButton";
import nenLungAsset from "../assets/nền lưng.avif";
import RoomBg from "../assets/Nền phòng.avif";
import ChieuBg from "../assets/nền chiều.avif";
import nenLaiAsset from "../assets/Nền lai.avif";
import GridMotionOverlay from "../components/GridMotionOverlay";
import type { GameLogNight as SharedGameLogNight } from "./gameRoles/socketEvents";
import { shootWinnerConfettiFromSides } from "../utils/winnerConfetti";
import { VillagerVictoryAnimation } from "../components/VillagerVictoryAnimation";
import { GameFinishedModal } from "../components/GameFinishedModal";
import { getVillagerAndWolfRoles } from "../utils/gameEndHelper";


const HUNTER_BULLET_ANIM_MS = 4000;

export default function GameSoiMu() {
  const { room, setRoom } = useRoomContext();
  const location = useLocation();
  const nav = useNavigate();
  const query = new URLSearchParams(location.search);
  const roomId = query.get("roomId");

  // Local game states
  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null);
  const [thumbDecision, setThumbDecision] = useState<"up" | "down" | null>(null);
  const [daySelectedTargetId, setDaySelectedTargetId] = useState<string | null>(null);
  const [hostPlayerActionTargetId, setHostPlayerActionTargetId] = useState<string | null>(null);
  const isWarned = !!(hostPlayerActionTargetId && room?.warnedPlayerIds?.includes(hostPlayerActionTargetId));
  const [showGridOverlay, setShowGridOverlay] = useState(true);
  const [noticeModal, setNoticeModal] = useState<{ title: string; message: string } | null>(null);
  const [villagerVictoryAnimOpen, setVillagerVictoryAnimOpen] = useState(false);
  const [gameFinishedModalOpen, setGameFinishedModalOpen] = useState(false);


  // Hunter shot animation states
  const [hunterBulletAnim, setHunterBulletAnim] = useState<{
    fromPlayerId: string;
    toPlayerId: string;
    startedAt: number;
    durationMs: number;
    assetSrc?: string;
    alt?: string;
    rotationOffsetDeg?: number;
    kind: "hunter" | "love";
  } | null>(null);
  const hunterBulletTimeoutRef = useRef<number | null>(null);
  const [hunterShotPayload, setHunterShotPayload] = useState<{ hunterId: string; targetId: string } | null>(null);
  const [hunterShotSeq, setHunterShotSeq] = useState(0);

  // Log & Progress States
  const [gameLogs, setGameLogs] = useState<SharedGameLogNight[]>([]);
  const [revealedRoles, setRevealedRoles] = useState<Record<string, string>>({});
  const [nightProgress, setNightProgress] = useState<Record<string, "pending" | "done">>({});

  // Countdown & Time Offset
  const [now, setNow] = useState(Date.now());
  const [serverTimeOffset, setServerTimeOffset] = useState(0);

  const isHost = room ? room.hostId === clientId : false;
  const isDusk = room?.phase === "dusk";
  const isNight = room?.phase === "night";
  const isDay = room?.phase === "day";
  const amIDead = room?.deadPlayers?.includes(clientId) || false;

  // View Mode state & syncing
  const [viewMode, setViewMode] = useState<"real-names" | "nick-names" | "real-names-roles" | "nick-names-roles">(() => {
    const saved = localStorage.getItem("game-view-mode");
    if (saved === "real-names" || saved === "real-names-roles") return "real-names";
    return "nick-names";
  });
  const handleViewModeChange = (newMode: "real-names" | "nick-names" | "real-names-roles" | "nick-names-roles") => {
    setViewMode(newMode);
    localStorage.setItem("game-view-mode", newMode);
  };

  // Masonry visibility management
  const [masonryComplete, setMasonryComplete] = useState(false);
  const isSelectingLocally = useRef(false);

  useEffect(() => {
    if (isHost) {
      if (viewMode === "real-names") {
        handleViewModeChange("real-names-roles");
      } else if (viewMode === "nick-names") {
        handleViewModeChange("nick-names-roles");
      }
    } else {
      if (!room?.gameOver) {
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
  }, [isHost, room?.gameOver, viewMode]);

  useEffect(() => {
    if (isDusk) {
      const hasChosen = room?.duskCardSelections && room.duskCardSelections[clientId] !== undefined;
      if (hasChosen && !isSelectingLocally.current) {
        setMasonryComplete(true);
      }
    } else {
      setMasonryComplete(false);
    }
  }, [isDusk, room?.duskCardSelections, clientId]);

  // Wrong choice highlight states
  const [soiMuWrongChoiceHighlightId, setSoiMuWrongChoiceHighlightId] = useState<string | null>(null);
  const [soiMuWrongChoiceOpacity, setSoiMuWrongChoiceOpacity] = useState(1);

  const [witchPotionEffect, setWitchPotionEffect] = useState<{
    targetId: string;
    type: "heal" | "poison";
    startedAt: number;
  } | null>(null);

  // Confirm Modals
  const [quitConfirmOpen, setQuitConfirmOpen] = useState(false);
  const [endGameConfirmOpen, setEndGameConfirmOpen] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [eliminateConfirmTarget, setEliminateConfirmTarget] = useState<any | null>(null);
  const [restartConfirmOpen, setRestartConfirmOpen] = useState(false);
  const boardRoomOverride = useMemo(() => {
    if (!room || !isHost) return room;
    return {
      ...room,
      nightActionProgressByPlayerId: nightProgress,
    };
  }, [room, isHost, nightProgress]);

  const dayVote = useDayVoteRole({
    roomId: room?.id || null,
    phase: (room?.phase || "dusk") as any,
    room: room || { players: [] },
    deadPlayers: room?.deadPlayers || [],
    dayVotes: room?.dayVotes || null,
    dayLocked: room?.dayLocked || null,
    dayDiscussionDeadline: room?.dayDiscussionDeadline || null,
    dayDeadline: room?.dayDeadline || null,
    dayVoters: room?.dayVoters || [],
    trialTargetId: room?.trialTargetId || null,
    trialStage: room?.trialStage || "none",
    trialDefenseDeadline: room?.trialDefenseDeadline || null,
    trialVerdictDeadline: room?.trialVerdictDeadline || null,
    trialInteractionCut: room?.trialInteractionCut || false,
    trialInteractionActiveIds: room?.trialInteractionActiveIds || [],
    trialSelectedInteractorId: room?.trialSelectedInteractorId || null,
    trialSelectedInteractorIds: room?.trialSelectedInteractorIds || [],
    trialInteractionSelectionLimit: room?.trialInteractionSelectionLimit || 0,
    trialVotes: room?.trialVotes || null,
    serverTimeOffset,
    dayPaused: !!room?.dayPaused,
    dayRemainingMs: room?.dayRemainingMs || null,
  });

  // Tiên tri status
  const isInvestigated = room?.soiMuState?.investigatedPlayerId === clientId;
  const isInvestigationResolved = room?.soiMuState?.investigationResolved !== false; // true if resolved or null
  const showInvestigationUI = isDay && isInvestigated && !isInvestigationResolved && !amIDead;

  const isSuyThanAlive = useMemo(() => {
    if (!room) return false;
    const suyThanPlayerId = Object.keys(room.playerRoles || {}).find(id => room.playerRoles?.[id] === "Suy Thận");
    if (!suyThanPlayerId) return false;
    return !room.deadPlayers?.includes(suyThanPlayerId);
  }, [room]);

  // Sync server time offset
  useEffect(() => {
    if (room?.serverTime) {
      setServerTimeOffset(room.serverTime - Date.now());
    }
  }, [room?.serverTime]);

  // Tick time every second
  useEffect(() => {
    setNow(Date.now() + serverTimeOffset);
    const interval = setInterval(() => {
      setNow(Date.now() + serverTimeOffset);
    }, 1000);
    return () => clearInterval(interval);
  }, [serverTimeOffset]);

  // Hunter shot animation logic
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

    setHunterBulletAnim({
      fromPlayerId: hunterId,
      toPlayerId: targetId,
      startedAt: performance.now(),
      durationMs: HUNTER_BULLET_ANIM_MS,
      assetSrc: options?.assetSrc,
      alt: options?.alt,
      rotationOffsetDeg: options?.rotationOffsetDeg,
      kind: options?.kind ?? "hunter",
    });

    hunterBulletTimeoutRef.current = window.setTimeout(() => {
      setHunterBulletAnim(null);
      hunterBulletTimeoutRef.current = null;
    }, HUNTER_BULLET_ANIM_MS);
  }, []);

  useEffect(() => {
    if (!hunterShotPayload?.hunterId || !hunterShotPayload?.targetId) return;
    const shouldRevealHunterShotInDay = room?.gameRules?.hunterShotPublicInDay !== false;
    if (isDay && !shouldRevealHunterShotInDay) return;

    const frame = window.requestAnimationFrame(() => {
      playHunterShotAnim(hunterShotPayload.hunterId, hunterShotPayload.targetId);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [isDay, playHunterShotAnim, room?.gameRules?.hunterShotPublicInDay, hunterShotPayload, hunterShotSeq]);

  // Watch for Tiên tri wrong choice failure
  const prevResultRef = useRef<string | null | undefined>(undefined);
  const prevGameOverRef = useRef(false);

  const { villagerRole, wolfRole } = useMemo(() => {
    if (!room?.gameOver) return { villagerRole: null, wolfRole: null };
    return getVillagerAndWolfRoles(
      room.winner,
      null,
      room.players,
      room.deadPlayers || [],
      room.playerRoles || revealedRoles
    );
  }, [room?.gameOver, room?.winner, room?.players, room?.deadPlayers, room?.playerRoles, revealedRoles]);

  useEffect(() => {
    if (room?.gameOver && !prevGameOverRef.current) {
      const winner = room.winner;
      if (winner && winner !== "nobody") {
        const isVillagerWin = winner !== "wolves";
        if (isVillagerWin) {
          setVillagerVictoryAnimOpen(true);
        } else {
          shootWinnerConfettiFromSides(winner, undefined);
          setGameFinishedModalOpen(true);
        }
      }
    }
    prevGameOverRef.current = !!room?.gameOver;
  }, [room?.gameOver, room?.winner]);


  useEffect(() => {
    if (!room) return;
    if (room.soiMuState?.investigationResult === "fail" && prevResultRef.current !== "fail") {
      if (room.soiMuState?.daySelectedTargetId) {
        setSoiMuWrongChoiceHighlightId(room.soiMuState?.daySelectedTargetId);
        setSoiMuWrongChoiceOpacity(1);

        // After 5 seconds, start fading out over 3 seconds
        const fadeTimer = setTimeout(() => {
          setSoiMuWrongChoiceOpacity(0);
        }, 5000);

        // After 8 seconds, remove the highlight
        const clearTimer = setTimeout(() => {
          setSoiMuWrongChoiceHighlightId(null);
        }, 8000);

        return () => {
          clearTimeout(fadeTimer);
          clearTimeout(clearTimer);
        };
      }
    }
    prevResultRef.current = room.soiMuState?.investigationResult;
  }, [room?.soiMuState?.investigationResult, room?.soiMuState?.daySelectedTargetId]);

  // Lắng nghe sự kiện socket
  useEffect(() => {
    if (!roomId) return;

    const handleRoomUpdated = (updatedRoom: any) => {
      if (updatedRoom && updatedRoom.id === roomId) {
        setRoom(updatedRoom);
      }
    };

    const handleGameLogUpdated = (payload: { roomId: string; nights: SharedGameLogNight[] }) => {
      if (payload && payload.roomId === roomId) {
        const sorted = [...payload.nights].sort((a, b) => a.night - b.night);
        setGameLogs(sorted);
      }
    };

    const handleRolesRevealUpdated = (payload: { roomId: string; rolesByPlayerId: Record<string, string> }) => {
      if (payload && payload.roomId === roomId) {
        setRevealedRoles(payload.rolesByPlayerId || {});
      }
    };

    const handleHostNightActionProgressUpdated = (payload: { progressByPlayerId: Record<string, "pending" | "done"> }) => {
      setNightProgress(payload?.progressByPlayerId || {});
    };

    const handleErrorMessage = (msg: string) => {
      setErrorMsg(msg);
    };

    // Khi phase đổi, reset lựa chọn
    const handlePhaseChanged = (_newPhase: string) => {
      setSelectedTargetId(null);
      setThumbDecision(null);
      setDaySelectedTargetId(null);
      setNightProgress({});
      setHostPlayerActionTargetId(null);
      setNoticeModal(null);
      socket.emit("requestGameLog", { roomId });
      if (isHost) {
        socket.emit("requestHostNightActionProgress", { roomId });
      }
    };

    const handleReturnResult = (payload: { ok: boolean; roomId?: string; reason?: "kicked" | "room_closed" }) => {
      if (!roomId) return;
      if (payload?.roomId && payload.roomId !== roomId) return;
      if (payload?.ok) {
        nav(`/room?roomId=${roomId}`);
        return;
      }
      if (payload?.reason === "kicked") {
        setErrorMsg("Bạn đã bị quản trò mời khỏi phòng. Bạn sẽ được chuyển về Lobby.");
        nav("/lobby");
        return;
      }
      setErrorMsg("Quản trò đã đóng phòng hoặc phòng không còn tồn tại. Bạn sẽ được chuyển về Lobby.");
      nav("/lobby");
    };

    const handleForceReturnToRoom = (payload: { roomId?: string }) => {
      if (!roomId) return;
      if (payload?.roomId && payload.roomId !== roomId) return;
      nav(`/room?roomId=${roomId}`);
    };

    const handleHunterShot = (payload: { hunterId: string; targetId: string }) => {
      setHunterShotPayload(payload);
      setHunterShotSeq((prev) => prev + 1);
    };

    const handleWitchPotionEffectTriggered = (payload: { targetId: string; type: "heal" | "poison" }) => {
      setWitchPotionEffect({
        targetId: payload.targetId,
        type: payload.type,
        startedAt: performance.now(),
      });
    };

    socket.on("roomUpdated", handleRoomUpdated);
    socket.on("gameLogUpdated", handleGameLogUpdated);
    socket.on("rolesRevealUpdated", handleRolesRevealUpdated);
    socket.on("hostNightActionProgressUpdated", handleHostNightActionProgressUpdated);
    socket.on("errorMessage", handleErrorMessage);
    socket.on("phaseChanged", handlePhaseChanged);
    socket.on("returnToRoomResult", handleReturnResult);
    socket.on("forceReturnToRoom", handleForceReturnToRoom);
    socket.on("hunterShot", handleHunterShot);
    socket.on("witchPotionEffectTriggered", handleWitchPotionEffectTriggered);

    const stopRoomRecovery = startRoomRecovery(roomId, () => {
      socket.emit("requestGameLog", { roomId });
      socket.emit("requestHostNightActionProgress", { roomId });
      if (isHost) socket.emit("requestRolesReveal", { roomId });
    });

    return () => {
      socket.off("roomUpdated", handleRoomUpdated);
      socket.off("gameLogUpdated", handleGameLogUpdated);
      socket.off("rolesRevealUpdated", handleRolesRevealUpdated);
      socket.off("hostNightActionProgressUpdated", handleHostNightActionProgressUpdated);
      socket.off("errorMessage", handleErrorMessage);
      socket.off("phaseChanged", handlePhaseChanged);
      socket.off("returnToRoomResult", handleReturnResult);
      socket.off("forceReturnToRoom", handleForceReturnToRoom);
      socket.off("hunterShot", handleHunterShot);
      socket.off("witchPotionEffectTriggered", handleWitchPotionEffectTriggered);
      stopRoomRecovery();
    };
  }, [roomId, isHost, nav, setRoom]);



  // Chọn thẻ bài dusk
  const masonryItems = useMemo(() => {
    const roles = room?.roles || [];
    return roles.map((roleName: string, index: number) => ({
      id: String(index),
      img: nenLungAsset,
      height: 360,
      roleName
    }));
  }, [room?.roles]);

  // Gửi hành động chọn mục tiêu ban đêm
  const handleChooseNightTarget = (targetId: string) => {
    if (!room || amIDead || isHost) return;
    if (room.soiMuState?.locked?.[clientId]) return;

    const nextTarget = selectedTargetId === targetId ? null : targetId;
    setSelectedTargetId(nextTarget);
    socket.emit("soiMuChooseTarget", { roomId: room.id, targetId: nextTarget });
  };

  // Gửi hành động chọn ngón tay của Tay Buôn
  const handleChooseThumb = (decision: "up" | "down") => {
    if (!room || amIDead || isHost) return;
    if (room.soiMuState?.locked?.[clientId]) return;

    const nextDecision = thumbDecision === decision ? null : decision;
    setThumbDecision(nextDecision);
    socket.emit("soiMuChooseThumb", { roomId: room.id, thumb: nextDecision });
  };

  // Khóa hành động ban đêm
  const handleLockNightAction = () => {
    if (!room || amIDead || isHost) return;
    if (room.soiMuState?.locked?.[clientId]) return;

    socket.emit("soiMuLockAction", { roomId: room.id });
  };

  // Người bị soi chọn lại mục tiêu ban ngày
  const handleChooseDayTarget = (targetId: string) => {
    if (!room || amIDead || isHost || !showInvestigationUI) return;

    setDaySelectedTargetId(targetId);
  };

  // Xác nhận chọn lại ban ngày
  const handleConfirmDayTarget = () => {
    if (!room || !daySelectedTargetId || !showInvestigationUI) return;

    const finalTargetId = daySelectedTargetId === "none" ? null : daySelectedTargetId;
    socket.emit("soiMuDayChooseTarget", { roomId: room.id, targetId: finalTargetId });
  };



  // Host kết tội/treo cổ người chơi
  const handleEliminatePlayer = (targetId: string) => {
    if (!room || !isHost || targetId === clientId) return;
    const p = room.players.find((player: any) => player.id === targetId);
    if (!p || room.deadPlayers?.includes(targetId)) return;

    setEliminateConfirmTarget(p);
  };

  // Chuyển phase game (Host điều khiển)
  const handleChangePhase = (nextPhase: "day" | "night" | "dusk") => {
    if (!room || !isHost) return;
    socket.emit("changePhase", { roomId: room.id, phase: nextPhase });
  };

  // Chia bài lại
  const handleRestartGame = () => {
    if (!room || !isHost) return;
    setRestartConfirmOpen(true);
  };

  // Kết thúc ngay trò chơi
  const handleEndGameConfirm = () => {
    if (!room) return;
    socket.emit("hostEndGameNow", { roomId: room.id });
    setEndGameConfirmOpen(false);
  };

  // Quay lại phòng chờ
  const handleBackToRoomClick = () => {
    if (!roomId) return;
    socket.emit("requestReturnToRoom", { roomId });
  };

  // Rời phòng
  const handleLeaveGame = () => {
    if (!room) return;
    socket.emit("leaveRoom", { roomId: room.id });
    setRoom(null);
    nav("/lobby");
  };

  const getRoleDisplayName = (roleName: string | undefined | null) => {
    if (!roleName) return "";
    if (roleName === "Tay Buôn") return "Ariana";
    return roleName;
  };

  // Badge hiển thị vai trò cho Host & Người chơi
  // Host ban đêm chỉ thấy badge sau khi người chơi đã chọn xong card
  const activeRolesForDisplay = useMemo(() => {
    if (!room) return {};
    const badges: Record<string, string> = {};

    if (isHost) {
      for (const p of room.players) {
        if (isDusk) {
          if (room.duskCardSelections?.[p.id] !== undefined) {
            const rawRole = room.playerRoles?.[p.id] || revealedRoles[p.id];
            badges[p.id] = rawRole ? getRoleDisplayName(rawRole) : "Chọn xong";
          }
        } else {
          badges[p.id] = getRoleDisplayName(room.playerRoles?.[p.id] || revealedRoles[p.id] || "Dân làng");
        }
      }
    } else {
      // Người chơi thường chỉ thấy vai trò khi game kết thúc (room.gameOver là true)
      if (room.gameOver) {
        for (const p of room.players) {
          badges[p.id] = getRoleDisplayName(room.playerRoles?.[p.id] || revealedRoles[p.id] || "Dân làng");
        }
      }
    }
    return badges;
  }, [room, isHost, isDusk, revealedRoles]);

  // Cấu hình Highlight gộp của Tiên tri ban ngày và Tòa án xét xử
  const trialWhitePlayerIds = useMemo(() => {
    const list = [...(dayVote.playerPositionsProps.trialWhitePlayerIds || [])];
    if (isDay && room?.soiMuState?.investigatedPlayerId && !room.soiMuState?.investigationResolved) {
      list.push(room.soiMuState?.investigatedPlayerId);
    }
    return list;
  }, [dayVote.playerPositionsProps.trialWhitePlayerIds, isDay, room?.soiMuState?.investigatedPlayerId, room?.soiMuState?.investigationResolved]);

  const trialGreenPlayerId = useMemo(() => {
    if (dayVote.playerPositionsProps.trialGreenPlayerId) {
      return dayVote.playerPositionsProps.trialGreenPlayerId;
    }
    if (isDay && room?.soiMuState?.investigatedPlayerId && room.soiMuState?.investigationResult === "success") {
      return room.soiMuState?.investigatedPlayerId;
    }
    return undefined;
  }, [dayVote.playerPositionsProps.trialGreenPlayerId, isDay, room?.soiMuState?.investigatedPlayerId, room?.soiMuState?.investigationResult]);

  const verdictDiePlayerIds = useMemo(() => {
    const list: string[] = [];
    if (soiMuWrongChoiceHighlightId) {
      list.push(soiMuWrongChoiceHighlightId);
    }
    return list;
  }, [soiMuWrongChoiceHighlightId]);

  if (!room) {
    return (
      <div className="soimu-loading" style={{ backgroundImage: `url(${RoomBg})` }}>
        <div className="loader-box">
          <div className="spinner"></div>
          <p>Đang tải thông tin ván chơi...</p>
        </div>
      </div>
    );
  }

  const secondsLeft = useMemo(() => {
    if (isNight) {
      if (room.nightTurnPaused) {
        if (room.nightTurnRemainingMs == null) return null;
        return Math.max(0, Math.ceil(room.nightTurnRemainingMs / 1000));
      }
      const deadline = room.nightTurnDeadline;
      if (!deadline) return null;
      return Math.max(0, Math.ceil((deadline - now) / 1000));
    }
    return dayVote.remainingSec;
  }, [isNight, room.nightTurnPaused, room.nightTurnRemainingMs, room.nightTurnDeadline, now, dayVote.remainingSec]);

  const hasMerchantInGame = room.soiMuState?.hasMerchant === true;
  const isLocked = room.soiMuState?.locked?.[clientId] === true;

  return (
    <div 
      className="page-shell game-page soimu-theme" style={{
      ["--soimu-wrong-choice-opacity" as any]: soiMuWrongChoiceOpacity
    }}>
      {/* Background Layer */}
      <div className="game-bg-layer" style={{
        backgroundImage: `url(${isNight ? nenLaiAsset : isDusk ? ChieuBg : RoomBg})`
      }} />

      {/* Grid Motion Overlay */}
      {showGridOverlay && (
        <GridMotionOverlay
          active={showGridOverlay}
          onComplete={() => setShowGridOverlay(false)}
        />
      )}

      {/* Styles Injection */}
      <style>{`
        .soimu-theme {
          font-family: 'Inter', system-ui, -apple-system, sans-serif;
        }
        .halo-die {
          transition: opacity 3s linear;
          opacity: var(--soimu-wrong-choice-opacity, 1) !important;
        }
        .header-panel {
          position: relative;
          z-index: 10;
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 16px 24px;
          background: rgba(15, 11, 28, 0.65);
          backdrop-filter: blur(16px);
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
          box-shadow: 0 4px 30px rgba(0, 0, 0, 0.4);
        }
        .room-title {
          font-size: 20px;
          fontWeight: 900;
          background: linear-gradient(135deg, #a78bfa 0%, #ec4899 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }
        .phase-indicator {
          padding: 6px 16px;
          border-radius: 99px;
          font-weight: 800;
          font-size: 13px;
          letter-spacing: 0.05em;
          text-transform: uppercase;
          background: rgba(167, 139, 250, 0.15);
          border: 1px solid rgba(167, 139, 250, 0.3);
          box-shadow: 0 0 15px rgba(167, 139, 250, 0.2);
        }
        .phase-indicator.night {
          background: rgba(59, 130, 246, 0.15);
          border-color: rgba(59, 130, 246, 0.3);
          box-shadow: 0 0 15px rgba(59, 130, 246, 0.2);
          color: #60a5fa;
        }
        .phase-indicator.dusk {
          background: rgba(245, 158, 11, 0.15);
          border-color: rgba(245, 158, 11, 0.3);
          box-shadow: 0 0 15px rgba(245, 158, 11, 0.2);
          color: #f59e0b;
        }
        .game-layout {
          position: relative;
          z-index: 5;
          display: grid;
          grid-template-columns: 1fr 380px;
          gap: 20px;
          padding: 20px;
          max-width: 1400px;
          margin: 0 auto;
          height: calc(100vh - 75px);
        }
        @media (max-width: 1024px) {
          .game-layout {
            grid-template-columns: 1fr;
            height: auto;
          }
        }
        .board-container {
          background: rgba(15, 11, 28, 0.45);
          backdrop-filter: blur(12px);
          border: 1px solid rgba(255, 255, 255, 0.05);
          border-radius: 24px;
          padding: 20px;
          display: flex;
          flex-direction: column;
          gap: 20px;
          height: 100%;
        }
        .chat-sidebar {
          background: rgba(15, 11, 28, 0.6);
          backdrop-filter: blur(16px);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 24px;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          height: 100%;
        }
        .tab-headers {
          display: flex;
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
          background: rgba(0, 0, 0, 0.2);
        }
        .tab-btn {
          flex: 1;
          padding: 14px;
          background: transparent;
          border: none;
          color: rgba(255, 255, 255, 0.6);
          font-weight: 700;
          cursor: pointer;
          transition: all 0.25s ease;
          outline: none;
        }
        .tab-btn.active {
          color: #a78bfa;
          background: rgba(255, 255, 255, 0.02);
          border-bottom: 2px solid #a78bfa;
        }
        .tab-content {
          flex: 1;
          overflow-y: auto;
          padding: 16px;
        }
        .log-entry {
          padding: 10px 12px;
          border-radius: 8px;
          background: rgba(255, 255, 255, 0.03);
          border-left: 3px solid #6366f1;
          margin-bottom: 8px;
          font-size: 13.5px;
          line-height: 1.5;
        }
        .log-entry.eliminated {
          border-left-color: #ef4444;
          background: rgba(239, 68, 68, 0.05);
        }
        .log-entry.night-entry {
          border-left-color: #3b82f6;
          background: rgba(59, 130, 246, 0.05);
        }
        .control-panel {
          background: rgba(0, 0, 0, 0.3);
          border: 1px solid rgba(255, 255, 255, 0.06);
          border-radius: 16px;
          padding: 16px;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .btn-action {
          padding: 12px 24px;
          border-radius: 12px;
          font-weight: 800;
          cursor: pointer;
          transition: all 0.25s ease;
          border: none;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          font-size: 14px;
        }
        .btn-primary {
          background: linear-gradient(135deg, #a78bfa, #8b5cf6);
          color: #fff;
          box-shadow: 0 4px 15px rgba(139, 92, 246, 0.3);
        }
        .btn-primary:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 6px 20px rgba(139, 92, 246, 0.45);
        }
        .btn-primary:disabled {
          background: rgba(255, 255, 255, 0.1);
          color: rgba(255, 255, 255, 0.3);
          cursor: not-allowed;
          box-shadow: none;
        }
        .btn-thumb {
          flex: 1;
          padding: 10px;
          font-size: 20px;
          border-radius: 10px;
          border: 1px solid rgba(255, 255, 255, 0.1);
          background: rgba(255, 255, 255, 0.03);
          cursor: pointer;
          transition: all 0.2s ease;
        }
        .btn-thumb:hover {
          background: rgba(255, 255, 255, 0.08);
        }
        .btn-thumb.active-up {
          background: rgba(16, 185, 129, 0.2);
          border-color: #10b981;
          box-shadow: 0 0 10px rgba(16, 185, 129, 0.3);
        }
        .btn-thumb.active-down {
          background: rgba(239, 68, 68, 0.2);
          border-color: #ef4444;
          box-shadow: 0 0 10px rgba(239, 68, 68, 0.3);
        }
        .dusk-wait-screen {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 100%;
          gap: 20px;
        }
        .holo-card-back {
          width: 140px;
          height: 210px;
          border-radius: 16px;
          background-image: url(${nenLungAsset});
          background-size: cover;
          box-shadow: 0 0 30px rgba(167, 139, 250, 0.4), inset 0 0 15px rgba(255, 255, 255, 0.2);
          border: 2px solid rgba(167, 139, 250, 0.6);
          position: relative;
          overflow: hidden;
          animation: cardGlow 3s infinite alternate;
        }
        @keyframes cardGlow {
          0% { box-shadow: 0 0 20px rgba(167, 139, 250, 0.3); }
          100% { box-shadow: 0 0 40px rgba(236, 72, 153, 0.6), 0 0 15px rgba(59, 130, 246, 0.4); }
        }
        .soimu-loading {
          position: fixed;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          background-size: cover;
          background-position: center;
        }
        .loader-box {
          padding: 40px;
          background: rgba(15, 11, 28, 0.85);
          backdrop-filter: blur(20px);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 24px;
          text-align: center;
          box-shadow: 0 20px 50px rgba(0, 0, 0, 0.5);
        }
        .spinner {
          width: 50px;
          height: 50px;
          border: 3px solid rgba(167, 139, 250, 0.2);
          border-top-color: #a78bfa;
          border-radius: 50%;
          animation: spin 1s infinite linear;
          margin: 0 auto 16px;
        }
        @keyframes spin {
          100% { transform: rotate(360deg); }
        }
      `}</style>

      <div style={{ display: "flex", alignItems: "center", gap: "2rem", flexWrap: "wrap", marginBottom: "1.5rem" }}>
        {isDusk ? (
          <h1 style={{ margin: 0, display: "flex", alignItems: "center" }}>🌥️ Hoàng hôn</h1>
        ) : isDay ? (
          <h1 style={{ margin: 0, display: "flex", alignItems: "center" }}>🌞 Ngày {room.nightCount || 1}</h1>
        ) : (
          <h1 style={{ margin: 0, display: "flex", alignItems: "center" }}>🌙 Đêm {room.nightCount || 1}</h1>
        )}
        <CountdownButton
          showCountdown={isNight && !room.gameOver && secondsLeft !== null}
          countdownSeconds={secondsLeft}
          isPaused={!!room.nightTurnPaused}
        />
        <CountdownButton
          showCountdown={isDay && !room.gameOver && dayVote.remainingSec !== null}
          countdownSeconds={dayVote.remainingSec}
          isPaused={!!dayVote.dayPaused}
        />
      </div>

      {(isHost || !!room.gameOver) && (
        <div className="game-top-actions" style={{ marginBottom: "1rem" }}>
          <button onClick={handleBackToRoomClick}>Quay về phòng chờ</button>
          <HostDisconnectButton room={room} />
        </div>
      )}

      {/* Main Board Area */}
      <div style={{ margin: "2rem auto", width: "100%", maxWidth: "600px" }}>
        {isDusk && !isHost && !masonryComplete ? (
          <Masonry
            items={masonryItems}
            duskCardSelections={room.duskCardSelections || {}}
            clientId={clientId}
            onSelectCard={(index) => {
              isSelectingLocally.current = true;
              socket.emit("duskSelectCard", { roomId: room.id, cardIndex: index });
            }}
            onSelectionComplete={() => {
              isSelectingLocally.current = false;
              setMasonryComplete(true);
            }}
            skipExitAnimation={true}
          />
        ) : (
          <div style={{ position: "relative", minHeight: 400 }}>
            <PlayerPositions
              roomOverride={boardRoomOverride}
              onPlayerClick={(pid) => {
                if (isHost && !room?.isReplay) {
                  if (hostPlayerActionTargetId === pid) {
                    setHostPlayerActionTargetId(null);
                  } else {
                    setHostPlayerActionTargetId(pid);
                  }
                  return;
                }
                if (isNight) {
                  handleChooseNightTarget(pid);
                  return;
                }
                if (showInvestigationUI) {
                  handleChooseDayTarget(pid);
                  return;
                }
                if (dayVote.onPlayerClick(pid)) return;
              }}
              mode="view"
              showRoleBadges={isHost || room.gameOver}
              roleBadges={activeRolesForDisplay}
              selectedOutlinePlayerId={
                isHost 
                  ? hostPlayerActionTargetId 
                  : (isNight ? selectedTargetId : (showInvestigationUI ? daySelectedTargetId : (dayVote.playerPositionsProps.selectedOutlinePlayerId || null)))
              }
              deadPlayersOverride={room.deadPlayers || []}
              trialOrangePlayerId={dayVote.playerPositionsProps.trialOrangePlayerId}
              trialWhitePlayerIds={trialWhitePlayerIds}
              trialGreenPlayerId={trialGreenPlayerId}
              verdictDiePlayerIds={verdictDiePlayerIds}
              bulletAnimation={hunterBulletAnim}
              witchPotionEffect={witchPotionEffect}
              onWitchPotionEffectComplete={() => setWitchPotionEffect(null)}
              viewMode={viewMode}
              showVoteReview={dayVote.playerPositionsProps.showVoteReview}
              dayVotes={dayVote.playerPositionsProps.dayVotes}
            />
          </div>
        )}
      </div>

      {/* Player controls */}
      {!isHost && !isDusk && !amIDead && (isNight || showInvestigationUI) && (
        <div style={{ maxWidth: "600px", margin: "1rem auto", display: "flex", flexDirection: "column", gap: 12 }}>
          {isNight && (
            <>
              <div style={{ fontSize: "14px", color: "rgba(255, 255, 255, 0.7)" }}>
                {isLocked ? "Hành động của bạn đã được khóa" : "Chọn một mục tiêu mà bạn muốn:"}
              </div>

              {/* Tay Buôn thumb selection */}
              {hasMerchantInGame && (
                <div style={{ display: "flex", gap: 10, margin: "8px 0" }}>
                  <button
                    className={`btn-thumb ${thumbDecision === "up" ? "active-up" : ""}`}
                    onClick={() => handleChooseThumb("up")}
                    disabled={isLocked}
                  >
                    👍🏽
                  </button>
                  <button
                    className={`btn-thumb ${thumbDecision === "down" ? "active-down" : ""}`}
                    onClick={() => handleChooseThumb("down")}
                    disabled={isLocked}
                  >
                    👎🏽
                  </button>
                </div>
              )}

              <button
                className="btn-action btn-primary"
                onClick={handleLockNightAction}
                disabled={isLocked || !selectedTargetId || (hasMerchantInGame && !thumbDecision)}
              >
                {isLocked ? "Đã khóa lựa chọn" : "Xác nhận hành động"}
              </button>
            </>
          )}

          {/* Tiên tri Day UI */}
          {showInvestigationUI && (
            <div style={{
              background: "rgba(245, 158, 11, 0.1)",
              border: "1px solid rgba(245, 158, 11, 0.3)",
              padding: "16px",
              borderRadius: "12px",
              display: "flex",
              flexDirection: "column",
              gap: 12
            }}>
              <div style={{ fontWeight: 800, color: "#f59e0b" }}>⚠️ Chọn lại mục tiêu bạn đã chọn đêm qua</div>
              <div style={{ fontSize: "13px", lineHeight: 1.4, color: "rgba(255, 255, 255, 0.8)" }}>
                Hãy chọn một người chơi trên vòng tròn hoặc bấm nút dưới đây nếu bạn không chọn ai ban đêm:
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <button
                  className="btn-action"
                  style={{
                    background: daySelectedTargetId === "none" ? "rgba(245, 158, 11, 0.35)" : "rgba(255,255,255,0.08)",
                    color: "#fff",
                    border: daySelectedTargetId === "none" ? "1px solid #f59e0b" : "1px solid rgba(255,255,255,0.15)",
                    flex: 1
                  }}
                  onClick={() => setDaySelectedTargetId("none")}
                >
                  Đã không chọn ai
                </button>
              </div>
              <button
                className="btn-action"
                style={{ background: "#f59e0b", color: "#000", fontWeight: 900 }}
                onClick={handleConfirmDayTarget}
                disabled={!daySelectedTargetId}
              >
                Xác nhận lựa chọn
              </button>
            </div>
          )}
        </div>
      )}

      {!isDusk && dayVote.panel && (
        <div style={{ maxWidth: "600px", margin: "1rem auto 0 auto" }}>
          {dayVote.panel}
        </div>
      )}

      {/* Host Controls */}
      {isHost && !room?.isReplay && (
        <div className="game-host-controls" style={{ maxWidth: "600px", margin: "1.5rem auto" }}>
          {hostPlayerActionTargetId && (
            <div style={{
              background: "rgba(167, 139, 250, 0.12)",
              border: "2px dashed rgba(167, 139, 250, 0.4)",
              padding: "16px",
              borderRadius: "16px",
              marginBottom: "1.5rem",
              width: "100%",
              display: "flex",
              flexDirection: "column",
              gap: 12,
              textAlign: "left",
              boxShadow: "0 4px 20px rgba(0,0,0,0.3)"
            }}>
              <div style={{ fontWeight: 800, color: "#a78bfa", fontSize: "15px" }}>
                🎯 Đang chọn: <span style={{ color: "#fff" }}>{room.players.find((p: any) => p.id === hostPlayerActionTargetId)?.name || hostPlayerActionTargetId}</span>
              </div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button
                  onClick={() => handleEliminatePlayer(hostPlayerActionTargetId)}
                  style={{ background: "#e74c3c", color: "#fff", fontWeight: 700 }}
                >
                  Loại vì phạm luật
                </button>
                <button
                  onClick={() => {
                    if (!room?.id || !hostPlayerActionTargetId) return;
                    socket.emit("hostToggleWarningFlag", {
                      roomId: room.id,
                      targetId: hostPlayerActionTargetId,
                    });
                    setHostPlayerActionTargetId(null);
                  }}
                  style={{ background: isWarned ? "#e67e22" : "#f1c40f", color: "#000", fontWeight: 700 }}
                >
                  {isWarned ? "Gỡ cờ cảnh cáo" : "Gắn cờ cảnh cáo"}
                </button>
                {room.soiMuState?.namThuTargetId === hostPlayerActionTargetId && (
                  <button
                    onClick={() => {
                      socket.emit("hostNamThuTargetSmile", { roomId: room.id, targetId: hostPlayerActionTargetId });
                      setHostPlayerActionTargetId(null);
                    }}
                    style={{ background: "#f59e0b", color: "#000", fontWeight: 900 }}
                  >
                    😂 Xác nhận cười (Nam Thư)
                  </button>
                )}
                {isSuyThanAlive && (
                  <button
                    onClick={() => {
                      socket.emit("hostSuyThanTargetPee", { roomId: room.id, targetId: hostPlayerActionTargetId });
                      setHostPlayerActionTargetId(null);
                    }}
                    style={{ background: "#34d399", color: "#000", fontWeight: 900 }}
                  >
                    🚽 Xác nhận đi đái (Suy Thận)
                  </button>
                )}
                <button
                  onClick={() => setHostPlayerActionTargetId(null)}
                  style={{ background: "rgba(255,255,255,0.08)", color: "#fff" }}
                >
                  Đóng
                </button>
              </div>
            </div>
          )}

          {isHost && !room.gameOver && (
            <button onClick={() => handleChangePhase("night")}>
              Bắt đầu đêm
            </button>
          )}
          <button onClick={handleRestartGame}>
            Chia bài lại
          </button>
          {isHost && !room.gameOver && isNight && (
            <button onClick={() => handleChangePhase("day")}>
              Bắt đầu ngày
            </button>
          )}
          {isHost && !room.gameOver && isNight && (
            <button onClick={() => socket.emit("hostToggleNightTurnPause", { roomId: room.id })}>
              {room.nightTurnPaused ? "Tiếp tục thời gian" : "Tạm ngưng thời gian"}
            </button>
          )}
          {isHost && !room.gameOver && isDay && (
            <button onClick={() => socket.emit("hostToggleDayPause", { roomId: room.id })}>
              {room.dayPaused ? "Tiếp tục thời gian" : "Tạm ngưng thời gian"}
            </button>
          )}
          {isDay && !room.gameOver && (
            <button
              onClick={() => socket.emit("hostStartDayVoting", { roomId: room.id })}
              disabled={!!room.dayDeadline || room.trialStage !== "none"}
              style={{ opacity: (!!room.dayDeadline || room.trialStage !== "none") ? 0.6 : 1 }}
            >
              Bắt đầu biểu quyết
            </button>
          )}
          {isDay && !room.gameOver && room.trialStage === "defense" && (
            <button onClick={() => socket.emit("hostForceFinishDayVote", { roomId: room.id })}>
              Kết thúc tương tác ngay
            </button>
          )}
          {isDay && !room.gameOver && (room.dayDeadline || room.trialStage === "verdict") && (
            <button onClick={() => socket.emit("hostForceFinishDayVote", { roomId: room.id })}>
              Chốt vote ngay
            </button>
          )}
          {!room.gameOver && (
            <button
              onClick={() => setEndGameConfirmOpen(true)}
              style={{ background: "#e74c3c", color: "#fff" }}
            >
              Kết thúc ngay trò chơi
            </button>
          )}
        </div>
      )}

      {/* Game Log Panel ở dưới cùng */}
      <div style={{ maxWidth: "600px", margin: "2rem auto 0 auto" }}>
        <GameLogPanel
          nights={gameLogs}
          rolesByPlayerId={room?.playerRoles || revealedRoles}
          playerNamesById={Object.fromEntries((room?.players || []).map((player: any) => [player.id, player.name]))}
          playerRealNamesById={Object.fromEntries((room?.players || []).filter((player: any) => player.playerRealName).map((player: any) => [player.id, player.playerRealName]))}
          onHighlightPlayer={() => { }}
          canViewNightLogs={true}
          isHost={isHost}
          viewMode={viewMode}
          onViewModeChange={handleViewModeChange}
          gameEnded={!!room?.gameOver}
          isReplay={room?.isReplay}
          myPlayerId={clientId || undefined}
          myRole={room?.playerRoles?.[clientId || ""]}
          wolves={room?.daNghichState?.wolves || []}
          gameRules={room?.gameRules}
          isBlindWerewolf={true}
        />
      </div>



      {/* Confirms */}
      <ConfirmModal
        open={quitConfirmOpen}
        title="Rời khỏi trò chơi"
        message="Bạn có chắc chắn muốn rời khỏi trò chơi và quay lại sảnh chờ không?"
        confirmText="Rời game"
        cancelText="Ở lại"
        onConfirm={handleLeaveGame}
        onCancel={() => setQuitConfirmOpen(false)}
      />

      <ConfirmModal
        open={endGameConfirmOpen}
        title="Kết thúc trò chơi"
        message="Bạn có chắc chắn muốn kết thúc trò chơi ngay bây giờ? Hành động này sẽ dừng trò chơi và hiển thị vai trò của tất cả người chơi."
        confirmText="Kết thúc"
        cancelText="Hủy"
        onConfirm={handleEndGameConfirm}
        onCancel={() => setEndGameConfirmOpen(false)}
      />

      <ConfirmModal
        open={!!errorMsg}
        title="Thông báo lỗi"
        message={errorMsg || ""}
        infoOnly={true}
        closeText="Đóng"
        onConfirm={() => setErrorMsg(null)}
        onCancel={() => setErrorMsg(null)}
      />

      <ConfirmModal
        open={!!eliminateConfirmTarget}
        title="Xác nhận loại người chơi"
        message={eliminateConfirmTarget ? `Bạn có chắc muốn loại người chơi "${eliminateConfirmTarget.name}" vì phạm luật không?` : ""}
        onConfirm={() => {
          if (eliminateConfirmTarget) {
            socket.emit("hostEliminatePlayerForRules", { roomId: room.id, targetId: eliminateConfirmTarget.id });
            setHostPlayerActionTargetId(null);
          }
          setEliminateConfirmTarget(null);
        }}
        onCancel={() => setEliminateConfirmTarget(null)}
      />

      <ConfirmModal
        open={restartConfirmOpen}
        title="Xác nhận bắt đầu lại"
        message="Bạn có chắc muốn chia bài lại và bắt đầu ván mới không?"
        onConfirm={() => {
          socket.emit("restartGame", { roomId: room.id });
          setRestartConfirmOpen(false);
        }}
        onCancel={() => setRestartConfirmOpen(false)}
      />

      <ConfirmModal
        open={!!noticeModal}
        title={noticeModal?.title || ""}
        message={noticeModal?.message || ""}
        infoOnly={true}
        closeText="Đóng"
        onConfirm={() => setNoticeModal(null)}
        onCancel={() => setNoticeModal(null)}
      />
      <VillagerVictoryAnimation
        open={villagerVictoryAnimOpen}
        villagerRole={villagerRole}
        wolfRole={wolfRole}
        onComplete={() => {
          setVillagerVictoryAnimOpen(false);
          setGameFinishedModalOpen(true);
        }}
      />

      <GameFinishedModal
        open={gameFinishedModalOpen}
        winner={room?.winner}
        scoreResult={null}
        onClose={() => setGameFinishedModalOpen(false)}
        onBackToLobby={handleBackToRoomClick}
        onOpenScoreboard={() => {}}
      />
    </div>
  );
}

