import { useEffect, useState } from 'react';
import { getJson } from '../../lib/requestJson.ts';

type Seat = { seat_number: number; player_id: string | null; nickname: string };
type Order = { id: string; game_id: number; target_player_id: string; status: string };

/** Buyer requests a seat exchange; only the assigned judge executes it. */
export default function PlayerGameSeatSwapOrder({ gameId, seats, ownSeat, canOrder }: {
  gameId: number; seats: Seat[]; ownSeat: number | null; canOrder: boolean;
}) {
  const [target, setTarget] = useState('');
  const [orders, setOrders] = useState<Order[]>([]);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    void getJson<{ orders: Order[] }>('/api/player/seat-swap-orders', 'Не удалось загрузить обмены', { cache: 'no-store' })
      .then((body) => { if (active) setOrders((Array.isArray(body.orders) ? body.orders : []).filter(
        (item) => item.game_id === gameId && item.status !== 'cancelled',
      )); })
      .catch(() => undefined)
      .finally(() => { if (active) setLoaded(true); });
    return () => { active = false; };
  }, [gameId]);
  const create = async () => {
    if (!target || busy) return;
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/player/seat-swap-orders', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId, targetPlayerId: target }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || 'Не удалось заказать обмен');
      setOrders((previous) => [...previous, { id: String(body.orderId), game_id: gameId, target_player_id: target, status: 'ordered' }]);
      setTarget('');
    } catch (cause: any) { setError(cause?.message || 'Не удалось заказать обмен'); }
    finally { setBusy(false); }
  };
  const others = seats.filter((seat) => seat.player_id && seat.seat_number !== ownSeat);
  if (ownSeat == null || !loaded || (!canOrder && !orders.length)) return null;
  return <section className="mt-3 rounded-xl border border-white/10 bg-white/[0.035] p-3">
    <div className="flex items-center justify-between gap-2">
      <h4 className="text-xs font-semibold text-white">Обменяться местами</h4>
      <span className="text-xs text-white/70">50 ₽</span>
    </div>
    <p className="mt-1 text-[11px] text-white/45">Судья поменяет вас местами с выбранным игроком до начала раздачи.</p>
    {canOrder && others.length > 0 && <div className="mt-2 space-y-2">
      <select aria-label="С кем обменяться местами" value={target} onChange={(e) => setTarget(e.target.value)}
        className="min-h-11 w-full rounded-xl border border-white/15 bg-[#202126] px-3 text-xs text-white">
        <option value="">Выберите игрока</option>
        {others.map((seat) => <option key={seat.seat_number} value={String(seat.player_id)}>
          №{seat.seat_number} · {seat.nickname}
        </option>)}
      </select>
      <button type="button" disabled={busy || !target} onClick={() => void create()}
        className="min-h-11 rounded-xl bg-white px-4 text-xs font-bold text-black disabled:opacity-50">
        {busy ? 'Оформляем…' : 'Заказать · 50 ₽'}
      </button>
    </div>}
    {error && <p role="alert" className="mt-2 text-xs text-amber-100">{error}</p>}
    {orders.map((order) => <p key={order.id} className="mt-2 rounded-lg bg-black/20 p-2 text-[11px] text-white/65">
      {order.status === 'applied' ? 'Обмен выполнен' : 'Обмен ожидает судью'} · 50 ₽
    </p>)}
  </section>;
}
