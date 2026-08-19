import ReactDOM from 'react-dom/client';
import PlayerClubHub from '../src/components/player/PlayerClubHub.tsx';
import type { PlayerMeResponse } from '../src/types/player.ts';
import '../src/index.css';
import '../src/styles/design-system.css';
import '../src/releasePolish.css';

const PLAYERS = [
  { id: 'p1', nickname: 'Чагин', elo: 1542, game_level: 'club', avatar_url: null },
  { id: 'p2', nickname: 'Богданчик', elo: 1688, game_level: 'tournament', avatar_url: null },
  { id: 'p3', nickname: 'Матроскина', elo: 1724, game_level: 'tournament', avatar_url: null },
  { id: 'p4', nickname: 'Денди', elo: 1651, game_level: 'club', avatar_url: null },
  { id: 'p5', nickname: 'Вид', elo: 1498, game_level: 'club', avatar_url: null },
  { id: 'p6', nickname: 'Пристань', elo: 1604, game_level: 'novice', avatar_url: null },
];

const PROFILE = {
  player: PLAYERS[1],
  stats: {
    completedGames: 84,
    wins: 46,
    losses: 38,
    winRate: 55,
    clubGames: 62,
    tournamentGames: 22,
    redGames: 51,
    blackGames: 33,
    bestMoves: 7,
    firstKilled: 11,
    zeroRoundVoted: 4,
  },
  tournament_awards: {
    firstPlaces: 2,
    secondPlaces: 3,
    thirdPlaces: 1,
    nominations: 9,
  },
};

const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json' },
});

globalThis.fetch = async (input: RequestInfo | URL) => {
  const raw = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
  const url = new URL(raw, window.location.origin);

  if (url.pathname === '/api/player/players') {
    return jsonResponse({ players: PLAYERS });
  }

  if (url.pathname === '/api/player/players/p2') {
    return jsonResponse(PROFILE);
  }

  const player = PLAYERS.find((item) => `/api/player/players/${item.id}` === url.pathname);
  if (player) {
    return jsonResponse({
      ...PROFILE,
      player,
    });
  }

  return jsonResponse({ error: 'E2E route not mocked' }, 404);
};

const data = {
  player: {
    id: 'p1',
    nickname: 'Чагин',
  },
} as unknown as PlayerMeResponse;

ReactDOM.createRoot(document.getElementById('root')!).render(<PlayerClubHub data={data} />);
