import ReactDOM from 'react-dom/client';
import PlayerProfileSettings from '../src/components/player/PlayerProfileSettings.tsx';
import '../src/index.css';
import '../src/styles/design-system.css';
import '../src/releasePolish.css';

type ProfilePlayer = Parameters<typeof PlayerProfileSettings>[0]['player'];

const INITIAL_PLAYER = {
  id: 'p1',
  nickname: 'Чагин',
  full_name: 'Евгений Чагин',
  phone: '+7 900 000-00-00',
  telegram_username: 'mafiatulasport',
  avatar_url: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="96" height="96"%3E%3Crect width="96" height="96" rx="18" fill="%23262a33"/%3E%3Ctext x="48" y="58" text-anchor="middle" font-size="34" fill="white"%3EЧ%3C/text%3E%3C/svg%3E',
  game_level: 'club',
  club_role: 'guest',
  tokens: 42,
} as unknown as ProfilePlayer;

const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json' },
});

globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const raw = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
  const url = new URL(raw, window.location.origin);
  const method = String(init?.method || 'GET').toUpperCase();

  if (url.pathname === '/api/player/profile-settings') {
    return jsonResponse({ player: INITIAL_PLAYER });
  }

  if (url.pathname === '/api/player/judging') {
    return jsonResponse({
      player: { id: 'p1', nickname: 'Чагин', judge_level: 'none', judge_level_label: 'Без судейского уровня' },
      permissions: { novice: false, casual: false, rating: false, tournament: false },
      club_games: [],
      tournament_games: [],
    });
  }

  if (url.pathname === '/api/player/me' && method === 'PATCH') {
    const payload = JSON.parse(String(init?.body || '{}')) as Record<string, unknown>;
    return jsonResponse({ player: { ...INITIAL_PLAYER, ...payload } });
  }

  if (url.pathname === '/api/player/me/avatar' && method === 'DELETE') {
    return jsonResponse({ ok: true });
  }

  return jsonResponse({ error: `E2E route not mocked: ${method} ${url.pathname}` }, 404);
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <main className="min-h-screen bg-background px-3 py-3 text-foreground">
    <div className="mx-auto w-full max-w-[430px]">
      <PlayerProfileSettings player={INITIAL_PLAYER} onPlayerChange={() => {}} />
    </div>
  </main>,
);
