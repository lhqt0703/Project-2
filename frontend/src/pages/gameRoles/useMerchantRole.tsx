import { useCallback, useMemo, useState } from "react";
import ConfirmModal from "../../components/ConfirmModal";

import { socket, clientId } from "../../socket";
import {
  EMPTY_MERCHANT_PRIVATE_STATE,
  MERCHANT_ITEM_DESCRIPTIONS,
  MERCHANT_ITEM_FULL_IMAGES,
  MERCHANT_ITEM_LABELS,
  MERCHANT_ITEM_SMALL_IMAGES,
  MERCHANT_ROLE,
  type MerchantDecision,
  type MerchantItemId,
  type MerchantPrivateState,
} from "../../constants/merchant";
import type { GamePhase } from "./socketEvents";
import type { RoomGameRules } from "../../context/RoomContext";

type Player = { id: string; name: string; connected?: boolean };
type RoomLike = { players: Player[]; nightCount?: number; gameRules?: RoomGameRules };

function getPlayerName(room: RoomLike, playerId: string | null | undefined) {
  if (!playerId) return "người này";
  return room.players.find((player) => player.id === playerId)?.name || "người này";
}

function decisionLabel(decision: MerchantDecision | null | undefined) {
  if (decision === "up") return "👍🏽";
  if (decision === "down") return "👎🏽";
  return "chưa chọn";
}

function renderMerchantItemTile({
  tileKey,
  itemId,
  selected = false,
  disabled = false,
  suffix,
  onClick,
}: {
  tileKey?: string | number;
  itemId: MerchantItemId;
  selected?: boolean;
  disabled?: boolean;
  suffix?: string;
  onClick: () => void;
}) {
  const imageSrc = MERCHANT_ITEM_SMALL_IMAGES[itemId];
  return (
    <button
      key={tileKey}
      type="button"
      disabled={disabled}
      title={MERCHANT_ITEM_DESCRIPTIONS[itemId]}
      onClick={onClick}
      style={{
        width: 104,
        minHeight: 128,
        borderRadius: 8,
        border: selected ? "2px solid var(--accent)" : "1px solid var(--border)",
        background: selected ? "var(--accent-surface)" : "rgba(255,255,255,0.05)",
        color: "var(--text)",
        display: "grid",
        gridTemplateRows: "72px auto",
        gap: 8,
        padding: 8,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
        textAlign: "center",
      }}
    >
      <span
        style={{
          width: "100%",
          height: 72,
          borderRadius: 6,
          overflow: "hidden",
          background: "rgba(0,0,0,0.22)",
          display: "grid",
          placeItems: "center",
        }}
      >
        {imageSrc ? (
          <img src={imageSrc} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <span style={{ fontSize: 24 }}>?</span>
        )}
      </span>
      <span style={{ fontSize: 12, fontWeight: 700, lineHeight: 1.25 }}>
        {MERCHANT_ITEM_LABELS[itemId]}
        {suffix ? <span style={{ display: "block", marginTop: 4, opacity: 0.72 }}>{suffix}</span> : null}
      </span>
    </button>
  );
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
  const [detailItem, setDetailItem] = useState<{ itemId: MerchantItemId; night: number } | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const currentNight = room.nightCount || 0;
  const isCurrentMerchantDead = !!clientId && deadPlayers.includes(clientId);
  const visibleDetailItemId =
    phase === "night" && !isCurrentMerchantDead && detailItem?.night === currentNight ? detailItem.itemId : null;
  const openDetailItem = useCallback((itemId: MerchantItemId) => {
    setDetailItem({ itemId, night: currentNight });
  }, [currentNight]);
  const closeDetailItem = useCallback(() => setDetailItem(null), []);

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
    if (isCurrentMerchantDead) return false;
    if (state.availableStockIds.length <= 0) return false;
    if (!isMerchantWindowOpen) return false;
    return true;
  }, [
    hasMerchantTradeTonight,
    isCurrentMerchantDead,
    isMerchantWindowOpen,
    phase,
    role,
    state.availableStockIds.length,
  ]);

  const onPlayerClick = useCallback((playerId: string) => {
    if (!canAct) return false;
    if (playerId === clientId) {
      setInfoMessage("Bạn không thể tự giao dịch với chính mình");
      return true;
    }
    if (state.lastTargetId && state.lastTargetId === playerId) {
      setInfoMessage("Không thể chọn cùng một người hai đêm liên tiếp");
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
  const protectedName = getPlayerName(room, state.poppyGlassesProtectedTargetId);
  const isOfferModalOpen = phase === "night" && showOfferModal && selectedNight === currentNight;

  const isMerchant = role === MERCHANT_ROLE;
  const hideReceivedItems = room.gameRules?.merchantHideReceivedItemName === true;
  const shouldShowInventory = isMerchant || !hideReceivedItems;

  const inventoryPanel = phase === "night" && !isCurrentMerchantDead && state.items.length > 0 && shouldShowInventory ? (
    <div style={{ marginTop: 10, display: "grid", gap: 6 }}>
      <div style={{ fontWeight: 700 }}>Đồ đang giữ</div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {state.items.map((item, index) => {
          const active = item.appliesNight === currentNight;
          return renderMerchantItemTile({
            tileKey: `${item.id}-${index}`,
            itemId: item.id,
            suffix: active ? undefined : `Đêm ${item.appliesNight}`,
            onClick: () => openDetailItem(item.id),
          });
        })}
      </div>
    </div>
  ) : null;

  const glassesPanel = state.poppyGlassesProtectedTargetId && phase === "night" ? (
    <div style={{ marginTop: 10, fontWeight: 700 }}>
      Kết giới hoa đang bảo vệ: {protectedName}
    </div>
  ) : null;

  const merchantStatusPanel = role === MERCHANT_ROLE && phase === "night" && isMerchantTurnActive && !isCurrentMerchantDead ? (
    <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
      <div style={{ fontWeight: 700 }}>Kho hàng hiện tại</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 104px))", gap: 8, width: "fit-content" }}>
        {state.availableStockIds.length > 0 ? state.availableStockIds.map((itemId) =>
          renderMerchantItemTile({
            tileKey: itemId,
            itemId,
            onClick: () => openDetailItem(itemId),
          })
        ) : (
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
        <b>Bạn cần đưa ra một lựa chọn</b>
        <button onClick={() => respond("up")} style={{ padding: "8px 12px" }}>👍🏽</button>
        <button onClick={() => respond("down")} style={{ padding: "8px 12px" }}>👎🏽</button>
      </div>
    ) : null;

  const resolvedTradePanel =
    phase === "night" &&
    currentTrade?.resolved &&
    (currentTrade.actorId === clientId || currentTrade.targetId === clientId) ? (
      <div style={{ marginTop: 12, opacity: 0.9 }}>
        Giao dịch {" "}
        {currentTrade.result === "success" ? "thành công" : "thất bại"}
        
      </div>
    ) : null;

  const offerModal = isOfferModalOpen && !isCurrentMerchantDead ? (
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
          background: "linear-gradient(145deg, rgba(14, 16, 20, 0.5) 0%, rgba(15, 17, 21, 0.7) 100%)",
          backdropFilter: "blur(12px)",
          color: "var(--text)",
          padding: 24,
          borderRadius: 12,
          width: "min(92vw, 560px)",
          boxShadow: "0 2px 16px rgba(0,0,0,0.25)",
        }}
      >
        <h2 style={{ marginTop: 0 }}>Để lại hộp đồ cho <b>{targetName}</b></h2>
        {/* <p>Để lại hộp đồ cho <b>{targetName}</b></p> */}
        <div style={{ display: "grid", gap: 8 }}>
          <span style={{ fontWeight: 700 }}>Hàng hiện có</span>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {state.availableStockIds.map((itemId) =>
              renderMerchantItemTile({
                tileKey: itemId,
                itemId,
                selected: effectiveSelectedItemId === itemId,
                onClick: () => setSelectedItemId(itemId),
              })
            )}
          </div>
        </div>

        {effectiveSelectedItemId ? (
          <div style={{ marginTop: 10, opacity: 0.75 }}>
            Công dụng: {MERCHANT_ITEM_DESCRIPTIONS[effectiveSelectedItemId]}
          </div>
        ) : null}

        <div style={{ display: "flex", gap: 10, marginTop: 18, alignItems: "center" }}>
          Dạng khóa:
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

  const detailModal = visibleDetailItemId ? (
    <div
      onClick={closeDetailItem}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.42)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
        zIndex: 10000,
      }}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        style={{
          width: "min(92vw, 520px)",
          borderRadius: 10,
          border: "1px solid var(--border)",
          background: "var(--surface)",
          color: "var(--text)",
          overflow: "hidden",
          boxShadow: "0 18px 40px rgba(0,0,0,0.32)",
        }}
      >
        {MERCHANT_ITEM_FULL_IMAGES[visibleDetailItemId] ? (
          <img
            src={MERCHANT_ITEM_FULL_IMAGES[visibleDetailItemId] || ""}
            alt=""
            style={{ width: "100%", display: "block", maxHeight: "62vh", objectFit: "cover" }}
          />
        ) : null}
        <div style={{ padding: 18, display: "grid", gap: 8 }}>
          <div style={{ fontSize: 20, fontWeight: 800 }}>{MERCHANT_ITEM_LABELS[visibleDetailItemId]}</div>
          <div style={{ opacity: 0.78, lineHeight: 1.5 }}>{MERCHANT_ITEM_DESCRIPTIONS[visibleDetailItemId]}</div>
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
            <button type="button" onClick={closeDetailItem} style={{ padding: "8px 14px" }}>
              Đóng
            </button>
          </div>
        </div>
      </div>
    </div>
  ) : null;

  return {
    onPlayerClick,
    modal: (
      <>
        {offerModal}
        <ConfirmModal
          open={!!infoMessage}
          title="Giao dịch không hợp lệ"
          message={infoMessage || ""}
          infoOnly
          onConfirm={() => setInfoMessage(null)}
          onCancel={() => setInfoMessage(null)}
        />
      </>
    ),
    panel: (
      <>
        {detailModal}
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
