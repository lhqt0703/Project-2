import { ELEMENTAL_GROUP_ROLE, type ElementalBuffId, type ElementalRole } from "./elemental.js";
import { PROTECTOR_ROLE } from "./specialRoles.js";

export interface Player {
  id: string;
  name: string;
  connected?: boolean;
  inGame?: boolean;
}

export type NightActionRole = "Sói" | "Bảo vệ" | typeof PROTECTOR_ROLE | "Phù thủy" | "Linh sói" | "Thợ săn" | "Tiên tri" | "Thần tình yêu" | ElementalRole;

export type NightActionOrderRole = NightActionRole | typeof ELEMENTAL_GROUP_ROLE;

export interface RoomGameRules {
  twoHeartsFirstTwoNights: boolean;
  forceWolfBiteFirstNight: boolean;
  allNightActionsSimultaneous: boolean;
  witchSeeBiteOnlyIfHasHealPotion: boolean;
  witchHideProtectedBiteInSimultaneous: boolean;
  witchHideProtectedBiteWhenSequential: boolean;
  trialInteractionSelectionLimit: number;
  nonWolfNightActionDurationSec: number;
  wolfNightActionDurationSec: number;
  nightActionOrder: NightActionOrderRole[];
  banSoiBecomeWolfEvenIfHealed: boolean;
  villageChiefKnowsWolfBite: boolean;
  witchSeeProtectorImmortalBite: boolean;
}

export interface Room {
  id: string;
  players: Player[];
  hostId: string;
  hidePlayerRoleText?: boolean;
  roles?: string[];
  rolesLocked?: boolean;
  lockedPlayerIds?: string[];
  pendingRoleAssignments?: Record<string, string>;
  pendingRoleBlocks?: Record<string, string[]>;
  phase?: string;
  positions?: { playerId: string; x: number; y: number }[];
  positionEditors?: string[];
  playerRoles?: Record<string, string>;
  publicRevealedRolesByPlayerId?: Record<string, string>;
  nightCount?: number;
  gameLog?: GameLogNight[];
  wolves?: string[];
  wolfVotes?: Record<string, string | null>;
  wolfVotes2?: Record<string, string | null>;
  wolfLocked?: Record<string, boolean>;
  wolfTimer?: NodeJS.Timeout | null;
  wolfDeadline?: number | null;
  wolfVoteResolvedTonight?: boolean;
  killedTonight?: string | null;
  killedTonightExtra?: string | null;
  wolfExtraBiteNextNight?: boolean;
  wolfBonusBiteThisNight?: boolean;
  deadPlayers?: string[];
  sharedHeartsVisible?: boolean;
  playerHearts?: Record<string, number>;
  privatePlayerHearts?: Record<string, number>;
  privateHeartVisiblePlayerIds?: string[];
  playerHeartShakeIds?: string[];
  dayVoters?: string[];
  dayVotes?: Record<string, string | null>;
  dayLocked?: Record<string, boolean>;
  dayVoteKind?: "main" | "village_chief_extra";
  dayDiscussionTimer?: NodeJS.Timeout | null;
  dayDiscussionDeadline?: number | null;
  dayTimer?: NodeJS.Timeout | null;
  dayDeadline?: number | null;
  trialTargetId?: string | null;
  trialStage?: "none" | "defense" | "verdict";
  trialDefenseDeadline?: number | null;
  trialVerdictDeadline?: number | null;
  trialDefenseTimer?: NodeJS.Timeout | null;
  trialVerdictTimer?: NodeJS.Timeout | null;
  trialInteractionCut?: boolean;
  trialInteractionActiveIds?: string[];
  trialSelectedInteractorId?: string | null;
  trialSelectedInteractorIds?: string[];
  trialInteractionSelectionLimit?: number;
  trialInteractionQueuedIds?: string[];
  trialVotes?: Record<string, "live" | "die" | null>;
  protectedTonight?: string | null;
  protectedTonightBy?: string | null;
  lastProtected?: string | null;
  seerUsedTonight?: Record<string, number>;
  witchPotions?: Record<string, { healUsed: boolean; poisonUsed: boolean }>;
  witchHealTargetTonight?: Record<string, string | null>;
  witchPoisonTargetTonight?: Record<string, string | null>;
  hunterTargetTonight?: Record<string, string | null>;
  hunterShotPlayerIds?: string[];
  loveCupidId?: string | null;
  loveTargetId?: string | null;
  loveTargetWolfAligned?: boolean;
  lovePairCreatedNight?: number | null;
  loveEscapeUsed?: boolean;
  loveEscapeVotesTonight?: Record<string, boolean>;
  loveEscapeVoteAt?: Record<string, number>;
  loveEscapeActiveTonight?: boolean;
  loveEscapeActivatedAt?: number | null;
  wolfAttackResolvedAt?: number | null;
  protectedTonightAt?: number | null;
  witchHealTargetAt?: Record<string, number>;
  witchPoisonTargetAt?: Record<string, number>;
  nightTurnIndex?: number;
  nightTurnRole?: NightActionRole | null;
  nightTurnDeadline?: number | null;
  nightTurnPaused?: boolean;
  nightTurnRemainingMs?: number | null;
  nightTurnTimer?: NodeJS.Timeout | null;
  nightTurnOrderSnapshot?: NightActionRole[];
  autoArrangeUsed?: boolean;
  compactCircles?: boolean;
  layoutHeightPx?: number;
  gameOver?: boolean;
  winner?: "wolves" | "villagers" | "lovers" | "nobody" | undefined;
  gameRules?: RoomGameRules;
  pendingGameRules?: RoomGameRules;
  spiritWolfId?: string | null;
  spiritWolfDecisionMade?: boolean;
  spiritWolfChoseSave?: boolean;
  spiritWolfWolfAligned?: boolean;
  spiritWolfWolfAlignedPending?: boolean;
  spiritWolfPendingPoisonedWolfId?: string | null;
  spiritWolfDecisionDeadline?: number | null;
  spiritWolfDecisionTimer?: NodeJS.Timeout | null;
  banSoiId?: string | null;
  banSoiWolfAligned?: boolean;
  banSoiWolfAlignedPending?: boolean;
  wildWolfId?: string | null;
  wildWolfConvertReadyNextNight?: boolean;
  wildWolfConvertAvailableTonight?: boolean;
  wildWolfConvertRequestedTonight?: boolean;
  wildWolfConvertActorId?: string | null;
  wildWolfConvertTargetId?: string | null;
  wildWolfConvertUsed?: boolean;
  wildWolfConvertedPlayerIds?: string[];
  villageChiefPendingWolfDeath?: { playerId: string; bittenNight: number; attackerIds: string[] } | null;
  villageChiefExtraVoteAvailable?: boolean;
  villageChiefExtraVoteReady?: boolean;
  villageChiefExtraVoteUsed?: boolean;
  protectorActorId?: string | null;
  protectorTargetId?: string | null;
  protectorTargetSetNight?: number | null;
  protectorImmortalityPermanent?: boolean;
  elementalTargetTonight?: Record<string, string | null>;
  elementalCorrectGuessPlayerIdsTonight?: string[];
  elementalCorrectGuessCountForBuff?: number;
  elementalPendingBuffVoteNight?: number | null;
  elementalBuffVotesTonight?: Record<string, ElementalBuffId | null>;
  elementalBuffVotesResolvedNight?: number | null;
  elementalSelectedBuffId?: ElementalBuffId | null;
  elementalSelectedBuffAppliesNight?: number | null;
  elementalBuffQuickMode?: boolean;
}

const DEFAULT_ROOM_GAME_RULES: RoomGameRules = {
  twoHeartsFirstTwoNights: true,
  forceWolfBiteFirstNight: false,
  allNightActionsSimultaneous: false,
  witchSeeBiteOnlyIfHasHealPotion: true,
  witchHideProtectedBiteInSimultaneous: false,
  witchHideProtectedBiteWhenSequential: true,
  trialInteractionSelectionLimit: 2,
  nonWolfNightActionDurationSec: 20,
  wolfNightActionDurationSec: 20,
  nightActionOrder: ["Thần tình yêu", "Sói", "Bảo vệ", PROTECTOR_ROLE, "Phù thủy", "Linh sói", "Thợ săn", "Tiên tri"],
  banSoiBecomeWolfEvenIfHealed: false,
  villageChiefKnowsWolfBite: true,
  witchSeeProtectorImmortalBite: true,
};

DEFAULT_ROOM_GAME_RULES.nightActionOrder = [
  ELEMENTAL_GROUP_ROLE,
  ...DEFAULT_ROOM_GAME_RULES.nightActionOrder.filter((role) => role !== ELEMENTAL_GROUP_ROLE),
];

const NIGHT_ACTION_ROLE_SET = new Set<NightActionOrderRole>([
  ...DEFAULT_ROOM_GAME_RULES.nightActionOrder,
  ELEMENTAL_GROUP_ROLE,
]);

const NIGHT_ACTION_DURATION_STEP_SEC = 10;
const NIGHT_ACTION_DURATION_MIN_SEC = 0;
const NIGHT_ACTION_DURATION_MAX_SEC = 60;

function normalizeNightActionOrder(input: unknown): NightActionOrderRole[] {
  const raw = Array.isArray(input) ? input : [];
  const unique: NightActionOrderRole[] = [];
  for (const role of raw) {
    if (typeof role !== "string") continue;
    if (!NIGHT_ACTION_ROLE_SET.has(role as NightActionOrderRole)) continue;
    if (unique.includes(role as NightActionOrderRole)) continue;
    unique.push(role as NightActionOrderRole);
  }

  for (const role of DEFAULT_ROOM_GAME_RULES.nightActionOrder) {
    if (!unique.includes(role)) unique.push(role);
  }
  return unique;
}

function clampTrialInteractionSelectionLimit(value: unknown) {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return DEFAULT_ROOM_GAME_RULES.trialInteractionSelectionLimit;
  return Math.max(0, Math.min(10, Math.floor(n)));
}

function clampNightActionDurationSec(value: unknown, fallback: number) {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  const rounded = Math.round(n / NIGHT_ACTION_DURATION_STEP_SEC) * NIGHT_ACTION_DURATION_STEP_SEC;
  return Math.max(NIGHT_ACTION_DURATION_MIN_SEC, Math.min(NIGHT_ACTION_DURATION_MAX_SEC, rounded));
}

function clampNonWolfNightActionDurationSec(value: unknown) {
  return clampNightActionDurationSec(value, DEFAULT_ROOM_GAME_RULES.nonWolfNightActionDurationSec);
}

function clampWolfNightActionDurationSec(value: unknown) {
  return clampNightActionDurationSec(value, DEFAULT_ROOM_GAME_RULES.wolfNightActionDurationSec);
}

function normalizeNightActionDurations(input?: Partial<RoomGameRules> | null) {
  const nonWolf = clampNonWolfNightActionDurationSec(input?.nonWolfNightActionDurationSec);
  let wolf = clampWolfNightActionDurationSec(input?.wolfNightActionDurationSec);
  if (wolf > nonWolf) wolf = nonWolf;
  return {
    nonWolfNightActionDurationSec: nonWolf,
    wolfNightActionDurationSec: wolf,
  };
}

export function buildRoomGameRules(input?: Partial<RoomGameRules> | null): RoomGameRules {
  const normalizedDurations = normalizeNightActionDurations(input);
  const merged = {
    ...DEFAULT_ROOM_GAME_RULES,
    ...(input || {}),
    trialInteractionSelectionLimit: clampTrialInteractionSelectionLimit(input?.trialInteractionSelectionLimit),
    nonWolfNightActionDurationSec: normalizedDurations.nonWolfNightActionDurationSec,
    wolfNightActionDurationSec: normalizedDurations.wolfNightActionDurationSec,
    nightActionOrder: normalizeNightActionOrder(input?.nightActionOrder),
  };
  return {
    ...merged,
    forceWolfBiteFirstNight: merged.twoHeartsFirstTwoNights && merged.forceWolfBiteFirstNight,
  };
}

export function ensureRoomGameRules(room: Room): RoomGameRules {
  room.gameRules = buildRoomGameRules(room.gameRules);
  return room.gameRules;
}

export type GameLogEntryPhase = "night" | "day";

export type WolfVoteBreakdown = {
  targetId: string;
  voterIds: string[];
};

export type EliminationCause =
  | { type: "wolf"; attackerIds: string[] }
  | { type: "witch_poison" }
  | { type: "hunter_shot" }
  | { type: "love_link"; sourceId: string }
  | { type: "day_vote"; voterIds: string[] }
  | { type: "trial_verdict"; voterIds: string[] };

export type GameLogEntry =
  | { type: "wolf_vote"; phase: GameLogEntryPhase; voteBreakdown: WolfVoteBreakdown[] }
  | { type: "day_vote"; phase: GameLogEntryPhase; voteBreakdown: WolfVoteBreakdown[] }
  | { type: "day_vote_skipped"; phase: GameLogEntryPhase }
  | { type: "wolf_result"; phase: GameLogEntryPhase; targetIds: string[]; selectedByByTarget?: Record<string, string[]> }
  | { type: "day_result"; phase: GameLogEntryPhase; targetId: string | null; tie?: boolean }
  | { type: "trial_started"; phase: GameLogEntryPhase; targetId: string }
  | { type: "trial_verdict"; phase: GameLogEntryPhase; targetId: string; liveVotes: number; dieVotes: number; liveVoterIds?: string[]; dieVoterIds?: string[]; executed: boolean }
  | { type: "bonus_bite"; phase: GameLogEntryPhase }
  | { type: "guardian_protect"; phase: GameLogEntryPhase; actorId: string; targetId: string }
  | { type: "protector_bless"; phase: GameLogEntryPhase; actorId: string; targetId: string; permanent: boolean }
  | { type: "protector_save"; phase: GameLogEntryPhase; actorId: string | null; targetId: string; cause: EliminationCause; permanent: boolean }
  | { type: "village_chief_revealed"; phase: GameLogEntryPhase; targetId: string; reason: "day_vote" }
  | { type: "village_chief_bitten_warning"; phase: GameLogEntryPhase; targetId: string; attackerIds: string[] }
  | { type: "village_chief_delayed_death"; phase: GameLogEntryPhase; targetId: string }
  | { type: "village_chief_extra_vote_started"; phase: GameLogEntryPhase; chiefId: string }
  | { type: "witch_heal"; phase: GameLogEntryPhase; actorId: string; targetId: string }
  | { type: "witch_poison"; phase: GameLogEntryPhase; actorId: string; targetId: string }
  | { type: "seer_check"; phase: GameLogEntryPhase; actorId: string; targetId: string; isWolf: boolean }
  | { type: "hunter_mark"; phase: GameLogEntryPhase; actorId: string; targetId: string }
  | { type: "hunter_shot"; phase: GameLogEntryPhase; actorId: string; targetId: string }
  | { type: "love_pair"; phase: GameLogEntryPhase; actorId: string; targetId: string; targetWolfAligned: boolean }
  | { type: "love_escape_vote"; phase: GameLogEntryPhase; actorId: string; partnerId: string }
  | { type: "love_escape_missed"; phase: GameLogEntryPhase; actorId: string; partnerId: string }
  | { type: "love_escape"; phase: GameLogEntryPhase; targetIds: string[] }
  | { type: "love_link_death"; phase: GameLogEntryPhase; sourceId: string; targetId: string }
  | { type: "spirit_wolf_decision"; phase: GameLogEntryPhase; actorId?: string | null; saved: boolean; timedOut?: boolean }
  | { type: "ban_soi_aligned"; phase: GameLogEntryPhase; targetId: string }
  | { type: "wild_wolf_conversion"; phase: GameLogEntryPhase; actorId: string | null; targetId: string | null; success: boolean; previousTargetRole?: string | null; savedByGuardian?: boolean; savedByWitch?: boolean; reason?: "saved" | "no_target" }
  | { type: "saved_by_guardian"; phase: GameLogEntryPhase; targetIds: string[]; actorId?: string | null }
  | { type: "saved_by_witch"; phase: GameLogEntryPhase; targetIds: string[] }
  | { type: "eliminated"; phase: GameLogEntryPhase; targetIds: string[]; causesByTarget?: Record<string, EliminationCause[]> }
  | { type: "no_death"; phase: GameLogEntryPhase }
  | { type: "elemental_buff"; phase: GameLogEntryPhase; buffId: ElementalBuffId | null; tier: number; randomTieBreak?: boolean; tiedBuffIds?: ElementalBuffId[] }
  | { type: "elemental_guess"; phase: GameLogEntryPhase; actorId: string; targetId: string; isCorrect: boolean }
  | { type: "elemental_guess_summary"; phase: GameLogEntryPhase; correctCount: number; totalCount: number; correctIds?: string[]; triggeredBuffVote: boolean; nextBuffVoteNight?: number }
  | { type: "elemental_buff_vote"; phase: GameLogEntryPhase; voteBreakdown: { buffId: ElementalBuffId; voterIds: string[] }[]; chosenBuffId?: ElementalBuffId | null; tier?: number; randomTieBreak?: boolean; tiedBuffIds?: ElementalBuffId[]; chosenVoterIds?: string[] }
  | { type: "host_ended_game"; phase: GameLogEntryPhase };

export type GameLogNight = {
  night: number;
  at: number;
  entries: GameLogEntry[];
};

export type RolesRevealPayload = {
  roomId: string;
  rolesByPlayerId: Record<string, string>;
};
