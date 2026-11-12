import { useEffect, useState } from 'react';
import { getJson } from '../../lib/requestJson.ts';
import OrderPaymentChoice, { type OrderPayment } from './OrderPaymentChoice.tsx';

type Order = { id: string; game_id: number; role: string; status: string };
type FutureGame = { id: number; number: number };

const ROLES = [
  { value: 'citizen', label: 'Мирный житель' },
  { value: 'mafia', label: 'Мафия' },
  { value: 'don', label: 'Дон' },
  { value: 'sheriff', label: 'Шериф' },
] as const;

/**
 * One personal purchase surface reused by upcoming and just-completed games.
 * The server never sends another buyer's purchases or role availability here.
 */
export default function PlayerGameRolePurchase({
  gameId, canPurchase, futureGames,
}: { gameId: number; canPurchase: boolean; futureGames: FutureGame[] }) {
  const [role, setRole] = useState<string>('citizen');
  const [nextGame, setNextGame] = useState<string>('');
  const [order, setOrder] = useState<Order | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [transferred, setTransferred] = useState(false);
  const [payment, setPayment] = useState<OrderPayment>('rubles');

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const body: any = await getJson('/api/player/role-purchases', 'Не удалось загрузить покупки', { cache: 'no-store' });
        if (!active) return;
        setOrder((Array.isArray(body?.orders) ? body.orders : []).find(
          (item: Order) => Number(item.game_id) === gameId && item.status !== 'cancelled',
        ) || null);
      } catch { /* Purchase controls still work when this read cannot be loaded. */ }
      finally { if (active) setLoaded(true); }
    };
    setLoaded(false);
    setOrder(null);
    setTransferred(false);
    void refresh();
    window.addEventListener('role-purchases-changed', refresh);
    return () => { active = false; window.removeEventListener('role-purchases-changed', refresh); };
  }, [gameId]);

  const purchase = async () => {
    if (busy || order) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/player/role-purchases', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId, role, payment }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body?.accepted) throw new Error(body?.error || 'Не удалось оформить покупку');
      setOrder({ id: String(body.orderId), game_id: gameId, role, status: 'processing' });
      window.dispatchEvent(new Event('role-purchases-changed'));
    } catch (cause: any) {
      setError(cause?.message || 'Не удалось оформить покупку');
    } finally { setBusy(false); }
  };

  const transfer = async () => {
    if (!order || busy || !nextGame) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch(`/api/player/role-purchases/${encodeURIComponent(order.id)}/select-game`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId: Number(nextGame) }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body?.accepted) throw new Error(body?.error || 'Не удалось выбрать игру');
      setTransferred(true);
      setOrder(null);
      window.dispatchEvent(new Event('role-purchases-changed'));
    } catch (cause: any) {
      setError(cause?.message || 'Не удалось выбрать игру');
    } finally { setBusy(false); }
  };

  if (!loaded || transferred) return null;
  if (order) {
    const label = ROLES.find((item) => item.value === order.role)?.label || 'роль';
    if (order.status === 'deferred' && !canPurchase) {
      return <div className="mt-3 rounded-xl border border-amber-200/15 bg-amber-200/[0.05] p-3 text-xs">
        <p className="font-semibold text-amber-100">Выберите другую игру для покупки · {label}</p>
        <p className="mt-1 text-white/55">Заказ 150 ₽ уже оформлен. Повторно платить не нужно.</p>
        {futureGames.length ? <div className="mt-2 flex gap-2">
          <select aria-label="Игра для переноса покупки" value={nextGame} onChange={(event) => setNextGame(event.target.value)}
            disabled={busy} className="min-h-11 min-w-0 flex-1 rounded-xl bg-[#202126] px-3 text-xs text-white">
            <option value="">Выбрать игру</option>
            {futureGames.map((game) => <option key={game.id} value={game.id}>Игра {game.number}</option>)}
          </select>
          <button type="button" disabled={busy || !nextGame} onClick={() => void transfer()}
            className="min-h-11 rounded-xl bg-white px-3 font-semibold text-black disabled:opacity-40">
            Перенести
          </button>
        </div> : <p className="mt-2 text-white/50">Подходящая игра пока не создана.</p>}
        {error && <p role="alert" className="mt-2 text-amber-100">{error}</p>}
      </div>;
    }
    return <div className="mt-3 rounded-xl border border-emerald-300/15 bg-emerald-300/[0.06] px-3 py-2 text-xs text-emerald-100">
      Покупка оформлена · {label} · 150 ₽
    </div>;
  }
  if (!canPurchase) return null;
  return <div className="mt-3 rounded-xl border border-white/[0.1] bg-white/[0.035] p-3">
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs font-semibold text-white">Купить роль для этой игры</span>
      <span className="text-xs text-white/70">150 ₽</span>
    </div>
    <p className="mt-1 text-[11px] text-white/45">Рубли прибавятся к долгу за вечер, жетоны спишутся сразу. Другие игроки покупку не увидят.</p>
    <OrderPaymentChoice kind="role" rubles={150} value={payment} onChange={setPayment} />
    <div className="mt-2 flex flex-wrap gap-2">
      <select aria-label="Роль для покупки" value={role} onChange={(event) => setRole(event.target.value)}
        disabled={busy} className="min-h-11 min-w-0 flex-1 rounded-xl border border-white/15 bg-[#202126] px-3 text-xs text-white">
        {ROLES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
      </select>
      <button type="button" disabled={busy} onClick={() => void purchase()}
        className="min-h-11 rounded-xl bg-white px-4 text-xs font-semibold text-black disabled:opacity-40">
        {busy ? 'Оформляем…' : 'Купить'}
      </button>
    </div>
    {error && <p role="alert" className="mt-2 text-xs text-amber-100">{error}</p>}
  </div>;
}
