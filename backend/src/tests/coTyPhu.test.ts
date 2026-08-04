import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateCoTyPhuPayment,
  finishCoTyPhuRound,
  setCoTyPhuStartingMoney,
  startCoTyPhuRound,
  transferCoTyPhuMoney,
} from "../coTyPhu.js";
import type { Room } from "../serverTypes.js";

function createRoom(): Room {
  return {
    id: "123",
    hostId: "host",
    gameMode: "co_ty_phu",
    players: [
      { id: "host", name: "Host" },
      { id: "player-b", name: "B" },
      { id: "player-c", name: "C" },
    ],
  };
}

test("tính tổng bằng giá gốc cộng phần trăm tăng", () => {
  assert.equal(calculateCoTyPhuPayment(500, 0), 500);
  assert.equal(calculateCoTyPhuPayment(500, 30), 650);
  assert.equal(calculateCoTyPhuPayment(500, 300), 2_000);
  assert.equal(calculateCoTyPhuPayment(300, 150), 750);
  assert.equal(calculateCoTyPhuPayment(500, 700), 4_000);
  assert.equal(calculateCoTyPhuPayment(500, -1), null);
});

test("host được cấp vốn giống mọi người khi bắt đầu", () => {
  const room = createRoom();
  assert.deepEqual(setCoTyPhuStartingMoney(room, 10_000), { ok: true });
  assert.deepEqual(startCoTyPhuRound(room), { ok: true });
  assert.deepEqual(room.coTyPhuState?.balances, {
    host: 10_000,
    "player-b": 10_000,
    "player-c": 10_000,
  });
});

test("người nhận được đủ tiền và người thiếu tiền phá sản", () => {
  const room = createRoom();
  setCoTyPhuStartingMoney(room, 1_000);
  startCoTyPhuRound(room);

  assert.deepEqual(transferCoTyPhuMoney(room, "host", "player-b", 500, 100, 1), { ok: true });
  assert.equal(room.coTyPhuState?.balances.host, 0);
  assert.equal(room.coTyPhuState?.balances["player-b"], 2_000);
  assert.deepEqual(room.coTyPhuState?.bankruptPlayerIds, []);

  assert.deepEqual(transferCoTyPhuMoney(room, "host", "player-b", 100, 100, 2), { ok: true });
  assert.equal(room.coTyPhuState?.balances.host, 0);
  assert.equal(room.coTyPhuState?.balances["player-b"], 2_200);
  assert.deepEqual(room.coTyPhuState?.bankruptPlayerIds, ["host"]);
});

test("tự kết thúc khi chỉ còn một người chưa phá sản", () => {
  const room = createRoom();
  setCoTyPhuStartingMoney(room, 100);
  startCoTyPhuRound(room);
  transferCoTyPhuMoney(room, "host", "player-b", 100, 100, 1);
  transferCoTyPhuMoney(room, "player-c", "player-b", 100, 100, 2);

  assert.equal(room.gameOver, true);
  assert.equal(room.phase, "finished");
  assert.deepEqual(room.coTyPhuState?.winnerPlayerIds, ["player-b"]);
});

test("host kết thúc thủ công thì chọn tất cả người đồng hạng cao nhất", () => {
  const room = createRoom();
  startCoTyPhuRound(room);
  room.coTyPhuState!.balances = { host: 20_000, "player-b": 20_000, "player-c": 5_000 };

  assert.deepEqual(finishCoTyPhuRound(room), { ok: true });
  assert.deepEqual(room.coTyPhuState?.winnerPlayerIds, ["host", "player-b"]);
});
