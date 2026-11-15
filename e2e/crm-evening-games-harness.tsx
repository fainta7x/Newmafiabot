import ReactDOM from 'react-dom/client';
import { EveningGamesView } from '../src/components/crm/EveningGamesView.tsx';
import './appStyles.ts';

// Owner, 2026-11-15: the «Игры» tab — one summary line instead of four tiles; the evening seating folds once a game exists.
const names = ['Богдан', 'Матроскина', 'Пристань', 'Вид', 'Диссонанс', 'Перец', 'Дина', 'Солнце', 'Крот', 'Шторм Длинноникович'];
const participants = names.map((nickname, i) => ({
  id: `ep-${i}`, evening_id: 'e1', player_id: `p${i}`, nickname, registration_status: 'going', response_status: 'going',
  attendance_status: 'attended', payment_status: 'unpaid', amount_due: 500, amount_paid: 0, created_at: '', updated_at: '',
}));
const evening = { id: 'e1', status: 'active', format: 'CASUAL', default_price: 500, title: 'Вечер', starts_at: '2026-11-13T17:00:00.000Z',
  tables: [{ id: 't1', name: 'Основной стол', capacity: 10, format: 'CASUAL', host_name: null }], participants };
const withGames = new URLSearchParams(window.location.search).get('games') !== '0';
const game = (id: number, status: 'draft' | 'completed') => ({
  id, evening_id: 'e1', evening_table_id: 't1', table_name: 'Основной стол', global_game_number: 100 + id, game_date: '2026-11-13',
  winner_team: status === 'completed' ? 'red' : '', winner_label: '', judge_name: 'Ольга', judge_player_id: 'judge-1', slots: [], status,
  club_protocol: { protocol: { winner_team: status === 'completed' ? 'red' : null }, player_results: [] }, created_at: '2026-11-13T18:00:00Z',
});
const games = withGames ? [game(2, 'draft'), game(1, 'completed')] : [];

globalThis.fetch = async (input: RequestInfo | URL) => {
  const raw = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
  const url = new URL(raw, window.location.origin);
  const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
  if (url.pathname === '/api/games') return json(url.searchParams.get('archived') ? (withGames ? [{ ...game(9, 'completed'), archived_at: '2026-11-13' }] : []) : games);
  if (url.pathname === '/api/evenings/e1') return json(evening);
  if (url.pathname.endsWith('/slots')) return json({ slots: [1, 2, 3, 4].map((n) => ({ id: `s${n}`, slot_number: n, status: 'open' })) });
  if (url.pathname.endsWith('/seating')) return json({ seats: names.map((_, i) => ({ id: `b${i}`, slot_id: 's3', game: 3, tableId: 't1', seat: i + 1, playerId: `p${i}`, nickname: names[i], locked: 0, started: 0 })) });
  return json({});
};

ReactDOM.createRoot(document.getElementById('root')!).render(<EveningGamesView eveningId="e1" />);
