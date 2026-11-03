import { useState } from 'react';
import { organizerHeaders } from '../../lib/organizerAuth.ts';
import { readJsonResponse } from '../../lib/requestJson.ts';

type Seat = { seat_number: number; player_id?: string | null; display_name?: string; nickname?: string };
type Order = { id: string; player_id: string; target_player_id: string; status: 'ordered' | 'applied' | 'cancelled' };

async function call(url: string, init: RequestInit = {}) {
  const response = await fetch(url, {
    ...init, credentials: 'include',
    headers: { ...organizerHeaders(Boolean(init.body)), ...(init.headers || {}) },
  });
  return readJsonResponse(response, 'Не удалось обработать обмен');
}

export default function EveningSeatSwapPanel({
  gameId, seats, completed, format,
}: { gameId: number; seats: Seat[]; completed: boolean; format: string }) {
  const [open,setOpen] = useState(false);
  const [orders,setOrders] = useState<Order[]>([]);
  const [first,setFirst] = useState('');
  const [second,setSecond] = useState('');
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  const [loaded,setLoaded] = useState(false);
  const players = seats.filter(seat => seat.player_id);
  const names = new Map(players.map(seat => [String(seat.player_id), `№${seat.seat_number} · ${seat.display_name || seat.nickname || 'Игрок'}`]));
  const refresh = async () => {
    const result = await call(`/api/admin/seat-swap-orders?gameId=${gameId}`);
    setOrders(Array.isArray(result.orders) ? result.orders : []);
    setLoaded(true);
  };
  const toggle = async () => {
    if (open) { setOpen(false); return; }
    setOpen(true); setBusy(true); setError('');
    try { await refresh(); } catch (e: any) { setError(e?.message || 'Не удалось загрузить обмены'); }
    finally { setBusy(false); }
  };
  const order = async () => {
    if (!first || !second || first === second || busy) return;
    setBusy(true); setError('');
    try {
      await call('/api/admin/seat-swap-orders', {
        method: 'POST', body: JSON.stringify({ gameId, playerId: first, targetPlayerId: second }),
      });
      await refresh();
    } catch (e: any) { setError(e?.message || 'Не удалось оформить обмен'); }
    finally { setBusy(false); }
  };
  const act = async (id: string, kind: 'apply' | 'cancel') => {
    if (busy || kind === 'cancel' && !confirm('Отменить обмен и снять 50 ₽ долга?')) return;
    setBusy(true); setError('');
    try {
      await call(`/api/admin/seat-swap-orders/${encodeURIComponent(id)}${kind === 'apply' ? '/apply' : ''}`,
        kind === 'apply' ? { method: 'POST', body: JSON.stringify({ gameId }) } : { method: 'DELETE' });
      await refresh();
    } catch (e: any) { setError(e?.message || 'Не удалось выполнить обмен'); }
    finally { setBusy(false); }
  };
  if (!['CASUAL','NOVICE'].includes(format)) return null;
  return <section className="rounded-xl border border-border-soft bg-surface-2 p-3">
    <button type="button" onClick={() => void toggle()} aria-expanded={open}
      className="min-h-11 w-full text-left text-[12px] font-bold text-text-primary">
      Обмен местами · {open ? 'Скрыть' : 'Открыть управление'}
    </button>
    {open && <div className="space-y-3 border-t border-border-soft pt-3">
      <p className="text-[11px] text-text-secondary">Стоимость 50 ₽. Судья меняет места двух игроков без согласия второго, только до начала раздачи.</p>
      {!completed && <div className="space-y-2">
        <div className="grid grid-cols-2 gap-2">
          {[first, second].map((selection,index) => <label key={index} className="text-[11px] text-text-secondary">
            {index ? 'С кем поменять' : 'Кто покупает'}
            <select value={selection} onChange={(e) => (index ? setSecond : setFirst)(e.target.value)}
              className="mt-1 min-h-11 w-full rounded-xl bg-surface-1 px-2 text-text-primary">
              <option value="">Выбрать</option>
              {players.map(seat => <option key={seat.seat_number} value={String(seat.player_id)}>{names.get(String(seat.player_id))}</option>)}
            </select>
          </label>)}
        </div>
        <button type="button" disabled={busy || !first || !second || first === second}
          onClick={() => void order()} className="min-h-11 rounded-xl bg-accent px-3 text-xs font-bold text-white disabled:opacity-50">Оформить · 50 ₽</button>
      </div>}
      {busy && <p className="text-xs text-text-secondary">Обновление…</p>}
      {error && <p role="alert" className="text-xs text-danger">{error}</p>}
      {loaded && !orders.length && <p className="text-xs text-text-secondary">Заказов нет.</p>}
      {orders.map(item => <article key={item.id} className="rounded-xl bg-surface-1 p-3 text-xs text-text-primary">
        <p>{names.get(item.player_id) || 'Игрок'} ↔ {names.get(item.target_player_id) || 'Игрок'}</p>
        <p className="mt-1 text-text-secondary">{item.status === 'ordered' ? 'Ожидает судью' : item.status === 'applied' ? 'Выполнено' : 'Отменено'} · 50 ₽</p>
        {item.status === 'ordered' && <div className="mt-2 flex flex-wrap gap-2">
          <button type="button" disabled={busy} onClick={() => void act(item.id, 'apply')}
            className="min-h-10 rounded-xl bg-accent px-3 text-white disabled:opacity-50">Поменять местами</button>
          <button type="button" disabled={busy} onClick={() => void act(item.id, 'cancel')}
            className="min-h-10 rounded-xl border border-danger/30 px-3 text-danger disabled:opacity-50">Отменить</button>
        </div>}
      </article>)}
    </div>}
  </section>;
}
