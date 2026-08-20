import ReactDOM from 'react-dom/client';
import EveningCloseoutPanel from '../src/components/crm/EveningCloseoutPanel.tsx';
import '../src/index.css';
import '../src/styles/design-system.css';
import '../src/releasePolish.css';

// The production OrganizerCRM shell scrolls the window. The global app CSS keeps
// html/body/#root at 100% for full-screen game surfaces, so this isolated evidence
// harness must release those fixed heights or a full-page screenshot clips the
// close-out panel at exactly one viewport even though the real CRM is scrollable.
for (const node of [document.documentElement, document.body, document.getElementById('root')]) {
  if (!node) continue;
  node.style.height = 'auto';
  node.style.minHeight = '100%';
}
document.documentElement.style.overflowY = 'auto';
document.body.style.overflowY = 'auto';

const participants = [
  { id: 'ep1', player_id: 'p1', nickname: 'Богдан', response_status: 'going', registration_status: 'going', attendance_status: 'pending', payment_status: 'unpaid', amount_due: 400, amount_paid: 0 },
  { id: 'ep2', player_id: 'p2', nickname: 'Матроскина', response_status: 'late', registration_status: 'late', attendance_status: 'pending', payment_status: 'unpaid', amount_due: 300, amount_paid: 100 },
  { id: 'ep3', player_id: 'p3', nickname: 'Пристань', response_status: 'going', registration_status: 'going', attendance_status: 'attended', payment_status: 'partial', amount_due: 400, amount_paid: 200 },
  { id: 'ep4', player_id: 'p4', nickname: 'Гость без записи', response_status: 'unanswered', registration_status: 'unanswered', attendance_status: 'attended', payment_status: 'unpaid', amount_due: 400, amount_paid: 0 },
  { id: 'ep6', player_id: 'p6', nickname: 'Вид', response_status: 'thinking', registration_status: 'thinking', attendance_status: 'pending', payment_status: 'unpaid', amount_due: 400, amount_paid: 0 },
];

let state: any = null;
const rebuild = () => {
  const pending = participants.filter((item) => ['going', 'late'].includes(item.response_status) && item.attendance_status === 'pending');
  const attended = participants.filter((item) => item.attendance_status === 'attended');
  const noShow = participants.filter((item) => item.attendance_status === 'no_show');
  const outstanding = attended.filter((item) => item.payment_status !== 'waived' && item.amount_due > item.amount_paid).map((item) => ({ ...item, balance: item.amount_due - item.amount_paid }));
  state = {
    evening: { id: 'eve', title: 'Игровой вечер — 14 августа', starts_at: '2026-08-14T20:00:00+03:00', status: 'active', settled_at: null },
    participants,
    pending_expected: pending,
    attended,
    no_show: noShow,
    unplanned_attended: attended.filter((item) => !['going', 'late'].includes(item.response_status)),
    outstanding,
    games: { total: 3, completed: 2, unfinished: [{ id: 3, game_number: 3 }], needs_override: true },
    can_close_without_override: false,
    can_close_with_override: pending.length === 0,
  };
};
rebuild();

const players = [
  { id: 'p1', nickname: 'Богдан' }, { id: 'p2', nickname: 'Матроскина' }, { id: 'p3', nickname: 'Пристань' }, { id: 'p4', nickname: 'Гость без записи' }, { id: 'p5', nickname: 'Чагин' }, { id: 'p6', nickname: 'Вид' },
];
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const raw = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
  const url = new URL(raw, window.location.origin);
  if (url.pathname === '/api/evenings/eve/closeout' && (!init?.method || init.method === 'GET')) return json(state);
  if (url.pathname === '/api/players') return json(players);
  if (url.pathname === '/api/evenings/eve/participants/bulk' && init?.method === 'PATCH') {
    const body = JSON.parse(String(init.body || '{}'));
    for (const update of body.updates || []) {
      const item = participants.find((candidate) => candidate.id === update.id);
      if (!item) continue;
      if (update.attendance_fact === 'attended_on_time') item.attendance_status = 'attended';
      if (update.attendance_fact === 'no_show') item.attendance_status = 'no_show';
      if (update.amount_paid !== undefined) item.amount_paid = Number(update.amount_paid);
      if (update.payment_status !== undefined) item.payment_status = update.payment_status;
    }
    rebuild();
    return json({ success: true, participants });
  }
  if (url.pathname === '/api/evenings/eve/closeout/walk-in' && init?.method === 'POST') return json({}, 201);
  if (url.pathname === '/api/evenings/eve/closeout/settle' && init?.method === 'POST') return json({ success: true, archived_unfinished_games: 1 });
  return json({ error: 'E2E route not mocked' }, 404);
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <main className="min-h-screen bg-app-bg px-3 py-3 text-text-primary">
    <div className="mx-auto w-full max-w-[430px]">
      <EveningCloseoutPanel eveningId="eve" />
    </div>
  </main>,
);
