import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { socket } from "../../socket";
import type { GamePhase } from "./socketEvents";
import ConfirmModal from "../../components/ConfirmModal";

export function useGuardianRole({
  roomId,
  phase,
  role,
  deadPlayers,
  guardianProtectedSeq,
  guardianProtectedTargetId,
}: {
  roomId: string | null;
  phase: GamePhase;
  role: string | null;
  deadPlayers: string[];
  guardianProtectedSeq: number;
  guardianProtectedTargetId: string | null;
}) {
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [lastProtectedPrevNight, setLastProtectedPrevNight] = useState<string | null>(null);
  const [lockedTargetId, setLockedTargetId] = useState<string | null>(null);
  const prevPhaseRef = useRef<GamePhase>(phase);

  useEffect(() => {
    // When server confirms a protection, lock the choice and keep the ring.
    if (phase === "night" && guardianProtectedTargetId) {
      setSelectedPlayerId(guardianProtectedTargetId);
      setLockedTargetId(guardianProtectedTargetId);
      setShowConfirm(false);
    }
  }, [guardianProtectedTargetId, phase]);

  useEffect(() => {
    const prev = prevPhaseRef.current;
    if (prev === phase) return;

    // On phase transitions only
    if (phase === "night") {
      // New night: clear current-night selection/lock
      setSelectedPlayerId(null);
      setShowConfirm(false);
      setLockedTargetId(null);
    } else {
      // Switch to day: persist last protected and clear selection
      setLastProtectedPrevNight(prevLast => lockedTargetId || prevLast);
      setSelectedPlayerId(null);
      setShowConfirm(false);
      setLockedTargetId(null);
    }

    prevPhaseRef.current = phase;
  }, [lockedTargetId, phase]);

  const canAct = useMemo(() => {
    if (phase !== "night") return false;
    if (role !== "Bảo vệ") return false;
    if (socket.id && deadPlayers.includes(socket.id)) return false;
    return true;
  }, [deadPlayers, phase, role]);

  const onPlayerClick = useCallback((playerId: string) => {
    if (!canAct) return false;

    // đã xác nhận rồi thì không được đổi
    if (lockedTargetId) {
      // consume click silently to mimic Seer lock UX
      return true;
    }

    // Không bảo vệ cùng người 2 đêm liên tiếp (UX: báo không thể chọn, không mở confirm)
    if (lastProtectedPrevNight && playerId === lastProtectedPrevNight) {
      alert("Không thể bảo vệ cùng người hai đêm liên tiếp!");
      return true;
    }

    setSelectedPlayerId(playerId);
    setShowConfirm(true);
    return true;
  }, [canAct, lastProtectedPrevNight, lockedTargetId]);

  const confirm = useCallback(() => {
    if (!roomId || !selectedPlayerId) return;

    // lock ngay khi đã bấm xác nhận
    setLockedTargetId(selectedPlayerId);
    setShowConfirm(false);
    socket.emit("guardianProtect", { roomId, targetId: selectedPlayerId });
  }, [roomId, selectedPlayerId]);

  const resetOnPhaseChange = useCallback((_nextPhase: GamePhase) => {
    setSelectedPlayerId(null);
    setShowConfirm(false);
    setLockedTargetId(null);
  }, []);

  const modal = (
    <ConfirmModal
      open={showConfirm && !!selectedPlayerId}
      title="Xác nhận bảo vệ"
      message="Bạn có chắc muốn bảo vệ người này?"
      onConfirm={confirm}
      onCancel={() => setShowConfirm(false)}
    />
  );

  return {
    onPlayerClick,
    modal,
    resetOnPhaseChange,
    playerPositionsProps: {
      selectedOutlinePlayerId:
        role === "Bảo vệ" && phase === "night" ? (lockedTargetId || selectedPlayerId) : null,
    },
  };
}
