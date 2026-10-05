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

export async function loadStatGames(db: any, options: { sinceMs?: number | null; untilMs?: number | null; limit?: number } = {}): Promise<StatGame[]> {
  const games: StatGame[] = [];
  const since = new Date(options.sinceMs ?? 0).toISOString();
  const until = new Date(options.untilMs ?? Date.parse('9999-12-31')).toISOString();
  const limit = options.limit ? Math.max(1, Math.min(2000, Math.trunc(options.limit))) : null;

  const clubRows = await db.all(`
    SELECT g.id, g.created_at, g.game_date, g.protocol_text, e.starts_at AS evening_date,
      COALESCE(NULLIF(json_extract(g.protocol_text,'$.protocol.completed_at'),''),g.created_at,g.game_date,e.starts_at) AS completed_at
      FROM games g LEFT JOIN game_evenings e ON e.id = g.evening_id
     WHERE g.evening_id IS NOT NULL AND g.archived_at IS NULL AND g.protocol_text IS NOT NULL
       AND CASE WHEN json_valid(g.protocol_text) THEN json_extract(g.protocol_text,'$.kind')='club_evening_protocol' AND json_extract(g.protocol_text,'$.protocol.status')='completed' AND json_type(g.protocol_text,'$.player_results')='array' ELSE 0 END
       AND julianday(COALESCE(NULLIF(json_extract(g.protocol_text,'$.protocol.completed_at'),''),g.created_at,g.game_date,e.starts_at))>=julianday(?)
       AND julianday(COALESCE(NULLIF(json_extract(g.protocol_text,'$.protocol.completed_at'),''),g.created_at,g.game_date,e.starts_at))<julianday(?)
       ORDER BY julianday(COALESCE(NULLIF(json_extract(g.protocol_text,'$.protocol.completed_at'),''),g.created_at,g.game_date,e.starts_at)) DESC,g.id DESC ${limit ? 'LIMIT ?' : ''}
  `, limit ? [since,until,limit] : [since,until]);
  for (const row of clubRows) {
    const payload = parse(row.protocol_text);
    if (!payload || payload.kind !== 'club_evening_protocol' || payload.protocol?.status !== 'completed' || !Array.isArray(payload.player_results)) continue;
    const date = new Date(String(row.completed_at || row.created_at || row.game_date || row.evening_date || ''));
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
    SELECT tg.id AS game_id, tg.completed_at, tg.winner_team, tgp.events_json,
      (SELECT json_group_array(json_object('seat_number',tgs.seat_number,'role',tgs.role,'player_id',tp.player_id)) FROM tournament_game_seats tgs JOIN tournament_participants tp ON tp.id=tgs.participant_id WHERE tgs.game_id=tg.id) seats_json
      FROM tournament_games tg JOIN tournament_game_protocols tgp ON tgp.game_id = tg.id
     WHERE tg.status = 'completed'
       AND julianday(tg.completed_at)>=julianday(?) AND julianday(tg.completed_at)<julianday(?)
       ORDER BY julianday(tg.completed_at) DESC,tg.id DESC ${limit ? 'LIMIT ?' : ''}
  `, limit ? [since,until,limit] : [since,until]);
  for (const row of tournamentRows) {
    const date = new Date(String(row.completed_at || ''));
    if (!Number.isFinite(date.getTime())) continue;
    if (options.sinceMs && date.getTime() < options.sinceMs) continue;
    const seats = (parse(row.seats_json) || []).sort((a: any,b: any) => a.seat_number-b.seat_number);
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

  const latest = games.sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
  return (limit ? latest.slice(0,limit) : latest).reverse();
}
