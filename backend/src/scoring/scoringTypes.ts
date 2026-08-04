export type ScoreCategory = "team_result" | "survival" | "action" | "clutch" | "special_win" | "penalty";

export type EventType =
  | "TEAM_WIN_VILLAGERS"
  | "TEAM_WIN_WOLVES"
  | "TEAM_WIN_COUPLE"
  | "TEAM_WIN_MERCHANT"
  | "PLAYER_SURVIVED_TO_END"
  | "GUARD_BLOCKED_WOLF_KILL"
  | "GUARD_SAVED_CORE_ROLE"
  | "SEER_FOUND_WOLF"
  | "SEER_FOUND_SPECIAL_WOLF"
  | "WITCH_KILLED_WOLF"
  | "WITCH_KILLED_SPECIAL_WOLF"
  | "WITCH_SAVED_PLAYER"
  | "WITCH_SAVED_CORE_ROLE"
  | "WITCH_KILLED_VILLAGER"
  | "WITCH_KILLED_CORE_ROLE"
  | "HUNTER_SHOT_WOLF"
  | "HUNTER_SHOT_SPECIAL_WOLF"
  | "HUNTER_SHOT_VILLAGER"
  | "HUNTER_SHOT_CORE_ROLE"
  | "ELEMENTAL_BUFF_ACTIVATED"
  | "ELEMENTAL_BUFF_CREATED_IMPACT"
  | "VILLAGER_VOTED_EXECUTED_WOLF"
  | "VILLAGER_VOTED_EXECUTED_SPECIAL_WOLF"
  | "WOLF_VOTED_EXECUTED_VILLAGER"
  | "WOLF_VOTED_EXECUTED_CORE_ROLE"
  | "WOLF_SAVED_WOLF_FROM_EXECUTION"
  | "WOLF_NIGHT_KILLED_VILLAGER"
  | "WOLF_NIGHT_KILLED_CORE_ROLE"
  | "CURSED_FOUND_WOLF_ZONE"
  | "CURSED_INFO_LED_TO_WOLF_EXECUTION"
  | "MAYOR_SECOND_VOTE_KILLED_WOLF"
  | "MAYOR_SECOND_VOTE_KILLED_FINAL_WOLF"
  | "MAYOR_SECOND_VOTE_KILLED_VILLAGER"
  | "SHIELD_GIVER_PROTECTED_VILLAGER"
  | "SHIELD_GIVER_PROTECTED_CORE_ROLE"
  | "SHIELD_BLOCKED_DEATH"
  | "SHIELD_BLOCKED_CORE_ROLE_DEATH"
  | "SHIELD_GIVEN_TO_WOLF"
  | "SIDE_PICKER_CHOSE_WINNING_TEAM_EARLY"
  | "SIDE_PICKER_CHOSE_WINNING_TEAM_MID"
  | "SIDE_PICKER_CHOSE_WINNING_TEAM_LATE"
  | "LOVE_COUPLE_SAME_TEAM_SURVIVED_TO_END"
  | "LOVE_COUPLE_SPECIAL_WIN"
  | "LOVE_COUPLE_ESCAPE_DODGED_WOLF_KILL"
  | "LOVE_COUPLE_ESCAPE_DODGED_WITCH_KILL"
  | "LOVE_COUPLE_ESCAPE_DODGED_MULTIPLE_DEATHS"
  | "MERCHANT_SUCCESSFUL_TRADE"
  | "MERCHANT_COMPLETED_PERSONAL_WIN"
  | "MERCHANT_COMPLETED_SIDE_OBJECTIVE"
  | "COFFEE_MAKER_FOUND_BOTH"
  | "MANUAL_CLUTCH_BONUS"
  | "MANUAL_PENALTY";

export interface PlayerState {
  id: string;
  name: string;
  role: string;
  team: string; // original team (e.g. villagers, wolves, neutral)
  finalTeam: string; // team at end (e.g. villagers, wolves, couple, merchant, neutral)
  aliveAtEnd: boolean;
  specialWin?: boolean; // flags special win achieved (e.g. neutral player special win)
}

export interface CoupleConfig {
  loveGodId: string;
  partnerId: string;
  sameOriginalTeam: boolean;
  isSpecialCouple: boolean;
  achievedSpecialWin: boolean;
}

export interface EventLog {
  type: EventType;
  actorId?: string;
  actorIds?: string[];
  targetId?: string;
  night?: number;
  phase?: string;
  metadata?: Record<string, any>;
}

export interface ManualBonus {
  playerId: string;
  points: number;
  reason: string;
  category: ScoreCategory; // Fully config-driven manual categories
}

export interface GameSummary {
  gameId: string;
  playerCount: number;
  winningTeam: string | null; // villagers | wolves | couple | merchant | neutral | null
  players: PlayerState[];
  couples?: CoupleConfig[];
  events: EventLog[];
  manualBonuses?: ManualBonus[];
}

export interface ScoreBreakdownEntry {
  category: ScoreCategory;
  points: number;
  reason: string;
}

export interface PlayerRanking {
  playerId: string;
  name: string;
  role: string;
  team: string;
  finalTeam: string;
  aliveAtEnd: boolean;
  totalScore: number;
  breakdown: ScoreBreakdownEntry[];
  clutchPoints: number;
  actionPoints: number;
  isWinner: boolean;
}

export interface ScoringResult {
  gameId: string;
  mvp: {
    playerId: string;
    name: string;
    score: number;
  } | {
    playerId: string;
    name: string;
    score: number;
  }[]; // Support single or co-MVP
  ranking: PlayerRanking[];
}
