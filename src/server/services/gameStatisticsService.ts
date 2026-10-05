import type { StatGame, StatRole } from '../../lib/gameStatistics.ts';
import { normalizeRole, normalizeWinner } from './clubGameAnalyticsService.ts';
import { sanitizeLiveGameEvents } from '../../shared/liveGameEvents.ts';

/**
 * Finished games with their chronology, in the shape the statistics read (`src/lib/gameStatistics.ts`): club evening
 * games keep the events inside the protocol, tournament games next to it. Games saved before the chronology shipped
 * have none and are counted only in the total.
 */

const parse = (value: unknown): any => {
  if (typeof value !== 'string' || !value.trim()) return null;
  try { return JSON.parse(value); } catch { return null; }
};

export async function loadStatGames(db: any, options: { sinceMs?: number | null } = {}): Promise<StatGame[]> {
  const games: StatGame[] = [];

  const clubRows = await db.all(`
    SELECT g.id, g.created_at, g.game_date, g.protocol_text, e.starts_at AS evening_date
      FROM games g LEFT JOIN game_evenings e ON e.id = g.evening_id
     WHERE g.evening_id IS NOT NULL AND g.archived_at IS NULL AND g.protocol_text IS NOT NULL
  `).catch(() => []);
  for (const row of clubRows) {
    const payload = parse(row.protocol_text);
    if (!payload || payload.kind !== 'club_evening_protocol' || payload.protocol?.status !== 'completed' || !Array.isArray(payload.player_results)) continue;
    const date = new Date(String(row.created_at || row.game_date || row.evening_date || ''));
    if (!Number.isFinite(date.getTime())) continue;
    if (options.sinceMs && date.getTime() < options.sinceMs) continue;
    games.push({
      id: `club:${row.id}`,
      source: 'club',
      date: date.toISOString(),
      winner: normalizeWinner(payload.protocol?.winner_team),
      seats: payload.player_results.map((result: any) => ({
        seat: Number(result.seat_number),
        role: normalizeRole(result.role) as StatRole | null,
        playerId: result.player_id ? String(result.player_id) : null,
      })),
      events: sanitizeLiveGameEvents(payload.protocol?.events),
    });
  }

  const tournamentRows = await db.all(`
    SELECT tg.id AS game_id, tg.completed_at, tg.winner_team, tgp.events_json
      FROM tournament_games tg JOIN tournament_game_protocols tgp ON tgp.game_id = tg.id
     WHERE tg.status = 'completed'
  `).catch(() => []);
  for (const row of tournamentRows) {
    const date = new Date(String(row.completed_at || ''));
    if (!Number.isFinite(date.getTime())) continue;
    if (options.sinceMs && date.getTime() < options.sinceMs) continue;
    const seats = await db.all(`
      SELECT tgs.seat_number, tgs.role, tp.player_id
        FROM tournament_game_seats tgs JOIN tournament_participants tp ON tp.id = tgs.participant_id
       WHERE tgs.game_id = ? ORDER BY tgs.seat_number
    `, [row.game_id]);
    games.push({
      id: `tournament:${row.game_id}`,
      source: 'tournament',
      date: date.toISOString(),
      winner: normalizeWinner(row.winner_team),
      seats: seats.map((seat: any) => ({
        seat: Number(seat.seat_number),
        role: normalizeRole(seat.role) as StatRole | null,
        playerId: seat.player_id ? String(seat.player_id) : null,
      })),
      events: sanitizeLiveGameEvents(parse(row.events_json)),
    });
  }

  return games.sort((a, b) => a.date.localeCompare(b.date));
}
