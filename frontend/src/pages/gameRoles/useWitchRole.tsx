import { useCallback, useEffect, useMemo, useState } from "react";
import { socket } from "../../socket";
import type { GamePhase, WitchPotionsPayload } from "./socketEvents";
import ConfirmModal from "../../components/ConfirmModal";

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
  witchPendingDeathTargetIds,
  witchPotions,
}: {
  roomId: string | null;
  phase: GamePhase;
  role: string | null;
  room: RoomLike;
  deadPlayers: string[];
  witchPendingDeathTargetIds: string[];
  witchPotions: WitchPotionsPayload | null;
}) {
  const [poisonMode, setPoisonMode] = useState(false);
  const [poisonSelectedTargetId, setPoisonSelectedTargetId] = useState<string | null>(null);
  const [showPoisonConfirm, setShowPoisonConfirm] = useState(false);

  const [healMode, setHealMode] = useState(false);
  const [healSelectedTargetId, setHealSelectedTargetId] = useState<string | null>(null);
  const [showHealConfirm, setShowHealConfirm] = useState(false);

  useEffect(() => {
    if (phase === "day") {
      setPoisonMode(false);
      setPoisonSelectedTargetId(null);
      setShowPoisonConfirm(false);

      setHealMode(false);
      setHealSelectedTargetId(null);
      setShowHealConfirm(false);
    }
  }, [phase]);

  useEffect(() => {
    // If pending-death targets change (e.g. guardian protected), close invalid heal confirm.
    if (!showHealConfirm) return;
    if (!healSelectedTargetId) return;
    if (!witchPendingDeathTargetIds.includes(healSelectedTargetId)) {
      setShowHealConfirm(false);
      setHealSelectedTargetId(null);
    }
  }, [healSelectedTargetId, showHealConfirm, witchPendingDeathTargetIds]);

  const canAct = useMemo(() => {
    if (phase !== "night") return false;
    if (role !== "Phù thủy") return false;
    if (socket.id && deadPlayers.includes(socket.id)) return false;
    return true;
  }, [deadPlayers, phase, role]);

  const healDisabled = useMemo(() => {
    if (!canAct) return true;
    if (!witchPendingDeathTargetIds.length) return true;
    if (witchPotions?.healUsed) return true;
    return false;
  }, [canAct, witchPendingDeathTargetIds.length, witchPotions?.healUsed]);

  const poisonDisabled = useMemo(() => {
    if (!canAct) return true;
    if (witchPotions?.poisonUsed) return true;
    return false;
  }, [canAct, witchPotions?.poisonUsed]);

  const onPlayerClick = useCallback(
    (playerId: string) => {
      if (!canAct) return false;

      // Heal selection: only allow selecting from pending targets.
      if (healMode && !healDisabled) {
        if (!witchPendingDeathTargetIds.includes(playerId)) return true;
        setHealSelectedTargetId(playerId);
        setShowHealConfirm(true);
        return true;
      }

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
      setShowPoisonConfirm(true);
      return true;
    },
    [canAct, deadPlayers, healDisabled, healMode, poisonDisabled, poisonMode, room.players, roomId, witchPendingDeathTargetIds]
  );

  const confirmHeal = useCallback(() => {
    if (!roomId || !healSelectedTargetId) return;
    socket.emit("witchHeal", { roomId, targetId: healSelectedTargetId });
    setShowHealConfirm(false);
    setHealMode(false);
  }, [healSelectedTargetId, roomId]);

  const confirmPoison = useCallback(() => {
    if (!roomId || !poisonSelectedTargetId) return;
    socket.emit("witchPoison", { roomId, targetId: poisonSelectedTargetId });
    setShowPoisonConfirm(false);
  }, [poisonSelectedTargetId, roomId]);

  const panel =
    role === "Phù thủy" && phase === "night" && socket.id && !deadPlayers.includes(socket.id) ? (
      <div style={{ marginTop: 12, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <button
          disabled={healDisabled}
          onClick={() => {
            if (healDisabled) return;
            setPoisonMode(false);
            setPoisonSelectedTargetId(null);

            // UX: nếu chỉ có 1 người sắp chết thì chỉ cần confirm cứu,
            // không cần click chọn mục tiêu.
            if (witchPendingDeathTargetIds.length === 1) {
              setHealMode(false);
              setHealSelectedTargetId(witchPendingDeathTargetIds[0]!);
              setShowHealConfirm(true);
              return;
            }

            // Nếu có nhiều hơn 1 người sắp chết thì bật chế độ chọn mục tiêu.
            setHealSelectedTargetId(null);
            setHealMode(m => !m);
          }}
          style={{ padding: "8px 12px", cursor: healDisabled ? "not-allowed" : "pointer" }}
        >
          🧪 {healMode ? "Chọn người để cứu" : "Bình cứu"}
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

  const healConfirmModal = (
    (() => {
      const isSelfHeal = !!healSelectedTargetId && healSelectedTargetId === socket.id;
      const targetName = healSelectedTargetId
        ? room.players.find(p => p.id === healSelectedTargetId)?.name
        : undefined;
      const msg = isSelfHeal
        ? "Bạn có chắc muốn cứu bản thân không?"
        : targetName
        ? `Bạn có chắc muốn cứu ${targetName} không?`
        : "Bạn có chắc muốn cứu người này không?";

      return (
    <ConfirmModal
      open={showHealConfirm && !!healSelectedTargetId}
      title="Xác nhận dùng bình cứu"
      message={msg}
      onConfirm={confirmHeal}
      onCancel={() => {
        setShowHealConfirm(false);
        setHealSelectedTargetId(null);
        // Keep heal mode on so user can pick another pending target.
        setHealMode(true);
      }}
    />
      );
    })()
  );

  const poisonConfirmModal = (
    <ConfirmModal
      open={showPoisonConfirm && !!poisonSelectedTargetId}
      title="Xác nhận dùng bình giết"
      message="Bạn có chắc muốn dùng bình giết lên người này không?"
      onConfirm={confirmPoison}
      onCancel={() => {
        setShowPoisonConfirm(false);
        setPoisonSelectedTargetId(null);
        // Keep poison mode on so user can pick another target.
        setPoisonMode(true);
      }}
    />
  );

  return {
    onPlayerClick,
    panel: (
      <>
        {panel}
        {healConfirmModal}
        {poisonConfirmModal}
      </>
    ),
    playerPositionsProps: {
      dangerPlayerIds:
        role === "Phù thủy" && phase === "night" && !witchPotions?.healUsed
          ? witchPendingDeathTargetIds
          : [],
      selectedOutlinePlayerId: role === "Phù thủy" && phase === "night" ? poisonSelectedTargetId : null,
    },
  };
}
