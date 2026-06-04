import React, { createContext, useContext, useEffect, useState } from "react";
import { socket } from "../socket";
import { ELEMENTAL_GROUP_ROLE, type ElementalBuffId, type ElementalRole } from "../constants/elemental";

export interface Player {
  id: string;
  name: string;
  connected?: boolean;
  inGame?: boolean;
}

export type NightActionRole =
  | "Sói"
  | "Bảo vệ"
  | "Hộ nhân"
  | "Phù thủy"
  | "Linh sói"
  | "Thợ săn"
  | "Tiên tri"
  | "Thần tình yêu"
  | "Kẻ bị nguyền"
  | "Tay Buôn"
  | ElementalRole;

export type NightActionOrderRole =
  | "Sói"
  | "Bảo vệ"
  | "Hộ nhân"
  | "Phù thủy"
  | "Linh sói"
  | "Thợ săn"
  | "Tiên tri"
  | "Thần tình yêu"
  | "Kẻ bị nguyền"
  | "Tay Buôn"
  | typeof ELEMENTAL_GROUP_ROLE;

export interface RoomGameRules {
  twoHeartsFirstTwoNights: boolean;
  forceWolfBiteFirstNight: boolean;
  allNightActionsSimultaneous: boolean;
  witchSeeBiteOnlyIfHasHealPotion: boolean;
  witchBonusTimeRequiresUsablePotion: boolean;
  witchHideProtectedBiteInSimultaneous: boolean;
  witchHideProtectedBiteWhenSequential: boolean;
  trialInteractionSelectionLimit: number;
  nonWolfNightActionDurationSec: number;
  wolfNightActionDurationSec: number;
  nightActionOrder: NightActionOrderRole[];
  banSoiBecomeWolfEvenIfHealed: boolean;
  loveCanChoosePartnerFirstTwoNights: boolean;
  villageChiefKnowsWolfBite: boolean;
  witchSeeProtectorImmortalBite: boolean;
  hunterShotPublicInDay: boolean;
  merchantSingleUseItems: boolean;
  merchantWinRequiredSuccessfulTrades: number;
}

export const DEFAULT_ROOM_GAME_RULES: RoomGameRules = {
  twoHeartsFirstTwoNights: true,
  forceWolfBiteFirstNight: true,
  allNightActionsSimultaneous: true,
  witchSeeBiteOnlyIfHasHealPotion: true,
  witchBonusTimeRequiresUsablePotion: true,
  witchHideProtectedBiteInSimultaneous: false,
  witchHideProtectedBiteWhenSequential: true,
  trialInteractionSelectionLimit: 2,
  nonWolfNightActionDurationSec: 20,
  wolfNightActionDurationSec: 20,
  nightActionOrder: ["Thần tình yêu", "Tay Buôn", ELEMENTAL_GROUP_ROLE, "Sói", "Bảo vệ", "Hộ nhân", "Phù thủy", "Linh sói", "Thợ săn", "Tiên tri", "Kẻ bị nguyền"],
  banSoiBecomeWolfEvenIfHealed: false,
  loveCanChoosePartnerFirstTwoNights: false,
  villageChiefKnowsWolfBite: true,
  witchSeeProtectorImmortalBite: true,
  hunterShotPublicInDay: true,
  merchantSingleUseItems: false,
  merchantWinRequiredSuccessfulTrades: 3,
};

export interface RoomData {
  id: string;
  players: Player[];
  hostId: string;
  serverTime?: number;
  hidePlayerRoleText?: boolean;
  isReplay?: boolean;
  phase?: string;
  gameOver?: boolean;
  roles?: string[];
  rolesLocked?: boolean;
  lockedPlayerIds?: string[];
  pendingRoleAssignments?: Record<string, string>;
  pendingRoleBlocks?: Record<string, string[]>;
  positions?: PlayerPosition[];
  positionEditors?: string[];
  autoArrangeUsed?: boolean;
  compactCircles?: boolean;
  gameRules?: RoomGameRules;
  pendingGameRules?: RoomGameRules;
  banSoiWolfAligned?: boolean;
  banSoiWolfAlignedPending?: boolean;
  wildWolfConvertAvailableTonight?: boolean;
  wildWolfConvertRequestedTonight?: boolean;
  wildWolfConvertedSelf?: boolean;
  publicRevealedRolesByPlayerId?: Record<string, string>;
  privateHeartVisiblePlayerIds?: string[];
  playerHeartShakeIds?: string[];
  villageChiefDyingFramePlayerIds?: string[];
  villageChiefExtraVoteReady?: boolean;
  villageChiefExtraVoteUsed?: boolean;
  sharedHeartsVisible?: boolean;
  playerHearts?: Record<string, number>;
  privatePlayerHearts?: Record<string, number>;
  wolfVotes?: Record<string, string | null>;
  wolfVotes2?: Record<string, string | null>;
  deadPlayers?: string[];
  nightCount?: number;
  nightTurnIndex?: number;
  nightTurnRole?: NightActionRole | null;
  nightTurnDeadline?: number | null;
  spiritWolfDecisionDeadline?: number | null;
  nightTurnPaused?: boolean;
  nightTurnRemainingMs?: number | null;
  wolfTurnRemainingMs?: number | null;
  spiritWolfDecisionRemainingMs?: number | null;
  nightActionExtraTimeMsByPlayerId?: Record<string, number>;
  elementalPendingBuffVote?: boolean;
  elementalBuffQuickMode?: boolean;
  elementalSelectedBuffId?: ElementalBuffId | null;
  nightActionProgressByPlayerId?: Record<string, "pending" | "done">;
  wolfDeadline?: number | null;
  scoreResult?: any;
}

interface PlayerPosition {
  playerId: string;
  x: number;
  y: number;
}

interface RoomContextType {
  role: string | null;
  setRole: React.Dispatch<React.SetStateAction<string | null>>;
  room: RoomData | null;
  setRoom: React.Dispatch<React.SetStateAction<RoomData | null>>;
}

const RoomContext = createContext<RoomContextType | undefined>(undefined);

export const RoomProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [role, setRole] = useState<string | null>(null);
  const [room, setRoom] = useState<RoomData | null>(null);

  useEffect(() => {
    const handleYourRole = (nextRole: string) => {
      if (!nextRole) return;
      setRole(nextRole);
    };

    socket.on("yourRole", handleYourRole);
    return () => {
      socket.off("yourRole", handleYourRole);
    };
  }, []);

  return (
    <RoomContext.Provider value={{ role, setRole, room, setRoom }}>
      {children}
    </RoomContext.Provider>
  );
};

export const useRoomContext = () => {
  const ctx = useContext(RoomContext);
  if (!ctx) throw new Error("useRoomContext must be used within RoomProvider");
  return ctx;
};
