import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { socket } from "../../socket";
import ConfirmModal from "../../components/ConfirmModal";
import { ELEMENTAL_BUFFS, ELEMENTAL_BUFF_LABELS, ELEMENTAL_ROLE_SET, type ElementalBuffId } from "../../constants/elemental";
import type { GamePhase } from "./socketEvents";

type Player = { id: string; name: string; connected?: boolean };
type RoomLike = { players: Player[] };

export function useElementalRole({
  roomId,
  phase,
  role,
  room,
  deadPlayers,
  elementalTargetSeq,
  elementalTargetId,
  elementalActionMode,
  elementalBuffVoteState,
  availableBuffTier,
  allNightActionsSimultaneous,
  currentNightTurnRole,
}: {
  roomId: string | null;
  phase: GamePhase;
  role: string | null;
  room: RoomLike;
  deadPlayers: string[];
  elementalTargetSeq: number;
  elementalTargetId: string | null;
  elementalActionMode: "guess" | "buff";
  elementalBuffVoteState: { pendingVote: boolean; quickMode: boolean; selectedBuffId: string | null };
  availableBuffTier: number;
  allNightActionsSimultaneous: boolean;
  currentNightTurnRole: string | null;
}) {
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [selectedBuffId, setSelectedBuffId] = useState<ElementalBuffId | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const prevPhaseRef = useRef<GamePhase>(phase);

  useEffect(() => {
    const prev = prevPhaseRef.current;
    if (prev !== phase) {
      setSelectedPlayerId(null);
      setSelectedBuffId(null);
      setShowConfirm(false);
      prevPhaseRef.current = phase;
    }
  }, [phase]);

  useEffect(() => {
    if (phase !== "night") return;
    if (elementalActionMode === "guess") {
      setSelectedPlayerId(elementalTargetId);
      setSelectedBuffId(null);
      setShowConfirm(false);
    }
  }, [elementalActionMode, elementalTargetId, elementalTargetSeq, phase]);

  const isElementalRole = !!role && ELEMENTAL_ROLE_SET.has(role);

  const canAct = useMemo(() => {
    if (phase !== "night") return false;
    if (!isElementalRole) return false;
    if (socket.id && deadPlayers.includes(socket.id)) return false;
    if (!allNightActionsSimultaneous && currentNightTurnRole !== role) return false;
    return true;
  }, [allNightActionsSimultaneous, currentNightTurnRole, deadPlayers, isElementalRole, phase, role]);

  const isElementalTurnActive = useMemo(() => {
    if (phase !== "night" || !isElementalRole) return false;
    if (allNightActionsSimultaneous) return true;
    return currentNightTurnRole === role;
  }, [allNightActionsSimultaneous, currentNightTurnRole, isElementalRole, phase, role]);

  const lockedBuffId = elementalActionMode === "buff" ? (elementalBuffVoteState.selectedBuffId as ElementalBuffId | null) : null;
  const lockedTargetId = elementalActionMode === "guess" ? elementalTargetId : null;

  const onPlayerClick = useCallback((playerId: string) => {
    if (!canAct) return false;
    if (elementalActionMode !== "guess") return false;
    if (playerId === socket.id) return true;
    if (lockedTargetId) return true;
    setSelectedPlayerId(playerId);
    setShowConfirm(true);
    return true;
  }, [canAct, elementalActionMode, lockedTargetId]);

  const chooseBuff = useCallback((buffId: ElementalBuffId) => {
    if (!canAct) return;
    if (elementalActionMode !== "buff") return;
    if (lockedBuffId) return;
    setSelectedBuffId(buffId);
    setShowConfirm(true);
  }, [canAct, elementalActionMode, lockedBuffId]);

  const confirm = useCallback(() => {
    if (!roomId) return;
    if (elementalActionMode === "guess") {
      if (!selectedPlayerId) return;
      socket.emit("elementalChooseTarget", { roomId, targetId: selectedPlayerId });
      return;
    }
    if (!selectedBuffId) return;
    socket.emit("elementalChooseBuff", { roomId, buffId: selectedBuffId });
  }, [elementalActionMode, roomId, selectedBuffId, selectedPlayerId]);

  const selectedTargetName = selectedPlayerId
    ? room.players.find((player) => player.id === selectedPlayerId)?.name || "người này"
    : "người này";

  const effectiveTier = Math.max(0, availableBuffTier);
  const visibleBuffs = ELEMENTAL_BUFFS.filter((buff) => buff.tier === effectiveTier);

  const panel = isElementalRole && phase === "night" && elementalActionMode === "buff" && isElementalTurnActive ? (
    <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
      <div style={{ fontWeight: 700 }}>Chọn buff nguyên tố (Tier {effectiveTier})</div>
      {visibleBuffs.length === 0 ? (
        <div style={{ opacity: 0.75 }}>Không có buff nào khả dụng cho tier hiện tại.</div>
      ) : (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          {visibleBuffs.map((buff) => {
            const locked = !!lockedBuffId;
            const active = (lockedBuffId || selectedBuffId) === buff.id;
            return (
              <button
                key={buff.id}
                disabled={locked}
                onClick={() => chooseBuff(buff.id)}
                style={{
                  padding: "10px 14px",
                  borderRadius: 12,
                  border: active ? "2px solid #ED6E7B" : "1px solid rgba(255,255,255,0.16)",
                  background: active ? "rgba(237,110,123,0.16)" : "rgba(255,255,255,0.04)",
                  color: "#fff",
                  cursor: locked ? "default" : "pointer",
                }}
              >
                T{buff.tier} · {buff.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  ) : null;

  const modalMessage =
    elementalActionMode === "guess"
      ? `Bạn có chắc muốn chọn ${selectedTargetName} không?`
      : selectedBuffId
        ? `Bạn có chắc muốn chọn ${ELEMENTAL_BUFF_LABELS[selectedBuffId]} không?`
        : "";

  return {
    onPlayerClick,
    panel,
    modal: (
      <ConfirmModal
        open={showConfirm && !!(selectedPlayerId || selectedBuffId)}
        title="Xác nhận lựa chọn"
        message={modalMessage}
        onConfirm={() => {
          confirm();
          setShowConfirm(false);
        }}
        onCancel={() => {
          setShowConfirm(false);
          if (elementalActionMode === "guess") setSelectedPlayerId(null);
          if (elementalActionMode === "buff") setSelectedBuffId(null);
        }}
      />
    ),
    playerPositionsProps: {
      selectedOutlinePlayerId:
        isElementalTurnActive && elementalActionMode === "guess" ? (lockedTargetId || selectedPlayerId) : null,
    },
  };
}
