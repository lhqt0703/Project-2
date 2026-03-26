import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { socket } from "../../socket";
import type { GamePhase } from "./socketEvents";
import ConfirmModal from "../../components/ConfirmModal";

export function useHunterRole({
  roomId,
  phase,
  role,
  deadPlayers,
  hunterTargetSeq,
  hunterTargetId,
}: {
  roomId: string | null;
  phase: GamePhase;
  role: string | null;
  deadPlayers: string[];
  hunterTargetSeq: number;
  hunterTargetId: string | null;
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
      setShowConfirm(false);
      setLockedTargetId(null);
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
    if (phase !== "night") return false;
    if (role !== "Thợ săn") return false;
    if (socket.id && deadPlayers.includes(socket.id)) return false;
    return true;
  }, [deadPlayers, phase, role]);

  const onPlayerClick = useCallback(
    (playerId: string) => {
      if (!canAct) return false;
      if (playerId === socket.id) return true; // Không cho chọn chính mình

      // đã xác nhận rồi thì không được đổi
      if (lockedTargetId) {
        return true;
      }

      setSelectedPlayerId(playerId);
      setShowConfirm(true);
      return true;
    },
    [canAct, lockedTargetId]
  );

  const confirm = useCallback(() => {
    if (!roomId || !selectedPlayerId) return;
    // lock ngay khi đã bấm xác nhận
    setLockedTargetId(selectedPlayerId);
    setShowConfirm(false);
    socket.emit("hunterChooseTarget", { roomId, targetId: selectedPlayerId });
  }, [roomId, selectedPlayerId]);

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
        role === "Thợ săn" && phase === "night" ? (lockedTargetId || selectedPlayerId) : null,
    },
  };
}
