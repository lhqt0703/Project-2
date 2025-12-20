export type GamePhase = "day" | "night";

export type RoomUpdatedPayload = any;

export type WolfVotesUpdatedPayload = Record<string, string | null>;
export type WolfVotes2UpdatedPayload = Record<string, string | null>;
export type WolfLockedUpdatedPayload = Record<string, boolean>;
export type WolfPhaseStartedPayload = {
  wolves: string[];
  activeWolves: string[];
  deadline: number;
  maxTargets?: number;
};

export type SeerResultPayload = { playerId: string; isWolf: boolean };
export type GuardianProtectedPayload = string; // targetId

export type WitchPendingDeathPayload = { targetId: string | null; targetIds?: string[] };
export type WitchPotionsPayload = { healUsed: boolean; poisonUsed: boolean };

export type HunterTargetUpdatedPayload = { targetId: string | null };
