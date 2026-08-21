import ReactDOM from 'react-dom/client';
import { EveningsList } from '../src/components/crm/EveningsList.tsx';
import type { GameEvening } from '../src/lib/api.ts';
import '../src/index.css';
import '../src/styles/design-system.css';
import '../src/releasePolish.css';

const atOffset = (days: number, hour = 20) => {
  const date = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  date.setHours(hour, 0, 0, 0);
  return date.toISOString();
};

const evenings = [
  {
    id: 'draft',
    title: 'Старый черновик вечера',
    starts_at: atOffset(-10),
    timezone: 'Europe/Moscow',
    venue: 'Суп с Котом',
    format: 'CASUAL',
    status: 'draft',
    capacity: 10,
    default_price: 100,
    created_at: atOffset(-12),
    updated_at: atOffset(-10),
    registered_count: 6,
    attended_count: 0,
    total_revenue: 0,
  },
  {
    id: 'active',
    title: 'Рейтинговый вечер',
    starts_at: atOffset(-1),
    timezone: 'Europe/Moscow',
    venue: 'Суп с Котом',
    format: 'RATING',
    status: 'active',
    capacity: 10,
    default_price: 100,
    created_at: atOffset(-14),
    updated_at: atOffset(0),
    registered_count: 12,
    attended_count: 10,
    total_revenue: 3200,
  },
  {
    id: 'planned',
    title: 'Вечер для новичков',
    starts_at: atOffset(2),
    timezone: 'Europe/Moscow',
    venue: 'Суп с Котом',
    format: 'NOVICE',
    status: 'published',
    capacity: 10,
    default_price: 100,
    created_at: atOffset(-3),
    updated_at: atOffset(-1),
    registered_count: 8,
    attended_count: 0,
    total_revenue: 0,
  },
  {
    id: 'later',
    title: 'Клубный вечер на следующей неделе',
    starts_at: atOffset(9),
    timezone: 'Europe/Moscow',
    venue: 'Суп с Котом',
    format: 'CASUAL',
    status: 'published',
    capacity: 10,
    default_price: 100,
    created_at: atOffset(-2),
    updated_at: atOffset(-1),
    registered_count: 4,
    attended_count: 0,
    total_revenue: 0,
  },
  {
    id: 'completed',
    title: 'Прошлый клубный вечер',
    starts_at: atOffset(-14),
    timezone: 'Europe/Moscow',
    venue: 'Суп с Котом',
    format: 'CASUAL',
    status: 'completed',
    capacity: 10,
    default_price: 100,
    created_at: atOffset(-20),
    updated_at: atOffset(-13),
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