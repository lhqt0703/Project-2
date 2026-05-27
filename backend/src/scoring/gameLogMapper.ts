import type { Room, GameLogEntry } from "../serverTypes.js";
import type { GameSummary, PlayerState, EventLog, CoupleConfig } from "./scoringTypes.js";
import { isWolfRole } from "../roomState.js";
import { MERCHANT_ROLE } from "../merchant.js";

export function buildGameSummaryFromRoom(room: Room): GameSummary {
  const players: PlayerState[] = [];
  const playerMap = new Map<string, PlayerState>();

  // Determine Cupid & Partner love group details
  const loveGodId = room.loveCupidId;
  const partnerId = room.loveTargetId;
  const sameOriginalTeam = room.loveTargetWolfAligned === false; // If partner is wolf-aligned, original team is different

  // Check if couple special win achieved
  const isCoupleWinner = room.winner === "lovers";

  room.players.forEach((p) => {
    const role = room.playerRoles?.[p.id] || "Dân làng";
    let originalTeam = "villagers";
    if (isWolfRole(role)) {
      originalTeam = "wolves";
    } else if (role === "Tay Buôn" || role === "Thiên Sứ") {
      originalTeam = "neutral";
    }

    let finalTeam = originalTeam;
    const isCupidPair = (p.id === loveGodId || p.id === partnerId) && loveGodId && partnerId;
    if (isCupidPair) {
      if (room.loveTargetWolfAligned) {
        finalTeam = "couple"; // Different team couple has special win condition
      }
    }

    const isMerchant = role === "Tay Buôn";
    const achievedMerchantWin = isMerchant && (room.merchantWinCompletedPlayerIds || []).includes(p.id);
    if (achievedMerchantWin) {
      finalTeam = "merchant";
    }

    let specialWin = false;
    if (finalTeam === "couple" && isCoupleWinner) {
      specialWin = true;
    } else if (finalTeam === "merchant" && achievedMerchantWin) {
      specialWin = true;
    }

    const state: PlayerState = {
      id: p.id,
      name: p.name,
      role: role === "Tay Buôn" ? "merchant" : role === "Thần tình yêu" ? "love_god" : role === "Tiên tri" ? "seer" : role === "Phù thủy" ? "witch" : role === "Bảo vệ" || role === "Hộ nhân" ? "guard" : role === "Thợ săn" ? "hunter" : role.toLowerCase(),
      team: originalTeam,
      finalTeam: finalTeam,
      aliveAtEnd: !(room.deadPlayers || []).includes(p.id),
      specialWin,
    };

    players.push(state);
    playerMap.set(p.id, state);
  });

  const couples: CoupleConfig[] = [];
  if (loveGodId && partnerId) {
    couples.push({
      loveGodId,
      partnerId,
      sameOriginalTeam,
      isSpecialCouple: !sameOriginalTeam,
      achievedSpecialWin: isCoupleWinner,
    });
  }

  // Build events by scanning gameLog
  const events: EventLog[] = [];
  const entries: GameLogEntry[] = [];
  if (room.gameLog && Array.isArray(room.gameLog)) {
    room.gameLog.forEach((nightLog) => {
      if (nightLog.entries && Array.isArray(nightLog.entries)) {
        nightLog.entries.forEach((entry) => entries.push(entry));
      }
    });
  }

  // Helper to check if a player was executed day after an action
  const checkExecutionAfter = (targetId: string, startIndex: number): boolean => {
    for (let i = startIndex; i < entries.length; i++) {
      const e = entries[i]!;
      if (e.type === "trial_verdict" && e.targetId === targetId && e.executed) {
        return true;
      }
      if (e.type === "day_result" && e.targetId === targetId) {
        return true;
      }
    }
    return false;
  };

  entries.forEach((entry, idx) => {
    switch (entry.type) {
      case "saved_by_guardian": {
        const actorId = entry.actorId;
        const targetId = entry.targetIds?.[0];
        if (actorId && targetId) {
          const targetPlayer = playerMap.get(targetId);
          events.push({
            type: "GUARD_BLOCKED_WOLF_KILL",
            actorId,
            targetId,
            metadata: { targetIsCoreRole: targetPlayer ? ["seer", "witch", "guard", "protector"].includes(targetPlayer.role) : false },
          });
        }
        break;
      }

      case "witch_heal": {
        const targetPlayer = playerMap.get(entry.targetId);
        events.push({
          type: "WITCH_SAVED_PLAYER",
          actorId: entry.actorId,
          targetId: entry.targetId,
          metadata: { targetIsCoreRole: targetPlayer ? ["seer", "witch", "guard", "protector"].includes(targetPlayer.role) : false },
        });
        break;
      }

      case "witch_poison": {
        const targetPlayer = playerMap.get(entry.targetId);
        const isWolf = targetPlayer ? targetPlayer.team === "wolves" : false;
        events.push({
          type: isWolf ? "WITCH_KILLED_WOLF" : "WITCH_KILLED_VILLAGER",
          actorId: entry.actorId,
          targetId: entry.targetId,
        });
        break;
      }

      case "seer_check": {
        const targetPlayer = playerMap.get(entry.targetId);
        const isWolf = targetPlayer ? targetPlayer.team === "wolves" : entry.isWolf;
        if (isWolf) {
          const ledToWolfExecutionNextDay = checkExecutionAfter(entry.targetId, idx + 1);
          events.push({
            type: "SEER_FOUND_WOLF",
            actorId: entry.actorId,
            targetId: entry.targetId,
            metadata: { ledToWolfExecutionNextDay },
          });
        }
        break;
      }

      case "hunter_shot": {
        const targetPlayer = playerMap.get(entry.targetId);
        const isWolf = targetPlayer ? targetPlayer.team === "wolves" : false;
        events.push({
          type: isWolf ? "HUNTER_SHOT_WOLF" : "HUNTER_SHOT_VILLAGER",
          actorId: entry.actorId,
          targetId: entry.targetId,
        });
        break;
      }

      case "cursed_sniff": {
        if (entry.hasWolf) {
          events.push({
            type: "CURSED_FOUND_WOLF_ZONE",
            actorId: entry.actorId,
            targetId: entry.targetId,
          });
        }
        break;
      }

      case "merchant_trade_response": {
        if (entry.result === "success") {
          events.push({
            type: "MERCHANT_SUCCESSFUL_TRADE",
            actorId: entry.actorId,
            targetId: entry.targetId,
          });
        }
        break;
      }

      case "merchant_win_condition_completed": {
        events.push({
          type: "MERCHANT_COMPLETED_PERSONAL_WIN",
          actorId: entry.actorId,
          metadata: { successfulTrades: entry.successfulTrades },
        });
        break;
      }

      case "trial_verdict": {
        if (entry.executed) {
          const targetPlayer = playerMap.get(entry.targetId);
          const isWolf = targetPlayer ? targetPlayer.team === "wolves" : false;

          if (isWolf) {
            if (entry.dieVoterIds && Array.isArray(entry.dieVoterIds)) {
              entry.dieVoterIds.forEach((voterId) => {
                const voter = playerMap.get(voterId);
                if (voter && voter.team === "villagers") {
                  events.push({
                    type: "VILLAGER_VOTED_EXECUTED_WOLF",
                    actorId: voterId,
                    targetId: entry.targetId,
                  });
                }
              });
            }
          } else {
            if (entry.dieVoterIds && Array.isArray(entry.dieVoterIds)) {
              entry.dieVoterIds.forEach((voterId) => {
                const voter = playerMap.get(voterId);
                if (voter && voter.team === "wolves") {
                  events.push({
                    type: "WOLF_VOTED_EXECUTED_VILLAGER",
                    actorId: voterId,
                    targetId: entry.targetId,
                  });
                }
              });
            }
          }
        }
        break;
      }

      case "wolf_result": {
        if (entry.targetIds && Array.isArray(entry.targetIds)) {
          entry.targetIds.forEach((targetId) => {
            const targetPlayer = playerMap.get(targetId);
            const isCore = targetPlayer ? ["seer", "witch", "guard", "protector"].includes(targetPlayer.role) : false;
            
            const voters = entry.selectedByByTarget?.[targetId] || [];
            if (voters.length > 0) {
              events.push({
                type: isCore ? "WOLF_NIGHT_KILLED_CORE_ROLE" : "WOLF_NIGHT_KILLED_VILLAGER",
                actorIds: voters,
                targetId,
              });
            }
          });
        }
        break;
      }

      case "love_escape": {
        if (loveGodId && partnerId) {
          events.push({
            type: "LOVE_COUPLE_ESCAPE_DODGED_WOLF_KILL",
            actorIds: [loveGodId, partnerId],
          });
        }
        break;
      }

      default:
        break;
    }
  });

  // If different team couple won
  if (isCoupleWinner && loveGodId && partnerId && !sameOriginalTeam) {
    events.push({
      type: "LOVE_COUPLE_SPECIAL_WIN",
      actorIds: [loveGodId, partnerId],
      metadata: { playerCount: room.players.length },
    });
  }

  // If same team couple survived to end
  if (room.winner === "villagers" && loveGodId && partnerId && sameOriginalTeam) {
    const isCupidAlive = !(room.deadPlayers || []).includes(loveGodId);
    const isPartnerAlive = !(room.deadPlayers || []).includes(partnerId);
    if (isCupidAlive && isPartnerAlive) {
      events.push({
        type: "LOVE_COUPLE_SAME_TEAM_SURVIVED_TO_END",
        actorIds: [loveGodId, partnerId],
      });
    }
  }

  // Convert room.winner to winningTeam for scoring
  let winningTeam: string | null = null;
  if (room.winner === "villagers") winningTeam = "villagers";
  else if (room.winner === "wolves") winningTeam = "wolves";
  else if (room.winner === "lovers") winningTeam = "couple";
  else if (room.winner === "nobody") winningTeam = null;

  return {
    gameId: room.id,
    playerCount: room.players.length,
    winningTeam,
    players,
    couples,
    events,
  };
}
