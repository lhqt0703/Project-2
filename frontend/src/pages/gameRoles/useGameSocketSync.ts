import { useEffect, useMemo, useState } from "react";
import { socket } from "../../socket";
import type {
  GamePhase,
  GuardianProtectedPayload,
  HunterTargetUpdatedPayload,
  SeerResultPayload,
  WitchPendingDeathPayload,
  WitchPotionsPayload,
  WolfLockedUpdatedPayload,
  WolfPhaseStartedPayload,
  WolfVotesUpdatedPayload,
} from "./socketEvents";

export function useGameSocketSync({
  roomId,
  setRoom,
}: {
  roomId: string | null;
  setRoom: React.Dispatch<React.SetStateAction<any>>;
}) {
  const [phase, setPhase] = useState<GamePhase>("day");
  const [deadPlayers, setDeadPlayers] = useState<string[]>([]);
  const [seerResult, setSeerResult] = useState<SeerResultPayload | null>(null);

  const [witchPendingDeathTargetId, setWitchPendingDeathTargetId] = useState<string | null>(null);
  const [witchPotions, setWitchPotions] = useState<WitchPotionsPayload | null>(null);

  const [guardianProtectedSeq, setGuardianProtectedSeq] = useState(0);
  const [guardianProtectedTargetId, setGuardianProtectedTargetId] = useState<string | null>(null);

  const [hunterTargetSeq, setHunterTargetSeq] = useState(0);
  const [hunterTargetId, setHunterTargetId] = useState<string | null>(null);

  const [wolfLocked, setWolfLocked] = useState<WolfLockedUpdatedPayload | null>(null);
  const [wolfDeadline, setWolfDeadline] = useState<number | null>(null);
  const [wolves, setWolves] = useState<string[]>([]);
  const [activeWolves, setActiveWolves] = useState<string[]>([]);

  useEffect(() => {
    if (roomId) {
      socket.emit("getRoom", roomId);
    }

    const handleRoomUpdated = (data: any) => {
      setRoom(data);
      if (data?.phase === "day" || data?.phase === "night") {
        setPhase(data.phase);
      }
      if (Array.isArray(data?.deadPlayers)) {
        setDeadPlayers(data.deadPlayers);
      }
    };

    const handlePositionsUpdated = (positions: any) => {
      setRoom((prev: any) => (prev ? { ...prev, positions } : prev));
    };

    const handlePhaseChanged = (newPhase: GamePhase) => {
      setPhase(newPhase);
      setSeerResult(null);
      if (newPhase === "day") {
        setWitchPendingDeathTargetId(null);
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

    const handleWolfLockedUpdated = (locked: WolfLockedUpdatedPayload) => {
      setWolfLocked(locked);
    };

    const handleWolfPhaseStarted = ({ wolves, activeWolves, deadline }: WolfPhaseStartedPayload) => {
      setWolves(wolves);
      setActiveWolves(activeWolves || []);
      setWolfDeadline(deadline);
      setRoom((prev: any) => (prev ? { ...prev, wolfVotes: undefined } : prev));
      setWolfLocked(null);
    };

    const handleSeerResult = (payload: SeerResultPayload) => {
      setSeerResult(payload);
    };

    const handleGuardianProtected = (targetId: GuardianProtectedPayload) => {
      setGuardianProtectedTargetId(targetId);
      setGuardianProtectedSeq(s => s + 1);
    };

    const handleWitchPendingDeath = (payload: WitchPendingDeathPayload) => {
      setWitchPendingDeathTargetId(payload?.targetId ?? null);
    };

    const handleWitchPotionsUpdated = (payload: WitchPotionsPayload) => {
      setWitchPotions(payload);
    };

    const handleHunterTargetUpdated = (payload: HunterTargetUpdatedPayload) => {
      setHunterTargetId(payload?.targetId ?? null);
      setHunterTargetSeq(s => s + 1);
    };

    socket.on("roomUpdated", handleRoomUpdated);
    socket.on("positionsUpdated", handlePositionsUpdated);
    socket.on("phaseChanged", handlePhaseChanged);
    socket.on("playerKilled", handlePlayerKilled);

    socket.on("wolfVotesUpdated", handleWolfVotesUpdated);
    socket.on("wolfLockedUpdated", handleWolfLockedUpdated);
    socket.on("wolfPhaseStarted", handleWolfPhaseStarted);

    socket.on("seerResult", handleSeerResult);
    socket.on("guardianProtected", handleGuardianProtected);

    socket.on("witchPendingDeath", handleWitchPendingDeath);
    socket.on("witchPotionsUpdated", handleWitchPotionsUpdated);

    socket.on("hunterTargetUpdated", handleHunterTargetUpdated);

    return () => {
      socket.off("roomUpdated", handleRoomUpdated);
      socket.off("positionsUpdated", handlePositionsUpdated);
      socket.off("phaseChanged", handlePhaseChanged);
      socket.off("playerKilled", handlePlayerKilled);

      socket.off("wolfVotesUpdated", handleWolfVotesUpdated);
      socket.off("wolfLockedUpdated", handleWolfLockedUpdated);
      socket.off("wolfPhaseStarted", handleWolfPhaseStarted);

      socket.off("seerResult", handleSeerResult);
      socket.off("guardianProtected", handleGuardianProtected);

      socket.off("witchPendingDeath", handleWitchPendingDeath);
      socket.off("witchPotionsUpdated", handleWitchPotionsUpdated);

      socket.off("hunterTargetUpdated", handleHunterTargetUpdated);
    };
  }, [roomId, setRoom]);

  return useMemo(
    () => ({
      phase,
      deadPlayers,
      seerResult,
      witchPendingDeathTargetId,
      witchPotions,
      guardianProtectedSeq,
      guardianProtectedTargetId,
      hunterTargetSeq,
      hunterTargetId,
      wolfLocked,
      wolfDeadline,
      wolves,
      activeWolves,
    }),
    [
      phase,
      deadPlayers,
      seerResult,
      witchPendingDeathTargetId,
      witchPotions,
      guardianProtectedSeq,
      guardianProtectedTargetId,
      hunterTargetSeq,
      hunterTargetId,
      wolfLocked,
      wolfDeadline,
      wolves,
      activeWolves,
    ]
  );
}
