import ReactDOM from 'react-dom/client';
import { EveningsList } from '../src/components/crm/EveningsList.tsx';
import type { GameEvening } from '../src/lib/api.ts';
import '../src/index.css';
import '../src/styles/design-system.css';
import '../src/releasePolish.css';

const pad = (value: number) => String(value).padStart(2, '0');
const now = new Date();
const year = now.getFullYear();
const month = now.getMonth() + 1;
const iso = (day: number, hour = 20) => `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:00:00+03:00`;

const evenings = [
  {
    id: 'draft',
    title: 'Клубный вечер — черновик',
    starts_at: iso(6),
    timezone: 'Europe/Moscow',
    venue: 'Суп с Котом',
    format: 'CASUAL',
    status: 'draft',
    capacity: 10,
    default_price: 100,
    created_at: iso(1),
    updated_at: iso(1),
    registered_count: 6,
    attended_count: 0,
    total_revenue: 0,
  },
  {
    id: 'active',
    title: 'Рейтинговый вечер',
    starts_at: iso(14),
    timezone: 'Europe/Moscow',
    venue: 'Суп с Котом',
    format: 'RATING',
    status: 'active',
    capacity: 10,
    default_price: 100,
    created_at: iso(1),
    updated_at: iso(1),
    registered_count: 12,
    attended_count: 10,
    total_revenue: 3200,
  },
  {
    id: 'planned',
    title: 'Вечер для новичков',
    starts_at: iso(22),
    timezone: 'Europe/Moscow',
    venue: 'Суп с Котом',
    format: 'NOVICE',
    status: 'published',
    capacity: 10,
    default_price: 100,
    created_at: iso(1),
    updated_at: iso(1),
    registered_count: 8,
    attended_count: 0,
    total_revenue: 0,
  },
  {
    id: 'completed',
    title: 'Прошлый клубный вечер',
    starts_at: iso(3),
    timezone: 'Europe/Moscow',
    venue: 'Суп с Котом',
    format: 'CASUAL',
    status: 'completed',
    capacity: 10,
    default_price: 100,
    created_at: iso(1),
    updated_at: iso(1),
    registered_count: 11,
    attended_count: 10,
    total_revenue: 3800,
  },
] as unknown as GameEvening[];

const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json' },
});

globalThis.fetch = async (input: RequestInfo | URL) => {
  const raw = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
  const url = new URL(raw, window.location.origin);
  if (url.pathname === '/api/tournaments') return jsonResponse([]);
  return jsonResponse({ error: 'E2E route not mocked' }, 404);
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <main className="min-h-screen bg-[#090a0d] px-3 pb-8 pt-3 text-white">
    <div className="mx-auto w-full max-w-[430px]">
      <EveningsList
        evenings={evenings}
        onOpenEvening={(id) => { document.body.dataset.openEvening = id; }}
        onCreateEvening={async () => undefined}
      />
    </div>
  </main>,
);
