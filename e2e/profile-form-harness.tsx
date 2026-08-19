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
  avatar_url: null,
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

  if (url.pathname === '/api/player/me' && String(init?.method || 'GET').toUpperCase() === 'PATCH') {
    const payload = JSON.parse(String(init?.body || '{}')) as Record<string, unknown>;
    return jsonResponse({ player: { ...INITIAL_PLAYER, ...payload } });
  }

  return jsonResponse({ error: `E2E route not mocked: ${url.pathname}` }, 404);
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <main className="min-h-screen bg-background px-3 py-3 text-foreground">
    <div className="mx-auto w-full max-w-[430px]">
      <PlayerProfileSettings player={INITIAL_PLAYER} onPlayerChange={() => {}} />
    </div>
  </main>,
);
