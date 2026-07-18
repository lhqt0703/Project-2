import React, { createContext, useContext, useEffect, useState } from "react";
import { socket, clientId } from "../socket";
import { ELEMENTAL_GROUP_ROLE, type ElementalBuffId, type ElementalRole } from "../constants/elemental";

export interface Player {
  id: string;
  name: string;
  connected?: boolean;
  inGame?: boolean;
  playerRealName?: string;
  playerAvatar?: string;
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
  | "Trưởng làng"
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
  | "Trưởng làng"
  | "Song Trùng"
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
  merchantHideReceivedItemName: boolean;
  loveEscapeImmuneSimultaneous: boolean;
  wolfCanBiteWolf?: boolean;
  wolfBonusBiteSmoothTied?: boolean;
  villageChiefCanFindProtector?: boolean;
  songTrungMaxUses?: number;
  songTrungVictimStaysAlive?: boolean;
  songTrungReturnRoleOnlyIfVotedOut?: boolean;
  songTrungReturnRoleRequiresCupidVote?: boolean;
  guardianCanSeeSavedLog?: boolean;
  dayDiscussionDurationSec?: number;
  trialDefenseDurationSec?: number;
  trialVerdictDurationSec?: number;
  dayVotingDurationSec?: number;
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
  nightActionOrder: ["Thần tình yêu", "Song Trùng", "Tay Buôn", ELEMENTAL_GROUP_ROLE, "Sói", "Bảo vệ", "Hộ nhân", "Phù thủy", "Linh sói", "Thợ săn", "Tiên tri", "Kẻ bị nguyền", "Trưởng làng"],
  banSoiBecomeWolfEvenIfHealed: false,
  loveCanChoosePartnerFirstTwoNights: false,
  villageChiefKnowsWolfBite: true,
  witchSeeProtectorImmortalBite: true,
  hunterShotPublicInDay: true,
  merchantSingleUseItems: false,
  merchantWinRequiredSuccessfulTrades: 3,
  merchantHideReceivedItemName: false,
  loveEscapeImmuneSimultaneous: true,
  wolfCanBiteWolf: false,
  wolfBonusBiteSmoothTied: true,
  villageChiefCanFindProtector: true,
  songTrungMaxUses: 0,
  songTrungVictimStaysAlive: false,
  songTrungReturnRoleOnlyIfVotedOut: false,
  songTrungReturnRoleRequiresCupidVote: false,
  guardianCanSeeSavedLog: false,
  dayDiscussionDurationSec: 240,
  trialDefenseDurationSec: 120,
  trialVerdictDurationSec: 20,
  dayVotingDurationSec: 45,
};

export interface DietQuyState {
  nightDirection?: "clockwise" | "counter_clockwise";
  nightStartPlayerId?: string | null;
  nightTurnOrder?: string[];
  poisonedPlayerId?: string | null;
  poisonedPrevPlayerId?: string | null;
  redCharmPlayerId?: string | null;
  monkProtectedPlayerId?: string | null;
  impKillPlayerId?: string | null;
  mayorReplacementId?: string | null;
  ravenkeeperTargetId?: string | null;
  washerwomanSelectedIds?: string[];
  librarianSelectedIds?: string[];
  investigatorSelectedIds?: string[];
  slayerUsed?: boolean;
  virginTriggered?: boolean;
  fortuneTellerCheckedIds?: string[];
  saintExecutedToday?: boolean;
  executedToday?: boolean;
  executedPlayerId?: string | null;
}

export interface SoiMuState {
  targets?: Record<string, string>;
  thumbDecisions?: Record<string, "up" | "down">;
  locked?: Record<string, boolean>;
  investigatedPlayerId?: string | null;
  investigatedPrevTargetId?: string | null;
  investigationResolved?: boolean;
  daySelectedTargetId?: string | null;
  investigationResult?: "success" | "fail" | null;
  hasMerchant?: boolean;
  namThuTargetId?: string | null;
  suyThanTargetId?: string | null;
}

export interface DaNghichState {
  banSoiWolfAligned?: boolean;
  banSoiWolfAlignedPending?: boolean;
  spiritWolfWolfAligned?: boolean;
  spiritWolfWolfAlignedPending?: boolean;
  wildWolfConvertAvailableTonight?: boolean;
  wildWolfConvertRequestedTonight?: boolean;
  wildWolfConvertedSelf?: boolean;
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
  spiritWolfDecisionDeadline?: number | null;
  wolfTurnRemainingMs?: number | null;
  spiritWolfDecisionRemainingMs?: number | null;
  elementalPendingBuffVote?: boolean;
  elementalBuffQuickMode?: boolean;
  elementalSelectedBuffId?: ElementalBuffId | null;
  wolfDeadline?: number | null;
  songTrungUsedTonight?: Record<string, string | null>;
  songTrungChoices?: Array<{ playerId: string; night: number; targetId: string | null }>;
  songTrungVictimId?: string | null;
  wolves?: string[];
}

export interface RoomData {
  id: string;
  players: Player[];
  hostId: string;
  warnedPlayerIds?: string[];
  gameMode?: "da_nghich" | "diet_quy" | "soi_mu";
  dietQuyState?: DietQuyState;
  soiMuState?: SoiMuState;
  daNghichState?: DaNghichState;
  nightTurnPlayerId?: string | null;
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
  publicRevealedRolesByPlayerId?: Record<string, string>;
  deadPlayers?: string[];
  nightCount?: number;
  nightTurnIndex?: number;
  nightTurnRole?: NightActionRole | null;
  nightTurnDeadline?: number | null;
  nightTransitionEndsAt?: number | null;
  nightTurnPaused?: boolean;
  nightTurnRemainingMs?: number | null;
  dayPaused?: boolean;
  dayRemainingMs?: number | null;
  dayPausedType?: "discussion" | "voting" | "defense" | "verdict" | null;
  nightActionExtraTimeMsByPlayerId?: Record<string, number>;
  nightActionProgressByPlayerId?: Record<string, "pending" | "done">;
  scoreResult?: any;
  duskCardSelections?: Record<string, number>;
  playerRoles?: Record<string, string>;
  winner?: string;
  dayVotes?: Record<string, string | null>;
  dayLocked?: Record<string, boolean>;
  dayVoters?: string[];
  trialStage?: "none" | "defense" | "verdict";
  trialTargetId?: string | null;
  trialVotes?: Record<string, "live" | "die" | null>;
  trialInteractionCut?: boolean;
  trialInteractionActiveIds?: string[];
  trialSelectedInteractorId?: string | null;
  trialSelectedInteractorIds?: string[];
  trialInteractionSelectionLimit?: number;
  trialDefenseDeadline?: number | null;
  trialVerdictDeadline?: number | null;
  dayDeadline?: number | null;
  dayDiscussionDeadline?: number | null;
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
  const [role, setRole] = useState<string | null>(() => {
    const query = new URLSearchParams(window.location.search);
    const rId = query.get("roomId");
    if (rId) {
      return sessionStorage.getItem(`playerRole:${rId}`) || null;
    }
    return null;
  });
  const [room, setRoom] = useState<RoomData | null>(null);

  useEffect(() => {
    const handleYourRole = (nextRole: string) => {
      if (!nextRole) return;
      setRole(nextRole);
      const query = new URLSearchParams(window.location.search);
      const rId = query.get("roomId");
      if (rId) {
        sessionStorage.setItem(`playerRole:${rId}`, nextRole);
      }
    };

    socket.on("yourRole", handleYourRole);
    return () => {
      socket.off("yourRole", handleYourRole);
    };
  }, []);

  // Tự động yêu cầu cấp lại vai trò nếu bị trống khi game đang chạy
  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const rId = query.get("roomId");
    if (!rId || rId === "mock-8") return;

    const phase = room?.phase;
    const isGameActive = phase === "dusk" || phase === "night" || phase === "day";
    const isHost = room?.hostId === clientId;

    if (isGameActive && !role && !isHost) {
      console.log("[RoomContext] Game đang chạy nhưng vai trò bị trống, gửi yêu cầu requestMyRole...");
      socket.emit("requestMyRole", { roomId: rId });
    }
  }, [room?.phase, room?.hostId, role]);

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
