import { useCallback, useState } from 'react';
import { organizerHeaders } from '../../lib/organizerAuth.ts';
import { readJsonResponse } from '../../lib/requestJson.ts';
import { appConfirm } from '../../lib/appConfirm.ts';

type Seat = { seat_number: number; player_id?: string | null; display_name?: string; nickname?: string };
type Purchase = {
  id: string; player_id: string; role: string; status: 'reserved' | 'deferred' | 'fulfilled' | 'cancelled';
  amount_rub: number; created_at: string;
};

const roles = [
  { value: 'citizen', label: 'Мирный житель' },
  { value: 'mafia', label: 'Мафия' },
  { value: 'don', label: 'Дон' },
  { value: 'sheriff', label: 'Шериф' },
] as const;

const roleLabel = (value: string) => roles.find((item) => item.value === value)?.label || value;
const statusLabel = (value: Purchase['status']) =>
  value === 'reserved' ? 'Забронировано'
    : value === 'fulfilled' ? 'Исполнено'
      : value === 'deferred' ? 'Ожидает выбора другой игры' : 'Отменено';

async function organizerJson(url: string, init: RequestInit = {}) {
  const response = await fetch(url, {
    ...init, credentials: 'include', headers: { ...organizerHeaders(Boolean(init.body)), ...(init.headers || {}) },
  });
  return readJsonResponse(response, 'Не удалось обработать покупку');
}

/** Opens only on an explicit admin action — no automatic notifications to a playing organizer. */
export default function EveningRolePurchasePanel({ gameId, seats, completed }: {
  gameId: number; seats: Seat[]; completed: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [orders, setOrders] = useState<Purchase[]>([]);
  const [playerId, setPlayerId] = useState('');
  const [role, setRole] = useState('citizen');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    const data = await organizerJson(`/api/admin/role-purchases?gameId=${gameId}`);
    setOrders(Array.isArray(data.orders) ? data.orders : []);
    setLoaded(true);
  }, [gameId]);

  const toggle = async () => {
    if (open) { setOpen(false); return; }
    setOpen(true);
    setError('');
    setBusy(true);
    try { await refresh(); } catch (cause: any) { setError(cause?.message || 'Не удалось загрузить покупки'); }
    finally { setBusy(false); }
  };

  const create = async () => {
    if (!playerId || busy) return;
    setBusy(true); setError('');
    try {
      await organizerJson('/api/admin/role-purchases', {
        method: 'POST', body: JSON.stringify({ gameId, playerId, role }),
      });
      await refresh();
    } catch (cause: any) { setError(cause?.message || 'Не удалось оформить покупку'); }
    finally { setBusy(false); }
  };

  const cancel = async (orderId: string) => {
    if (busy || !await appConfirm('Отменить покупку и снять долг 150 ₽?')) return;
    setBusy(true); setError('');
    try {
      await organizerJson(`/api/admin/role-purchases/${encodeURIComponent(orderId)}`, { method: 'DELETE' });
      await refresh();
    } catch (cause: any) { setError(cause?.message || 'Не удалось отменить покупку'); }
    finally { setBusy(false); }
  };

  const eligible = seats.filter((seat) => Boolean(seat.player_id));
  const nameById = new Map(eligible.map((seat) => [String(seat.player_id), String(seat.display_name || seat.nickname || `№${seat.seat_number}`)]));
  return <div className="rounded-xl border border-border-soft bg-surface-2 p-3">
    <button type="button" onClick={() => void toggle()} className="min-h-11 w-full text-left text-[12px] font-bold text-text-primary" aria-expanded={open}>
      Покупки ролей · {open ? 'Скрыть' : 'Открыть управление'}
    </button>
    {open && <div className="space-y-3 border-t border-border-soft pt-3">
      <p className="text-[11px] text-text-secondary">Заказы видны только в этом административном окне. Покупки игроков не транслируются на игровой экран.</p>
      {!completed && <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto]">
        <label className="text-[11px] text-text-secondary">Игрок
          <select value={playerId} onChange={(e) => setPlayerId(e.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-border-soft bg-surface-1 px-2 text-text-primary">
            <option value="">Выберите игрока</option>
            {eligible.map((seat) => <option key={seat.seat_number} value={String(seat.player_id)}>№{seat.seat_number} · {nameById.get(String(seat.player_id))}</option>)}
          </select>
        </label>
        <label className="text-[11px] text-text-secondary">Роль
          <select value={role} onChange={(e) => setRole(e.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-border-soft bg-surface-1 px-2 text-text-primary">
            {roles.map((entry) => <option key={entry.value} value={entry.value}>{entry.label}</option>)}
          </select>
        </label>
        <button type="button" disabled={busy || !playerId || !eligible.length} onClick={() => void create()}
          className="min-h-11 self-end rounded-xl bg-accent px-3 text-[12px] font-bold text-white disabled:opacity-50">
          Оформить · 150 ₽
        </button>
      </div>}
      {busy && <p className="text-xs text-text-secondary">Обновляем…</p>}
      {error && <p role="alert" className="text-xs text-danger">{error}</p>}
      {loaded && orders.length === 0 && <p className="text-xs text-text-secondary">Покупок для этой игры нет.</p>}
      {orders.map((order) => <div key={order.id} className="flex items-center justify-between gap-2 rounded-xl bg-surface-1 p-3">
        <div className="min-w-0 text-[11px] text-text-primary">
          <div className="font-bold">{nameById.get(order.player_id) || 'Участник'}</div>
          <div className="text-text-secondary">{roleLabel(order.role)} · {statusLabel(order.status)} · {order.amount_rub} ₽</div>
        </div>
        {(order.status === 'reserved' || order.status === 'deferred') && <button type="button" disabled={busy}
          onClick={() => void cancel(order.id)} className="min-h-10 shrink-0 rounded-xl border border-danger/30 px-3 text-[11px] font-bold text-danger disabled:opacity-50">Отменить</button>}
      </div>)}
    </div>}
  </div>;
}
