import React, { createContext, useContext, useEffect, useState } from "react";
import { socket } from "../socket";
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
  merchantHideReceivedItemName: boolean;
  loveEscapeImmuneSimultaneous: boolean;
  wolfCanBiteWolf?: boolean;
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
  merchantHideReceivedItemName: false,
  loveEscapeImmuneSimultaneous: true,
  wolfCanBiteWolf: false,
};

export interface RoomData {
  id: string;
  players: Player[];
  hostId: string;
  gameMode?: "da_nghich" | "diet_quy" | "soi_mu";
  dietQuyNightDirection?: "clockwise" | "counter_clockwise";
  dietQuyNightStartPlayerId?: string | null;
  dietQuyNightTurnOrder?: string[];
  nightTurnPlayerId?: string | null;
  dietQuyPoisonedPlayerId?: string | null;
  dietQuyPoisonedPrevPlayerId?: string | null;
  dietQuyRedCharmPlayerId?: string | null;
  dietQuyMonkProtectedPlayerId?: string | null;
  dietQuyImpKillPlayerId?: string | null;
  dietQuyMayorReplacementId?: string | null;
  dietQuyRavenkeeperTargetId?: string | null;
  dietQuyWasherwomanSelectedIds?: string[];
  dietQuyLibrarianSelectedIds?: string[];
  dietQuyInvestigatorSelectedIds?: string[];
  dietQuySlayerUsed?: boolean;
  dietQuyVirginTriggered?: boolean;
  dietQuyFortuneTellerCheckedIds?: string[];
  dietQuySaintExecutedToday?: boolean;
  dietQuyExecutedToday?: boolean;
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
  dayPaused?: boolean;
  dayRemainingMs?: number | null;
  dayPausedType?: "discussion" | "voting" | "defense" | "verdict" | null;
  wolfTurnRemainingMs?: number | null;
  spiritWolfDecisionRemainingMs?: number | null;
  nightActionExtraTimeMsByPlayerId?: Record<string, number>;
  elementalPendingBuffVote?: boolean;
  elementalBuffQuickMode?: boolean;
  elementalSelectedBuffId?: ElementalBuffId | null;
  nightActionProgressByPlayerId?: Record<string, "pending" | "done">;
  wolfDeadline?: number | null;
  scoreResult?: any;
  duskCardSelections?: Record<string, number>;
  playerRoles?: Record<string, string>;
  wolves?: string[];
  winner?: string;
  soiMuTargets?: Record<string, string>;
  soiMuThumbDecisions?: Record<string, "up" | "down">;
  soiMuLocked?: Record<string, boolean>;
  soiMuInvestigatedPlayerId?: string | null;
  soiMuInvestigatedPrevTargetId?: string | null;
  soiMuInvestigationResolved?: boolean;
  soiMuDaySelectedTargetId?: string | null;
  soiMuInvestigationResult?: "success" | "fail" | null;
  soiMuHasMerchant?: boolean;
  soiMuNamThuTargetId?: string | null;
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

    if (isGameActive && !role) {
      console.log("[RoomContext] Game đang chạy nhưng vai trò bị trống, gửi yêu cầu requestMyRole...");
      socket.emit("requestMyRole", { roomId: rId });
    }
  }, [room?.phase, role]);

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
