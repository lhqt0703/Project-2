import { isWolfRole } from "./roomState.js";

type RoleDealPlayer = {
  id: string;
};

export type PendingRoleAssignments = Record<string, string>;
export type PendingRoleBlocks = Record<string, string[]>;

function normalizeRoles(roles: string[]) {
  return roles.filter((role): role is string => typeof role === "string" && role.trim().length > 0);
}

function shuffle<T>(arr: T[]) {
  return arr.slice().sort(() => Math.random() - 0.5);
}

function isRoleBlocked(
  pendingRoleBlocks: PendingRoleBlocks | undefined,
  playerId: string,
  role: string,
) {
  return pendingRoleBlocks?.[playerId]?.includes(role) === true;
}

function assignRolesWithBlocks<T extends RoleDealPlayer>(
  participants: T[],
  roles: string[],
  pendingRoleBlocks: PendingRoleBlocks | undefined,
) {
  const roleCountsByPlayer = new Map<string, number>();
  for (const player of participants) {
    const blocked = new Set(pendingRoleBlocks?.[player.id] || []);
    roleCountsByPlayer.set(player.id, roles.filter((role) => !blocked.has(role)).length);
  }

  const orderedParticipants = shuffle(participants).sort(
    (a, b) => (roleCountsByPlayer.get(a.id) || 0) - (roleCountsByPlayer.get(b.id) || 0),
  );

  let steps = 0;
  const MAX_STEPS = 1000;

  function backtrack(index: number, remainingRoles: string[], assignedRoles: Record<string, string>): Record<string, string> | null {
    steps++;
    if (steps > MAX_STEPS) return null;

    if (index >= orderedParticipants.length) return assignedRoles;

    const player = orderedParticipants[index]!;
    const triedRoles = new Set<string>();
    for (const role of shuffle(remainingRoles)) {
      if (triedRoles.has(role)) continue;
      triedRoles.add(role);
      if (isRoleBlocked(pendingRoleBlocks, player.id, role)) continue;

      const roleIndex = remainingRoles.indexOf(role);
      if (roleIndex < 0) continue;

      const nextRemainingRoles = [...remainingRoles.slice(0, roleIndex), ...remainingRoles.slice(roleIndex + 1)];
      const nextAssignedRoles = { ...assignedRoles, [player.id]: role };
      const result = backtrack(index + 1, nextRemainingRoles, nextAssignedRoles);
      if (result) return result;
    }

    return null;
  }

  return backtrack(0, roles, {});
}

function pickAndAssignRolesWithBlocks<T extends RoleDealPlayer>(
  participants: T[],
  roles: string[],
  pendingRoleBlocks: PendingRoleBlocks | undefined,
  pickRemainingRoles: (remainingRoles: string[], remainingPlayerCount: number) => string[],
) {
  const playerCount = participants.length;
  if (playerCount <= 0) return {};

  for (let attempt = 0; attempt < 20; attempt++) {
    const pickedRoles = pickRemainingRoles(roles, playerCount).filter(
      (role): role is string => typeof role === "string" && role.trim().length > 0,
    );
    if (pickedRoles.length < playerCount) continue;

    const assignedRoles = assignRolesWithBlocks(participants, pickedRoles.slice(0, playerCount), pendingRoleBlocks);
    if (assignedRoles) return assignedRoles;
  }

  if (roles.length < playerCount) return null;
  return assignRolesWithBlocks(participants, roles, pendingRoleBlocks);
}

export function prunePendingRoleAssignments(
  pendingRoleAssignments: PendingRoleAssignments | undefined,
  roles: string[],
  participantIds: string[],
): PendingRoleAssignments {
  if (!pendingRoleAssignments) return {};

  const participantIdSet = new Set(participantIds);
  const roleCounts = new Map<string, number>();
  for (const role of normalizeRoles(roles)) {
    roleCounts.set(role, (roleCounts.get(role) || 0) + 1);
  }

  const nextAssignments: PendingRoleAssignments = {};
  for (const [playerId, role] of Object.entries(pendingRoleAssignments)) {
    if (!participantIdSet.has(playerId)) continue;
    if (typeof role !== "string" || role.trim().length === 0) continue;

    const remaining = roleCounts.get(role) || 0;
    if (remaining <= 0) continue;

    nextAssignments[playerId] = role;
    roleCounts.set(role, remaining - 1);
  }

  return nextAssignments;
}

export function prunePendingRoleBlocks(
  pendingRoleBlocks: PendingRoleBlocks | undefined,
  roles: string[],
  participantIds: string[],
  pendingRoleAssignments?: PendingRoleAssignments,
): PendingRoleBlocks {
  if (!pendingRoleBlocks) return {};

  const participantIdSet = new Set(participantIds);
  const roleSet = new Set(normalizeRoles(roles));
  const nextBlocks: PendingRoleBlocks = {};

  for (const [playerId, blockedRoles] of Object.entries(pendingRoleBlocks)) {
    if (!participantIdSet.has(playerId)) continue;
    if (!Array.isArray(blockedRoles)) continue;

    const uniqueRoles = Array.from(new Set(blockedRoles)).filter((role) => {
      if (typeof role !== "string" || role.trim().length === 0) return false;
      if (!roleSet.has(role)) return false;
      return pendingRoleAssignments?.[playerId] !== role;
    });

    if (uniqueRoles.length > 0) {
      nextBlocks[playerId] = uniqueRoles;
    }
  }

  return nextBlocks;
}

export function dealRolesWithPendingAssignments<T extends RoleDealPlayer>(
  participants: T[],
  roles: string[],
  pendingRoleAssignments: PendingRoleAssignments | undefined,
  pendingRoleBlocks: PendingRoleBlocks | undefined,
  pickRemainingRoles: (remainingRoles: string[], remainingPlayerCount: number) => string[],
  playerRoleHistory?: Record<string, string[]>,
): {
  playerRoles: Record<string, string>;
  appliedAssignments: PendingRoleAssignments;
  updatedPlayerRoleHistory?: Record<string, string[]>;
} | null {
  const remainingRoles = normalizeRoles(roles);
  const appliedAssignments: PendingRoleAssignments = {};

  for (const player of participants) {
    const pendingRole = pendingRoleAssignments?.[player.id];
    if (typeof pendingRole !== "string" || pendingRole.trim().length === 0) continue;

    const roleIndex = remainingRoles.indexOf(pendingRole);
    if (roleIndex < 0) continue;

    appliedAssignments[player.id] = pendingRole;
    remainingRoles.splice(roleIndex, 1);
  }

  const unassignedParticipants = participants.filter((player) => !appliedAssignments[player.id]);

  let updatedHistory = playerRoleHistory ? { ...playerRoleHistory } : undefined;

  if (updatedHistory) {
    for (const player of unassignedParticipants) {
      const history = updatedHistory[player.id] || [];
      if (history.length > 0) {
        const hasUnplayedRole = remainingRoles.some((role) => !history.includes(role));
        if (!hasUnplayedRole) {
          delete updatedHistory[player.id];
        }
      }
    }
  }

  const getEffectiveBlocks = (historyRecord: Record<string, string[]> | undefined) => {
    const blocks: Record<string, string[]> = {};
    if (pendingRoleBlocks) {
      for (const [playerId, blocked] of Object.entries(pendingRoleBlocks)) {
        blocks[playerId] = [...blocked];
      }
    }
    if (historyRecord) {
      for (const [playerId, history] of Object.entries(historyRecord)) {
        blocks[playerId] = Array.from(new Set([...(blocks[playerId] || []), ...history]));
      }
    }
    return blocks;
  };

  let effectiveBlocks = getEffectiveBlocks(updatedHistory);

  let assignedRemainingRoles = pickAndAssignRolesWithBlocks(
    unassignedParticipants,
    remainingRoles,
    effectiveBlocks,
    pickRemainingRoles,
  );

  if (!assignedRemainingRoles && updatedHistory) {
    for (const player of unassignedParticipants) {
      if (updatedHistory[player.id]) {
        delete updatedHistory[player.id];
      }
    }
    effectiveBlocks = getEffectiveBlocks(updatedHistory);
    assignedRemainingRoles = pickAndAssignRolesWithBlocks(
      unassignedParticipants,
      remainingRoles,
      effectiveBlocks,
      pickRemainingRoles,
    );
  }

  if (!assignedRemainingRoles) {
    return null;
  }

  const playerRoles: Record<string, string> = { ...appliedAssignments, ...assignedRemainingRoles };

  if (updatedHistory) {
    for (const player of participants) {
      const assignedRole = playerRoles[player.id];
      if (assignedRole) {
        let list = updatedHistory[player.id];
        if (!list) {
          list = [];
          updatedHistory[player.id] = list;
        }
        if (!list.includes(assignedRole)) {
          list.push(assignedRole);
        }
      }
    }
  }

  return {
    playerRoles,
    appliedAssignments,
    ...(updatedHistory ? { updatedPlayerRoleHistory: updatedHistory } : {}),
  };
}

const HIGH_PRIORITY_ROLES = new Set(["Tiên tri", "Bảo vệ", "Phù thủy"]);

export function pickRolesForParticipants(allRoles: string[], participantCount: number): string[] {
  const normalizedRoles = allRoles.filter((role): role is string => typeof role === "string" && role.trim().length > 0);
  if (normalizedRoles.length <= participantCount) {
    return shuffle(normalizedRoles);
  }

  const selectedRoles: string[] = [];
  const pool = shuffle(normalizedRoles);

  // 1. Ensure "Ác Quỷ" (Demon) is picked first if it exists in the pool (mandatory for diet_quy mode)
  const demonIndex = pool.indexOf("Ác Quỷ");
  if (demonIndex >= 0) {
    selectedRoles.push(pool[demonIndex]!);
    pool.splice(demonIndex, 1);
  } else {
    // Otherwise, ensure at least one wolf role is picked (if any exists)
    const firstWolfIndex = pool.findIndex(isWolfRole);
    if (firstWolfIndex >= 0) {
      selectedRoles.push(pool[firstWolfIndex]!);
      pool.splice(firstWolfIndex, 1);
    }
  }

  // 2. Ensure each high priority role is picked (if any exists in pool)
  const highPriorityList = shuffle(Array.from(HIGH_PRIORITY_ROLES));
  for (const highRole of highPriorityList) {
    if (selectedRoles.length >= participantCount) break;
    const index = pool.findIndex((r) => r === highRole);
    if (index >= 0) {
      selectedRoles.push(pool[index]!);
      pool.splice(index, 1);
    }
  }

  // 3. Fill the rest of the participant count with the remaining roles in pool
  // Keep elemental roles ("nguyên tố") at the lowest priority
  const sortedPool = [
    ...pool.filter((r) => !r.includes("nguyên tố")),
    ...pool.filter((r) => r.includes("nguyên tố"))
  ];

  while (selectedRoles.length < participantCount && sortedPool.length > 0) {
    selectedRoles.push(sortedPool.shift()!);
  }

  return shuffle(selectedRoles);
}
