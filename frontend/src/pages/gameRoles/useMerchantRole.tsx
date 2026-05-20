import { useCallback, useMemo, useState } from "react";

import { socket, clientId } from "../../socket";
import {
  EMPTY_MERCHANT_PRIVATE_STATE,
  MERCHANT_ITEM_DESCRIPTIONS,
  MERCHANT_ITEM_LABELS,
  MERCHANT_ROLE,
  type MerchantDecision,
  type MerchantItemId,
  type MerchantPrivateState,
} from "../../constants/merchant";
import type { GamePhase } from "./socketEvents";

type Player = { id: string; name: string; connected?: boolean };
type RoomLike = { players: Player[]; nightCount?: number };

function getPlayerName(room: RoomLike, playerId: string | null | undefined) {
  if (!playerId) return "người này";
  return room.players.find((player) => player.id === playerId)?.name || "người này";
}

function decisionLabel(decision: MerchantDecision | null | undefined) {
  if (decision === "up") return "👍🏽";
  if (decision === "down") return "👎🏽";
  return "chưa chọn";
}

export function useMerchantRole({
  roomId,
  phase,
  role,
  room,
  deadPlayers,
  merchantState,
  allNightActionsSimultaneous,
  currentNightTurnRole,
  nightActionDeadline,
  nightActionNow,
}: {
  roomId: string | null;
  phase: GamePhase;
  role: string | null;
  room: RoomLike;
  deadPlayers: string[];
  merchantState: MerchantPrivateState;
  allNightActionsSimultaneous: boolean;
  currentNightTurnRole: string | null;
  nightActionDeadline: number | null;
  nightActionNow: number;
}) {
  const state = merchantState || EMPTY_MERCHANT_PRIVATE_STATE;
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [selectedItemId, setSelectedItemId] = useState<MerchantItemId | null>(null);
  const [selectedDecision, setSelectedDecision] = useState<MerchantDecision | null>(null);
  const [selectedNight, setSelectedNight] = useState<number | null>(null);
  const [showOfferModal, setShowOfferModal] = useState(false);
  const currentNight = room.nightCount || 0;

  const effectiveSelectedItemId =
    selectedItemId && state.availableStockIds.includes(selectedItemId)
      ? selectedItemId
      : state.availableStockIds[0] || null;

  const isMerchantTurnActive = useMemo(() => {
    if (phase !== "night") return false;
    if (role !== MERCHANT_ROLE) return false;
    if (allNightActionsSimultaneous) return true;
    return currentNightTurnRole === MERCHANT_ROLE;
  }, [allNightActionsSimultaneous, currentNightTurnRole, phase, role]);

  const isMerchantWindowOpen = useMemo(() => {
    if (phase !== "night") return false;
    if (allNightActionsSimultaneous) {
      return !nightActionDeadline || nightActionNow < nightActionDeadline;
    }
    return currentNightTurnRole === MERCHANT_ROLE;
  }, [allNightActionsSimultaneous, currentNightTurnRole, nightActionDeadline, nightActionNow, phase]);

  const currentTrade = state.trade;
  const hasMerchantTradeTonight = !!currentTrade && currentTrade.actorId === clientId;
  const canAct = useMemo(() => {
    if (phase !== "night") return false;
    if (role !== MERCHANT_ROLE) return false;
    if (hasMerchantTradeTonight) return false;
    if (clientId && deadPlayers.includes(clientId)) return false;
    if (state.availableStockIds.length <= 0) return false;
    if (!isMerchantWindowOpen) return false;
    return true;
  }, [
    deadPlayers,
    hasMerchantTradeTonight,
    isMerchantWindowOpen,
    phase,
    role,
    state.availableStockIds.length,
  ]);

  const onPlayerClick = useCallback((playerId: string) => {
    if (!canAct) return false;
    if (playerId === clientId) {
      alert("Tay Buôn không thể tự giao dịch với chính mình.");
      return true;
    }
    if (state.lastTargetId && state.lastTargetId === playerId) {
      alert("Không thể chọn cùng một người hai đêm liên tiếp.");
      return true;
    }

    setSelectedPlayerId(playerId);
    setSelectedNight(currentNight);
    setSelectedDecision(null);
    setShowOfferModal(true);
    return true;
  }, [canAct, currentNight, state.lastTargetId]);

  const submitOffer = useCallback(() => {
    if (!canAct) return;
    if (!roomId || !selectedPlayerId || !effectiveSelectedItemId || !selectedDecision) return;
    socket.emit("merchantOfferTrade", {
      roomId,
      targetId: selectedPlayerId,
      itemId: effectiveSelectedItemId,
      choice: selectedDecision,
    });
    setShowOfferModal(false);
  }, [canAct, effectiveSelectedItemId, roomId, selectedDecision, selectedPlayerId]);

  const respond = useCallback((choice: MerchantDecision) => {
    if (!roomId) return;
    socket.emit("merchantRespondTrade", { roomId, choice });
  }, [roomId]);

  const targetName = getPlayerName(room, selectedPlayerId);
  const tradeTargetName = getPlayerName(room, currentTrade?.targetId);
  const tradeActorName = getPlayerName(room, currentTrade?.actorId);
  const protectedName = getPlayerName(room, state.poppyGlassesProtectedTargetId);
  const isOfferModalOpen = phase === "night" && showOfferModal && selectedNight === currentNight;

  const inventoryPanel = state.items.length > 0 ? (
    <div style={{ marginTop: 10, display: "grid", gap: 6 }}>
      <div style={{ fontWeight: 700 }}>Đồ đang giữ</div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {state.items.map((item, index) => {
          const active = item.appliesNight <= currentNight;
          return (
            <span
              key={`${item.id}-${index}`}
              title={MERCHANT_ITEM_DESCRIPTIONS[item.id]}
              style={{
                padding: "6px 9px",
                borderRadius: 8,
                border: "1px solid var(--border)",
                opacity: active ? 1 : 0.62,
                background: active ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.03)",
              }}
            >
              {MERCHANT_ITEM_LABELS[item.id]}{active ? "" : ` (đêm ${item.appliesNight})`}
            </span>
          );
        })}
      </div>
    </div>
  ) : null;

  const glassesPanel = state.poppyGlassesProtectedTargetId && phase === "night" ? (
    <div style={{ marginTop: 10, fontWeight: 700 }}>
      Kết giới hoa đang bảo vệ: {protectedName}
    </div>
  ) : null;

  const merchantStatusPanel = role === MERCHANT_ROLE && phase === "night" && isMerchantTurnActive ? (
    <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
      <div style={{ fontWeight: 700 }}>Kho hàng Tay Buôn</div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {state.availableStockIds.length > 0 ? state.availableStockIds.map((itemId) => (
          <span
            key={itemId}
            title={MERCHANT_ITEM_DESCRIPTIONS[itemId]}
            style={{
              padding: "6px 9px",
              borderRadius: 8,
              border: "1px solid var(--border)",
              background: "rgba(255,255,255,0.06)",
            }}
          >
            {MERCHANT_ITEM_LABELS[itemId]}
          </span>
        )) : (
          <span style={{ opacity: 0.72 }}>Kho hàng đã hết món có thể giao dịch.</span>
        )}
      </div>
      {currentTrade && currentTrade.actorId === clientId ? (
        <div style={{ opacity: 0.9 }}>
          Đã gửi giao dịch cho <b>{tradeTargetName}</b>
          {currentTrade.itemId ? `: ${MERCHANT_ITEM_LABELS[currentTrade.itemId]}` : ""} · {decisionLabel(currentTrade.merchantChoice)}
          {currentTrade.resolved ? (
            <span> · {currentTrade.result === "success" ? "thành công" : "thất bại"}</span>
          ) : (
            <span> · đang chờ phản hồi</span>
          )}
        </div>
      ) : null}
    </div>
  ) : null;

  const targetTradePanel =
    phase === "night" &&
    currentTrade &&
    currentTrade.targetId === clientId &&
    isMerchantWindowOpen &&
    !currentTrade.resolved ? (
      <div style={{ marginTop: 12, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <b>{tradeActorName} muốn giao dịch</b>
        <button onClick={() => respond("up")} style={{ padding: "8px 12px" }}>👍🏽</button>
        <button onClick={() => respond("down")} style={{ padding: "8px 12px" }}>👎🏽</button>
      </div>
    ) : null;

  const resolvedTradePanel =
    phase === "night" &&
    currentTrade?.resolved &&
    (currentTrade.actorId === clientId || currentTrade.targetId === clientId) ? (
      <div style={{ marginTop: 12, opacity: 0.9 }}>
        Giao dịch với <b>{currentTrade.actorId === clientId ? tradeTargetName : tradeActorName}</b>{" "}
        {currentTrade.result === "success" ? "thành công" : "thất bại"}
        {currentTrade.itemId && currentTrade.result === "success" ? `: ${MERCHANT_ITEM_LABELS[currentTrade.itemId]}` : ""}
      </div>
    ) : null;

  const offerModal = isOfferModalOpen ? (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.35)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
      }}
    >
      <div
        style={{
          background: "var(--surface)",
          color: "var(--text)",
          padding: 24,
          borderRadius: 12,
          width: "min(92vw, 560px)",
          boxShadow: "0 2px 16px rgba(0,0,0,0.25)",
        }}
      >
        <h2 style={{ marginTop: 0 }}>Tạo giao dịch</h2>
        <p>Giao dịch với <b>{targetName}</b></p>
        <label style={{ display: "grid", gap: 8 }}>
          <span>Món đồ</span>
          <select
            value={effectiveSelectedItemId || ""}
            onChange={(event) => setSelectedItemId(event.target.value as MerchantItemId)}
            style={{ padding: "10px 12px" }}
          >
            {state.availableStockIds.map((itemId) => (
              <option key={itemId} value={itemId}>
                {MERCHANT_ITEM_LABELS[itemId]}
              </option>
            ))}
          </select>
        </label>

        {effectiveSelectedItemId ? (
          <div style={{ marginTop: 10, opacity: 0.75 }}>
            {MERCHANT_ITEM_DESCRIPTIONS[effectiveSelectedItemId]}
          </div>
        ) : null}

        <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
          <button
            onClick={() => setSelectedDecision("up")}
            style={{
              padding: "10px 14px",
              border: selectedDecision === "up" ? "2px solid var(--accent)" : "1px solid var(--border)",
            }}
          >
            👍🏽
          </button>
          <button
            onClick={() => setSelectedDecision("down")}
            style={{
              padding: "10px 14px",
              border: selectedDecision === "down" ? "2px solid var(--accent)" : "1px solid var(--border)",
            }}
          >
            👎🏽
          </button>
        </div>

        <div style={{ display: "flex", gap: 12, justifyContent: "flex-end", marginTop: 24 }}>
          <button
            onClick={() => {
              setShowOfferModal(false);
              setSelectedPlayerId(null);
              setSelectedNight(null);
              setSelectedDecision(null);
            }}
          >
            Huỷ
          </button>
          <button disabled={!effectiveSelectedItemId || !selectedDecision} onClick={submitOffer}>
            Gửi giao dịch
          </button>
        </div>
      </div>
    </div>
  ) : null;

  return {
    onPlayerClick,
    modal: offerModal,
    panel: (
      <>
        {merchantStatusPanel}
        {targetTradePanel}
        {resolvedTradePanel}
        {inventoryPanel}
        {glassesPanel}
      </>
    ),
    playerPositionsProps: {
      selectedOutlinePlayerId:
        role === MERCHANT_ROLE && isMerchantTurnActive
          ? (currentTrade?.actorId === clientId ? currentTrade.targetId : isOfferModalOpen ? selectedPlayerId : null)
          : null,
    },
  };
}
