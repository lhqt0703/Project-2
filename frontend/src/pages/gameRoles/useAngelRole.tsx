import { useCallback, useMemo, useState } from "react";
import { socket, clientId } from "../../socket";
import type { AngelAlignmentGuess, AngelReviveStatePayload, GamePhase } from "./socketEvents";

const ANGEL_ROLE = "Thiên Sứ";

type RoomLike = {
  hostId?: string;
  players: Array<{ id: string; name: string }>;
};

function getPlayerName(room: RoomLike, playerId: string | null) {
  if (!playerId) return "người chơi này";
  return room.players.find((player) => player.id === playerId)?.name || "người chơi này";
}

export function useAngelRole({
  roomId,
  phase,
  role,
  room,
  deadPlayers,
  angelState,
}: {
  roomId: string | null;
  phase: GamePhase;
  role: string | null;
  room: RoomLike;
  deadPlayers: string[];
  angelState: AngelReviveStatePayload;
}) {
  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null);
  const [showChoiceModal, setShowChoiceModal] = useState(false);

  const canRevive = useMemo(() => {
    if (role !== ANGEL_ROLE) return false;
    if (phase !== "day") return false;
    if (!clientId || !deadPlayers.includes(clientId)) return false;
    return angelState.canRevive === true;
  }, [angelState.canRevive, deadPlayers, phase, role]);

  const onPlayerClick = useCallback((playerId: string) => {
    if (!canRevive) return false;
    if (!clientId) return true;
    if (playerId === clientId) return true;
    if (playerId === room.hostId) return true;
    if (!deadPlayers.includes(playerId)) return false;

    setSelectedTargetId(playerId);
    setShowChoiceModal(true);
    return true;
  }, [canRevive, deadPlayers, room.hostId]);

  const confirmChoice = useCallback((guess: AngelAlignmentGuess) => {
    if (!roomId || !selectedTargetId || !canRevive) return;
    socket.emit("angelChooseRevive", { roomId, targetId: selectedTargetId, guess });
    setShowChoiceModal(false);
  }, [canRevive, roomId, selectedTargetId]);

  const effectiveTargetId = (showChoiceModal ? selectedTargetId : null) || angelState.selectedTargetId;
  const targetName = getPlayerName(room, effectiveTargetId);
  const highlightedTargetId =
    canRevive && selectedTargetId && deadPlayers.includes(selectedTargetId)
      ? selectedTargetId
      : angelState.selectedTargetId;

  const modal = canRevive && showChoiceModal && selectedTargetId ? (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "rgba(0,0,0,0.32)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        style={{
          width: "min(92vw, 520px)",
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 14,
          padding: 24,
          boxShadow: "0 18px 50px rgba(0,0,0,0.24)",
        }}
      >
        <h2 style={{ marginTop: 0 }}>Thiên Sứ hồi sinh trong âm thầm</h2>
        <p style={{ lineHeight: 1.55, marginBottom: 18 }}>
          Bạn muốn âm thầm hồi sinh <strong>{targetName}</strong>. Hãy đoán phe thật của người này để quyết định điều kiện thắng của Thiên Sứ.
        </p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button onClick={() => confirmChoice("villagers")}>Đoán phe dân</button>
          <button onClick={() => confirmChoice("wolves")}>Đoán phe sói</button>
          <button onClick={() => setShowChoiceModal(false)}>Huỷ</button>
        </div>
        <div style={{ marginTop: 12, fontSize: 13, opacity: 0.72 }}>
          Hành động này không công khai ngay. Hãy cẩn thận đừng để lộ.
        </div>
      </div>
    </div>
  ) : null;

  const panel = useMemo(() => {
    if (canRevive) {
      return (
        <div style={{ marginTop: 10, padding: "8px 10px", borderRadius: 8, background: "rgba(255, 214, 102, 0.16)", border: "1px solid rgba(173, 120, 20, 0.28)" }}>
          <strong>Thiên Sứ:</strong> Bạn có thể âm thầm chọn một người đã chết để hồi sinh. Hãy cẩn thận đừng để lộ.
        </div>
      );
    }

    if (role === ANGEL_ROLE && angelState.selectedTargetId) {
      return (
        <div style={{ marginTop: 10, padding: "8px 10px", borderRadius: 8, background: "rgba(255, 214, 102, 0.12)", border: "1px solid rgba(173, 120, 20, 0.22)" }}>
          Bạn đã âm thầm chọn hồi sinh <strong>{targetName}</strong>. Người này sẽ hành động được từ đêm kế tiếp.
        </div>
      );
    }

    if (angelState.reviveStage === "pending") {
      return (
        <div style={{ marginTop: 10, padding: "8px 10px", borderRadius: 8, background: "rgba(255, 214, 102, 0.12)", border: "1px solid rgba(173, 120, 20, 0.22)" }}>
          Bạn đã được Thiên Sứ hồi sinh. Hãy chuẩn bị hành động và cẩn thận kẻo bị lộ.
        </div>
      );
    }

    if (angelState.reviveStage === "hidden") {
      return (
        <div style={{ marginTop: 10, padding: "8px 10px", borderRadius: 8, background: "rgba(255, 214, 102, 0.12)", border: "1px solid rgba(173, 120, 20, 0.22)" }}>
          Thiên Sứ đã đưa bạn trở lại trong âm thầm. Đêm nay bạn có thể hành động nếu vai trò có kỹ năng, nhưng hãy cẩn thận kẻo bị lộ.
        </div>
      );
    }

    return null;
  }, [angelState.reviveStage, angelState.selectedTargetId, canRevive, role, targetName]);

  return {
    onPlayerClick,
    modal,
    panel,
    playerPositionsProps: {
      selectedOutlinePlayerId: highlightedTargetId,
    },
  };
}
