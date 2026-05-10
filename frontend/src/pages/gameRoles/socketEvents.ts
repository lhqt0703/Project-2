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
};

export type SeerResultPayload = { playerId: string; isWolf: boolean };
export type GuardianProtectedPayload = string; // targetId

export type WitchPendingDeathPayload = { targetId: string | null; targetIds?: string[] };
export type WitchPotionsPayload = { healUsed: boolean; poisonUsed: boolean };

export type HunterTargetUpdatedPayload = { targetId: string | null };

export type HunterShotPayload = { hunterId: string; targetId: string };

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
};

export type GameEndedPayload = { winner: "wolves" | "villagers"; reason?: string };

export type GameLogEntryPhase = "night" | "day";

export type WolfVoteBreakdown = {
  targetId: string;
  voterIds: string[];
};

export type EliminationCause =
  | { type: "wolf"; attackerIds: string[] }
  | { type: "witch_poison" }
  | { type: "hunter_shot" }
  | { type: "day_vote"; voterIds: string[] }
  | { type: "trial_verdict"; voterIds: string[] };

export type GameLogEntry =
  | { type: "wolf_vote"; phase: GameLogEntryPhase; voteBreakdown: WolfVoteBreakdown[] }
  | { type: "day_vote"; phase: GameLogEntryPhase; voteBreakdown: WolfVoteBreakdown[] }
  | { type: "wolf_result"; phase: GameLogEntryPhase; targetIds: string[]; selectedByByTarget?: Record<string, string[]> }
  | { type: "day_result"; phase: GameLogEntryPhase; targetId: string | null; tie?: boolean }
  | { type: "trial_started"; phase: GameLogEntryPhase; targetId: string }
  | { type: "trial_verdict"; phase: GameLogEntryPhase; targetId: string; liveVotes: number; dieVotes: number; liveVoterIds?: string[]; dieVoterIds?: string[]; executed: boolean }
  | { type: "bonus_bite"; phase: GameLogEntryPhase }
  | { type: "guardian_protect"; phase: GameLogEntryPhase; actorId: string; targetId: string }
  | { type: "witch_heal"; phase: GameLogEntryPhase; actorId: string; targetId: string }
  | { type: "witch_poison"; phase: GameLogEntryPhase; actorId: string; targetId: string }
  | { type: "seer_check"; phase: GameLogEntryPhase; actorId: string; targetId: string; isWolf: boolean }
  | { type: "hunter_mark"; phase: GameLogEntryPhase; actorId: string; targetId: string }
  | { type: "hunter_shot"; phase: GameLogEntryPhase; actorId: string; targetId: string }
  | { type: "spirit_wolf_decision"; phase: GameLogEntryPhase; saved: boolean; timedOut?: boolean }
  | { type: "saved_by_guardian"; phase: GameLogEntryPhase; targetIds: string[] }
  | { type: "saved_by_witch"; phase: GameLogEntryPhase; targetIds: string[] }
  | { type: "eliminated"; phase: GameLogEntryPhase; targetIds: string[]; causesByTarget?: Record<string, EliminationCause[]> }
  | { type: "no_death"; phase: GameLogEntryPhase }
  | { type: "elemental_guess"; phase: GameLogEntryPhase; actorId: string; targetId: string; isCorrect: boolean }
  | { type: "elemental_guess_summary"; phase: GameLogEntryPhase; correctCount: number; totalCount: number; triggeredBuffVote: boolean; nextBuffVoteNight?: number }
  | { type: "elemental_buff_vote"; phase: GameLogEntryPhase; voteBreakdown: { buffId: string; voterIds: string[] }[] }
  | { type: "elemental_buff"; phase: GameLogEntryPhase; buffId: string | null; tier: number; randomTieBreak?: boolean; tiedBuffIds?: string[] };

export type GameLogNight = {
  night: number;
  at: number;
  entries: GameLogEntry[];
};

export type GameLogUpdatedPayload = { roomId: string; nights: GameLogNight[] };

export type RolesRevealUpdatedPayload = { roomId: string; rolesByPlayerId: Record<string, string> };

export type SpiritWolfDecisionNeededPayload = { targetId: string };
export type SpiritWolfDecisionRecordedPayload = { saved: boolean };

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
