import { useCallback, useEffect, useMemo, useState } from "react";
import { socket } from "../../socket";
import type { DayLockedUpdatedPayload, DayVotesUpdatedPayload, GamePhase, TrialVotesUpdatedPayload } from "./socketEvents";

type Player = { id: string; name: string; connected?: boolean };

type RoomLike = {
  players: Player[];
};

export function useDayVoteRole({
  roomId,
  phase,
  room,
  deadPlayers,
  dayVotes,
  dayLocked,
  dayDiscussionDeadline,
  dayDeadline,
  dayVoters,
  trialTargetId,
  trialStage,
  trialDefenseDeadline,
  trialVerdictDeadline,
  trialInteractionCut,
  trialInteractionActiveIds,
  trialSelectedInteractorId,
  trialSelectedInteractorIds,
  trialInteractionSelectionLimit,
  trialVotes,
}: {
  roomId: string | null;
  phase: GamePhase;
  room: RoomLike;
  deadPlayers: string[];
  dayVotes: DayVotesUpdatedPayload | null;
  dayLocked: DayLockedUpdatedPayload | null;
  dayDiscussionDeadline: number | null;
  dayDeadline: number | null;
  dayVoters: string[];
  trialTargetId: string | null;
  trialStage: "none" | "defense" | "verdict";
  trialDefenseDeadline: number | null;
  trialVerdictDeadline: number | null;
  trialInteractionCut: boolean;
  trialInteractionActiveIds: string[];
  trialSelectedInteractorId: string | null;
  trialSelectedInteractorIds: string[];
  trialInteractionSelectionLimit: number;
  trialVotes: TrialVotesUpdatedPayload | null;
}) {
  const [localSelectedTarget, setLocalSelectedTarget] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (phase !== "day") return;
    const hasAnyTimer = !!dayDiscussionDeadline || !!dayDeadline || !!trialDefenseDeadline || !!trialVerdictDeadline;
    if (!hasAnyTimer) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [phase, dayDiscussionDeadline, dayDeadline, trialDefenseDeadline, trialVerdictDeadline]);

  useEffect(() => {
    if (phase !== "day") {
      setLocalSelectedTarget(null);
      return;
    }
    const myId = socket.id;
    if (!myId) return;
    setLocalSelectedTarget(dayVotes?.[myId] ?? null);
  }, [dayVotes, phase]);

  const canAct = useMemo(() => {
    if (phase !== "day") return false;
    if (!socket.id) return false;
    if (!dayDeadline) return false;
    if (deadPlayers.includes(socket.id)) return false;
    if (dayVoters.length > 0 && !dayVoters.includes(socket.id)) return false;
    if (trialStage !== "none") return false;
    return true;
  }, [dayDeadline, dayVoters, deadPlayers, phase, trialStage]);

  const myTrialVote = socket.id ? (trialVotes?.[socket.id] ?? null) : null;

  const isTrialTarget = !!socket.id && !!trialTargetId && socket.id === trialTargetId;
  const alreadyChosenByTrialTarget = !!socket.id && trialSelectedInteractorIds.includes(socket.id);
  const canToggleInteraction =
    phase === "day" &&
    trialStage === "defense" &&
    !!socket.id &&
    !isTrialTarget &&
    !deadPlayers.includes(socket.id) &&
    !alreadyChosenByTrialTarget &&
    !trialInteractionCut;
  const hasInteracted = !!socket.id && trialInteractionActiveIds.includes(socket.id);
  const remainingInteractionTurns = Math.max(0, trialInteractionSelectionLimit - trialSelectedInteractorIds.length);

  const canVoteVerdict =
    phase === "day" &&
    trialStage === "verdict" &&
    !!socket.id &&
    !deadPlayers.includes(socket.id) &&
    !isTrialTarget;

  const onPlayerClick = useCallback((playerId: string) => {
    if (!socket.id) return false;

    if (trialStage === "defense" && isTrialTarget) {
      if (!trialInteractionActiveIds.includes(playerId)) return true;
      socket.emit("trialSelectInteractor", { roomId, targetId: playerId });
      return true;
    }

    if (!canAct) return false;

    if (playerId === socket.id) return true;
    if (deadPlayers.includes(playerId)) return true;

    if (dayLocked?.[socket.id]) return true;
    if (dayDeadline && Date.now() >= dayDeadline) return true;

    if (localSelectedTarget === playerId) {
      setLocalSelectedTarget(null);
      socket.emit("dayChooseTarget", { roomId, targetId: null });
      return true;
    }

    setLocalSelectedTarget(playerId);
    socket.emit("dayChooseTarget", { roomId, targetId: playerId });
    return true;
  }, [canAct, dayDeadline, dayLocked, deadPlayers, isTrialTarget, localSelectedTarget, roomId, trialInteractionActiveIds, trialStage]);

  const activeCountdownDeadline = useMemo(() => {
    if (trialStage === "verdict") return trialVerdictDeadline;
    if (trialStage === "defense") return trialDefenseDeadline;
    if (dayDeadline) return dayDeadline;
    return dayDiscussionDeadline;
  }, [dayDeadline, dayDiscussionDeadline, trialDefenseDeadline, trialStage, trialVerdictDeadline]);

  const panel =
    phase === "day" && socket.id && !deadPlayers.includes(socket.id) ? (
      <div style={{ marginTop: 12 }}>
        {trialStage === "none" && (
          <>
            {!dayDeadline && !!dayDiscussionDeadline && (
              <div style={{ marginTop: 6, opacity: 0.9 }}>
                Đang thảo luận, chưa đến giai đoạn biểu quyết.
              </div>
            )}
            {dayDeadline && (
              <>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button
                    onClick={() => {
                      if (!localSelectedTarget) {
                        alert("Bạn chưa chọn mục tiêu biểu quyết.");
                        return;
                      }
                      const targetName = room.players.find(p => p.id === localSelectedTarget)?.name || "người chơi";
                      const ok = window.confirm(`Xác nhận biểu quyết loại ${targetName}?`);
                      if (!ok) return;
                      socket.emit("dayLockVote", { roomId });
                    }}
                    style={{ marginTop: 8, padding: "8px 12px", cursor: "pointer" }}
                    disabled={!!dayLocked?.[socket.id]}
                  >
                    🗳️ Khóa phiếu biểu quyết
                  </button>
                  <button
                    onClick={() => {
                      socket.emit("dayChooseTarget", { roomId, targetId: null });
                      socket.emit("dayLockVote", { roomId });
                    }}
                    style={{ marginTop: 8, padding: "8px 12px", cursor: "pointer" }}
                    disabled={!!dayLocked?.[socket.id]}
                  >
                    ⭕ Bỏ phiếu trống
                  </button>
                </div>
                {dayLocked?.[socket.id] && (
                  <div style={{ marginTop: 6, opacity: 0.85 }}>Bạn đã khóa phiếu.</div>
                )}
              </>
            )}
          </>
        )}

        {trialStage === "defense" && (
          <>
            <div style={{ marginTop: 6, opacity: 0.85 }}>
              Lượt tương tác còn lại của bị cáo: {remainingInteractionTurns}
            </div>
            {!isTrialTarget && (
              <button
                onClick={() => {
                  if (!canToggleInteraction) return;
                  socket.emit("trialToggleInteraction", { roomId, active: !hasInteracted });
                }}
                style={{ marginTop: 8, padding: "8px 12px", cursor: "pointer" }}
                disabled={!canToggleInteraction}
              >
                {alreadyChosenByTrialTarget
                  ? "Đã tương tác"
                  : hasInteracted
                    ? "Hủy tương tác"
                    : "Tương tác"}
              </button>
            )}
            {isTrialTarget && (
              <button
                onClick={() => socket.emit("trialCutInteraction", { roomId })}
                style={{ marginTop: 8, padding: "8px 12px", cursor: "pointer" }}
              >
                ✂️ Cắt tương tác
              </button>
            )}
          </>
        )}

        {trialStage === "verdict" && canVoteVerdict && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              onClick={() => socket.emit("trialVoteLifeDeath", { roomId, vote: "live" })}
              style={{ marginTop: 8, padding: "8px 12px", cursor: "pointer" }}
            >
              ✅ Vote Sống{myTrialVote === "live" ? " (đã chọn)" : ""}
            </button>
            <button
              onClick={() => socket.emit("trialVoteLifeDeath", { roomId, vote: "die" })}
              style={{ marginTop: 8, padding: "8px 12px", cursor: "pointer" }}
            >
              ☠️ Vote Chết{myTrialVote === "die" ? " (đã chọn)" : ""}
            </button>
          </div>
        )}

        {activeCountdownDeadline && (
          <div style={{ marginTop: 6 }}>
            {trialStage === "none" && !dayDeadline ? "Thời gian thảo luận còn lại" : "Thời gian còn lại"}: {Math.max(0, Math.ceil((activeCountdownDeadline - now) / 1000))}s
          </div>
        )}
      </div>
    ) : null;

  return {
    onPlayerClick,
    panel,
    playerPositionsProps: {
      selectedOutlinePlayerId:
        phase === "day" && trialStage === "none" && !!dayDeadline
          ? localSelectedTarget
          : null,
      showWolfVoteBadges: phase === "day" && !!dayDeadline,
      wolfVoteVoterIds: phase === "day" && !!dayDeadline ? dayVoters : [],
      trialOrangePlayerId: trialTargetId,
      trialWhitePlayerIds: trialInteractionActiveIds,
      trialGreenPlayerId: trialSelectedInteractorId,
    },
  };
}
