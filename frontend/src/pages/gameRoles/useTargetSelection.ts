import { useState, useCallback } from "react";

export function useTargetSelection() {
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [lockedTargetId, setLockedTargetId] = useState<string | null>(null);

  const selectTarget = useCallback((playerId: string) => {
    setSelectedPlayerId(playerId);
    setShowConfirm(true);
  }, []);

  const cancelSelection = useCallback(() => {
    setSelectedPlayerId(null);
    setShowConfirm(false);
  }, []);

  const lockSelection = useCallback((playerId: string) => {
    setLockedTargetId(playerId);
    setShowConfirm(false);
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedPlayerId(null);
    setLockedTargetId(null);
    setShowConfirm(false);
  }, []);

  return {
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
  };
}
