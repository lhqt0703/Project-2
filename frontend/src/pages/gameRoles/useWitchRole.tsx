import { useCallback, useEffect, useMemo, useState } from "react";
import { socket } from "../../socket";
import type { GamePhase, WitchPotionsPayload } from "./socketEvents";

type Player = { id: string; name: string; connected?: boolean };

type RoomLike = {
  players: Player[];
};

export function useWitchRole({
  roomId,
  phase,
  role,
  room,
  deadPlayers,
  witchPendingDeathTargetId,
  witchPotions,
}: {
  roomId: string | null;
  phase: GamePhase;
  role: string | null;
  room: RoomLike;
  deadPlayers: string[];
  witchPendingDeathTargetId: string | null;
  witchPotions: WitchPotionsPayload | null;
}) {
  const [poisonMode, setPoisonMode] = useState(false);
  const [poisonSelectedTargetId, setPoisonSelectedTargetId] = useState<string | null>(null);

  useEffect(() => {
    if (phase === "day") {
      setPoisonMode(false);
      setPoisonSelectedTargetId(null);
    }
  }, [phase]);

  const canAct = useMemo(() => {
    if (phase !== "night") return false;
    if (role !== "Phù thủy") return false;
    if (socket.id && deadPlayers.includes(socket.id)) return false;
    return true;
  }, [deadPlayers, phase, role]);

  const healDisabled = useMemo(() => {
    if (!canAct) return true;
    if (!witchPendingDeathTargetId) return true;
    if (witchPotions?.healUsed) return true;
    return false;
  }, [canAct, witchPendingDeathTargetId, witchPotions?.healUsed]);

  const poisonDisabled = useMemo(() => {
    if (!canAct) return true;
    if (witchPotions?.poisonUsed) return true;
    return false;
  }, [canAct, witchPotions?.poisonUsed]);

  const onPlayerClick = useCallback(
    (playerId: string) => {
      if (!canAct) return false;
      if (!poisonMode) return false;
      if (poisonDisabled) return true;

      // không giết bản thân
      if (playerId === socket.id) return true;
      // không chọn người đã chết
      if (deadPlayers.includes(playerId)) return true;
      // target phải tồn tại
      if (!room.players.find(p => p.id === playerId)) return true;

      setPoisonSelectedTargetId(playerId);
      setPoisonMode(false);
      socket.emit("witchPoison", { roomId, targetId: playerId });
      return true;
    },
    [canAct, deadPlayers, poisonDisabled, poisonMode, room.players, roomId]
  );

  const panel =
    role === "Phù thủy" && phase === "night" && socket.id && !deadPlayers.includes(socket.id) ? (
      <div style={{ marginTop: 12, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <button
          disabled={healDisabled}
          onClick={() => {
            if (healDisabled) return;
            socket.emit("witchHeal", { roomId });
          }}
          style={{ padding: "8px 12px", cursor: healDisabled ? "not-allowed" : "pointer" }}
        >
          🧪 Bình cứu
        </button>

        <button
          disabled={poisonDisabled}
          onClick={() => {
            if (poisonDisabled) return;
            setPoisonSelectedTargetId(null);
            setPoisonMode(m => !m);
          }}
          style={{ padding: "8px 12px", cursor: poisonDisabled ? "not-allowed" : "pointer" }}
        >
          ☠️ {poisonMode ? "Đang chọn mục tiêu" : "Bình giết"}
        </button>
      </div>
    ) : null;

  return {
    onPlayerClick,
    panel,
    playerPositionsProps: {
      dangerPlayerId: role === "Phù thủy" && phase === "night" ? witchPendingDeathTargetId : null,
      selectedOutlinePlayerId: role === "Phù thủy" && phase === "night" ? poisonSelectedTargetId : null,
    },
  };
}
