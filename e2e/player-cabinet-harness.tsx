import { clubStoriesFixture } from './club-connection-stories.fixture.ts';
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
 summary: { amount_due: 400, amount_paid: 200, outstanding: 200, historical_debt: 200, open: 1, closed: 2 },
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
const profileSummary = {
 player: { id: data.player.id, nickname: data.player.nickname, avatar_url: null, elo: 1542 },
 stats: { games: 24, wins: 14, win_rate: 58, current_streak: 2, best_streak: 5, red: { games: 16, wins: 10, win_rate: 63 }, black: { games: 8, wins: 4, win_rate: 50 }, first_killed: 3, best_moves: 2, zero_round_voted: 0 },
 season: { label: 'Осень 2026', games: 9, wins: 6, win_rate: 67, place: 3, total_players: 21 },
 recent_games: [],
};
const NAMES = ['Насон', 'Кавасаки', 'Пристань', 'Знак', 'Чагин', 'Карагора', 'Дина', 'Гриня', 'Матроскина', 'Камсчастман'];
const rankingRows = NAMES.map((nickname, index) => ({ place: index + 1, player_id: nickname === 'Чагин' ? data.player.id : `p-${index}`, nickname, avatar_url: null, games: 12 - index, wins: 9 - Math.floor(index / 2), win_rate: 75 - index * 3 }));
const season = (key: string, label: string) => ({ key, label, games: 48, players: 21, ranking: rankingRows, viewer: { games: 9, wins: 6, win_rate: 67, place: 5 }, champion: rankingRows[0] });
const clubWorld = {
 viewer_id: data.player.id,
 season: season('2026-autumn', 'Осень 2026'),
 season_records: [{ label: 'Побед подряд', value: 6, player_id: 'p-0', nickname: 'Насон', avatar_url: null }, { label: 'Винрейт', value: 81, player_id: 'p-1', nickname: 'Кавасаки', avatar_url: null }],
 season_history: [season('2026-summer', 'Лето 2026'), season('2026-spring', 'Весна 2026')],
 hall_of_fame: [],
};
const pulse = {
 viewer_id: data.player.id,
 highlights: [{ player_id: 'p-0', nickname: 'Насон', avatar_url: '', type: 'win_streak', text: '4 победы подряд' }],
 power_ranking: rankingRows.map((row) => ({ ...row, avatar_url: '', streak: row.place === 1 ? 4 : 0, score: 90 - row.place * 4, movement: row.place % 3 === 0 ? -1 : 1 })),
 players_with_form: 10,
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
globalThis.fetch = async (input: RequestInfo | URL) => {
 const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, location.origin);
 if (url.pathname.endsWith('/summary') && url.pathname.startsWith('/api/player/profiles/')) return json(profileSummary);
 if (url.pathname.endsWith('/birthday')) return json({});
 if (url.pathname.endsWith('/showcase')) return json({ awards: [], pinned_awards: [], history: [] });
 switch (url.pathname) {
  case '/api/player/news': return json({ news: [{ id: 'news-1', published_at: new Date().toISOString(), text: 'В пятницу встречаемся за игровым столом. Выберите удобные игры заранее — это поможет собрать состав и начать вовремя.' }] });
  case '/api/player/novice': return json({ player: { club_stage: 'CLUB', game_level: 'club' }, applications: [], free_visits_remaining: 0, can_self_register: true });
  case '/api/player/profile-completeness': return json({ completeness: { percentage: 100, complete: true, missing_fields: [], important_missing_fields: [], next_missing_field: null, fields: {} } });
  case '/api/player/music-library/player-slots': return json({ slots: [{ slot: 1, entry: null }, { slot: 2, entry: null }] });
  case '/api/player/profile-settings': return json({ player: data.player });
  case '/api/player/notification-preferences': return json({ preferred_channel: 'auto', personal_enabled: true, available_channels: ['telegram'], effective_channel: 'telegram' });
  case '/api/player/privacy-settings': return json({ visibility: { real_name: false, birthday_day_month: true, birth_year: false, telegram_username: false, phone: false, game_statistics: true, connections: true } });
  case '/api/player/rating-periods': return json({ active_periods: [], completed_periods: [] });
  case '/api/player/tournaments': return json({ tournaments: [] });
  case '/api/player/relationships': return json({ club_stories: clubStoriesFixture, rivals: rankingRows.slice(0,3).map(r => ({ ...r, avatar_url: '' })), teammates: rankingRows.slice(3,6).map(r => ({ ...r, avatar_url: '' })), club_duos: { red: [{ a_id: 'p1', b_id: 'p2', a_name: 'Александра с длинным никнеймом', b_name: 'Богданчик', team: 'red', games: 12, wins: 8, win_rate: 67, a_avatar_url: '', b_avatar_url: '' }], black: [] }, club_most_played: { red: [{ a_id: 'p3', b_id: 'p4', a_name: 'Чагин', b_name: 'Ночной игрок', team: 'red', games: 20, wins: 11, win_rate: 55, a_avatar_url: '', b_avatar_url: '' }], black: [] }, club_first_games: { red: [], black: [{ a_id: 'p5', b_id: 'p6', a_name: 'Новая пара', b_name: 'Второй игрок', team: 'black', games: 1, wins: 1, win_rate: 100, a_avatar_url: '', b_avatar_url: '' }] }, recent_event: { title: 'Клубный вечер 2 октября', date: '2026-10-02T18:00:00Z', teammates: rankingRows.slice(0,3).map(r => ({ ...r, avatar_url: '' })), rivals: rankingRows.slice(3,6).map(r => ({ ...r, avatar_url: '' })) } });
  case '/api/player/evening-summaries': return json({ summaries: [{ id: 'past-1', title: 'Вечер клуба — итоги', starts_at: new Date(Date.now()-86400000).toISOString(), settled_at: next, venue: 'Суп с котом', games: 4, red_wins: 3, black_wins: 1, score: '3:1', player: { games: 3, wins: 2, losses: 1, win_rate: 67, elo_before: 1520, elo_after: 1542, elo_delta: 22, roles: ['citizen','sheriff'] }, best_elo_rise: null, most_games: null, awards: [], facts: ['Красные выиграли три игры'], game_ids: [] }] });
  case '/api/player/me': return json(data);
  case '/api/player/evenings': return json({ evenings: [evening] });
  case '/api/player/calendar': return json({ events: [calendarEvent] });
  case '/api/player/economy': return json({ balance: 100, shop_items: [{ id: 'item-1', name: 'Игровая привилегия', description: 'Пример доступного клубного предложения', price: 50, icon: '◇', item_type: 'service' }], purchases: [], ledger: { items: [], total: 0 } });
  case '/api/player/bets': return json({ balance: 100, active: null, blocked: null, history: [], club_stats: { games: 0, black_wins: 0, red_wins: 0, black_win_rate: null, red_win_rate: null } });
  case '/api/player/payments': return json(paymentData);
  case '/api/rating': return json({ players: NAMES.map((nickname,index) => ({ player_id: nickname === 'Чагин' ? data.player.id : `p-${index}`, nickname, elo: 1600-index*20, place: index+1 })) });
  case '/api/player/judging': return json({ player: { judge_level: 'judge', judge_level_label: 'Судья' }, club_games: [], tournament_games: [] });
  case '/api/player/evening-journey': return json({ journey: new URLSearchParams(location.search).get('scenario') === 'live' ? liveJourney : { phase: 'idle' } });
  case '/api/player/evening-live-status': return json({ live: new URLSearchParams(location.search).get('scenario') === 'live' });
  case '/api/player/notifications': return json({ items: [], unread_count: 0 });
  case '/api/player/games/all': return json({ games: [1,2,3].map(number => ({ id: `club:g${number}`, source: 'club', title: 'Клубный вечер', date: new Date(Date.now()-86400000).toISOString(), game_number: number, format: 'CASUAL', winner_team: number===2 ? 'black' : 'red', judge_name: 'Кавасаки' })) });
  case '/api/player/games/elo': return json({ games: [] });
  case '/api/player/players': return json({ players: NAMES.map((nickname,index) => ({ id: nickname === 'Чагин' ? data.player.id : `p-${index}`, nickname, elo: 1600-index*20, game_level: 'club', avatar_url: null })) });
  case '/api/player/pulse': return json(pulse);
  case '/api/player/club-world': return json(clubWorld);
  case '/api/player/stories': return json({ viewer_id: data.player.id, evenings: [], recent_games: [], latest_evening: null });
  default: return json({ error: 'Этот сценарий пока не подготовлен в предпросмотре' }, 404);
 }
};
ReactDOM.createRoot(document.getElementById('root')!).render(<AppErrorBoundary><PlayerCabinetShell data={data} canOpenAdmin onOpenAdmin={() => { location.href = './crm-evening-roster.html'; }} /></AppErrorBoundary>);
