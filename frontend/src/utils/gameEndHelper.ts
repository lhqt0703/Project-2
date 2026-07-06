export interface GameEndRoles {
  villagerRole: string | null;
  wolfRole: string | null;
}

export function getVillagerAndWolfRoles(
  winner: string | undefined | null,
  scoreResult: any,
  players: any[] | undefined | null,
  deadPlayers: string[] | undefined | null,
  revealedRoles: Record<string, string> | undefined | null
): GameEndRoles {
  let villagerRole: string | null = null;
  let wolfRole: string | null = null;

  const safePlayers = players || [];
  const safeDeadPlayers = deadPlayers || [];
  const safeRevealedRoles = revealedRoles || {};

  // 1. Tìm vai trò phe Dân còn sống cuối cùng (ưu tiên điểm cao nhất trong bảng điểm)
  if (scoreResult && Array.isArray(scoreResult.ranking)) {
    const ranking: any[] = scoreResult.ranking;
    // Lọc những người thuộc phe dân (team: "villagers") và còn sống (aliveAtEnd hoặc không nằm trong deadPlayers)
    const aliveVillagers = ranking.filter(
      (p) =>
        (p.aliveAtEnd === true || !safeDeadPlayers.includes(p.playerId)) &&
        p.team?.toLowerCase() === "villagers"
    );

    if (aliveVillagers.length > 0) {
      // Sắp xếp theo totalScore giảm dần
      aliveVillagers.sort((a, b) => (b.totalScore || 0) - (a.totalScore || 0));
      villagerRole = aliveVillagers[0].role || null;
    }
  }

  // Fallback nếu không dùng được scoreResult (hoặc không tìm thấy)
  if (!villagerRole) {
    const alivePlayers = safePlayers.filter((p) => !safeDeadPlayers.includes(p.id));
    // Tìm người phe dân đầu tiên còn sống
    const aliveVillagers = alivePlayers.filter((p) => {
      const role = (safeRevealedRoles[p.id] || "").toLowerCase();
      if (!role) return false;
      const isWolf = role.includes("sói") || role.includes("wolf") || role === "spirit_wolf";
      const isNeutral = role === "tay buôn" || role === "ariana" || role === "thiên sứ" || role === "angel";
      return !isWolf && !isNeutral;
    });

    if (aliveVillagers.length > 0) {
      const pId = aliveVillagers[0].id;
      villagerRole = safeRevealedRoles[pId] || null;
    }
  }

  // 2. Tìm vai trò con Sói còn lại (ưu tiên điểm cao nhất hoặc con sói đầu tiên)
  if (scoreResult && Array.isArray(scoreResult.ranking)) {
    const ranking: any[] = scoreResult.ranking;
    const wolves = ranking.filter((p) => p.team?.toLowerCase() === "wolves");
    if (wolves.length > 0) {
      wolves.sort((a, b) => (b.totalScore || 0) - (a.totalScore || 0));
      wolfRole = wolves[0].role || null;
    }
  }

  if (!wolfRole) {
    // Tìm con sói bất kỳ trong danh sách player (kể cả đã chết)
    const wolfPlayer = safePlayers.find((p) => {
      const role = (safeRevealedRoles[p.id] || "").toLowerCase();
      return role.includes("sói") || role.includes("wolf") || role === "spirit_wolf";
    });
    if (wolfPlayer) {
      wolfRole = safeRevealedRoles[wolfPlayer.id] || null;
    }
  }

  return { villagerRole, wolfRole };
}
