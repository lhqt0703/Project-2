import { useEffect, useState } from "react";
import { socket, clientId } from "../socket";

type Player = { id: string; name: string; connected?: boolean };

type RoomLike = {
  id?: string;
  hostId?: string | null;
  players?: Player[];
};

export default function HostDisconnectButton({ room }: { room: RoomLike | null }) {
  const [revealDisconnectedToAll, setRevealDisconnectedToAll] = useState(false);

  useEffect(() => {
    const handler = (payload: { show: boolean }) => {
      setRevealDisconnectedToAll(!!payload.show);
    };
    socket.on("revealDisconnectedBadge", handler);
    return () => {
      socket.off("revealDisconnectedBadge", handler);
    };
  }, []);

  if (!room || !room.players) return null;
  const isHost = !!room.hostId && room.hostId === clientId;
  const hasDisconnectedPlayers = room.players.some((p) => p.connected === false);

  if (!isHost || !hasDisconnectedPlayers) return null;

  return (
    <button
      onClick={() => {
        const next = !revealDisconnectedToAll;
        if (room.id) {
          socket.emit("hostRevealDisconnectedBadge", { roomId: room.id, show: next });
        }
        setRevealDisconnectedToAll(next);
      }}
    >
      {revealDisconnectedToAll ? "Ẩn mất kết nối cho mọi người" : "Hiện mất kết nối cho mọi người"}
    </button>
  );
}
