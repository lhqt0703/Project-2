import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import ConfirmModal from "../components/ConfirmModal";
import {
  type CoTyPhuBonusPercent,
  type RoomData,
  useRoomContext,
} from "../context/RoomContext";
import { clientId, socket } from "../socket";
import "./GameCoTyPhu.css";

const BONUS_OPTIONS: CoTyPhuBonusPercent[] = [100, 150, 200, 300, 500];
const formatMoney = (value: number) => `${Math.max(0, value || 0).toLocaleString("vi-VN")}đ`;
const parseMoney = (value: string) => Number(value.replace(/\D/g, ""));

export default function GameCoTyPhu() {
  const { room, setRoom } = useRoomContext();
  const nav = useNavigate();
  const [baseAmount, setBaseAmount] = useState("");
  const [bonusClicks, setBonusClicks] = useState<number[]>([]);
  const [customBonus, setCustomBonus] = useState("");
  const [recipientId, setRecipientId] = useState("");
  const [notice, setNotice] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [showEndConfirm, setShowEndConfirm] = useState(false);

  useEffect(() => {
    if (!room?.id) return;
    const roomId = room.id;
    const handleRoomUpdated = (nextRoom: RoomData) => {
      if (nextRoom.id === roomId) setRoom(nextRoom);
    };
    const handleError = (message: string) => setNotice(message);
    const syncRoom = () => socket.emit("getRoom", roomId);
    socket.on("roomUpdated", handleRoomUpdated);
    socket.on("errorMessage", handleError);
    socket.on("connect", syncRoom);
    return () => {
      socket.off("roomUpdated", handleRoomUpdated);
      socket.off("errorMessage", handleError);
      socket.off("connect", syncRoom);
    };
  }, [room?.id, setRoom]);

  const state = room?.coTyPhuState;
  const playersById = useMemo(
    () => Object.fromEntries((room?.players || []).map((player) => [player.id, player])),
    [room?.players],
  );
  const leaderboard = useMemo(
    () => [...(room?.players || [])].sort(
      (left, right) => (state?.balances[right.id] ?? 0) - (state?.balances[left.id] ?? 0),
    ),
    [room?.players, state?.balances],
  );

  if (!room || room.gameMode !== "co_ty_phu" || !state) return null;

  const bankruptIds = new Set(state.bankruptPlayerIds);
  const myBalance = state.balances[clientId] ?? 0;
  const amBankrupt = bankruptIds.has(clientId);
  const isHost = room.hostId === clientId;
  const isFinished = room.gameOver || room.phase === "finished";
  const normalizedBase = parseMoney(baseAmount);
  const bonusPercent = bonusClicks.reduce<number>((total, percent) => total + percent, 0);
  const totalAmount = Math.round(normalizedBase * (1 + bonusPercent / 100));
  const willGoBankrupt = totalAmount > myBalance;
  const recipients = room.players.filter(
    (player) => player.id !== clientId && !bankruptIds.has(player.id),
  );
  const winnerNames = state.winnerPlayerIds
    .map((id) => playersById[id]?.name)
    .filter(Boolean)
    .join(" & ");

  const transferMoney = () => {
    if (!recipientId || normalizedBase < 1) return;
    setIsSending(true);
    setNotice("");
    socket.emit(
      "coTyPhuTransfer",
      { roomId: room.id, toPlayerId: recipientId, baseAmount: normalizedBase, bonusPercent },
      (result: { ok: boolean; message?: string }) => {
        setIsSending(false);
        if (!result.ok) {
          setNotice(result.message || "Không thể chuyển tiền.");
          return;
        }
        setNotice(`Đã chuyển ${formatMoney(totalAmount)} cho ${playersById[recipientId]?.name || "người nhận"}.`);
        setBaseAmount("");
        setBonusClicks([]);
        setCustomBonus("");
        setRecipientId("");
      },
    );
  };

  return (
    <main className="ctp-game-page">
      <header className="ctp-game-header">
        <div>
          <span className="ctp-game-kicker">CỜ TỶ PHÚ · PHÒNG {room.id}</span>
          <h1>Ngân hàng bàn cờ</h1>
        </div>
        <div className={`ctp-my-wallet ${amBankrupt ? "is-bankrupt" : ""}`}>
          <span>Số dư của bạn</span>
          <strong>{formatMoney(myBalance)}</strong>
          {amBankrupt && <small>ĐÃ PHÁ SẢN</small>}
        </div>
      </header>

      {isFinished && (
        <section className="ctp-winner-banner">
          <span>VÁN ĐẤU ĐÃ KẾT THÚC</span>
          <h2>🏆 {winnerNames || "Chưa xác định"} chiến thắng</h2>
          <p>Người thắng có số dư cao nhất khi ván kết thúc.</p>
          <button onClick={() => nav(`/room?roomId=${room.id}`)}>Trở về phòng</button>
        </section>
      )}

      <section className="ctp-game-layout">
        <div className="ctp-game-card ctp-calculator">
          <div className="ctp-card-title">
            <span>01</span>
            <div><small>TÍNH TIỀN THUÊ ĐẤT</small><h2>Giá gốc và hiệu ứng</h2></div>
          </div>

          <label htmlFor="land-price">Nhập giá đất ngoài đời</label>
          <div className="ctp-land-input">
            <input
              id="land-price"
              inputMode="numeric"
              value={baseAmount}
              disabled={amBankrupt || isFinished}
              onChange={(event) => {
                const value = parseMoney(event.target.value);
                setBaseAmount(value ? value.toLocaleString("vi-VN") : "");
              }}
            />
            <span>đ</span>
          </div>
          <button
            className="ctp-quarter-button"
            disabled={amBankrupt || isFinished || myBalance < 1}
            onClick={() => {
              setBaseAmount(Math.floor(myBalance * 0.25).toLocaleString("vi-VN"));
              setBonusClicks([]);
            }}
          >
            Dùng 25% số dư hiện tại · {formatMoney(Math.floor(myBalance * 0.25))}
          </button>

          <div className="ctp-bonus-heading">
            <label>Chọn hiệu ứng tăng giá · có thể bấm nhiều lần</label>
            {bonusClicks.length > 0 && (
              <button onClick={() => setBonusClicks([])}>Xóa hiệu ứng</button>
            )}
          </div>
          <div className="ctp-bonus-grid">
            {BONUS_OPTIONS.map((percent) => {
              const clickCount = bonusClicks.filter((value) => value === percent).length;
              return (
                <button
                  key={percent}
                  disabled={amBankrupt || isFinished}
                  className={clickCount > 0 ? "is-selected" : ""}
                  onClick={() => setBonusClicks((current) => [...current, percent])}
                >
                  +{percent}%{clickCount > 1 ? <small>×{clickCount}</small> : null}
                </button>
              );
            })}
          </div>
          <div className="ctp-custom-bonus">
            <div>
              <span>+</span>
              <input
                aria-label="Phần trăm tùy chỉnh"
                inputMode="numeric"
                value={customBonus}
                disabled={amBankrupt || isFinished}
                onChange={(event) => setCustomBonus(event.target.value.replace(/\D/g, ""))}
                onKeyDown={(event) => {
                  if (event.key !== "Enter") return;
                  const percent = Number(customBonus);
                  if (!Number.isSafeInteger(percent) || percent < 1) return;
                  setBonusClicks((current) => [...current, percent]);
                  setCustomBonus("");
                }}
              />
              <span>%</span>
            </div>
            <button
              disabled={amBankrupt || isFinished || !Number.isSafeInteger(Number(customBonus)) || Number(customBonus) < 1}
              onClick={() => {
                const percent = Number(customBonus);
                if (!Number.isSafeInteger(percent) || percent < 1) return;
                setBonusClicks((current) => [...current, percent]);
                setCustomBonus("");
              }}
            >
              Cộng vào hiệu ứng
            </button>
          </div>

          <div className="ctp-total-panel">
            <div><span>Tổng cần trả</span><small>{bonusPercent ? `Giá gốc + ${bonusPercent}%` : "Giá trị trực tiếp"}</small></div>
            <strong>{formatMoney(totalAmount)}</strong>
          </div>

          {willGoBankrupt && totalAmount > 0 && (
            <div className="ctp-bankruptcy-warning">
              Bạn đang thiếu {formatMoney(totalAmount - myBalance)}. Người nhận vẫn nhận đủ và bạn sẽ phá sản.
            </div>
          )}

          <label>Chọn người nhận</label>
          <div className="ctp-recipient-grid">
            {recipients.map((player) => (
              <button
                key={player.id}
                className={recipientId === player.id ? "is-selected" : ""}
                disabled={amBankrupt || isFinished}
                onClick={() => setRecipientId(player.id)}
              >
                <span>{player.name.charAt(0).toUpperCase()}</span>
                <div><strong>{player.name}</strong><small>{formatMoney(state.balances[player.id] ?? 0)}</small></div>
              </button>
            ))}
          </div>

          <button
            className="ctp-send-button"
            disabled={isSending || amBankrupt || isFinished || !recipientId || normalizedBase < 1}
            onClick={transferMoney}
          >
            {isSending ? "Đang chuyển…" : `Chuyển ${formatMoney(totalAmount)}`}
          </button>
          {notice && <p className="ctp-game-notice">{notice}</p>}
        </div>

        <aside className="ctp-game-sidebar">
          <div className="ctp-game-card ctp-leaderboard">
            <div className="ctp-card-title">
              <span>02</span>
              <div><small>BẢNG TÀI SẢN</small><h2>Xếp hạng hiện tại</h2></div>
            </div>
            <div className="ctp-ranking-list">
              {leaderboard.map((player, index) => (
                <div key={player.id} className={bankruptIds.has(player.id) ? "is-bankrupt" : ""}>
                  <b>#{index + 1}</b>
                  <span>{player.name}{player.id === room.hostId ? " · Host" : ""}</span>
                  <strong>{bankruptIds.has(player.id) ? "Phá sản" : formatMoney(state.balances[player.id] ?? 0)}</strong>
                </div>
              ))}
            </div>
          </div>

          <div className="ctp-game-card ctp-history">
            <div className="ctp-card-title">
              <span>03</span>
              <div><small>GIAO DỊCH GẦN ĐÂY</small><h2>Lịch sử chuyển tiền</h2></div>
            </div>
            {state.transactions.length === 0 ? (
              <p className="ctp-empty-history">Chưa có giao dịch nào.</p>
            ) : (
              <div className="ctp-history-list">
                {state.transactions.map((transaction) => (
                  <div key={transaction.id}>
                    <span>{playersById[transaction.fromPlayerId]?.name} → {playersById[transaction.toPlayerId]?.name}</span>
                    <strong>{formatMoney(transaction.totalAmount)}</strong>
                    <small>
                      {transaction.bonusPercent > 0
                        ? `${formatMoney(transaction.baseAmount)} + ${transaction.bonusPercent}%`
                        : "Giá trị trực tiếp"}
                    </small>
                  </div>
                ))}
              </div>
            )}
          </div>

          {isHost && !isFinished && (
            <button className="ctp-end-button" onClick={() => setShowEndConfirm(true)}>
              Kết thúc trò chơi và tính người thắng
            </button>
          )}
        </aside>
      </section>

      <ConfirmModal
        open={showEndConfirm}
        title="Kết thúc Cờ tỷ phú?"
        message="Hệ thống sẽ kết thúc ván ngay và chọn người đang có nhiều tiền nhất làm người thắng."
        confirmText="Kết thúc và tính kết quả"
        cancelText="Tiếp tục chơi"
        onCancel={() => setShowEndConfirm(false)}
        onConfirm={() => {
          setShowEndConfirm(false);
          socket.emit("coTyPhuEndGame", { roomId: room.id }, (result: { ok: boolean; message?: string }) => {
            if (!result.ok) setNotice(result.message || "Không thể kết thúc trò chơi.");
          });
        }}
      />
    </main>
  );
}
