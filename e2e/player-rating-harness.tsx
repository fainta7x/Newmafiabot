import ReactDOM from 'react-dom/client';
import PlayerRatingTable from '../src/components/player/PlayerRatingTable.tsx';
import '../src/index.css';
import '../src/styles/design-system.css';
import '../src/releasePolish.css';

const PLAYERS = [
  { place: 1, player_id: 'p3', nickname: 'Матроскина', elo: 1724, avatar_url: null },
  { place: 2, player_id: 'p2', nickname: 'Богданчик', elo: 1688, avatar_url: null },
  { place: 3, player_id: 'p4', nickname: 'Денди', elo: 1651, avatar_url: null },
  { place: 4, player_id: 'p1', nickname: 'Чагин', elo: 1542, avatar_url: null },
  { place: 5, player_id: 'p6', nickname: 'Пристань', elo: 1508, avatar_url: null },
  { place: 6, player_id: 'p5', nickname: 'Вид', elo: 1498, avatar_url: null },
];

const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json' },
});

globalThis.fetch = async (input: RequestInfo | URL) => {
  const raw = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
  const url = new URL(raw, window.location.origin);
  if (url.pathname === '/api/rating') return jsonResponse({ players: PLAYERS });
  return jsonResponse({ error: 'E2E route not mocked' }, 404);
};

ReactDOM.createRoot(document.getElementById('root')!).render(<PlayerRatingTable playerId="p1" />);
