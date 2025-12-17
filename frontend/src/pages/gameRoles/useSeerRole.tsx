import { useCallback, useEffect, useMemo, useState } from "react";
import { socket } from "../../socket";
import type { GamePhase } from "./socketEvents";
import ConfirmModal from "../../components/ConfirmModal";

export function useSeerRole({
  roomId,
  phase,
  role,
  deadPlayers,
  seerResult,
}: {
  roomId: string | null;
  phase: GamePhase;
  role: string | null;
  deadPlayers: string[];
  seerResult: { playerId: string; isWolf: boolean } | null;
}) {
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => {
    if (seerResult) {
      setShowConfirm(false);
      setSelectedPlayerId(null);
    }
  }, [seerResult]);

  const canAct = useMemo(() => {
    if (phase !== "night") return false;
    if (role !== "Tiên tri") return false;
    if (seerResult) return false; // đã soi rồi thì thôi
    if (socket.id && deadPlayers.includes(socket.id)) return false;
    return true;
  }, [deadPlayers, phase, role, seerResult]);

  const onPlayerClick = useCallback((playerId: string) => {
    if (!canAct) return false;

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
