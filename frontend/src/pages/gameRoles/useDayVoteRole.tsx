import { useCallback, useEffect, useMemo, useState } from "react";
import { socket, clientId } from "../../socket";
import type { DayLockedUpdatedPayload, DayVotesUpdatedPayload, GamePhase, TrialVotesUpdatedPayload } from "./socketEvents";
import StarBorder from "../../components/StarBorder";
import { AvifIcon } from "../../components/AvifIcon";


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
  serverTimeOffset = 0,
  dayPaused = false,
  dayRemainingMs = null,
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
  serverTimeOffset?: number;
  dayPaused?: boolean;
  dayRemainingMs?: number | null;
}) {
  const [localSelectedTarget, setLocalSelectedTarget] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now() + serverTimeOffset);

  useEffect(() => {
    if (phase !== "day") return;
    if (dayPaused) return;
    const hasAnyTimer = !!dayDiscussionDeadline || !!dayDeadline || !!trialDefenseDeadline || !!trialVerdictDeadline;
    if (!hasAnyTimer) return;
    setNow(Date.now() + serverTimeOffset);
    const t = setInterval(() => setNow(Date.now() + serverTimeOffset), 1000);
    return () => clearInterval(t);
  }, [phase, dayDiscussionDeadline, dayDeadline, trialDefenseDeadline, trialVerdictDeadline, serverTimeOffset, dayPaused]);

  useEffect(() => {
    if (phase !== "day") {
      setLocalSelectedTarget(null);
      return;
    }
    const myId = clientId;
    if (!myId) return;
    setLocalSelectedTarget(dayVotes?.[myId] ?? null);
  }, [dayVotes, phase]);

  const canAct = useMemo(() => {
    if (phase !== "day") return false;
    if (!clientId) return false;
    if (!dayDeadline) return false;
    if (deadPlayers.includes(clientId)) return false;
    if (dayVoters.length > 0 && !dayVoters.includes(clientId)) return false;
    if (trialStage !== "none") return false;
    return true;
  }, [dayDeadline, dayVoters, deadPlayers, phase, trialStage]);

  const myTrialVote = clientId ? (trialVotes?.[clientId] ?? null) : null;

  const isTrialTarget = !!clientId && !!trialTargetId && clientId === trialTargetId;
  const alreadyChosenByTrialTarget = !!clientId && trialSelectedInteractorIds.includes(clientId);
  const canToggleInteraction =
    phase === "day" &&
    trialStage === "defense" &&
    !!clientId &&
    !isTrialTarget &&
    !deadPlayers.includes(clientId) &&
    !alreadyChosenByTrialTarget &&
    !trialInteractionCut;
  const hasInteracted = !!clientId && trialInteractionActiveIds.includes(clientId);
  const remainingInteractionTurns = Math.max(0, trialInteractionSelectionLimit - trialSelectedInteractorIds.length);

  const canVoteVerdict =
    phase === "day" &&
    trialStage === "verdict" &&
    !!clientId &&
    !deadPlayers.includes(clientId) &&
    !isTrialTarget;

  const onPlayerClick = useCallback((playerId: string) => {
    if (!clientId) return false;

    if (trialStage === "defense" && isTrialTarget) {
      if (!trialInteractionActiveIds.includes(playerId)) return true;
      socket.emit("trialSelectInteractor", { roomId, targetId: playerId });
      return true;
    }

    if (!canAct) return false;

    if (playerId === clientId) return true;
    if (deadPlayers.includes(playerId)) return true;

    if (dayLocked?.[clientId]) return true;
    if (dayDeadline && Date.now() + serverTimeOffset >= dayDeadline) return true;

    if (localSelectedTarget === playerId) {
      setLocalSelectedTarget(null);
      socket.emit("dayChooseTarget", { roomId, targetId: null });
      return true;
    }

    setLocalSelectedTarget(playerId);
    socket.emit("dayChooseTarget", { roomId, targetId: playerId });
    return true;
  }, [canAct, dayDeadline, dayLocked, deadPlayers, isTrialTarget, localSelectedTarget, roomId, trialInteractionActiveIds, trialStage, serverTimeOffset]);

  const activeCountdownDeadline = useMemo(() => {
    if (trialStage === "verdict") return trialVerdictDeadline;
    if (trialStage === "defense") return trialDefenseDeadline;
    if (dayDeadline) return dayDeadline;
    return dayDiscussionDeadline;
  }, [dayDeadline, dayDiscussionDeadline, trialDefenseDeadline, trialStage, trialVerdictDeadline]);

  const remainingSec = useMemo(() => {
    if (dayPaused) {
      if (dayRemainingMs == null) return 0;
      return Math.max(0, Math.ceil(dayRemainingMs / 1000));
    }
    if (!activeCountdownDeadline) return null;
    return Math.max(0, Math.ceil((activeCountdownDeadline - now) / 1000));
  }, [dayPaused, dayRemainingMs, activeCountdownDeadline, now]);

  const panel =
    phase === "day" && clientId && !deadPlayers.includes(clientId) ? (
      <div>
        {trialStage === "none" && (
          <>
            {dayDeadline && (
              <>
                <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between" }}>
                  <button
                    onClick={() => {
                      if (!localSelectedTarget) {
                        alert("Bạn chưa chọn mục tiêu biểu quyết.");
                        return;
                      }
                      const targetName = room.players.find(p => p.id === localSelectedTarget)?.name || "người chơi";
                      const ok = window.confirm(`Xác nhận chọn biểu quyết ${targetName}?`);
                      if (!ok) return;
                      socket.emit("dayLockVote", { roomId });
                    }}
                    style={{ margin: "4px 0", padding: "8px 12px", cursor: "pointer" }}
                    disabled={!!dayLocked?.[clientId]}
                  >
                    <AvifIcon name="🗳️" style={{ marginRight: 4 }} /> Chốt biểu quyết
                  </button>
                  <button
                    onClick={() => {
                      socket.emit("dayChooseTarget", { roomId, targetId: null });
                      socket.emit("dayLockVote", { roomId });
                    }}
                    style={{ margin: "4px 0", padding: "8px 12px", cursor: "pointer" }}
                    disabled={!!dayLocked?.[clientId]}
                  >
                    ⭕ Bỏ phiếu trống
                  </button>
                </div>
                {dayLocked?.[clientId] && (
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
              alreadyChosenByTrialTarget || hasInteracted ? (
                <button
                  onClick={() => {
                    if (!canToggleInteraction) return;
                    socket.emit("trialToggleInteraction", { roomId, active: !hasInteracted });
                  }}
                  style={{ marginTop: 8, padding: "8px 12px", cursor: "pointer" }}
                  disabled={!canToggleInteraction}
                >
                  {alreadyChosenByTrialTarget ? "Đã tương tác" : "Hủy tương tác"}
                </button>
              ) : (
                <StarBorder
                  as="button"
                  onClick={() => {
                    if (!canToggleInteraction) return;
                    socket.emit("trialToggleInteraction", { roomId, active: !hasInteracted });
                  }}
                  style={{ marginTop: 8, cursor: "pointer" }}
                  disabled={!canToggleInteraction}
                  color="white"
                  speed="6s"
                >
                  Tương tác
                </StarBorder>
              )
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
      </div>
    ) : null;

  return {
    onPlayerClick,
    panel,
    remainingSec,
    dayPaused,
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
