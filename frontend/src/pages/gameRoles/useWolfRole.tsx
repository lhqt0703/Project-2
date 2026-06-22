import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { socket, clientId } from "../../socket";
import type { GamePhase } from "./socketEvents";
import { AvifIcon } from "../../components/AvifIcon";


type Player = { id: string; name: string; connected?: boolean };

type RoomLike = {
  players: Player[];
  wolfVotes?: Record<string, string | null>;
  wolfVotes2?: Record<string, string | null>;
  deadPlayers?: string[];
  banSoiWolfAligned?: boolean;
  wildWolfConvertAvailableTonight?: boolean;
  wildWolfConvertRequestedTonight?: boolean;
  wildWolfConvertedSelf?: boolean;
  gameRules?: {
    wolfNightActionDurationSec?: number;
  };
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
  nightActionNow,
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
  nightActionNow: number;
}) {
  const [localSelectedTarget, setLocalSelectedTarget] = useState<string | null>(null);
  const [localSelectedTarget2, setLocalSelectedTarget2] = useState<string | null>(null);
  const [hasSubmittedLock, setHasSubmittedLock] = useState(false);
  const hasSubmittedLockRef = useRef(false);
  const [wildWolfConversionPickerOpen, setWildWolfConversionPickerOpen] = useState(false);
  const [wildWolfLocalConversionTarget, setWildWolfLocalConversionTarget] = useState<string | null>(null);

  const isBanSoiAligned = room.banSoiWolfAligned === true;
  const isWildWolfConverted = room.wildWolfConvertedSelf === true;
  const isWolfTeam = useMemo(() => {
    if (role === "Sói" || role === "Sói con" || role === "Sói Dại") return true;
    return role === "Bán sói" && (isBanSoiAligned || isWildWolfConverted);
  }, [isBanSoiAligned, isWildWolfConverted, role]);
  const isWildWolf = role === "Sói Dại";
  const wildWolfConversionRequested = room.wildWolfConvertRequestedTonight === true;
  const wolfDurationSec =
    typeof room.gameRules?.wolfNightActionDurationSec === "number"
      ? Math.max(0, room.gameRules.wolfNightActionDurationSec)
      : null;

  const activeWolvesAlive = useMemo(() => {
    const effective = (activeWolves.length ? activeWolves : wolves)
      .filter(id => !deadPlayers.includes(id))
      .filter(id => room.players.find(p => p.id === id)?.connected !== false);
    return effective;
  }, [activeWolves, deadPlayers, room.players, wolves]);

  const isWolfTurnActive = useMemo(() => {
    if (roomId === "mock-8") return phase === "night";
    if (phase !== "night") return false;
    if (wolfBiteDisabled) return false;
    if (allNightActionsSimultaneous) return true;
    return currentNightTurnRole === "Sói";
  }, [allNightActionsSimultaneous, currentNightTurnRole, phase, wolfBiteDisabled, roomId]);

  useEffect(() => {
    // Reset local selection only when wolf turn actually starts, not when deadline is adjusted on pause/resume.
    if (isWolfTeam && isWolfTurnActive) {
      setLocalSelectedTarget(null);
      setLocalSelectedTarget2(null);
      setWildWolfConversionPickerOpen(false);
      setWildWolfLocalConversionTarget(null);
      hasSubmittedLockRef.current = false;
      setHasSubmittedLock(false);
    }
  }, [isWolfTeam, isWolfTurnActive]);

  useEffect(() => {
    // If the server says we are unlocked, sync our local lock state.
    if (clientId && wolfLocked) {
      const serverLocked = !!wolfLocked[clientId];
      if (!serverLocked && hasSubmittedLock) {
        setHasSubmittedLock(false);
        hasSubmittedLockRef.current = false;
      }
    }
  }, [clientId, wolfLocked, hasSubmittedLock]);

  const isLocked = useMemo(() => {
    if (clientId && wolfLocked?.[clientId]) return true;
    return hasSubmittedLock;
  }, [hasSubmittedLock, wolfLocked]);

  const canAct = useMemo(() => {
    if (roomId === "mock-8") return isWolfTeam && phase === "night";
    if (phase !== "night") return false;
    if (wolfBiteDisabled) return false;
    if (!isWolfTeam) return false;
    if (clientId && deadPlayers.includes(clientId)) return false;
    if (!allNightActionsSimultaneous) {
      if (currentNightTurnRole !== "Sói") return false;
    }
    return true;
  }, [allNightActionsSimultaneous, currentNightTurnRole, deadPlayers, isWolfTeam, phase, wolfBiteDisabled, roomId]);

  const deadlineReached = !!(wolfDeadline && nightActionNow >= wolfDeadline && !nightTurnPaused);
  const effectiveSelectedTarget = localSelectedTarget || (clientId ? room.wolfVotes?.[clientId] || null : null);
  const effectiveSelectedTarget2 = localSelectedTarget2 || (clientId ? room.wolfVotes2?.[clientId] || null : null);
  const wildWolfConversionCandidateIds = useMemo(
    () =>
      (wolfMaxTargets >= 2
        ? [effectiveSelectedTarget, effectiveSelectedTarget2]
        : [effectiveSelectedTarget]
      ).filter((targetId): targetId is string => !!targetId),
    [effectiveSelectedTarget, effectiveSelectedTarget2, wolfMaxTargets]
  );
  const wildWolfConversionCandidateNames = useMemo(
    () =>
      Object.fromEntries(
        wildWolfConversionCandidateIds.map((targetId) => [
          targetId,
          room.players.find((p) => p.id === targetId)?.name || "đối tượng",
        ])
      ),
    [room.players, wildWolfConversionCandidateIds]
  );
  const wildWolfHalfTimeReached = useMemo(() => {
    if (!wolfDeadline || !wolfDurationSec || wolfDurationSec <= 0) return false;
    const durationMs = Math.floor(wolfDurationSec * 1000);
    return nightActionNow >= wolfDeadline - durationMs / 2;
  }, [nightActionNow, wolfDeadline, wolfDurationSec]);
  const shouldPulseWildWolfConversion =
    isWildWolf &&
    room.wildWolfConvertAvailableTonight === true &&
    !wildWolfConversionRequested &&
    !deadlineReached &&
    !nightTurnPaused &&
    (wolfDurationSec === 0 || wildWolfHalfTimeReached);
  const canPressWildWolfConversion = roomId === "mock-8" ? true : (canAct && !deadlineReached);

  useEffect(() => {
    if (!wildWolfLocalConversionTarget) return;
    if (wildWolfConversionCandidateIds.includes(wildWolfLocalConversionTarget)) return;
    setWildWolfLocalConversionTarget(null);
  }, [wildWolfConversionCandidateIds, wildWolfLocalConversionTarget]);

  const onPlayerClick = useCallback((playerId: string) => {
    if (!canAct) return false;

    // không cho chọn chính mình
    if (playerId === clientId && roomId !== "mock-8") return true;
    // không cho chọn sói khác (trừ khi luật wolfCanBiteWolf được bật)
    if (!room.gameRules?.wolfCanBiteWolf && wolves.includes(playerId) && roomId !== "mock-8") return true;
    // lock vote rồi thì không được chọn nữa
    if (isLocked) return true;
    // hoặc là hết thời gian
    if (deadlineReached) return true;

    if (roomId === "mock-8") {
      setLocalSelectedTarget(playerId);
      return true;
    }

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
      if (!room.gameRules?.wolfCanBiteWolf && isWolfTeamTarget) return true;

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
    setWildWolfConversionPickerOpen(false);
    setWildWolfLocalConversionTarget(null);
    hasSubmittedLockRef.current = false;
    // wolf state is owned by parent sync layer
  }, []);

  const panel =
    isWolfTeam && isWolfTurnActive && clientId && !deadPlayers.includes(clientId) ? (
      <div style={{ marginTop: 12 }}>
        {wolfMaxTargets >= 2 && (
          <div
            style={{
              marginTop: 10,
              marginBottom: 10,
              padding: "8px 10px",
              borderRadius: 8,
              background: "rgba(255, 214, 102, 0.12)",
              border: "1px solid rgba(173, 120, 20, 0.22)",
            }}
          >
            <b>Đêm nay phe Sói được cắn 2 người</b> (do Sói con đã chết).
          </div>
        )}
        {isWildWolf && room.wildWolfConvertAvailableTonight && (
          <div style={{ marginBottom: 8 }}>
            {shouldPulseWildWolfConversion && (
              <style>{`
                @keyframes wildWolfConversionPulse {
                  0%, 100% {
                    opacity: 0.42;
                    box-shadow:
                      inset 0 0 0 2px rgba(236, 58, 58, 0.62),
                      inset 0 0 12px 4px rgba(236, 58, 58, 0.22);
                  }
                  50% {
                    opacity: 0.84;
                    box-shadow:
                      inset 0 0 0 3px rgba(255, 79, 79, 0.9),
                      inset 0 0 18px 6px rgba(255, 49, 49, 0.34);
                  }
                }
              `}</style>
            )}
            <button
              disabled={!canPressWildWolfConversion}
              onClick={() => {
                if (!canPressWildWolfConversion) return;
                if (roomId === "mock-8") {
                  alert("Đã bấm chọn lây nhiễm (giả lập)");
                  return;
                }
                if (wildWolfConversionRequested) {
                  setWildWolfConversionPickerOpen(false);
                  setWildWolfLocalConversionTarget(null);
                  socket.emit("wildWolfToggleConversion", { roomId, active: false });
                  return;
                }
                if (wildWolfConversionCandidateIds.length === 0) {
                  alert("Bạn cần chọn mục tiêu cắn trước.");
                  return;
                }
                if (wolfMaxTargets >= 2) {
                  setWildWolfConversionPickerOpen(true);
                  return;
                }
                const targetId = wildWolfConversionCandidateIds[0];
                setWildWolfLocalConversionTarget(targetId);
                socket.emit("wildWolfToggleConversion", { roomId, active: true, targetId });
              }}
              style={{
                padding: "8px 12px",
                cursor: !canPressWildWolfConversion ? "not-allowed" : "pointer",
                opacity: !canPressWildWolfConversion ? 0.7 : 1,
                marginRight: 8,
                borderRadius: 8,
                border: "1px solid rgba(236, 58, 58, 0.45)",
                animation: shouldPulseWildWolfConversion ? "wildWolfConversionPulse 1.1s ease-in-out infinite" : undefined,
              }}
            >
              {wildWolfConversionRequested
                ? "Hủy lây nhiễm"
                : wolfMaxTargets >= 2
                  ? "Chọn mục tiêu lây nhiễm"
                  : "Biến mục tiêu thành Sói"}
            </button>
            {wildWolfConversionRequested && (
              <span style={{ fontWeight: 700 }}>
                Đã xác nhận mục tiêu sẽ lây nhiễm
                {wildWolfLocalConversionTarget ? `: ${wildWolfConversionCandidateNames[wildWolfLocalConversionTarget] || "đối tượng"}` : ""}
              </span>
            )}
            {wildWolfConversionPickerOpen && !wildWolfConversionRequested && (
              <div
                style={{
                  marginTop: 8,
                  padding: "8px 10px",
                  borderRadius: 8,
                  background: "rgba(236, 58, 58, 0.08)",
                  border: "1px solid rgba(236, 58, 58, 0.2)",
                }}
              >
                <div style={{ fontWeight: 700, marginBottom: 6 }}>Sói Dại chỉ được lây nhiễm 1 mục tiêu bị cắn.</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {wildWolfConversionCandidateIds.map((targetId) => (
                    <button
                      key={targetId}
                      type="button"
                      onClick={() => {
                        setWildWolfLocalConversionTarget(targetId);
                        setWildWolfConversionPickerOpen(false);
                        socket.emit("wildWolfToggleConversion", { roomId, active: true, targetId });
                      }}
                      style={{ padding: "6px 10px", borderRadius: 8 }}
                    >
                      Lây nhiễm {wildWolfConversionCandidateNames[targetId] || "đối tượng"}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => {
                      setWildWolfLocalConversionTarget(null);
                      setWildWolfConversionPickerOpen(false);
                      socket.emit("wildWolfToggleConversion", { roomId, active: false });
                    }}
                    style={{ padding: "6px 10px", borderRadius: 8, opacity: 0.82 }}
                  >
                    Không lây nhiễm đêm nay
                  </button>
                </div>
              </div>
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
              ? "\n\nSói Dại sẽ biến mục tiêu đã chọn lây nhiễm thành Sói thường nếu vết cắn được tính."
              : "";
            const ok = window.confirm(
              name2
                ? `Bạn có chắc chắn muốn cắn ${name1} và ${name2}?${wildWolfNote}`
                : `Bạn có chắc chắn muốn cắn ${name1}?${wildWolfNote}`
            );
            if (ok) {
              hasSubmittedLockRef.current = true;
              setHasSubmittedLock(true);
              if (roomId !== "mock-8") {
                socket.emit("wolfLockVote", { roomId });
              }
            }
          }}
          style={{
            padding: "8px 12px",
            cursor: isLocked || !canAct || deadlineReached ? "not-allowed" : "pointer",
            opacity: isLocked || !canAct || deadlineReached ? 0.7 : 1,
          }}
        >
          <AvifIcon name="🐺" style={{ marginRight: 4 }} /> CẮN!
        </button>
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
      showWolfVoteBadges: isWolfTeam && isWolfTurnActive && !!clientId && !deadPlayers.includes(clientId),
      wolfVoteVoterIds: activeWolvesAlive,
      showWolfBadges: isWolfTeam && isWolfTurnActive && !!clientId && !deadPlayers.includes(clientId),
      wolfBadgePlayerIds: wolves,
      wolfBadgeRoles: wolfBadgeRoles || {},
    },
  };
}
