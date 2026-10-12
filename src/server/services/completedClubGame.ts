/** One shared completed-club-game read rule for seasonal snapshots and move statistics.
 * Never infer a result from a draft, an invalid protocol or an incomplete player-results array.
 */
export const isCompletedClubGamePayload = (payload: any): boolean =>
  Boolean(payload && payload.kind === 'club_evening_protocol' &&
    payload.protocol?.status === 'completed' && Array.isArray(payload.player_results));

/** Use the end of the game for seasonal inclusion. Older protocols lack completed_at;
 * those retain the same created_at/game_date/evening_date fallback as the statistics API.
 * Malformed dates are ignored, rather than making a game disappear from a valid season.
 */
export const completedClubGameDate = (
  payload: any,
  row: { created_at?: unknown; game_date?: unknown; evening_date?: unknown },
): string | null => {
  for (const candidate of [payload?.protocol?.completed_at, row.created_at, row.game_date, row.evening_date]) {
    if (!candidate) continue;
    const value = String(candidate);
    if (Number.isFinite(new Date(value).getTime())) return value;
  }
  return null;
};
