

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { socket, clientId } from "../socket";
import { useLocation, useNavigate } from "react-router-dom";
import { useRoomContext } from "../context/RoomContext";
import PlayerPositions from "../components/PlayerPositions";
import GameLogPanel from "../components/GameLogPanel";
import ConfirmModal from "../components/ConfirmModal";
import RoleCharacterPortrait from "../components/RoleCharacterPortrait";
import type { GamePhase } from "./gameRoles/socketEvents";
import type { NightActionRole } from "../context/RoomContext";
import { ELEMENTAL_ROLE_SET } from "../constants/elemental";
import { useSeerRole } from "./gameRoles/useSeerRole";
import { useWolfRole } from "./gameRoles/useWolfRole";
import { useGuardianRole } from "./gameRoles/useGuardianRole";
import { useGameSocketSync } from "./gameRoles/useGameSocketSync";
import { useWitchRole } from "./gameRoles/useWitchRole";
import { useHunterRole } from "./gameRoles/useHunterRole";
import { useSpiritWolfRole } from "./gameRoles/useSpiritWolfRole";
import { useDayVoteRole } from "./gameRoles/useDayVoteRole";
import { useElementalRole } from "./gameRoles/useElementalRole";

const WOLF_TEAM_REVEAL_ROLES = new Set(["Sói", "Sói con", "Bán sói"]);
const NIGHT_ACTION_ROLE_SET = new Set([
  "Sói",
  "Sói con",
  "Bán sói",
  "Bảo vệ",
  "Phù thủy",
  "Linh sói",
  "Thợ săn",
  "Tiên tri",
]);

function doesRoleMatchNightTurn(roleName: string | null | undefined, nightTurnRole: NightActionRole | null) {
  if (!roleName || !nightTurnRole) return false;
  if (nightTurnRole === "Sói") return WOLF_TEAM_REVEAL_ROLES.has(roleName);
  return roleName === nightTurnRole;
}

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
  const isBanSoiAligned = room?.banSoiWolfAligned === true;
  const currentNightTurnRole = (room?.nightTurnRole || null) as NightActionRole | null;
  const nightTurnPaused = !!room?.nightTurnPaused;
  const nightTurnDeadline = room?.nightTurnDeadline ?? null;
  const nightTurnRemainingMs = room?.nightTurnRemainingMs ?? null;
  const [nightTurnNow, setNightTurnNow] = useState(Date.now());
  const [noticeModal, setNoticeModal] = useState<{ title: string; message: string; onConfirm?: () => void } | null>(null);
  const [endGameConfirmOpen, setEndGameConfirmOpen] = useState(false);
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

  const isSimultaneousNight = phase === "night" && allNightActionsSimultaneous;

  const witchBonusApplies = useMemo(() => {
    const rules = room?.gameRules;
    if (!rules) return false;
    const nonWolf = rules.nonWolfNightActionDurationSec || 0;
    const wolf = rules.wolfNightActionDurationSec || 0;
    return nonWolf > 0 && wolf === nonWolf;
  }, [room?.gameRules]);

  const isWolfTeamRole = role === "Sói" || role === "Sói con" || (role === "Bán sói" && isBanSoiAligned);

  const mySimultaneousDeadline = useMemo(() => {
    if (!isSimultaneousNight) return null;
    if (!role) return null;
    if (role === "Bán sói" && !isBanSoiAligned) return null;
    if (!NIGHT_ACTION_ROLE_SET.has(role) && !ELEMENTAL_ROLE_SET.has(role)) return null;

    if (isWolfTeamRole) return sync.wolfDeadline ?? null;

    const baseDeadline = nightTurnDeadline ?? null;
    if (!baseDeadline) return null;
    if (role === "Phù thủy" && witchBonusApplies) return baseDeadline + 10_000;
    return baseDeadline;
  }, [isBanSoiAligned, isSimultaneousNight, isWolfTeamRole, nightTurnDeadline, role, sync.wolfDeadline, witchBonusApplies]);

  useEffect(() => {
    if (!isSimultaneousNight) return;
    if (!mySimultaneousDeadline) return;
    if (nightTurnPaused) return;
    setNightTurnNow(Date.now());
    const t = setInterval(() => setNightTurnNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [isSimultaneousNight, mySimultaneousDeadline, nightTurnPaused]);

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
    if (!mySimultaneousDeadline) return null;
    return Math.max(0, Math.ceil((mySimultaneousDeadline - nightTurnNow) / 1000));
  }, [isSimultaneousNight, mySimultaneousDeadline, nightTurnNow]);

  const isSeerTurnActive = useMemo(() => {
    if (phase !== "night") return false;
    if (allNightActionsSimultaneous) return true;
    return currentNightTurnRole === "Tiên tri";
  }, [allNightActionsSimultaneous, currentNightTurnRole, phase]);

  const doesNightTurnMatchMyRole = useMemo(() => {
    if (!currentNightTurnRole) return false;
    if (currentNightTurnRole === "Sói") return isWolfTeamRole;
    if (role === "Bán sói" && !isBanSoiAligned) return false;
    return role === currentNightTurnRole;
  }, [currentNightTurnRole, isBanSoiAligned, isWolfTeamRole, role]);

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
    />
  ) : null;

  const roleBadgesForDisplay = useMemo(() => {
    if (!canViewRoles) return undefined;

    const allRoleBadges = sync.revealedRolesByPlayerId || {};
    if (!isSequentialNight || sync.gameEnded) return allRoleBadges;

    return Object.fromEntries(
      Object.entries(allRoleBadges).filter(([, playerRole]) => {
        if (playerRole === "Bán sói" && !isBanSoiAligned) return false;
        return doesRoleMatchNightTurn(playerRole, currentNightTurnRole);
      })
    );
  }, [canViewRoles, currentNightTurnRole, isBanSoiAligned, isSequentialNight, sync.gameEnded, sync.revealedRolesByPlayerId]);

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
    wolfBadgeRoles: sync.wolfBadgeRolesByPlayerId,
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
      setHostDisconnected(true);
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
      // Use shared verdict sequence để hiện thông báo đồng bộ giống nhau giữa mọi người.
      const noticeIndex = Math.abs(seq) % executedNotices.length;
      showNotice("Kết quả cuối", executedNotices[noticeIndex]!);
      return;
    }
    showNotice("Kết quả cuối", `${targetName} được tha (sống).`);
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

  const handleEndGameConfirm = () => {
    if (!roomId) return;
    setEndGameConfirmOpen(false);
    socket.emit("hostEndGameNow", { roomId });
  };

  const rulesRestartAnimationName = rulesRestartOverlay
    ? `gameRulesRestartOverlay_${rulesRestartOverlay.key}`
    : "";
  const rulesRestartTextAnimationName = rulesRestartOverlay
    ? `gameRulesRestartText_${rulesRestartOverlay.key}`
    : "";
  const isRoleRevealLimitedToCurrentNightTurn = isSequentialNight && !sync.gameEnded;
  const shouldRevealMyRole =
    !isHost &&
    !!role &&
    (!!sync.gameEnded ||
      (isRoleRevealLimitedToCurrentNightTurn ? doesNightTurnMatchMyRole : !shouldHidePlayerRoleText));
  const shouldShowRolePortrait = shouldRevealMyRole;
  const visiblePlayerCount = (roomForDisplay?.players || []).filter((p: any) => p.id !== roomForDisplay?.hostId).length;
  const playerFrameHeightPx = visiblePlayerCount > 18 ? 570 : 470;
  const rolePortraitImagesForGame = useMemo(
    () => import.meta.glob<string>("../assets/*.png", { eager: true, import: "default" }),
    []
  );
  const normalizeRoleName = useCallback((value: string) => value.normalize("NFC").trim().toLowerCase(), []);
  const getAssetNameFromPath = useCallback((path: string) => path.split("/").pop()?.replace(/\.png$/i, "") ?? "", []);
  const rolePortraitByNameForGame = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(rolePortraitImagesForGame).map(([path, src]) => [normalizeRoleName(getAssetNameFromPath(path)), src])
      ),
    [getAssetNameFromPath, normalizeRoleName, rolePortraitImagesForGame]
  );
  const roleCompanionAssetMap = useMemo(
    () =>
      ({
        [normalizeRoleName("Gió")]: "C Gió",
        [normalizeRoleName("Sói")]: "C Sói",
        [normalizeRoleName("Sói con")]: "C Sói Con",
        [normalizeRoleName("Phù thủy")]: "C Phù Thủy",
        [normalizeRoleName("Tiên tri")]: "C Tiên Tri",
        [normalizeRoleName("Bán sói")]: "C Bán Sói",
        [normalizeRoleName("Bảo vệ")]: "C Bảo Vệ",
        [normalizeRoleName("Băng Giá")]: "C Băng",
        [normalizeRoleName("Thợ săn")]: "C Thợ Săn",
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

  return (
    <div className={`page-shell game-page${shouldShowRolePortrait ? " has-role-portrait" : ""}`} style={{ padding: "1.25rem"/* , height: "100dvh", overflow: "hidden" */ }}>
      {!room && (
        <p>
          Hình như có gì đó sai sai... Lẽ ra bạn không nên thấy được những dòng này
        </p>
      )}

      {!isHost && (
        <h2>Vai trò của bạn là: {shouldRevealMyRole ? role : "********"}</h2>
      )}
      
      {sync.gameEnded && (
        <h2>
          Kết thúc: {sync.gameEnded.winner === "wolves" ? "Phe Sói" : "Phe Dân"} chiến thắng
        </h2>
      )}
      {!sync.gameEnded && (
        <>
          {phase === "dusk" ? (
            <h1>🌥️ Hoàng hôn</h1>
          ) : phase === "day" ? (
            <h1>🌞 Ban ngày</h1>
          ) : (
            <h1>🌙 Ban đêm</h1>
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

      {isSequentialNight && currentNightTurnRole && !isHost && doesNightTurnMatchMyRole && nightTurnRemainingSec !== null && (
        <div style={{ marginTop: 8, fontWeight: 700 }}>
          Còn {nightTurnRemainingSec}s nữa để thực hiện chức năng{nightTurnPaused ? " (đang tạm ngưng)" : ""}
        </div>
      )}

      {isSimultaneousNight && !isHost && !isWolfTeamRole && role && mySimultaneousDeadline && simultaneousRemainingSec !== null && (
        <div style={{ marginTop: 8, fontWeight: 700 }}>
          Còn {simultaneousRemainingSec}s nữa để thực hiện chức năng
        </div>
      )}

      {(isHost || !!sync.gameEnded || hostDisconnected) && (
        <div className="game-top-actions" style={{ marginTop: "0.75rem" }}>
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

          <div style={{ opacity: 0.7, fontSize: "0.75rem", alignSelf: "center" }}>
            Tip: Shift+H để random shot
          </div>
        </div>
      )}
      {/* Hiển thị bố cục vị trí người chơi khi có room.positions */}
      {roomForDisplay?.positions && (
        <div style={{ margin: "2rem auto" }}>
          <PlayerPositions
            mode="view"
            roomOverride={roomForDisplay}
            onPlayerClick={handlePlayerClick}
            seerResult={isSeerTurnActive ? seer.seerResult : null}
            deadPlayersOverride={deadPlayersOverrideForRender}
            bulletAnimation={hunterBulletAnim}
            highlightPlayerId={highlightPlayerId}
            secondaryHighlightPlayerIds={secondaryHighlightPlayerIds}
            showRoleBadges={!!roleBadgesForDisplay}
            roleBadges={roleBadgesForDisplay}
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
            wolfBadgeRoles={wolf.playerPositionsProps.wolfBadgeRoles}
            trialOrangePlayerId={dayVote.playerPositionsProps.trialOrangePlayerId}
            trialWhitePlayerIds={dayVote.playerPositionsProps.trialWhitePlayerIds}
            trialGreenPlayerId={dayVote.playerPositionsProps.trialGreenPlayerId}
          />
          <RoleCharacterPortrait
            role={shouldShowRolePortrait ? role : null}
          />
          {companionRoleSrc && !(sync.gameEnded && canViewLog) && (
            <img
              className="role-companion-overlay"
              src={companionRoleSrc}
              alt=""
              style={{
                position: "fixed",
                right: 0,
                bottom: 0,
                width: "auto",
                height: `${playerFrameHeightPx}px`,
                maxWidth: "min(50vw, 360px)",
                objectFit: "contain",
                objectPosition: "right bottom",
                pointerEvents: "none",
                userSelect: "none",
                zIndex: 10,
              }}
            />
          )}
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
        {!sync.gameEnded && (
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
      open={endGameConfirmOpen}
      title="Kết thúc trò chơi"
      message="Bạn có chắc chắn muốn kết thúc trò chơi ngay bây giờ? Hành động này sẽ dừng trò chơi và hiển thị vai trò của tất cả người chơi."
      confirmText="Kết thúc"
      cancelText="Hủy"
      onConfirm={handleEndGameConfirm}
      onCancel={() => setEndGameConfirmOpen(false)}
    />

    </div>
  );
}
