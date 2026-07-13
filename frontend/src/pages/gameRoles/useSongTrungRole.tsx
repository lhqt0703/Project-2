import { useCallback, useEffect, useMemo, useState } from "react";
import { socket, clientId } from "../../socket";
import type { GamePhase } from "./socketEvents";
import ConfirmModal from "../../components/ConfirmModal";

export function useSongTrungRole({
  roomId,
  phase,
  role,
  deadPlayers,
  songTrungUsedTonight,
  songTrungChoices,
  maxUses,
  allNightActionsSimultaneous,
  currentNightTurnRole,
  nightActionDeadline,
  nightActionNow,
}: {
  roomId: string | null;
  phase: GamePhase;
  role: string | null;
  deadPlayers: string[];
  songTrungUsedTonight: Record<string, string | null> | null;
  songTrungChoices: { playerId: string; night: number; targetId: string | null }[] | null;
  maxUses: number;
  allNightActionsSimultaneous: boolean;
  currentNightTurnRole: string | null;
  nightActionDeadline: number | null;
  nightActionNow: number;
}) {
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => {
    setSelectedPlayerId(null);
    setShowConfirm(false);
  }, [phase]);

  // Đồng bộ lựa chọn đã ghi nhận đêm nay
  const choiceTonight = useMemo(() => {
    if (!clientId) return null;
    return songTrungUsedTonight?.[clientId] ?? null;
  }, [songTrungUsedTonight]);

  const canAct = useMemo(() => {
    if (phase !== "night") return false;
    if (role !== "Song Trùng") return false;
    if (choiceTonight) return false; // Đã chọn đêm nay rồi
    if (clientId && deadPlayers.includes(clientId)) return false;

    // Kiểm tra số lần chọn
    if (maxUses > 0 && songTrungChoices && clientId) {
      const usedCount = songTrungChoices.filter(c => c.playerId === clientId).length;
      if (usedCount >= maxUses) return false;
    }

    if (allNightActionsSimultaneous && nightActionDeadline && nightActionNow >= nightActionDeadline) return false;
    if (!allNightActionsSimultaneous) {
      if (currentNightTurnRole !== "Song Trùng") return false;
    }
    return true;
  }, [allNightActionsSimultaneous, currentNightTurnRole, deadPlayers, nightActionDeadline, nightActionNow, phase, role, choiceTonight, songTrungChoices, maxUses]);

  const onPlayerClick = useCallback((playerId: string) => {
    if (!canAct) return false;
    if (playerId === clientId) return true; // Không được chọn bản thân

    setSelectedPlayerId(playerId);
    setShowConfirm(true);
    return true;
  }, [canAct]);

  const confirm = useCallback(() => {
    if (!canAct) return;
    if (!roomId || !selectedPlayerId) return;

    socket.emit("songTrungChoose", { roomId, targetId: selectedPlayerId });
    setShowConfirm(false);
  }, [canAct, roomId, selectedPlayerId]);

  const modal = (
    <ConfirmModal
      open={showConfirm && !!selectedPlayerId}
      title="Xác nhận lựa chọn"
      message="Bạn có chắc chắn muốn chọn người này làm mục tiêu cướp vai trò?"
      onConfirm={confirm}
      onCancel={() => setShowConfirm(false)}
    />
  );

  return {
    onPlayerClick,
    modal,
    playerPositionsProps: {
      selectedOutlinePlayerId: phase === "night" ? (selectedPlayerId || choiceTonight) : null,
    },
  };
}
