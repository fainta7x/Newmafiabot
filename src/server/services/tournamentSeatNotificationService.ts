import type { DatabaseWrapper } from '../../db/index.ts';
import { queuePersonalNotification } from './personalNotificationRouterService.ts';

/**
 * Personal «where you sit» messages for tournament games (owner, 2026-10-03). Tournament and rating
 * games only. The first one goes out 30 minutes before the nominal start, the next ones right after
 * the previous game's result is posted. Each message is keyed by game and player, so a scan or a
 * retry never sends it twice, and a roster replacement or a regenerated seating (new game ids) still
 * reaches the people whose seat changed.
 */
export const TOURNAMENT_FIRST_SEAT_MINUTES = 30;
const FIRST_SEAT_WINDOW_MS = 3 * 60 * 60 * 1000;

const timeLabel = (value: unknown) => {
  const time = new Date(String(value || '')).getTime();
  return Number.isFinite(time)
    ? new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' }).format(time)
    : '';
};

export async function queueTournamentGameSeatMessages(db: DatabaseWrapper, gameId: string, kind: 'first' | 'next') {
  const game = await db.get<any>(`
    SELECT g.id, g.tournament_id, g.game_number, g.status, t.title, t.date,
           (SELECT COUNT(*) FROM tournament_games o WHERE o.tournament_id = g.tournament_id) AS total
      FROM tournament_games g JOIN tournaments t ON t.id = g.tournament_id
     WHERE g.id = ? LIMIT 1
  `, [gameId]);
  // The next game may already have been opened by the judge before the worker's scan ran; a finished game never gets one.
  if (!game || game.status === 'completed' || (kind === 'first' && game.status !== 'planned')) return 0;
  const seats = await db.all<any>(`
    SELECT tgs.seat_number, tp.player_id
      FROM tournament_game_seats tgs JOIN tournament_participants tp ON tp.id = tgs.participant_id
     WHERE tgs.game_id = ? AND tp.player_id IS NOT NULL ORDER BY tgs.seat_number
  `, [gameId]);
  let queued = 0;
  for (const seat of seats) {
    const where = `ты сидишь на месте №${seat.seat_number}`;
    const text = kind === 'first'
      ? `🏆 «${game.title}» начинается${timeLabel(game.date) ? ` в ${timeLabel(game.date)}` : ''}. Игра №${game.game_number}: ${where}.`
      : `🏆 «${game.title}»: следующая игра №${game.game_number}${game.total ? ` из ${game.total}` : ''} — ${where}.`;
    const result = await queuePersonalNotification(db, {
      notificationKey: `tournament-seat:${gameId}:${seat.player_id}`,
      playerId: String(seat.player_id),
      eventType: 'tournament_game_seat',
      entityId: gameId,
      text,
      actionPath: `/player/events/${game.tournament_id}`,
    });
    if (result.created) queued += 1;
  }
  return queued;
}

/** Game 1 of tournaments that start within the next 30 minutes (and up to three hours after the nominal start). */
export async function runTournamentFirstSeatMessages(db: DatabaseWrapper, now = Date.now()) {
  const rows = await db.all<any>(`
    SELECT g.id FROM tournaments t JOIN tournament_games g ON g.tournament_id = t.id AND g.game_number = 1 AND g.status = 'planned'
     WHERE t.status IN ('draft', 'active')
       AND datetime(t.date) <= datetime(?) AND datetime(t.date) > datetime(?)
  `, [new Date(now + TOURNAMENT_FIRST_SEAT_MINUTES * 60_000).toISOString(), new Date(now - FIRST_SEAT_WINDOW_MS).toISOString()]).catch(() => []);
  let queued = 0;
  for (const row of rows) queued += await queueTournamentGameSeatMessages(db, String(row.id), 'first');
  return queued;
}

/**
 * The organizer's own «Разослать места игрокам» (owner, 2026-10-03): the seat messages of the next game to be
 * played (the first game that is not completed), right now, whatever the clock says. Keyed per game and player,
 * so pressing it twice never sends a message twice; after a regenerated seating the new games get new messages.
 */
export async function sendNextTournamentGameSeatMessages(db: DatabaseWrapper, tournamentId: string) {
  const game = await db.get<any>(
    "SELECT id, game_number FROM tournament_games WHERE tournament_id = ? AND status != 'completed' ORDER BY game_number ASC LIMIT 1",
    [tournamentId],
  );
  if (!game) return { game_number: null as number | null, queued: 0, players: 0 };
  const players = await db.get<any>(
    'SELECT COUNT(*) AS c FROM tournament_game_seats tgs JOIN tournament_participants tp ON tp.id = tgs.participant_id WHERE tgs.game_id = ? AND tp.player_id IS NOT NULL',
    [game.id],
  );
  const queued = await queueTournamentGameSeatMessages(db, String(game.id), Number(game.game_number) === 1 ? 'first' : 'next');
  return { game_number: Number(game.game_number), queued, players: Number(players?.c || 0) };
}
