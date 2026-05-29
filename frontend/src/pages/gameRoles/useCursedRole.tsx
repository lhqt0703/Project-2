import { useCallback, useMemo, useState } from "react";

import { socket, clientId } from "../../socket";
import ConfirmModal from "../../components/ConfirmModal";
import { CURSED_ROLE } from "../../constants/merchant";
import type { CursedResultPayload, GamePhase } from "./socketEvents";

export function useCursedRole({
  roomId,
  phase,
  role,
  nightCount,
  deadPlayers,
  cursedResult,
  cursedTargetId,
  cursedLastTargetId,
  cursedUsesRemaining,
  allNightActionsSimultaneous,
  currentNightTurnRole,
  nightActionDeadline,
  nightActionNow,
}: {
  roomId: string | null;
  phase: GamePhase;
  role: string | null;
  nightCount?: number;
  deadPlayers: string[];
  cursedResult: CursedResultPayload | null;
  cursedTargetId: string | null;
  cursedLastTargetId: string | null;
  cursedUsesRemaining: number | null;
  allNightActionsSimultaneous: boolean;
  currentNightTurnRole: string | null;
  nightActionDeadline: number | null;
  nightActionNow: number;
}) {
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [selectedNight, setSelectedNight] = useState<number | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const currentNight = nightCount || 0;
  const hasUsesRemaining = cursedUsesRemaining === null || cursedUsesRemaining > 0;

  const canAct = useMemo(() => {
    if (phase !== "night") return false;
    if (role !== CURSED_ROLE) return false;
    if (!hasUsesRemaining) return false;
    if (cursedTargetId) return false;
    if (clientId && deadPlayers.includes(clientId)) return false;
    if (allNightActionsSimultaneous && nightActionDeadline && nightActionNow >= nightActionDeadline) return false;
    if (!allNightActionsSimultaneous && currentNightTurnRole !== CURSED_ROLE) return false;
    return true;
  }, [allNightActionsSimultaneous, currentNightTurnRole, cursedTargetId, deadPlayers, hasUsesRemaining, nightActionDeadline, nightActionNow, phase, role]);

  const isConfirmOpen =
    phase === "night" &&
    showConfirm &&
    !!selectedPlayerId &&
    selectedNight === currentNight &&
    !cursedTargetId;

  const isCursedTurnActive = useMemo(() => {
    if (phase !== "night") return false;
    if (role !== CURSED_ROLE) return false;
    if (allNightActionsSimultaneous) return true;
    return currentNightTurnRole === CURSED_ROLE;
  }, [allNightActionsSimultaneous, currentNightTurnRole, phase, role]);

  const onPlayerClick = useCallback((playerId: string) => {
    if (!canAct) return false;
    if (cursedLastTargetId && cursedLastTargetId === playerId) {
      alert("Không thể chọn cùng một người hai đêm liên tiếp.");
      return true;
    }
    setSelectedPlayerId(playerId);
    setSelectedNight(currentNight);
    setShowConfirm(true);
    return true;
  }, [canAct, currentNight, cursedLastTargetId]);

  const confirm = useCallback(() => {
    if (!canAct) return;
    if (!roomId || !selectedPlayerId) return;
    socket.emit("cursedSniff", { roomId, targetId: selectedPlayerId });
    setShowConfirm(false);
  }, [canAct, roomId, selectedPlayerId]);

  return {
    onPlayerClick,
    modal: (
      <ConfirmModal
        open={isConfirmOpen}
        title="Xác nhận đánh hơi"
        message="Bạn có chắc muốn chọn người này không?"
        onConfirm={confirm}
        onCancel={() => {
          setShowConfirm(false);
          setSelectedPlayerId(null);
          setSelectedNight(null);
        }}
      />
    ),
    playerPositionsProps: {
      selectedOutlinePlayerId:
        role === CURSED_ROLE && isCursedTurnActive ? (cursedTargetId || (isConfirmOpen ? selectedPlayerId : null)) : null,
      cursedHighlightPlayerIds:
        role === CURSED_ROLE && isCursedTurnActive && cursedResult ? cursedResult.areaIds : [],
      cursedHighlightIsDanger: cursedResult?.hasWolf === true,
    },
  };
}
