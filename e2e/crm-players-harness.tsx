import ReactDOM from 'react-dom/client';
import { Calendar, Menu, RefreshCw, Users } from 'lucide-react';
import { api } from '../src/lib/api.ts';
import PlayersCRM from '../src/components/crm/PlayersCRM.tsx';
import '../src/index.css';
import '../src/styles/design-system.css';
import '../src/releasePolish.css';

const futureStart = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();
const now = new Date().toISOString();

const evening = {
  id: 'evening-friday',
  title: 'Пятничный клубный вечер',
  starts_at: futureStart,
  timezone: 'Europe/Moscow',
  format: 'CASUAL',
  status: 'published',
  default_price: 100,
  venue: 'Суп с Котом',
  notes: '',
} as any;

const players = [
  { id: 'bogdan', nickname: 'Богдан', full_name: 'Богдан С.', contact_status: 'normal', days_since_last_visit: 4, open_tasks_count: 1, attendance_count: 8, avatar_updated_at: null },
  { id: 'pristan', nickname: 'Пристань', full_name: null, contact_status: 'normal', days_since_last_visit: 9, open_tasks_count: 0, attendance_count: 12, avatar_updated_at: null },
  { id: 'matroskina', nickname: 'Матроскина', full_name: 'Анна', contact_status: 'normal', days_since_last_visit: 32, open_tasks_count: 0, attendance_count: 5, avatar_updated_at: null },
  { id: 'vid', nickname: 'Вид', full_name: null, contact_status: 'paused', days_since_last_visit: 18, open_tasks_count: 0, attendance_count: 7, avatar_updated_at: null },
] as any[];

const playerDetails = {
  id: 'bogdan',
  nickname: 'Богдан',
  full_name: 'Богдан С.',
  phone: null,
  telegram_username: 'bogdan_mafia',
  telegram_user_id: '777',
  source: 'club',
  notes: 'Предпочитает заранее понимать, во сколько его первая игра.',
  contact_status: 'normal',
  engagement_stage: 'regular',
  calculated_stage: 'regular',
  game_level: 'club',
  judge_level: 'none',
  preferred_format: 'Клубный',
  referred_by: 'Пристань',
  attendance_count: 8,
  no_show_count: 1,
  tokens: 120,
  elo: 1042,
  elo_seed: 1000,
  last_visit: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(),
  do_not_invite_until: null,
  pause_reason: null,
  gameStats: {
    totalGames: 21,
    wins: 11,
    winRate: 52,
    roleCounts: { citizen: 12, sheriff: 3, mafia: 4, don: 2 },
    bestMoves: 2,
    firstKilled: 1,
    zeroRoundVoted: 0,
  },
  stats: { attendanceCount: 8 },
  nextTask: { id: 'task-1', title: 'Уточнить время приезда', status: 'open', due_at: futureStart, created_at: now },
  tasks: [
    { id: 'task-1', title: 'Уточнить время приезда', status: 'open', due_at: futureStart, created_at: now },
    { id: 'task-0', title: 'Отправить правила клуба', status: 'done', due_at: null, created_at: now, completed_at: now },
  ],
  activities: [
    { id: 'a1', type: 'contact', outcome: 'answered', description: 'Подтвердил, что будет в пятницу', occurred_at: now, created_at: now },
    { id: 'a2', type: 'invite', outcome: 'sent', description: 'Получил личный анонс', occurred_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), created_at: now },
  ],
  eveningHistory: [
    { id: 'eh1', evening_id: 'old-evening', evening_title: 'Клубный вечер', evening_date: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(), registration_status: 'going', arrival_status: 'arrived', created_at: now },
  ],
  futureBookings: [
    { id: 'booking-1', evening_id: evening.id, registration_status: 'going', arrival_status: 'on_time', created_at: now },
  ],
  clubGames: [],
  tournamentGames: [],
  tournaments: [],
  tournamentAwards: [],
  awardTournaments: [],
  awardStats: { firstPlaces: 0, secondPlaces: 0, thirdPlaces: 0, nominations: 0 },
  achievements: null,
} as any;

api.getPlayers = async () => players as any;
api.getPlayer = async () => playerDetails as any;

globalThis.fetch = async (input: RequestInfo | URL) => {
  const raw = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
  const url = new URL(raw, window.location.origin);
  if (url.pathname.includes('/tokens')) {
    return new Response(JSON.stringify({ player_id: 'bogdan', balance: 120, ledger: { items: [], total: 0, limit: 5, offset: 0 } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
  return new Response(JSON.stringify({ error: 'E2E route not mocked' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
};

const nav = [
  { id: 'overview', label: 'Сегодня', icon: RefreshCw },
  { id: 'evenings', label: 'События', icon: Calendar },
  { id: 'players', label: 'Игроки', icon: Users },
  { id: 'more', label: 'Ещё', icon: Menu },
];

function Harness() {
  return (
    <div className="relative mx-auto min-h-screen w-full max-w-[430px] overflow-x-hidden bg-[#090a0d] font-sans text-white">
      <main className="px-3 pb-28 pt-3">
        <PlayersCRM
          evenings={[evening]}
          onOpenEvening={(id) => { document.body.dataset.openEvening = id; }}
          onCrmChanged={() => undefined}
        />
      </main>

      <nav className="organizer-bottom-nav glass-nav fixed bottom-0 left-0 right-0 z-40 grid min-h-[64px] h-[calc(64px+env(safe-area-inset-bottom))] grid-cols-4 border-t border-border-soft pb-safe sm:hidden">
        {nav.map((item) => {
          const Icon = item.icon;
          const active = item.id === 'players';
          return (
            <button key={item.id} data-testid={`crm-nav-${item.id}`} type="button" className="relative flex min-h-[48px] min-w-0 flex-col items-center justify-center px-1">
              <Icon className={`h-[21px] w-[21px] ${active ? 'text-accent' : 'text-text-muted'}`} />
              <span className={`mt-1 max-w-full truncate text-[11px] leading-none ${active ? 'font-bold text-text-primary' : 'font-medium text-text-muted'}`}>{item.label}</span>
              {active ? <span className="absolute top-1 h-0.5 w-5 rounded-full bg-accent" /> : null}
            </button>
          );
        })}
      </nav>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(<Harness />);
