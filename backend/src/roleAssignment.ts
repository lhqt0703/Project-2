type RoleDealPlayer = {
  id: string;
};

export type PendingRoleAssignments = Record<string, string>;

function normalizeRoles(roles: string[]) {
  return roles.filter((role): role is string => typeof role === "string" && role.trim().length > 0);
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

export function dealRolesWithPendingAssignments<T extends RoleDealPlayer>(
  participants: T[],
  roles: string[],
  pendingRoleAssignments: PendingRoleAssignments | undefined,
  pickRemainingRoles: (remainingRoles: string[], remainingPlayerCount: number) => string[],
): { playerRoles: Record<string, string>; appliedAssignments: PendingRoleAssignments } | null {
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
  const pickedRoles = pickRemainingRoles(remainingRoles, unassignedParticipants.length).filter(
    (role): role is string => typeof role === "string" && role.trim().length > 0,
  );

  if (pickedRoles.length < unassignedParticipants.length) {
    return null;
  }

  const playerRoles: Record<string, string> = { ...appliedAssignments };
  unassignedParticipants.forEach((player, index) => {
    playerRoles[player.id] = pickedRoles[index]!;
  });

  return { playerRoles, appliedAssignments };
}
