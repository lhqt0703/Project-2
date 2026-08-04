import type { CoTyPhuState, Room } from "./serverTypes.js";

export const CO_TY_PHU_DEFAULT_STARTING_MONEY = 10_000;
export const CO_TY_PHU_MAX_MONEY = 1_000_000_000_000;
export const CO_TY_PHU_BONUS_PERCENTAGES = [100, 150, 200, 300, 500] as const;

export type CoTyPhuBonusPercent = (typeof CO_TY_PHU_BONUS_PERCENTAGES)[number];

type CoTyPhuResult = { ok: true } | { ok: false; message: string };

function normalizeBonusPercent(value: unknown): number | null {
  const percent = Number(value);
  if (percent === 0) return 0;
  if (!Number.isSafeInteger(percent) || percent < 1) return null;
  return percent;
}

export function normalizeCoTyPhuMoney(value: unknown): number | null {
  const money = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(money) || money < 1 || money > CO_TY_PHU_MAX_MONEY) return null;
  return money;
}

export function calculateCoTyPhuPayment(
  baseAmount: unknown,
  bonusPercent: unknown,
): number | null {
  const base = normalizeCoTyPhuMoney(baseAmount);
  const normalizedBonus = normalizeBonusPercent(bonusPercent);
  if (base === null || normalizedBonus === null) return null;
  const total = Math.round(base * (1 + normalizedBonus / 100));
  return Number.isSafeInteger(total) ? total : null;
}

export function ensureCoTyPhuState(room: Room): CoTyPhuState {
  room.coTyPhuState ||= {
    startingMoney: CO_TY_PHU_DEFAULT_STARTING_MONEY,
    balances: {},
    bankruptPlayerIds: [],
    transactions: [],
    winnerPlayerIds: [],
  };
  return room.coTyPhuState;
}

export function setCoTyPhuStartingMoney(room: Room, value: unknown): CoTyPhuResult {
  const startingMoney = normalizeCoTyPhuMoney(value);
  if (startingMoney === null) {
    return { ok: false, message: "Số tiền bắt đầu phải là số nguyên từ 1đ đến 1.000.000.000.000đ." };
  }
  ensureCoTyPhuState(room).startingMoney = startingMoney;
  return { ok: true };
}

export function startCoTyPhuRound(room: Room): CoTyPhuResult {
  if (room.players.length < 2) {
    return { ok: false, message: "Cần ít nhất 2 người trong phòng để bắt đầu." };
  }
  const state = ensureCoTyPhuState(room);
  state.balances = Object.fromEntries(room.players.map((player) => [player.id, state.startingMoney]));
  state.bankruptPlayerIds = [];
  state.transactions = [];
  state.winnerPlayerIds = [];
  room.phase = "playing";
  room.gameOver = false;
  room.hasPlayedMatch = true;
  return { ok: true };
}

export function finishCoTyPhuRound(room: Room): CoTyPhuResult {
  const state = ensureCoTyPhuState(room);
  const playerIds = room.players.map((player) => player.id);
  if (playerIds.length === 0) return { ok: false, message: "Phòng chưa có người chơi." };

  const highestBalance = Math.max(...playerIds.map((id) => state.balances[id] ?? 0));
  state.winnerPlayerIds = playerIds.filter((id) => (state.balances[id] ?? 0) === highestBalance);
  room.phase = "finished";
  room.gameOver = true;
  return { ok: true };
}

export function transferCoTyPhuMoney(
  room: Room,
  fromPlayerId: string,
  toPlayerId: string,
  baseAmount: unknown,
  bonusPercent: unknown,
  now = Date.now(),
): CoTyPhuResult {
  if (room.phase !== "playing" || room.gameOver) {
    return { ok: false, message: "Ván Cờ tỷ phú chưa bắt đầu hoặc đã kết thúc." };
  }

  const state = ensureCoTyPhuState(room);
  const playerIds = new Set(room.players.map((player) => player.id));
  if (!playerIds.has(fromPlayerId) || !playerIds.has(toPlayerId) || fromPlayerId === toPlayerId) {
    return { ok: false, message: "Người nhận không hợp lệ." };
  }
  if (state.bankruptPlayerIds.includes(fromPlayerId)) {
    return { ok: false, message: "Bạn đã phá sản nên không thể chuyển thêm tiền." };
  }
  if (state.bankruptPlayerIds.includes(toPlayerId)) {
    return { ok: false, message: "Không thể chuyển tiền cho người đã phá sản." };
  }

  const normalizedBase = normalizeCoTyPhuMoney(baseAmount);
  const normalizedBonus = normalizeBonusPercent(bonusPercent);
  const totalAmount = calculateCoTyPhuPayment(baseAmount, normalizedBonus);
  if (normalizedBase === null || normalizedBonus === null || totalAmount === null) {
    return { ok: false, message: "Giá đất hoặc mức tăng không hợp lệ." };
  }

  const recipientBalance = state.balances[toPlayerId] ?? 0;
  if (!Number.isSafeInteger(recipientBalance + totalAmount)) {
    return { ok: false, message: "Số dư người nhận đã vượt giới hạn an toàn." };
  }

  const senderBalance = state.balances[fromPlayerId] ?? 0;
  const isBankrupt = totalAmount > senderBalance;
  state.balances[fromPlayerId] = isBankrupt ? 0 : senderBalance - totalAmount;
  state.balances[toPlayerId] = recipientBalance + totalAmount;
  if (isBankrupt) state.bankruptPlayerIds.push(fromPlayerId);
  state.transactions = [
    {
      id: `${now}-${fromPlayerId}-${state.transactions.length}`,
      fromPlayerId,
      toPlayerId,
      baseAmount: normalizedBase,
      bonusPercent: normalizedBonus,
      totalAmount,
      createdAt: now,
    },
    ...state.transactions,
  ].slice(0, 50);

  const activePlayerIds = room.players
    .map((player) => player.id)
    .filter((id) => !state.bankruptPlayerIds.includes(id));
  if (activePlayerIds.length <= 1) finishCoTyPhuRound(room);
  return { ok: true };
}
