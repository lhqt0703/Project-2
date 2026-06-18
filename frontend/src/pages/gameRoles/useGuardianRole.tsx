import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { socket, clientId } from "../../socket";
import type { GamePhase } from "./socketEvents";
import ConfirmModal from "../../components/ConfirmModal";

export function useGuardianRole({
  roomId,
  phase,
  role,
  deadPlayers,
  guardianProtectedSeq: _guardianProtectedSeq,
  guardianProtectedTargetId,
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
  guardianProtectedSeq: number;
  guardianProtectedTargetId: string | null;
  allNightActionsSimultaneous: boolean;
  currentNightTurnRole: string | null;
  nightTurnPaused: boolean;
  nightActionDeadline: number | null;
  nightActionNow: number;
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
    if (roomId === "mock-8") return role === "Bảo vệ" && phase === "night";
    if (phase !== "night") return false;
    if (role !== "Bảo vệ") return false;
    if (clientId && deadPlayers.includes(clientId)) return false;
    if (allNightActionsSimultaneous && nightActionDeadline && nightActionNow >= nightActionDeadline) return false;
    if (!allNightActionsSimultaneous) {
      if (currentNightTurnRole !== "Bảo vệ") return false;
    }
    return true;
  }, [allNightActionsSimultaneous, currentNightTurnRole, deadPlayers, nightActionDeadline, nightActionNow, phase, role, roomId]);

  const isGuardianTurnActive = useMemo(() => {
    if (roomId === "mock-8") return phase === "night";
    if (phase !== "night") return false;
    if (allNightActionsSimultaneous) return true;
    return currentNightTurnRole === "Bảo vệ";
  }, [allNightActionsSimultaneous, currentNightTurnRole, phase, roomId]);

  const onPlayerClick = useCallback((playerId: string) => {
    if (!canAct) return false;

    // đã xác nhận rồi thì không được đổi
    if (lockedTargetId) {
      // consume click silently to mimic Seer lock UX
      return true;
    }

    if (roomId === "mock-8") {
      setSelectedPlayerId(playerId);
      setShowConfirm(true);
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
  }, [canAct, lastProtectedPrevNight, lockedTargetId, roomId]);

  const confirm = useCallback(() => {
    if (!canAct) return;
    if (!roomId || !selectedPlayerId) return;

    // lock ngay khi đã bấm xác nhận
    setLockedTargetId(selectedPlayerId);
    setShowConfirm(false);
    if (roomId === "mock-8") return;
    socket.emit("guardianProtect", { roomId, targetId: selectedPlayerId });
  }, [canAct, roomId, selectedPlayerId]);

  const resetOnPhaseChange = useCallback((_nextPhase: GamePhase) => {
    setSelectedPlayerId(null);
    setShowConfirm(false);
    setLockedTargetId(null);
  }, []);

  const confirmMessage =
    selectedPlayerId && selectedPlayerId === clientId
      ? "Bạn có chắc muốn bảo vệ bản thân không?"
      : "Bạn có chắc muốn bảo vệ người này không?";

  const modal = (
    <ConfirmModal
      open={showConfirm && !!selectedPlayerId}
      title="Xác nhận bảo vệ"
      message={confirmMessage}
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
        role === "Bảo vệ" && isGuardianTurnActive ? (lockedTargetId || selectedPlayerId) : null,
    },
  };
}
