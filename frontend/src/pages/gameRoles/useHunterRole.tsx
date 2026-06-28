import { useCallback, useEffect, useMemo, useRef } from "react";
import { socket, clientId } from "../../socket";
import type { GamePhase } from "./socketEvents";
import ConfirmModal from "../../components/ConfirmModal";
import { useTargetSelection } from "./useTargetSelection";

export function useHunterRole({
  roomId,
  phase,
  role,
  deadPlayers,
  hunterTargetSeq,
  hunterTargetId,
  allNightActionsSimultaneous,
  currentNightTurnRole,
  nightTurnPaused: _nightTurnPaused,
  nightActionDeadline,
  nightActionNow,
}: {
  roomId: string | null;
  phase: GamePhase;
  role: string | null;
  deadPlayers: string[];
  hunterTargetSeq: number;
  hunterTargetId: string | null;
  allNightActionsSimultaneous: boolean;
  currentNightTurnRole: string | null;
  nightTurnPaused: boolean;
  nightActionDeadline: number | null;
  nightActionNow: number;
}) {
  const {
    selectedPlayerId,
    setSelectedPlayerId,
    showConfirm,
    setShowConfirm,
    lockedTargetId,
    setLockedTargetId,
    selectTarget,
    cancelSelection,
    lockSelection,
    clearSelection,
  } = useTargetSelection();
  const prevPhaseRef = useRef<GamePhase>(phase);

  useEffect(() => {
    const prev = prevPhaseRef.current;
    if (prev === phase) return;

    if (phase === "night") {
      clearSelection();
    } else {
      clearSelection();
    }

    prevPhaseRef.current = phase;
  }, [phase, clearSelection]);

  useEffect(() => {
    // Keep local UI in sync with server-confirmed private state
    // (hunterTargetSeq makes sure we react even when same target repeats across nights).
    if (phase !== "night") return;
    if (hunterTargetId) {
      setSelectedPlayerId(hunterTargetId);
      setLockedTargetId(hunterTargetId);
      setShowConfirm(false);
    } else {
      // server cleared (new night / after resolve)
      clearSelection();
    }
  }, [hunterTargetId, hunterTargetSeq, phase, clearSelection, setSelectedPlayerId, setLockedTargetId, setShowConfirm]);

  const canAct = useMemo(() => {
    if (roomId === "mock-8") return role === "Thợ săn" && phase === "night";
    if (phase !== "night") return false;
    if (role !== "Thợ săn") return false;
    if (clientId && deadPlayers.includes(clientId)) return false;
    if (allNightActionsSimultaneous && nightActionDeadline && nightActionNow >= nightActionDeadline) return false;
    if (!allNightActionsSimultaneous) {
      if (currentNightTurnRole !== "Thợ săn") return false;
    }
    return true;
  }, [allNightActionsSimultaneous, currentNightTurnRole, deadPlayers, nightActionDeadline, nightActionNow, phase, role, roomId]);

  const isHunterTurnActive = useMemo(() => {
    if (roomId === "mock-8") return phase === "night";
    if (phase !== "night") return false;
    if (allNightActionsSimultaneous) return true;
    return currentNightTurnRole === "Thợ săn";
  }, [allNightActionsSimultaneous, currentNightTurnRole, phase, roomId]);

  const onPlayerClick = useCallback(
    (playerId: string) => {
      if (!canAct) return false;

      // đã xác nhận rồi thì không được đổi
      if (lockedTargetId) {
        return true;
      }

      if (roomId === "mock-8") {
        selectTarget(playerId);
        return true;
      }

      if (playerId === clientId) return true; // Không cho chọn chính mình

      selectTarget(playerId);
      return true;
    },
    [canAct, lockedTargetId, roomId, selectTarget]
  );

  const confirm = useCallback(() => {
    if (!canAct) return;
    if (!roomId || !selectedPlayerId) return;
    // lock ngay khi đã bấm xác nhận
    lockSelection(selectedPlayerId);
    if (roomId === "mock-8") return;
    socket.emit("hunterChooseTarget", { roomId, targetId: selectedPlayerId });
  }, [canAct, roomId, selectedPlayerId, lockSelection]);

  const resetOnPhaseChange = useCallback((_nextPhase: GamePhase) => {
    clearSelection();
  }, [clearSelection]);

  const modal = (
    <ConfirmModal
      open={showConfirm && !!selectedPlayerId}
      title="Xác nhận lựa chọn"
      message="Bạn có chắc muốn chọn người này?"
      onConfirm={confirm}
      onCancel={cancelSelection}
    />
  );

  return {
    onPlayerClick,
    resetOnPhaseChange,
    modal,
    playerPositionsProps: {
      selectedOutlinePlayerId:
        role === "Thợ săn" && isHunterTurnActive ? (lockedTargetId || selectedPlayerId) : null,
    },
  };
}
