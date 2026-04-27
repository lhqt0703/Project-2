

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { socket, clientId } from "../socket";
import { useLocation, useNavigate } from "react-router-dom";
import { useRoomContext } from "../context/RoomContext";
import PlayerPositions from "../components/PlayerPositions";
import GameLogPanel from "../components/GameLogPanel";
import ConfirmModal from "../components/ConfirmModal";
import type { GamePhase } from "./gameRoles/socketEvents";
import type { NightActionRole } from "../context/RoomContext";
import { useSeerRole } from "./gameRoles/useSeerRole";
import { useWolfRole } from "./gameRoles/useWolfRole";
import { useGuardianRole } from "./gameRoles/useGuardianRole";
import { useGameSocketSync } from "./gameRoles/useGameSocketSync";
import { useWitchRole } from "./gameRoles/useWitchRole";
import { useHunterRole } from "./gameRoles/useHunterRole";
import { useSpiritWolfRole } from "./gameRoles/useSpiritWolfRole";
import { useDayVoteRole } from "./gameRoles/useDayVoteRole";
import { useElementalRole } from "./gameRoles/useElementalRole";

export default function Game() {
  const { role, room, setRoom } = useRoomContext();
  const nav = useNavigate();
  const location = useLocation();
  const query = new URLSearchParams(location.search);
  const roomId = query.get("roomId");
  const debugAnim = query.get("debugAnim") === "1";
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
  const shouldHidePlayerRoleText = !isHost && !!room?.hidePlayerRoleText;
  const allNightActionsSimultaneous = room?.gameRules?.allNightActionsSimultaneous === true;
  const currentNightTurnRole = (room?.nightTurnRole || null) as NightActionRole | null;
  const nightTurnPaused = !!room?.nightTurnPaused;
  const nightTurnDeadline = room?.nightTurnDeadline ?? null;
  const nightTurnRemainingMs = room?.nightTurnRemainingMs ?? null;
  const [nightTurnNow, setNightTurnNow] = useState(Date.now());
  const [noticeModal, setNoticeModal] = useState<{ title: string; message: string; onConfirm?: () => void } | null>(null);
  const [frozenRoomSnapshot, setFrozenRoomSnapshot] = useState<any | null>(null);
  const [rulesRestartOverlay, setRulesRestartOverlay] = useState<{
    message: string;
    totalMs: number;
    fadeInMs: number;
    holdMs: number;
    fadeOutMs: number;
    key: number;
  } | null>(null);

  const showNotice = useCallback((title: string, message: string, onConfirm?: () => void) => {
    setNoticeModal({ title, message, onConfirm });
  }, []);

  // State for highlighting player from log click
  const [highlightPlayerId, setHighlightPlayerId] = useState<string | null>(null);
  const [secondaryHighlightPlayerIds, setSecondaryHighlightPlayerIds] = useState<string[]>([]);
  const [dangerHighlightPlayerIds, setDangerHighlightPlayerIds] = useState<string[]>([]);
  const handleLogHighlightPlayer = useCallback((payload: { primaryId: string | null; secondaryIds?: string[]; dangerIds?: string[] }) => {
    setHighlightPlayerId(payload.primaryId);
    setSecondaryHighlightPlayerIds(payload.secondaryIds || []);
    setDangerHighlightPlayerIds(payload.dangerIds || []);
  }, []);

  // During dusk, log stays hidden to everyone.
  const canViewLog = !isDusk && (isHost || !!sync.gameEnded);
  const canViewRoles = isHost || !!sync.gameEnded;

  useEffect(() => {
    if (phase !== "night") return;
    if (allNightActionsSimultaneous) return;
    if (!currentNightTurnRole) return;
    if (!nightTurnDeadline) return;
    if (nightTurnPaused) return;
    setNightTurnNow(Date.now());
    const t = setInterval(() => setNightTurnNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [allNightActionsSimultaneous, currentNightTurnRole, nightTurnDeadline, nightTurnPaused, phase]);

  const isSequentialNight =
    phase === "night" &&
    !allNightActionsSimultaneous;

  const nightTurnRemainingSec = useMemo(() => {
    if (!isSequentialNight || !currentNightTurnRole) return null;
    if (nightTurnPaused) {
      if (nightTurnRemainingMs == null) return null;
      return Math.max(0, Math.ceil(nightTurnRemainingMs / 1000));
    }
    if (!nightTurnDeadline) return null;
    return Math.max(0, Math.ceil((nightTurnDeadline - nightTurnNow) / 1000));
  }, [currentNightTurnRole, isSequentialNight, nightTurnDeadline, nightTurnNow, nightTurnPaused, nightTurnRemainingMs]);

  const isWolfTeamRole = role === "Sói" || role === "Sói con" || role === "Bán sói";
  const isSeerTurnActive = useMemo(() => {
    if (phase !== "night") return false;
    if (allNightActionsSimultaneous) return true;
    return currentNightTurnRole === "Tiên tri";
  }, [allNightActionsSimultaneous, currentNightTurnRole, phase]);

  const doesNightTurnMatchMyRole = useMemo(() => {
    if (!currentNightTurnRole) return false;
    if (currentNightTurnRole === "Sói") return isWolfTeamRole;
    return role === currentNightTurnRole;
  }, [currentNightTurnRole, isWolfTeamRole, role]);

  const hasSecretConditionalRolePrompt =
    !!sync.spiritWolfDecisionTargetId &&
    currentNightTurnRole === "Linh sói";

  useEffect(() => {
    if (!roomId) return;
    if (!isHost) return;
    socket.emit("requestGameLog", { roomId });
  }, [roomId, isHost]);

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
      // ignore malformed cached payload
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
          "Bạn đã bị chủ phòng mời khỏi phòng. Bạn sẽ được chuyển về Lobby.",
          () => nav("/lobby")
        );
        return;
      }

      showNotice(
        "Phòng đã đóng",
        "Chủ phòng đã đóng phòng hoặc phòng không còn tồn tại. Bạn sẽ được chuyển về Lobby.",
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

  useEffect(() => {
    if (!roomId) return;
    if (!sync.gameEnded) return;
    // Fallback request (server also broadcasts on gameEnded).
    socket.emit("requestGameLog", { roomId });
  }, [roomId, sync.gameEnded]);

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

  const logPanel = canViewLog ? (
    <GameLogPanel
      nights={sync.gameLogNights || []}
      rolesByPlayerId={sync.revealedRolesByPlayerId || {}}
      playerNamesById={playerNamesById}
      onHighlightPlayer={handleLogHighlightPlayer}
      onRequestRefresh={() => {
        if (!roomId) return;
        socket.emit("requestGameLog", { roomId });
      }}
    />
  ) : null;

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

  // Cinematic beat: quick burst -> ~1s slow-mo -> quick finish.
  const HUNTER_BULLET_ANIM_MS = 1000;
  const [hunterBulletAnim, setHunterBulletAnim] = useState<
    | {
        fromPlayerId: string;
        toPlayerId: string;
        startedAt: number;
        durationMs: number;
      }
    | null
  >(null);
  const hunterBulletTimeoutRef = useRef<number | null>(null);
  const lastHunterShotRef = useRef<{ hunterId: string; targetId: string } | null>(null);
  const lastDayVoteNoticeSeqRef = useRef(0);
  const lastTrialVerdictNoticeSeqRef = useRef(0);

  const playHunterShotAnim = (hunterId: string, targetId: string) => {
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
    });

    hunterBulletTimeoutRef.current = window.setTimeout(() => {
      setHunterBulletAnim(null);
      hunterBulletTimeoutRef.current = null;
    }, HUNTER_BULLET_ANIM_MS);
  };

  useEffect(() => {
    const shot = sync.hunterShot;
    if (!shot?.hunterId || !shot?.targetId) return;

    lastHunterShotRef.current = { hunterId: shot.hunterId, targetId: shot.targetId };

    playHunterShotAnim(shot.hunterId, shot.targetId);
  }, [sync.hunterShotSeq]);

  useEffect(() => {
    if (!debugAnim) return;
    if (!room) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== "h" || !e.shiftKey) return;

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
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [debugAnim, room, deadPlayers]);

  const deadPlayersOverrideForRender = useMemo(() => {
    if (!hunterBulletAnim) return displayDeadPlayers;
    const { fromPlayerId, toPlayerId } = hunterBulletAnim;
    return displayDeadPlayers.filter((id) => id !== fromPlayerId && id !== toPlayerId);
  }, [displayDeadPlayers, hunterBulletAnim]);

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
    deadPlayers,
    seerResult: sync.seerResult,
    allNightActionsSimultaneous,
    currentNightTurnRole,
    nightTurnPaused,
    maxChecksTonight: seerMaxChecksTonight,
  });
  const wolf = useWolfRole({
    roomId,
    phase,
    role,
    room: roomForRoles,
    deadPlayers,
    wolfLocked: sync.wolfLocked,
    wolfDeadline: sync.wolfDeadline,
    wolves: sync.wolves,
    activeWolves: sync.activeWolves,
    wolfMaxTargets: sync.wolfMaxTargets,
    allNightActionsSimultaneous,
    currentNightTurnRole,
    nightTurnPaused,
  });
  const guardian = useGuardianRole({
    roomId,
    phase,
    role,
    deadPlayers,
    guardianProtectedSeq: sync.guardianProtectedSeq,
    guardianProtectedTargetId: sync.guardianProtectedTargetId,
    allNightActionsSimultaneous,
    currentNightTurnRole,
    nightTurnPaused,
  });

  const witch = useWitchRole({
    roomId,
    phase,
    role,
    room: roomForRoles,
    deadPlayers,
    witchPendingDeathTargetIds: sync.witchPendingDeathTargetIds,
    witchPotions: sync.witchPotions,
    allNightActionsSimultaneous,
    currentNightTurnRole,
    nightTurnPaused,
  });

  const hunter = useHunterRole({
    roomId,
    phase,
    role,
    deadPlayers,
    hunterTargetSeq: sync.hunterTargetSeq,
    hunterTargetId: sync.hunterTargetId,
    allNightActionsSimultaneous,
    currentNightTurnRole,
    nightTurnPaused,
  });

  const spiritWolf = useSpiritWolfRole({
    roomId,
    phase,
    role,
    room: roomForRoles,
    deadPlayers,
    decisionTargetId: sync.spiritWolfDecisionTargetId,
    allNightActionsSimultaneous,
    currentNightTurnRole,
    nightTurnPaused,
  });

  const elemental = useElementalRole({
    roomId,
    phase,
    role,
    room: roomForRoles,
    deadPlayers,
    elementalTargetSeq: sync.elementalTargetSeq,
    elementalTargetId: sync.elementalTargetId,
    elementalActionMode: sync.elementalActionMode,
    elementalBuffVoteState: sync.elementalBuffVoteState,
    availableBuffTier: sync.elementalBuffVoteState.availableBuffTier || 0,
    allNightActionsSimultaneous,
    currentNightTurnRole,
  });


  const dayVote = useDayVoteRole({
    roomId,
    phase,
    room: roomForRoles,
    deadPlayers,
    dayVotes: sync.dayVotes,
    dayLocked: sync.dayLocked,
    dayDiscussionDeadline: sync.dayDiscussionDeadline,
    dayDeadline: sync.dayDeadline,
    dayVoters: sync.dayVoters,
    trialTargetId: sync.trialTargetId,
    trialStage: sync.trialStage,
    trialDefenseDeadline: sync.trialDefenseDeadline,
    trialVerdictDeadline: sync.trialVerdictDeadline,
    trialInteractionCut: sync.trialInteractionCut,
    trialInteractionActiveIds: sync.trialInteractionActiveIds,
    trialSelectedInteractorId: sync.trialSelectedInteractorId,
    trialSelectedInteractorIds: sync.trialSelectedInteractorIds,
    trialInteractionSelectionLimit: sync.trialInteractionSelectionLimit,
    trialVotes: sync.trialVotes,
  });

  // Note: all socket subscriptions are centralized in useGameSocketSync.

  useEffect(() => {
    // Khi host rời khi game đang diễn ra
    const handleHostDisconnected = () => {
      showNotice(
        "Thông báo",
        "Chủ phòng đã rời đi. Bạn có thể chờ chủ phòng quay lại hoặc thoát khỏi phòng."
      );
      // Có thể thêm logic cho phép người chơi tự thoát hoặc chờ
    };
    socket.on("hostDisconnected", handleHostDisconnected);
    return () => {
      socket.off("hostDisconnected", handleHostDisconnected);
    };
  }, [showNotice]);

  useEffect(() => {
    const handleErrorMessage = (msg: string) => {
      if (msg) showNotice("Thông báo", msg);
    };
    socket.on("errorMessage", handleErrorMessage);
    return () => {
      socket.off("errorMessage", handleErrorMessage);
    };
  }, [showNotice]);

  useEffect(() => {
    if (!sync.gameEnded) return;
    const winnerText = sync.gameEnded.winner === "wolves" ? "Phe Sói" : "Phe Dân";
    showNotice("Trò chơi kết thúc", `${winnerText} chiến thắng`);
  }, [showNotice, sync.gameEnded]);

  useEffect(() => {
    const seq = sync.dayVoteFinishedSeq;
    if (!seq || !sync.dayVoteFinished) return;
    if (lastDayVoteNoticeSeqRef.current === seq) return;
    lastDayVoteNoticeSeqRef.current = seq;

    if (sync.dayVoteFinished.targetId) {
      const targetName = room?.players.find((p) => p.id === sync.dayVoteFinished?.targetId)?.name || "một người chơi";
      if (sync.dayVoteFinished.startedTrial) {
        showNotice("Kết quả biểu quyết", `${targetName} bị đưa lên thanh minh`);
      } else {
        showNotice("Kết quả biểu quyết", `${targetName} bị loại`);
      }
      return;
    }
    showNotice("Kết quả biểu quyết", "Không ai bị loại");
  }, [room?.players, showNotice, sync.dayVoteFinished, sync.dayVoteFinishedSeq]);

  useEffect(() => {
    const seq = sync.trialVerdictFinishedSeq;
    if (!seq || !sync.trialVerdictFinished) return;
    if (lastTrialVerdictNoticeSeqRef.current === seq) return;
    lastTrialVerdictNoticeSeqRef.current = seq;

    const targetName = room?.players.find((p) => p.id === sync.trialVerdictFinished?.targetId)?.name || "người bị biểu quyết";
    if (sync.trialVerdictFinished.executed) {
      showNotice("Kết quả sống/chết", `${targetName} bị xử tử.`);
      return;
    }
    showNotice("Kết quả sống/chết", `${targetName} được tha (sống).`);
  }, [room?.players, showNotice, sync.trialVerdictFinished, sync.trialVerdictFinishedSeq]);

  // Xử lý click vào avatar người chơi
  const handlePlayerClick = (playerId: string) => {
    if (sync.gameEnded) return;
    // Nếu người chơi đã chết thì không được chọn họ nữa
    if (deadPlayers.includes(playerId)) return;

    if (dayVote.onPlayerClick(playerId)) return;

    if (seer.onPlayerClick(playerId)) return;
    if (wolf.onPlayerClick(playerId)) return;
    if (guardian.onPlayerClick(playerId)) return;
    if (witch.onPlayerClick(playerId)) return;
    if (hunter.onPlayerClick(playerId)) return;
    if (elemental.onPlayerClick(playerId)) return;
  };

  const requestReturnToRoom = () => {
    if (!roomId) return;
    socket.emit("requestReturnToRoom", { roomId });
  };

  const handleBackToRoomClick = () => {
    requestReturnToRoom();
  };

  const rulesRestartAnimationName = rulesRestartOverlay
    ? `gameRulesRestartOverlay_${rulesRestartOverlay.key}`
    : "";
  const rulesRestartTextAnimationName = rulesRestartOverlay
    ? `gameRulesRestartText_${rulesRestartOverlay.key}`
    : "";

  return (
    <div className="page-shell game-page" style={{ padding: 20 }}>
      {!room && (
        <p>
          Hình như có gì đó sai sai... Lẽ ra bạn không nên thấy được những dòng này
        </p>
      )}

      {!isHost && (
        <h2>Vai trò của bạn là: {shouldHidePlayerRoleText ? "********" : role}</h2>
      )}
      
      {sync.gameEnded && (
        <h2>
          Kết thúc: {sync.gameEnded.winner === "wolves" ? "Phe Sói" : "Phe Dân"} chiến thắng
        </h2>
      )}
      {phase === "dusk" ? (
        <h1>🌥️ Hoàng hôn</h1>
      ) : phase === "day" ? (
        <h1>🌞 Ban ngày – Thảo luận</h1>
      ) : (
        <h1>🌙 Ban đêm – Các vai trò thực hiện hành động</h1>
      )}

      {isSequentialNight && currentNightTurnRole && isHost && (
        <div style={{ marginTop: 8, fontWeight: 700 }}>
          Lượt hiện tại: {currentNightTurnRole}
          {nightTurnRemainingSec !== null ? ` - còn ${nightTurnRemainingSec}s` : ""}
          {nightTurnPaused ? " (đang tạm ngưng)" : ""}
        </div>
      )}

      {isHost && hasSecretConditionalRolePrompt && (
        <div style={{ marginTop: 6, fontWeight: 700 }}>
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
          <div style={{ marginTop: 12, padding: 12, borderRadius: 8, background: "rgba(109, 68, 232, 0.12)", border: "1px solid rgba(109, 68, 232, 0.3)" }}>
            <div style={{ fontWeight: 700, color: "#6d44e8" }}>
              ✨ Buff nguyên tố {isActiveTonight ? "đang kích hoạt" : isPending ? `sẽ kích hoạt đêm ${buff.appliesNight}` : `đã kích hoạt đêm ${buff.appliesNight}`}
            </div>
            <div style={{ marginTop: 4 }}>
              <span style={{ fontWeight: 600 }}>{buff.label}</span>
              {" "}(Tier {buff.tier})
              {buff.randomTieBreak ? (
                <span style={{ fontStyle: "italic", opacity: 0.75 }}> - Được chọn ngẫu nhiên do hòa phiếu</span>
              ) : null}
            </div>
          </div>
        );
      })()}

      {isSequentialNight && currentNightTurnRole && !isHost && doesNightTurnMatchMyRole && nightTurnRemainingSec !== null && (
        <div style={{ marginTop: 8, fontWeight: 700 }}>
          Còn {nightTurnRemainingSec}s nữa để thực hiện chức năng{nightTurnPaused ? " (đang tạm ngưng)" : ""}
        </div>
      )}

      {(isHost || !!sync.gameEnded) && (
        <div className="game-top-actions" style={{ marginTop: 12 }}>
          <button onClick={handleBackToRoomClick}>Quay về phòng chờ</button>
        </div>
      )}


      {debugAnim && (
        <div className="game-top-actions" style={{ marginTop: 10 }}>
          <button
            onClick={() => {
              if (!room) return;
              const alive = room.players
                .map(p => p.id)
                .filter(id => !deadPlayers.includes(id));
              if (alive.length < 2) return;
              const from = alive[0]!;
              const to = alive.find(id => id !== from) || null;
              if (!to) return;
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

          <div style={{ opacity: 0.7, fontSize: 12, alignSelf: "center" }}>
            Tip: Shift+H để random shot
          </div>
        </div>
      )}
      {/* Hiển thị bố cục vị trí người chơi khi có room.positions */}
      {roomForDisplay?.positions && (
        <div style={{ margin: "32px auto" }}>
          <PlayerPositions
            mode="view"
            roomOverride={roomForDisplay}
            onPlayerClick={handlePlayerClick}
            seerResult={isSeerTurnActive ? seer.seerResult : null}
            deadPlayersOverride={deadPlayersOverrideForRender}
            bulletAnimation={hunterBulletAnim}
            highlightPlayerId={highlightPlayerId}
            secondaryHighlightPlayerIds={secondaryHighlightPlayerIds}
            showRoleBadges={canViewRoles}
            roleBadges={canViewRoles ? sync.revealedRolesByPlayerId : undefined}
            activeNightRole={isHost && isSequentialNight ? currentNightTurnRole : null}
            selectedOutlinePlayerId={
              dayVote.playerPositionsProps.selectedOutlinePlayerId ||
              guardian.playerPositionsProps.selectedOutlinePlayerId ||
              witch.playerPositionsProps.selectedOutlinePlayerId ||
              elemental.playerPositionsProps.selectedOutlinePlayerId ||
              hunter.playerPositionsProps.selectedOutlinePlayerId ||
              null
            }
            selectedOutlinePlayerIds={(wolf.playerPositionsProps.selectedOutlinePlayerIds || []).filter(
              (id): id is string => !!id
            )}
            dangerPlayerIds={Array.from(new Set([...(witch.playerPositionsProps.dangerPlayerIds || []), ...dangerHighlightPlayerIds]))}
            showWolfVoteBadges={dayVote.playerPositionsProps.showWolfVoteBadges || wolf.playerPositionsProps.showWolfVoteBadges}
            wolfVoteVoterIds={
              dayVote.playerPositionsProps.showWolfVoteBadges
                ? dayVote.playerPositionsProps.wolfVoteVoterIds
                : wolf.playerPositionsProps.wolfVoteVoterIds
            }
            showWolfBadges={wolf.playerPositionsProps.showWolfBadges}
            wolfBadgePlayerIds={wolf.playerPositionsProps.wolfBadgePlayerIds}
            trialOrangePlayerId={dayVote.playerPositionsProps.trialOrangePlayerId}
            trialWhitePlayerIds={dayVote.playerPositionsProps.trialWhitePlayerIds}
            trialGreenPlayerId={dayVote.playerPositionsProps.trialGreenPlayerId}
          />
        </div>
      )}

      {!isHost && logPanel}
      {seer.modal}
      {guardian.modal}

      {hunter.modal}
      {elemental.modal}

      {spiritWolf.modal}

      {witch.panel}
      {elemental.panel}


    {/* Host controls */}
    {isHost && (
      <div className="game-host-controls">
        <button
          onClick={() =>
            socket.emit("changePhase", { roomId, phase: "night" })
          }
        >
          Bắt đầu đêm
        </button>
        <button onClick={() => socket.emit("restartGame", { roomId })}>
          Chia bài lại
        </button>
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
        {phase === "night" && !sync.gameEnded && isSequentialNight && (
          <button
            onClick={() => socket.emit("hostToggleNightTurnPause", { roomId })}
            disabled={!currentNightTurnRole}
            style={{ opacity: currentNightTurnRole ? 1 : 0.6 }}
          >
            {nightTurnPaused ? "Tiếp tục thời gian" : "Tạm ngưng thời gian"}
          </button>
        )}
        {phase === "day" && !sync.gameEnded && (
          <button
            onClick={() => socket.emit("hostStartDayVoting", { roomId })}
            disabled={!isDayDiscussion}
            style={{ opacity: isDayDiscussion ? 1 : 0.6 }}
          >
            Bắt đầu biểu quyết
          </button>
        )}
        {phase === "day" && !sync.gameEnded && sync.trialStage === "defense" && (
          <button onClick={() => socket.emit("hostForceFinishDayVote", { roomId })}>
            Kết thúc tương tác ngay
          </button>
        )}
        {phase === "day" && !sync.gameEnded && (sync.dayDeadline || sync.trialStage === "verdict") && (
          <button onClick={() => socket.emit("hostForceFinishDayVote", { roomId })}>
            Chốt vote ngay
          </button>
        )}
        {phase === "day" && !sync.gameEnded && sync.trialStage === "defense" && (
          <button onClick={() => socket.emit("trialAddInteractionTurn", { roomId })}>
            Bổ sung lượt tương tác
          </button>
        )}
        <button onClick={() => socket.emit("hostTogglePlayerRoleText", { roomId })}>
          {room?.hidePlayerRoleText ? "Hiện vai trò người chơi" : "Ẩn vai trò người chơi"}
        </button>
      </div>
    )}

    {isHost && logPanel}

    {wolf.panel}
    {!isHost && dayVote.panel}

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

    </div>
  );
}
