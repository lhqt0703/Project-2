import { useCallback, useEffect, useMemo, useState } from "react";
import { socket } from "../../socket";
import type { GamePhase } from "./socketEvents";

type Player = { id: string; name: string; connected?: boolean };

type RoomLike = {
  players: Player[];
  wolfVotes?: Record<string, string | null>;
  deadPlayers?: string[];
};

export function useWolfRole({
  roomId,
  phase,
  role,
  room,
  deadPlayers,
  wolfLocked,
  wolfDeadline,
  wolves,
  activeWolves,
}: {
  roomId: string | null;
  phase: GamePhase;
  role: string | null;
  room: RoomLike;
  deadPlayers: string[];
  wolfLocked: Record<string, boolean> | null;
  wolfDeadline: number | null;
  wolves: string[];
  activeWolves: string[];
}) {
  const [localSelectedTarget, setLocalSelectedTarget] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    // Chỉ tick khi cần hiển thị countdown cho sói
    if (role !== "Sói" || phase !== "night" || !wolfDeadline) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [phase, role, wolfDeadline]);

  const activeWolvesAlive = useMemo(() => {
    const effective = (activeWolves.length ? activeWolves : wolves)
      .filter(id => !deadPlayers.includes(id))
      .filter(id => room.players.find(p => p.id === id)?.connected !== false);
    return effective;
  }, [activeWolves, deadPlayers, room.players, wolves]);

  useEffect(() => {
    // Reset local selection when wolf phase starts (deadline changes)
    if (role === "Sói" && phase === "night") {
      setLocalSelectedTarget(null);
    }
  }, [phase, role, wolfDeadline]);

  const canAct = useMemo(() => {
    if (phase !== "night") return false;
    if (role !== "Sói") return false;
    if (socket.id && deadPlayers.includes(socket.id)) return false;
    return true;
  }, [deadPlayers, phase, role]);

  const onPlayerClick = useCallback((playerId: string) => {
    if (!canAct) return false;

    // không cho chọn chính mình
    if (playerId === socket.id) return true;
    // không cho chọn sói khác
    if (wolves.includes(playerId)) return true;
    // lock vote rồi thì không được chọn nữa
    if (socket.id && wolfLocked?.[socket.id]) return true;
    // hoặc là hết thời gian
    if (wolfDeadline && Date.now() >= wolfDeadline) return true;

    setLocalSelectedTarget(playerId);
    socket.emit("wolfChooseTarget", { roomId, targetId: playerId });
    return true;
  }, [canAct, roomId, wolfDeadline, wolfLocked, wolves]);

  const resetOnPhaseChange = useCallback((_nextPhase: GamePhase) => {
    setLocalSelectedTarget(null);
    // wolf state is owned by parent sync layer
  }, []);

  const panel =
    role === "Sói" && phase === "night" && socket.id && !deadPlayers.includes(socket.id) ? (
      <div style={{ marginTop: 12 }}>
        <div>
          Chọn người để cắn: <b>{localSelectedTarget ? room.players.find(p => p.id === localSelectedTarget)?.name || "?" : "Chưa chọn"}</b>
        </div>
        <button
          onClick={() => {
            if (!localSelectedTarget) {
              alert("Bạn chưa chọn mục tiêu để cắn.");
              return;
            }
            const ok = window.confirm(
              `Bạn có chắc chắn muốn cắn ${room.players.find(p => p.id === localSelectedTarget)?.name || "đối tượng"}?`
            );
            if (ok) {
              socket.emit("wolfLockVote", { roomId });
            }
          }}
          style={{ marginTop: 8, padding: "8px 12px", cursor: "pointer" }}
        >
          🐺 CẮN!
        </button>
        {wolfDeadline && (
          <div style={{ marginTop: 6 }}>
            Thời gian còn lại: {Math.max(0, Math.ceil((wolfDeadline - now) / 1000))}s
          </div>
        )}
      </div>
    ) : null;

  return {
    onPlayerClick,
    panel,
    resetOnPhaseChange,
    playerPositionsProps: {
      selectedOutlinePlayerId: role === "Sói" && phase === "night" ? localSelectedTarget : null,
      showWolfVoteBadges: role === "Sói" && phase === "night",
      wolfVoteVoterIds: activeWolvesAlive,
      showWolfBadges: role === "Sói" && phase === "night",
      wolfBadgePlayerIds: wolves,
    },
  };
}
