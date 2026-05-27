import { useEffect, useMemo, useRef, useState } from "react";
import { clientId, socket } from "../../socket";
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
  CursedResultPayload,
  CursedTargetUpdatedPayload,
  HunterShotPayload,
  HunterTargetUpdatedPayload,
  LoveArrowShotPayload,
  LoveStatePayload,
  SeerResultPayload,
  RolesRevealUpdatedPayload,
  PublicRolesRevealUpdatedPayload,
  ProtectorTargetUpdatedPayload,
  SpiritWolfDecisionNeededPayload,
  SpiritWolfDecisionRecordedPayload,
  WildWolfConvertedStatePayload,
  WildWolfConversionUpdatedPayload,
  WitchPendingDeathPayload,
  WitchPotionsPayload,
  WolfLockedUpdatedPayload,
  WolfPhaseStartedPayload,
  WolfVotesUpdatedPayload,
  WolfVotes2UpdatedPayload,
  ElementalTargetUpdatedPayload,
  ElementalBuffVoteStatePayload,
  ElementalBuffSelectedPayload,
  HostNightActionProgressUpdatedPayload,
  AngelReviveStatePayload,
  MerchantCheeseMarksUpdatedPayload,
  MerchantPrivateStateUpdatedPayload,
} from "./socketEvents";
import { ELEMENTAL_BUFF_LABELS, ELEMENTAL_BUFFS } from "../../constants/elemental";
import { EMPTY_MERCHANT_PRIVATE_STATE } from "../../constants/merchant";

const EMPTY_LOVE_STATE: LoveStatePayload = {
  cupidId: null,
  targetId: null,
  partnerId: null,
  pairIds: [],
  rolesByPlayerId: {},
  targetWolfAligned: false,
  escapeUsed: false,
  escapeActiveTonight: false,
  escapeVotes: [],
};

const EMPTY_ANGEL_REVIVE_STATE: AngelReviveStatePayload = {
  canRevive: false,
  availableDay: null,
  selectedTargetId: null,
  selectedGuess: null,
  reviveStage: "none",
};

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
  const wildWolfConvertedSelfRef = useRef(false);
  const wildWolfConversionRef = useRef({ available: false, requested: false });

  const [deadPlayers, setDeadPlayers] = useState<string[]>([]);
  const [seerResult, setSeerResult] = useState<SeerResultPayload | null>(null);
  const [cursedResult, setCursedResult] = useState<CursedResultPayload | null>(null);
  const [cursedTargetId, setCursedTargetId] = useState<string | null>(null);
  const [cursedLastTargetId, setCursedLastTargetId] = useState<string | null>(null);
  const [cursedUsesUsed, setCursedUsesUsed] = useState(0);
  const [cursedMaxUses, setCursedMaxUses] = useState(1);
  const [cursedUsesRemaining, setCursedUsesRemaining] = useState<number | null>(null);
  const [cursedTargetSeq, setCursedTargetSeq] = useState(0);
  const [merchantPrivateState, setMerchantPrivateState] = useState(EMPTY_MERCHANT_PRIVATE_STATE);
  const [merchantCheeseMarkPlayerIds, setMerchantCheeseMarkPlayerIds] = useState<string[]>([]);
  const [angelReviveState, setAngelReviveState] = useState<AngelReviveStatePayload>(EMPTY_ANGEL_REVIVE_STATE);

  const [witchPendingDeathTargetIds, setWitchPendingDeathTargetIds] = useState<string[]>([]);
  const [witchPotions, setWitchPotions] = useState<WitchPotionsPayload | null>(null);

  const [guardianProtectedSeq, setGuardianProtectedSeq] = useState(0);
  const [guardianProtectedTargetId, setGuardianProtectedTargetId] = useState<string | null>(null);
  const [protectorTargetSeq, setProtectorTargetSeq] = useState(0);
  const [protectorTargetId, setProtectorTargetId] = useState<string | null>(null);
  const [protectorHasUsed, setProtectorHasUsed] = useState(false);

  const [hunterTargetSeq, setHunterTargetSeq] = useState(0);
  const [hunterTargetId, setHunterTargetId] = useState<string | null>(null);

  const [hunterShotSeq, setHunterShotSeq] = useState(0);
  const [hunterShot, setHunterShot] = useState<HunterShotPayload | null>(null);
  const [loveArrowShotSeq, setLoveArrowShotSeq] = useState(0);
  const [loveArrowShot, setLoveArrowShot] = useState<LoveArrowShotPayload | null>(null);
  const [loveState, setLoveState] = useState<LoveStatePayload>(EMPTY_LOVE_STATE);

  const [wolfLocked, setWolfLocked] = useState<WolfLockedUpdatedPayload | null>(null);
  const [wolfDeadline, setWolfDeadline] = useState<number | null>(null);
  const [wolves, setWolves] = useState<string[]>([]);
  const [activeWolves, setActiveWolves] = useState<string[]>([]);
  const [wolfBadgeRolesByPlayerId, setWolfBadgeRolesByPlayerId] = useState<Record<string, string>>({});
  const [wolfVotes2, setWolfVotes2] = useState<WolfVotes2UpdatedPayload | null>(null);
  const [wolfMaxTargets, setWolfMaxTargets] = useState<number>(1);
  const [wolfBiteDisabled, setWolfBiteDisabled] = useState(false);

  const [gameEnded, setGameEnded] = useState<GameEndedPayload | null>(null);
  const [spiritWolfDecisionTargetId, setSpiritWolfDecisionTargetId] = useState<string | null>(null);
  const [spiritWolfDecisionDeadline, setSpiritWolfDecisionDeadline] = useState<number | null>(null);
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
  const [dayPhaseSeq, setDayPhaseSeq] = useState(0);
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
      setCursedResult(null);
      if (newPhase === "day") {
        setWitchPendingDeathTargetIds([]);
        setSpiritWolfDecisionTargetId(null);
        setSpiritWolfDecisionDeadline(null);
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
        setSpiritWolfDecisionDeadline(null);
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
      setWolfBiteDisabled(false);
      wildWolfConversionRef.current = { available: false, requested: false };
      setRoom((prev: any) => (prev ? {
        ...prev,
        wildWolfConvertAvailableTonight: false,
        wildWolfConvertRequestedTonight: false,
      } : prev));
      setElementalTargetId(null);
      setElementalTargetSeq(0);
      setElementalActionMode("guess");
      setCursedTargetId(null);
      setMerchantCheeseMarkPlayerIds([]);
      setRoom((prev: any) => (prev ? { ...prev, nightActionProgressByPlayerId: {} } : prev));
    };

    const handleRoomUpdated = (data: any) => {
      if (!data) return;
      if (roomId && data?.id && data.id !== roomId) return;
      setRoom((prev: any) => {
        if (!prev) {
          return {
            ...data,
            wildWolfConvertedSelf: data?.wildWolfConvertedSelf ?? wildWolfConvertedSelfRef.current,
            wildWolfConvertAvailableTonight: data?.wildWolfConvertAvailableTonight ?? wildWolfConversionRef.current.available,
            wildWolfConvertRequestedTonight: data?.wildWolfConvertRequestedTonight ?? wildWolfConversionRef.current.requested,
          };
        }
        return {
          ...data,
          wolfVotes: data?.wolfVotes ?? prev.wolfVotes,
          wolfVotes2: data?.wolfVotes2 ?? prev.wolfVotes2,
          wolfLocked: data?.wolfLocked ?? prev.wolfLocked,
          wildWolfConvertedSelf: data?.wildWolfConvertedSelf ?? prev.wildWolfConvertedSelf ?? wildWolfConvertedSelfRef.current,
          wildWolfConvertAvailableTonight: data?.wildWolfConvertAvailableTonight ?? prev.wildWolfConvertAvailableTonight ?? wildWolfConversionRef.current.available,
          wildWolfConvertRequestedTonight: data?.wildWolfConvertRequestedTonight ?? prev.wildWolfConvertRequestedTonight ?? wildWolfConversionRef.current.requested,
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
      if (data?.hostId && data.hostId === clientId && roomId) {
        socket.emit("requestHostNightActionProgress", { roomId });
      }
      if (data?.publicRevealedRolesByPlayerId && typeof data.publicRevealedRolesByPlayerId === "object") {
        setRoom((prev: any) => (prev ? { ...prev, publicRevealedRolesByPlayerId: data.publicRevealedRolesByPlayerId } : prev));
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

    const handlePositionEditorsUpdated = (editors: any) => {
      if (!Array.isArray(editors)) return;
      setRoom((prev: any) => (prev ? { ...prev, positionEditors: editors } : prev));
    };

    const handlePhaseChanged = (newPhase: GamePhase) => {
      phaseRef.current = newPhase;
      applyPhaseTransition(newPhase);
    };

    const handleGameStarted = () => {
      setGameEnded(null);
      setSpiritWolfDecisionTargetId(null);
      setSpiritWolfDecisionDeadline(null);
      setSeerResult(null);
      setCursedResult(null);
      setCursedTargetId(null);
      setCursedLastTargetId(null);
      setCursedUsesUsed(0);
      setCursedMaxUses(1);
      setCursedUsesRemaining(null);
      setCursedTargetSeq(0);
      setMerchantPrivateState(EMPTY_MERCHANT_PRIVATE_STATE);
      setMerchantCheeseMarkPlayerIds([]);
      setAngelReviveState(EMPTY_ANGEL_REVIVE_STATE);
      setWitchPendingDeathTargetIds([]);
      setDeadPlayers([]);
      setGameLogNights([]);
      setRevealedRolesByPlayerId({});
      setProtectorTargetId(null);
      setProtectorTargetSeq(0);
      setProtectorHasUsed(false);
      setDayVotes(null);
      setDayLocked(null);
      setDayDiscussionDeadline(null);
      setDayDeadline(null);
      setDayVoters([]);
      setDayPhaseSeq(0);
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
      setLoveArrowShot(null);
      setLoveArrowShotSeq(0);
      setLoveState(EMPTY_LOVE_STATE);
      setElementalBuffResult(null);
      setWolfBiteDisabled(false);
      wildWolfConvertedSelfRef.current = false;
      wildWolfConversionRef.current = { available: false, requested: false };
      setRoom((prev: any) => (prev ? {
        ...prev,
        wildWolfConvertedSelf: false,
        wildWolfConvertAvailableTonight: false,
        wildWolfConvertRequestedTonight: false,
      } : prev));
    };

    const handleGameEnded = (payload: GameEndedPayload) => {
      if (!payload?.winner) return;
      setGameEnded(payload);
      // Clear any pending per-role prompts.
      setSpiritWolfDecisionTargetId(null);
      setSpiritWolfDecisionDeadline(null);
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

    const handlePublicRolesRevealUpdated = (payload: PublicRolesRevealUpdatedPayload) => {
      if (!payload?.roomId) return;
      if (roomId && payload.roomId !== roomId) return;
      setRoom((prev: any) => prev ? { ...prev, publicRevealedRolesByPlayerId: payload.rolesByPlayerId || {} } : prev);
    };

    const handleProtectorTargetUpdated = (payload: ProtectorTargetUpdatedPayload) => {
      setProtectorTargetId(payload?.targetId ?? null);
      setProtectorHasUsed(payload?.hasUsed === true);
      setProtectorTargetSeq((s) => s + 1);
    };

    const handleSpiritWolfDecisionNeeded = (payload: SpiritWolfDecisionNeededPayload) => {
      const targetId = payload?.targetId ?? null;
      setSpiritWolfDecisionTargetId(targetId);
      setSpiritWolfDecisionDeadline(targetId && typeof payload?.deadline === "number" ? payload.deadline : null);
    };

    const handleSpiritWolfDecisionRecorded = (_payload: SpiritWolfDecisionRecordedPayload) => {
      setSpiritWolfDecisionTargetId(null);
      setSpiritWolfDecisionDeadline(null);
    };

    const handleWildWolfConvertedState = (payload: WildWolfConvertedStatePayload) => {
      wildWolfConvertedSelfRef.current = payload?.converted === true;
      setRoom((prev: any) => (prev ? { ...prev, wildWolfConvertedSelf: payload?.converted === true } : prev));
    };

    const handleWildWolfConversionUpdated = (payload: WildWolfConversionUpdatedPayload) => {
      wildWolfConversionRef.current = {
        available: payload?.available === true,
        requested: payload?.requested === true,
      };
      setRoom((prev: any) => (prev ? {
        ...prev,
        wildWolfConvertAvailableTonight: payload?.available === true,
        wildWolfConvertRequestedTonight: payload?.requested === true,
      } : prev));
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

    const handleHostNightActionProgressUpdated = (payload: HostNightActionProgressUpdatedPayload) => {
      const progressByPlayerId = payload?.progressByPlayerId || {};
      setRoom((prev: any) => (prev ? { ...prev, nightActionProgressByPlayerId: progressByPlayerId } : prev));
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

    const handleWolfVoteFinished = () => {
      setWolfDeadline(null);
      setActiveWolves([]);
      setWolfBiteDisabled(true);
      setWolfMaxTargets(1);
      wildWolfConversionRef.current = {
        available: false,
        requested: false,
      };
      setRoom((prev: any) => (prev ? {
        ...prev,
        wildWolfConvertAvailableTonight: false,
        wildWolfConvertRequestedTonight: false,
      } : prev));
    };

    const handleWolfPhaseStarted = ({ wolves, activeWolves, deadline, maxTargets, resetVotes, biteDisabled, wolfBadgeRolesByPlayerId, wildWolfConvertAvailable, wildWolfConvertRequested }: WolfPhaseStartedPayload) => {
      setWolves(wolves);
      setActiveWolves(activeWolves || []);
      setWolfBadgeRolesByPlayerId(wolfBadgeRolesByPlayerId || {});
      setWolfDeadline(typeof deadline === "number" ? deadline : null);
      setWolfMaxTargets(typeof maxTargets === "number" ? maxTargets : 1);
      setWolfBiteDisabled(biteDisabled === true);
      wildWolfConversionRef.current = {
        available: wildWolfConvertAvailable === true,
        requested: wildWolfConvertRequested === true,
      };
      setRoom((prev: any) => (prev ? {
        ...prev,
        wildWolfConvertAvailableTonight: wildWolfConvertAvailable === true,
        wildWolfConvertRequestedTonight: wildWolfConvertRequested === true,
      } : prev));
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

    const updateCursedUseState = (payload: CursedResultPayload | CursedTargetUpdatedPayload | null | undefined) => {
      const usesUsed = typeof payload?.usesUsed === "number" ? payload.usesUsed : 0;
      const maxUses = typeof payload?.maxUses === "number" ? payload.maxUses : 1;
      const usesRemaining =
        typeof payload?.usesRemaining === "number"
          ? payload.usesRemaining
          : Math.max(0, maxUses - usesUsed);
      setCursedUsesUsed(usesUsed);
      setCursedMaxUses(maxUses);
      setCursedUsesRemaining(usesRemaining);
    };

    const handleCursedResult = (payload: CursedResultPayload) => {
      setCursedResult(payload);
      updateCursedUseState(payload);
    };

    const handleCursedTargetUpdated = (payload: CursedTargetUpdatedPayload) => {
      setCursedTargetId(payload?.targetId ?? null);
      setCursedLastTargetId(payload?.lastTargetId ?? null);
      updateCursedUseState(payload);
      setCursedTargetSeq((s) => s + 1);
    };

    const handleMerchantPrivateStateUpdated = (payload: MerchantPrivateStateUpdatedPayload) => {
      setMerchantPrivateState({
        ...EMPTY_MERCHANT_PRIVATE_STATE,
        ...(payload || {}),
        items: Array.isArray(payload?.items) ? payload.items : [],
        activeItemIds: Array.isArray(payload?.activeItemIds) ? payload.activeItemIds : [],
        availableStockIds: Array.isArray(payload?.availableStockIds) ? payload.availableStockIds : [],
        trade: payload?.trade ?? null,
        lastTargetId: payload?.lastTargetId ?? null,
        poppyGlassesProtectedTargetId: payload?.poppyGlassesProtectedTargetId ?? null,
      });
    };

    const handleMerchantCheeseMarksUpdated = (payload: MerchantCheeseMarksUpdatedPayload) => {
      setMerchantCheeseMarkPlayerIds(Array.isArray(payload?.playerIds) ? payload.playerIds.filter(Boolean) : []);
    };

    const handleAngelReviveStateUpdated = (payload: AngelReviveStatePayload) => {
      setAngelReviveState({
        ...EMPTY_ANGEL_REVIVE_STATE,
        ...(payload || {}),
        canRevive: payload?.canRevive === true,
        availableDay: typeof payload?.availableDay === "number" ? payload.availableDay : null,
        selectedTargetId: payload?.selectedTargetId ?? null,
        selectedGuess: payload?.selectedGuess === "wolves" || payload?.selectedGuess === "villagers" ? payload.selectedGuess : null,
        reviveStage:
          payload?.reviveStage === "pending" || payload?.reviveStage === "hidden"
            ? payload.reviveStage
            : "none",
      });
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

    const handleLoveArrowShot = (payload: LoveArrowShotPayload) => {
      if (!payload?.cupidId || !payload?.targetId) return;
      setLoveArrowShot(payload);
      setLoveArrowShotSeq((s) => s + 1);
    };

    const handleLoveStateUpdated = (payload: LoveStatePayload) => {
      setLoveState({
        cupidId: payload?.cupidId ?? null,
        targetId: payload?.targetId ?? null,
        partnerId: payload?.partnerId ?? null,
        pairIds: Array.isArray(payload?.pairIds) ? payload.pairIds.filter(Boolean) : [],
        rolesByPlayerId: payload?.rolesByPlayerId || {},
        targetWolfAligned: payload?.targetWolfAligned === true,
        escapeUsed: payload?.escapeUsed === true,
        escapeActiveTonight: payload?.escapeActiveTonight === true,
        escapeVotes: Array.isArray(payload?.escapeVotes) ? payload.escapeVotes.filter(Boolean) : [],
      });
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
      setTrialVerdictFinished(null);
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
      setDayPhaseSeq((s) => s + 1);
      setDayDiscussionDeadline(null);
      setDayDeadline(typeof deadline === "number" ? deadline : null);
      setDayVoteFinished(null);
      setTrialVerdictFinished(null);
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
    socket.on("positionEditorsUpdated", handlePositionEditorsUpdated);
    socket.on("phaseChanged", handlePhaseChanged);
    socket.on("playerKilled", handlePlayerKilled);

    socket.on("wolfVotesUpdated", handleWolfVotesUpdated);
    socket.on("wolfVotes2Updated", handleWolfVotes2Updated);
    socket.on("wolfLockedUpdated", handleWolfLockedUpdated);
    socket.on("wolfVoteFinished", handleWolfVoteFinished);
    socket.on("wolfPhaseStarted", handleWolfPhaseStarted);
    socket.on("wildWolfConversionUpdated", handleWildWolfConversionUpdated);

    socket.on("seerResult", handleSeerResult);
    socket.on("cursedResult", handleCursedResult);
    socket.on("cursedTargetUpdated", handleCursedTargetUpdated);
    socket.on("merchantPrivateStateUpdated", handleMerchantPrivateStateUpdated);
    socket.on("merchantCheeseMarksUpdated", handleMerchantCheeseMarksUpdated);
    socket.on("angelReviveStateUpdated", handleAngelReviveStateUpdated);
    socket.on("guardianProtected", handleGuardianProtected);
    socket.on("protectorTargetUpdated", handleProtectorTargetUpdated);

    socket.on("witchPendingDeath", handleWitchPendingDeath);
    socket.on("witchPotionsUpdated", handleWitchPotionsUpdated);

    socket.on("hunterTargetUpdated", handleHunterTargetUpdated);
    socket.on("hunterShot", handleHunterShot);
    socket.on("loveArrowShot", handleLoveArrowShot);
    socket.on("loveStateUpdated", handleLoveStateUpdated);

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
    socket.on("publicRolesRevealUpdated", handlePublicRolesRevealUpdated);
    socket.on("spiritWolfDecisionNeeded", handleSpiritWolfDecisionNeeded);
    socket.on("spiritWolfDecisionRecorded", handleSpiritWolfDecisionRecorded);
    socket.on("wildWolfConvertedState", handleWildWolfConvertedState);
    socket.on("elementalTargetUpdated", handleElementalTargetUpdated);
    socket.on("elementalBuffVoteStateUpdated", handleElementalBuffVoteStateUpdated);
    socket.on("elementalBuffSelected", handleElementalBuffSelected);
    socket.on("hostNightActionProgressUpdated", handleHostNightActionProgressUpdated);

    return () => {
      socket.off("roomUpdated", handleRoomUpdated);
      socket.off("positionsUpdated", handlePositionsUpdated);
      socket.off("positionEditorsUpdated", handlePositionEditorsUpdated);
      socket.off("phaseChanged", handlePhaseChanged);
      socket.off("playerKilled", handlePlayerKilled);

      socket.off("wolfVotesUpdated", handleWolfVotesUpdated);
      socket.off("wolfVotes2Updated", handleWolfVotes2Updated);
      socket.off("wolfLockedUpdated", handleWolfLockedUpdated);
      socket.off("wolfVoteFinished", handleWolfVoteFinished);
      socket.off("wolfPhaseStarted", handleWolfPhaseStarted);
      socket.off("wildWolfConversionUpdated", handleWildWolfConversionUpdated);

      socket.off("seerResult", handleSeerResult);
      socket.off("cursedResult", handleCursedResult);
      socket.off("cursedTargetUpdated", handleCursedTargetUpdated);
      socket.off("merchantPrivateStateUpdated", handleMerchantPrivateStateUpdated);
      socket.off("merchantCheeseMarksUpdated", handleMerchantCheeseMarksUpdated);
      socket.off("angelReviveStateUpdated", handleAngelReviveStateUpdated);
      socket.off("guardianProtected", handleGuardianProtected);
      socket.off("protectorTargetUpdated", handleProtectorTargetUpdated);

      socket.off("witchPendingDeath", handleWitchPendingDeath);
      socket.off("witchPotionsUpdated", handleWitchPotionsUpdated);

      socket.off("hunterTargetUpdated", handleHunterTargetUpdated);
      socket.off("hunterShot", handleHunterShot);
      socket.off("loveArrowShot", handleLoveArrowShot);
      socket.off("loveStateUpdated", handleLoveStateUpdated);

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
      socket.off("publicRolesRevealUpdated", handlePublicRolesRevealUpdated);
      socket.off("spiritWolfDecisionNeeded", handleSpiritWolfDecisionNeeded);
      socket.off("spiritWolfDecisionRecorded", handleSpiritWolfDecisionRecorded);
      socket.off("wildWolfConvertedState", handleWildWolfConvertedState);
      socket.off("elementalTargetUpdated", handleElementalTargetUpdated);
      socket.off("elementalBuffVoteStateUpdated", handleElementalBuffVoteStateUpdated);
      socket.off("elementalBuffSelected", handleElementalBuffSelected);
      socket.off("hostNightActionProgressUpdated", handleHostNightActionProgressUpdated);
      socket.off("connect", syncGameRoom);
    };
  }, [roomId, setRoom]);

  return useMemo(
    () => ({
      phase,
      deadPlayers,
      seerResult,
      cursedResult,
      cursedTargetId,
      cursedLastTargetId,
      cursedUsesUsed,
      cursedMaxUses,
      cursedUsesRemaining,
      cursedTargetSeq,
      merchantPrivateState,
      merchantCheeseMarkPlayerIds,
      angelReviveState,
      witchPendingDeathTargetIds,
      witchPotions,
      guardianProtectedSeq,
      guardianProtectedTargetId,
      protectorTargetSeq,
      protectorTargetId,
      protectorHasUsed,
      hunterTargetSeq,
      hunterTargetId,
      hunterShotSeq,
      hunterShot,
      loveArrowShotSeq,
      loveArrowShot,
      loveState,
      wolfLocked,
      wolfDeadline,
      wolves,
      activeWolves,
      wolfBadgeRolesByPlayerId,
      wolfVotes2,
      wolfMaxTargets,
      wolfBiteDisabled,
      gameEnded,
      spiritWolfDecisionTargetId,
      spiritWolfDecisionDeadline,
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
      dayPhaseSeq,
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
      cursedResult,
      cursedTargetId,
      cursedLastTargetId,
      cursedUsesUsed,
      cursedMaxUses,
      cursedUsesRemaining,
      cursedTargetSeq,
      merchantPrivateState,
      merchantCheeseMarkPlayerIds,
      angelReviveState,
      witchPendingDeathTargetIds,
      witchPotions,
      guardianProtectedSeq,
      guardianProtectedTargetId,
      protectorTargetSeq,
      protectorTargetId,
      protectorHasUsed,
      hunterTargetSeq,
      hunterTargetId,
      hunterShotSeq,
      hunterShot,
      loveArrowShotSeq,
      loveArrowShot,
      loveState,
      wolfLocked,
      wolfDeadline,
      wolves,
      activeWolves,
      wolfBadgeRolesByPlayerId,
      wolfVotes2,
      wolfMaxTargets,
      wolfBiteDisabled,
      gameEnded,
      spiritWolfDecisionTargetId,
      spiritWolfDecisionDeadline,
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
      dayPhaseSeq,
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
