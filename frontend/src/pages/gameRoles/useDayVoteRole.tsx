import { useCallback, useEffect, useMemo, useState } from "react";
import { socket, clientId } from "../../socket";
import type { DayLockedUpdatedPayload, DayVotesUpdatedPayload, GamePhase, TrialVote, TrialVotesUpdatedPayload } from "./socketEvents";
import StarBorder from "../../components/StarBorder";
import { AvifIcon } from "../../components/AvifIcon";
import ConfirmModal from "../../components/ConfirmModal";
import StunActionGuard from "../../components/StunActionGuard";


type Player = { id: string; name: string; connected?: boolean };

type RoomLike = {
  players: Player[];
  hostId?: string | null;
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
  votingStunned = false,
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
  votingStunned?: boolean;
}) {
  const [localSelectedTarget, setLocalSelectedTarget] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now() + serverTimeOffset);
  const [isVoteReviewActive, setIsVoteReviewActive] = useState(false);
  const [showDayVoteConfirm, setShowDayVoteConfirm] = useState(false);
  const [showBlankVoteConfirm, setShowBlankVoteConfirm] = useState(false);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  const [localTrialVote, setLocalTrialVote] = useState<TrialVote | null>(null);

  useEffect(() => {
    setIsVoteReviewActive(false);
    if (trialStage !== "verdict") {
      setLocalTrialVote(null);
    }
  }, [trialStage]);

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

  const isHost = room.hostId ? clientId === room.hostId : false;

  const canAct = useMemo(() => {
    if (phase !== "day") return false;
    if (!clientId || isHost) return false;
    if (!dayDeadline) return false;
    if (deadPlayers.includes(clientId)) return false;
    if (dayVoters.length > 0 && !dayVoters.includes(clientId)) return false;
    if (trialStage !== "none") return false;
    if (votingStunned) return false;
    return true;
  }, [dayDeadline, dayVoters, deadPlayers, votingStunned, phase, trialStage, isHost]);

  const myTrialVote = clientId ? (trialVotes?.[clientId] ?? null) : null;
  const effectiveTrialVote = localTrialVote || myTrialVote;

  const isTrialTarget = !!clientId && !!trialTargetId && clientId === trialTargetId;
  const alreadyChosenByTrialTarget = !!clientId && trialSelectedInteractorIds.includes(clientId);
  const canRequestInteraction =
    phase === "day" &&
    trialStage === "defense" &&
    !!clientId &&
    !isHost &&
    !isTrialTarget &&
    !deadPlayers.includes(clientId) &&
    !alreadyChosenByTrialTarget &&
    !trialInteractionCut;
  const canToggleInteraction = canRequestInteraction && !votingStunned;
  const hasInteracted = !!clientId && trialInteractionActiveIds.includes(clientId);
  const remainingInteractionTurns = Math.max(0, trialInteractionSelectionLimit - trialSelectedInteractorIds.length);

  const trialTargetName = useMemo(() => {
    if (!trialTargetId || !room?.players) return "bị cáo";
    return room.players.find((p) => p.id === trialTargetId)?.name || "bị cáo";
  }, [trialTargetId, room?.players]);

  const canVoteVerdict =
    phase === "day" &&
    trialStage === "verdict" &&
    !!clientId &&
    !isHost &&
    !deadPlayers.includes(clientId) &&
    !isTrialTarget;

  const onPlayerClick = useCallback((playerId: string) => {
    if (!clientId) return false;

    if (trialStage === "defense" && isTrialTarget) {
      if (!trialInteractionActiveIds.includes(playerId)) return true;
      socket.emit("trialSelectInteractor", { roomId, targetId: playerId });
      return true;
    }

    if (votingStunned && phase === "day" && trialStage === "none" && !!dayDeadline) return true;
    if (!canAct) return false;

    if (playerId === clientId) return true;
    if (deadPlayers.includes(playerId)) return true;

    if (dayLocked?.[clientId]) return true;
    if (!dayPaused && dayDeadline && Date.now() + serverTimeOffset >= dayDeadline) return true;

    if (localSelectedTarget === playerId) {
      setLocalSelectedTarget(null);
      socket.emit("dayChooseTarget", { roomId, targetId: null });
      return true;
    }

    setLocalSelectedTarget(playerId);
    socket.emit("dayChooseTarget", { roomId, targetId: playerId });
    return true;
  }, [canAct, dayDeadline, dayLocked, dayPaused, deadPlayers, isTrialTarget, localSelectedTarget, phase, roomId, trialInteractionActiveIds, trialStage, serverTimeOffset, votingStunned]);

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
    phase === "day" && clientId ? (
      <div>
        {trialStage === "none" && !isHost && !deadPlayers.includes(clientId) && (
          <>
            {dayDeadline && (
              <>
                <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between" }}>
                  <StunActionGuard
                    blocked={votingStunned}
                    blockedLabel="Bạn đang bị choáng và chỉ có thể bỏ phiếu trống"
                    className="stun-action-guard--day-vote"
                  >
                    <button
                      onClick={() => {
                        if (!localSelectedTarget) {
                          setInfoMessage("Bạn chưa chọn mục tiêu biểu quyết.");
                          return;
                        }
                        setShowDayVoteConfirm(true);
                      }}
                      style={{ margin: 0, padding: "8px 12px", cursor: "pointer" }}
                      disabled={!!dayLocked?.[clientId]}
                    >
                      <AvifIcon name="🗳️" style={{ marginRight: 4 }} /> Chốt biểu quyết
                    </button>
                  </StunActionGuard>
                  <button
                    onClick={() => {
                      setShowBlankVoteConfirm(true);
                    }}
                    style={{ margin: "4px 0", padding: "8px 12px", cursor: "pointer" }}
                    disabled={!!dayLocked?.[clientId]}
                  >
                    <AvifIcon name="⭕" style={{ marginRight: 4 }} /> Bỏ phiếu trống
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
              Lượt tương tác còn lại của {trialTargetName}: {remainingInteractionTurns}
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
              {!isHost && !isTrialTarget && !deadPlayers.includes(clientId) && (
                <StunActionGuard
                  blocked={votingStunned && canRequestInteraction}
                  blockedLabel="Bạn đang bị choáng và không thể tương tác"
                >
                  {alreadyChosenByTrialTarget || hasInteracted ? (
                    <button
                      onClick={() => {
                        if (!canToggleInteraction) return;
                        socket.emit("trialToggleInteraction", { roomId, active: !hasInteracted });
                      }}
                      style={{ padding: "8px 12px", cursor: "pointer" }}
                      disabled={!canRequestInteraction}
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
                      style={{ cursor: "pointer" }}
                      disabled={!canRequestInteraction}
                      color="white"
                      speed="6s"
                    >
                      Tương tác
                    </StarBorder>
                  )}
                </StunActionGuard>
              )}
              {isTrialTarget && (
                <button
                  onClick={() => socket.emit("trialCutInteraction", { roomId })}
                  style={{ padding: "8px 12px", cursor: "pointer" }}
                >
                  ✂️ Cắt tương tác
                </button>
              )}
              <button
                onClick={() => setIsVoteReviewActive(prev => !prev)}
                style={{
                  padding: "8px 12px",
                  cursor: "pointer",
                  background: "rgba(255, 255, 255, 0.08)",
                  color: isVoteReviewActive ? "#fff" : "#cbd5e1",
                  border: isVoteReviewActive ? "2px solid #cbd5e1" : "1px solid rgba(255, 255, 255, 0.15)",
                  borderRadius: "6px",
                  transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
                  width: "11rem",
                  textAlign: "center",
                }}
              >
                {isVoteReviewActive ? "Ẩn các biểu quyết" : "Xem lại biểu quyết"}
              </button>
            </div>
          </>
        )}

        {trialStage === "verdict" && canVoteVerdict && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              onClick={() => {
                setLocalTrialVote("live");
                socket.emit("trialVoteLifeDeath", { roomId, vote: "live" });
              }}
              style={{ marginTop: 8, padding: "8px 12px", cursor: "pointer", display: "flex", alignItems: "center" }}
            >
              <AvifIcon name="✅" style={{ marginRight: 4 }} /> Vote Sống{effectiveTrialVote === "live" ? " (đã chọn)" : ""}
            </button>
            <StunActionGuard
              blocked={votingStunned}
              blockedLabel="Bạn đang bị choáng và không thể Vote Chết"
              className="stun-action-guard--verdict"
            >
              <button
                onClick={() => {
                  setLocalTrialVote("die");
                  socket.emit("trialVoteLifeDeath", { roomId, vote: "die" });
                }}
                style={{ margin: 0, padding: "8px 12px", cursor: "pointer", display: "flex", alignItems: "center" }}
              >
                <AvifIcon name="☠️" style={{ marginRight: 4 }} /> Vote Chết{effectiveTrialVote === "die" ? " (đã chọn)" : ""}
              </button>
            </StunActionGuard>
            <button
              onClick={() => {
                setLocalTrialVote("abstain");
                socket.emit("trialVoteLifeDeath", { roomId, vote: "abstain" });
              }}
              style={{ marginTop: 8, padding: "8px 12px", cursor: "pointer", display: "flex", alignItems: "center" }}
            >
              <AvifIcon name="⭕" style={{ marginRight: 4 }} /> Phiếu trống{effectiveTrialVote === "abstain" ? " (đã chọn)" : ""}
            </button>
          </div>
        )}
        <ConfirmModal
          open={showDayVoteConfirm}
          title="Xác nhận biểu quyết"
          message={localSelectedTarget ? `Xác nhận chọn biểu quyết ${room.players.find(p => p.id === localSelectedTarget)?.name || "người chơi"}?` : ""}
          onConfirm={() => {
            socket.emit("dayLockVote", { roomId });
            setShowDayVoteConfirm(false);
          }}
          onCancel={() => setShowDayVoteConfirm(false)}
        />

        <ConfirmModal
          open={showBlankVoteConfirm}
          title="Xác nhận bỏ phiếu"
          message="Bạn có chắc chắn muốn bỏ phiếu trống không?"
          onConfirm={() => {
            socket.emit("dayChooseTarget", { roomId, targetId: null });
            socket.emit("dayLockVote", { roomId });
            setLocalSelectedTarget(null);
            setShowBlankVoteConfirm(false);
          }}
          onCancel={() => setShowBlankVoteConfirm(false)}
        />

        <ConfirmModal
          open={!!infoMessage}
          title="Thông báo"
          message={infoMessage || ""}
          infoOnly
          onConfirm={() => setInfoMessage(null)}
          onCancel={() => setInfoMessage(null)}
        />
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
      showVoteReview: isVoteReviewActive,
      dayVotes: dayVotes,
      dayLocked: dayLocked,
    },
  };
}
