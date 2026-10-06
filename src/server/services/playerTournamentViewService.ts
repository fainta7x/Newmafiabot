import type { DatabaseWrapper } from '../../db/index.ts';
import { getFlexibleTournamentStandings } from './flexibleTournamentStandingsService.ts';
import { internalGetNominations } from '../routes/tournamentsRoutesBase.ts';

/**
 * What a player sees of any tournament, whether he plays it or not (owner, 2026-10-06): registration, roster, games with roles,
 * and — live, not only after publication — the table and the nominations. The organizer can close the table and nominations
 * for the players («Закрытие таблицы», usually for the last three games) and open them again.
 */

export type PlayerTournamentPhase = 'registration' | 'registration_closed' | 'live' | 'finished';

const phaseOf = (tournament: any): PlayerTournamentPhase => {
  if (tournament.status === 'completed') return 'finished';
  if (tournament.status === 'active' || tournament.status === 'correction') return 'live';
  return tournament.registration_closed_at ? 'registration_closed' : 'registration';
};

const round = (value: unknown) => Math.round(Number(value || 0) * 100) / 100;

/** Tournaments a player can open: published ones with registration, running ones and finished ones. */
export async function listPlayerTournaments(db: DatabaseWrapper, viewerId: string) {
  const rows = await db.all<any>(`
    SELECT t.id, t.title, t.date, t.venue, t.stage, t.status, t.published_at, t.registration_closed_at, t.player_capacity,
           (SELECT COUNT(*) FROM tournament_registrations r WHERE r.tournament_id = t.id AND r.status = 'confirmed') AS confirmed_count,
           (SELECT r.status FROM tournament_registrations r WHERE r.tournament_id = t.id AND r.player_id = ? LIMIT 1) AS my_registration,
           EXISTS(SELECT 1 FROM tournament_participants tp WHERE tp.tournament_id = t.id AND tp.player_id = ?) AS participated
      FROM tournaments t
     WHERE t.status IN ('active', 'correction', 'completed') OR (t.status = 'draft' AND t.published_at IS NOT NULL)
  `, [viewerId, viewerId]);
  const items = rows.map((row) => ({
    id: String(row.id),
    title: String(row.title || 'Турнир'),
    date: row.date || null,
    venue: row.venue || null,
    stage: row.stage || null,
    phase: phaseOf(row),
    capacity: Number(row.player_capacity || 10),
    confirmed_count: Number(row.confirmed_count || 0),
    my_registration: row.my_registration ? String(row.my_registration) : null,
    participated: Boolean(Number(row.participated)),
  }));
  const rank = (phase: PlayerTournamentPhase) => (phase === 'live' ? 0 : phase === 'finished' ? 2 : 1);
  const time = (value: string | null) => { const parsed = value ? Date.parse(value) : NaN; return Number.isFinite(parsed) ? parsed : 0; };
  items.sort((a, b) => rank(a.phase) - rank(b.phase) || (a.phase === 'finished' ? time(b.date) - time(a.date) : time(a.date) - time(b.date)));
  return items.slice(0, 60);
}

export async function loadPlayerTournamentView(db: DatabaseWrapper, tournamentId: string, viewerId: string) {
  const tournament = await db.get<any>(`
    SELECT t.*, jp.nickname AS judge_nickname, op.nickname AS organizer_nickname
      FROM tournaments t
      LEFT JOIN players jp ON jp.id = t.judge_player_id
      LEFT JOIN players op ON op.id = t.organizer_player_id
     WHERE t.id = ? LIMIT 1
  `, [tournamentId]);
  if (!tournament) return null;
  const phase = phaseOf(tournament);
  // A tournament that was never published and has not started is not for players yet.
  if (tournament.status === 'draft' && !tournament.published_at) return null;

  const participants = await db.all<any>(`
    SELECT tp.id, tp.player_id, tp.participant_number, COALESCE(p.nickname, tp.display_name) AS nickname
      FROM tournament_participants tp LEFT JOIN players p ON p.id = tp.player_id
     WHERE tp.tournament_id = ? ORDER BY tp.participant_number
  `, [tournamentId]);
  const registrations = await db.all<any>(`
    SELECT r.player_id, r.status, r.slot_number, r.queue_order, p.nickname
      FROM tournament_registrations r JOIN players p ON p.id = r.player_id
     WHERE r.tournament_id = ?
     ORDER BY CASE r.status WHEN 'confirmed' THEN 0 WHEN 'reserve' THEN 1 ELSE 2 END, r.slot_number, r.queue_order, r.registered_at
  `, [tournamentId]);
  const mine = registrations.find((item) => String(item.player_id) === viewerId) || null;
  const confirmed = registrations.filter((item) => item.status === 'confirmed');
  // The real roster once the games are made; before that, the confirmed registrations.
  const roster = participants.length
    ? participants.map((item) => ({ number: Number(item.participant_number), nickname: String(item.nickname || 'Участник'), is_me: String(item.player_id) === viewerId }))
    : confirmed.map((item, index) => ({ number: Number(item.slot_number || index + 1), nickname: String(item.nickname), is_me: String(item.player_id) === viewerId }));

  const games = await db.all<any>(`
    SELECT tg.id, tg.game_number, tg.status, tg.winner_team, tg.started_at, tg.completed_at, COALESCE(jp.nickname, tg.judge_name) AS judge
      FROM tournament_games tg LEFT JOIN players jp ON jp.id = tg.judge_player_id
     WHERE tg.tournament_id = ? ORDER BY tg.game_number
  `, [tournamentId]);
  const seatRows = games.length
    ? await db.all<any>(`
        SELECT gs.game_id, gs.seat_number, gs.role, tp.player_id, COALESCE(p.nickname, tp.display_name) AS nickname
          FROM tournament_game_seats gs
          JOIN tournament_participants tp ON tp.id = gs.participant_id
          LEFT JOIN players p ON p.id = tp.player_id
         WHERE gs.game_id IN (${games.map(() => '?').join(',')})
         ORDER BY gs.game_id, gs.seat_number
      `, games.map((game) => game.id))
    : [];
  const seatsByGame = new Map<string, any[]>();
  for (const seat of seatRows) {
    const list = seatsByGame.get(String(seat.game_id)) || [];
    list.push(seat);
    seatsByGame.set(String(seat.game_id), list);
  }
  const gameItems = games.map((game) => {
    const finished = game.status === 'completed';
    return {
      game_number: Number(game.game_number),
      status: String(game.status),
      winner_team: finished ? (game.winner_team || null) : null,
      judge: game.judge || null,
      // Roles open for everybody once the game is over; while it is being played they stay hidden.
      seats: (seatsByGame.get(String(game.id)) || []).map((seat) => ({
        seat: Number(seat.seat_number),
        nickname: String(seat.nickname || 'Участник'),
        role: finished ? (seat.role || null) : null,
        is_me: String(seat.player_id) === viewerId,
      })),
    };
  });

  const hidden = Boolean(tournament.standings_hidden_at);
  let standings: any[] | null = null;
  let nominations: any[] | null = null;
  let provisional = phase !== 'finished';
  if (!hidden && (phase === 'live' || phase === 'finished')) {
    try {
      const data = await getFlexibleTournamentStandings(db, tournamentId);
      standings = (data.standings || []).map((row: any) => ({
        place: Number(row.official_place || row.place || row.calculated_place || 0),
        nickname: String(row.display_name || 'Участник'),
        is_me: Boolean(row.player_id) && String(row.player_id) === viewerId,
        games_played: Number(row.games_played || 0),
        wins: Number(row.wins || 0),
        total_points: round(row.total_points),
        additional_total: round(row.additional_total),
      }));
    } catch { standings = []; }
    try {
      const data = await internalGetNominations(db, tournamentId);
      provisional = Boolean(data.provisional);
      nominations = (data.nominations || []).map((item: any) => {
        const winner = (item.candidates || []).find((candidate: any) => String(candidate.participant_id) === String(item.winner_participant_id)) || (item.candidates || [])[0] || null;
        return {
          category: String(item.category),
          title: String(item.title || item.category),
          has_tie: Boolean(item.has_tie),
          leader: winner ? { nickname: String(winner.display_name || 'Участник'), points: round(winner.nomination_points) } : null,
          candidates: (item.candidates || []).slice(0, 5).map((candidate: any) => ({ nickname: String(candidate.display_name || 'Участник'), points: round(candidate.nomination_points) })),
        };
      });
    } catch { nominations = []; }
  }

  return {
    tournament: {
      id: String(tournament.id),
      title: String(tournament.title || 'Турнир'),
      date: tournament.date || null,
      venue: tournament.venue || null,
      stage: tournament.stage || null,
      phase,
      judge: tournament.judge_nickname || tournament.chief_judge_name || null,
      organizer: tournament.organizer_nickname || null,
      entry_fee_rub: Number(tournament.entry_fee_rub || 0),
      prize_fund_rub: Number(tournament.prize_fund_rub || 0),
      games_planned: Number(tournament.game_count || games.length || 0),
      games_completed: games.filter((game) => game.status === 'completed').length,
    },
    registration: {
      capacity: Number(tournament.player_capacity || 10),
      confirmed_count: confirmed.length || participants.length,
      reserve_count: registrations.filter((item) => item.status === 'reserve').length,
      open: phase === 'registration',
      mine: mine ? { status: String(mine.status), slot: mine.slot_number ?? null } : null,
      participated: participants.some((item) => String(item.player_id) === viewerId),
    },
    roster,
    games: gameItems,
    table_hidden: hidden,
    provisional,
    standings,
    nominations,
  };
}
