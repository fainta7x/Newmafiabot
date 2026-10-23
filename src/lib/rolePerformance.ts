/** Observed results only: every played role is eligible, with no minimum-game cut-off. */
export function rankRolePerformance<T extends { games: number; wins: number }>(roles: readonly T[], weakestFirst = false): T[] {
  return roles.filter(role => role.games > 0).sort((a, b) => {
    const difference = b.wins / b.games - a.wins / a.games;
    return (weakestFirst ? -difference : difference) || b.games - a.games;
  });
}
