import { useEffect, useState } from 'react';
import { getJson } from '../../lib/requestJson.ts';

type Order = { id: string; game_id: number; role: string; status: string };

const ROLES = [
  { value: 'citizen', label: 'Мирный житель' },
  { value: 'mafia', label: 'Мафия' },
  { value: 'don', label: 'Дон' },
  { value: 'sheriff', label: 'Шериф' },
] as const;

/**
 * Contextual purchase for a specific upcoming game in the personal cabinet.
 * All availability checks are on the server. Never fetch other buyers' orders.
 */
export default function PlayerGameRolePurchase({ gameId }: { gameId: number }) {
  const [role, setRole] = useState<string>('citizen');
  const [order, setOrder] = useState<Order | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    let active = true;
    setLoaded(false);
    setOrder(null);
    setSuccess(false);
    void getJson('/api/player/role-purchases', 'Не удалось загрузить покупки', { cache: 'no-store' })
      .then((body: any) => {
        if (!active) return;
        setOrder((Array.isArray(body?.orders) ? body.orders : []).find(
          (item: Order) => Number(item.game_id) === gameId && item.status !== 'cancelled',
        ) || null);
        setLoaded(true);
      })
      .catch(() => { if (active) setLoaded(true); });
    return () => { active = false; };
  }, [gameId]);

  const purchase = async () => {
    if (busy || order) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/player/role-purchases', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId, role }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body?.accepted) throw new Error(body?.error || 'Не удалось оформить покупку');
      setSuccess(true);
      setOrder({ id: String(body.orderId), game_id: gameId, role, status: 'processing' });
    } catch (cause: any) {
      setError(cause?.message || 'Не удалось оформить покупку');
    } finally { setBusy(false); }
  };

  if (!loaded) return null;
  if (order || success) {
    const label = ROLES.find((item) => item.value === order?.role)?.label || 'роль';
    return <div className="mt-3 rounded-xl border border-emerald-300/15 bg-emerald-300/[0.06] px-3 py-2 text-xs text-emerald-100">
      Покупка оформлена · {label} · 150 ₽
    </div>;
  }
  return <div className="mt-3 rounded-xl border border-white/[0.1] bg-white/[0.035] p-3">
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs font-semibold text-white">Купить роль для этой игры</span>
      <span className="text-xs text-white/70">150 ₽</span>
    </div>
    <p className="mt-1 text-[11px] text-white/45">Покупка прибавится к долгу за вечер. Другие игроки её не увидят.</p>
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
