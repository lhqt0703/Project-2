import { useCallback, useEffect, useMemo, useState } from "react";
import { socket, clientId } from "../../socket";
import type { GamePhase } from "./socketEvents";
import ConfirmModal from "../../components/ConfirmModal";

export function useSongTrungRobbedRole({
  roomId,
  phase,
  deadPlayers,
  songTrungRobbedPlayerId,
  songTrungFoundByVictim,
  songTrungVictimSearchUsedTonight,
  allNightActionsSimultaneous,
  nightActionDeadline,
  nightActionNow,
}: {
  roomId: string | null;
  phase: GamePhase;
  deadPlayers: string[];
  songTrungRobbedPlayerId: string | null;
  songTrungFoundByVictim: boolean;
  songTrungVictimSearchUsedTonight: string | null;
  allNightActionsSimultaneous: boolean;
  nightActionDeadline: number | null;
  nightActionNow: number;
}) {
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => {
    setSelectedPlayerId(null);
    setShowConfirm(false);
  }, [phase]);

  const canAct = useMemo(() => {
    if (phase !== "night") return false;
    if (!clientId) return false;
    // Phải là người bị cướp vai trò và chưa tìm thấy Song Trùng
    if (songTrungRobbedPlayerId !== clientId) return false;
    if (songTrungFoundByVictim) return false; // Đã tìm thấy trước đó rồi
    if (songTrungVictimSearchUsedTonight) return false; // Đêm nay đã thực hiện đoán rồi

    if (deadPlayers.includes(clientId)) return false;

    // Ở chế độ sequential: hiện tại ta coi người bị cướp hành động độc lập ban đêm?
    // Để đơn giản và nhất quán, người bị cướp có thể đoán bất kỳ lúc nào ban đêm (giống như Tiên tri/Bảo vệ trong chế độ simultaneous)
    if (allNightActionsSimultaneous && nightActionDeadline && nightActionNow >= nightActionDeadline) return false;
    return true;
  }, [allNightActionsSimultaneous, deadPlayers, nightActionDeadline, nightActionNow, phase, songTrungRobbedPlayerId, songTrungFoundByVictim, songTrungVictimSearchUsedTonight]);

  const onPlayerClick = useCallback((playerId: string) => {
    if (!canAct) return false;
    if (playerId === clientId) return true; // Không được tự đoán chính mình

    setSelectedPlayerId(playerId);
    setShowConfirm(true);
    return true;
  }, [canAct]);

  const confirm = useCallback(() => {
    if (!canAct) return;
    if (!roomId || !selectedPlayerId) return;

    socket.emit("songTrungVictimSearch", { roomId, targetId: selectedPlayerId });
    setShowConfirm(false);
  }, [canAct, roomId, selectedPlayerId]);

  const modal = (
    <ConfirmModal
      open={showConfirm && !!selectedPlayerId}
      title="Xác nhận nghi ngờ"
      message="Bạn có chắc chắn muốn chọn người này làm mục tiêu nghi ngờ Song Trùng?"
      onConfirm={confirm}
      onCancel={() => setShowConfirm(false)}
    />
  );

  return {
    onPlayerClick,
    modal,
    playerPositionsProps: {
      selectedOutlinePlayerId: phase === "night" ? (selectedPlayerId || songTrungVictimSearchUsedTonight) : null,
    },
  };
}
