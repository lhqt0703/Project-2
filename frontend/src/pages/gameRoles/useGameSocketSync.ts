import { useEffect, useMemo, useRef, useState } from "react";
import { socket } from "../../socket";
import type {
  GamePhase,
  GameEndedPayload,
  GameLogUpdatedPayload,
  GameLogNight,
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
} from "./socketEvents";

export function useGameSocketSync({
  roomId,
  setRoom,
}: {
  roomId: string | null;
  setRoom: React.Dispatch<React.SetStateAction<any>>;
}) {
  const [phase, setPhase] = useState<GamePhase>("day");
  const phaseRef = useRef<GamePhase>("day");
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

  const [gameLogNights, setGameLogNights] = useState<GameLogNight[]>([]);
  const [revealedRolesByPlayerId, setRevealedRolesByPlayerId] = useState<Record<string, string>>({});

  useEffect(() => {
    if (roomId) {
      socket.emit("getRoom", roomId);
    }

    const applyPhaseTransition = (newPhase: GamePhase) => {
      setPhase(newPhase);
      setSeerResult(null);
      if (newPhase === "day") {
        setWitchPendingDeathTargetIds([]);
        setSpiritWolfDecisionTargetId(null);
      }
      // hunter selection is per-night; server will also emit reset, but clear locally on phase rotate
      if (newPhase === "day") {
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
    };

    const handleRoomUpdated = (data: any) => {
      setRoom(data);
      if (data?.phase === "day" || data?.phase === "night") {
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

    const handleWolfPhaseStarted = ({ wolves, activeWolves, deadline, maxTargets }: WolfPhaseStartedPayload) => {
      setWolves(wolves);
      setActiveWolves(activeWolves || []);
      setWolfDeadline(deadline);
      setWolfMaxTargets(typeof maxTargets === "number" ? maxTargets : 1);
      setRoom((prev: any) => (prev ? { ...prev, wolfVotes: undefined } : prev));
      setWolfLocked(null);
      setWolfVotes2(null);
      setRoom((prev: any) => (prev ? { ...prev, wolfVotes2: undefined } : prev));
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

    socket.on("gameStarted", handleGameStarted);

    socket.on("gameEnded", handleGameEnded);
    socket.on("gameLogUpdated", handleGameLogUpdated);
    socket.on("rolesRevealUpdated", handleRolesRevealUpdated);
    socket.on("spiritWolfDecisionNeeded", handleSpiritWolfDecisionNeeded);
    socket.on("spiritWolfDecisionRecorded", handleSpiritWolfDecisionRecorded);

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

      socket.off("gameStarted", handleGameStarted);

      socket.off("gameEnded", handleGameEnded);
      socket.off("gameLogUpdated", handleGameLogUpdated);
      socket.off("rolesRevealUpdated", handleRolesRevealUpdated);
      socket.off("spiritWolfDecisionNeeded", handleSpiritWolfDecisionNeeded);
      socket.off("spiritWolfDecisionRecorded", handleSpiritWolfDecisionRecorded);
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
      gameLogNights,
      revealedRolesByPlayerId,
    ]
  );
}
