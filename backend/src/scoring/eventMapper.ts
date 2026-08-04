import type { EventLog, ScoreBreakdownEntry, PlayerState, ScoreCategory } from "./scoringTypes.js";
import type { ScoringConfig } from "./scoringConfig.js";

interface EventMappingResult {
  playerId: string;
  category: ScoreCategory;
  points: number;
  reason: string;
}

export function isCoreRole(role: string, config: ScoringConfig): boolean {
  const normRole = role.toLowerCase().replace(/\s+/g, "");
  return config.coreRoles.some((r) => {
    const normConfig = r.toLowerCase().replace(/\s+/g, "");
    return normConfig === normRole || normRole.includes(normConfig) || normConfig.includes(normRole);
  });
}

export function mapEventToScores(
  event: EventLog,
  config: ScoringConfig,
  playerMap: Map<string, PlayerState>,
  getEventCountForPlayer: (playerId: string, type: string) => number,
  playerCount: number
): EventMappingResult[] {
  const results: EventMappingResult[] = [];

  // Parse actors
  let actorIds: string[] = [];
  if (event.actorIds && Array.isArray(event.actorIds)) {
    actorIds = event.actorIds;
  } else if (event.actorId) {
    actorIds = [event.actorId];
  }

  const targetPlayer = event.targetId ? playerMap.get(event.targetId) : undefined;
  const isTargetCore = targetPlayer
    ? isCoreRole(targetPlayer.role, config) || event.metadata?.targetIsCoreRole === true
    : event.metadata?.targetIsCoreRole === true;

  const type = event.type;

  // We define helper to apply splitting if splitPoints is true
  const getPoints = (base: number) => {
    if (event.metadata?.splitPoints === true && actorIds.length > 0) {
      return Number((base / actorIds.length).toFixed(1));
    }
    return base;
  };

  switch (type) {
    case "GUARD_BLOCKED_WOLF_KILL": {
      const isCore = isTargetCore || event.metadata?.targetIsCoreRole === true;
      const base = isCore ? config.actions.guardSavedCoreRole : config.actions.guardBlockedWolfKill;
      const pts = getPoints(base);
      const reason = isCore
        ? "Bảo vệ chặn thành công vết cắn lên vai chủ lực"
        : "Bảo vệ chặn thành công vết cắn của sói";
      
      actorIds.forEach((actorId) => {
        results.push({ playerId: actorId, category: "action", points: pts, reason });
      });
      break;
    }

    case "GUARD_SAVED_CORE_ROLE": {
      const pts = getPoints(config.actions.guardSavedCoreRole);
      actorIds.forEach((actorId) => {
        results.push({
          playerId: actorId,
          category: "action",
          points: pts,
          reason: "Bảo vệ chặn thành công vết cắn lên vai chủ lực",
        });
      });
      break;
    }

    case "SEER_FOUND_WOLF": {
      actorIds.forEach((actorId) => {
        const countBeforeThis = getEventCountForPlayer(actorId, "SEER_FOUND_WOLF");
        const dimRule = config.diminishingReturns["seerFoundWolf"];
        let base = config.actions.seerFoundWolf;

        if (dimRule?.enabled && countBeforeThis >= dimRule.fullPointsUntil) {
          base = dimRule.pointsAfterLimit;
        }

        const pts = getPoints(base);
        results.push({
          playerId: actorId,
          category: "action",
          points: pts,
          reason: "Tiên tri soi trúng sói",
        });

        // Check if this led to wolf execution the next day
        if (event.metadata?.ledToWolfExecutionNextDay === true) {
          const clutchPts = getPoints(config.actions.seerInfoLedToExecutionBonus);
          results.push({
            playerId: actorId,
            category: "clutch",
            points: clutchPts,
            reason: "Thông tin soi dẫn tới việc treo sói ngày hôm sau",
          });
        }
      });
      break;
    }

    case "SEER_FOUND_SPECIAL_WOLF": {
      const pts = getPoints(config.actions.seerFoundSpecialWolf);
      actorIds.forEach((actorId) => {
        results.push({
          playerId: actorId,
          category: "action",
          points: pts,
          reason: "Tiên tri soi trúng sói đặc biệt",
        });
      });
      break;
    }

    case "WITCH_KILLED_WOLF": {
      const pts = getPoints(config.actions.witchKilledWolf);
      actorIds.forEach((actorId) => {
        results.push({
          playerId: actorId,
          category: "action",
          points: pts,
          reason: "Phù thủy dùng bình độc giết trúng sói",
        });
      });
      break;
    }

    case "WITCH_KILLED_SPECIAL_WOLF": {
      const pts = getPoints(config.actions.witchKilledSpecialWolf);
      actorIds.forEach((actorId) => {
        results.push({
          playerId: actorId,
          category: "action",
          points: pts,
          reason: "Phù thủy dùng bình độc giết trúng sói đặc biệt",
        });
      });
      break;
    }

    case "WITCH_SAVED_PLAYER": {
      actorIds.forEach((actorId) => {
        const isSelfSave = actorId === event.targetId;
        const isCore = !isSelfSave && (isTargetCore || event.metadata?.targetIsCoreRole === true);
        const base = isCore ? config.actions.witchSavedCoreRole : config.actions.witchSavedPlayer;
        const pts = getPoints(base);

        let reason = "Phù thủy dùng bình thuốc giải cứu người bị sói cắn";
        if (isSelfSave) {
          reason = "Phù thủy dùng bình thuốc giải cứu chính mình";
        } else if (isCore) {
          reason = "Phù thủy dùng bình thuốc giải cứu vai chủ lực bị sói cắn";
        }

        results.push({ playerId: actorId, category: "action", points: pts, reason });
      });
      break;
    }

    case "WITCH_SAVED_CORE_ROLE": {
      actorIds.forEach((actorId) => {
        const isSelfSave = actorId === event.targetId;
        const isCore = !isSelfSave;
        const base = isCore ? config.actions.witchSavedCoreRole : config.actions.witchSavedPlayer;
        const pts = getPoints(base);

        let reason = "Phù thủy dùng bình thuốc giải cứu vai chủ lực bị sói cắn";
        if (isSelfSave) {
          reason = "Phù thủy dùng bình thuốc giải cứu chính mình";
        }

        results.push({
          playerId: actorId,
          category: "action",
          points: pts,
          reason,
        });
      });
      break;
    }

    case "WITCH_KILLED_VILLAGER": {
      const pts = getPoints(config.actions.witchKilledVillagerPenalty);
      actorIds.forEach((actorId) => {
        results.push({
          playerId: actorId,
          category: "penalty",
          points: pts,
          reason: "Phù thủy dùng bình độc giết nhầm dân",
        });
      });
      break;
    }

    case "WITCH_KILLED_CORE_ROLE": {
      const pts = getPoints(config.actions.witchKilledCoreRolePenalty);
      actorIds.forEach((actorId) => {
        results.push({
          playerId: actorId,
          category: "penalty",
          points: pts,
          reason: "Phù thủy dùng bình độc giết nhầm vai chủ lực",
        });
      });
      break;
    }

    case "HUNTER_SHOT_WOLF": {
      const pts = getPoints(config.actions.hunterShotWolf);
      actorIds.forEach((actorId) => {
        results.push({
          playerId: actorId,
          category: "action",
          points: pts,
          reason: "Thợ săn bắn trúng sói",
        });
      });
      break;
    }

    case "HUNTER_SHOT_SPECIAL_WOLF": {
      const pts = getPoints(config.actions.hunterShotSpecialWolf);
      actorIds.forEach((actorId) => {
        results.push({
          playerId: actorId,
          category: "action",
          points: pts,
          reason: "Thợ săn bắn trúng sói đặc biệt",
        });
      });
      break;
    }

    case "HUNTER_SHOT_VILLAGER": {
      const pts = getPoints(config.actions.hunterShotVillagerPenalty);
      actorIds.forEach((actorId) => {
        results.push({
          playerId: actorId,
          category: "penalty",
          points: pts,
          reason: "Thợ săn bắn nhầm dân",
        });
      });
      break;
    }

    case "HUNTER_SHOT_CORE_ROLE": {
      const pts = getPoints(config.actions.hunterShotCoreRolePenalty);
      actorIds.forEach((actorId) => {
        results.push({
          playerId: actorId,
          category: "penalty",
          points: pts,
          reason: "Thợ săn bắn nhầm vai chủ lực",
        });
      });
      break;
    }

    case "ELEMENTAL_BUFF_ACTIVATED": {
      const pts = getPoints(config.actions.elementalBuffActivated);
      actorIds.forEach((actorId) => {
        results.push({
          playerId: actorId,
          category: "action",
          points: pts,
          reason: "Dân làng nguyên tố kích hoạt thành công buff",
        });
      });
      break;
    }

    case "ELEMENTAL_BUFF_CREATED_IMPACT": {
      const pts = getPoints(config.actions.elementalBuffCreatedImpact);
      actorIds.forEach((actorId) => {
        results.push({
          playerId: actorId,
          category: "action",
          points: pts,
          reason: "Dân làng nguyên tố kích hoạt buff tạo tác động lớn (cứu dân/diệt sói)",
        });
      });
      break;
    }

    case "VILLAGER_VOTED_EXECUTED_WOLF": {
      const pts = getPoints(config.actions.villagerVotedExecutedWolf);
      actorIds.forEach((actorId) => {
        results.push({
          playerId: actorId,
          category: "action",
          points: pts,
          reason: "Vote treo cổ đúng sói",
        });
      });
      break;
    }

    case "VILLAGER_VOTED_EXECUTED_SPECIAL_WOLF": {
      const pts = getPoints(config.actions.villagerVotedExecutedSpecialWolf);
      actorIds.forEach((actorId) => {
        results.push({
          playerId: actorId,
          category: "action",
          points: pts,
          reason: "Vote treo cổ đúng sói đặc biệt",
        });
      });
      break;
    }

    case "WOLF_VOTED_EXECUTED_VILLAGER": {
      const pts = getPoints(config.actions.wolfVotedExecutedVillager);
      actorIds.forEach((actorId) => {
        results.push({
          playerId: actorId,
          category: "action",
          points: pts,
          reason: "Sói vote treo cổ thành công dân thường",
        });
      });
      break;
    }

    case "WOLF_VOTED_EXECUTED_CORE_ROLE": {
      const pts = getPoints(config.actions.wolfVotedExecutedCoreRole);
      actorIds.forEach((actorId) => {
        results.push({
          playerId: actorId,
          category: "action",
          points: pts,
          reason: "Sói vote treo cổ thành công vai chủ lực",
        });
      });
      break;
    }

    case "WOLF_SAVED_WOLF_FROM_EXECUTION": {
      const pts = getPoints(config.actions.wolfSavedWolfFromExecution);
      actorIds.forEach((actorId) => {
        results.push({
          playerId: actorId,
          category: "action",
          points: pts,
          reason: "Sói cứu đồng đội khỏi bị treo cổ",
        });
      });
      break;
    }

    case "WOLF_NIGHT_KILLED_VILLAGER": {
      const pts = getPoints(config.actions.wolfNightKilledVillager);
      actorIds.forEach((actorId) => {
        results.push({
          playerId: actorId,
          category: "action",
          points: pts,
          reason: "Sói cắn chết thành công dân thường",
        });
      });
      break;
    }

    case "WOLF_NIGHT_KILLED_CORE_ROLE": {
      const pts = getPoints(config.actions.wolfNightKilledCoreRole);
      actorIds.forEach((actorId) => {
        results.push({
          playerId: actorId,
          category: "action",
          points: pts,
          reason: "Sói cắn chết thành công vai chủ lực",
        });
      });
      break;
    }

    case "CURSED_FOUND_WOLF_ZONE": {
      const pts = getPoints(config.actions.cursedFoundWolfZone);
      actorIds.forEach((actorId) => {
        results.push({
          playerId: actorId,
          category: "action",
          points: pts,
          reason: "Kẻ bị nguyền soi phát hiện vùng có sói",
        });
      });
      break;
    }

    case "CURSED_INFO_LED_TO_WOLF_EXECUTION": {
      const pts = getPoints(config.actions.cursedInfoLedToWolfExecution);
      actorIds.forEach((actorId) => {
        results.push({
          playerId: actorId,
          category: "action",
          points: pts,
          reason: "Thông tin soi vùng của Kẻ bị nguyền dẫn tới việc treo cổ sói",
        });
      });
      break;
    }

    case "MAYOR_SECOND_VOTE_KILLED_WOLF": {
      const pts = getPoints(config.actions.mayorSecondVoteKilledWolf);
      actorIds.forEach((actorId) => {
        results.push({
          playerId: actorId,
          category: "action",
          points: pts,
          reason: "Trưởng làng kích hoạt biểu quyết lần 2 giúp treo cổ sói",
        });
      });
      break;
    }

    case "MAYOR_SECOND_VOTE_KILLED_FINAL_WOLF": {
      const pts = getPoints(config.actions.mayorSecondVoteKilledFinalWolf);
      actorIds.forEach((actorId) => {
        results.push({
          playerId: actorId,
          category: "action",
          points: pts,
          reason: "Trưởng làng kích hoạt biểu quyết lần 2 giúp treo cổ sói cuối cùng",
        });
      });
      break;
    }

    case "MAYOR_SECOND_VOTE_KILLED_VILLAGER": {
      const pts = getPoints(config.actions.mayorSecondVoteKilledVillagerPenalty);
      actorIds.forEach((actorId) => {
        results.push({
          playerId: actorId,
          category: "penalty",
          points: pts,
          reason: "Trưởng làng biểu quyết lần 2 treo nhầm dân",
        });
      });
      break;
    }

    case "SHIELD_GIVER_PROTECTED_VILLAGER": {
      const pts = getPoints(config.actions.shieldGiverProtectedVillager);
      actorIds.forEach((actorId) => {
        results.push({
          playerId: actorId,
          category: "action",
          points: pts,
          reason: "Hộ nhân trao khiên đúng phe dân",
        });
      });
      break;
    }

    case "SHIELD_GIVER_PROTECTED_CORE_ROLE": {
      const pts = getPoints(config.actions.shieldGiverProtectedCoreRole);
      actorIds.forEach((actorId) => {
        results.push({
          playerId: actorId,
          category: "action",
          points: pts,
          reason: "Hộ nhân trao khiên cho vai chủ lực",
        });
      });
      break;
    }

    case "SHIELD_BLOCKED_DEATH": {
      const pts = getPoints(config.actions.shieldBlockedDeath);
      actorIds.forEach((actorId) => {
        results.push({
          playerId: actorId,
          category: "action",
          points: pts,
          reason: "Khiên của Hộ nhân thật sự cứu người khỏi chết",
        });
      });
      break;
    }

    case "SHIELD_BLOCKED_CORE_ROLE_DEATH": {
      const pts = getPoints(config.actions.shieldBlockedCoreRoleDeath);
      actorIds.forEach((actorId) => {
        results.push({
          playerId: actorId,
          category: "action",
          points: pts,
          reason: "Khiên của Hộ nhân thật sự cứu vai chủ lực khỏi chết",
        });
      });
      break;
    }

    case "SHIELD_GIVEN_TO_WOLF": {
      const pts = getPoints(config.actions.shieldGivenToWolfPenalty);
      actorIds.forEach((actorId) => {
        results.push({
          playerId: actorId,
          category: "penalty",
          points: pts,
          reason: "Hộ nhân trao khiên nhầm cho sói",
        });
      });
      break;
    }

    case "SIDE_PICKER_CHOSE_WINNING_TEAM_EARLY": {
      const pts = getPoints(config.actions.sidePickerChoseWinningTeamEarly);
      actorIds.forEach((actorId) => {
        results.push({
          playerId: actorId,
          category: "action",
          points: pts,
          reason: "Linh sói/Thiên sứ chọn phe thắng từ sớm",
        });
      });
      break;
    }

    case "SIDE_PICKER_CHOSE_WINNING_TEAM_MID": {
      const pts = getPoints(config.actions.sidePickerChoseWinningTeamMid);
      actorIds.forEach((actorId) => {
        results.push({
          playerId: actorId,
          category: "action",
          points: pts,
          reason: "Linh sói/Thiên sứ chọn phe thắng ở giữa game",
        });
      });
      break;
    }

    case "SIDE_PICKER_CHOSE_WINNING_TEAM_LATE": {
      const pts = getPoints(config.actions.sidePickerChoseWinningTeamLate);
      actorIds.forEach((actorId) => {
        results.push({
          playerId: actorId,
          category: "action",
          points: pts,
          reason: "Linh sói/Thiên sứ chọn phe thắng ở cuối game",
        });
      });
      break;
    }

    case "LOVE_COUPLE_SAME_TEAM_SURVIVED_TO_END": {
      const pts = getPoints(config.actions.cupidCoupleSurvivedToEnd);
      actorIds.forEach((actorId) => {
        results.push({
          playerId: actorId,
          category: "survival",
          points: pts,
          reason: "Cặp đôi cùng phe sống sót đến cuối game",
        });
      });
      break;
    }

    case "LOVE_COUPLE_SPECIAL_WIN": {
      const pCount = event.metadata?.playerCount || playerCount;
      // Find bracket
      const bracket = config.specialWins.coupleWinByPlayerCount.find(
        (b) => pCount >= b.minPlayers && pCount <= b.maxPlayers
      );
      const pointsPerPlayer = bracket ? bracket.pointsPerCouplePlayer : 18;
      const pts = getPoints(pointsPerPlayer);

      actorIds.forEach((actorId) => {
        const player = playerMap.get(actorId);
        const isCupid = player?.role === "love_god" || player?.role === "cupid" || player?.role === "Thần tình yêu";
        const reason = isCupid
          ? `Thần tình yêu và người được ghép đôi khác phe đã đạt điều kiện thắng riêng trong game ${pCount} người`
          : `Cặp đôi khác phe đã đạt điều kiện thắng riêng trong game ${pCount} người`;

        results.push({
          playerId: actorId,
          category: "special_win",
          points: pts,
          reason,
        });
      });
      break;
    }

    case "LOVE_COUPLE_ESCAPE_DODGED_WOLF_KILL": {
      const pts = getPoints(config.actions.coupleEscapeDodgedWolfKill);
      actorIds.forEach((actorId) => {
        results.push({
          playerId: actorId,
          category: "action",
          points: pts,
          reason: "Kỹ năng cặp đôi né thành công vết cắn của sói",
        });
      });
      break;
    }

    case "LOVE_COUPLE_ESCAPE_DODGED_WITCH_KILL": {
      const pts = getPoints(config.actions.coupleEscapeDodgedWitchKill);
      actorIds.forEach((actorId) => {
        results.push({
          playerId: actorId,
          category: "action",
          points: pts,
          reason: "Kỹ năng cặp đôi né thành công bình thuốc độc của phù thủy",
        });
      });
      break;
    }

    case "LOVE_COUPLE_ESCAPE_DODGED_MULTIPLE_DEATHS": {
      const pts = getPoints(config.actions.coupleEscapeDodgedMultipleDeaths);
      actorIds.forEach((actorId) => {
        results.push({
          playerId: actorId,
          category: "action",
          points: pts,
          reason: "Kỹ năng cặp đôi né thành công nhiều nguồn chết trong cùng đêm",
        });
      });
      break;
    }

    case "MERCHANT_SUCCESSFUL_TRADE": {
      actorIds.forEach((actorId) => {
        const countBeforeThis = getEventCountForPlayer(actorId, "MERCHANT_SUCCESSFUL_TRADE");
        const dimRule = config.diminishingReturns["merchantSuccessfulTrade"];
        let base = config.actions.merchantSuccessfulTrade;

        if (dimRule?.enabled && countBeforeThis >= dimRule.fullPointsUntil) {
          base = dimRule.pointsAfterLimit;
        }

        const pts = getPoints(base);
        results.push({
          playerId: actorId,
          category: "action",
          points: pts,
          reason: "Tay buôn thực hiện giao dịch thành công",
        });
      });
      break;
    }

    case "MERCHANT_COMPLETED_PERSONAL_WIN": {
      const tradesCount = event.metadata?.successfulTrades ?? 3;
      const isEasy = tradesCount <= 3;
      const base = isEasy
        ? config.specialWins.merchantPersonalWinEasy
        : config.specialWins.merchantPersonalWinHard;
      const pts = getPoints(base);

      actorIds.forEach((actorId) => {
        results.push({
          playerId: actorId,
          category: "special_win",
          points: pts,
          reason: "Tay buôn hoàn thành điều kiện thắng riêng",
        });
      });
      break;
    }

    case "MERCHANT_COMPLETED_SIDE_OBJECTIVE": {
      const pts = getPoints(config.actions.merchantCompletedSideObjective);
      actorIds.forEach((actorId) => {
        results.push({
          playerId: actorId,
          category: "action",
          points: pts,
          reason: "Tay buôn hoàn thành mục tiêu phụ",
        });
      });
      break;
    }

    case "COFFEE_MAKER_FOUND_BOTH": {
      const pts = getPoints(config.actions.coffeeMakerFoundBoth);
      actorIds.forEach((actorId) => {
        results.push({
          playerId: actorId,
          category: "action",
          points: pts,
          reason: "Người pha cà phê tìm đúng cả Linh Chi và Đông Trùng trong cùng một đêm",
        });
      });
      break;
    }

    case "MANUAL_CLUTCH_BONUS": {
      actorIds.forEach((actorId) => {
        const pts = event.metadata?.points ?? 2;
        const reason = event.metadata?.reason || "Điểm clutch cộng thủ công từ quản trò";
        results.push({
          playerId: actorId,
          category: "clutch",
          points: pts,
          reason,
        });
      });
      break;
    }

    case "MANUAL_PENALTY": {
      actorIds.forEach((actorId) => {
        const pts = event.metadata?.points ?? -2;
        const reason = event.metadata?.reason || "Điểm trừ thủ công từ quản trò";
        results.push({
          playerId: actorId,
          category: "penalty",
          points: pts,
          reason,
        });
      });
      break;
    }

    default:
      // Unknown event, skip
      break;
  }

  return results;
}
