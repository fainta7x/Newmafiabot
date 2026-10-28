import {birthdayTaskTitle} from '../src/shared/birthdayTask.ts';
import ReactDOM from 'react-dom/client';
import OrganizerCRM from '../src/components/OrganizerCRM.tsx';
import './appStyles.ts';

const future = new Date(Date.now() + 3 * 86400000).toISOString();
const evening = { id: 'e1', title: 'Пятничный клубный вечер', starts_at: future, venue: 'Суп с котом', format: 'CASUAL', status: 'published', capacity: 20, default_price: 400, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
const overview = { total_players: 24, upcoming_evenings: 1, open_tasks: 0, unpaid_total: 0, upcoming: [evening], tasks: [], recent_activity: [] };
const commandCenter = {
  snapshot: {
    mode: 'upcoming',
    evening,
    stats: { expected: 12, present: 0, pending_attendance: 12, no_show: 0, unpaid_count: 0, unpaid_amount: 0, games: 0, completed_games: 0, draft_games: 0, open_tasks: 0, ready_to_close: false },
    current_game: null,
    suggested_lineup: [],
    roster: { expected: [], present: [], pending_attendance: [], unpaid: [] },
    attention: { communication: [], tasks: [] },
    blockers: [],
  },
  wrapup: null,
  generated_at: new Date().toISOString(),
};
if (new URLSearchParams(location.search).get('scenario') === 'active') { commandCenter.snapshot.mode = 'active'; commandCenter.snapshot.stats.present = 10; commandCenter.snapshot.stats.unpaid_count = 2; commandCenter.snapshot.stats.unpaid_amount = 800; }
const followupItems=[{id:'check:debts:player:demo',group:'now',kind:'debts',title:'Долг — Игрок А',why:'Всего 800 ₽ · 2 вечера: Пятничный вечер · 23 октября — 400 ₽; Пятничный вечер · 16 октября — 400 ₽',action:{type:'player',player_id:'demo'},action_label:'Открыть игрока'},{id:'task:birthday-demo',group:'week',kind:'birthday',title:birthdayTaskTitle({automation_key:'birthday:demo:2026-10-30',player_nickname:'Игрок Б'},Date.parse('2026-10-28T12:00:00+03:00')),why:'Подготовить поздравление. Дата: 30.10.',due_at:'2026-10-30T09:00:00Z',task_id:'birthday-demo',can_complete:true}];
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

globalThis.fetch = async (input: RequestInfo | URL) => {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, location.origin);
  if(url.pathname==='/api/curator-tasks')return json({open:[],closed:[],curators:[]});
  if (url.pathname === '/api/crm/publications/held') return json({ items: [] });
  if (url.pathname === '/api/auth/me') return json({ role: 'ORGANIZER', isOrganizer: true });
  if (url.pathname === '/api/crm/overview') return json(overview);
  if (url.pathname === '/api/crm/command-center') return json(commandCenter);
  if (url.pathname === '/api/crm/agenda') return json({ items: new URLSearchParams(location.search).has('followups')?followupItems:[], counts: new URLSearchParams(location.search).has('followups')?{now:1,week:1,later:0}:{now:0,week:0,later:0}, total: new URLSearchParams(location.search).has('followups')?2:0, snoozed: 0, groups: { now: 'Сейчас', week: 'На неделе', later: 'Позже' } });
  if (url.pathname === '/api/evenings') return json([evening]);
  if (url.pathname === '/api/players') return json([]);
  return json({ error: `Preview route not mocked: ${url.pathname}` }, 404);
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <OrganizerCRM pathname={new URLSearchParams(location.search).get('route')||'/admin'} onNavigate={() => undefined} />,
);
