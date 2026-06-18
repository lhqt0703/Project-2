import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { socket, clientId } from "../../socket";
import type { GamePhase } from "./socketEvents";
import ConfirmModal from "../../components/ConfirmModal";

export function useSeerRole({
  roomId,
  phase,
  role,
  deadPlayers,
  seerResults,
  allNightActionsSimultaneous,
  currentNightTurnRole,
  nightTurnPaused: _nightTurnPaused,
  nightActionDeadline,
  nightActionNow,
  maxChecksTonight,
}: {
  roomId: string | null;
  phase: GamePhase;
  role: string | null;
  deadPlayers: string[];
  seerResults: { playerId: string; isWolf: boolean }[];
  allNightActionsSimultaneous: boolean;
  currentNightTurnRole: string | null;
  nightTurnPaused: boolean;
  nightActionDeadline: number | null;
  nightActionNow: number;
  maxChecksTonight?: number;
}) {
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [checksUsed, setChecksUsed] = useState(0);
  const prevPhaseRef = useRef<GamePhase>(phase);

  useEffect(() => {
    if (seerResults && seerResults.length > 0) {
      setShowConfirm(false);
      setSelectedPlayerId(null);
      setChecksUsed(seerResults.length);
    }
  }, [seerResults]);

  useEffect(() => {
    const prev = prevPhaseRef.current;
    if (prev !== phase && phase === "night") {
      setChecksUsed(0);
      setSelectedPlayerId(null);
      setShowConfirm(false);
    }
    prevPhaseRef.current = phase;
  }, [phase]);


  const canAct = useMemo(() => {
    if (roomId === "mock-8") return role === "Tiên tri" && phase === "night";
    if (phase !== "night") return false;
    if (role !== "Tiên tri") return false;
    const max = maxChecksTonight ?? 1;
    if (checksUsed >= max) return false;
    if (clientId && deadPlayers.includes(clientId)) return false;
    if (allNightActionsSimultaneous && nightActionDeadline && nightActionNow >= nightActionDeadline) return false;
    if (!allNightActionsSimultaneous) {
      if (currentNightTurnRole !== "Tiên tri") return false;
    }
    return true;
  }, [allNightActionsSimultaneous, currentNightTurnRole, deadPlayers, maxChecksTonight, nightActionDeadline, nightActionNow, phase, role, checksUsed, roomId]);

  const onPlayerClick = useCallback((playerId: string) => {
    if (!canAct) return false;
    if (roomId === "mock-8") {
      setSelectedPlayerId(playerId);
      setShowConfirm(true);
      return true;
    }
    if (playerId === clientId) return true; // Không cho chọn chính mình

    setSelectedPlayerId(playerId);
    setShowConfirm(true);
    return true;
  }, [canAct, roomId]);

  const confirm = useCallback(() => {
    if (!canAct) return;
    if (!roomId || !selectedPlayerId) return;
    if (roomId === "mock-8") {
      setShowConfirm(false);
      return;
    }

    socket.emit("seerCheck", { roomId, targetId: selectedPlayerId });
  }, [canAct, roomId, selectedPlayerId]);

  const resetOnPhaseChange = useCallback((_nextPhase: GamePhase) => {
    setSelectedPlayerId(null);
    setShowConfirm(false);
    setChecksUsed(0);
  }, []);

  const modal = (
    <ConfirmModal
      open={showConfirm && !!selectedPlayerId}
      title="Xác nhận lựa chọn"
      message="Bạn có chắc muốn soi người này?"
      onConfirm={confirm}
      onCancel={() => setShowConfirm(false)}
    />
  );

  return {
    seerResults,
    onPlayerClick,
    modal,
    resetOnPhaseChange,
  };
}
