import { useCallback, useMemo, useState } from "react";
import { socket, clientId } from "../../socket";
import ConfirmModal from "../../components/ConfirmModal";
import type { GamePhase, LoveStatePayload } from "./socketEvents";

type Player = { id: string; name: string; connected?: boolean };

type RoomLike = {
  players: Player[];
  nightCount?: number;
  gameRules?: {
    loveCanChoosePartnerFirstTwoNights?: boolean;
  };
};

const LOVE_ROLE = "Thần tình yêu";

export function useLoveRole({
  roomId,
  phase,
  role,
  room,
  deadPlayers,
  loveState,
  allNightActionsSimultaneous,
  currentNightTurnRole,
  nightActionDeadline,
  nightActionNow,
  doesNightTurnMatchMyRole: _doesNightTurnMatchMyRole,
  songTrungRobbedPlayerId,
}: {
  roomId: string | null;
  phase: GamePhase;
  role: string | null;
  room: RoomLike;
  deadPlayers: string[];
  loveState: LoveStatePayload;
  allNightActionsSimultaneous: boolean;
  currentNightTurnRole: string | null;
  nightActionDeadline: number | null;
  nightActionNow: number;
  doesNightTurnMatchMyRole: boolean;
  songTrungRobbedPlayerId?: string | null;
}) {
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [showPairConfirm, setShowPairConfirm] = useState(false);
  const [showEscapeConfirm, setShowEscapeConfirm] = useState(false);

  const isMeAlive = roomId === "mock-8" ? true : (!!clientId && !deadPlayers.includes(clientId));
  const isPaired = roomId === "mock-8" ? true : (!!clientId && loveState.pairIds.includes(clientId) && clientId !== songTrungRobbedPlayerId);
  const partnerId = loveState.partnerId;
  const partnerName = partnerId ? room.players.find((player) => player.id === partnerId)?.name : null;
  const hasVotedEscape = !!clientId && loveState.escapeVotes.includes(clientId);
  const partnerRequestedEscape = !!partnerId && loveState.escapeVotes.includes(partnerId);
  const loveChoiceLastNight = room.gameRules?.loveCanChoosePartnerFirstTwoNights ? 2 : 1;

  const canChoosePartner = useMemo(() => {
    if (roomId === "mock-8") return role === LOVE_ROLE && phase === "night";
    const currentNight = room.nightCount || 0;
    if (phase !== "night") return false;
    if (role !== LOVE_ROLE) return false;
    if (currentNight < 1 || currentNight > loveChoiceLastNight) return false;
    if (!isMeAlive) return false;
    if (loveState.targetId) return false;
    if (allNightActionsSimultaneous && nightActionDeadline && nightActionNow >= nightActionDeadline) return false;
    if (!allNightActionsSimultaneous && currentNightTurnRole !== LOVE_ROLE) return false;
    return true;
  }, [
    allNightActionsSimultaneous,
    currentNightTurnRole,
    isMeAlive,
    loveChoiceLastNight,
    loveState.targetId,
    nightActionDeadline,
    nightActionNow,
    phase,
    role,
    room.nightCount,
    roomId,
  ]);

  const canUseEscape = useMemo(() => {
    if (roomId === "mock-8") return role === LOVE_ROLE && phase === "night";
    if (phase !== "night") return false;
    if (!isPaired || !isMeAlive) return false;
    if (loveState.escapeUsed || loveState.escapeActiveTonight) return false;
    // ponytail: simplified deadline check for both sequential and simultaneous night actions
    if (nightActionDeadline && nightActionNow >= nightActionDeadline) return false;
    return true;
  }, [
    isMeAlive,
    isPaired,
    loveState.escapeActiveTonight,
    loveState.escapeUsed,
    nightActionDeadline,
    nightActionNow,
    phase,
    roomId,
    role,
  ]);

  const onPlayerClick = useCallback(
    (playerId: string) => {
      if (!canChoosePartner) return false;
      if (roomId === "mock-8") {
        setSelectedPlayerId(playerId);
        setShowPairConfirm(true);
        return true;
      }
      if (playerId === clientId) return true;
      if (deadPlayers.includes(playerId)) return true;
      if (!room.players.find((player) => player.id === playerId)) return true;

      setSelectedPlayerId(playerId);
      setShowPairConfirm(true);
      return true;
    },
    [canChoosePartner, deadPlayers, room.players, roomId]
  );

  const confirmPair = useCallback(() => {
    if (!canChoosePartner || !roomId || !selectedPlayerId) return;
    setShowPairConfirm(false);
    setSelectedPlayerId(null);
    if (roomId === "mock-8") return;
    socket.emit("loveChoosePartner", { roomId, targetId: selectedPlayerId });
  }, [canChoosePartner, roomId, selectedPlayerId]);

  const confirmEscape = useCallback(() => {
    if (!canUseEscape || !roomId) return;
    setShowEscapeConfirm(false);
    if (roomId === "mock-8") return;
    socket.emit("loveEscapeVote", { roomId });
  }, [canUseEscape, roomId]);

  const escapeButton =
    isPaired && phase === "night" && isMeAlive ? (
      <div style={{ marginTop: 12, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <button
          disabled={!canUseEscape || hasVotedEscape}
          onClick={() => {
            if (!canUseEscape || hasVotedEscape) return;
            setShowEscapeConfirm(true);
          }}
          style={{
            position: "relative",
            padding: "8px 12px",
            cursor: !canUseEscape || hasVotedEscape ? "not-allowed" : "pointer",
            opacity: !canUseEscape || hasVotedEscape ? 0.75 : 1,
            borderColor: partnerRequestedEscape ? "#ff71c8" : undefined,
            boxShadow: partnerRequestedEscape ? "0 0 0 3px rgba(255,113,200,0.22), 0 0 18px rgba(255,113,200,0.55)" : undefined,
          }}
        >
          Ra khỏi làng
          {partnerRequestedEscape && !hasVotedEscape ? (
            <span
              style={{
                position: "absolute",
                top: -8,
                right: -8,
                fontSize: 14,
                lineHeight: 1,
                filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.45))",
              }}
            >
              👀
            </span>
          ) : null}
        </button>
      </div>
    ) : null;

  const modals = (
    <>
      <ConfirmModal
        open={phase === "night" && showPairConfirm && !!selectedPlayerId}
        title="Xác nhận ghép đôi"
        message="Bạn có chắc muốn ghép đôi với người này không?"
        onConfirm={confirmPair}
        onCancel={() => {
          setShowPairConfirm(false);
          setSelectedPlayerId(null);
        }}
      />
      <ConfirmModal
        open={phase === "night" && showEscapeConfirm}
        title="Ra khỏi làng"
        message={
          partnerRequestedEscape && partnerName
            ? `${partnerName} đang chờ bạn. Bạn có chắc muốn cùng ra khỏi làng đêm nay không?`
            : "Bạn có chắc muốn ra khỏi làng đêm nay không?"
        }
        onConfirm={confirmEscape}
        onCancel={() => setShowEscapeConfirm(false)}
      />
    </>
  );

  return {
    onPlayerClick,
    actionButton: escapeButton,
    modals,
    panel: (
      <>
        {escapeButton}
        {modals}
      </>
    ),
    playerPositionsProps: {
      selectedOutlinePlayerId: canChoosePartner ? selectedPlayerId : null,
    },
    isPaired,
    canUseEscape,
    targetId: loveState.targetId,
    hasVotedEscape,
    partnerRequestedEscape,
  };
}
