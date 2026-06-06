

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { socket, clientId } from "../socket";
import { useLocation, useNavigate } from "react-router-dom";
import { useRoomContext } from "../context/RoomContext";
import PlayerPositions from "../components/PlayerPositions";
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
import { useDietQuyRole } from "./gameRoles/useDietQuyRole";
import { ScoreboardModal } from "../components/ScoreboardModal";
import RoleCard3D from "../components/RoleCard3D";
import Masonry from "../components/Masonry";
import nenLungAsset from "../assets/nền lưng.avif";
import { gsap } from "gsap";
import DecryptedText from "../components/DecryptedText";
import medalSvg from "../assets/medal.svg";
// import PhaseTransitionOverlay from "../components/PhaseTransitionOverlay";
import GridMotionOverlay from "../components/GridMotionOverlay";
import RoleCompanionOverlay from "../components/RoleCompanionOverlay";


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
const HUNTER_BULLET_ANIM_MS = 1000;
type TargetRoleDisplayOrder = "player-role" | "role-player";

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
  const isPositionEditor = !!room?.positionEditors?.includes(clientId);
  const canControlTrialFlow = isHost || isPositionEditor;
  const isCurrentPlayerDead = !!clientId && deadPlayers.includes(clientId);
  const isCurrentPlayerHiddenRevived = sync.angelReviveState.reviveStage === "hidden";
  const isCurrentPlayerDeadForNightActions = isCurrentPlayerDead && !isCurrentPlayerHiddenRevived;
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
  const [endGameConfirmOpen, setEndGameConfirmOpen] = useState(false);
  const [scoreboardOpen, setScoreboardOpen] = useState(false);
  const [hostPlayerActionTargetId, setHostPlayerActionTargetId] = useState<string | null>(null);
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

  // States và Effect cho chuyển cảnh pha Cinematic Đêm / Ngày bằng GSAP (Tạm ẩn)
  // const [transitionActive, setTransitionActive] = useState(false);
  // const [transitionPhase, setTransitionPhase] = useState<any>("dusk");
  // const [transitionNumber, setTransitionNumber] = useState(0);

  // const lastPhaseRef = useRef<any>(null);
  // const lastNumberRef = useRef<number>(0);

  // States và Effect cho chuyển cảnh pha Hoàng Hôn (GridMotion) khi mới vào game
  const [duskTransitionActive, setDuskTransitionActive] = useState(false);
  const [lowPerformanceMode, setLowPerformanceMode] = useState(false); // Tự động tắt chế độ hiệu năng thấp trên thiết bị yếu hoặc khi debugAnim=true
  const [isAnimatingLeaf, setIsAnimatingLeaf] = useState(false);
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
        // hasChosen is false!
        if (prevPhaseRef.current === "dusk") {
          // Re-entering dusk from dusk without a chosen card (Restart clicked!)
          const container = document.querySelector(".float-up-container");
          if (container) {
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
          // First time entering dusk from lobby/other phase (and no card chosen yet)
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

  /* ==========================================================================
     [HIỆU ỨNG GridMotion CHUYỂN CẢNH HOÀNG HÔN (DUSK TRANSITION)]
     Bạn có thể chuyển đổi giữa các bản bằng cách comment / uncomment.
     ========================================================================== */

  /* BẢN TỐI ƯU CỰC CAO (Smooth tuyệt đối: che giao diện bên dưới cho đến khi GridMotion che phủ hoàn toàn rồi mới hiện) */
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

  /* BẢN GỐC CHƯA TỐI ƯU (Sẽ bị chớp giao diện trước khi GridMotion che phủ)
  useEffect(() => {
    if (phase === "dusk") {
      if (!duskPlayedRef.current) {
        setDuskTransitionActive(true);
        duskPlayedRef.current = true;
      }
    } else {
      duskPlayedRef.current = false;
    }
  }, [phase]);
  */

  // useEffect(() => {
  //   if (phase === "dusk") {
  //     lastPhaseRef.current = phase;
  //     return;
  //   }
  //   const nightCount = room?.nightCount ?? 0;
  //   // Chỉ kích hoạt hiệu ứng khi pha thực sự thay đổi trong thời gian thực (tránh chạy khi mới tải trang)
  //   if (phase !== lastPhaseRef.current || nightCount !== lastNumberRef.current) {
  //     if (lastPhaseRef.current !== null) {
  //       setTransitionPhase(phase);
  //       setTransitionNumber(nightCount);
  //       setTransitionActive(true);
  //     }
  //     lastPhaseRef.current = phase;
  //     lastNumberRef.current = nightCount;
  //   }
  // }, [phase, room?.nightCount]);

  const showNotice = useCallback((title: string, message: string, onConfirm?: () => void) => {
    setNoticeModal({ title, message, onConfirm });
  }, []);

  useEffect(() => {
    setTargetRoleDisplayOrderByPlayerId({});
  }, [roomId]);

  // State for highlighting player from log click
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

  // During dusk, log stays hidden to everyone.
  const canViewLog = room?.isReplay === true || (!isDusk && (isHost || phase === "day" || !!sync.gameEnded));
  const canViewRoles = isHost || !!sync.gameEnded;

  useEffect(() => {
    if (phase !== "night") return;
    if (allNightActionsSimultaneous) return;
    if (!currentNightTurnRole) return;
    if (!nightTurnDeadline) return;
    if (nightTurnPaused) return;
    setNightTurnNow(Date.now() + serverTimeOffset);
    const t = setInterval(() => setNightTurnNow(Date.now() + serverTimeOffset), 1000);
    return () => clearInterval(t);
  }, [allNightActionsSimultaneous, currentNightTurnRole, nightTurnDeadline, nightTurnPaused, phase, serverTimeOffset]);

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
    if (!baseWolfDeadline) return null;
    return baseWolfDeadline + myNightActionExtraMs;
  }, [baseWolfDeadline, isSimultaneousNight, myNightActionExtraMs]);

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

  useEffect(() => {
    if (!isSimultaneousNight) return;
    if (!mySimultaneousDeadline) return;
    if (nightTurnPaused) return;
    setNightTurnNow(Date.now() + serverTimeOffset);
    const t = setInterval(() => setNightTurnNow(Date.now() + serverTimeOffset), 1000);
    return () => clearInterval(t);
  }, [isSimultaneousNight, mySimultaneousDeadline, nightTurnPaused, serverTimeOffset]);

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
      if (!mySimultaneousDeadline) return false;
      return simultaneousRemainingSec !== null && simultaneousRemainingSec <= 0;
    }
  }, [phase, sync.gameEnded, isSequentialNight, doesNightTurnMatchMyRole, nightTurnRemainingSec, mySimultaneousDeadline, simultaneousRemainingSec]);

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
    // Fallback request (server also broadcasts on gameEnded).
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

  const logPanel = canViewLog ? (
    <GameLogPanel
      nights={sync.gameLogNights || []}
      rolesByPlayerId={sync.revealedRolesByPlayerId || {}}
      playerNamesById={playerNamesById}
      targetRoleDisplayOrderByPlayerId={targetRoleDisplayOrderByPlayerId}
      onHighlightPlayer={handleLogHighlightPlayer}
      canViewNightLogs={isHost || !!sync.gameEnded || room?.isReplay === true}
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

  // Cinematic beat: quick burst -> ~1s slow-mo -> quick finish.
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

  /* ==========================================================================
     [HOẠT ẢNH PHÁT BẮN (HUNTER SHOT & LOVE ARROW ANIMATIONS)]
     Bạn có thể chuyển đổi giữa 2 bản dưới đây bằng cách comment / uncomment.
     ========================================================================== */

  /* BẢN GỐC CHƯA TỐI ƯU (Bị lặp lại hoạt ảnh phát bắn khi đổi phase ngày/đêm) */
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

  /* BẢN TỐI ƯU (Bảo vệ dùng ref chống lặp lại hoạt ảnh khi đổi phase ngày/đêm)
  const lastPlayedHunterShotSeqRef = useRef<number>(0);
  const lastPlayedLoveArrowShotSeqRef = useRef<number>(0);

  useEffect(() => {
    const shot = sync.hunterShot;
    if (!shot?.hunterId || !shot?.targetId) return;

    if (lastPlayedHunterShotSeqRef.current !== sync.hunterShotSeq) {
      lastPlayedHunterShotSeqRef.current = sync.hunterShotSeq;

      if (phase === "day" && !shouldRevealHunterShotInDay) return;

      lastHunterShotRef.current = { hunterId: shot.hunterId, targetId: shot.targetId };
      const frame = window.requestAnimationFrame(() => {
        playHunterShotAnim(shot.hunterId, shot.targetId);
      });
      return () => window.cancelAnimationFrame(frame);
    }
  }, [phase, playHunterShotAnim, shouldRevealHunterShotInDay, sync.hunterShot, sync.hunterShotSeq]);

  useEffect(() => {
    const shot = sync.loveArrowShot;
    if (!shot?.cupidId || !shot?.targetId) return;

    if (lastPlayedLoveArrowShotSeqRef.current !== sync.loveArrowShotSeq) {
      lastPlayedLoveArrowShotSeqRef.current = sync.loveArrowShotSeq;

      const frame = window.requestAnimationFrame(() => {
        playHunterShotAnim(shot.cupidId, shot.targetId, {
          assetSrc: encodeURI("/Mũi tên.svg"),
          alt: "Mũi tên",
          rotationOffsetDeg: -45,
          kind: "love",
        });
      });
      return () => window.cancelAnimationFrame(frame);
    }
  }, [playHunterShotAnim, sync.loveArrowShot, sync.loveArrowShotSeq]);
  */

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
    seerResult: sync.seerResult,
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
    serverTimeOffset,
  });

  const angel = useAngelRole({
    roomId,
    phase,
    role,
    room: roomForRoles,
    deadPlayers,
    angelState: sync.angelReviveState,
  });

  const [dietQuyNightDirection, setDietQuyNightDirection] = useState<"clockwise" | "counter_clockwise">("clockwise");
  const [dietQuyNightStartPlayerId, setDietQuyNightStartPlayerId] = useState<string | null>(null);
  const [slayerSelectMode, setSlayerSelectMode] = useState(false);
  const [slayerTargetId, setSlayerTargetId] = useState<string | null>(null);
  const [showSlayerConfirm, setShowSlayerConfirm] = useState(false);

  const dietQuy = useDietQuyRole({
    roomId,
    phase,
    role,
    room: roomForRoles,
    deadPlayers: deadPlayersForNightActions,
  });

  const confirmSlayerAction = () => {
    if (!roomId || !slayerTargetId) return;
    socket.emit("dietQuySlayerAbility", { roomId, targetId: slayerTargetId });
    setSlayerSelectMode(false);
    setSlayerTargetId(null);
    setShowSlayerConfirm(false);
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

    if (roomForDisplay?.gameMode === "diet_quy") {
      const extraBadges: Record<string, string> = {};
      const myId = clientId;
      if (myId) {
        if (role === "Đầu bếp" && dietQuy.chefInfo !== null) {
          extraBadges[myId] = `Đầu bếp (${dietQuy.chefInfo})`;
        }
        if (role === "Đồng cảm" && dietQuy.empathInfo !== null) {
          extraBadges[myId] = `Đồng cảm (${dietQuy.empathInfo})`;
        }
        if (role === "Chôn cất" && dietQuy.undertakerInfo && roomForDisplay.dietQuyExecutedPlayerId) {
          extraBadges[roomForDisplay.dietQuyExecutedPlayerId] = dietQuy.undertakerInfo;
        }
        if (role === "Nuôi quạ" && dietQuy.ravenkeeperResult && roomForDisplay.dietQuyRavenkeeperTargetId) {
          extraBadges[roomForDisplay.dietQuyRavenkeeperTargetId] = dietQuy.ravenkeeperResult;
        }
      }
      return { ...publicRoleBadges, ...extraBadges };
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
  }, [canViewRoles, currentNightTurnRole, isBanSoiAligned, isHost, isSequentialNight, roomForDisplay?.publicRevealedRolesByPlayerId, sync.gameEnded, sync.revealedRolesByPlayerId, visibleLoveRoleBadges, roomForDisplay?.gameMode, role, dietQuy.chefInfo, dietQuy.empathInfo, dietQuy.undertakerInfo, dietQuy.ravenkeeperResult, roomForDisplay?.dietQuyExecutedPlayerId, roomForDisplay?.dietQuyRavenkeeperTargetId]);

  const isLocalPlayerAbleToAct = useMemo(() => {
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

  // Note: all socket subscriptions are centralized in useGameSocketSync.

  useEffect(() => {
    // Khi host rời khi game đang diễn ra
    const handleHostDisconnected = () => {
      setHostDisconnected(true);
      showNotice(
        "Thông báo",
        "Quản trò đã rời đi. Bạn có thể chờ quản trò quay lại hoặc thoát khỏi phòng."
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
    if (room?.gameMode === "diet_quy") {
      if (slayerSelectMode) {
        if (deadPlayers.includes(playerId)) return;
        setSlayerTargetId(playerId);
        setShowSlayerConfirm(true);
        return;
      }
      if (dietQuy.onPlayerClick(playerId)) return;
    }
    if (angel.onPlayerClick(playerId)) return;
    // Nếu người chơi đã chết thì không được chọn họ nữa
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
    !isHost &&
    !!role &&
    (!!sync.gameEnded ||
      (!shouldBlockDeadNightRoleReveal &&
        !isNightActionTimeExpired &&
        (isRoleRevealLimitedToCurrentNightTurn ? doesNightTurnMatchMyRole : !shouldHidePlayerRoleText)));

  const [cardFlippedToFront, setCardFlippedToFront] = useState(false);

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
    // Khi vai trò thực sự thay đổi (chia bài lại), tự động lật úp lá bài xuống mặt sau
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

  // Guard clause: Nếu chưa tải xong dữ liệu phòng (room = null) khi F5/reload,
  // chỉ hiển thị màn hình nền tối tĩnh để tránh chớp trắng hoặc chớp giao diện phase dusk.
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
      >
        {/* Màn hình nền tối tuyệt đối bảo vệ thị giác, khớp 100% với màu nền index.html */}
      </div>
    );
  }

  // Giao diện game chỉ hiển thị khi đã bắt đầu được phủ hoàn toàn bởi GridMotionOverlay
  const isDuskTransitionPending = room?.phase === "dusk" && !duskRevealGameUI;
  const gameUIOpacity = isDuskTransitionPending ? 0 : 1;
  const gameUIPointerEvents = isDuskTransitionPending ? "none" : "auto";

  return (
    <div 
      className={`page-shell game-page${shouldShowRolePortrait ? " has-role-portrait" : ""}`} 
      style={{ 
        padding: "1.25rem",
        opacity: gameUIOpacity,
        transition: "opacity 0.4s ease-in-out",
        pointerEvents: gameUIPointerEvents
        /* height: "100dvh", overflow: "hidden" */ 
      }}
    >
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
              zIndex: 9997,
              pointerEvents: "none",
              borderRadius: 0,
              animation: "villageChiefDyingFramePulse 1400ms ease-in-out infinite",
            }}
          />
        </>
      )}
      {!room && (
        <p>
          Hình như có gì đó sai sai... Lẽ ra bạn không nên thấy được những dòng này
        </p>
      )}

      {!isHost && (
        <h2>
          Vai trò của bạn là:{" "}
          {cardFlippedToFront && role ? (
            <DecryptedText
              text={role}
              speed={40}
              maxIterations={8}
              sequential
              animateOn="view"
              className="revealed"
              encryptedClassName="encrypted"
            />
          ) : (
            <span className="encrypted">********</span>
          )}
        </h2>
      )}
      
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
              <style>{`
                @keyframes gentleBob {
                  0% {
                    transform: translateY(0px) rotate(-45deg);
                  }
                  50% {
                    transform: translateY(2.5px) rotate(-45deg);
                  }
                  100% {
                    transform: translateY(0px) rotate(-45deg);
                  }
                }
                @keyframes leaf3DFly {
                  0% {
                    transform: translateY(0) rotateY(0deg) rotate(-45deg);
                  }
                  50% {
                    transform: translateY(-4dvh) rotateY(-360deg) rotate(-45deg);
                  }
                  100% {
                    transform: translateY(0) rotateY(0deg) rotate(-45deg);
                  }
                }
              `}</style>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-start", gap: "12px" }}>
                <h1>🌥️ Hoàng hôn</h1>
              <div
                role="button"
                tabIndex={0}
                onClick={() => {
                  setLowPerformanceMode(p => !p);
                  setIsAnimatingLeaf(true);
                }}
                title="Tối ưu hiệu năng di động"
                style={{
                  background: "transparent",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "8px",
                  borderRadius: "50%",
                  transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
                  backgroundColor: lowPerformanceMode ? "rgba(16, 185, 129, 0.2)" : "rgba(255, 255, 255, 0.05)",
                  boxShadow: lowPerformanceMode ? "0 0 15px rgba(16, 185, 129, 0.5), inset 0 0 8px rgba(16, 185, 129, 0.3)" : "none",
                  border: lowPerformanceMode ? "1px solid rgba(16, 185, 129, 0.5)" : "1px solid rgba(255, 255, 255, 0.1)",
                  outline: "none",
                  userSelect: "none",
                  perspective: "400px",
                }}
              >
                  <svg
                    height="22"
                    viewBox="0 0 30 30"
                    width="22"
                    xmlns="http://www.w3.org/2000/svg"
                    style={{
                      transform: "translateY(0px) rotate(-45deg)",
                      display: "block",
                      filter: lowPerformanceMode ? "drop-shadow(0 0 6px rgba(16, 185, 129, 0.8))" : "none",
                      transition: "all 0.3s ease",
                      animation: isAnimatingLeaf
                        ? "leaf3DFly 1.2s cubic-bezier(0.25, 1, 0.5, 1) forwards"
                        : (lowPerformanceMode ? "gentleBob 3.5s ease-in-out infinite" : "none"),
                      transformStyle: "preserve-3d",
                    }}
                    onAnimationEnd={() => setIsAnimatingLeaf(false)}
                  >
                    <g fill="none" fillRule="evenodd">
                      <g transform="translate(-450 -44)">
                        <g transform="translate(449 40)">
                          <path
                            d="m23.6927469 29.6472387c2.6828915-2.2634443 4.2921773-5.3077228 4.2921773-9.0321629 0-.8160058-.0940967-1.6579238-.2767828-2.5232792-.6251216-2.9611024-2.2514506-6.099632-4.5695216-9.27172914-1.0509363-1.43812332-2.1759983-2.78819777-3.3012368-4.01214133-.3940924-.42866192-.7603031-.81118168-1.0893806-1.14273337-.1985344-.20002717-.3413556-.33934047-.4192058-.41309334-.1928481-.18269821-.4948966-.18269821-.6877447 0-.0778502.07375287-.2206714.21306617-.4192059.41309334-.3290774.33155169-.6952882.71407145-1.0893806 1.14273337-1.1252384 1.22394356-2.2503004 2.57401801-3.3012367 4.01214133-2.318071 3.17209714-3.94439999 6.31062674-4.5695216 9.27172914-.18268615.8653554-.27678286 1.7072734-.27678286 2.5232792 0 3.7244401 1.60928585 6.7687186 4.29217726 9.0321629 1.9448996 1.6408312 4.4617414 2.7678371 5.7078227 2.7678371 1.2460814 0 3.7629231-1.1270059 5.7078227-2.7678371z"
                            fill={lowPerformanceMode ? "#4caf50" : "none"}
                            stroke="#4caf50"
                            strokeWidth={lowPerformanceMode ? "0" : "1.8"}
                            transform="matrix(.707 .707 -.707 .707 17.829 -7.514)"
                            style={{ transition: "fill 0.3s ease, stroke-width 0.3s ease" }}
                          />
                          <path
                            d="m12.9943854 22.0490888-3.1450267-3.1450267c-.20305299-.203053-.51326456-.1966821-.7085267-.0014199-.18955158.1895515-.19515261.5119541.00024466.7073514l3.85330874 3.8533087v10.7923818c0 .2764249.2319336.5005115.5.5005115.2761424 0 .5-.2269016.5-.5005115v-10.7923818l3.8533087-3.8533087c.1971842-.1971842.1955068-.5120893.0002447-.7073514-.1895516-.1895516-.5124804-.1946265-.7085267.0014199l-3.1450267 3.1450267v-5.5857865l1.8531998-1.8531998c.1926722-.1926721.1956157-.5121982.0003536-.7074603-.1895516-.1895516-.5095255-.1975813-.7019268-.00518l-1.1516266 1.1516266v-4.7935088c0-.283258-.2238576-.49938444-.5-.49938444-.2680664 0-.5.22358205-.5.49938444v4.7935088l-1.1516266-1.1516266c-.1914368-.1914368-.5066647-.1900822-.7019268.00518-.1895516-.1895515-.1951039.5120029.0003535.7074603l1.8531999 1.8531998z"
                            fill="#607d8b"
                            transform="matrix(.707 .707 -.707 .707 19.69 -3.024)"
                          />
                        </g>
                      </g>
                    </g>
                  </svg>
              </div>
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
                      <div className="float-up-container">
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
          ) : phase === "day" ? (
            <h1>🌞 Ngày {displayNightNumber}</h1>
          ) : (
            <h1>🌙 Đêm {displayNightNumber}</h1>
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

      {isSequentialNight && currentNightTurnRole && !isHost && !isCurrentPlayerDeadForNightActions && doesNightTurnMatchMyRole && nightTurnRemainingSec !== null && !sync.gameEnded && room?.gameMode !== "diet_quy" && (
        <div style={{ marginTop: 8, fontWeight: 700 }}>
          Còn {nightTurnRemainingSec}s nữa để thực hiện chức năng{nightTurnPaused ? " (đang tạm ngưng)" : ""}
        </div>
      )}

      {isSimultaneousNight && !isHost && !isCurrentPlayerDeadForNightActions && !isWolfTeamRole && role && mySimultaneousDeadline && simultaneousRemainingSec !== null && !sync.gameEnded && room?.gameMode !== "diet_quy" && (
        <div style={{ marginTop: 8, fontWeight: 700 }}>
          Còn {simultaneousRemainingSec}s nữa để thực hiện chức năng
        </div>
      )}

      {room?.gameMode === "diet_quy" && phase === "night" && room.nightTurnPlayerId && (
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
          🌙 Lượt của: <span style={{ color: "var(--accent)", textShadow: "0 0 8px var(--accent)" }}>{room.players.find((p: any) => p.id === room.nightTurnPlayerId)?.name || "Người chơi"}</span>
          {(isHost || room.nightTurnPlayerId === clientId) && room.nightTurnRole && ` (${room.nightTurnRole})`}
        </div>
      )}

      {room?.gameMode === "diet_quy" && (
        <div style={{
          display: "flex",
          flexDirection: "column",
          gap: 10,
          maxWidth: 500,
          margin: "15px auto",
          textAlign: "left"
        }}>
          {/* Chef info */}
          {role === "Đầu bếp" && dietQuy.chefInfo !== null && (
            <div style={{
              background: "rgba(52, 152, 219, 0.15)",
              border: "1px solid rgba(52, 152, 219, 0.3)",
              padding: 12,
              borderRadius: 8,
              color: "#fff"
            }}>
              👨‍🍳 <b>Thông tin Đầu bếp:</b> Có <b>{dietQuy.chefInfo}</b> cặp người chơi phe ác ngồi cạnh nhau.
            </div>
          )}

          {/* Empath info */}
          {role === "Đồng cảm" && dietQuy.empathInfo !== null && (
            <div style={{
              background: "rgba(52, 152, 219, 0.15)",
              border: "1px solid rgba(52, 152, 219, 0.3)",
              padding: 12,
              borderRadius: 8,
              color: "#fff"
            }}>
              👁️ <b>Thông tin Đồng cảm:</b> Có <b>{dietQuy.empathInfo}</b> người ngồi cạnh là phe ác.
            </div>
          )}

          {/* Undertaker info */}
          {role === "Chôn cất" && dietQuy.undertakerInfo !== null && (
            <div style={{
              background: "rgba(52, 152, 219, 0.15)",
              border: "1px solid rgba(52, 152, 219, 0.3)",
              padding: 12,
              borderRadius: 8,
              color: "#fff"
            }}>
              ⚰️ <b>Thông tin Chôn cất:</b> Người bị treo cổ hôm nay có vai trò thực sự là <b>{dietQuy.undertakerInfo}</b>.
            </div>
          )}

          {/* Washerwoman info */}
          {role === "Thợ giặt" && dietQuy.washerwomanInfo && (
            <div style={{
              background: "rgba(52, 152, 219, 0.15)",
              border: "1px solid rgba(52, 152, 219, 0.3)",
              padding: 12,
              borderRadius: 8,
              color: "#fff"
            }}>
              🧺 <b>Thông tin Thợ giặt:</b> Một trong hai người chơi <b>{dietQuy.washerwomanInfo.targetIds.map(id => room.players.find(p => p.id === id)?.name || id).join(" hoặc ")}</b> có vai trò là <b>{dietQuy.washerwomanInfo.townsfolkRole}</b>.
            </div>
          )}

          {/* Librarian info */}
          {role === "Thủ thư" && dietQuy.librarianInfo && (
            <div style={{
              background: "rgba(52, 152, 219, 0.15)",
              border: "1px solid rgba(52, 152, 219, 0.3)",
              padding: 12,
              borderRadius: 8,
              color: "#fff"
            }}>
              📖 <b>Thông tin Thủ thư:</b> Một trong hai người chơi <b>{dietQuy.librarianInfo.targetIds.map(id => room.players.find(p => p.id === id)?.name || id).join(" hoặc ")}</b> có vai trò là <b>{dietQuy.librarianInfo.role}</b>.
            </div>
          )}

          {/* Investigator info */}
          {role === "Điều tra viên" && dietQuy.investigatorInfo && (
            <div style={{
              background: "rgba(52, 152, 219, 0.15)",
              border: "1px solid rgba(52, 152, 219, 0.3)",
              padding: 12,
              borderRadius: 8,
              color: "#fff"
            }}>
              🕵️‍♂️ <b>Thông tin Điều tra viên:</b> Một trong hai người chơi <b>{dietQuy.investigatorInfo.targetIds.map(id => room.players.find(p => p.id === id)?.name || id).join(" hoặc ")}</b> có vai trò là Tay sai <b>{dietQuy.investigatorInfo.minionRole}</b>.
            </div>
          )}

          {/* Fortune Teller result */}
          {role === "Thầy bói" && dietQuy.fortuneTellerResult !== null && (
            <div style={{
              background: "rgba(52, 152, 219, 0.15)",
              border: "1px solid rgba(52, 152, 219, 0.3)",
              padding: 12,
              borderRadius: 8,
              color: "#fff"
            }}>
              🔮 <b>Thông tin Thầy bói:</b> {dietQuy.fortuneTellerResult === "yes" ? "✅ Có ít nhất một người là Quỷ (hoặc Red Charm) trong 2 người bạn đã kiểm tra." : "❌ Không có ai là Quỷ (hoặc Red Charm) trong 2 người bạn đã kiểm tra."}
            </div>
          )}

          {/* Ravenkeeper result */}
          {role === "Nuôi quạ" && dietQuy.ravenkeeperResult !== null && (
            <div style={{
              background: "rgba(52, 152, 219, 0.15)",
              border: "1px solid rgba(52, 152, 219, 0.3)",
              padding: 12,
              borderRadius: 8,
              color: "#fff"
            }}>
              🐦 <b>Thông tin Nuôi quạ:</b> Người chơi bạn chọn có vai trò thực sự là <b>{dietQuy.ravenkeeperResult}</b>.
            </div>
          )}
        </div>
      )}

      {room?.gameMode === "diet_quy" && phase === "day" && role === "Diệt quỷ" && !isCurrentPlayerDead && !room?.dietQuySlayerUsed && (
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

      {isHost && room?.gameMode === "diet_quy" && (phase === "day" || phase === "dusk") && !sync.gameEnded && (
        <div style={{
          background: "var(--surface-muted)",
          padding: 16,
          borderRadius: 12,
          border: "1px solid var(--accent)",
          marginTop: 15,
          color: "#fff",
          maxWidth: 400,
          margin: "15px auto"
        }}>
          <h3>⚙️ Cấu hình đêm Diệt Quỷ</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, margin: "10px 0", textAlign: "left" }}>
            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span>Chiều đi đêm:</span>
              <select
                value={dietQuyNightDirection}
                onChange={(e) => setDietQuyNightDirection(e.target.value as "clockwise" | "counter_clockwise")}
                style={{
                  padding: "6px 12px",
                  borderRadius: 8,
                  background: "#1a1f26",
                  color: "#fff",
                  border: "1px solid var(--border-strong)"
                }}
              >
                <option value="clockwise">Theo chiều kim đồng hồ ➡️</option>
                <option value="counter_clockwise">Ngược chiều kim đồng hồ ⬅️</option>
              </select>
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span>Người bắt đầu đi đêm:</span>
              <select
                value={dietQuyNightStartPlayerId || ""}
                onChange={(e) => setDietQuyNightStartPlayerId(e.target.value || null)}
                style={{
                  padding: "6px 12px",
                  borderRadius: 8,
                  background: "#1a1f26",
                  color: "#fff",
                  border: "1px solid var(--border-strong)"
                }}
              >
                <option value="">-- Chọn người bắt đầu (Ngẫu nhiên) --</option>
                {room.players.map(p => (
                  <option key={p.id} value={p.id}>{p.name} {deadPlayers.includes(p.id) ? "(Chết)" : "(Sống)"}</option>
                ))}
              </select>
            </label>
          </div>
          <button
            onClick={() => {
              socket.emit("changePhase", {
                roomId,
                phase: "night",
                dietQuyNightDirection,
                dietQuyNightStartPlayerId
              });
            }}
            style={{
              width: "100%",
              padding: "10px",
              background: "var(--accent)",
              border: "none",
              color: "#fff",
              borderRadius: 8,
              cursor: "pointer",
              fontWeight: 700
            }}
          >
            🌙 Bắt đầu đêm Diệt Quỷ
          </button>
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
      {angel.panel}
      {room?.gameMode === "diet_quy" && !sync.gameEnded && dietQuy.panel}
      <ConfirmModal
        open={showSlayerConfirm && !!slayerTargetId}
        title="Xác nhận bắn"
        message={`Bạn chắc chắn muốn sử dụng kỹ năng bắn vào ${room?.players.find((p: any) => p.id === slayerTargetId)?.name}? (Kỹ năng chỉ sử dụng ĐƯỢC 1 LẦN duy nhất cả game)`}
        onConfirm={confirmSlayerAction}
        onCancel={() => {
          setShowSlayerConfirm(false);
          setSlayerTargetId(null);
        }}
      />
      {/* Hiển thị bố cục vị trí người chơi khi có room.positions */}
      {roomForDisplay?.positions && phase !== "dusk" && (() => {
        const activeReplayEvent = roomForDisplay?.isReplay && roomForDisplay?.replayEvents && roomForDisplay?.replayIndex !== undefined
          ? roomForDisplay.replayEvents[roomForDisplay.replayIndex - 1]
          : null;
        const replayActorIds = activeReplayEvent?.actorIds || [];
        const replayTargetIds = activeReplayEvent?.targetIds || [];

        return (
          <>
            <div style={{ margin: "2rem auto" }}>
              <PlayerPositions
                mode="view"
                roomOverride={roomForDisplay}
                showActionGlow={showActionGlow}
                onPlayerClick={handlePlayerClick}
                onPlayerDoubleClick={handlePlayerDoubleClick}
                seerResult={isSeerTurnActive ? seer.seerResult : null}
                deadPlayersOverride={deadPlayersOverrideForRender}
                bulletAnimation={hunterBulletAnim}
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
                  (roomForDisplay?.gameMode === "diet_quy" ? dietQuy.playerPositionsProps.selectedOutlinePlayerId : null) ||
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
                }
                dietQuyOrangeHighlightPlayerIds={roomForDisplay?.gameMode === "diet_quy" ? dietQuy.playerPositionsProps.dietQuyOrangeHighlightPlayerIds : undefined}
                dietQuyRedHighlightPlayerIds={roomForDisplay?.gameMode === "diet_quy" ? dietQuy.playerPositionsProps.dietQuyRedHighlightPlayerIds : undefined}
                selectedOutlinePlayerIds={(wolf.playerPositionsProps.selectedOutlinePlayerIds || []).filter(
                  (id): id is string => !!id
                )}
                dangerPlayerIds={Array.from(new Set([
                  ...(witch.playerPositionsProps.dangerPlayerIds || []),
                  ...dangerHighlightPlayerIds,
                ]))}
                showWolfVoteBadges={dayVote.playerPositionsProps.showWolfVoteBadges || wolf.playerPositionsProps.showWolfVoteBadges}
                wolfVoteVoterIds={
                  dayVote.playerPositionsProps.showWolfVoteBadges
                    ? dayVote.playerPositionsProps.wolfVoteVoterIds
                    : wolf.playerPositionsProps.wolfVoteVoterIds
                }
                voteWeightsByVoterId={dayVote.playerPositionsProps.showWolfVoteBadges ? dayVoteWeightsByVoterId : undefined}
                showWolfBadges={wolf.playerPositionsProps.showWolfBadges}
                wolfBadgePlayerIds={wolf.playerPositionsProps.wolfBadgePlayerIds}
                wolfBadgeRoles={wolf.playerPositionsProps.wolfBadgeRoles}
                cheesePlayerIds={sync.merchantCheeseMarkPlayerIds}
                trialOrangePlayerId={dayVote.playerPositionsProps.trialOrangePlayerId}
                trialWhitePlayerIds={dayVote.playerPositionsProps.trialWhitePlayerIds}
                trialGreenPlayerId={dayVote.playerPositionsProps.trialGreenPlayerId}
                replayActorIds={replayActorIds}
                replayTargetIds={replayTargetIds}
              />
            </div>
            <RoleCharacterPortrait
              role={shouldShowRolePortrait ? role : null}
              backgroundAssetOverride={shouldShowRolePortrait ? loveHybridBackgroundAsset : null}
            />
            <RoleCompanionOverlay
              companionRoleSrc={shouldRevealMyRole && !(sync.gameEnded && canViewLog) ? companionRoleSrc : null}
              normalizedRole={normalizedRole}
              playerFrameHeightPx={playerFrameHeightPx}
              seerResult={sync.seerResult}
            />
          </>
        );
      })()}

      {shouldRevealMyRole && !sync.gameEnded && canShowConfirmModals && seer.modal}
      {shouldRevealMyRole && !sync.gameEnded && canShowConfirmModals && cursed.modal}
      {shouldRevealMyRole && !sync.gameEnded && canShowConfirmModals && merchant.modal}
      {shouldRevealMyRole && !sync.gameEnded && canShowConfirmModals && angel.modal}
      {shouldRevealMyRole && !sync.gameEnded && canShowConfirmModals && guardian.modal}
      {shouldRevealMyRole && !sync.gameEnded && canShowConfirmModals && protector.modal}
      {shouldRevealMyRole && !sync.gameEnded && canShowConfirmModals && love.modals}
      {shouldRevealMyRole && !sync.gameEnded && loveActionPlacement === "general" ? love.actionButton : null}

      {shouldRevealMyRole && !sync.gameEnded && canShowConfirmModals && hunter.modal}
      {shouldRevealMyRole && !sync.gameEnded && canShowConfirmModals && elemental.modal}

      {shouldRevealMyRole && !sync.gameEnded && canShowConfirmModals && spiritWolf.modal}

      {shouldRevealMyRole && !sync.gameEnded && (
        <div style={{ display: "flex", gap: 10, alignItems: "flex-start", flexWrap: "wrap" }}>
          {witch.panel}
          {protector.panel}
          {elemental.panel}
          {merchant.panel}
          {loveActionPlacement === "role-actions" ? love.actionButton : null}
        </div>
      )}


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
          <button
            onClick={() => socket.emit("hostToggleNightTurnPause", { roomId })}
            disabled={isSequentialNight ? !currentNightTurnRole : false}
            style={{ opacity: isSequentialNight && !currentNightTurnRole ? 0.6 : 1 }}
          >
            {nightTurnPaused ? "Tiếp tục thời gian" : "Tạm ngưng thời gian"}
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
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start", flexWrap: "wrap" }}>
        {wolf.panel}
        {loveActionPlacement === "wolf" ? love.actionButton : null}
      </div>
    )}
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

    {/* <PhaseTransitionOverlay
      phase={transitionPhase}
      number={transitionNumber}
      active={transitionActive}
      onComplete={() => setTransitionActive(false)}
    /> */}

    {duskTransitionActive && (
      <GridMotionOverlay
        active={duskTransitionActive}
        onComplete={() => setDuskTransitionActive(false)}
      />
    )}

    </div>
  );
}
