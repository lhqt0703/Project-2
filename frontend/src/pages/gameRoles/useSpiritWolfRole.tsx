import { useCallback, useMemo } from "react";
import ConfirmModal from "../../components/ConfirmModal";
import { socket, clientId } from "../../socket";
import type { GamePhase } from "./socketEvents";

type Player = { id: string; name: string; connected?: boolean };

type RoomLike = {
  players: Player[];
};

export function useSpiritWolfRole({
  roomId,
  phase,
  role,
  room,
  deadPlayers,
  decisionTargetId,
  allNightActionsSimultaneous,
  currentNightTurnRole,
  nightTurnPaused,
  nightActionDeadline,
  nightActionNow,
}: {
  roomId: string | null;
  phase: GamePhase;
  role: string | null;
  room: RoomLike;
  deadPlayers: string[];
  decisionTargetId: string | null;
  allNightActionsSimultaneous: boolean;
  currentNightTurnRole: string | null;
  nightTurnPaused: boolean;
  nightActionDeadline: number | null;
  nightActionNow: number;
}) {
  const canDecide = useMemo(() => {
    if (!roomId) return false;
    if (phase !== "night") return false;
    if (role !== "Linh sói") return false;
    if (!clientId) return false;
    if (deadPlayers.includes(clientId)) return false;
    if (!decisionTargetId) return false;
    if (!allNightActionsSimultaneous && currentNightTurnRole !== "Linh sói") return false;
    if (!allNightActionsSimultaneous && nightTurnPaused) return false;
    if (nightActionDeadline && nightActionNow >= nightActionDeadline) return false;
    return true;
  }, [allNightActionsSimultaneous, currentNightTurnRole, deadPlayers, decisionTargetId, nightActionDeadline, nightActionNow, nightTurnPaused, phase, role, roomId]);

  const targetName = useMemo(() => {
    if (!decisionTargetId) return "người này";
    return room.players.find((p) => p.id === decisionTargetId)?.name || "người này";
  }, [decisionTargetId, room.players]);

  const decide = useCallback(
    (save: boolean) => {
      if (!canDecide) return;
      if (!roomId || !decisionTargetId) return;
      socket.emit("spiritWolfDecide", { roomId, save });
    },
    [canDecide, decisionTargetId, roomId]
  );

  const modal = (
    <ConfirmModal
      open={canDecide}
      title="Linh sói: Cứu hay không cứu?"
      message={`Phù thủy vừa dùng bình độc lên ${targetName} (phe Sói). Bạn có muốn CỨU không?`}
      confirmText="Cứu"
      cancelText="Không cứu"
      onConfirm={() => decide(true)}
      onCancel={() => decide(false)}
    />
  );

  return {
    modal,
  };
}
