import ReactDOM from 'react-dom/client';
import { EveningSeatingEditor } from '../src/components/crm/EveningSeatingEditor.tsx';
import './appStyles.ts';

const names = ['Богдан', 'Матроскина', 'Пристань', 'Вид', 'Диссонанс', 'Перец', 'Дина', 'Солнце', 'Крот', 'Шторм', 'Лис', 'Ворон'];
const participants = names.map((nickname, i) => ({
  id: `ep-${i}`, evening_id: 'e1', player_id: `p${i}`, nickname, lifecycle_status: 'regular', elo: 1000, registration_status: 'going',
  response_status: 'going', attendance_status: i === 11 ? 'pending' : 'attended', arrival_status: 'on_time', payment_status: 'unpaid', amount_due: 0, amount_paid: 0,
  left_at: i === 10 ? '2026-10-31T20:00:00.000Z' : null, created_at: '', updated_at: '',
})) as any[];
const tables = [{ id: 't1', name: 'Стол 1', capacity: 10 }];
const slots = [{ id: 's1', slot_number: 1 }, { id: 's2', slot_number: 2 }, { id: 's3', slot_number: 3 }];
let seats = names.slice(0, 7).map((nickname, i) => ({ id: `seat-${i}`, slot_id: 's1', game: 1, tableId: 't1', seat: i + 1, playerId: `p${i}`, nickname, started: 0 }));

globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const raw = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
  const url = new URL(raw, window.location.origin);
  const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
  if (url.pathname.endsWith('/slots')) return json({ slots });
  if (url.pathname.endsWith('/seating') && !init?.method) return json({ seats });
  if (url.pathname.endsWith('/seating/generate')) return json({ created: 3 });
  const put = /seating\/player\/([^/]+)$/.exec(url.pathname);
  if (put && init?.method === 'PUT') {
    const body = JSON.parse(String(init.body));
    seats = [...seats, { id: `seat-${seats.length}`, slot_id: body.slot_id, game: 1, tableId: body.table_id, seat: body.seat_number, playerId: put[1], nickname: names[Number(put[1].slice(1))], started: 0 }];
    return json({ saved: true });
  }
  const del = /seating\/player\/([^/]+)\/([^/]+)$/.exec(url.pathname);
  if (del && init?.method === 'DELETE') { seats = seats.filter((s) => !(s.playerId === del[1] && s.slot_id === del[2])); return json({ ok: true }); }
  return json({});
};

ReactDOM.createRoot(document.getElementById('root')!).render(<div className="mx-auto max-w-5xl p-3"><EveningSeatingEditor eveningId="e1" tables={tables} participants={participants} /></div>);
