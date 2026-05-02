import type { ServerContext } from "./serverContext.js";
import { appendLogEntry, buildWolfVoteBreakdown } from "./gameLog.js";
import {
  emitSpiritWolfDecisionNeeded,
  emitWitchPendingDeath,
  getSelectedElementalRoles,
  getWolfTurnDurationMs,
  isElementalRoleTurn,
} from "./serverEmitters.js";
import { clampNonWolfNightActionDurationSec } from "./gameConfig.js";
import { ELEMENTAL_GROUP_ROLE } from "./elemental.js";
import {
  clearNightTurnTimer,
  getActiveWolves,
  getSpiritWolfId,
  isSpiritWolfAlive,
  isWolfRole,
  resetNightTurnState,
} from "./roomState.js";
import { ensureRoomGameRules, type NightActionRole, type Room } from "./serverTypes.js";
import { toPublicRoom } from "./serverEmitters.js";

type NightFlowDeps = {
  checkAndEndGame: (roomId: string, reason?: string) => void;
  resolveElementalBuffVote: (roomId: string) => void;
};

export function createNightFlow(ctx: ServerContext, deps: NightFlowDeps) {
  function canPerformNightRoleAction(room: Room, playerId: string, expectedRole: NightActionRole) {
    if (room.phase !== "night") return false;
    if ((room.deadPlayers || []).includes(playerId)) return false;

    const rules = ensureRoomGameRules(room);
    if (rules.allNightActionsSimultaneous) return true;
    return room.nightTurnRole === expectedRole;
  }

  function getSelectedNightActionRoles(room: Room): NightActionRole[] {
    const sourceRoles = room.playerRoles
      ? Object.values(room.playerRoles)
      : room.roles || [];

    const hasWolfRole = sourceRoles.some((role) => isWolfRole(role));
    const selected = new Set<NightActionRole>();

    if (hasWolfRole) selected.add("Sói");
    for (const role of ["Bảo vệ", "Phù thủy", "Thợ săn", "Tiên tri"] as NightActionRole[]) {
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
    const order = room.nightTurnOrderSnapshot ? [...room.nightTurnOrderSnapshot] : getBaseNightActionOrder(room);

    if (shouldIncludeSpiritWolfTurn(room)) {
      const spiritRole: NightActionRole = "Linh sói";
      if (!order.includes(spiritRole)) {
        const witchIndex = order.indexOf("Phù thủy");
        if (witchIndex >= 0) {
          order.splice(witchIndex + 1, 0, spiritRole);
        } else {
          order.push(spiritRole);
        }
      }
    }

    return order;
  }

  function insertSpiritWolfIntoNightOrder(room: Room) {
    const spiritRole: NightActionRole = "Linh sói";
    if (!room.nightTurnOrderSnapshot) {
      room.nightTurnOrderSnapshot = getBaseNightActionOrder(room);
    }
    if (room.nightTurnOrderSnapshot.includes(spiritRole)) return;

    const insertAt = Math.min((room.nightTurnIndex ?? -1) + 1, room.nightTurnOrderSnapshot.length);
    room.nightTurnOrderSnapshot.splice(insertAt, 0, spiritRole);
  }

  function finishSpiritWolfTurn(roomId: string, timedOut: boolean) {
    const room = ctx.rooms[roomId];
    if (!room) return;
    if (room.phase !== "night") return;
    if (room.nightTurnRole !== "Linh sói") return;

    const pendingTargetId = room.spiritWolfPendingPoisonedWolfId;
    if (timedOut && !room.spiritWolfDecisionMade) {
      room.spiritWolfDecisionMade = true;
      room.spiritWolfChoseSave = false;
      if (pendingTargetId) {
        appendLogEntry(room, { type: "spirit_wolf_decision", phase: "night", saved: false, timedOut: true });
      }
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

  function startWolfPhase(roomId: string, opts?: { durationMs?: number; initializeVotes?: boolean }) {
    const room = ctx.rooms[roomId];
    if (!room) return;

    const initializeVotes = opts?.initializeVotes !== false;
    const wolves = room.players.filter((p) => isWolfRole(room.playerRoles?.[p.id]));

    if (initializeVotes) {
      room.wolfVotes = {};
      room.wolfVotes2 = {};
      room.wolfLocked = {};
      wolves.forEach((w) => {
        room.wolfVotes![w.id] = null;
        room.wolfVotes2![w.id] = null;
        room.wolfLocked![w.id] = false;
      });
    } else {
      room.wolfVotes = room.wolfVotes || {};
      room.wolfVotes2 = room.wolfVotes2 || {};
      room.wolfLocked = room.wolfLocked || {};
    }

    const durationMs = Math.max(0, Math.floor(opts?.durationMs ?? getWolfTurnDurationMs(room)));

    room.wolfDeadline = Date.now() + durationMs;
    ctx.io.to(`wolves_${roomId}`).emit("wolfPhaseStarted", {
      wolves: wolves.map((w) => w.id),
      activeWolves: getActiveWolves(room),
      deadline: room.wolfDeadline,
      maxTargets: room.wolfBonusBiteThisNight ? 2 : 1,
      resetVotes: initializeVotes,
    });

    ctx.io.to(`wolves_${roomId}`).emit("wolfVotes2Updated", room.wolfVotes2);

    if (room.wolfTimer) {
      clearTimeout(room.wolfTimer);
      room.wolfTimer = null;
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
    const rules = ensureRoomGameRules(room);
    return clampNonWolfNightActionDurationSec(rules.nonWolfNightActionDurationSec) * 1000;
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
  }

  function startNightTurnFlow(roomId: string) {
    const room = ctx.rooms[roomId];
    if (!room) return;
    if (room.phase !== "night") return;

    const rules = ensureRoomGameRules(room);
    resetNightTurnState(room);
    room.nightTurnOrderSnapshot = getBaseNightActionOrder(room);

    if (rules.allNightActionsSimultaneous) {
      startWolfPhase(roomId, { initializeVotes: true, durationMs: getWolfTurnDurationMs(room) });
      ctx.io.to(roomId).emit("roomUpdated", toPublicRoom(room));
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

    if (room.wolfTimer) {
      clearTimeout(room.wolfTimer);
      room.wolfTimer = null;
    }

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

    emitWitchPendingDeath(roomId);

    const rules = ensureRoomGameRules(room);
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
