import type { DatabaseWrapper } from '../../db/index.ts';

export const REGULAR_TABLE_PLAYERS = 10;

const RESPONSE_GOING = new Set(['going', 'late']);

export async function loadEveningRecruitmentState(db: DatabaseWrapper, eveningId: string) {
  const evening = await db.get<any>(
    `SELECT id, title, starts_at, timezone, venue, format, status, settled_at
       FROM game_evenings
      WHERE id = ?
      LIMIT 1`,
    [eveningId],
  );
  if (!evening) return null;

  const participants = await db.all<any>(
    `SELECT ep.player_id, ep.response_status, ep.registration_status, p.nickname
       FROM evening_participants ep
       JOIN players p ON p.id = ep.player_id
      WHERE ep.evening_id = ?`,
    [eveningId],
  );

  const confirmed = participants.filter((row: any) => {
    const status = String(row.response_status || row.registration_status || '').trim();
    return RESPONSE_GOING.has(status);
  });
  const unanswered = participants.filter((row: any) => {
    const status = String(row.response_status || row.registration_status || '').trim();
    return !status || status === 'unanswered' || status === 'invited';
  });
  const thinking = participants.filter((row: any) => String(row.response_status || row.registration_status || '') === 'thinking');

  const confirmedCount = new Set(confirmed.map((row: any) => String(row.player_id))).size;
  const needed = Math.max(0, REGULAR_TABLE_PLAYERS - confirmedCount);

  return {
    evening,
    target_players: REGULAR_TABLE_PLAYERS,
    confirmed_players: confirmedCount,
    needed_players: needed,
    unanswered_players: unanswered.length,
    thinking_players: thinking.length,
    can_recruit: ['published', 'active'].includes(String(evening.status)) && !evening.settled_at && needed > 0,
  };
}
