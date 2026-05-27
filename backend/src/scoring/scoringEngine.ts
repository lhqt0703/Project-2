import type { GameSummary, PlayerState, PlayerRanking, ScoringResult, ScoreBreakdownEntry } from "./scoringTypes.js";
import { DEFAULT_SCORING_CONFIG, type ScoringConfig } from "./scoringConfig.js";
import { mapEventToScores } from "./eventMapper.js";

export class ScoringEngine {
  private config: ScoringConfig;

  constructor(config: ScoringConfig = DEFAULT_SCORING_CONFIG) {
    this.config = config;
  }

  public calculateScore(summary: GameSummary): ScoringResult {
    const playerMap = new Map<string, PlayerState>();
    summary.players.forEach((p) => playerMap.set(p.id, p));

    // Initialize player rank records
    const rankingsMap = new Map<string, PlayerRanking>();
    summary.players.forEach((p) => {
      rankingsMap.set(p.id, {
        playerId: p.id,
        name: p.name,
        role: p.role,
        team: p.team,
        finalTeam: p.finalTeam,
        aliveAtEnd: p.aliveAtEnd,
        totalScore: 0,
        breakdown: [],
        clutchPoints: 0,
        actionPoints: 0,
        isWinner: p.finalTeam === summary.winningTeam || p.specialWin === true,
      });
    });

    // 1. Team Result Score
    // ONLY apply villagers/wolvesWin if finalTeam is villagers/wolves to prevent double-counting with special wins
    summary.players.forEach((p) => {
      const card = rankingsMap.get(p.id);
      if (!card) return;

      if (summary.winningTeam === "villagers" && p.finalTeam === "villagers") {
        const points = this.config.teamResult.villagersWin;
        card.breakdown.push({
          category: "team_result",
          points,
          reason: "Phe dân thắng",
        });
        card.totalScore += points;
      } else if (summary.winningTeam === "wolves" && p.finalTeam === "wolves") {
        const points = this.config.teamResult.wolvesWin;
        card.breakdown.push({
          category: "team_result",
          points,
          reason: "Phe sói thắng",
        });
        card.totalScore += points;
      }
    });

    // 2. Survival Score
    // Only if their team or condition won
    summary.players.forEach((p) => {
      const card = rankingsMap.get(p.id);
      if (!card) return;

      const won = p.finalTeam === summary.winningTeam || p.specialWin === true;
      if (p.aliveAtEnd && won) {
        let points = 0;
        let reason = "";

        if (p.finalTeam === "villagers") {
          points = this.config.survival.villagerAliveOnVillagerWin;
          reason = "Sống sót cuối ván khi phe dân thắng";
        } else if (p.finalTeam === "wolves") {
          points = this.config.survival.wolfAliveOnWolfWin;
          reason = "Sống sót cuối ván khi phe sói thắng";
        } else {
          // Couple, Merchant, Neutral special win survival
          points = this.config.survival.neutralAliveOnSpecialWin;
          reason = "Sống sót cuối ván khi đạt điều kiện thắng riêng";
        }

        card.breakdown.push({
          category: "survival",
          points,
          reason,
        });
        card.totalScore += points;
      }
    });

    // 3. Action Events (incorporating diminishing returns)
    const eventCounts = new Map<string, number>();
    const getEventCount = (playerId: string, type: string): number => {
      const key = `${playerId}:${type}`;
      return eventCounts.get(key) || 0;
    };
    const incrementEventCount = (playerId: string, type: string) => {
      const key = `${playerId}:${type}`;
      eventCounts.set(key, (eventCounts.get(key) || 0) + 1);
    };

    const seenEventKeys = new Set<string>();

    summary.events.forEach((event) => {
      const actorId = event.actorId || (event.actorIds ? [...event.actorIds].sort().join(",") : "");
      const eventKey = `${event.type}:${actorId}:${event.targetId || ""}:${event.phase || ""}:${event.night || 0}`;
      if (seenEventKeys.has(eventKey)) return;
      seenEventKeys.add(eventKey);

      const actorScores = mapEventToScores(
        event,
        this.config,
        playerMap,
        getEventCount,
        summary.playerCount
      );

      actorScores.forEach((scoreUpdate) => {
        const card = rankingsMap.get(scoreUpdate.playerId);
        if (!card) return;

        card.breakdown.push({
          category: scoreUpdate.category,
          points: scoreUpdate.points,
          reason: scoreUpdate.reason,
        });
        card.totalScore += scoreUpdate.points;

        if (scoreUpdate.category === "clutch") {
          card.clutchPoints += scoreUpdate.points;
        } else if (scoreUpdate.category === "action") {
          card.actionPoints += scoreUpdate.points;
        }

        // Increment event count for actor if it was a mapped action
        incrementEventCount(scoreUpdate.playerId, event.type);
      });
    });

    // 4. Manual Bonuses
    if (summary.manualBonuses && Array.isArray(summary.manualBonuses)) {
      summary.manualBonuses.forEach((bonus) => {
        const card = rankingsMap.get(bonus.playerId);
        if (!card) return;

        card.breakdown.push({
          category: bonus.category,
          points: bonus.points,
          reason: bonus.reason,
        });
        card.totalScore += bonus.points;

        if (bonus.category === "clutch") {
          card.clutchPoints += bonus.points;
        } else if (bonus.category === "action") {
          card.actionPoints += bonus.points;
        }
      });
    }

    // Round total scores to 1 decimal place to avoid floating point issues
    rankingsMap.forEach((card) => {
      card.totalScore = Number(card.totalScore.toFixed(1));
      card.clutchPoints = Number(card.clutchPoints.toFixed(1));
      card.actionPoints = Number(card.actionPoints.toFixed(1));
    });

    // 5. Tie-Breaker Sort
    const rankedList = Array.from(rankingsMap.values());
    rankedList.sort((a, b) => {
      // 1. Total score descending
      if (Math.abs(b.totalScore - a.totalScore) > 0.001) {
        return b.totalScore - a.totalScore;
      }
      // 2. Clutch points descending
      if (Math.abs(b.clutchPoints - a.clutchPoints) > 0.001) {
        return b.clutchPoints - a.clutchPoints;
      }
      // 3. Action points descending
      if (Math.abs(b.actionPoints - a.actionPoints) > 0.001) {
        return b.actionPoints - a.actionPoints;
      }
      // 4. Winner first
      if (a.isWinner !== b.isWinner) {
        return a.isWinner ? -1 : 1;
      }
      // 5. Alive at end first
      if (a.aliveAtEnd !== b.aliveAtEnd) {
        return a.aliveAtEnd ? -1 : 1;
      }
      return 0; // Co-MVP / Equal rank
    });

    // 6. MVP Designation
    const mvps: { playerId: string; name: string; score: number }[] = [];
    if (rankedList.length > 0) {
      const topPlayer = rankedList[0]!;
      mvps.push({
        playerId: topPlayer.playerId,
        name: topPlayer.name,
        score: topPlayer.totalScore,
      });

      // Find any co-MVPs who matched all tie-breakers exactly
      for (let i = 1; i < rankedList.length; i++) {
        const p = rankedList[i]!;
        const isTie =
          Math.abs(p.totalScore - topPlayer.totalScore) < 0.001 &&
          Math.abs(p.clutchPoints - topPlayer.clutchPoints) < 0.001 &&
          Math.abs(p.actionPoints - topPlayer.actionPoints) < 0.001 &&
          p.isWinner === topPlayer.isWinner &&
          p.aliveAtEnd === topPlayer.aliveAtEnd;

        if (isTie) {
          mvps.push({
            playerId: p.playerId,
            name: p.name,
            score: p.totalScore,
          });
        } else {
          // Since it's sorted, any subsequent player cannot be co-MVP
          break;
        }
      }
    }

    return {
      gameId: summary.gameId,
      mvp: mvps.length === 1 ? mvps[0]! : mvps,
      ranking: rankedList,
    };
  }
}
export default ScoringEngine;
