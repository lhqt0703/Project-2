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
  | "Phù thủy"
  | "Linh sói"
  | "Thợ săn"
  | "Tiên tri"
  | ElementalRole;

export type NightActionOrderRole =
  | "Sói"
  | "Bảo vệ"
  | "Phù thủy"
  | "Linh sói"
  | "Thợ săn"
  | "Tiên tri"
  | typeof ELEMENTAL_GROUP_ROLE;

export interface RoomGameRules {
  twoHeartsFirstTwoNights: boolean;
  allNightActionsSimultaneous: boolean;
  witchSeeBiteOnlyIfHasHealPotion: boolean;
  witchHideProtectedBiteInSimultaneous: boolean;
  witchHideProtectedBiteWhenSequential: boolean;
  trialInteractionSelectionLimit: number;
  nonWolfNightActionDurationSec: number;
  nightActionOrder: NightActionOrderRole[];
  spiritWolfBecomeWolfEvenIfHealed: boolean;
}

export const DEFAULT_ROOM_GAME_RULES: RoomGameRules = {
  twoHeartsFirstTwoNights: true,
  allNightActionsSimultaneous: false,
  witchSeeBiteOnlyIfHasHealPotion: true,
  witchHideProtectedBiteInSimultaneous: false,
  witchHideProtectedBiteWhenSequential: true,
  trialInteractionSelectionLimit: 2,
  nonWolfNightActionDurationSec: 10,
  nightActionOrder: [ELEMENTAL_GROUP_ROLE, "Sói", "Bảo vệ", "Phù thủy", "Linh sói", "Thợ săn", "Tiên tri"],
  spiritWolfBecomeWolfEvenIfHealed: false,
};

export interface RoomData {
  id: string;
  players: Player[];
  hostId: string;
  hidePlayerRoleText?: boolean;
  phase?: string;
  gameOver?: boolean;
  roles?: string[];
  rolesLocked?: boolean;
  lockedPlayerIds?: string[];
  positions?: PlayerPosition[];
  positionEditors?: string[];
  autoArrangeUsed?: boolean;
  compactCircles?: boolean;
  gameRules?: RoomGameRules;
  pendingGameRules?: RoomGameRules;
  sharedHeartsVisible?: boolean;
  playerHearts?: Record<string, number>;
  wolfVotes?: Record<string, string | null>;
  wolfVotes2?: Record<string, string | null>;
  deadPlayers?: string[];
  nightCount?: number;
  nightTurnIndex?: number;
  nightTurnRole?: NightActionRole | null;
  nightTurnDeadline?: number | null;
  nightTurnPaused?: boolean;
  nightTurnRemainingMs?: number | null;
  elementalPendingBuffVote?: boolean;
  elementalBuffQuickMode?: boolean;
  elementalSelectedBuffId?: ElementalBuffId | null;
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
