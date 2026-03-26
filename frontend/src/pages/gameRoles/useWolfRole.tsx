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
  wolfMaxTargets,
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
  wolfMaxTargets: number;
}) {
  const [localSelectedTarget, setLocalSelectedTarget] = useState<string | null>(null);
  const [localSelectedTarget2, setLocalSelectedTarget2] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());

  const isWolfTeam = useMemo(() => role === "Sói" || role === "Sói con" || role === "Bán sói", [role]);

  useEffect(() => {
    // Chỉ tick khi cần hiển thị countdown cho sói
    if (!isWolfTeam || phase !== "night" || !wolfDeadline) return;
    // Refresh immediately to avoid showing stale remaining seconds when phase switches quickly.
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [isWolfTeam, phase, wolfDeadline]);

  const activeWolvesAlive = useMemo(() => {
    const effective = (activeWolves.length ? activeWolves : wolves)
      .filter(id => !deadPlayers.includes(id))
      .filter(id => room.players.find(p => p.id === id)?.connected !== false);
    return effective;
  }, [activeWolves, deadPlayers, room.players, wolves]);

  useEffect(() => {
    // Reset local selection when wolf phase starts (deadline changes)
    if (isWolfTeam && phase === "night") {
      setLocalSelectedTarget(null);
      setLocalSelectedTarget2(null);
    }
  }, [isWolfTeam, phase, wolfDeadline]);

  const canAct = useMemo(() => {
    if (phase !== "night") return false;
    if (!isWolfTeam) return false;
    if (socket.id && deadPlayers.includes(socket.id)) return false;
    return true;
  }, [deadPlayers, isWolfTeam, phase]);

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

    const isWolfTeamTarget = wolves.includes(playerId);

    // If bonus night: allow selecting up to 2 different targets.
    if (wolfMaxTargets >= 2) {
      // Click same as first => clear both (simple reset)
      if (playerId === localSelectedTarget) {
        setLocalSelectedTarget(null);
        setLocalSelectedTarget2(null);
        socket.emit("wolfChooseTarget", { roomId, targetId: null });
        socket.emit("wolfChooseTarget2", { roomId, targetId: null });
        return true;
      }

      // Click same as second => clear second
      if (playerId === localSelectedTarget2) {
        setLocalSelectedTarget2(null);
        socket.emit("wolfChooseTarget2", { roomId, targetId: null });
        return true;
      }

      // Prevent selecting wolves (already handled), but keep explicit for readability.
      if (isWolfTeamTarget) return true;

      // Fill first then second
      if (!localSelectedTarget) {
        setLocalSelectedTarget(playerId);
        socket.emit("wolfChooseTarget", { roomId, targetId: playerId });
        return true;
      }

      // Must be different from first
      if (playerId === localSelectedTarget) return true;

      setLocalSelectedTarget2(playerId);
      socket.emit("wolfChooseTarget2", { roomId, targetId: playerId });
      return true;
    }

    // Normal night (1 target)
    setLocalSelectedTarget(playerId);
    socket.emit("wolfChooseTarget", { roomId, targetId: playerId });
    return true;
  }, [canAct, localSelectedTarget, localSelectedTarget2, roomId, wolfDeadline, wolfLocked, wolfMaxTargets, wolves]);

  const resetOnPhaseChange = useCallback((_nextPhase: GamePhase) => {
    setLocalSelectedTarget(null);
    setLocalSelectedTarget2(null);
    // wolf state is owned by parent sync layer
  }, []);

  const panel =
    isWolfTeam && phase === "night" && socket.id && !deadPlayers.includes(socket.id) ? (
      <div style={{ marginTop: 12 }}>
        {wolfMaxTargets >= 2 && (
          <div style={{ marginBottom: 8 }}>
            <b>Đêm nay phe Sói được cắn 2 người</b> (do Sói con đã chết).
          </div>
        )}
        <button
          onClick={() => {
            if (!localSelectedTarget) {
              alert("Bạn chưa chọn mục tiêu để cắn.");
              return;
            }
            if (wolfMaxTargets >= 2 && !localSelectedTarget2) {
              const ok2 = window.confirm(
                "Đêm nay bạn có thể chọn 2 mục tiêu. Bạn vẫn chưa chọn mục tiêu thứ 2. Vẫn xác nhận CẮN chứ?"
              );
              if (!ok2) return;
            }
            const name1 = room.players.find(p => p.id === localSelectedTarget)?.name || "đối tượng";
            const name2 = localSelectedTarget2 ? (room.players.find(p => p.id === localSelectedTarget2)?.name || "đối tượng") : null;
            const ok = window.confirm(
              name2
                ? `Bạn có chắc chắn muốn cắn ${name1} và ${name2}?`
                : `Bạn có chắc chắn muốn cắn ${name1}?`
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
      selectedOutlinePlayerIds:
        isWolfTeam && phase === "night"
          ? [localSelectedTarget, localSelectedTarget2].filter(Boolean)
          : [],
      showWolfVoteBadges: isWolfTeam && phase === "night",
      wolfVoteVoterIds: activeWolvesAlive,
      showWolfBadges: isWolfTeam && phase === "night",
      wolfBadgePlayerIds: wolves,
    },
  };
}
