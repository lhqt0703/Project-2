import { useState, useEffect, useMemo, useRef } from "react";
import { socket, clientId } from "../socket";
import { useLocation, useNavigate } from "react-router-dom";
import { useRoomContext } from "../context/RoomContext";
import PlayerPositions from "../components/PlayerPositions";
import ConfirmModal from "../components/ConfirmModal";
import Masonry from "../components/Masonry";
import GameLogPanel from "../components/GameLogPanel";
import nenLungAsset from "../assets/nền lưng.avif";
import RoomBg from "../assets/Nền phòng.avif";
import ChieuBg from "../assets/nền chiều.avif";
import nenLaiAsset from "../assets/Nền lai.avif";
import medalSvg from "../assets/medal.svg";
import GridMotionOverlay from "../components/GridMotionOverlay";
import type { GameLogNight as SharedGameLogNight } from "./gameRoles/socketEvents";

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
  const [dayVoteTargetId, setDayVoteTargetId] = useState<string | null>(null);
  const [trialVoteDecision, setTrialVoteDecision] = useState<"live" | "die" | null>(null);

  // Log & Progress States
  const [gameLogs, setGameLogs] = useState<SharedGameLogNight[]>([]);
  const [revealedRoles, setRevealedRoles] = useState<Record<string, string>>({});
  const [nightProgress, setNightProgress] = useState<Record<string, "pending" | "done">>({});

  // Countdown & Time Offset
  const [now, setNow] = useState(Date.now());
  const [serverTimeOffset, setServerTimeOffset] = useState(0);

  // Wrong choice highlight states
  const [soiMuWrongChoiceHighlightId, setSoiMuWrongChoiceHighlightId] = useState<string | null>(null);
  const [soiMuWrongChoiceOpacity, setSoiMuWrongChoiceOpacity] = useState(1);

  // Confirm Modals
  const [quitConfirmOpen, setQuitConfirmOpen] = useState(false);
  const [endGameConfirmOpen, setEndGameConfirmOpen] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const isHost = room ? room.hostId === clientId : false;

  const isDusk = room?.phase === "dusk";
  const isNight = room?.phase === "night";
  const isDay = room?.phase === "day";

  const amIDead = room?.deadPlayers?.includes(clientId) || false;
  const boardRoomOverride = useMemo(() => {
    if (!room || !isHost) return room;
    return {
      ...room,
      nightActionProgressByPlayerId: nightProgress,
    };
  }, [room, isHost, nightProgress]);

  const myDayVoteTargetId = room?.dayVotes?.[clientId] ?? null;
  const myDayVoteLocked = room?.dayLocked?.[clientId] === true;
  const myTrialVote = trialVoteDecision ?? (room?.trialVotes?.[clientId] ?? null);
  const isDayVotePhase = isDay && !isHost && !amIDead && room?.trialStage === "none" && !!room?.dayDeadline;
  const isTrialDefensePhase = isDay && !isHost && !amIDead && room?.trialStage === "defense" && !!room?.trialTargetId;
  const isTrialVerdictPhase = isDay && !isHost && !amIDead && room?.trialStage === "verdict" && !!room?.trialTargetId;

  // Tiên tri status
  const isInvestigated = room?.soiMuInvestigatedPlayerId === clientId;
  const isInvestigationResolved = room?.soiMuInvestigationResolved !== false; // true if resolved or null
  const showInvestigationUI = isDay && isInvestigated && !isInvestigationResolved && !amIDead;

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

  // Watch for Tiên tri wrong choice failure
  const prevResultRef = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (!room) return;
    if (room.soiMuInvestigationResult === "fail" && prevResultRef.current !== "fail") {
      if (room.soiMuDaySelectedTargetId) {
        setSoiMuWrongChoiceHighlightId(room.soiMuDaySelectedTargetId);
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
    prevResultRef.current = room.soiMuInvestigationResult;
  }, [room?.soiMuInvestigationResult, room?.soiMuDaySelectedTargetId]);

  // Lắng nghe sự kiện socket
  useEffect(() => {
    if (!roomId) return;

    // Yêu cầu lấy thông tin phòng ban đầu
    socket.emit("getRoom", roomId);
    socket.emit("requestGameLog", { roomId });
    socket.emit("requestHostNightActionProgress", { roomId });

    if (isHost) {
      socket.emit("requestRolesReveal", { roomId });
    }

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
      setDayVoteTargetId(null);
      setTrialVoteDecision(null);
      setNightProgress({});
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

    socket.on("roomUpdated", handleRoomUpdated);
    socket.on("gameLogUpdated", handleGameLogUpdated);
    socket.on("rolesRevealUpdated", handleRolesRevealUpdated);
    socket.on("hostNightActionProgressUpdated", handleHostNightActionProgressUpdated);
    socket.on("errorMessage", handleErrorMessage);
    socket.on("phaseChanged", handlePhaseChanged);
    socket.on("returnToRoomResult", handleReturnResult);
    socket.on("forceReturnToRoom", handleForceReturnToRoom);

    return () => {
      socket.off("roomUpdated", handleRoomUpdated);
      socket.off("gameLogUpdated", handleGameLogUpdated);
      socket.off("rolesRevealUpdated", handleRolesRevealUpdated);
      socket.off("hostNightActionProgressUpdated", handleHostNightActionProgressUpdated);
      socket.off("errorMessage", handleErrorMessage);
      socket.off("phaseChanged", handlePhaseChanged);
      socket.off("returnToRoomResult", handleReturnResult);
      socket.off("forceReturnToRoom", handleForceReturnToRoom);
    };
  }, [roomId, isHost, nav, setRoom]);

  // Đồng bộ day vote khi dữ liệu phòng cập nhật
  useEffect(() => {
    setDayVoteTargetId(room?.dayVotes?.[clientId] ?? null);
    setTrialVoteDecision(room?.trialVotes?.[clientId] ?? null);
  }, [room?.dayVotes, room?.trialVotes]);

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
    if (room.soiMuLocked?.[clientId]) return;

    const nextTarget = selectedTargetId === targetId ? null : targetId;
    setSelectedTargetId(nextTarget);
    socket.emit("soiMuChooseTarget", { roomId: room.id, targetId: nextTarget });
  };

  // Gửi hành động chọn ngón tay của Tay Buôn
  const handleChooseThumb = (decision: "up" | "down") => {
    if (!room || amIDead || isHost) return;
    if (room.soiMuLocked?.[clientId]) return;

    const nextDecision = thumbDecision === decision ? null : decision;
    setThumbDecision(nextDecision);
    socket.emit("soiMuChooseThumb", { roomId: room.id, thumb: nextDecision });
  };

  // Khóa hành động ban đêm
  const handleLockNightAction = () => {
    if (!room || amIDead || isHost) return;
    if (room.soiMuLocked?.[clientId]) return;

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

    socket.emit("soiMuDayChooseTarget", { roomId: room.id, targetId: daySelectedTargetId });
  };

  const handleChooseDayVoteTarget = (targetId: string) => {
    if (!room || amIDead || isHost || !isDayVotePhase) return;
    if (room.dayLocked?.[clientId]) return;
    if (room.dayDeadline && Date.now() >= room.dayDeadline) return;

    const nextTarget = dayVoteTargetId === targetId ? null : targetId;
    setDayVoteTargetId(nextTarget);
    socket.emit("dayChooseTarget", { roomId: room.id, targetId: nextTarget });
  };

  const handleLockDayVote = () => {
    if (!room || amIDead || isHost || !isDayVotePhase) return;
    if (room.dayLocked?.[clientId]) return;
    socket.emit("dayLockVote", { roomId: room.id });
  };

  const handleBlankDayVote = () => {
    if (!room || amIDead || isHost || !isDayVotePhase) return;
    if (room.dayLocked?.[clientId]) return;
    setDayVoteTargetId(null);
    socket.emit("dayChooseTarget", { roomId: room.id, targetId: null });
    socket.emit("dayLockVote", { roomId: room.id });
  };

  const handleTrialVote = (vote: "live" | "die") => {
    if (!room || amIDead || isHost || !isTrialVerdictPhase) return;
    if (room.trialVerdictDeadline && Date.now() >= room.trialVerdictDeadline) return;
    setTrialVoteDecision(vote);
    socket.emit("trialVoteLifeDeath", { roomId: room.id, vote });
  };

  const handleTrialToggleInteraction = () => {
    if (!room || amIDead || isHost || !isTrialDefensePhase || room.trialTargetId === clientId) return;
    const hasInteracted = room.trialInteractionActiveIds?.includes(clientId) === true;
    socket.emit("trialToggleInteraction", { roomId: room.id, active: !hasInteracted });
  };

  const handleTrialCutInteraction = () => {
    if (!room || amIDead || isHost || !isTrialDefensePhase || room.trialTargetId !== clientId) return;
    socket.emit("trialCutInteraction", { roomId: room.id });
  };

  // Host kết tội/treo cổ người chơi
  const handleEliminatePlayer = (targetId: string) => {
    if (!room || !isHost || targetId === clientId) return;
    const p = room.players.find((player: any) => player.id === targetId);
    if (!p || room.deadPlayers?.includes(targetId)) return;

    const confirm = window.confirm(`Bạn có chắc muốn treo cổ/loại bỏ người chơi "${p.name}" không?`);
    if (confirm) {
      socket.emit("hostEliminatePlayerForRules", { roomId: room.id, targetId });
    }
  };

  // Chuyển phase game (Host điều khiển)
  const handleChangePhase = (nextPhase: "day" | "night" | "dusk") => {
    if (!room || !isHost) return;
    socket.emit("changePhase", { roomId: room.id, phase: nextPhase });
  };

  // Chia bài lại
  const handleRestartGame = () => {
    if (!room || !isHost) return;
    const confirm = window.confirm("Bạn có chắc muốn chia bài lại và bắt đầu ván mới không?");
    if (confirm) {
      socket.emit("restartGame", { roomId: room.id });
    }
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

  // Cấu hình Highlight của Tiên tri ban ngày
  const trialWhitePlayerIds = useMemo(() => {
    if (isDay && room?.soiMuInvestigatedPlayerId && !room.soiMuInvestigationResolved) {
      return [room.soiMuInvestigatedPlayerId];
    }
    return [];
  }, [isDay, room?.soiMuInvestigatedPlayerId, room?.soiMuInvestigationResolved]);

  const trialGreenPlayerId = useMemo(() => {
    if (isDay && room?.soiMuInvestigatedPlayerId && room.soiMuInvestigationResult === "success") {
      return room.soiMuInvestigatedPlayerId;
    }
    return undefined;
  }, [isDay, room?.soiMuInvestigatedPlayerId, room?.soiMuInvestigationResult]);

  const verdictDiePlayerIds = useMemo(() => {
    if (soiMuWrongChoiceHighlightId) {
      return [soiMuWrongChoiceHighlightId];
    }
    return [];
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
    let deadline: number | null | undefined = null;
    if (isNight) {
      deadline = room.nightTurnDeadline;
    } else if (isDay) {
      deadline = room.dayDeadline || room.dayDiscussionDeadline;
    }
    if (!deadline) return null;
    return Math.max(0, Math.ceil((deadline - now) / 1000));
  }, [isNight, isDay, room.nightTurnDeadline, room.dayDeadline, room.dayDiscussionDeadline, now]);

  const hasMerchantInGame = room.soiMuHasMerchant === true;
  const isLocked = room.soiMuLocked?.[clientId] === true;

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
      {isNight && <GridMotionOverlay active={true} onComplete={() => { }} />}

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
        {!room.gameOver && secondsLeft !== null && (
          <button className="visible border button-gradient" style={{ cursor: "default" }}>
            <div className="btn-content">
              Còn {secondsLeft}s
            </div>
            <div className="border"></div>
            <div className="gradient-0"></div>
            <div className="gradient-1"></div>
            <div className="glass"></div>
            <div className="gradient-2">
              <div className="color-1 color" style={{ transform: "translate(3%, 54%)" }}></div>
              <div className="color-2 color" style={{ transform: "translate(-5%, 64%)" }}></div>
              <div className="color-3 color" style={{ transform: "translate(-100%, -60%)" }}></div>
              <div className="color-4 color" style={{ transform: "translate(-98%, 86%)" }}></div>
              <div className="color-5 color" style={{ transform: "translate(-13%, -27%)" }}></div>
              <div className="color-6 color" style={{ transform: "translate(6%, -39%)" }}></div>
            </div>
          </button>
        )}
      </div>

      {(isHost || !!room.gameOver) && (
        <div className="game-top-actions" style={{ marginBottom: "1rem" }}>
          <button onClick={handleBackToRoomClick}>Quay về phòng chờ</button>
        </div>
      )}

      {/* Main Board Area */}
      <div style={{ margin: "2rem auto", width: "100%", maxWidth: "600px" }}>
        {isDusk && !isHost ? (
          <Masonry
            items={masonryItems}
            duskCardSelections={room.duskCardSelections || {}}
            clientId={clientId}
            onSelectCard={(index) => {
              socket.emit("duskSelectCard", { roomId: room.id, cardIndex: index });
            }}
            onSelectionComplete={() => { }}
            skipExitAnimation={true}
          />
        ) : (
          <div style={{ position: "relative", minHeight: 400 }}>
            <PlayerPositions
              roomOverride={boardRoomOverride}
              onPlayerClick={(pid) => {
                if (isHost) {
                  handleEliminatePlayer(pid);
                } else if (isNight) {
                  handleChooseNightTarget(pid);
                } else if (showInvestigationUI) {
                  handleChooseDayTarget(pid);
                } else if (isDayVotePhase) {
                  handleChooseDayVoteTarget(pid);
                }
              }}
              mode="view"
              showRoleBadges={isHost || room.gameOver}
              roleBadges={activeRolesForDisplay}
              selectedOutlinePlayerId={isNight ? selectedTargetId : (showInvestigationUI ? daySelectedTargetId : (isDayVotePhase ? dayVoteTargetId : null))}
              deadPlayersOverride={room.deadPlayers || []}
              trialWhitePlayerIds={trialWhitePlayerIds}
              trialGreenPlayerId={trialGreenPlayerId}
              verdictDiePlayerIds={verdictDiePlayerIds}
            />
          </div>
        )}
      </div>

      {/* Player controls */}
      {!isHost && !isDusk && !amIDead && (
        <div className="control-panel" style={{ maxWidth: "600px", margin: "1rem auto" }}>
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

          {isDayVotePhase && (
            <div style={{
              background: "rgba(59, 130, 246, 0.1)",
              border: "1px solid rgba(59, 130, 246, 0.3)",
              padding: "16px",
              borderRadius: "12px",
              display: "flex",
              flexDirection: "column",
              gap: 12
            }}>
              <div style={{ fontWeight: 800, color: "#60a5fa" }}>🗳️ Biểu quyết ban ngày</div>
              <div style={{ fontSize: "13px", lineHeight: 1.4, color: "rgba(255, 255, 255, 0.8)" }}>
                Chọn một người trên bàn rồi khóa phiếu của bạn.
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                <button
                  className="btn-action btn-primary"
                  onClick={handleLockDayVote}
                  disabled={myDayVoteLocked || !myDayVoteTargetId}
                >
                  {myDayVoteLocked ? "Đã khóa phiếu" : "Khóa phiếu biểu quyết"}
                </button>
                <button
                  className="btn-action"
                  onClick={handleBlankDayVote}
                  disabled={myDayVoteLocked}
                  style={{ background: "rgba(255,255,255,0.08)", color: "#fff" }}
                >
                  Bỏ phiếu trống
                </button>
              </div>
              <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.7)" }}>
                Phiếu hiện tại: {myDayVoteTargetId ? (room.players.find((p) => p.id === myDayVoteTargetId)?.name || "Người chơi") : "Chưa chọn"}
              </div>
              <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.55)" }}>
                Đã khóa: {Object.values(room.dayLocked || {}).filter(Boolean).length} / {room.dayVoters?.length || room.players.filter((p) => p.id !== room.hostId && !room.deadPlayers?.includes(p.id)).length}
              </div>
            </div>
          )}

          {isTrialDefensePhase && (
            <div style={{
              background: "rgba(245, 158, 11, 0.12)",
              border: "1px solid rgba(245, 158, 11, 0.35)",
              padding: "16px",
              borderRadius: "12px",
              display: "flex",
              flexDirection: "column",
              gap: 12
            }}>
              <div style={{ fontWeight: 800, color: "#f59e0b" }}>🏛️ Người đang trên giàn</div>
              <div style={{ fontSize: "13px", lineHeight: 1.4, color: "rgba(255, 255, 255, 0.8)" }}>
                {room.trialTargetId === clientId
                  ? "Bạn là người đang bị xét xử. Hãy cắt tương tác nếu cần."
                  : "Hãy tương tác với người đang bị xét xử trên giàn."}
              </div>
              {room.trialTargetId !== clientId ? (
                <button
                  className="btn-action btn-primary"
                  onClick={handleTrialToggleInteraction}
                  disabled={room.trialInteractionCut === true}
                >
                  {room.trialInteractionActiveIds?.includes(clientId) ? "Hủy tương tác" : "Tương tác"}
                </button>
              ) : (
                <button
                  className="btn-action"
                  onClick={handleTrialCutInteraction}
                  style={{ background: "rgba(255,255,255,0.08)", color: "#fff" }}
                >
                  ✂️ Cắt tương tác
                </button>
              )}
              <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.65)" }}>
                Đang tương tác: {(room.trialInteractionActiveIds || []).length} / {room.trialInteractionSelectionLimit || 0}
              </div>
            </div>
          )}

          {isTrialVerdictPhase && (
            <div style={{
              background: "rgba(16, 185, 129, 0.1)",
              border: "1px solid rgba(16, 185, 129, 0.3)",
              padding: "16px",
              borderRadius: "12px",
              display: "flex",
              flexDirection: "column",
              gap: 12
            }}>
              <div style={{ fontWeight: 800, color: "#10b981" }}>⚖️ Phiếu sống/chết</div>
              <div style={{ fontSize: "13px", lineHeight: 1.4, color: "rgba(255, 255, 255, 0.8)" }}>
                Hãy chọn Sống hoặc Chết cho người đang bị xét xử.
              </div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button
                  className="btn-action"
                  onClick={() => handleTrialVote("live")}
                  disabled={myTrialVote === "live"}
                  style={{ background: myTrialVote === "live" ? "rgba(16,185,129,0.35)" : "rgba(255,255,255,0.08)", color: "#fff" }}
                >
                  Sống
                </button>
                <button
                  className="btn-action"
                  onClick={() => handleTrialVote("die")}
                  disabled={myTrialVote === "die"}
                  style={{ background: myTrialVote === "die" ? "rgba(239,68,68,0.35)" : "rgba(255,255,255,0.08)", color: "#fff" }}
                >
                  Chết
                </button>
              </div>
              <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.7)" }}>
                Phiếu hiện tại: {myTrialVote === "live" ? "Sống" : myTrialVote === "die" ? "Chết" : "Chưa chọn"}
              </div>
            </div>
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

      {/* Host Controls */}
      {isHost && (
        <div className="game-host-controls" style={{ maxWidth: "600px", margin: "1.5rem auto" }}>
          {isDusk && (
            <button onClick={() => handleChangePhase("night")}>
              Bắt đầu đêm
            </button>
          )}
          <button onClick={handleRestartGame}>
            Chia bài lại
          </button>
          {isNight && (
            <button onClick={() => handleChangePhase("day")}>
              Bắt đầu ngày
            </button>
          )}
          {isDay && (
            <button
              onClick={() => socket.emit("hostStartDayVoting", { roomId: room.id })}
              disabled={room.dayVotingStarted === true || room.trialStage !== "none"}
              style={{ opacity: (room.dayVotingStarted === true || room.trialStage !== "none") ? 0.6 : 1 }}
            >
              Bắt đầu biểu quyết
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
          isHost={true}
          viewMode="names-roles"
          gameEnded={!!room?.gameOver}
          isReplay={room?.isReplay}
          myPlayerId={clientId || undefined}
          myRole={room?.playerRoles?.[clientId || ""]}
          wolves={room?.wolves || []}
          gameRules={room?.gameRules}
        />
      </div>

      {/* Game Over Modal overlay */}
      {room.gameOver && (
        <div style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.8)",
          backdropFilter: "blur(12px)",
          zIndex: 1000,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 20
        }}>
          <div style={{
            background: "linear-gradient(180deg, #1f1a3a, #0d0a1a)",
            border: "2px solid #a78bfa",
            borderRadius: "24px",
            padding: "40px",
            maxWidth: "480px",
            width: "100%",
            textAlign: "center",
            boxShadow: "0 0 50px rgba(167, 139, 250, 0.3)"
          }}>
            <img src={medalSvg} alt="Winner" style={{ width: 80, height: 80, marginBottom: 20, filter: "drop-shadow(0 0 15px #a78bfa)" }} />
            <h2 style={{ fontSize: "28px", fontWeight: 900, color: "#fff", margin: "0 0 10px" }}>Trò Chơi Kết Thúc!</h2>
            <div style={{
              fontSize: "22px",
              fontWeight: 800,
              color: room.winner === "wolves" ? "#ef4444" : "#10b981",
              margin: "0 0 20px"
            }}>
              {room.winner === "wolves" ? "🐺 PHE SÓI CHIẾN THẮNG!" : "👨‍🌾 PHE DÂN LÀNG CHIẾN THẮNG!"}
            </div>
            <p style={{ color: "rgba(255,255,255,0.7)", fontSize: "14px", lineHeight: 1.6, margin: "0 0 30px" }}>
              Hãy xem bảng danh sách vai trò trên bản đồ để biết chính xác từng người chơi đã đảm nhiệm vai trò gì trong ván vừa qua.
            </p>
            <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
              {isHost && (
                <button className="btn-action btn-primary" onClick={handleRestartGame}>Chia bài lại</button>
              )}
              <button className="btn-action" onClick={handleBackToRoomClick} style={{ background: "rgba(255,255,255,0.08)", color: "#fff", border: "1px solid rgba(255,255,255,0.15)" }}>Về phòng chờ</button>
            </div>
          </div>
        </div>
      )}

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
    </div>
  );
}
