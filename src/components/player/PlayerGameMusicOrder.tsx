import { useEffect, useState } from 'react';
import { getJson } from '../../lib/requestJson.ts';
import OrderPaymentChoice, { type OrderPayment } from './OrderPaymentChoice.tsx';

type Order = { id: string; game_id: number; track_reference: string; status: string };

export default function PlayerGameMusicOrder({ gameId, canOrder }: { gameId: number; canOrder: boolean }) {
  const [track, setTrack] = useState('');
  const [orders, setOrders] = useState<Order[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [payment, setPayment] = useState<OrderPayment>('rubles');
  const [paidCount, setPaidCount] = useState(0);
  const refresh = async () => {
    const body = await getJson<{ orders: Order[] }>('/api/player/music-orders', 'Не удалось загрузить заказы', { cache: 'no-store' });
    setOrders((Array.isArray(body.orders) ? body.orders : []).filter((item) => item.game_id === gameId && item.status !== 'cancelled'));
  };
  useEffect(() => {
    let active = true;
    void getJson<{ orders: Order[] }>('/api/player/music-orders', 'Не удалось загрузить заказы', { cache: 'no-store' })
      .then((body) => { if (active) setOrders((Array.isArray(body.orders) ? body.orders : []).filter((item) => item.game_id === gameId && item.status !== 'cancelled')); })
      .catch(() => { /* No details if session has expired. Checkout still verifies authentication. */ })
      .finally(() => { if (active) setLoaded(true); });
    return () => { active = false; };
  }, [gameId]);
  const submit = async () => {
    if (busy || !track.trim()) return;
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/player/music-orders', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId, track, payment }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || 'Не удалось заказать песню');
      setTrack(''); setPaidCount((count) => count + 1);
      await refresh();
    } catch (e: any) { setError(e?.message || 'Не удалось заказать песню'); }
    finally { setBusy(false); }
  };
  return <section className="mt-3 rounded-xl border border-white/10 bg-white/[0.035] p-3">
    <div className="flex items-center justify-between gap-2">
      <h4 className="text-xs font-semibold text-white">Заказать музыку</h4>
      <span className="text-xs text-white/70">50 ₽</span>
    </div>
    <p className="mt-1 text-[11px] text-white/45">Судья включит песню вручную. Рубли добавляются к долгу за вечер, жетоны списываются сразу.</p>
    {canOrder && <div className="mt-2 space-y-2">
      <label className="block text-[11px] text-white/60">Ссылка Яндекс Музыки
        <input type="url" maxLength={500} value={track} onChange={(e) => setTrack(e.target.value)}
          placeholder="https://music.yandex.ru/album/…"
          className="mt-1 min-h-11 w-full rounded-xl border border-white/10 bg-[#202126] px-3 text-xs text-white" />
      </label>
      <OrderPaymentChoice kind="music" rubles={50} value={payment} onChange={setPayment} refreshKey={paidCount} />
      <button type="button" disabled={busy || !track.trim()} onClick={() => void submit()}
        className="min-h-11 rounded-xl bg-white px-4 text-xs font-bold text-black disabled:opacity-50">
        {busy ? 'Оформляем…' : payment === 'tokens' ? 'Заказать за жетоны' : 'Заказать · 50 ₽'}
      </button>
    </div>}
    {error && <p role="alert" className="mt-2 text-xs text-amber-100">{error}</p>}
    {loaded && orders.length > 0 && <div className="mt-3 space-y-1.5">
      {orders.map((item) => <div key={item.id} className="rounded-lg bg-black/20 px-2 py-2 text-[11px] text-white/65">
        <p className="truncate">{item.track_reference}</p>
        <p className="mt-1 text-white/40">{item.status === 'played' ? 'Исполнено' : 'Заказ принят'}</p>
      </div>)}
    </div>}
  </section>;
}
