import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { socket, clientId } from "../../socket";
import type { GamePhase } from "./socketEvents";
import ConfirmModal from "../../components/ConfirmModal";

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
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [lockedTargetId, setLockedTargetId] = useState<string | null>(null);
  const prevPhaseRef = useRef<GamePhase>(phase);

  useEffect(() => {
    const prev = prevPhaseRef.current;
    if (prev === phase) return;

    if (phase === "night") {
      setSelectedPlayerId(null);
      setLockedTargetId(null);
      setShowConfirm(false);
    } else {
      setSelectedPlayerId(null);
      setShowConfirm(false);
      setLockedTargetId(null);
    }

    prevPhaseRef.current = phase;
  }, [phase]);

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
      setSelectedPlayerId(null);
      setLockedTargetId(null);
      setShowConfirm(false);
    }
  }, [hunterTargetId, hunterTargetSeq, phase]);

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
        setSelectedPlayerId(playerId);
        setShowConfirm(true);
        return true;
      }

      if (playerId === clientId) return true; // Không cho chọn chính mình

      setSelectedPlayerId(playerId);
      setShowConfirm(true);
      return true;
    },
    [canAct, lockedTargetId, roomId]
  );

  const confirm = useCallback(() => {
    if (!canAct) return;
    if (!roomId || !selectedPlayerId) return;
    // lock ngay khi đã bấm xác nhận
    setLockedTargetId(selectedPlayerId);
    setShowConfirm(false);
    if (roomId === "mock-8") return;
    socket.emit("hunterChooseTarget", { roomId, targetId: selectedPlayerId });
  }, [canAct, roomId, selectedPlayerId]);

  const cancel = useCallback(() => {
    setShowConfirm(false);
    setSelectedPlayerId(null);
  }, []);

  const resetOnPhaseChange = useCallback((_nextPhase: GamePhase) => {
    setSelectedPlayerId(null);
    setShowConfirm(false);
    setLockedTargetId(null);
  }, []);

  const modal = (
    <ConfirmModal
      open={showConfirm && !!selectedPlayerId}
      title="Xác nhận lựa chọn"
      message="Bạn có chắc muốn chọn người này?"
      onConfirm={confirm}
      onCancel={cancel}
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
