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
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
globalThis.fetch = async (input: RequestInfo | URL) => {
 const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, location.origin);
 switch (url.pathname) {
  case '/api/player/me': return json(data);
  case '/api/player/evenings': return json({ evenings: [evening] });
  case '/api/rating': return json({ players: [{ player_id: data.player.id, nickname: data.player.nickname, elo: 1542, place: 4 }] });
  case '/api/player/judging': return json({ player: { judge_level: 'judge', judge_level_label: 'Судья' }, club_games: [], tournament_games: [] });
  case '/api/player/evening-journey': return json({ journey: { phase: 'idle' } });
  case '/api/player/notifications': return json({ items: [], unread_count: 0 });
  case '/api/player/games/all': return json({ games: [] });
  case '/api/player/games/elo': return json({ games: [] });
  case '/api/player/players': return json({ players: [] });
  default: return json({ error: 'Этот сценарий пока не подготовлен в предпросмотре' }, 404);
 }
};
ReactDOM.createRoot(document.getElementById('root')!).render(<AppErrorBoundary><PlayerCabinetShell data={data} canOpenAdmin onOpenAdmin={() => { location.href = './crm-evening-roster.html'; }} /></AppErrorBoundary>);
