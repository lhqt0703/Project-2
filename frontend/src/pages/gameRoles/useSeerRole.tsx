import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { socket, clientId } from "../../socket";
import type { GamePhase } from "./socketEvents";
import ConfirmModal from "../../components/ConfirmModal";

export function useSeerRole({
  roomId,
  phase,
  role,
  deadPlayers,
  seerResult,
  allNightActionsSimultaneous,
  currentNightTurnRole,
  nightTurnPaused: _nightTurnPaused,
  maxChecksTonight,
}: {
  roomId: string | null;
  phase: GamePhase;
  role: string | null;
  deadPlayers: string[];
  seerResult: { playerId: string; isWolf: boolean } | null;
  allNightActionsSimultaneous: boolean;
  currentNightTurnRole: string | null;
  nightTurnPaused: boolean;
  maxChecksTonight?: number;
}) {
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [checksUsed, setChecksUsed] = useState(0);
  const prevPhaseRef = useRef<GamePhase>(phase);

  useEffect(() => {
    if (seerResult) {
      setShowConfirm(false);
      setSelectedPlayerId(null);
      setChecksUsed((c) => c + 1);
    }
  }, [seerResult]);

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
    if (phase !== "night") return false;
    if (role !== "Tiên tri") return false;
    const max = maxChecksTonight ?? 1;
    if (checksUsed >= max) return false;
    if (clientId && deadPlayers.includes(clientId)) return false;
    if (!allNightActionsSimultaneous) {
      if (currentNightTurnRole !== "Tiên tri") return false;
    }
    return true;
  }, [allNightActionsSimultaneous, currentNightTurnRole, deadPlayers, maxChecksTonight, phase, role, checksUsed]);

  const onPlayerClick = useCallback((playerId: string) => {
    if (!canAct) return false;
    if (playerId === clientId) return true; // Không cho chọn chính mình

    setSelectedPlayerId(playerId);
    setShowConfirm(true);
    return true;
  }, [canAct]);

  const confirm = useCallback(() => {
    if (!roomId || !selectedPlayerId) return;

    socket.emit("seerCheck", { roomId, targetId: selectedPlayerId });
  }, [roomId, selectedPlayerId]);

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
    seerResult,
    onPlayerClick,
    modal,
    resetOnPhaseChange,
  };
}
