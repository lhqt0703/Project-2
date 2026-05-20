import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { socket, clientId } from "../../socket";
import type { GamePhase } from "./socketEvents";

type Player = { id: string; name: string; connected?: boolean };

type RoomLike = {
  players: Player[];
  wolfVotes?: Record<string, string | null>;
  deadPlayers?: string[];
  banSoiWolfAligned?: boolean;
  wildWolfConvertAvailableTonight?: boolean;
  wildWolfConvertRequestedTonight?: boolean;
  wildWolfConvertedSelf?: boolean;
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
  wolfBadgeRoles,
  wolfMaxTargets,
  wolfBiteDisabled,
  allNightActionsSimultaneous,
  currentNightTurnRole,
  nightTurnPaused,
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
  wolfBadgeRoles?: Record<string, string>;
  wolfMaxTargets: number;
  wolfBiteDisabled: boolean;
  allNightActionsSimultaneous: boolean;
  currentNightTurnRole: string | null;
  nightTurnPaused: boolean;
}) {
  const [localSelectedTarget, setLocalSelectedTarget] = useState<string | null>(null);
  const [localSelectedTarget2, setLocalSelectedTarget2] = useState<string | null>(null);
  const [hasSubmittedLock, setHasSubmittedLock] = useState(false);
  const hasSubmittedLockRef = useRef(false);
  const [now, setNow] = useState(Date.now());

  const isBanSoiAligned = room.banSoiWolfAligned === true;
  const isWildWolfConverted = room.wildWolfConvertedSelf === true;
  const isWolfTeam = useMemo(() => {
    if (role === "Sói" || role === "Sói con" || role === "Sói Dại") return true;
    return role === "Bán sói" && (isBanSoiAligned || isWildWolfConverted);
  }, [isBanSoiAligned, isWildWolfConverted, role]);
  const isWildWolf = role === "Sói Dại";
  const wildWolfConversionRequested = room.wildWolfConvertRequestedTonight === true;

  useEffect(() => {
    // Chỉ tick khi cần hiển thị countdown cho sói
    if (!isWolfTeam || phase !== "night" || !wolfDeadline || nightTurnPaused) return;
    // Refresh immediately to avoid showing stale remaining seconds when phase switches quickly.
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [isWolfTeam, nightTurnPaused, phase, wolfDeadline]);

  const activeWolvesAlive = useMemo(() => {
    const effective = (activeWolves.length ? activeWolves : wolves)
      .filter(id => !deadPlayers.includes(id))
      .filter(id => room.players.find(p => p.id === id)?.connected !== false);
    return effective;
  }, [activeWolves, deadPlayers, room.players, wolves]);

  const isWolfTurnActive = useMemo(() => {
    if (phase !== "night") return false;
    if (wolfBiteDisabled) return false;
    if (allNightActionsSimultaneous) return true;
    return currentNightTurnRole === "Sói";
  }, [allNightActionsSimultaneous, currentNightTurnRole, phase, wolfBiteDisabled]);

  useEffect(() => {
    // Reset local selection only when wolf turn actually starts, not when deadline is adjusted on pause/resume.
    if (isWolfTeam && isWolfTurnActive) {
      setLocalSelectedTarget(null);
      setLocalSelectedTarget2(null);
      hasSubmittedLockRef.current = false;
      setHasSubmittedLock(false);
    }
  }, [isWolfTeam, isWolfTurnActive]);

  const isLocked = useMemo(() => {
    if (clientId && wolfLocked?.[clientId]) return true;
    return hasSubmittedLock;
  }, [hasSubmittedLock, wolfLocked]);

  const canAct = useMemo(() => {
    if (phase !== "night") return false;
    if (wolfBiteDisabled) return false;
    if (!isWolfTeam) return false;
    if (clientId && deadPlayers.includes(clientId)) return false;
    if (!allNightActionsSimultaneous) {
      if (currentNightTurnRole !== "Sói") return false;
    }
    return true;
  }, [allNightActionsSimultaneous, currentNightTurnRole, deadPlayers, isWolfTeam, phase, wolfBiteDisabled]);

  const deadlineReached = !!(wolfDeadline && Date.now() >= wolfDeadline && !nightTurnPaused);

  const onPlayerClick = useCallback((playerId: string) => {
    if (!canAct) return false;

    // không cho chọn chính mình
    if (playerId === clientId) return true;
    // không cho chọn sói khác
    if (wolves.includes(playerId)) return true;
    // lock vote rồi thì không được chọn nữa
    if (isLocked) return true;
    // hoặc là hết thời gian
    if (deadlineReached) return true;

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
  }, [canAct, deadlineReached, isLocked, localSelectedTarget, localSelectedTarget2, roomId, wolfMaxTargets, wolves]);

  const resetOnPhaseChange = useCallback((_nextPhase: GamePhase) => {
    setLocalSelectedTarget(null);
    setLocalSelectedTarget2(null);
    hasSubmittedLockRef.current = false;
    // wolf state is owned by parent sync layer
  }, []);

  const panel =
    isWolfTeam && isWolfTurnActive && clientId && !deadPlayers.includes(clientId) ? (
      <div style={{ marginTop: 12 }}>
        {wolfMaxTargets >= 2 && (
          <div style={{ marginBottom: 8 }}>
            <b>Đêm nay phe Sói được cắn 2 người</b> (do Sói con đã chết).
          </div>
        )}
        {isWildWolf && room.wildWolfConvertAvailableTonight && (
          <div style={{ marginBottom: 8 }}>
            <button
              disabled={!canAct || isLocked || hasSubmittedLock || deadlineReached}
              onClick={() => {
                if (isLocked || hasSubmittedLockRef.current || deadlineReached) return;
                if (!wildWolfConversionRequested && !localSelectedTarget) {
                  alert("Bạn cần chọn mục tiêu cắn chính trước.");
                  return;
                }
                socket.emit("wildWolfToggleConversion", { roomId, active: !wildWolfConversionRequested });
              }}
              style={{
                padding: "8px 12px",
                cursor: !canAct || isLocked || hasSubmittedLock || deadlineReached ? "not-allowed" : "pointer",
                opacity: !canAct || isLocked || hasSubmittedLock || deadlineReached ? 0.7 : 1,
                marginRight: 8,
              }}
            >
              {wildWolfConversionRequested ? "Hủy biến đổi" : "Biến mục tiêu cắn thành Sói thường"}
            </button>
            {wildWolfConversionRequested && (
              <span style={{ fontWeight: 700 }}>Đã chọn biến đổi mục tiêu cắn chính.</span>
            )}
          </div>
        )}
        <button
          disabled={isLocked || !canAct || deadlineReached}
          onClick={() => {
            if (isLocked) return;
            if (deadlineReached) return;
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
            const wildWolfNote = isWildWolf && wildWolfConversionRequested
              ? "\n\nSói Dại sẽ biến mục tiêu cắn chính thành Sói thường nếu vết cắn được tính."
              : "";
            const ok = window.confirm(
              name2
                ? `Bạn có chắc chắn muốn cắn ${name1} và ${name2}?${wildWolfNote}`
                : `Bạn có chắc chắn muốn cắn ${name1}?${wildWolfNote}`
            );
            if (ok) {
              hasSubmittedLockRef.current = true;
              setHasSubmittedLock(true);
              socket.emit("wolfLockVote", { roomId });
            }
          }}
          style={{
            marginTop: 8,
            padding: "8px 12px",
            cursor: isLocked || !canAct || deadlineReached ? "not-allowed" : "pointer",
            opacity: isLocked || !canAct || deadlineReached ? 0.7 : 1,
          }}
        >
          🐺 CẮN!
        </button>
        {wolfDeadline && (
          <div style={{ marginTop: 6 }}>
            Thời gian còn lại: {Math.max(0, Math.ceil((wolfDeadline - now) / 1000))}s {nightTurnPaused ? "(đang tạm ngưng)" : ""}
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
        isWolfTeam && isWolfTurnActive
          ? [localSelectedTarget, localSelectedTarget2].filter(Boolean)
          : [],
      showWolfVoteBadges: isWolfTeam && isWolfTurnActive,
      wolfVoteVoterIds: activeWolvesAlive,
      showWolfBadges: isWolfTeam && isWolfTurnActive,
      wolfBadgePlayerIds: wolves,
      wolfBadgeRoles: wolfBadgeRoles || {},
    },
  };
}
