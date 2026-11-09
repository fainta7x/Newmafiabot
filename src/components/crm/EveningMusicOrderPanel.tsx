import { useState } from 'react';
import { organizerHeaders } from '../../lib/organizerAuth.ts';
import { readJsonResponse } from '../../lib/requestJson.ts';
import { appConfirm } from '../../lib/appConfirm.ts';

type Song = {
  id: string; player_id: string; track_reference: string;
  status: 'ordered' | 'played' | 'cancelled'; amount_rub: number;
};
type Seat = { seat_number: number; player_id?: string | null; display_name?: string; nickname?: string };

async function action(url: string, init: RequestInit = {}) {
  const response = await fetch(url, {
    ...init, credentials: 'include',
    headers: { ...organizerHeaders(Boolean(init.body)), ...(init.headers || {}) },
  });
  return readJsonResponse(response, 'Не удалось обработать музыкальный заказ');
}

/** Judge starts the track outside the app, then confirms performance. */
export default function EveningMusicOrderPanel({ gameId, seats, completed }: {
  gameId: number; seats: Seat[]; completed: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [orders, setOrders] = useState<Song[]>([]);
  const [playerId, setPlayerId] = useState('');
  const [track, setTrack] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);
  const names = new Map(seats.filter((seat) => seat.player_id)
    .map((seat) => [String(seat.player_id), seat.display_name || seat.nickname || `№${seat.seat_number}`]));
  const refresh = async () => {
    const value = await action(`/api/admin/music-orders?gameId=${gameId}`);
    setOrders(Array.isArray(value.orders) ? value.orders : []);
    setLoaded(true);
  };
  const toggle = async () => {
    if (open) return setOpen(false);
    setOpen(true); setBusy(true); setError('');
    try { await refresh(); } catch (e: any) { setError(e?.message || 'Не удалось загрузить заказы'); }
    finally { setBusy(false); }
  };
  const order = async () => {
    if (!playerId || !track.trim() || busy) return;
    setBusy(true); setError('');
    try {
      await action('/api/admin/music-orders', { method: 'POST', body: JSON.stringify({ gameId, playerId, track }) });
      setTrack('');
      await refresh();
    } catch (e: any) { setError(e?.message || 'Не удалось оформить заказ'); }
    finally { setBusy(false); }
  };
  const change = async (id: string, kind: 'played' | 'cancel') => {
    if (busy) return;
    if (kind === 'cancel' && !await appConfirm('Отменить заказ музыки и снять 50 ₽ с долга?')) return;
    setBusy(true); setError('');
    try {
      await action(`/api/admin/music-orders/${encodeURIComponent(id)}${kind === 'played' ? '/played' : ''}`,
        kind === 'played' ? { method: 'POST', body: JSON.stringify({ gameId }) } : { method: 'DELETE' });
      await refresh();
    } catch (e: any) { setError(e?.message || 'Не удалось изменить заказ'); }
    finally { setBusy(false); }
  };
  return <section className="rounded-xl border border-border-soft bg-surface-2 p-3">
    <button type="button" onClick={() => void toggle()} aria-expanded={open}
      className="min-h-11 w-full text-left text-[12px] font-bold text-text-primary">
      Музыка · {open ? 'Скрыть заказы' : 'Открыть заказы'}
    </button>
    {open && <div className="space-y-3 border-t border-border-soft pt-3">
      <p className="text-[11px] text-text-secondary">50 ₽ за трек. Игрок может назвать песню голосом, судья запускает её вручную.</p>
      {!completed && <div className="space-y-2">
        <label className="block text-[11px] text-text-secondary">Игрок
          <select value={playerId} onChange={(e) => setPlayerId(e.target.value)}
            className="mt-1 min-h-11 w-full rounded-xl bg-surface-1 px-2 text-text-primary">
            <option value="">Выбрать игрока</option>
            {seats.filter((seat) => seat.player_id).map((seat) => <option key={seat.seat_number} value={String(seat.player_id)}>
              №{seat.seat_number} · {names.get(String(seat.player_id))}
            </option>)}
          </select>
        </label>
        <label className="block text-[11px] text-text-secondary">Название песни или ссылка
          <input value={track} maxLength={500} onChange={(e) => setTrack(e.target.value)}
            className="mt-1 min-h-11 w-full rounded-xl bg-surface-1 px-3 text-text-primary" placeholder="Что включить?" />
        </label>
        <button type="button" onClick={() => void order()} disabled={busy || !playerId || !track.trim()}
          className="min-h-11 rounded-xl bg-accent px-3 text-xs font-bold text-white disabled:opacity-50">Заказать · 50 ₽</button>
      </div>}
      {busy && <p className="text-xs text-text-secondary">Обновление…</p>}
      {error && <p role="alert" className="text-xs text-danger">{error}</p>}
      {loaded && !orders.length && <p className="text-xs text-text-secondary">Заказов нет.</p>}
      {orders.map((item) => <article key={item.id} className="rounded-xl bg-surface-1 p-3 text-xs text-text-primary">
        <p className="font-bold">{names.get(item.player_id) || 'Игрок'}</p>
        <p className="mt-1 break-all text-text-secondary">{item.track_reference}</p>
        <p className="mt-1 text-text-muted">{item.status === 'ordered' ? 'Ожидает исполнения' : item.status === 'played' ? 'Исполнено' : 'Отменено'} · 50 ₽</p>
        {item.status === 'ordered' && <div className="mt-2 flex flex-wrap gap-2">
          <button type="button" disabled={busy} onClick={() => void change(item.id, 'played')}
            className="min-h-10 rounded-xl bg-accent px-3 text-white disabled:opacity-50">Отметить исполненным</button>
          <button type="button" disabled={busy} onClick={() => void change(item.id, 'cancel')}
            className="min-h-10 rounded-xl border border-danger/30 px-3 text-danger disabled:opacity-50">Отменить</button>
        </div>}
      </article>)}
    </div>}
  </section>;
}
