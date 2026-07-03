import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { socket, clientId } from "../../socket";
import type { GamePhase } from "./socketEvents";
import ConfirmModal from "../../components/ConfirmModal";

export function useChiefRole({
  roomId,
  phase,
  role,
  deadPlayers,
  chiefFoundProtectorId,
  chiefUsedTonight,
  allNightActionsSimultaneous,
  currentNightTurnRole,
  nightActionDeadline,
  nightActionNow,
  roles,
}: {
  roomId: string | null;
  phase: GamePhase;
  role: string | null;
  deadPlayers: string[];
  chiefFoundProtectorId: string | null;
  chiefUsedTonight: boolean;
  allNightActionsSimultaneous: boolean;
  currentNightTurnRole: string | null;
  nightActionDeadline: number | null;
  nightActionNow: number;
  roles?: string[];
}) {
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const prevPhaseRef = useRef<GamePhase>(phase);

  useEffect(() => {
    const prev = prevPhaseRef.current;
    if (prev !== phase && phase === "night") {
      setSelectedPlayerId(null);
      setShowConfirm(false);
    }
    prevPhaseRef.current = phase;
  }, [phase]);

  const canAct = useMemo(() => {
    if (roomId === "mock-8") return role === "Trưởng làng" && phase === "night";
    if (phase !== "night") return false;
    if (role !== "Trưởng làng") return false;

    const hasProtectorInGame = roles?.includes("Hộ nhân");
    if (!hasProtectorInGame) return false;
    if (chiefFoundProtectorId) return false; // Đã tìm thấy Hộ nhân rồi
    if (chiefUsedTonight) return false; // Đêm nay đã dùng chức năng rồi
    if (clientId && deadPlayers.includes(clientId)) return false;
    if (allNightActionsSimultaneous && nightActionDeadline && nightActionNow >= nightActionDeadline) return false;
    if (!allNightActionsSimultaneous) {
      if (currentNightTurnRole !== "Trưởng làng") return false;
    }
    return true;
  }, [allNightActionsSimultaneous, currentNightTurnRole, deadPlayers, nightActionDeadline, nightActionNow, phase, role, chiefFoundProtectorId, chiefUsedTonight, roles, roomId]);

  const onPlayerClick = useCallback((playerId: string) => {
    if (!canAct) return false;
    if (playerId === clientId) return true; // Không được tự chọn bản thân

    setSelectedPlayerId(playerId);
    setShowConfirm(true);
    return true;
  }, [canAct]);

  const confirm = useCallback(() => {
    if (!canAct) return;
    if (!roomId || !selectedPlayerId) return;

    socket.emit("chiefCheck", { roomId, targetId: selectedPlayerId });
    setShowConfirm(false);
  }, [canAct, roomId, selectedPlayerId]);

  const modal = (
    <ConfirmModal
      open={showConfirm && !!selectedPlayerId}
      title="Xác nhận lựa chọn"
      message="Bạn có chắc chắn muốn kiểm tra xem người này có phải là Hộ nhân không?"
      onConfirm={confirm}
      onCancel={() => setShowConfirm(false)}
    />
  );

  return {
    onPlayerClick,
    modal,
    playerPositionsProps: {
      selectedOutlinePlayerId: selectedPlayerId,
    },
  };
}
