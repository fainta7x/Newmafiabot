import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, CircleDollarSign, RefreshCw, Search, UserPlus, Users, XCircle } from 'lucide-react';
import { getEveningResponse } from '../../lib/eveningResponse.ts';

type Participant = {
  id: string;
  player_id: string;
  nickname: string;
  response_status?: string;
  registration_status?: string;
  attendance_status: string;
  payment_status: string;
  amount_due: number;
  amount_paid: number;
  balance?: number;
};

type Player = { id: string; nickname: string };
type WalkInCandidate = Player & { participant?: Participant };

type CloseoutState = {
  evening: { id: string; title: string; starts_at: string; status: string; settled_at?: string | null };
  participants: Participant[];
  pending_expected: Participant[];
  attended: Participant[];
  no_show: Participant[];
  unplanned_attended: Participant[];
  outstanding: Participant[];
  games: { total: number; completed: number; unfinished: Array<{ id: number | string; game_number: number }>; needs_override: boolean };
  can_close_without_override: boolean;
  can_close_with_override: boolean;
};

const request = async <T,>(url: string, options?: RequestInit): Promise<T> => {
  const response = await fetch(url, {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...(options?.headers || {}) },
    ...options,
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(body?.error || body?.message || `HTTP ${response.status}`), { code: body?.code, details: body?.details });
  return body as T;
};

const money = (value: number) => `${Math.max(0, Math.round(Number(value || 0))).toLocaleString('ru-RU')} ₽`;
const expectedResponse = (participant: Participant) => ['going', 'late'].includes(getEveningResponse(participant));

export const EveningCloseoutPanel: React.FC<{ eveningId: string }> = ({ eveningId }) => {
  const [state, setState] = useState<CloseoutState | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [search, setSearch] = useState('');
  const [guestNickname, setGuestNickname] = useState('');
  const [walkInDue, setWalkInDue] = useState(400);
  const [showWalkIn, setShowWalkIn] = useState(false);
  const [allowMissingStats, setAllowMissingStats] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = async (silent = false) => {
    if (!silent) setBusy('load');
    setError(null);
    try { setState(await request<CloseoutState>(`/api/evenings/${encodeURIComponent(eveningId)}/closeout`)); }
    catch (err: any) { setError(err?.message || 'Не удалось загрузить закрытие вечера'); }
    finally { if (!silent) setBusy(null); }
  };

  useEffect(() => { void load(); }, [eveningId]);

  const isFuture = state ? new Date(state.evening.starts_at).getTime() > Date.now() && state.evening.status !== 'active' : true;
  const readonly = state?.evening.status === 'completed' || Boolean(state?.evening.settled_at);

  const walkInCandidates = useMemo<WalkInCandidate[]>(() => {
    const query = search.trim().toLocaleLowerCase('ru-RU');
    const participantByPlayer = new Map((state?.participants || []).map((item) => [item.player_id, item]));
    return players
      .filter((player) => !query || player.nickname.toLocaleLowerCase('ru-RU').includes(query))
      .map((player) => ({ ...player, participant: participantByPlayer.get(player.id) }))
      .filter((candidate) => !candidate.participant || candidate.participant.attendance_status === 'pending')
      .sort((a, b) => Number(Boolean(b.participant)) - Number(Boolean(a.participant)))
      .slice(0, 8);
  }, [players, search, state]);

  const unexpectedPending = useMemo(
    () => (state?.participants || []).filter((item) => item.attendance_status === 'pending' && !expectedResponse(item)),
    [state],
  );

  const paidAttended = useMemo(
    () => (state?.attended || []).filter((item) => item.payment_status === 'paid' && Number(item.amount_due || 0) > 0 && Number(item.amount_paid || 0) > 0),
    [state],
  );

  const patchParticipants = async (updates: any[], label: string) => {
    if (!updates.length || busy) return;
    setBusy(label); setError(null); setMessage(null);
    try {
      await request(`/api/evenings/${encodeURIComponent(eveningId)}/participants/bulk`, {
        method: 'PATCH', body: JSON.stringify({ updates }),
      });
      await load(true);
    } catch (err: any) { setError(err?.message || 'Не удалось обновить участников'); }
    finally { setBusy(null); }
  };

  const openWalkIn = async () => {
    setShowWalkIn(true); setError(null);
    if (players.length) return;
    try { setPlayers(await request<Player[]>('/api/players')); }
    catch (err: any) { setError(err?.message || 'Не удалось загрузить игроков'); }
  };

  const addWalkIn = async (input: { player_id?: string; nickname?: string }) => {
    if (busy) return;
    setBusy('walk-in'); setError(null); setMessage(null);
    try {
      await request(`/api/evenings/${encodeURIComponent(eveningId)}/closeout/walk-in`, {
        method: 'POST', body: JSON.stringify({ ...input, amount_due: walkInDue }),
      });
      setSearch(''); setGuestNickname('');
      await load(true);
      setMessage('Пришедший игрок добавлен и отмечен как присутствовавший.');
    } catch (err: any) { setError(err?.message || 'Не удалось добавить игрока'); }
    finally { setBusy(null); }
  };

  const markCandidatePresent = async (candidate: WalkInCandidate) => {
    if (candidate.participant) {
      await patchParticipants([{ id: candidate.participant.id, attendance_fact: 'attended_on_time' }], `walk-in-existing-${candidate.participant.id}`);
      setSearch('');
      setMessage(`${candidate.nickname}: отмечен как пришедший.`);
      return;
    }
    await addWalkIn({ player_id: candidate.id });
  };

  const settle = async () => {
    if (!state || busy) return;
    if (state.pending_expected.length) {
      setError('Сначала отметь явку ожидаемых игроков.');
      return;
    }
    if (state.games.needs_override && !allowMissingStats) {
      setError('Подтверди закрытие без полной игровой статистики.');
      return;
    }
    setBusy('settle'); setError(null); setMessage(null);
    try {
      const result = await request<any>(`/api/evenings/${encodeURIComponent(eveningId)}/closeout/settle`, {
        method: 'POST',
        body: JSON.stringify({ allow_missing_game_stats: state.games.needs_override && allowMissingStats }),
      });
      await load(true);
      setMessage(result?.archived_unfinished_games
        ? `Вечер закрыт. Черновиков игр без статистики: ${result.archived_unfinished_games}.`
        : 'Вечер закрыт. Явка, оплаты и долги зафиксированы.');
    } catch (err: any) { setError(err?.message || 'Не удалось закрыть вечер'); }
    finally { setBusy(null); }
  };

  if (busy === 'load' && !state) return null;
  if (!state || isFuture) return null;

  if (readonly) return (
    <section className="rounded-[18px] border border-success/20 bg-success-soft p-4">
      <div className="flex items-center gap-3"><CheckCircle2 className="h-5 w-5 text-success" /><div><div className="text-[13px] font-black text-text-primary">Вечер закрыт</div><div className="mt-0.5 text-[10px] text-text-muted">Явка и расчёты зафиксированы.</div></div></div>
      {message ? <p className="mt-3 text-[10px] text-success">{message}</p> : null}
    </section>
  );

  return (
    <section className="rounded-[20px] border border-warning/25 bg-surface-1 p-4" data-testid="evening-closeout-panel">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.14em] text-warning">Закрытие вечера</div>
          <h3 className="mt-1 text-[15px] font-black text-text-primary">Быстрая сверка перед завершением</h3>
          <p className="mt-1 text-[10px] leading-4 text-text-muted">Кто был · кто не был · деньги · игры. Долги не мешают закрытию.</p>
        </div>
        <button type="button" onClick={() => void load()} disabled={Boolean(busy)} className="rounded-xl bg-surface-2 p-2 text-text-muted"><RefreshCw className={`h-4 w-4 ${busy === 'load' ? 'animate-spin' : ''}`} /></button>
      </div>

      <div className="mt-4 rounded-[14px] bg-surface-2 p-3">
        <div className="flex items-center justify-between gap-2"><div className="flex items-center gap-2 text-[12px] font-black text-text-primary"><Users className="h-4 w-4 text-accent" /> Явка</div><span className="text-[10px] text-text-muted">было {state.attended.length} · не было {state.no_show.length}</span></div>
        {state.pending_expected.length ? <>
          <div className="mt-3 flex gap-2">
            <button type="button" disabled={Boolean(busy)} onClick={() => void patchParticipants(state.pending_expected.map((item) => ({ id: item.id, attendance_fact: 'attended_on_time' })), 'all-attended')} className="min-h-10 flex-1 rounded-xl bg-success-soft px-2 text-[10px] font-bold text-success disabled:opacity-50">Все были</button>
            <button type="button" disabled={Boolean(busy)} onClick={() => void patchParticipants(state.pending_expected.map((item) => ({ id: item.id, attendance_fact: 'no_show' })), 'all-no-show')} className="min-h-10 flex-1 rounded-xl bg-danger-soft px-2 text-[10px] font-bold text-danger disabled:opacity-50">Остальных не было</button>
          </div>
          <div className="mt-2 space-y-1.5">
            {state.pending_expected.map((item) => <div key={item.id} className="flex items-center gap-2 rounded-xl bg-surface-1 px-3 py-2"><span className="min-w-0 flex-1 truncate text-[11px] font-bold text-text-primary">{item.nickname}</span><button type="button" onClick={() => void patchParticipants([{ id: item.id, attendance_fact: 'attended_on_time' }], `yes-${item.id}`)} className="rounded-lg bg-success-soft px-2.5 py-1.5 text-[9px] font-bold text-success">Был</button><button type="button" onClick={() => void patchParticipants([{ id: item.id, attendance_fact: 'no_show' }], `no-${item.id}`)} className="rounded-lg bg-danger-soft px-2.5 py-1.5 text-[9px] font-bold text-danger">Не был</button></div>)}
          </div>
        </> : <div className="mt-2 flex items-center gap-2 text-[10px] text-success"><CheckCircle2 className="h-4 w-4" /> Все ожидаемые игроки сверены.</div>}

        {unexpectedPending.length ? <p className="mt-3 rounded-xl bg-surface-1 px-3 py-2 text-[9px] leading-4 text-text-muted">Ещё {unexpectedPending.length} игрок(а) отвечали «не иду / думаю / не ответил». Если кто-то всё-таки пришёл — найди его ниже одним поиском.</p> : null}

        <button type="button" onClick={() => void openWalkIn()} className="mt-3 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border border-border-soft bg-surface-1 text-[10px] font-bold text-text-primary"><UserPlus className="h-4 w-4" /> Пришёл без записи / несмотря на ответ</button>
        {showWalkIn ? <div className="mt-2 rounded-xl border border-border-soft bg-surface-1 p-2.5">
          <div className="flex items-center gap-2 rounded-lg bg-surface-2 px-2"><Search className="h-3.5 w-3.5 text-text-muted" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Найти любого игрока" className="min-h-9 min-w-0 flex-1 bg-transparent text-[10px] text-text-primary outline-none" /></div>
          {walkInCandidates.length ? <div className="mt-2 space-y-1">{walkInCandidates.map((candidate) => <button key={candidate.id} type="button" onClick={() => void markCandidatePresent(candidate)} className="flex min-h-9 w-full items-center justify-between rounded-lg px-2 text-left text-[10px] font-bold text-text-primary hover:bg-surface-2"><span className="min-w-0 truncate">{candidate.nickname}</span><span className="ml-2 shrink-0 text-success">{candidate.participant ? 'Был →' : '+ Добавить'}</span></button>)}</div> : null}

          <div className="mt-3 text-[9px] font-bold text-text-muted">Сколько должен новый walk-in</div>
          <div className="mt-1.5 grid grid-cols-5 gap-1">
            {[0, 100, 200, 300, 400].map((amount) => <button key={amount} type="button" onClick={() => setWalkInDue(amount)} className={`min-h-8 rounded-lg text-[9px] font-bold ${walkInDue === amount ? 'bg-accent text-white' : 'bg-surface-2 text-text-secondary'}`}>{amount === 0 ? '0 ₽' : amount}</button>)}
          </div>

          <div className="mt-2 flex gap-2"><input value={guestNickname} onChange={(e) => setGuestNickname(e.target.value)} placeholder="Или новый гость" className="min-h-9 min-w-0 flex-1 rounded-lg bg-surface-2 px-2 text-[10px] text-text-primary outline-none" /><button disabled={!guestNickname.trim() || Boolean(busy)} onClick={() => void addWalkIn({ nickname: guestNickname.trim() })} className="rounded-lg bg-accent px-3 text-[9px] font-bold text-white disabled:opacity-40">Добавить</button></div>
        </div> : null}
        {state.unplanned_attended.length ? <div className="mt-2 text-[9px] text-text-muted">Без предварительного «Иду»: {state.unplanned_attended.map((item) => item.nickname).join(', ')}</div> : null}
      </div>

      <div className="mt-3 rounded-[14px] bg-surface-2 p-3">
        <div className="flex items-center justify-between gap-2"><div className="flex items-center gap-2 text-[12px] font-black text-text-primary"><CircleDollarSign className="h-4 w-4 text-success" /> Оплата</div><span className="text-[10px] text-text-muted">долгов сейчас {state.outstanding.length}</span></div>
        {state.outstanding.length ? <div className="mt-2 space-y-1.5">{state.outstanding.map((item) => {
          const balance = Math.max(0, Number(item.amount_due || 0) - Number(item.amount_paid || 0));
          return <div key={item.id} className="flex items-center gap-2 rounded-xl bg-surface-1 px-3 py-2"><div className="min-w-0 flex-1"><div className="truncate text-[10px] font-bold text-text-primary">{item.nickname}</div><div className="text-[9px] text-text-muted">осталось {money(balance)}</div></div><button type="button" aria-label={`Отметить оплату ${item.nickname}`} disabled={Boolean(busy)} onClick={() => void patchParticipants([{ id: item.id, amount_paid: Number(item.amount_due || 0), payment_status: 'paid' }], `paid-${item.id}`)} className="rounded-lg bg-success-soft px-2.5 py-1.5 text-[9px] font-bold text-success disabled:opacity-50">Оплачено</button></div>;
        })}</div> : <div className="mt-2 text-[10px] text-success">Долгов нет.</div>}

        {paidAttended.length ? <div className={`${state.outstanding.length ? 'mt-2 border-t border-border-soft pt-2' : 'mt-2'} space-y-1.5`}>
          {paidAttended.map((item) => <div key={`paid-${item.id}`} className="flex items-center gap-2 rounded-xl bg-success-soft/50 px-3 py-2"><div className="min-w-0 flex-1"><div className="truncate text-[10px] font-bold text-text-primary">{item.nickname}</div><div className="text-[9px] text-success">Оплачено {money(Number(item.amount_paid || 0))}</div></div><button type="button" aria-label={`Снять оплату ${item.nickname}`} disabled={Boolean(busy)} onClick={() => void patchParticipants([{ id: item.id, amount_paid: 0, payment_status: 'unpaid' }], `unpaid-${item.id}`)} className="rounded-lg border border-border-soft bg-surface-1 px-2.5 py-1.5 text-[9px] font-bold text-text-secondary disabled:opacity-50">Снять оплату</button></div>)}
        </div> : null}

        {state.outstanding.length ? <p className="mt-2 text-[9px] leading-4 text-text-muted">Если не нажимать «Оплачено», остаток автоматически сохранится как долг при закрытии. Ошибочно подтверждённую оплату можно снять до закрытия вечера.</p> : null}
      </div>

      <div className="mt-3 rounded-[14px] bg-surface-2 p-3">
        <div className="flex items-center justify-between gap-2"><div className="text-[12px] font-black text-text-primary">Игры</div><span className="text-[10px] text-text-muted">{state.games.completed}/{state.games.total} завершено</span></div>
        {state.games.needs_override ? <label className="mt-3 flex cursor-pointer items-start gap-2 rounded-xl bg-warning-soft p-2.5"><input type="checkbox" checked={allowMissingStats} onChange={(e) => setAllowMissingStats(e.target.checked)} className="mt-0.5" /><span className="text-[10px] leading-4 text-text-secondary"><strong className="text-warning">Закрыть без полной игровой статистики.</strong> {state.games.unfinished.length ? `Черновиков игр: ${state.games.unfinished.length}. Они будут убраны из активной статистики.` : 'Игры за этот вечер не внесены.'}</span></label> : <div className="mt-2 flex items-center gap-2 text-[10px] text-success"><CheckCircle2 className="h-4 w-4" /> Все внесённые игры завершены.</div>}
      </div>

      {error ? <p className="mt-3 rounded-xl bg-danger-soft px-3 py-2 text-[10px] text-danger">{error}</p> : null}
      {message ? <p className="mt-3 rounded-xl bg-success-soft px-3 py-2 text-[10px] text-success">{message}</p> : null}

      <button type="button" disabled={Boolean(busy) || state.pending_expected.length > 0 || (state.games.needs_override && !allowMissingStats)} onClick={() => void settle()} className="mt-4 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-[13px] bg-accent px-3 text-[11px] font-black text-white disabled:opacity-35"><CheckCircle2 className="h-4 w-4" /> {busy === 'settle' ? 'Закрываем…' : 'Закрыть вечер'}</button>
      {state.pending_expected.length ? <div className="mt-2 flex items-center justify-center gap-1.5 text-[9px] text-warning"><XCircle className="h-3.5 w-3.5" /> Осталось сверить явку: {state.pending_expected.length}</div> : null}
    </section>
  );
};

export default EveningCloseoutPanel;
