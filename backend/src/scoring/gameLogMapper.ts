import type { Room, GameLogEntry } from "../serverTypes.js";
import type { GameSummary, PlayerState, EventLog, CoupleConfig, EventType } from "./scoringTypes.js";
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
    if (p.id === room.hostId) return;
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

  // Build events by scanning gameEventLog
  const events: EventLog[] = [];
  const entries = room.gameEventLog || [];

  const pushEvent = (
    ev: Omit<EventLog, "night" | "phase"> & { night?: number; phase?: string },
    currentEntry?: any
  ) => {
    events.push({
      night: ev.night !== undefined ? ev.night : (currentEntry && currentEntry.night !== undefined ? currentEntry.night : (room.nightCount || 0)),
      phase: ev.phase !== undefined ? ev.phase : (currentEntry ? currentEntry.phase : "day"),
      ...ev,
    } as EventLog);
  };

  // Helper to check if a player was executed day after an action
  const checkExecutionAfter = (targetId: string, startIndex: number): boolean => {
    for (let i = startIndex; i < entries.length; i++) {
      const e = entries[i]!;
      if (e.type === "TRIAL_VERDICT" && e.targetIds?.includes(targetId) && e.metadata?.executed) {
        return true;
      }
      if (e.type === "DAY_VOTE" && e.targetIds?.includes(targetId)) {
        return true;
      }
    }
    return false;
  };

  entries.forEach((entry, idx) => {
    switch (entry.type) {
      case "GUARD_SAVE": {
        const actorId = entry.actorIds?.[0];
        const targetId = entry.targetIds?.[0];
        if (actorId && targetId) {
          const targetPlayer = playerMap.get(targetId);
          pushEvent({
            type: "GUARD_BLOCKED_WOLF_KILL",
            actorId,
            targetId,
            metadata: { targetIsCoreRole: targetPlayer ? ["seer", "witch", "guard", "protector"].includes(targetPlayer.role) : false },
          }, entry);
        }
        break;
      }

      case "WITCH_HEAL": {
        const actorId = entry.actorIds?.[0];
        const targetId = entry.targetIds?.[0];
        if (actorId && targetId) {
          const targetPlayer = playerMap.get(targetId);
          pushEvent({
            type: "WITCH_SAVED_PLAYER",
            actorId,
            targetId,
            metadata: { targetIsCoreRole: targetPlayer ? ["seer", "witch", "guard", "protector"].includes(targetPlayer.role) : false },
          }, entry);
        }
        break;
      }

      case "WITCH_POISON": {
        // WITCH_POISON is treated as an intent/action log only, not scored directly.
        break;
      }

      case "SEER_CHECK": {
        const actorId = entry.actorIds?.[0];
        const targetId = entry.targetIds?.[0];
        if (actorId && targetId) {
          const targetPlayer = playerMap.get(targetId);
          const isWolf = targetPlayer ? targetPlayer.team === "wolves" : entry.metadata?.isWolf;
          if (isWolf) {
            const ledToWolfExecutionNextDay = checkExecutionAfter(targetId, idx + 1);
            pushEvent({
              type: "SEER_FOUND_WOLF",
              actorId,
              targetId,
              metadata: { ledToWolfExecutionNextDay },
            }, entry);
          }
        }
        break;
      }

      case "HUNTER_SHOT": {
        const actorId = entry.actorIds?.[0];
        const targetId = entry.targetIds?.[0];
        if (actorId && targetId && !entry.metadata?.blockedByArmor) {
          const targetPlayer = playerMap.get(targetId);
          const isWolf = targetPlayer ? targetPlayer.team === "wolves" : false;
          pushEvent({
            type: isWolf ? "HUNTER_SHOT_WOLF" : "HUNTER_SHOT_VILLAGER",
            actorId,
            targetId,
          }, entry);
        }
        break;
      }

      case "CURSED_SNIFF": {
        const actorId = entry.actorIds?.[0];
        const targetId = entry.targetIds?.[0];
        if (actorId && targetId && entry.metadata?.hasWolf) {
          pushEvent({
            type: "CURSED_FOUND_WOLF_ZONE",
            actorId,
            targetId,
          }, entry);
        }
        break;
      }

      case "MERCHANT_TRADE": {
        const actorId = entry.actorIds?.[0];
        const targetId = entry.targetIds?.[0];
        if (actorId && targetId && entry.metadata?.result === "success") {
          pushEvent({
            type: "MERCHANT_SUCCESSFUL_TRADE",
            actorId,
            targetId,
          }, entry);
        }
        break;
      }

      case "MERCHANT_WIN": {
        const actorId = entry.actorIds?.[0];
        if (actorId) {
          pushEvent({
            type: "MERCHANT_COMPLETED_PERSONAL_WIN",
            actorId,
            metadata: { successfulTrades: entry.metadata?.successfulTrades },
          }, entry);
        }
        break;
      }

      case "TRIAL_VERDICT": {
        const targetId = entry.targetIds?.[0];
        const executed = entry.metadata?.executed;
        const dieVoterIds = entry.metadata?.dieVoterIds || [];
        if (executed && targetId) {
          const targetPlayer = playerMap.get(targetId);
          const isWolf = targetPlayer ? targetPlayer.team === "wolves" : false;

          if (isWolf) {
            dieVoterIds.forEach((voterId: string) => {
              const voter = playerMap.get(voterId);
              if (voter && voter.team === "villagers") {
                pushEvent({
                  type: "VILLAGER_VOTED_EXECUTED_WOLF",
                  actorId: voterId,
                  targetId,
                }, entry);
              }
            });
          } else {
            dieVoterIds.forEach((voterId: string) => {
              const voter = playerMap.get(voterId);
              if (voter && voter.team === "wolves") {
                pushEvent({
                  type: "WOLF_VOTED_EXECUTED_VILLAGER",
                  actorId: voterId,
                  targetId,
                }, entry);
              }
            });
          }
        }
        break;
      }

      case "PLAYER_ELIMINATED": {
        const targetId = entry.targetIds?.[0];
        const cause = entry.metadata?.cause;
        if (targetId && cause) {
          if (cause.type === "wolf") {
            const targetPlayer = playerMap.get(targetId);
            const isCore = targetPlayer ? ["seer", "witch", "guard", "protector"].includes(targetPlayer.role) : false;
            pushEvent({
              type: isCore ? "WOLF_NIGHT_KILLED_CORE_ROLE" : "WOLF_NIGHT_KILLED_VILLAGER",
              actorIds: cause.attackerIds || [],
              targetId,
            }, entry);
          } else if (cause.type === "witch_poison") {
            const actorId = cause.sourceActorId || cause.killerId;
            if (actorId) {
              const targetPlayer = playerMap.get(targetId);
              if (targetPlayer) {
                const isWolf = targetPlayer.team === "wolves";
                const isCore = ["seer", "witch", "guard", "protector"].includes(targetPlayer.role);
                const isSpecialWolf = isWolf && targetPlayer.role !== "sói" && targetPlayer.role !== "Sói";
                
                let type: EventType;
                if (isWolf) {
                  type = isSpecialWolf ? "WITCH_KILLED_SPECIAL_WOLF" : "WITCH_KILLED_WOLF";
                } else {
                  type = isCore ? "WITCH_KILLED_CORE_ROLE" : "WITCH_KILLED_VILLAGER";
                }

                pushEvent({
                  type,
                  actorId,
                  targetId,
                }, entry);
              }
            }
          }
        }
        break;
      }

      case "LOVE_ESCAPE": {
        if (loveGodId && partnerId) {
          pushEvent({
            type: "LOVE_COUPLE_ESCAPE_DODGED_WOLF_KILL",
            actorIds: [loveGodId, partnerId],
          }, entry);
        }
        break;
      }

      default:
        break;
    }
  });

  // If different team couple won
  if (isCoupleWinner && loveGodId && partnerId && !sameOriginalTeam) {
    pushEvent({
      type: "LOVE_COUPLE_SPECIAL_WIN",
      actorIds: [loveGodId, partnerId],
      metadata: { playerCount: players.length },
    });
  }

  // If same team couple survived to end
  if (room.winner === "villagers" && loveGodId && partnerId && sameOriginalTeam) {
    const isCupidAlive = !(room.deadPlayers || []).includes(loveGodId);
    const isPartnerAlive = !(room.deadPlayers || []).includes(partnerId);
    if (isCupidAlive && isPartnerAlive) {
      pushEvent({
        type: "LOVE_COUPLE_SAME_TEAM_SURVIVED_TO_END",
        actorIds: [loveGodId, partnerId],
      });
    }
  }

  for (const playerId of new Set(room.coffeeRoleState?.makerFoundBothPlayerIds || [])) {
    pushEvent({
      type: "COFFEE_MAKER_FOUND_BOTH",
      actorId: playerId,
      phase: "night",
    });
  }

  // Convert room.winner to winningTeam for scoring
  let winningTeam: string | null = null;
  if (room.winner === "villagers") winningTeam = "villagers";
  else if (room.winner === "wolves") winningTeam = "wolves";
  else if (room.winner === "lovers") winningTeam = "couple";
  else if (room.winner === "nobody") winningTeam = null;

  return {
    gameId: room.id,
    playerCount: players.length,
    winningTeam,
    players,
    couples,
    events,
  };
}
