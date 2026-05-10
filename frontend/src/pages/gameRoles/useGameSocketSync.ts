import { useEffect, useMemo, useRef, useState } from "react";
import { socket } from "../../socket";
import type {
  GamePhase,
  GameEndedPayload,
  GameLogUpdatedPayload,
  GameLogNight,
  DayLockedUpdatedPayload,
  DayDiscussionStartedPayload,
  DayPhaseStartedPayload,
  DayVoteFinishedPayload,
  DayVotesUpdatedPayload,
  TrialInteractionUpdatedPayload,
  TrialPhaseStartedPayload,
  TrialVerdictFinishedPayload,
  TrialVerdictStartedPayload,
  TrialVotesUpdatedPayload,
  GuardianProtectedPayload,
  HunterShotPayload,
  HunterTargetUpdatedPayload,
  SeerResultPayload,
  RolesRevealUpdatedPayload,
  SpiritWolfDecisionNeededPayload,
  SpiritWolfDecisionRecordedPayload,
  WitchPendingDeathPayload,
  WitchPotionsPayload,
  WolfLockedUpdatedPayload,
  WolfPhaseStartedPayload,
  WolfVotesUpdatedPayload,
  WolfVotes2UpdatedPayload,
  ElementalTargetUpdatedPayload,
  ElementalBuffVoteStatePayload,
  ElementalBuffSelectedPayload,
} from "./socketEvents";
import { ELEMENTAL_BUFF_LABELS, ELEMENTAL_BUFFS } from "../../constants/elemental";

export function useGameSocketSync({
  roomId,
  setRoom,
}: {
  roomId: string | null;
  setRoom: React.Dispatch<React.SetStateAction<any>>;
}) {
  const [phase, setPhase] = useState<GamePhase>("dusk");
  const phaseRef = useRef<GamePhase>("dusk");
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  const [deadPlayers, setDeadPlayers] = useState<string[]>([]);
  const [seerResult, setSeerResult] = useState<SeerResultPayload | null>(null);

  const [witchPendingDeathTargetIds, setWitchPendingDeathTargetIds] = useState<string[]>([]);
  const [witchPotions, setWitchPotions] = useState<WitchPotionsPayload | null>(null);

  const [guardianProtectedSeq, setGuardianProtectedSeq] = useState(0);
  const [guardianProtectedTargetId, setGuardianProtectedTargetId] = useState<string | null>(null);

  const [hunterTargetSeq, setHunterTargetSeq] = useState(0);
  const [hunterTargetId, setHunterTargetId] = useState<string | null>(null);

  const [hunterShotSeq, setHunterShotSeq] = useState(0);
  const [hunterShot, setHunterShot] = useState<HunterShotPayload | null>(null);

  const [wolfLocked, setWolfLocked] = useState<WolfLockedUpdatedPayload | null>(null);
  const [wolfDeadline, setWolfDeadline] = useState<number | null>(null);
  const [wolves, setWolves] = useState<string[]>([]);
  const [activeWolves, setActiveWolves] = useState<string[]>([]);
  const [wolfVotes2, setWolfVotes2] = useState<WolfVotes2UpdatedPayload | null>(null);
  const [wolfMaxTargets, setWolfMaxTargets] = useState<number>(1);

  const [gameEnded, setGameEnded] = useState<GameEndedPayload | null>(null);
  const [spiritWolfDecisionTargetId, setSpiritWolfDecisionTargetId] = useState<string | null>(null);
  const [elementalTargetSeq, setElementalTargetSeq] = useState(0);
  const [elementalTargetId, setElementalTargetId] = useState<string | null>(null);
  const [elementalActionMode, setElementalActionMode] = useState<"guess" | "buff">("guess");
  const [elementalBuffVoteState, setElementalBuffVoteState] = useState<ElementalBuffVoteStatePayload>({
    pendingVote: false,
    quickMode: true,
    selectedBuffId: null,
    availableBuffTier: 0,
  });
  const [elementalBuffResult, setElementalBuffResult] = useState<ElementalBuffSelectedPayload | null>(null);

  const [dayVotes, setDayVotes] = useState<DayVotesUpdatedPayload | null>(null);
  const [dayLocked, setDayLocked] = useState<DayLockedUpdatedPayload | null>(null);
  const [dayDiscussionDeadline, setDayDiscussionDeadline] = useState<number | null>(null);
  const [dayDeadline, setDayDeadline] = useState<number | null>(null);
  const [dayVoters, setDayVoters] = useState<string[]>([]);
  const [dayVoteFinishedSeq, setDayVoteFinishedSeq] = useState(0);
  const [dayVoteFinished, setDayVoteFinished] = useState<DayVoteFinishedPayload | null>(null);

  const [trialTargetId, setTrialTargetId] = useState<string | null>(null);
  const [trialStage, setTrialStage] = useState<"none" | "defense" | "verdict">("none");
  const [trialDefenseDeadline, setTrialDefenseDeadline] = useState<number | null>(null);
  const [trialVerdictDeadline, setTrialVerdictDeadline] = useState<number | null>(null);
  const [trialInteractionCut, setTrialInteractionCut] = useState(false);
  const [trialInteractionActiveIds, setTrialInteractionActiveIds] = useState<string[]>([]);
  const [trialSelectedInteractorId, setTrialSelectedInteractorId] = useState<string | null>(null);
  const [trialSelectedInteractorIds, setTrialSelectedInteractorIds] = useState<string[]>([]);
  const [trialInteractionSelectionLimit, setTrialInteractionSelectionLimit] = useState<number>(0);
  const [trialVotes, setTrialVotes] = useState<TrialVotesUpdatedPayload | null>(null);
  const [trialVerdictFinished, setTrialVerdictFinished] = useState<TrialVerdictFinishedPayload | null>(null);
  const [trialVerdictFinishedSeq, setTrialVerdictFinishedSeq] = useState(0);

  const [gameLogNights, setGameLogNights] = useState<GameLogNight[]>([]);
  const [revealedRolesByPlayerId, setRevealedRolesByPlayerId] = useState<Record<string, string>>({});

  useEffect(() => {
    const syncGameRoom = () => {
      if (!roomId) return;
      socket.emit("getRoom", roomId);
    };

    syncGameRoom();
    socket.on("connect", syncGameRoom);

    const applyPhaseTransition = (newPhase: GamePhase) => {
      setPhase(newPhase);
      setSeerResult(null);
      if (newPhase === "day") {
        setWitchPendingDeathTargetIds([]);
        setSpiritWolfDecisionTargetId(null);
      } else {
        setDayVotes(null);
        setDayLocked(null);
        setDayDiscussionDeadline(null);
        setDayDeadline(null);
        setDayVoters([]);
        setDayVoteFinished(null);
        setTrialTargetId(null);
        setTrialStage("none");
        setTrialDefenseDeadline(null);
        setTrialVerdictDeadline(null);
        setTrialInteractionCut(false);
        setTrialInteractionActiveIds([]);
        setTrialSelectedInteractorId(null);
        setTrialSelectedInteractorIds([]);
        setTrialInteractionSelectionLimit(0);
        setTrialVotes(null);
        setTrialVerdictFinished(null);
      }
      if (newPhase !== "night") {
        setWitchPendingDeathTargetIds([]);
        setSpiritWolfDecisionTargetId(null);
      }
      // hunter selection is per-night; server will also emit reset, but clear locally on phase rotate
      if (newPhase !== "night") {
        setHunterTargetId(null);
      }
      setRoom((prev: any) => (prev ? { ...prev, wolfVotes: undefined } : prev));

      // reset wolf ui state as phase rotates
      if (newPhase === "day") {
        setActiveWolves([]);
      }
      setWolfLocked(null);
      setWolfDeadline(null);
      setWolves([]);
      setWolfVotes2(null);
      setWolfMaxTargets(1);
      setElementalTargetId(null);
      setElementalTargetSeq(0);
      setElementalActionMode("guess");
    };

    const handleRoomUpdated = (data: any) => {
      if (roomId && data?.id && data.id !== roomId) return;
      setRoom((prev: any) => {
        if (!prev) return data;
        return {
          ...data,
          wolfVotes: data?.wolfVotes ?? prev.wolfVotes,
          wolfVotes2: data?.wolfVotes2 ?? prev.wolfVotes2,
          wolfLocked: data?.wolfLocked ?? prev.wolfLocked,
        };
      });
      if (data?.phase === "dusk" || data?.phase === "day" || data?.phase === "night") {
        const nextPhase = data.phase as GamePhase;
        if (phaseRef.current !== nextPhase) {
          phaseRef.current = nextPhase;
          applyPhaseTransition(nextPhase);
        } else {
          setPhase(nextPhase);
        }
      }
      if (Array.isArray(data?.deadPlayers)) {
        setDeadPlayers(data.deadPlayers);
      }
      if (data?.elementalSelectedBuffId && data?.elementalSelectedBuffAppliesNight) {
        const buffId = data.elementalSelectedBuffId as string;
        setElementalBuffResult({
          buffId,
          label: (ELEMENTAL_BUFF_LABELS as Record<string, string>)[buffId] || buffId,
          tier: ELEMENTAL_BUFFS.find((buff) => buff.id === buffId)?.tier || 0,
          appliesNight: data.elementalSelectedBuffAppliesNight,
          randomTieBreak: false,
        });
      }

      if (data?.phase === "day") {
        if (data?.dayVotes && typeof data.dayVotes === "object") {
          setDayVotes(data.dayVotes);
          setRoom((prev: any) => (prev ? { ...prev, wolfVotes: data.dayVotes } : prev));
        }
        if (data?.dayLocked && typeof data.dayLocked === "object") {
          setDayLocked(data.dayLocked);
        }
        if (typeof data?.dayDeadline === "number" || data?.dayDeadline === null) {
          setDayDeadline(data.dayDeadline ?? null);
        }
        if (typeof data?.dayDiscussionDeadline === "number" || data?.dayDiscussionDeadline === null) {
          setDayDiscussionDeadline(data.dayDiscussionDeadline ?? null);
        }
        if (Array.isArray(data?.dayVoters)) {
          setDayVoters(data.dayVoters.filter(Boolean));
        }

        setTrialTargetId(data?.trialTargetId ?? null);
        if (data?.trialStage === "defense" || data?.trialStage === "verdict" || data?.trialStage === "none") {
          setTrialStage(data.trialStage);
        }
        setTrialDefenseDeadline(typeof data?.trialDefenseDeadline === "number" ? data.trialDefenseDeadline : null);
        setTrialVerdictDeadline(typeof data?.trialVerdictDeadline === "number" ? data.trialVerdictDeadline : null);
        setTrialInteractionCut(!!data?.trialInteractionCut);
        setTrialInteractionActiveIds(Array.isArray(data?.trialInteractionActiveIds) ? data.trialInteractionActiveIds.filter(Boolean) : []);
        setTrialSelectedInteractorId(data?.trialSelectedInteractorId ?? null);
        setTrialSelectedInteractorIds(Array.isArray(data?.trialSelectedInteractorIds) ? data.trialSelectedInteractorIds.filter(Boolean) : []);
        setTrialInteractionSelectionLimit(typeof data?.trialInteractionSelectionLimit === "number" ? data.trialInteractionSelectionLimit : 0);
        if (data?.trialVotes && typeof data.trialVotes === "object") {
          setTrialVotes(data.trialVotes);
        }
      }
    };

    const handlePositionsUpdated = (positions: any) => {
      setRoom((prev: any) => (prev ? { ...prev, positions } : prev));
    };

    const handlePhaseChanged = (newPhase: GamePhase) => {
      phaseRef.current = newPhase;
      applyPhaseTransition(newPhase);
    };

    const handleGameStarted = () => {
      setGameEnded(null);
      setSpiritWolfDecisionTargetId(null);
      setSeerResult(null);
      setWitchPendingDeathTargetIds([]);
      setDeadPlayers([]);
      setGameLogNights([]);
      setRevealedRolesByPlayerId({});
      setDayVotes(null);
      setDayLocked(null);
      setDayDiscussionDeadline(null);
      setDayDeadline(null);
      setDayVoters([]);
      setDayVoteFinished(null);
      setDayVoteFinishedSeq(0);
      setTrialTargetId(null);
      setTrialStage("none");
      setTrialDefenseDeadline(null);
      setTrialVerdictDeadline(null);
      setTrialInteractionCut(false);
      setTrialInteractionActiveIds([]);
      setTrialSelectedInteractorId(null);
      setTrialSelectedInteractorIds([]);
      setTrialInteractionSelectionLimit(0);
      setTrialVotes(null);
      setTrialVerdictFinished(null);
      setTrialVerdictFinishedSeq(0);
      setElementalBuffResult(null);
    };

    const handleGameEnded = (payload: GameEndedPayload) => {
      if (!payload?.winner) return;
      setGameEnded(payload);
      // Clear any pending per-role prompts.
      setSpiritWolfDecisionTargetId(null);
    };

    const handleGameLogUpdated = (payload: GameLogUpdatedPayload) => {
      if (!payload?.roomId) return;
      if (roomId && payload.roomId !== roomId) return;
      if (!Array.isArray(payload.nights)) return;
      const sorted = [...payload.nights].sort((a, b) => (a.night || 0) - (b.night || 0));
      setGameLogNights(sorted);
    };

    const handleRolesRevealUpdated = (payload: RolesRevealUpdatedPayload) => {
      if (!payload?.roomId) return;
      if (roomId && payload.roomId !== roomId) return;
      setRevealedRolesByPlayerId(payload.rolesByPlayerId || {});
    };

    const handleSpiritWolfDecisionNeeded = (payload: SpiritWolfDecisionNeededPayload) => {
      setSpiritWolfDecisionTargetId(payload?.targetId ?? null);
    };

    const handleSpiritWolfDecisionRecorded = (_payload: SpiritWolfDecisionRecordedPayload) => {
      setSpiritWolfDecisionTargetId(null);
    };

    const handleElementalTargetUpdated = (payload: ElementalTargetUpdatedPayload) => {
      setElementalTargetId(payload?.targetId ?? null);
      setElementalActionMode(payload?.mode === "buff" ? "buff" : "guess");
      setElementalTargetSeq((s) => s + 1);
    };

    const handleElementalBuffVoteStateUpdated = (payload: ElementalBuffVoteStatePayload) => {
      setElementalBuffVoteState({
        pendingVote: !!payload?.pendingVote,
        quickMode: payload?.quickMode !== false,
        selectedBuffId: payload?.selectedBuffId ?? null,
        availableBuffTier: payload?.availableBuffTier ?? 0,
      });
    };

    const handleElementalBuffSelected = (payload: ElementalBuffSelectedPayload) => {
      setElementalBuffResult(payload);
    };

    const handlePlayerKilled = (playerId: string) => {
      setDeadPlayers(prev => (prev.includes(playerId) ? prev : [...prev, playerId]));
      setRoom((prev: any) => {
        if (!prev) return prev;
        const next = prev.deadPlayers ? prev.deadPlayers : [];
        if (next.includes(playerId)) return prev;
        return { ...prev, deadPlayers: [...next, playerId] };
      });
    };

    const handleWolfVotesUpdated = (votes: WolfVotesUpdatedPayload) => {
      setRoom((prev: any) => (prev ? { ...prev, wolfVotes: votes } : prev));
    };

    const handleWolfVotes2Updated = (votes2: WolfVotes2UpdatedPayload) => {
      setWolfVotes2(votes2);
      setRoom((prev: any) => (prev ? { ...prev, wolfVotes2: votes2 } : prev));
    };

    const handleWolfLockedUpdated = (locked: WolfLockedUpdatedPayload) => {
      setWolfLocked(locked);
    };

    const handleWolfPhaseStarted = ({ wolves, activeWolves, deadline, maxTargets, resetVotes }: WolfPhaseStartedPayload) => {
      setWolves(wolves);
      setActiveWolves(activeWolves || []);
      setWolfDeadline(typeof deadline === "number" ? deadline : null);
      setWolfMaxTargets(typeof maxTargets === "number" ? maxTargets : 1);
      if (resetVotes !== false) {
        setRoom((prev: any) => (prev ? { ...prev, wolfVotes: undefined } : prev));
        setWolfLocked(null);
        setWolfVotes2(null);
        setRoom((prev: any) => (prev ? { ...prev, wolfVotes2: undefined } : prev));
      }
    };

    const handleSeerResult = (payload: SeerResultPayload) => {
      setSeerResult(payload);
    };

    const handleGuardianProtected = (targetId: GuardianProtectedPayload) => {
      setGuardianProtectedTargetId(targetId);
      setGuardianProtectedSeq(s => s + 1);
    };

    const handleWitchPendingDeath = (payload: WitchPendingDeathPayload) => {
      const ids = Array.isArray(payload?.targetIds)
        ? payload!.targetIds!.filter(Boolean)
        : (payload?.targetId ? [payload.targetId] : []);
      setWitchPendingDeathTargetIds(ids);
    };

    const handleWitchPotionsUpdated = (payload: WitchPotionsPayload) => {
      setWitchPotions(payload);
    };

    const handleHunterTargetUpdated = (payload: HunterTargetUpdatedPayload) => {
      setHunterTargetId(payload?.targetId ?? null);
      setHunterTargetSeq(s => s + 1);
    };

    const handleHunterShot = (payload: HunterShotPayload) => {
      if (!payload?.hunterId || !payload?.targetId) return;
      setHunterShot(payload);
      setHunterShotSeq(s => s + 1);
    };

    const handleDayVotesUpdated = (votes: DayVotesUpdatedPayload) => {
      setDayVotes(votes);
      setRoom((prev: any) => (prev ? { ...prev, wolfVotes: votes } : prev));
    };

    const handleDayLockedUpdated = (locked: DayLockedUpdatedPayload) => {
      setDayLocked(locked);
    };

    const handleDayDiscussionStarted = ({ deadline }: DayDiscussionStartedPayload) => {
      setDayDiscussionDeadline(typeof deadline === "number" ? deadline : null);
      setDayVoters([]);
      setDayVotes({});
      setDayLocked({});
      setDayDeadline(null);
      setDayVoteFinished(null);
      setTrialTargetId(null);
      setTrialStage("none");
      setTrialDefenseDeadline(null);
      setTrialVerdictDeadline(null);
      setTrialInteractionCut(false);
      setTrialInteractionActiveIds([]);
      setTrialSelectedInteractorId(null);
      setTrialSelectedInteractorIds([]);
      setTrialInteractionSelectionLimit(0);
      setTrialVotes(null);
      setRoom((prev: any) => (prev ? { ...prev, wolfVotes2: undefined } : prev));
    };

    const handleDayPhaseStarted = ({ voters, deadline }: DayPhaseStartedPayload) => {
      setDayVoters(voters || []);
      setDayDiscussionDeadline(null);
      setDayDeadline(typeof deadline === "number" ? deadline : null);
      setDayVoteFinished(null);
      setTrialTargetId(null);
      setTrialStage("none");
      setTrialDefenseDeadline(null);
      setTrialVerdictDeadline(null);
      setTrialInteractionCut(false);
      setTrialInteractionActiveIds([]);
      setTrialSelectedInteractorId(null);
      setTrialVotes(null);
      setRoom((prev: any) => (prev ? { ...prev, wolfVotes2: undefined } : prev));
    };

    const handleDayVoteFinished = (payload: DayVoteFinishedPayload) => {
      setDayVoteFinished(payload || null);
      setDayVoteFinishedSeq(s => s + 1);
      setDayDeadline(null);
    };

    const handleTrialPhaseStarted = (payload: TrialPhaseStartedPayload) => {
      if (!payload?.targetId) return;
      setTrialTargetId(payload.targetId);
      setTrialStage("defense");
      setTrialDefenseDeadline(typeof payload?.defenseDeadline === "number" ? payload.defenseDeadline : null);
      setTrialVerdictDeadline(null);
      setTrialInteractionCut(false);
      setTrialInteractionActiveIds([]);
      setTrialSelectedInteractorId(null);
      setTrialSelectedInteractorIds([]);
      setTrialInteractionSelectionLimit(2);
      setTrialVotes(null);
      setRoom((prev: any) => (prev ? { ...prev, wolfVotes2: undefined } : prev));
    };

    const handleTrialInteractionUpdated = (payload: TrialInteractionUpdatedPayload) => {
      setTrialInteractionActiveIds(Array.isArray(payload?.activeIds) ? payload.activeIds.filter(Boolean) : []);
      setTrialSelectedInteractorId(payload?.selectedId ?? null);
      setTrialSelectedInteractorIds(Array.isArray(payload?.selectedIds) ? payload.selectedIds.filter(Boolean) : []);
      if (typeof payload?.selectionLimit === "number") {
        setTrialInteractionSelectionLimit(payload.selectionLimit);
      }
      setTrialInteractionCut(!!payload?.interactionCut);
    };

    const handleTrialVerdictStarted = (payload: TrialVerdictStartedPayload) => {
      if (!payload?.targetId) return;
      setTrialTargetId(payload.targetId);
      setTrialStage("verdict");
      setTrialDefenseDeadline(null);
      setTrialVerdictDeadline(typeof payload?.deadline === "number" ? payload.deadline : null);
      setTrialInteractionCut(true);
      setTrialVotes(null);
    };

    const handleTrialVotesUpdated = (payload: TrialVotesUpdatedPayload) => {
      setTrialVotes(payload || null);
    };

    const handleTrialVerdictFinished = (payload: TrialVerdictFinishedPayload) => {
      setTrialVerdictFinished(payload || null);
      setTrialVerdictFinishedSeq(s => s + 1);
      setTrialStage("none");
      setTrialDefenseDeadline(null);
      setTrialVerdictDeadline(null);
      setTrialInteractionCut(false);
      setTrialInteractionActiveIds([]);
      setTrialSelectedInteractorId(null);
      setTrialSelectedInteractorIds([]);
      setTrialInteractionSelectionLimit(0);
      setTrialVotes(null);
      setTrialTargetId(null);
    };

    socket.on("roomUpdated", handleRoomUpdated);
    socket.on("positionsUpdated", handlePositionsUpdated);
    socket.on("phaseChanged", handlePhaseChanged);
    socket.on("playerKilled", handlePlayerKilled);

    socket.on("wolfVotesUpdated", handleWolfVotesUpdated);
    socket.on("wolfVotes2Updated", handleWolfVotes2Updated);
    socket.on("wolfLockedUpdated", handleWolfLockedUpdated);
    socket.on("wolfPhaseStarted", handleWolfPhaseStarted);

    socket.on("seerResult", handleSeerResult);
    socket.on("guardianProtected", handleGuardianProtected);

    socket.on("witchPendingDeath", handleWitchPendingDeath);
    socket.on("witchPotionsUpdated", handleWitchPotionsUpdated);

    socket.on("hunterTargetUpdated", handleHunterTargetUpdated);
    socket.on("hunterShot", handleHunterShot);

    socket.on("dayVotesUpdated", handleDayVotesUpdated);
    socket.on("dayLockedUpdated", handleDayLockedUpdated);
    socket.on("dayDiscussionStarted", handleDayDiscussionStarted);
    socket.on("dayPhaseStarted", handleDayPhaseStarted);
    socket.on("dayVoteFinished", handleDayVoteFinished);
    socket.on("trialPhaseStarted", handleTrialPhaseStarted);
    socket.on("trialInteractionUpdated", handleTrialInteractionUpdated);
    socket.on("trialVerdictStarted", handleTrialVerdictStarted);
    socket.on("trialVotesUpdated", handleTrialVotesUpdated);
    socket.on("trialVerdictFinished", handleTrialVerdictFinished);

    socket.on("gameStarted", handleGameStarted);

    socket.on("gameEnded", handleGameEnded);
    socket.on("gameLogUpdated", handleGameLogUpdated);
    socket.on("rolesRevealUpdated", handleRolesRevealUpdated);
    socket.on("spiritWolfDecisionNeeded", handleSpiritWolfDecisionNeeded);
    socket.on("spiritWolfDecisionRecorded", handleSpiritWolfDecisionRecorded);
    socket.on("elementalTargetUpdated", handleElementalTargetUpdated);
    socket.on("elementalBuffVoteStateUpdated", handleElementalBuffVoteStateUpdated);
    socket.on("elementalBuffSelected", handleElementalBuffSelected);

    return () => {
      socket.off("roomUpdated", handleRoomUpdated);
      socket.off("positionsUpdated", handlePositionsUpdated);
      socket.off("phaseChanged", handlePhaseChanged);
      socket.off("playerKilled", handlePlayerKilled);

      socket.off("wolfVotesUpdated", handleWolfVotesUpdated);
      socket.off("wolfVotes2Updated", handleWolfVotes2Updated);
      socket.off("wolfLockedUpdated", handleWolfLockedUpdated);
      socket.off("wolfPhaseStarted", handleWolfPhaseStarted);

      socket.off("seerResult", handleSeerResult);
      socket.off("guardianProtected", handleGuardianProtected);

      socket.off("witchPendingDeath", handleWitchPendingDeath);
      socket.off("witchPotionsUpdated", handleWitchPotionsUpdated);

      socket.off("hunterTargetUpdated", handleHunterTargetUpdated);
      socket.off("hunterShot", handleHunterShot);

      socket.off("dayVotesUpdated", handleDayVotesUpdated);
      socket.off("dayLockedUpdated", handleDayLockedUpdated);
      socket.off("dayDiscussionStarted", handleDayDiscussionStarted);
      socket.off("dayPhaseStarted", handleDayPhaseStarted);
      socket.off("dayVoteFinished", handleDayVoteFinished);
      socket.off("trialPhaseStarted", handleTrialPhaseStarted);
      socket.off("trialInteractionUpdated", handleTrialInteractionUpdated);
      socket.off("trialVerdictStarted", handleTrialVerdictStarted);
      socket.off("trialVotesUpdated", handleTrialVotesUpdated);
      socket.off("trialVerdictFinished", handleTrialVerdictFinished);

      socket.off("gameStarted", handleGameStarted);

      socket.off("gameEnded", handleGameEnded);
      socket.off("gameLogUpdated", handleGameLogUpdated);
      socket.off("rolesRevealUpdated", handleRolesRevealUpdated);
      socket.off("spiritWolfDecisionNeeded", handleSpiritWolfDecisionNeeded);
      socket.off("spiritWolfDecisionRecorded", handleSpiritWolfDecisionRecorded);
      socket.off("elementalTargetUpdated", handleElementalTargetUpdated);
      socket.off("elementalBuffVoteStateUpdated", handleElementalBuffVoteStateUpdated);
      socket.off("elementalBuffSelected", handleElementalBuffSelected);
      socket.off("connect", syncGameRoom);
    };
  }, [roomId, setRoom]);

  return useMemo(
    () => ({
      phase,
      deadPlayers,
      seerResult,
      witchPendingDeathTargetIds,
      witchPotions,
      guardianProtectedSeq,
      guardianProtectedTargetId,
      hunterTargetSeq,
      hunterTargetId,
      hunterShotSeq,
      hunterShot,
      wolfLocked,
      wolfDeadline,
      wolves,
      activeWolves,
      wolfVotes2,
      wolfMaxTargets,
      gameEnded,
      spiritWolfDecisionTargetId,
      elementalTargetSeq,
      elementalTargetId,
      elementalActionMode,
      elementalBuffVoteState,
      elementalBuffResult,
      dayVotes,
      dayLocked,
      dayDiscussionDeadline,
      dayDeadline,
      dayVoters,
      dayVoteFinished,
      dayVoteFinishedSeq,
      trialTargetId,
      trialStage,
      trialDefenseDeadline,
      trialVerdictDeadline,
      trialInteractionCut,
      trialInteractionActiveIds,
      trialSelectedInteractorId,
      trialSelectedInteractorIds,
      trialInteractionSelectionLimit,
      trialVotes,
      trialVerdictFinished,
      trialVerdictFinishedSeq,
      gameLogNights,
      revealedRolesByPlayerId,
    }),
    [
      phase,
      deadPlayers,
      seerResult,
      witchPendingDeathTargetIds,
      witchPotions,
      guardianProtectedSeq,
      guardianProtectedTargetId,
      hunterTargetSeq,
      hunterTargetId,
      hunterShotSeq,
      hunterShot,
      wolfLocked,
      wolfDeadline,
      wolves,
      activeWolves,
      wolfVotes2,
      wolfMaxTargets,
      gameEnded,
      spiritWolfDecisionTargetId,
      elementalTargetSeq,
      elementalTargetId,
      elementalActionMode,
      elementalBuffVoteState,
      elementalBuffResult,
      dayVotes,
      dayLocked,
      dayDiscussionDeadline,
      dayDeadline,
      dayVoters,
      dayVoteFinished,
      dayVoteFinishedSeq,
      trialTargetId,
      trialStage,
      trialDefenseDeadline,
      trialVerdictDeadline,
      trialInteractionCut,
      trialInteractionActiveIds,
      trialSelectedInteractorId,
      trialSelectedInteractorIds,
      trialInteractionSelectionLimit,
      trialVotes,
      trialVerdictFinished,
      trialVerdictFinishedSeq,
      gameLogNights,
      revealedRolesByPlayerId,
    ]
  );
}
