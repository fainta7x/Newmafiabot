import React, { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, CheckCircle2, CreditCard, UserPlus, Users, X } from 'lucide-react';
import { api, type Player } from '../../../lib/api.ts';

type PaymentState = 'unpaid' | 'pending' | 'confirmed' | 'rejected' | 'waived' | 'refunded';

type Registration = {
  id: string;
  player_id: string;
  nickname: string;
  status: 'confirmed' | 'reserve' | 'cancelled' | 'declined';
  slot_number: number | null;
  queue_order: number | null;
  payment_state: PaymentState;
  payment_note?: string | null;
  organizer_note?: string | null;
  reported_amount_rub?: number | null;
  confirmed_amount_rub?: number | null;
};

type TournamentDetail = {
  id: string;
  status: string;
  judge_player_id?: string | null;
  confirmed_count: number;
  remaining_places: number;
  entry_fee_rub: number;
  confirmed: Registration[];
  reserves: Registration[];
  payment_totals?: {
    expected_rub: number;
    reported_rub: number;
    confirmed_rub: number;
    unpaid_count: number;
  };
};

interface Props {
  tournamentId: string;
  onChanged?: () => void;
}

const organizerHeaders = () => {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('organizer_token');
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  return headers;
};

const paymentLabels: Record<PaymentState, string> = {
  unpaid: 'Не оплачен',
  pending: 'Заявлена оплата',
  confirmed: 'Оплачен',
  rejected: 'Оплата отклонена',
  waived: 'Без взноса',
  refunded: 'Возврат',
};
const organizerPaymentStates: PaymentState[] = ['unpaid', 'confirmed', 'rejected', 'waived', 'refunded'];

export const TournamentParticipantsPanel: React.FC<Props> = ({ tournamentId, onChanged }) => {
  const [detail, setDetail] = useState<TournamentDetail | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [selectedPlayerId, setSelectedPlayerId] = useState('');
  const [reason, setReason] = useState('');
  const [reserveOrder, setReserveOrder] = useState<Registration[]>([]);
  const [busyKey, setBusyKey] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = async () => {
    const response = await fetch(`/api/tournaments/evenings/${encodeURIComponent(tournamentId)}`, {
      credentials: 'include', headers: organizerHeaders(),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || 'Не удалось загрузить участников турнира');
    setDetail(body);
    setReserveOrder(Array.isArray(body.reserves) ? body.reserves : []);
  };

  useEffect(() => {
    let cancelled = false;
    Promise.all([load(), api.getPlayers()])
      .then(([, nextPlayers]) => {
        if (!cancelled) setPlayers(nextPlayers);
      })
      .catch((err: any) => { if (!cancelled) setError(err.message || 'Не удалось загрузить участников'); });
    return () => { cancelled = true; };
  }, [tournamentId]);

  const activePlayerIds = useMemo(() => new Set([
    ...(detail?.confirmed || []).map((row) => row.player_id),
    ...(detail?.reserves || []).map((row) => row.player_id),
  ]), [detail]);

  const eligiblePlayers = useMemo(() => players
    .filter((player) => player.game_level === 'tournament')
    .filter((player) => player.id !== detail?.judge_player_id)
    .filter((player) => !activePlayerIds.has(player.id))
    .slice()
    .sort((a, b) => a.nickname.localeCompare(b.nickname, 'ru')), [players, detail?.judge_player_id, activePlayerIds]);

  const mutate = async (key: string, url: string, method: 'POST' | 'PUT', payload: unknown, success: string) => {
    if (busyKey) return;
    setBusyKey(key); setError(null); setMessage(null);
    try {
      const response = await fetch(url, {
        method, credentials: 'include', headers: organizerHeaders(), body: JSON.stringify(payload),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Не удалось выполнить действие');
      await load();
      onChanged?.();
      setMessage(success);
    } catch (err: any) {
      setError(err.message || 'Не удалось выполнить действие');
    } finally {
      setBusyKey('');
    }
  };

  const requireReason = () => {
    if (reason.trim()) return true;
    setError('Для ручного изменения состава укажите причину.');
    return false;
  };

  const addPlayer = async () => {
    if (!selectedPlayerId || !requireReason()) return;
    await mutate('add', `/api/tournaments/evenings/${encodeURIComponent(tournamentId)}/players/${encodeURIComponent(selectedPlayerId)}/add`, 'POST', { reason: reason.trim() }, 'Игрок добавлен в турнир.');
    setSelectedPlayerId('');
  };

  const removePlayer = async (playerId: string) => {
    if (!requireReason()) return;
    await mutate(`remove:${playerId}`, `/api/tournaments/evenings/${encodeURIComponent(tournamentId)}/players/${encodeURIComponent(playerId)}/remove`, 'POST', { reason: reason.trim() }, 'Игрок снят с турнира.');
  };

  const promote = async (playerId: string) => {
    if (!requireReason()) return;
    await mutate(`promote:${playerId}`, `/api/tournaments/evenings/${encodeURIComponent(tournamentId)}/players/${encodeURIComponent(playerId)}/promote`, 'POST', { reason: reason.trim() }, 'Игрок переведён из резерва в основной состав.');
  };

  const saveReserveOrder = async () => {
    if (!requireReason()) return;
    await mutate('reserve-order', `/api/tournaments/evenings/${encodeURIComponent(tournamentId)}/reserve-order`, 'PUT', {
      registration_ids: reserveOrder.map((row) => row.id), reason: reason.trim(),
    }, 'Порядок резерва сохранён.');
  };

  const updatePayment = async (row: Registration, state: PaymentState) => {
    if (state === 'pending') return;
    const payload: { state: PaymentState; amount_rub?: number; note?: string } = { state };
    if (state === 'confirmed' || state === 'refunded') {
      const defaultAmount = state === 'confirmed'
        ? row.reported_amount_rub ?? row.confirmed_amount_rub ?? detail?.entry_fee_rub ?? 0
        : row.confirmed_amount_rub ?? row.reported_amount_rub ?? 0;
      const rawAmount = window.prompt(
        state === 'confirmed' ? 'Фактически подтверждённая сумма, ₽' : 'Сумма возврата, ₽',
        String(defaultAmount),
      );
      if (rawAmount === null) return;
      const amount = Number(rawAmount);
      if (!Number.isInteger(amount) || amount < 0) {
        setError('Сумма должна быть неотрицательным целым числом рублей.');
        return;
      }
      const note = window.prompt('Комментарий / причина изменения суммы', row.organizer_note || '');
      if (note === null) return;
      if (!note.trim()) {
        setError('Для изменения подтверждённой суммы укажите комментарий.');
        return;
      }
      payload.amount_rub = amount;
      payload.note = note.trim();
    } else {
      const note = window.prompt('Комментарий организатора (необязательно)', row.organizer_note || '');
      if (note === null) return;
      if (note.trim()) payload.note = note.trim();
    }
    await mutate(`payment:${row.player_id}`, `/api/tournaments/evenings/${encodeURIComponent(tournamentId)}/players/${encodeURIComponent(row.player_id)}/payment`, 'POST', payload, `Статус оплаты: ${paymentLabels[state]}.`);
  };

  const moveReserve = (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= reserveOrder.length) return;
    setReserveOrder((current) => {
      const next = [...current];
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      return next;
    });
  };

  const locked = detail?.status !== 'draft';
  const payment = detail?.payment_totals;

  return (
    <section className="rounded-[18px] border border-border-soft bg-surface-1 p-3.5" data-testid="tournament-participants-panel">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent"><Users className="h-5 w-5" /></span>
        <div className="min-w-0 flex-1">
          <h3 className="text-[12px] font-black uppercase tracking-wider text-text-primary">Участники · 10 мест + резерв</h3>
          <p className="mt-1 text-[11px] leading-4 text-text-muted">Основной состав синхронизируется с турнирным движком. При снятии игрока свободное место автоматически получает первый в резерве.</p>
        </div>
      </div>

      {detail ? (
        <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] sm:grid-cols-4">
          <div className="rounded-xl bg-surface-2 px-3 py-2"><div className="text-text-muted">Основной состав</div><div className="mt-0.5 font-black text-text-primary">{detail.confirmed_count}/10</div></div>
          <div className="rounded-xl bg-surface-2 px-3 py-2"><div className="text-text-muted">Резерв</div><div className="mt-0.5 font-black text-text-primary">{detail.reserves.length}</div></div>
          <div className="rounded-xl bg-surface-2 px-3 py-2"><div className="text-text-muted">Подтверждено оплат</div><div className="mt-0.5 font-black text-text-primary">{payment?.confirmed_rub || 0} ₽</div></div>
          <div className="rounded-xl bg-surface-2 px-3 py-2"><div className="text-text-muted">Ожидается</div><div className="mt-0.5 font-black text-text-primary">{payment?.expected_rub || 0} ₽</div></div>
        </div>
      ) : null}

      {locked ? <div className="mt-3 rounded-xl bg-warning-soft px-3 py-2 text-[11px] font-bold text-warning">Состав заблокирован после запуска турнира. Оплаты можно продолжать отмечать отдельно.</div> : null}
      {message ? <div className="mt-3 rounded-xl bg-success-soft px-3 py-2 text-[11px] font-bold text-success">{message}</div> : null}
      {error ? <div className="mt-3 rounded-xl bg-danger-soft px-3 py-2 text-[11px] font-bold text-danger">{error}</div> : null}

      {!locked ? (
        <div className="mt-3 space-y-2 rounded-xl border border-border-soft bg-surface-2 p-3">
          <label className="block text-[10px] font-black uppercase tracking-wide text-text-muted">Причина ручного изменения состава</label>
          <input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Например: регистрация по телефону / замена игрока" className="min-h-[42px] w-full rounded-xl border border-border-soft bg-surface-1 px-3 text-sm text-text-primary" />
          <div className="flex gap-2">
            <select value={selectedPlayerId} onChange={(event) => setSelectedPlayerId(event.target.value)} className="min-h-[44px] min-w-0 flex-1 rounded-xl border border-border-soft bg-surface-1 px-3 text-sm text-text-primary">
              <option value="">Выбрать турнирного игрока…</option>
              {eligiblePlayers.map((player) => <option key={player.id} value={player.id}>{player.nickname}</option>)}
            </select>
            <button type="button" disabled={!selectedPlayerId || !!busyKey} onClick={() => void addPlayer()} className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-accent text-white disabled:opacity-40" aria-label="Добавить игрока"><UserPlus className="h-4 w-4" /></button>
          </div>
        </div>
      ) : null}

      <div className="mt-4 space-y-2">
        <h4 className="text-[11px] font-black uppercase tracking-wide text-text-muted">Основной состав</h4>
        {Array.from({ length: 10 }, (_, index) => {
          const row = detail?.confirmed.find((item) => Number(item.slot_number) === index + 1);
          return (
            <div key={index} className="flex min-h-[50px] items-center gap-2 rounded-xl border border-border-soft bg-surface-2 px-3 py-2">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-surface-1 text-[11px] font-black text-text-muted">{index + 1}</span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[12px] font-bold text-text-primary">{row?.nickname || 'Свободное место'}</div>
                {row ? <div className="text-[10px] text-text-muted">{paymentLabels[row.payment_state || 'unpaid']}{row.reported_amount_rub != null ? ` · заявлено ${row.reported_amount_rub} ₽` : ''}{row.confirmed_amount_rub != null ? ` · подтверждено ${row.confirmed_amount_rub} ₽` : ''}</div> : null}
              </div>
              {row ? (
                <>
                  <select value={row.payment_state || 'unpaid'} disabled={!!busyKey} onChange={(event) => void updatePayment(row, event.target.value as PaymentState)} className="max-w-[145px] rounded-lg border border-border-soft bg-surface-1 px-2 py-1.5 text-[10px] text-text-primary">
                    {row.payment_state === 'pending' ? <option value="pending" disabled>{paymentLabels.pending}</option> : null}
                    {organizerPaymentStates.map((value) => <option key={value} value={value}>{paymentLabels[value]}</option>)}
                  </select>
                  {!locked ? <button type="button" disabled={!!busyKey} onClick={() => void removePlayer(row.player_id)} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-danger hover:bg-danger-soft" aria-label={`Снять ${row.nickname}`}><X className="h-4 w-4" /></button> : null}
                </>
              ) : <span className="text-[10px] font-bold text-success">Свободно</span>}
            </div>
          );
        })}
      </div>

      <div className="mt-4 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-[11px] font-black uppercase tracking-wide text-text-muted">Резерв</h4>
          {!locked && reserveOrder.length > 1 ? <button type="button" disabled={!!busyKey} onClick={() => void saveReserveOrder()} className="rounded-lg bg-accent-soft px-2.5 py-1.5 text-[10px] font-black text-accent disabled:opacity-40">Сохранить порядок</button> : null}
        </div>
        {reserveOrder.length ? reserveOrder.map((row, index) => (
          <div key={row.id} className="flex min-h-[50px] items-center gap-2 rounded-xl border border-border-soft bg-surface-2 px-3 py-2">
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-surface-1 text-[11px] font-black text-text-muted">R{index + 1}</span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[12px] font-bold text-text-primary">{row.nickname}</div>
              <div className="text-[10px] text-text-muted">{paymentLabels[row.payment_state || 'unpaid']}{row.reported_amount_rub != null ? ` · ${row.reported_amount_rub} ₽ заявлено` : ''}</div>
            </div>
            {!locked ? (
              <div className="flex shrink-0 items-center gap-1">
                <button type="button" disabled={index === 0 || !!busyKey} onClick={() => moveReserve(index, -1)} className="grid h-8 w-8 place-items-center rounded-lg bg-surface-1 text-text-muted disabled:opacity-30" aria-label="Поднять в резерве"><ArrowUp className="h-3.5 w-3.5" /></button>
                <button type="button" disabled={index === reserveOrder.length - 1 || !!busyKey} onClick={() => moveReserve(index, 1)} className="grid h-8 w-8 place-items-center rounded-lg bg-surface-1 text-text-muted disabled:opacity-30" aria-label="Опустить в резерве"><ArrowDown className="h-3.5 w-3.5" /></button>
                <button type="button" disabled={(detail?.remaining_places || 0) < 1 || !!busyKey} onClick={() => void promote(row.player_id)} className="grid h-8 w-8 place-items-center rounded-lg bg-success-soft text-success disabled:opacity-30" aria-label="Перевести в основной состав"><CheckCircle2 className="h-3.5 w-3.5" /></button>
                <button type="button" disabled={!!busyKey} onClick={() => void removePlayer(row.player_id)} className="grid h-8 w-8 place-items-center rounded-lg text-danger hover:bg-danger-soft" aria-label={`Снять ${row.nickname}`}><X className="h-3.5 w-3.5" /></button>
              </div>
            ) : null}
          </div>
        )) : <div className="rounded-xl border border-dashed border-border-soft px-3 py-4 text-center text-[11px] text-text-muted">Резерв пока пуст.</div>}
      </div>

      {detail && detail.confirmed.length ? (
        <div className="mt-4 rounded-xl bg-surface-2 p-3 text-[10px] leading-4 text-text-muted">
          <div className="flex items-center gap-2 font-black uppercase tracking-wide text-text-primary"><CreditCard className="h-3.5 w-3.5" /> Оплаты</div>
          <div className="mt-1">Взнос: {detail.entry_fee_rub || 0} ₽ · заявлено к проверке: {payment?.reported_rub || 0} ₽ · подтверждено: {payment?.confirmed_rub || 0} ₽ · не закрыто оплат: {payment?.unpaid_count || 0}</div>
        </div>
      ) : null}
    </section>
  );
};

export default TournamentParticipantsPanel;