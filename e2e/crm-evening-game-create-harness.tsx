import ReactDOM from 'react-dom/client';
import { EveningGameCreateSheet } from '../src/components/crm/EveningGameCreateSheet.tsx';
import './appStyles.ts';

// «Одно окно» (owner, 2026-11-02): add a player, mark arrival and seat them from the new-game sheet.
const names = ['Богдан', 'Матроскина', 'Пристань', 'Вид', 'Диссонанс', 'Перец', 'Дина', 'Солнце', 'Крот', 'Шторм Длинноникович', 'Лис'];
let participants = names.map((nickname, i) => ({
  id: `ep-${i}`, evening_id: 'e1', player_id: `p${i}`, nickname, lifecycle_status: 'regular', elo: 1000, registration_status: 'going',
  response_status: 'going', attendance_status: i >= 8 ? 'pending' : 'attended', arrival_status: i >= 8 ? null : 'on_time', payment_status: 'unpaid',
  amount_due: 500, amount_paid: 0, left_at: null, created_at: '', updated_at: '',
})) as any[];
const evening = { id: 'e1', status: 'published', format: 'STANDARD', default_price: 500, title: 'Вечер', starts_at: '2026-11-02T18:00:00.000Z' } as any;
const tables = [{ id: 't1', name: 'Стол 1', capacity: 10, format: 'STANDARD', host_name: '' }] as any[];

globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const raw = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
  const url = new URL(raw, window.location.origin);
  const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
  if (url.pathname.endsWith('/slots')) return json({ slots: [] });
  if (url.pathname.endsWith('/seating')) return json({ seats: [] });
  if (url.pathname.endsWith('/staff')) return json({});
  const participant = /participants\/([^/]+)$/.exec(url.pathname);
  if (participant && init?.method && init.method !== 'GET') {
    const body = JSON.parse(String(init.body || '{}'));
    participants = participants.map((item) => item.id === participant[1] ? { ...item, ...body } : item);
    return json(participants.find((item) => item.id === participant[1]));
  }
  if (url.pathname.includes('/players')) return json([]);
  return json({});
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <EveningGameCreateSheet evening={evening} tables={tables} participants={participants} games={[]} onClose={() => {}} onCreated={() => {}} />,
);
