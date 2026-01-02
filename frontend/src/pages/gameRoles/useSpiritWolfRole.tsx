import { useCallback, useMemo } from "react";
import ConfirmModal from "../../components/ConfirmModal";
import { socket } from "../../socket";
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
}: {
  roomId: string | null;
  phase: GamePhase;
  role: string | null;
  room: RoomLike;
  deadPlayers: string[];
  decisionTargetId: string | null;
}) {
  const canDecide = useMemo(() => {
    if (!roomId) return false;
    if (phase !== "night") return false;
    if (role !== "Linh sói") return false;
    if (!socket.id) return false;
    if (deadPlayers.includes(socket.id)) return false;
    if (!decisionTargetId) return false;
    return true;
  }, [deadPlayers, decisionTargetId, phase, role, roomId]);

  const targetName = useMemo(() => {
    if (!decisionTargetId) return "người này";
    return room.players.find(p => p.id === decisionTargetId)?.name || "người này";
  }, [decisionTargetId, room.players]);

  const decide = useCallback(
    (save: boolean) => {
      if (!roomId || !decisionTargetId) return;
      socket.emit("spiritWolfDecide", { roomId, save });
    },
    [decisionTargetId, roomId]
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
