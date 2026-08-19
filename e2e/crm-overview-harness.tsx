import ReactDOM from 'react-dom/client';
import OrganizerCommandCenter from '../src/components/crm/OrganizerCommandCenter.tsx';
import '../src/index.css';
import '../src/styles/design-system.css';
import '../src/releasePolish.css';
import '../src/components/crm/crmOverviewCanonical.css';

const startsAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();

const COMMAND_CENTER = {
  snapshot: {
    mode: 'upcoming',
    evening: {
      id: 'e1',
      title: 'Пятничный клубный вечер',
      starts_at: startsAt,
      venue: 'Суп с Котом',
      format: 'CASUAL',
      status: 'published',
    },
    stats: {
      expected: 14,
      present: 10,
      pending_attendance: 4,
      no_show: 0,
      unpaid_count: 3,
      unpaid_amount: 900,
      games: 6,
      completed_games: 2,
      draft_games: 1,
      open_tasks: 4,
      ready_to_close: false,
    },
    current_game: null,
    suggested_lineup: [],
    roster: {
      expected: [],
      present: [],
      pending_attendance: [],
      unpaid: [],
    },
    attention: {
      communication: [],
      tasks: [],
    },
    blockers: [],
  },
  wrapup: null,
  generated_at: new Date().toISOString(),
};

const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json' },
});

globalThis.fetch = async (input: RequestInfo | URL) => {
  const raw = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
  const url = new URL(raw, window.location.origin);
  if (url.pathname === '/api/crm/command-center') return jsonResponse(COMMAND_CENTER);
  return jsonResponse({ error: 'E2E route not mocked' }, 404);
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <main className="min-h-screen bg-[#090a0d] px-3 pb-8 pt-3 font-sans text-white">
    <div className="crm-overview-canonical mx-auto w-full max-w-[430px]">
      <OrganizerCommandCenter
        overview={null}
        onOpenEvening={(id) => { document.body.dataset.openEvening = id; }}
        onOpenEveningSection={(id, section) => { document.body.dataset.openSection = `${id}:${section}`; }}
        onOpenPlayer={() => undefined}
        onNavigateTab={() => undefined}
        onCreateEvening={() => undefined}
        onRefresh={async () => undefined}
      />
    </div>
  </main>,
);
