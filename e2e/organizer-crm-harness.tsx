import ReactDOM from 'react-dom/client';
import OrganizerCRM from '../src/components/OrganizerCRM.tsx';
import '../src/index.css';
import '../src/styles/design-system.css';
import '../src/releasePolish.css';

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
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

globalThis.fetch = async (input: RequestInfo | URL) => {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, location.origin);
  if (url.pathname === '/api/auth/me') return json({ role: 'ORGANIZER', isOrganizer: true });
  if (url.pathname === '/api/crm/overview') return json(overview);
  if (url.pathname === '/api/crm/command-center') return json(commandCenter);
  if (url.pathname === '/api/evenings') return json([evening]);
  if (url.pathname === '/api/players') return json([]);
  return json({ error: `Preview route not mocked: ${url.pathname}` }, 404);
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <OrganizerCRM pathname="/admin" onNavigate={() => undefined} />,
);
