import ReactDOM from 'react-dom/client';
import { api } from '../src/lib/api.ts';
import { EveningWorkspace } from '../src/components/crm/EveningWorkspace.tsx';
import '../src/index.css';
import '../src/styles/design-system.css';
import '../src/releasePolish.css';

const now = new Date();
const startsAt = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
const isoNow = now.toISOString();

const participants = [
  {
    id: 'ep-bogdan', evening_id: 'evening-active', player_id: 'bogdan', nickname: 'Богдан', lifecycle_status: 'regular', elo: 1042,
    registration_status: 'going', attendance_status: 'pending', arrival_status: 'unknown', payment_status: 'unpaid', amount_due: 400, amount_paid: 0,
    created_at: isoNow, updated_at: isoNow,
  },
  {
    id: 'ep-matroskina', evening_id: 'evening-active', player_id: 'matroskina', nickname: 'Матроскина', lifecycle_status: 'regular', elo: 1015,
    registration_status: 'late', attendance_status: 'attended', arrival_status: 'unknown', payment_status: 'unpaid', amount_due: 400, amount_paid: 0,
    created_at: isoNow, updated_at: isoNow,
  },
  {
    id: 'ep-pristan', evening_id: 'evening-active', player_id: 'pristan', nickname: 'Пристань', lifecycle_status: 'regular', elo: 1088,
    registration_status: 'thinking', attendance_status: 'pending', arrival_status: 'unknown', payment_status: 'unpaid', amount_due: 400, amount_paid: 0,
    created_at: isoNow, updated_at: isoNow,
  },
  {
    id: 'ep-vid', evening_id: 'evening-active', player_id: 'vid', nickname: 'Вид', lifecycle_status: 'regular', elo: 990,
    registration_status: 'going', attendance_status: 'attended', arrival_status: 'on_time', payment_status: 'paid', amount_due: 400, amount_paid: 400,
    created_at: isoNow, updated_at: isoNow,
  },
  {
    id: 'ep-guest', evening_id: 'evening-active', player_id: 'guest', nickname: 'Гость', lifecycle_status: 'newcomer', elo: 1000,
    registration_status: 'declined', attendance_status: 'no_show', arrival_status: 'unknown', payment_status: 'unpaid', amount_due: 0, amount_paid: 0,
    created_at: isoNow, updated_at: isoNow,
  },
] as any[];

const getEveningFixture = () => ({
  id: 'evening-active',
  title: 'Пятничный клубный вечер',
  starts_at: startsAt,
  timezone: 'Europe/Moscow',
  venue: 'Суп с Котом',
  format: 'CASUAL',
  status: 'active',
  capacity: 16,
  default_price: 400,
  notes: '',
  settled_at: null,
  created_at: isoNow,
  updated_at: isoNow,
  tables: [],
  games: [],
  participants: participants.map((participant) => ({ ...participant })),
}) as any;

api.getEvening = async () => getEveningFixture();
api.updateParticipant = async (participantId: string, data: any) => {
  const participant = participants.find((item) => item.id === participantId);
  if (!participant) throw new Error('Participant not found');
  Object.assign(participant, data, { updated_at: new Date().toISOString() });
  return { ...participant } as any;
};
api.getPlayers = async () => [] as any;

globalThis.fetch = async (input: RequestInfo | URL) => {
  const raw = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
  const url = new URL(raw, window.location.origin);
  if (url.pathname.endsWith('/slots')) {
    return new Response(JSON.stringify({ slots: [], registrations: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
  if (url.pathname.includes('/avatar')) {
    return new Response(JSON.stringify({ error: 'No avatar' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
  }
  return new Response(JSON.stringify({ error: 'E2E route not mocked' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
};

function Harness() {
  return <div className="mx-auto min-h-screen w-full max-w-[430px] overflow-x-hidden bg-[#090a0d] font-sans text-white">
    <main className="px-3 py-3">
      <EveningWorkspace
        eveningId="evening-active"
        initialSection="management"
        onBack={() => { document.body.dataset.back = '1'; }}
        onOpenPlayerCard={(id) => { document.body.dataset.openPlayer = id; }}
      />
    </main>
  </div>;
}

ReactDOM.createRoot(document.getElementById('root')!).render(<Harness />);
