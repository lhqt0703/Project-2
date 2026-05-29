import type { MerchantDecision, MerchantItemId, MerchantTradeResult } from "../../constants/merchant";

export type GamePhase = "dusk" | "day" | "night";

export type RoomUpdatedPayload = unknown;

export type WolfVotesUpdatedPayload = Record<string, string | null>;
export type WolfVotes2UpdatedPayload = Record<string, string | null>;
export type WolfLockedUpdatedPayload = Record<string, boolean>;
export type WolfPhaseStartedPayload = {
  wolves: string[];
  activeWolves: string[];
  deadline: number | null;
  maxTargets?: number;
  resetVotes?: boolean;
  biteDisabled?: boolean;
  wolfBadgeRolesByPlayerId?: Record<string, string>;
  wildWolfConvertAvailable?: boolean;
  wildWolfConvertRequested?: boolean;
};

export type SeerResultPayload = { playerId: string; isWolf: boolean };
export type CursedResultPayload = {
  targetId: string;
  areaIds: string[];
  hasWolf: boolean;
  usesUsed?: number;
  maxUses?: number;
  usesRemaining?: number;
};
export type CursedTargetUpdatedPayload = {
  targetId: string | null;
  lastTargetId: string | null;
  usesUsed?: number;
  maxUses?: number;
  usesRemaining?: number;
};
export type GuardianProtectedPayload = string; // targetId
export type ProtectorTargetUpdatedPayload = { targetId: string | null; hasUsed?: boolean };

export type WitchPendingDeathPayload = { targetId: string | null; targetIds?: string[] };
export type WitchPotionsPayload = { healUsed: boolean; poisonUsed: boolean };

export type HunterTargetUpdatedPayload = { targetId: string | null };

export type HunterShotPayload = { hunterId: string; targetId: string };
export type LoveArrowShotPayload = { cupidId: string; targetId: string };
export type LoveStatePayload = {
  cupidId: string | null;
  targetId: string | null;
  partnerId: string | null;
  pairIds: string[];
  rolesByPlayerId: Record<string, string>;
  targetWolfAligned: boolean;
  escapeUsed: boolean;
  escapeActiveTonight: boolean;
  escapeVotes: string[];
};

export type DayVotesUpdatedPayload = Record<string, string | null>;
export type DayLockedUpdatedPayload = Record<string, boolean>;
export type DayDiscussionStartedPayload = { deadline: number | null };
export type DayPhaseStartedPayload = { voters: string[]; deadline: number | null };
export type DayVoteFinishedPayload = { targetId: string | null; tie?: boolean; startedTrial?: boolean };

export type TrialPhaseStartedPayload = {
  targetId: string;
  stage: "defense";
  defenseDeadline: number | null;
};
export type TrialInteractionUpdatedPayload = {
  activeIds: string[];
  selectedId: string | null;
  selectedIds?: string[];
  selectionLimit?: number;
  selectionCount?: number;
  interactionCut: boolean;
};
export type TrialVerdictStartedPayload = {
  targetId: string;
  voters: string[];
  deadline: number | null;
};
export type TrialVotesUpdatedPayload = Record<string, "live" | "die" | null>;
export type TrialVerdictFinishedPayload = {
  targetId: string;
  executed: boolean;
  liveVotes: number;
  dieVotes: number;
  chiefRevealed?: boolean;
};

export type GameEndedPayload = { winner: "wolves" | "villagers" | "lovers" | "nobody"; reason?: string };

export type GameLogEntryPhase = "night" | "day";
export type AngelAlignmentGuess = "wolves" | "villagers";
export type AngelTargetTeam = "wolves" | "villagers" | "third";
export type AngelReviveStage = "none" | "pending" | "hidden";
export type AngelOutcomeReason =
  | "matched_wolves"
  | "matched_villagers"
  | "wrong_guess"
  | "aligned_team_lost"
  | "third_party_target_won"
  | "third_party_target_lost";

export type AngelReviveStatePayload = {
  canRevive: boolean;
  availableDay: number | null;
  selectedTargetId: string | null;
  selectedGuess: AngelAlignmentGuess | null;
  reviveStage: AngelReviveStage;
};

export type WolfVoteBreakdown = {
  targetId: string;
  voterIds: string[];
};

export type EliminationCause =
  | { type: "wolf"; attackerIds: string[] }
  | { type: "witch_poison" }
  | { type: "hunter_shot" }
  | { type: "merchant_gunpowder"; sourceId: string }
  | { type: "love_link"; sourceId: string }
  | { type: "day_vote"; voterIds: string[] }
  | { type: "trial_verdict"; voterIds: string[] };

export type GameLogEntry =
  | { type: "wolf_vote"; phase: GameLogEntryPhase; voteBreakdown: WolfVoteBreakdown[] }
  | { type: "day_vote"; phase: GameLogEntryPhase; voteBreakdown: WolfVoteBreakdown[] }
  | { type: "day_vote_skipped"; phase: GameLogEntryPhase }
  | { type: "wolf_result"; phase: GameLogEntryPhase; targetIds: string[]; selectedByByTarget?: Record<string, string[]>; villageChiefDelayedTargetIds?: string[] }
  | { type: "day_result"; phase: GameLogEntryPhase; targetId: string | null; tie?: boolean }
  | { type: "trial_started"; phase: GameLogEntryPhase; targetId: string }
  | { type: "trial_verdict"; phase: GameLogEntryPhase; targetId: string; liveVotes: number; dieVotes: number; liveVoterIds?: string[]; dieVoterIds?: string[]; executed: boolean }
  | { type: "bonus_bite"; phase: GameLogEntryPhase }
  | { type: "night_action_extra_time"; phase: GameLogEntryPhase; targetId: string; roleName: string; extraSeconds: number }
  | { type: "guardian_protect"; phase: GameLogEntryPhase; actorId: string; targetId: string }
  | { type: "protector_bless"; phase: GameLogEntryPhase; actorId: string; targetId: string; permanent: boolean }
  | { type: "protector_save"; phase: GameLogEntryPhase; actorId: string | null; targetId: string; cause: EliminationCause; permanent: boolean }
  | { type: "village_chief_revealed"; phase: GameLogEntryPhase; targetId: string; reason: "day_vote" }
  | { type: "village_chief_delayed_death"; phase: GameLogEntryPhase; targetId: string }
  | { type: "village_chief_extra_vote_started"; phase: GameLogEntryPhase; chiefId: string }
  | { type: "witch_heal"; phase: GameLogEntryPhase; actorId: string; targetId: string }
  | { type: "witch_poison"; phase: GameLogEntryPhase; actorId: string; targetId: string }
  | { type: "seer_check"; phase: GameLogEntryPhase; actorId: string; targetId: string; isWolf: boolean; actualIsWolf?: boolean; blockedByMerchantItem?: MerchantItemId }
  | { type: "hunter_mark"; phase: GameLogEntryPhase; actorId: string; targetId: string }
  | { type: "hunter_shot"; phase: GameLogEntryPhase; actorId: string; targetId: string; blockedByMerchantItem?: MerchantItemId }
  | { type: "cursed_sniff"; phase: GameLogEntryPhase; actorId: string; targetId: string; hasWolf: boolean; areaIds?: string[]; blockedByMintPlayerIds?: string[] }
  | { type: "merchant_trade_offer"; phase: GameLogEntryPhase; actorId: string; targetId: string; itemId: MerchantItemId; merchantChoice: MerchantDecision }
  | { type: "merchant_trade_response"; phase: GameLogEntryPhase; actorId: string; targetId: string; itemId: MerchantItemId; merchantChoice: MerchantDecision; targetChoice: MerchantDecision; result: MerchantTradeResult }
  | { type: "merchant_item_received"; phase: GameLogEntryPhase; targetId: string; itemId: MerchantItemId; appliesNight: number }
  | { type: "merchant_item_expired"; phase: GameLogEntryPhase; targetId: string; itemIds: MerchantItemId[] }
  | { type: "merchant_item_used"; phase: GameLogEntryPhase; itemId: MerchantItemId; actorId?: string | null; targetId?: string | null; sourceId?: string | null; targetIds?: string[] }
  | { type: "merchant_win_condition_completed"; phase: GameLogEntryPhase; actorId: string; successfulTrades: number; requiredTrades: number }
  | { type: "angel_revive_activated"; phase: GameLogEntryPhase; actorId: string; targetId: string; guess?: AngelAlignmentGuess | null }
  | { type: "angel_revive_choice"; phase: GameLogEntryPhase; actorId: string; targetId: string; guess?: AngelAlignmentGuess | null; targetTeam?: AngelTargetTeam | null }
  | { type: "angel_revive_revealed"; phase: GameLogEntryPhase; actorId: string; targetId: string }
  | { type: "angel_outcome"; phase: GameLogEntryPhase; actorId: string; targetId: string; guess: AngelAlignmentGuess; targetTeam: AngelTargetTeam; won: boolean; noContest: boolean; reason: AngelOutcomeReason; winner: "wolves" | "villagers" | "lovers" | "nobody" }
  | { type: "mysterious_force_eliminated"; phase: GameLogEntryPhase; targetId: string }
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
  | { type: "elemental_guess"; phase: GameLogEntryPhase; actorId: string; targetId: string; isCorrect: boolean }
  | { type: "elemental_guess_summary"; phase: GameLogEntryPhase; correctCount: number; totalCount: number; correctIds?: string[]; triggeredBuffVote: boolean; nextBuffVoteNight?: number }
  | { type: "elemental_buff_vote"; phase: GameLogEntryPhase; voteBreakdown: { buffId: string; voterIds: string[] }[]; chosenBuffId?: string | null; tier?: number; randomTieBreak?: boolean; tiedBuffIds?: string[]; chosenVoterIds?: string[] }
  | { type: "elemental_buff"; phase: GameLogEntryPhase; buffId: string | null; tier: number; randomTieBreak?: boolean; tiedBuffIds?: string[] }
  | { type: "custom_log"; phase: GameLogEntryPhase; message: string; timestamp?: number }
  | { type: "host_ended_game"; phase: GameLogEntryPhase };

export type GameLogNight = {
  night: number;
  at: number;
  entries: GameLogEntry[];
};

export type GameLogUpdatedPayload = { roomId: string; nights: GameLogNight[] };

export type RolesRevealUpdatedPayload = { roomId: string; rolesByPlayerId: Record<string, string> };
export type PublicRolesRevealUpdatedPayload = { roomId: string; rolesByPlayerId: Record<string, string> };

export type SpiritWolfDecisionNeededPayload = { targetId: string; deadline?: number | null };
export type SpiritWolfDecisionRecordedPayload = { saved: boolean };
export type WildWolfConvertedStatePayload = { converted: boolean };
export type WildWolfConversionUpdatedPayload = { available: boolean; requested: boolean };

export type ElementalTargetUpdatedPayload = { targetId: string | null; mode: "guess" | "buff" };
export type ElementalBuffVoteStatePayload = {
  pendingVote: boolean;
  quickMode: boolean;
  selectedBuffId: string | null;
  availableBuffTier?: number;
};

export type ElementalBuffSelectedPayload = {
  buffId: string | null;
  label: string | null;
  tier: number;
  appliesNight: number | null;
  randomTieBreak: boolean;
};

export type HostNightActionProgressUpdatedPayload = {
  progressByPlayerId?: Record<string, "pending" | "done">;
};

export type MerchantPrivateStateUpdatedPayload = import("../../constants/merchant").MerchantPrivateState;
export type MerchantCheeseMarksUpdatedPayload = { playerIds: string[] };
