import type { ServerContext } from "./serverContext.js";
import { appendLogEntry, buildWolfVoteBreakdown } from "./gameLog.js";
import {
  emitSpiritWolfDecisionNeeded,
  emitWitchPendingDeath,
  getHostNightActionProgressByPlayerId,
  getSelectedElementalRoles,
  getWolfTurnDurationMs,
  isElementalRoleTurn,
} from "./serverEmitters.js";
import { clampNonWolfNightActionDurationSec, clampWolfNightActionDurationSec } from "./gameConfig.js";
import { ELEMENTAL_GROUP_ROLE } from "./elemental.js";
import {
  clearNightTurnTimer,
  getActiveWolves,
  getSpiritWolfId,
  isSpiritWolfAlive,
  isWolfAlignedPlayer,
  isWolfRole,
  resetNightTurnState,
} from "./roomState.js";
import { ensureRoomGameRules, type NightActionRole, type Room } from "./serverTypes.js";
import { toPublicRoom } from "./serverEmitters.js";
import { LOVE_ROLE } from "./love.js";
import { PROTECTOR_ROLE, isVillageChief } from "./specialRoles.js";

type NightFlowDeps = {
  checkAndEndGame: (roomId: string, reason?: string) => void;
  emitElementalNightState: (roomId: string, playerId: string) => void;
  resolveElementalBuffVote: (roomId: string) => void;
};

export function createNightFlow(ctx: ServerContext, deps: NightFlowDeps) {
  const WITCH_BONUS_MS = 10_000;

  function getNonWolfTurnDurationMs(room: Room) {
    const rules = ensureRoomGameRules(room);
    const seconds = clampNonWolfNightActionDurationSec(rules.nonWolfNightActionDurationSec);
    return Math.max(0, Math.floor(seconds * 1000));
  }

  function shouldGrantWitchBonus(room: Room) {
    const rules = ensureRoomGameRules(room);
    const nonWolfSec = clampNonWolfNightActionDurationSec(rules.nonWolfNightActionDurationSec);
    const wolfSec = clampWolfNightActionDurationSec(rules.wolfNightActionDurationSec);
    return nonWolfSec > 0 && wolfSec === nonWolfSec;
  }

  function getWitchTurnDurationMs(room: Room) {
    const baseMs = getNonWolfTurnDurationMs(room);
    if (baseMs <= 0) return baseMs;
    return shouldGrantWitchBonus(room) ? baseMs + WITCH_BONUS_MS : baseMs;
  }

  function emitHostNightActionProgress(roomId: string) {
    const room = ctx.rooms[roomId];
    if (!room) return;
    ctx.io.to(room.hostId).emit("hostNightActionProgressUpdated", {
      progressByPlayerId: getHostNightActionProgressByPlayerId(room),
    });
  }

  function getSimultaneousRoleDeadline(room: Room, role: NightActionRole) {
    const rules = ensureRoomGameRules(room);
    if (!rules.allNightActionsSimultaneous) return null;
    if (role === "Sói") return room.wolfDeadline ?? null;

    const baseDeadline = room.nightTurnDeadline ?? null;
    if (!baseDeadline) return null;
    if (role === "Phù thủy" && shouldGrantWitchBonus(room)) return baseDeadline + WITCH_BONUS_MS;
    return baseDeadline;
  }

  function canPerformNightRoleAction(room: Room, playerId: string, expectedRole: NightActionRole) {
    if (room.phase !== "night") return false;
    if ((room.deadPlayers || []).includes(playerId)) return false;

    if (expectedRole === "Sói" && room.wolfVoteResolvedTonight) return false;

    const rules = ensureRoomGameRules(room);
    if (rules.allNightActionsSimultaneous) {
      const deadline = getSimultaneousRoleDeadline(room, expectedRole);
      if (deadline && Date.now() >= deadline) return false;
      return true;
    }
    return room.nightTurnRole === expectedRole;
  }

  function getSelectedNightActionRoles(room: Room): NightActionRole[] {
    const sourceRoles = room.playerRoles
      ? Object.values(room.playerRoles)
      : room.roles || [];

    const hasWolfRole = room.players.some((p) => isWolfAlignedPlayer(room, p.id));
    const selected = new Set<NightActionRole>();

    if (hasWolfRole) selected.add("Sói");
    if (sourceRoles.includes(LOVE_ROLE) && (room.nightCount || 0) === 1 && !room.loveTargetId) {
      selected.add(LOVE_ROLE as NightActionRole);
    }

    for (const role of ["Bảo vệ", PROTECTOR_ROLE, "Phù thủy", "Linh sói", "Thợ săn", "Tiên tri"] as NightActionRole[]) {
      if (sourceRoles.includes(role)) selected.add(role);
    }

    for (const role of getSelectedElementalRoles(room)) {
      selected.add(role as NightActionRole);
    }

    return Array.from(selected);
  }

  function shouldIncludeSpiritWolfTurn(room: Room) {
    if (room.spiritWolfDecisionMade) return false;
    if (!room.spiritWolfPendingPoisonedWolfId) return false;
    if (!isSpiritWolfAlive(room)) return false;
    if ((room.deadPlayers || []).includes(room.spiritWolfPendingPoisonedWolfId)) return false;
    return true;
  }

  function emitElementalNightStateForRole(roomId: string, role: NightActionRole) {
    const room = ctx.rooms[roomId];
    if (!room) return;
    if (!isElementalRoleTurn(role)) return;
    const dead = new Set(room.deadPlayers || []);
    for (const player of room.players) {
      if (dead.has(player.id)) continue;
      if (room.playerRoles?.[player.id] !== role) continue;
      deps.emitElementalNightState(roomId, player.id);
    }
  }

  function emitElementalNightStateForAll(roomId: string) {
    const room = ctx.rooms[roomId];
    if (!room) return;
    const dead = new Set(room.deadPlayers || []);
    for (const player of room.players) {
      if (dead.has(player.id)) continue;
      if (!isElementalRoleTurn(room.playerRoles?.[player.id] || null)) continue;
      deps.emitElementalNightState(roomId, player.id);
    }
  }

  function getBaseNightActionOrder(room: Room) {
    const rules = ensureRoomGameRules(room);
    const selectedRoles = new Set(getSelectedNightActionRoles(room));
    const expanded: NightActionRole[] = [];
    for (const role of rules.nightActionOrder) {
      if (role === ELEMENTAL_GROUP_ROLE) {
        for (const elementalRole of getSelectedElementalRoles(room)) {
          if (selectedRoles.has(elementalRole as NightActionRole)) {
            expanded.push(elementalRole as NightActionRole);
          }
        }
        continue;
      }
      if (selectedRoles.has(role as NightActionRole)) {
        expanded.push(role as NightActionRole);
      }
    }
    return expanded;
  }

  function getEffectiveNightActionOrder(room: Room) {
    if (!room.nightTurnOrderSnapshot) {
      room.nightTurnOrderSnapshot = getBaseNightActionOrder(room);
    }

    const order = room.nightTurnOrderSnapshot;

    if (shouldIncludeSpiritWolfTurn(room)) {
      ensureUpcomingSpiritWolfTurn(room, order);
    }

    return [...order];
  }

  function ensureUpcomingSpiritWolfTurn(room: Room, order: NightActionRole[]) {
    const spiritRole: NightActionRole = "Linh sói";
    const currentIndex = room.nightTurnIndex ?? -1;
    const existingIndex = order.indexOf(spiritRole);
    if (existingIndex >= 0 && existingIndex >= currentIndex) return;

    const insertAt =
      currentIndex >= 0
        ? currentIndex + 1
        : (() => {
            const witchIndex = order.indexOf("Phù thủy");
            return witchIndex >= 0 ? witchIndex + 1 : order.length;
          })();

    order.splice(Math.min(insertAt, order.length), 0, spiritRole);
  }

  function insertSpiritWolfIntoNightOrder(room: Room) {
    if (!room.nightTurnOrderSnapshot) {
      room.nightTurnOrderSnapshot = getBaseNightActionOrder(room);
    }
    ensureUpcomingSpiritWolfTurn(room, room.nightTurnOrderSnapshot);
  }

  function finishSpiritWolfTurn(roomId: string, timedOut: boolean) {
    const room = ctx.rooms[roomId];
    if (!room) return;
    if (room.phase !== "night") return;
    if (room.nightTurnRole !== "Linh sói") return;

    const pendingTargetId = room.spiritWolfPendingPoisonedWolfId;
    if (timedOut && !room.spiritWolfDecisionMade && pendingTargetId) {
      room.spiritWolfDecisionMade = true;
      room.spiritWolfChoseSave = false;
      appendLogEntry(room, { type: "spirit_wolf_decision", phase: "night", saved: false, timedOut: true });
      const swid = getSpiritWolfId(room);
      if (swid) {
        ctx.io.to(swid).emit("spiritWolfDecisionRecorded", { saved: false });
      }
    }

    room.spiritWolfPendingPoisonedWolfId = null;

    ctx.io.to(roomId).emit("roomUpdated", toPublicRoom(room));
    deps.checkAndEndGame(roomId, timedOut ? "spirit_wolf_timeout" : "spirit_wolf_decision");

    startNightTurnByIndex(roomId, (room.nightTurnIndex ?? 0) + 1);
  }

  function startWolfPhase(roomId: string, opts?: { durationMs?: number; initializeVotes?: boolean; useTimer?: boolean }) {
    const room = ctx.rooms[roomId];
    if (!room) return;

    const initializeVotes = opts?.initializeVotes !== false;
    const wolves = room.players.filter((p) => isWolfAlignedPlayer(room, p.id));

    if (initializeVotes) {
      room.wolfVotes = {};
      room.wolfVotes2 = {};
      room.wolfLocked = {};
      wolves.forEach((w) => {
        room.wolfVotes![w.id] = null;
        room.wolfVotes2![w.id] = null;
        room.wolfLocked![w.id] = false;
      });
      room.wolfVoteResolvedTonight = false;
    } else {
      room.wolfVotes = room.wolfVotes || {};
      room.wolfVotes2 = room.wolfVotes2 || {};
      room.wolfLocked = room.wolfLocked || {};
    }

    const useTimer = opts?.useTimer !== false;
    const durationMs = useTimer ? Math.max(0, Math.floor(opts?.durationMs ?? getWolfTurnDurationMs(room))) : null;

    room.wolfDeadline = durationMs === null ? null : Date.now() + durationMs;
    ctx.io.to(`wolves_${roomId}`).emit("wolfPhaseStarted", {
      wolves: wolves.map((w) => w.id),
      activeWolves: getActiveWolves(room),
      deadline: room.wolfDeadline,
      maxTargets: room.wolfBonusBiteThisNight ? 2 : 1,
      resetVotes: initializeVotes,
      wolfBadgeRolesByPlayerId: Object.fromEntries(wolves.map((w) => [w.id, room.playerRoles?.[w.id] || "Sói"])),
    });

    ctx.io.to(`wolves_${roomId}`).emit("wolfVotes2Updated", room.wolfVotes2);

    if (room.wolfTimer) {
      clearTimeout(room.wolfTimer);
      room.wolfTimer = null;
    }

    if (durationMs === null) {
      return;
    }

    if (durationMs <= 0) {
      finishWolfVoting(roomId);
      return;
    }

    room.wolfTimer = setTimeout(() => {
      finishWolfVoting(roomId);
    }, durationMs);
  }

  function getRoleTurnDurationMs(room: Room, role: NightActionRole) {
    if (role === "Sói") return getWolfTurnDurationMs(room);
    if (role === "Phù thủy") return getWitchTurnDurationMs(room);
    return getNonWolfTurnDurationMs(room);
  }

  function startNightTurnByIndex(roomId: string, index: number, opts?: { durationMs?: number; initializeWolfVotes?: boolean }) {
    const room = ctx.rooms[roomId];
    if (!room) return;
    if (room.phase !== "night") return;

    const rules = ensureRoomGameRules(room);
    if (rules.allNightActionsSimultaneous) return;

    clearNightTurnTimer(room);

    const order = getEffectiveNightActionOrder(room);
    const previousRole = index > 0 ? order[index - 1] : null;
    const nextRole = index >= 0 && index < order.length ? order[index] : null;
    if (isElementalRoleTurn(previousRole) && !isElementalRoleTurn(nextRole)) {
      deps.resolveElementalBuffVote(roomId);
    }

    if (index < 0 || index >= order.length) {
      room.nightTurnIndex = order.length;
      room.nightTurnRole = null;
      room.nightTurnDeadline = null;
      room.nightTurnPaused = false;
      room.nightTurnRemainingMs = null;
      room.hidePlayerRoleText = true;
      ctx.io.to(roomId).emit("roomUpdated", toPublicRoom(room));
      return;
    }

    const role = order[index]!;
    const durationMs = Math.max(0, Math.floor(opts?.durationMs ?? getRoleTurnDurationMs(room, role)));

    room.nightTurnIndex = index;
    room.nightTurnRole = role;
    room.nightTurnPaused = false;
    room.nightTurnRemainingMs = durationMs;
    room.nightTurnDeadline = Date.now() + durationMs;
    room.hidePlayerRoleText = false;

    if (role === "Sói") {
      startWolfPhase(roomId, {
        durationMs,
        initializeVotes: opts?.initializeWolfVotes !== false,
      });
    } else if (role === "Linh sói") {
      emitSpiritWolfDecisionNeeded(roomId);
      if (durationMs <= 0) {
        setTimeout(() => finishSpiritWolfTurn(roomId, true), 0);
      } else {
        room.nightTurnTimer = setTimeout(() => {
          finishSpiritWolfTurn(roomId, true);
        }, durationMs);
      }
    } else {
      if (durationMs <= 0) {
        setTimeout(() => {
          const latest = ctx.rooms[roomId];
          if (!latest) return;
          if (latest.phase !== "night") return;
          if (latest.nightTurnRole !== role) return;
          startNightTurnByIndex(roomId, index + 1);
        }, 0);
      } else {
        room.nightTurnTimer = setTimeout(() => {
          startNightTurnByIndex(roomId, index + 1);
        }, durationMs);
      }
    }

    ctx.io.to(roomId).emit("roomUpdated", toPublicRoom(room));
    emitElementalNightStateForRole(roomId, role);
  }

  function startNightTurnFlow(roomId: string) {
    const room = ctx.rooms[roomId];
    if (!room) return;
    if (room.phase !== "night") return;

    const rules = ensureRoomGameRules(room);
    resetNightTurnState(room);
    room.nightTurnOrderSnapshot = getBaseNightActionOrder(room);

    if (rules.allNightActionsSimultaneous) {
      room.hidePlayerRoleText = false;
      const nonWolfDurationMs = getNonWolfTurnDurationMs(room);
      room.nightTurnDeadline = nonWolfDurationMs > 0 ? Date.now() + nonWolfDurationMs : null;
      const baseDeadline = room.nightTurnDeadline;

      const wolfDurationMs = getWolfTurnDurationMs(room);
      startWolfPhase(roomId, {
        initializeVotes: true,
        useTimer: wolfDurationMs > 0,
        durationMs: wolfDurationMs,
      });
      ctx.io.to(roomId).emit("roomUpdated", toPublicRoom(room));
      emitElementalNightStateForAll(roomId);
      if (baseDeadline) {
        setTimeout(() => {
          const latest = ctx.rooms[roomId];
          if (!latest) return;
          if (latest.phase !== "night") return;
          if (latest.nightTurnDeadline !== baseDeadline) return;
          emitHostNightActionProgress(roomId);
        }, Math.max(0, baseDeadline - Date.now()));

        if (shouldGrantWitchBonus(room)) {
          const witchDeadline = baseDeadline + WITCH_BONUS_MS;
          setTimeout(() => {
            const latest = ctx.rooms[roomId];
            if (!latest) return;
            if (latest.phase !== "night") return;
            if (latest.nightTurnDeadline !== baseDeadline) return;
            emitHostNightActionProgress(roomId);
          }, Math.max(0, witchDeadline - Date.now()));
        }
      }
      return;
    }

    const order = getEffectiveNightActionOrder(room);
    if (!order.length) {
      ctx.io.to(roomId).emit("roomUpdated", toPublicRoom(room));
      return;
    }

    startNightTurnByIndex(roomId, 0, { initializeWolfVotes: true });
  }

  function finishWolfVoting(roomId: string) {
    const room = ctx.rooms[roomId];
    if (!room) return;
    if (room.wolfVoteResolvedTonight) return;

    if (room.wolfTimer) {
      clearTimeout(room.wolfTimer);
      room.wolfTimer = null;
    }
    room.wolfDeadline = null;
    room.wolfVoteResolvedTonight = true;
    room.wolfAttackResolvedAt = Date.now();

    const votes = room.wolfVotes || {};
    const votes2 = room.wolfVotes2 || {};
    const activeWolves = getActiveWolves(room);

    appendLogEntry(room, buildWolfVoteBreakdown(room, votes));
    if (room.wolfBonusBiteThisNight) {
      appendLogEntry(room, buildWolfVoteBreakdown(room, votes2));
    }

    const counts: Record<string, number> = {};
    activeWolves.forEach((wolfId) => {
      const target = votes[wolfId];
      if (!target) return;
      counts[target] = (counts[target] || 0) + 1;
    });

    const entries = Object.entries(counts);
    if (entries.length === 0) {
      room.killedTonight = null;
    } else {
      entries.sort((a, b) => b[1] - a[1]);
      if (entries.length > 1 && entries[0]![1] === entries[1]![1]) {
        room.killedTonight = null;
      } else {
        room.killedTonight = entries[0]![0];
      }
    }

    room.killedTonightExtra = null;
    if (room.wolfBonusBiteThisNight) {
      const votingWolves = activeWolves.filter((wid) => !!votes[wid] || !!votes2[wid]);

      if (votingWolves.length <= 1) {
        const wid = votingWolves[0];
        const t1 = wid ? votes[wid] : null;
        const t2 = wid ? votes2[wid] : null;
        if (t1 && t2 && t1 !== t2) {
          room.killedTonight = t1;
          room.killedTonightExtra = t2;
        } else {
          room.killedTonight = t1 || t2 || null;
          room.killedTonightExtra = null;
        }
      } else {
        const combinedCounts: Record<string, number> = {};
        for (const wid of votingWolves) {
          const t1 = votes[wid];
          const t2 = votes2[wid];
          const uniq = new Set<string>();
          if (t1) uniq.add(t1);
          if (t2) uniq.add(t2);
          for (const t of uniq) {
            combinedCounts[t] = (combinedCounts[t] || 0) + 1;
          }
        }

        const eligible = Object.entries(combinedCounts).filter(([, c]) => c >= 2);
        if (eligible.length === 0) {
          room.killedTonight = null;
          room.killedTonightExtra = null;
        } else {
          eligible.sort((a, b) => b[1] - a[1]);
          const topCount = eligible[0]![1];
          const topTied = eligible.filter(([, c]) => c === topCount);
          if (topTied.length >= 3) {
            room.killedTonight = null;
            room.killedTonightExtra = null;
          } else if (topTied.length === 2) {
            room.killedTonight = topTied[0]![0];
            room.killedTonightExtra = topTied[1]![0];
          } else {
            room.killedTonight = eligible[0]![0];

            const remaining = eligible.filter(([pid]) => pid !== room.killedTonight);
            if (remaining.length) {
              const secondCount = remaining[0]![1];
              const secondTied = remaining.filter(([, c]) => c === secondCount);
              if (secondTied.length === 1) {
                room.killedTonightExtra = remaining[0]![0];
              } else {
                room.killedTonightExtra = null;
              }
            }
          }
        }
      }
    }

    ctx.io.to(roomId).emit("wolfVoteFinished", {
      target: room.killedTonight,
      extraTarget: room.killedTonightExtra,
    });

    const wolfTargets = [room.killedTonight, room.killedTonightExtra].filter(Boolean) as string[];
    const selectedByByTarget: Record<string, string[]> = {};
    for (const targetId of wolfTargets) {
      const selectedBy = activeWolves.filter((wid) => votes[wid] === targetId || votes2[wid] === targetId);
      selectedByByTarget[targetId] = selectedBy;
    }
    appendLogEntry(room, { type: "wolf_result", phase: "night", targetIds: wolfTargets, selectedByByTarget });

    const rules = ensureRoomGameRules(room);
    if (rules.villageChiefKnowsWolfBite) {
      for (const targetId of wolfTargets) {
        if (!isVillageChief(room, targetId)) continue;
        if ((room.deadPlayers || []).includes(targetId)) continue;
        room.privatePlayerHearts = room.privatePlayerHearts || {};
        room.privatePlayerHearts[targetId] = 1;
        room.privateHeartVisiblePlayerIds = Array.from(new Set([...(room.privateHeartVisiblePlayerIds || []), targetId]));
        room.playerHeartShakeIds = (room.playerHeartShakeIds || []).filter((id) => id !== targetId);
        appendLogEntry(room, {
          type: "village_chief_bitten_warning",
          phase: "night",
          targetId,
          attackerIds: selectedByByTarget[targetId] || [],
        });
      }
      ctx.io.to(roomId).emit("roomUpdated", toPublicRoom(room));
    }

    if (room.phase === "night") {
      emitWitchPendingDeath(roomId);
    }
    emitHostNightActionProgress(roomId);

    if (!rules.allNightActionsSimultaneous && room.phase === "night" && room.nightTurnRole === "Sói") {
      startNightTurnByIndex(roomId, (room.nightTurnIndex ?? 0) + 1);
    }
  }

  return {
    canPerformNightRoleAction,
    getSelectedNightActionRoles,
    shouldIncludeSpiritWolfTurn,
    getBaseNightActionOrder,
    getEffectiveNightActionOrder,
    insertSpiritWolfIntoNightOrder,
    finishSpiritWolfTurn,
    getWolfTurnDurationMs,
    startWolfPhase,
    getRoleTurnDurationMs,
    startNightTurnByIndex,
    startNightTurnFlow,
    finishWolfVoting,
  };
}
