import { useCallback, useMemo, useState } from "react";
import { socket, clientId } from "../../socket";
import type { GamePhase } from "./socketEvents";
import ConfirmModal from "../../components/ConfirmModal";

type Player = { id: string; name: string; connected?: boolean };
type RoomLike = { players: Player[] };

export function useProtectorRole({
  roomId,
  phase,
  role,
  room,
  deadPlayers,
  protectorTargetId,
  protectorHasUsed,
  allNightActionsSimultaneous,
  currentNightTurnRole,
  nightActionDeadline,
  nightActionNow,
}: {
  roomId: string | null;
  phase: GamePhase;
  role: string | null;
  room: RoomLike;
  deadPlayers: string[];
  protectorTargetId: string | null;
  protectorHasUsed: boolean;
  allNightActionsSimultaneous: boolean;
  currentNightTurnRole: string | null;
  nightActionDeadline: number | null;
  nightActionNow: number;
}) {
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);

  const canAct = useMemo(() => {
    if (phase !== "night") return false;
    if (role !== "Hộ nhân") return false;
    if (clientId && deadPlayers.includes(clientId)) return false;
    if (protectorHasUsed) return false;
    if (protectorTargetId) return false;
    if (allNightActionsSimultaneous && nightActionDeadline && nightActionNow >= nightActionDeadline) return false;
    if (!allNightActionsSimultaneous && currentNightTurnRole !== "Hộ nhân") return false;
    return true;
  }, [allNightActionsSimultaneous, currentNightTurnRole, deadPlayers, nightActionDeadline, nightActionNow, phase, protectorHasUsed, protectorTargetId, role]);

  const isProtectorTurnActive = useMemo(() => {
    if (phase !== "night") return false;
    if (role !== "Hộ nhân") return false;
    if (allNightActionsSimultaneous) return true;
    return currentNightTurnRole === "Hộ nhân";
  }, [allNightActionsSimultaneous, currentNightTurnRole, phase, role]);

  const onPlayerClick = useCallback((playerId: string) => {
    if (!canAct) return false;
    if (playerId === clientId) return true;
    setSelectedPlayerId(playerId);
    setShowConfirm(true);
    return true;
  }, [canAct]);

  const confirm = useCallback(() => {
    if (!canAct) return;
    if (!roomId || !selectedPlayerId) return;
    socket.emit("protectorChooseTarget", { roomId, targetId: selectedPlayerId });
    setShowConfirm(false);
  }, [canAct, roomId, selectedPlayerId]);

  const targetName = selectedPlayerId
    ? room.players.find((player) => player.id === selectedPlayerId)?.name || "người này"
    : "người này";

  const panel = role === "Hộ nhân" && phase === "night"
    ? protectorTargetId
      ? (
        <div style={{ marginTop: 12, opacity: 0.85 }}>
          Người đang được bất tử: <b>{room.players.find((player) => player.id === protectorTargetId)?.name || "người đã chọn"}</b>
        </div>
      )
      : protectorHasUsed
        ? (
          <div style={{ marginTop: 12, opacity: 0.85 }}>
            Bạn đã dùng kỹ năng trao bất tử trong ván này.
          </div>
        )
        : null
    : null;

  return {
    onPlayerClick,
    panel,
    modal: (
      <ConfirmModal
        open={phase === "night" && showConfirm && !!selectedPlayerId}
        title="Xác nhận Hộ nhân"
        message={`Bạn có chắc muốn cho ${targetName} nhận bất tử không?`}
        onConfirm={confirm}
        onCancel={() => setShowConfirm(false)}
      />
    ),
    playerPositionsProps: {
      selectedOutlinePlayerId:
        role === "Hộ nhân" && isProtectorTurnActive ? (protectorTargetId || (showConfirm ? selectedPlayerId : null)) : null,
    },
  };
}
