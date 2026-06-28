import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { socket, clientId } from "../../socket";
import type { GamePhase } from "./socketEvents";
import ConfirmModal from "../../components/ConfirmModal";
import { useTargetSelection } from "./useTargetSelection";

export function useGuardianRole({
  roomId,
  phase,
  role,
  deadPlayers,
  guardianProtectedSeq,
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

  const [lastProtectedPrevNight, setLastProtectedPrevNight] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const prevPhaseRef = useRef<GamePhase>(phase);
  const lockedTargetIdRef = useRef<string | null>(null);

  // Keep lockedTargetIdRef in sync with state
  useEffect(() => {
    lockedTargetIdRef.current = lockedTargetId;
  }, [lockedTargetId]);

  // 1. useEffect chuyển phase (chạy trước để clear state)
  useEffect(() => {
    const prev = prevPhaseRef.current;
    if (prev === phase) return;

    if (phase === "night") {
      clearSelection();
    } else {
      setLastProtectedPrevNight(prevLast => lockedTargetIdRef.current || prevLast);
      clearSelection();
    }

    prevPhaseRef.current = phase;
  }, [phase, clearSelection]);

  // 2. useEffect đồng bộ target từ server (chạy sau để override/khôi phục state)
  useEffect(() => {
    if (phase !== "night") return;
    if (guardianProtectedTargetId) {
      setSelectedPlayerId(guardianProtectedTargetId);
      setLockedTargetId(guardianProtectedTargetId);
      setShowConfirm(false);
    } else {
      clearSelection();
    }
  }, [guardianProtectedTargetId, guardianProtectedSeq, phase, clearSelection, setSelectedPlayerId, setLockedTargetId, setShowConfirm]);

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
      selectTarget(playerId);
      return true;
    }

    // Không bảo vệ cùng người 2 đêm liên tiếp (UX: báo không thể chọn, không mở confirm)
    if (lastProtectedPrevNight && playerId === lastProtectedPrevNight) {
      setInfoMessage("Không thể bảo vệ cùng người hai đêm liên tiếp!");
      return true;
    }

    selectTarget(playerId);
    return true;
  }, [canAct, lastProtectedPrevNight, lockedTargetId, roomId, selectTarget]);

  const confirm = useCallback(() => {
    if (!canAct) return;
    if (!roomId || !selectedPlayerId) return;

    // lock ngay khi đã bấm xác nhận
    lockSelection(selectedPlayerId);
    if (roomId === "mock-8") return;
    socket.emit("guardianProtect", { roomId, targetId: selectedPlayerId });
  }, [canAct, roomId, selectedPlayerId, lockSelection]);

  const resetOnPhaseChange = useCallback((_nextPhase: GamePhase) => {
    clearSelection();
  }, [clearSelection]);

  const confirmMessage =
    selectedPlayerId && selectedPlayerId === clientId
      ? "Bạn có chắc muốn bảo vệ bản thân không?"
      : "Bạn có chắc muốn bảo vệ người này không?";

  const modal = (
    <>
      <ConfirmModal
        open={showConfirm && !!selectedPlayerId}
        title="Xác nhận bảo vệ"
        message={confirmMessage}
        onConfirm={confirm}
        onCancel={cancelSelection}
      />
      <ConfirmModal
        open={!!infoMessage}
        title="Thông báo"
        message={infoMessage || ""}
        infoOnly
        onConfirm={() => setInfoMessage(null)}
        onCancel={() => setInfoMessage(null)}
      />
    </>
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
