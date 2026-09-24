import type { DatabaseWrapper } from '../../db/index.ts';
import { normalizeEveningFormat, type EveningFormat } from '../../lib/eveningFormat.ts';

/**
 * Staff work on a player profile (user-approved 2026-09-24):
 * - judging is shown openly, but only to players who judged at least one game;
 * - organizing is shown only on profiles of organizers (club role «Организатор»);
 * - both are split by kind: novice, club, rating and tournament.
 */
export type StaffBreakdown = { total: number; by_format: Array<{ format: EveningFormat; label: string; count: number }> };
export type PlayerStaffStats = { judged: StaffBreakdown | null; organized: StaffBreakdown | null };

export const STAFF_FORMAT_LABELS: Record<EveningFormat, string> = {
  NOVICE: 'новичковых',
  CASUAL: 'клубных',
  RATING: 'рейтинговых',
  TOURNAMENT: 'турнирных',
};
const ORDER: EveningFormat[] = ['CASUAL', 'NOVICE', 'RATING', 'TOURNAMENT'];

const breakdown = (counts: Map<EveningFormat, number>): StaffBreakdown => ({
  total: [...counts.values()].reduce((sum, value) => sum + value, 0),
  by_format: ORDER.filter((format) => (counts.get(format) || 0) > 0)
    .map((format) => ({ format, label: STAFF_FORMAT_LABELS[format], count: counts.get(format) || 0 })),
});

const parse = (value: unknown) => {
  try { return JSON.parse(String(value || '')); } catch { return null; }
};

async function tableNames(db: DatabaseWrapper) {
  return new Set((await db.all<any>("SELECT name FROM sqlite_master WHERE type = 'table'")).map((row: any) => String(row.name)));
}

/** Same games as the «judged» achievements: completed club protocols and completed tournament games. */
async function judgedByFormat(db: DatabaseWrapper, playerId: string, tables: Set<string>) {
  const counts = new Map<EveningFormat, number>();
  const bump = (format: EveningFormat) => counts.set(format, (counts.get(format) || 0) + 1);
  const clubGames = await db.all<any>(`
    SELECT g.protocol_text, e.format
      FROM games g LEFT JOIN game_evenings e ON e.id = g.evening_id
     WHERE g.judge_player_id = ? AND g.archived_at IS NULL AND (e.status IS NULL OR e.status != 'cancelled')`, [playerId]);
  for (const game of clubGames) {
    const payload = parse(game.protocol_text);
    if (payload?.kind === 'club_evening_protocol' && payload.protocol?.status === 'completed') bump(normalizeEveningFormat(game.format));
  }
  if (tables.has('tournament_games') && tables.has('tournament_game_protocols')) {
    const judge = (await db.all<any>('PRAGMA table_info(tournaments)')).some((column: any) => column.name === 'judge_player_id')
      ? 'COALESCE(tg.judge_player_id, t.judge_player_id)' : 'tg.judge_player_id';
    const row = await db.get<any>(`
      SELECT COUNT(DISTINCT tg.id) AS count
        FROM tournament_games tg
        JOIN tournament_game_protocols tgp ON tgp.game_id = tg.id
        JOIN tournaments t ON t.id = tg.tournament_id
       WHERE ${judge} = ? AND tg.status = 'completed' AND tgp.status = 'completed'`, [playerId]);
    const count = Number(row?.count || 0);
    if (count) counts.set('TOURNAMENT', (counts.get('TOURNAMENT') || 0) + count);
  }
  return counts;
}

async function organizedByFormat(db: DatabaseWrapper, playerId: string, tables: Set<string>) {
  const counts = new Map<EveningFormat, number>();
  if (!tables.has('evening_staff_assignments')) return counts;
  const rows = await db.all<any>(`
    SELECT e.format, COUNT(*) AS count
      FROM evening_staff_assignments s JOIN game_evenings e ON e.id = s.evening_id
     WHERE s.organizer_player_id = ? AND (e.status = 'completed' OR e.settled_at IS NOT NULL)
     GROUP BY e.format`, [playerId]);
  for (const row of rows) {
    const format = normalizeEveningFormat(row.format);
    counts.set(format, (counts.get(format) || 0) + Number(row.count || 0));
  }
  return counts;
}

export async function loadPlayerStaffStats(db: DatabaseWrapper, playerId: string): Promise<PlayerStaffStats> {
  const tables = await tableNames(db);
  const player = await db.get<any>('SELECT club_role FROM players WHERE id = ? LIMIT 1', [playerId]);
  const judged = breakdown(await judgedByFormat(db, playerId, tables));
  const isOrganizer = String(player?.club_role || '') === 'organizer';
  return {
    judged: judged.total > 0 ? judged : null,
    organized: isOrganizer ? breakdown(await organizedByFormat(db, playerId, tables)) : null,
  };
}
