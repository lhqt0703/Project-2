export type GamePhase = "day" | "night";

export type RoomUpdatedPayload = any;

export type WolfVotesUpdatedPayload = Record<string, string | null>;
export type WolfLockedUpdatedPayload = Record<string, boolean>;
export type WolfPhaseStartedPayload = {
  wolves: string[];
  activeWolves: string[];
  deadline: number;
};

export type SeerResultPayload = { playerId: string; isWolf: boolean };
export type GuardianProtectedPayload = string; // targetId

export type WitchPendingDeathPayload = { targetId: string | null };
export type WitchPotionsPayload = { healUsed: boolean; poisonUsed: boolean };
