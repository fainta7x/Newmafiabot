import { ACHIEVEMENTS } from '../src/lib/achievementCatalog';
import { STORY_IDS } from '../src/lib/achievementStories';
import ReactDOM from 'react-dom/client';
import CanonicalPremiumPlayerProfile from '../src/components/player/CanonicalPremiumPlayerProfile.tsx';
import '../src/index.css';
import '../src/styles/design-system.css';
import '../src/releasePolish.css';

const params = new URLSearchParams(location.search);
const target = params.get('target');
const externalProfile = target === 'friend' || target === 'unavailable';
const unavailableProfile = target === 'unavailable';
const targetPlayerId = target === 'friend' ? 'friend-1' : unavailableProfile ? 'unavailable-player' : 'preview-player';
const now = new Date();
const iso = (daysAgo: number) => new Date(now.getTime() - daysAgo * 86400000).toISOString();
const summaryFor = (id: string) => ({
  viewer: { is_self: id === 'preview-player', is_organizer: false },
  player: { id, nickname: id === 'preview-player' ? 'Чагин' : id === 'friend-1' ? 'Дэнди' : 'Недоступный игрок', full_name: id === 'preview-player' ? 'Евгений Чагин' : null, avatar_url: null, elo: 1542, rating_position: 4, rating_movement_30d: 18.4 },
  stats: { games: 48, wins: 29, win_rate: 60.4 },
  game_stats: { games:12, votesAsRed:{count:8,total:12,percent:66.7}, nominationsAsRed:{count:3,total:5,percent:60},bestMove:{count:2,averageBlack:2},firstKilled:{count:2,total:20},sheriffChecks:{count:2,total:4,percent:50},donChecks:{count:1,total:3,percent:33.3},
    actions:{ votes:{red:{red:4,black:8,sheriff:1,unknown:0},black:{red:6,black:1,sheriff:2,unknown:0}},criticalVotes:{red:{red:1,black:3,sheriff:0,unknown:0},black:{red:2,black:0,sheriff:1,unknown:0}},checks:{sheriff:{red:2,black:2,sheriff:0,unknown:0},don:{red:2,black:1,sheriff:1,unknown:0}},excludedVotingDays:5,unknownCriticalDays:2}},
  recent_games: [{ id: 'club:g4', title: 'Пятничный вечер', date: iso(2), game_number: 4, role: 'sheriff', won: true }],
});
const showcase = {
  awards: [{ id: 'award-1', kind: 'trophy', title: 'Лучший игрок вечера', tournament_name: '2LA Noire', award_date: iso(30), award_year: 2026, tournament_id: null as string | null, source_key: null as string | null, place_result: '1 место', team_name: null, description: null, photo_url: null, pinned_position: 1 }],
  pinned_awards: [{ id: 'award-1', kind: 'trophy', title: 'Лучший игрок вечера', tournament_name: '2LA Noire', award_date: iso(30), award_year: 2026, place_result: '1 место', team_name: null, description: null, photo_url: null, pinned_position: 1 }],
  earned_achievements: [], timeline: [{ id: 'award-1', type: 'award', date: iso(30), icon: '🏆', title: 'Лучший игрок вечера', description: 'Подтверждено организатором' }],
  achievement_preferences: {path_id:'citizen',pins:[] as string[]},
  achievements: { earned: 3, total: ACHIEVEMENTS.length, percentage: 5, categories:[{id:'all',achievements:ACHIEVEMENTS.map(a=>({...a,rarity_name:'Редкая',story:STORY_IDS.has(a.id),earned:['case_closed','two_shadows','first_game'].includes(a.id),earned_at:['case_closed','two_shadows','first_game'].includes(a.id)?iso(2):null,progress:{current:a.id==='four_faces'?2:a.id==='own_company'?1:0,target:a.id==='four_faces'?4:a.id==='own_company'?3:1},steps:a.id==='four_faces'?['citizen','mafia']:undefined,evidence:a.id==='case_closed'?{gameId:'club:g4',date:iso(2),detail:'Выставил и проголосовал за чёрного №2, который заголосован.'}:null}))}] }, stats: { verified_awards: 1, achievements_earned: 2, achievements_total: 12, completed_games: 48, manual_milestones: 0 },
};
// Browser-only artwork fixture. These are examples for review, not real player/tournament records.
if (params.get('trophies') === '2') {
  showcase.awards.splice(0, showcase.awards.length,
    { id: 'demo-bogdan-1', kind: 'placement', title: '1 место', tournament_id: 'demo-bogdan-1', source_key: null,
      tournament_name: 'Турнир Богдана 1.08', award_date: iso(65), award_year: 2026, place_result: '1 место',
      team_name: null, description: 'Тестовый кубок для проверки графики', photo_url: null, pinned_position: 1 },
    { id: 'demo-bogdan-2', kind: 'placement', title: '1 место', tournament_id: 'demo-bogdan-2', source_key: null,
      tournament_name: 'Турнир Богдана 2.09', award_date: iso(10), award_year: 2026, place_result: '1 место',
      team_name: null, description: 'Тестовый кубок для проверки графики', photo_url: null, pinned_position: 2 },
  );
  showcase.pinned_awards = showcase.awards.slice();
  showcase.stats.verified_awards = 2;
}

const connection = { player_id: externalProfile ? 'preview-player' : 'friend-1', nickname: externalProfile ? 'Чагин' : 'Дэнди', avatar_url: '', relationship: 'Часто за одним столом', shared_games: 18, same_team_games: 9, opponent_games: 9, same_team_wins: 6, same_team_win_rate: 66.7, last_played_at: iso(2), last_shared_game_date: iso(2) };
const startsAt = (days: number) => new Date(now.getTime() + days * 86400000).toISOString();
const invitationEvening = { id: 'evening-1', title: 'Пятничный вечер', starts_at: startsAt(3), venue: 'Суп с котом', format: 'CASUAL', state: 'eligible' };
const invitationStates = [
  invitationEvening,
  { ...invitationEvening, id: 'evening-registered', title: 'Уже записан', starts_at: startsAt(4), state: 'registered' },
  { ...invitationEvening, id: 'evening-reserve', title: 'Резерв', starts_at: startsAt(5), state: 'reserve' },
  { ...invitationEvening, id: 'evening-invited', title: 'Уже приглашён', starts_at: startsAt(6), state: 'already_invited', existing_invitation: { id: 'old-invite', status: 'sent', created_at: iso(0) } },
  { ...invitationEvening, id: 'evening-closed', title: 'Регистрация закрыта', starts_at: startsAt(7), state: 'registration_closed' },
  { ...invitationEvening, id: 'evening-limit', title: 'Лимит', starts_at: startsAt(8), state: 'sender_limit' },
  { ...invitationEvening, id: 'evening-format', title: 'Другой формат', starts_at: startsAt(9), state: 'unavailable_format' },
];

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
globalThis.fetch = async (input: RequestInfo | URL) => {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, location.origin);
  // His own Elo tab is the full journey (the same screen as «Рейтинг → Моя динамика» used to be).
  if (url.pathname === '/api/player/elo-journey') {
    const outcome = { expected_percent: 50, elo_delta: 8, team_delta: 8, carry_modifier: 1 };
    return json({
      player: { id: 'preview-player', nickname: 'Чагин', elo: 1542, seed: 1500 },
      summary: { games: 1, current: 1542, computed_current: 1542, peak: 1542, floor: 1500, net: 42, last_delta: 15 },
      preview: { basis: 'На основе последних игр.', red: { win: outcome, loss: { ...outcome, elo_delta: -8 } }, black: { win: outcome, loss: { ...outcome, elo_delta: -8 } } },
      events: [{ id: 'club:g4', source: 'club', date: iso(2), title: 'Пятничный вечер', game_number: 4, team: 'red', won: true, elo_before: 1527, elo_after: 1542, elo_delta: 15, expected_percent: 50, base_team_delta: 10, carry_modifier: 1, carry_effect: 0, team_delta: 10, personal_game_points: 1, personal_delta: 5, explanation: { headline: 'Победа красных', details: [], formula: '10 + 5' } }],
    });
  }
  if (url.pathname.startsWith('/api/player/tournaments/demo-bogdan-')) {
    const id = url.pathname.split('/').pop();
    return json({
      tournament: { id, title: id === 'demo-bogdan-1' ? 'Турнир Богдана 1.08' : 'Турнир Богдана 2.09',
        date: iso(10), venue: 'Клуб', stage: null, phase: 'finished', judge: null, organizer: null,
        entry_fee_rub: 0, prize_fund_rub: 0, games_planned: 0, games_completed: 0 },
      registration: { capacity: 10, confirmed_count: 10, reserve_count: 0, open: false, mine: null, participated: false },
      roster: [], games: [], table_hidden: false, provisional: false, standings: [], nominations: [],
    });
  }
  if (url.pathname === '/api/player/achievement-preferences') return json(showcase.achievement_preferences);
  if (url.pathname.endsWith('/summary')) return json(summaryFor(targetPlayerId));
  if (url.pathname.endsWith('/birthday')) return json({ day: 14, month: 8, year: null });
  if (url.pathname.endsWith('/games')) return json({ games: [4, 3, 2].map(number => ({ id: `club:g${number}`, title: 'Пятничный вечер', date: iso(2), game_number: number, role: number === 4 ? 'sheriff' : 'citizen', team: 'red', won: number !== 3, elo_before: 1527, elo_after: 1542, elo_delta: number === 3 ? -15 : 15 })), total: 3, offset: 0, limit: 15, next_offset: null });
  if (url.pathname.endsWith('/roles')) return json({ roles: [{ role: 'sheriff', label: 'Шериф', games: 12, wins: 8, win_rate: 66.7 }, { role: 'citizen', label: 'Мирный', games: 20, wins: 12, win_rate: 60 }, { role: 'mafia', label: 'Мафия', games: 10, wins: 6, win_rate: 60 }, { role: 'don', label: 'Дон', games: 6, wins: 3, win_rate: 50 }] });
  if (url.pathname.endsWith('/elo')) return json({ points: [{ id: 'club:g4', title: 'Пятничный вечер', game_number: 4, date: iso(2), role: 'sheriff', elo_before: 1527, elo_after: 1542, elo_delta: 15 }] });
  if (url.pathname.endsWith('/showcase')) return json(showcase);
  if (url.pathname.endsWith('/connections')) return json({ connections: [connection], most_successful_partnership: connection, invited_by: null, invited_players: [] });
  if (url.pathname.endsWith('/invitation-context')) return unavailableProfile
    ? json({ can_invite: false, reason: 'recipient_blocked', recipient_state: 'unavailable', evenings: [] })
    : json({ can_invite: true, reason: null, recipient_state: 'available', evenings: invitationStates });
  if (url.pathname === '/api/player/friend-invite-suggestions') return json({ suggestions: [{ ...connection, evening: invitationEvening }] });
  if (url.pathname === '/api/player/evening-invitations/inbox') return json({ invitations: [] });
  if (url.pathname === '/api/player/profile-completeness') return json({ completeness: { percentage: 88, complete: false, missing_fields: ['phone'], important_missing_fields: [], next_missing_field: 'phone', fields: { phone: { label: 'Телефон', weight: 12, complete: false, state: 'missing' } }, updated_at: null, checked_at: null } });
  if (url.pathname === '/api/player/insights') return json({ performance: { recent10: { games: 0 }, recent20: { games: 0 }, last30_days: { games: 0 }, roles: [] }, insights: [], opponents: { nemesis: [], comfortable: [] }, social_graph: { center: { nickname: 'Игрок' }, nodes: [] }, elo_history: { points: [] } });
  if (url.pathname === '/api/player/rating-periods') return json({ active_periods: [{ id: 'season-1', title: 'Осень 2026', starts_at: iso(60), ends_at: startsAt(60) }] });
  if (url.pathname === '/api/player/award-suggestions') return json({ success: true }, 201);
  if (url.pathname.includes('/invitations')) return json({ created: true, invitation: { id: 'invite-1' } }, 201);
  return json({ error: `Preview route not mocked: ${url.pathname}` }, 404);
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <div data-testid="canonical-player-profile-overlay" className="fixed inset-0 bg-[#090a0d]">
    <CanonicalPremiumPlayerProfile
      playerId={targetPlayerId}
      selfPlayerId="preview-player"
      mode={externalProfile ? 'public' : 'self'}
      onClose={() => undefined}
      ownerSettings={<div className="rounded-2xl border border-white/10 p-4">Настройки профиля</div>}
    />
  </div>,
);
