import ReactDOM from 'react-dom/client';
import PlayerCabinetShell from '../src/components/player/PlayerCabinetShell.tsx';
import AppErrorBoundary from '../src/components/ui/AppErrorBoundary.tsx';
import type { PlayerMeResponse } from '../src/types/player.ts';
import '../src/index.css';
import '../src/styles/design-system.css';
import '../src/releasePolish.css';

const data: PlayerMeResponse = {
 player: { id: 'preview-player', nickname: 'Чагин', full_name: null, phone: null, telegram_username: null, elo: 1542, tokens: 100, game_level: 'experienced', club_role: 'organizer', judge_level: 'judge', avatar_url: null },
 achievements: { earned: 0, total: 0, percentage: 0, categories: [] },
 games: { all: [], stats: { totalGames: 24, completedGames: 24, wins: 14, losses: 10, winRate: 58.3, clubGames: 24, tournamentGames: 0, redGames: 16, blackGames: 8, bestMoves: 2, firstKilled: 3, zeroRoundVoted: 0, lastGameAt: null, roleCounts: { citizen: 12, sheriff: 4, mafia: 5, don: 3, unknown: 0 } } },
 tournaments: { games: [], awards: [], award_stats: { firstPlaces: 0, secondPlaces: 0, thirdPlaces: 0, nominations: 0 }, completed_participations: [] },
};
const next = new Date(Date.now() + 7 * 86400000).toISOString();
const evening = { id: 'preview-evening', title: 'Пятничный вечер клуба 2LA Noire', starts_at: next, venue: 'Суп с котом', format: 'CASUAL', status: 'published', default_price: 400 };
const eventSlots = [18, 19, 20, 21].map((hour, index) => ({ id: `slot-${index + 1}`, slot_number: index + 1, starts_at: new Date(new Date(next).setHours(hour, 0, 0, 0)).toISOString(), registered_count: [11, 9, 7, 4][index], selected: index < 2 }));
const calendarEvent = { ...evening, event_type: 'evening', assembled: true, assembled_slots: 1, required_slots: 4, price_per_game: 100, slots: eventSlots };
const paymentData = {
 summary: { amount_due: 400, amount_paid: 200, outstanding: 200, open: 1, closed: 2 },
 current: [{ participant_id: 'participant-preview', evening_id: evening.id, title: evening.title, starts_at: evening.starts_at, venue: evening.venue, evening_status: 'published', attendance_status: 'going', amount_due: 400, amount_paid: 200, outstanding: 200, payment_status: 'partial', updated_at: new Date().toISOString() }],
 history: [],
 free_evening_credits: 1,
 online_payment_available: false,
 online_payment: { available: false, provider: null, setup_required: true, purposes: [], token_packages: [], campaigns: [], recent_intents: [] },
};
const liveJourney = {
 phase: 'live',
 evening: { ...evening, starts_at: new Date().toISOString(), title: 'Игровой вечер 2LA Noire' },
 participation: { response_status: 'going', attendance_status: 'present', state: 'waiting', seat_number: null },
 score: { red: 2, black: 1, completed: 3, total_created: 4 },
 present_count: 14,
 current_game: { id: 4, game_key: 'preview-game-4', local_number: 4, global_number: 148, table_name: 'Главный стол', judge_name: 'Кавасаки', created_at: new Date().toISOString(), status: 'draft', winner_team: null, players: Array.from({ length: 10 }, (_, index) => ({ seat_number: index + 1, player_id: `player-${index + 1}`, nickname: ['Насон', 'Камсчастман', 'Кавасаки', 'Пристань', 'Знак', 'Чагин', 'Карагора', 'Дина', 'Гриня', 'Матроскина'][index] })) },
 recent_results: [
  { id: 3, game_key: 'preview-game-3', local_number: 3, winner_team: 'red', table_name: 'Главный стол', judge_name: 'Кавасаки', self_played: true, self_won: true },
  { id: 2, game_key: 'preview-game-2', local_number: 2, winner_team: 'black', table_name: 'Главный стол', judge_name: 'Кавасаки', self_played: false, self_won: null },
 ],
 latest_self_game: { game_key: 'preview-game-3', local_number: 3, won: true },
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
globalThis.fetch = async (input: RequestInfo | URL) => {
 const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, location.origin);
 switch (url.pathname) {
  case '/api/player/me': return json(data);
  case '/api/player/evenings': return json({ evenings: [evening] });
  case '/api/player/calendar': return json({ events: [calendarEvent] });
  case '/api/player/payments': return json(paymentData);
  case '/api/rating': return json({ players: [{ player_id: data.player.id, nickname: data.player.nickname, elo: 1542, place: 4 }] });
  case '/api/player/judging': return json({ player: { judge_level: 'judge', judge_level_label: 'Судья' }, club_games: [], tournament_games: [] });
  case '/api/player/evening-journey': return json({ journey: new URLSearchParams(location.search).get('scenario') === 'live' ? liveJourney : { phase: 'idle' } });
  case '/api/player/notifications': return json({ items: [], unread_count: 0 });
  case '/api/player/games/all': return json({ games: [] });
  case '/api/player/games/elo': return json({ games: [] });
  case '/api/player/players': return json({ players: [] });
  default: return json({ error: 'Этот сценарий пока не подготовлен в предпросмотре' }, 404);
 }
};
ReactDOM.createRoot(document.getElementById('root')!).render(<AppErrorBoundary><PlayerCabinetShell data={data} canOpenAdmin onOpenAdmin={() => { location.href = './crm-evening-roster.html'; }} /></AppErrorBoundary>);
