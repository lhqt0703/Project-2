import { getParticipantPlayers } from "./roomState.js";
import { ensureRoomGameRules, type Room } from "./serverTypes.js";

export const WOLF_TURN_DURATION_MS = 20_000;
export const TWO_HEARTS_MAX_HP = 2;
export const TWO_HEARTS_NIGHT_LIMIT = 2;
export const RULES_RESTART_FADE_IN_MS = 1000;
export const RULES_RESTART_HOLD_MS = 2000;
export const RULES_RESTART_FADE_OUT_MS = 500;
export const RULES_RESTART_TOTAL_MS = RULES_RESTART_FADE_IN_MS + RULES_RESTART_HOLD_MS + RULES_RESTART_FADE_OUT_MS;
export const RULES_RESTART_RESTART_AT_MS = RULES_RESTART_FADE_IN_MS + RULES_RESTART_HOLD_MS;

const NIGHT_ACTION_DURATION_STEP_SEC = 10;
const NIGHT_ACTION_DURATION_MIN_SEC = 0;
const NIGHT_ACTION_DURATION_MAX_SEC = 60;

export function initTwoHeartsForParticipants(room: Room) {
  const hp: Record<string, number> = {};
  for (const p of getParticipantPlayers(room)) {
    hp[p.id] = TWO_HEARTS_MAX_HP;
  }
  room.playerHearts = hp;
  room.sharedHeartsVisible = true;
}

export function isTwoHeartsDamageMode(room: Room) {
  const rules = ensureRoomGameRules(room);
  return (
    rules.twoHeartsFirstTwoNights &&
    room.sharedHeartsVisible === true &&
    (room.nightCount || 0) <= TWO_HEARTS_NIGHT_LIMIT
  );
}

export function clampNonWolfNightActionDurationSec(value: unknown) {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return 20;
  const rounded = Math.round(n / NIGHT_ACTION_DURATION_STEP_SEC) * NIGHT_ACTION_DURATION_STEP_SEC;
  return Math.max(NIGHT_ACTION_DURATION_MIN_SEC, Math.min(NIGHT_ACTION_DURATION_MAX_SEC, rounded));
}

export function clampWolfNightActionDurationSec(value: unknown) {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return 20;
  const rounded = Math.round(n / NIGHT_ACTION_DURATION_STEP_SEC) * NIGHT_ACTION_DURATION_STEP_SEC;
  return Math.max(NIGHT_ACTION_DURATION_MIN_SEC, Math.min(NIGHT_ACTION_DURATION_MAX_SEC, rounded));
}
