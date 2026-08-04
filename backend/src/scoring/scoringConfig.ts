export interface DiminishingReturnRule {
  enabled: boolean;
  fullPointsUntil: number;
  pointsAfterLimit: number;
}

export interface PlayerBracket {
  minPlayers: number;
  maxPlayers: number;
  pointsPerCouplePlayer: number;
}

export interface ScoringConfig {
  coreRoles: string[];
  teamResult: {
    villagersWin: number;
    wolvesWin: number;
  };
  survival: {
    villagerAliveOnVillagerWin: number;
    wolfAliveOnWolfWin: number;
    neutralAliveOnSpecialWin: number;
  };
  actions: {
    guardBlockedWolfKill: number;
    guardSavedCoreRole: number;
    seerFoundWolf: number;
    seerFoundSpecialWolf: number;
    seerInfoLedToExecutionBonus: number;
    witchKilledWolf: number;
    witchKilledSpecialWolf: number;
    witchSavedPlayer: number;
    witchSavedCoreRole: number;
    witchKilledVillagerPenalty: number;
    witchKilledCoreRolePenalty: number;
    hunterShotWolf: number;
    hunterShotSpecialWolf: number;
    hunterShotVillagerPenalty: number;
    hunterShotCoreRolePenalty: number;
    elementalBuffActivated: number;
    elementalBuffCreatedImpact: number;
    villagerVotedExecutedWolf: number;
    villagerVotedExecutedSpecialWolf: number;
    wolfVotedExecutedVillager: number;
    wolfVotedExecutedCoreRole: number;
    wolfSavedWolfFromExecution: number;
    wolfNightKilledVillager: number;
    wolfNightKilledCoreRole: number;
    cursedFoundWolfZone: number;
    cursedInfoLedToWolfExecution: number;
    mayorSecondVoteKilledWolf: number;
    mayorSecondVoteKilledFinalWolf: number;
    mayorSecondVoteKilledVillagerPenalty: number;
    shieldGiverProtectedVillager: number;
    shieldGiverProtectedCoreRole: number;
    shieldBlockedDeath: number;
    shieldBlockedCoreRoleDeath: number;
    shieldGivenToWolfPenalty: number;
    sidePickerChoseWinningTeamEarly: number;
    sidePickerChoseWinningTeamMid: number;
    sidePickerChoseWinningTeamLate: number;
    cupidCoupleSurvivedToEnd: number;
    coupleEscapeDodgedWolfKill: number;
    coupleEscapeDodgedWitchKill: number;
    coupleEscapeDodgedMultipleDeaths: number;
    merchantSuccessfulTrade: number;
    merchantCompletedSideObjective: number;
    coffeeMakerFoundBoth: number;
  };
  specialWins: {
    coupleWinByPlayerCount: PlayerBracket[];
    merchantPersonalWinEasy: number;
    merchantPersonalWinHard: number;
  };
  clutchBonus: {
    minor: number;
    savedTeamFromMajorDisadvantage: number;
    savedTeamFromImmediateLoss: number;
    comebackSwing: number;
    gameDeciding: number;
    legendary: number;
  };
  diminishingReturns: Record<string, DiminishingReturnRule>;
}

export const DEFAULT_SCORING_CONFIG: ScoringConfig = {
  coreRoles: ["seer", "witch", "protector"],
  teamResult: {
    villagersWin: 5,
    wolvesWin: 6,
  },
  survival: {
    villagerAliveOnVillagerWin: 1,
    wolfAliveOnWolfWin: 2,
    neutralAliveOnSpecialWin: 2,
  },
  actions: {
    guardBlockedWolfKill: 3,
    guardSavedCoreRole: 4,
    seerFoundWolf: 2,
    seerFoundSpecialWolf: 3,
    seerInfoLedToExecutionBonus: 1,
    witchKilledWolf: 3,
    witchKilledSpecialWolf: 4,
    witchSavedPlayer: 3,
    witchSavedCoreRole: 4,
    witchKilledVillagerPenalty: -2,
    witchKilledCoreRolePenalty: -3,
    hunterShotWolf: 3,
    hunterShotSpecialWolf: 4,
    hunterShotVillagerPenalty: -2,
    hunterShotCoreRolePenalty: -3,
    elementalBuffActivated: 2,
    elementalBuffCreatedImpact: 3,
    villagerVotedExecutedWolf: 1,
    villagerVotedExecutedSpecialWolf: 2,
    wolfVotedExecutedVillager: 1,
    wolfVotedExecutedCoreRole: 2,
    wolfSavedWolfFromExecution: 2,
    wolfNightKilledVillager: 1,
    wolfNightKilledCoreRole: 2,
    cursedFoundWolfZone: 2,
    cursedInfoLedToWolfExecution: 3,
    mayorSecondVoteKilledWolf: 4,
    mayorSecondVoteKilledFinalWolf: 5,
    mayorSecondVoteKilledVillagerPenalty: -1,
    shieldGiverProtectedVillager: 2,
    shieldGiverProtectedCoreRole: 3,
    shieldBlockedDeath: 4,
    shieldBlockedCoreRoleDeath: 5,
    shieldGivenToWolfPenalty: -1,
    sidePickerChoseWinningTeamEarly: 5,
    sidePickerChoseWinningTeamMid: 4,
    sidePickerChoseWinningTeamLate: 3,
    cupidCoupleSurvivedToEnd: 2,
    coupleEscapeDodgedWolfKill: 3,
    coupleEscapeDodgedWitchKill: 4,
    coupleEscapeDodgedMultipleDeaths: 5,
    merchantSuccessfulTrade: 1,
    merchantCompletedSideObjective: 5,
    coffeeMakerFoundBoth: 5,
  },
  specialWins: {
    coupleWinByPlayerCount: [
      { minPlayers: 8, maxPlayers: 11, pointsPerCouplePlayer: 17 },
      { minPlayers: 12, maxPlayers: 15, pointsPerCouplePlayer: 18 },
      { minPlayers: 16, maxPlayers: 19, pointsPerCouplePlayer: 19 },
      { minPlayers: 20, maxPlayers: 40, pointsPerCouplePlayer: 20 },
    ],
    merchantPersonalWinEasy: 15,
    merchantPersonalWinHard: 18,
  },
  clutchBonus: {
    minor: 2,
    savedTeamFromMajorDisadvantage: 2,
    savedTeamFromImmediateLoss: 3,
    comebackSwing: 4,
    gameDeciding: 5,
    legendary: 6,
  },
  diminishingReturns: {
    merchantSuccessfulTrade: {
      enabled: true,
      fullPointsUntil: 3,
      pointsAfterLimit: 0.5,
    },
    seerFoundWolf: {
      enabled: true,
      fullPointsUntil: 2,
      pointsAfterLimit: 1,
    },
  },
};
