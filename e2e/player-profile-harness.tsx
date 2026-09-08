import ReactDOM from 'react-dom/client';
import CanonicalPremiumPlayerProfile from '../src/components/player/CanonicalPremiumPlayerProfile.tsx';
import '../src/index.css';
import '../src/styles/design-system.css';
import '../src/releasePolish.css';

const now = new Date();
const iso = (daysAgo: number) => new Date(now.getTime() - daysAgo * 86400000).toISOString();
const summary = {
  viewer: { is_self: true, is_organizer: false },
  player: { id: 'preview-player', nickname: 'Чагин', full_name: 'Евгений Чагин', avatar_url: null, elo: 1542, rating_position: 4, rating_movement_30d: 18.4 },
  stats: { games: 48, wins: 29, win_rate: 60.4 },
  recent_games: [{ id: 'club:g4', title: 'Пятничный вечер', date: iso(2), game_number: 4, role: 'sheriff', won: true }],
};
const showcase = {
  awards: [{ id: 'award-1', kind: 'trophy', title: 'Лучший игрок вечера', tournament_name: '2LA Noire', award_date: iso(30), award_year: 2026, place_result: '1 место', team_name: null, description: null, photo_url: null, pinned_position: 1 }],
  pinned_awards: [{ id: 'award-1', kind: 'trophy', title: 'Лучший игрок вечера', tournament_name: '2LA Noire', award_date: iso(30), award_year: 2026, place_result: '1 место', team_name: null, description: null, photo_url: null, pinned_position: 1 }],
  earned_achievements: [], timeline: [{ id: 'award-1', type: 'award', date: iso(30), icon: '🏆', title: 'Лучший игрок вечера', description: 'Подтверждено организатором' }],
  achievements: { earned: 2, total: 12, percentage: 16.7 }, stats: { verified_awards: 1, achievements_earned: 2, achievements_total: 12, completed_games: 48, manual_milestones: 0 },
};
const connection = { player_id: 'friend-1', nickname: 'Дэнди', avatar_url: '', relationship: 'Часто за одним столом', shared_games: 18, same_team_games: 9, opponent_games: 9, same_team_wins: 6, same_team_win_rate: 66.7, last_played_at: iso(2), last_shared_game_date: iso(2) };
const invitationEvening = { id: 'evening-1', title: 'Пятничный вечер', starts_at: new Date(now.getTime() + 3 * 86400000).toISOString(), venue: 'Суп с котом', format: 'CASUAL' };

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
globalThis.fetch = async (input: RequestInfo | URL) => {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, location.origin);
  if (url.pathname.endsWith('/summary')) return json(summary);
  if (url.pathname.endsWith('/birthday')) return json({ day: 14, month: 8, year: null });
  if (url.pathname.endsWith('/games')) return json({ games: [{ id: 'club:g4', title: 'Пятничный вечер', date: iso(2), game_number: 4, role: 'sheriff', team: 'red', won: true, elo_before: 1527, elo_after: 1542, elo_delta: 15 }], total: 1, offset: 0, limit: 15, next_offset: null });
  if (url.pathname.endsWith('/roles')) return json({ roles: [{ role: 'sheriff', label: 'Шериф', games: 12, wins: 8, win_rate: 66.7 }] });
  if (url.pathname.endsWith('/elo')) return json({ points: [{ id: 'club:g4', title: 'Пятничный вечер', game_number: 4, date: iso(2), role: 'sheriff', elo_before: 1527, elo_after: 1542, elo_delta: 15 }] });
  if (url.pathname.endsWith('/showcase')) return json(showcase);
  if (url.pathname.endsWith('/connections')) return json({ connections: [connection], most_successful_partnership: connection, invited_by: null, invited_players: [] });
  if (url.pathname === '/api/player/friend-invite-suggestions') return json({ suggestions: [{ ...connection, evening: invitationEvening }] });
  if (url.pathname === '/api/player/evening-invitations/inbox') return json({ invitations: [] });
  if (url.pathname === '/api/player/profile-completeness') return json({ score: 88, status: 'good', fields: [] });
  if (url.pathname === '/api/player/rating-periods') return json({ active_periods: [{ id: 'season-1', title: 'Осень 2026', starts_at: iso(60), ends_at: new Date(now.getTime() + 60 * 86400000).toISOString() }] });
  if (url.pathname === '/api/player/award-suggestions') return json({ success: true }, 201);
  if (url.pathname.includes('/invitations')) return json({ created: true, invitation: { id: 'invite-1' } }, 201);
  return json({ error: `Preview route not mocked: ${url.pathname}` }, 404);
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <div data-testid="canonical-player-profile-overlay" className="fixed inset-0 bg-[#090a0d]">
    <CanonicalPremiumPlayerProfile playerId="preview-player" selfPlayerId="preview-player" mode="self" onClose={() => undefined} ownerSettings={<div className="rounded-2xl border border-white/10 p-4">Настройки профиля</div>} />
  </div>,
);
