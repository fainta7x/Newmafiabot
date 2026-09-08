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

type BulkUpdateResponse = { success: boolean; participants: Participant[] };

const request = async <T,>(url: string, options?: RequestInit): Promise<T> => {
  const response = await fetch(url, { credentials: 'same-origin', headers: { 'Content-Type': 'application/json', ...(options?.headers || {}) }, ...options });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(body?.error || body?.message || `HTTP ${response.status}`), { code: body?.code, details: body?.details });
  return body as T;
};

const money = (value: number) => `${Math.max(0, Math.round(Number(value || 0))).toLocaleString('ru-RU')} ₽`;
const expectedResponse = (participant: Participant) => ['going', 'late'].includes(getEveningResponse(participant));

export const reconcileCloseoutParticipants = (current: CloseoutState, participants: Participant[]): CloseoutState => {
  const pendingExpected = participants.filter((item) => expectedResponse(item) && item.attendance_status === 'pending');
  const attended = participants.filter((item) => item.attendance_status === 'attended');
  const noShow = participants.filter((item) => item.attendance_status === 'no_show');
  const unplannedAttended = attended.filter((item) => !expectedResponse(item));
  const outstanding = attended
    .map((item) => ({ ...item, balance: Math.max(0, Number(item.amount_due || 0) - Number(item.amount_paid || 0)) }))
    .filter((item) => Number(item.balance || 0) > 0 && item.payment_status !== 'waived');
  return {
    ...current,
    participants,
    pending_expected: pendingExpected,
    attended,
    no_show: noShow,
    unplanned_attended: unplannedAttended,
    outstanding,
    can_close_without_override: pendingExpected.length === 0 && !current.games.needs_override,
    can_close_with_override: pendingExpected.length === 0,
  };
};

export const EveningCloseoutPanel: React.FC<{ eveningId: string }> = ({ eveningId }) => {
  const [state, setState] = useState<CloseoutState | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [search, setSearch] = useState('');
  const [guestNickname, setGuestNickname] = useState('');
  const [walkInDue, setWalkInDue] = useState(400);
  const [showWalkIn, setShowWalkIn] = useState(false);
  const [allowMissingStats, setAllowMissingStats] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [busyIds, setBusyIds] = useState<Set<string>>(() => new Set());
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = async (silent = false) => {
    if (!silent) setBusyAction('load');
    setError(null);
    try { setState(await request<CloseoutState>(`/api/evenings/${encodeURIComponent(eveningId)}/closeout`)); }
    catch (err: any) { setError(err?.message || 'Не удалось загрузить закрытие вечера'); }
    finally { if (!silent) setBusyAction(null); }
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

  const unexpectedPending = useMemo(() => (state?.participants || []).filter((item) => item.attendance_status === 'pending' && !expectedResponse(item)), [state]);
  const paidAttended = useMemo(() => (state?.attended || []).filter((item) => item.payment_status === 'paid' && Number(item.amount_due || 0) > 0 && Number(item.amount_paid || 0) > 0), [state]);

  const patchParticipants = async (updates: Array<Partial<Participant> & { id: string }>) => {
    const ids = [...new Set(updates.map((item) => item.id).filter(Boolean))];
    if (!updates.length || busyAction || ids.some((id) => busyIds.has(id))) return false;
    const previousById = new Map((state?.participants || []).filter((item) => ids.includes(item.id)).map((item) => [item.id, item]));
    const updateById = new Map(updates.map((item) => [item.id, item]));
    setBusyIds((current) => { const next = new Set(current); ids.forEach((id) => next.add(id)); return next; });
    setError(null); setMessage(null);
    setState((current) => current ? reconcileCloseoutParticipants(current, current.participants.map((participant) => {
      const update = updateById.get(participant.id);
      return update ? { ...participant, ...update } : participant;
    })) : current);
    try {
      const result = await request<BulkUpdateResponse>(`/api/evenings/${encodeURIComponent(eveningId)}/participants/bulk`, { method: 'PATCH', body: JSON.stringify({ updates }) });
      if (!Array.isArray(result.participants)) throw new Error('Сервер не вернул обновлённый состав вечера');
      setState((current) => current ? reconcileCloseoutParticipants(current, result.participants) : current);
      return true;
    } catch (err: any) {
      setState((current) => current ? reconcileCloseoutParticipants(current, current.participants.map((participant) => previousById.get(participant.id) || participant)) : current);
      setError(err?.message || 'Не удалось обновить участников');
      return false;
    } finally {
      setBusyIds((current) => { const next = new Set(current); ids.forEach((id) => next.delete(id)); return next; });
    }
  };

  const openWalkIn = async () => {
    setShowWalkIn(true); setError(null);
    if (players.length) return;
    try { setPlayers(await request<Player[]>('/api/players')); }
    catch (err: any) { setError(err?.message || 'Не удалось загрузить игроков'); }
  };

  const addWalkIn = async (input: { player_id?: string; nickname?: string }) => {
    if (busyAction) return;
    setBusyAction('walk-in'); setError(null); setMessage(null);
    try {
      const participant = await request<Participant>(`/api/evenings/${encodeURIComponent(eveningId)}/closeout/walk-in`, { method: 'POST', body: JSON.stringify({ ...input, amount_due: walkInDue }) });
      setState((current) => {
        if (!current) return current;
        const exists = current.participants.some((item) => item.id === participant.id);
        const participants = exists ? current.participants.map((item) => item.id === participant.id ? participant : item) : [...current.participants, participant];
        return reconcileCloseoutParticipants(current, participants);
      });
      setSearch(''); setGuestNickname(''); setMessage('Пришедший игрок добавлен и отмечен как присутствовавший.');
    } catch (err: any) { setError(err?.message || 'Не удалось добавить игрока'); }
    finally { setBusyAction(null); }
  };

  const markCandidatePresent = async (candidate: WalkInCandidate) => {
    if (candidate.participant) {
      const updated = await patchParticipants([{ id: candidate.participant.id, attendance_status: 'attended' }]);
      if (updated) { setSearch(''); setMessage(`${candidate.nickname}: отмечен как пришедший.`); }
      return;
    }
    await addWalkIn({ player_id: candidate.id });
  };

  const settle = async () => {
    if (!state || busyAction || busyIds.size > 0) return;
    if (state.pending_expected.length) { setError('Сначала отметь явку ожидаемых игроков.'); return; }
    if (state.games.needs_override && !allowMissingStats) { setError('Подтверди закрытие без полной игровой статистики.'); return; }
    setBusyAction('settle'); setError(null); setMessage(null);
    try {
      const result = await request<any>(`/api/evenings/${encodeURIComponent(eveningId)}/closeout/settle`, { method: 'POST', body: JSON.stringify({ allow_missing_game_stats: state.games.needs_override && allowMissingStats }) });
      await load(true);
      setMessage(result?.archived_unfinished_games ? `Вечер закрыт. Черновиков игр без статистики: ${result.archived_unfinished_games}.` : 'Вечер закрыт. Явка, оплаты и долги зафиксированы.');
    } catch (err: any) { setError(err?.message || 'Не удалось закрыть вечер'); }
    finally { setBusyAction(null); }
  };

  if (busyAction === 'load' && !state) return null;
  if (!state || isFuture) return null;

  if (readonly) return <section className="rounded-[18px] border border-success/20 bg-success-soft p-4"><div className="flex items-center gap-3"><CheckCircle2 className="h-5 w-5 text-success" /><div><div className="text-[14px] font-bold text-text-primary">Вечер закрыт</div><div className="mt-0.5 text-[12px] text-text-secondary">Явка и расчёты зафиксированы.</div></div></div>{message ? <p className="mt-3 text-[12px] text-success">{message}</p> : null}</section>;

  const attendanceReady = state.pending_expected.length === 0;
  const gamesReady = !state.games.needs_override || allowMissingStats;
  const closeDisabled = Boolean(busyAction) || busyIds.size > 0 || !attendanceReady || !gamesReady;
  const blockerReason = state.pending_expected.length
    ? `Нельзя закрыть: не отмечена явка у ${state.pending_expected.length} ожидаемых игроков.`
    : state.games.needs_override && !allowMissingStats
      ? state.games.unfinished.length
        ? `Нельзя закрыть: ${state.games.unfinished.length} игр не завершены. Подтверди закрытие без полной статистики.`
        : 'Нельзя закрыть: игровые данные неполные. Подтверди закрытие без полной статистики.'
      : null;

  return <section className="rounded-[20px] border border-warning/25 bg-surface-1 p-3 sm:p-4" data-testid="evening-closeout-panel">
    <div className="flex items-start justify-between gap-3 px-1">
      <div><div className="text-[12px] font-bold uppercase tracking-[0.12em] text-warning">Закрытие вечера</div><h3 className="mt-1 text-[17px] font-bold text-text-primary">Проверка перед завершением</h3><p className="mt-1 text-[12px] leading-4 text-text-secondary">Пройди чек-лист. Долги сохранятся, но сами по себе закрытие не блокируют.</p></div>
      <button type="button" aria-label="Обновить закрытие вечера" onClick={() => void load()} disabled={Boolean(busyAction) || busyIds.size > 0} className="grid h-11 w-11 shrink-0 place-items-center rounded-[13px] border border-border-soft bg-surface-2 text-text-secondary disabled:opacity-40"><RefreshCw className={`h-4 w-4 ${busyAction === 'load' ? 'animate-spin' : ''}`} /></button>
    </div>

    <div className="mt-3 grid gap-1.5" aria-label="Чек-лист закрытия">
      <div className={`flex min-h-12 items-center gap-3 rounded-[13px] px-3 ${attendanceReady ? 'bg-success-soft' : 'bg-warning-soft'}`}><span className={`grid h-7 w-7 place-items-center rounded-full ${attendanceReady ? 'text-success' : 'text-warning'}`}>{attendanceReady ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}</span><span className="min-w-0 flex-1"><strong className="block text-[14px] text-text-primary">Явка</strong><span className="text-[12px] text-text-secondary">{attendanceReady ? `сверена · пришли ${state.attended.length}, не пришли ${state.no_show.length}` : `осталось сверить ${state.pending_expected.length}`}</span></span></div>
      <div className="flex min-h-12 items-center gap-3 rounded-[13px] bg-surface-2 px-3"><CircleDollarSign className={`h-4 w-4 shrink-0 ${state.outstanding.length ? 'text-warning' : 'text-success'}`} /><span className="min-w-0 flex-1"><strong className="block text-[14px] text-text-primary">Оплаты</strong><span className="text-[12px] text-text-secondary">{state.outstanding.length ? `не оплачено: ${state.outstanding.length} · долг сохранится` : 'всё оплачено'}</span></span></div>
      <div className={`flex min-h-12 items-center gap-3 rounded-[13px] px-3 ${gamesReady ? 'bg-success-soft' : 'bg-warning-soft'}`}><GameChecklistIcon ready={gamesReady} /><span className="min-w-0 flex-1"><strong className="block text-[14px] text-text-primary">Игры</strong><span className="text-[12px] text-text-secondary">{state.games.completed}/{state.games.total} завершено{state.games.needs_override ? ' · нужна явная проверка' : ''}</span></span></div>
      <div className={`flex min-h-12 items-center gap-3 rounded-[13px] px-3 ${blockerReason ? 'bg-danger-soft' : 'bg-success-soft'}`}><span className="min-w-0 flex-1"><strong className={`block text-[14px] ${blockerReason ? 'text-danger' : 'text-success'}`}>{blockerReason ? 'Есть блокер' : 'Блокеров нет'}</strong><span className="text-[12px] leading-4 text-text-secondary">{blockerReason || 'Вечер можно закрыть.'}</span></span></div>
    </div>

    <details open={!attendanceReady} className="mt-3 rounded-[14px] border border-border-soft bg-surface-2">
      <summary className="flex min-h-11 cursor-pointer items-center gap-2 px-3 text-[14px] font-semibold text-text-primary"><Users className="h-4 w-4 text-accent" /> Явка и walk-in</summary>
      <div className="border-t border-border-soft p-3">
        {state.pending_expected.length ? <><div className="flex gap-2"><button type="button" disabled={Boolean(busyAction) || state.pending_expected.some((item) => busyIds.has(item.id))} onClick={() => void patchParticipants(state.pending_expected.map((item) => ({ id: item.id, attendance_status: 'attended' })))} className="min-h-11 flex-1 rounded-xl bg-success-soft px-2 text-[13px] font-bold text-success disabled:opacity-50">Все были</button><button type="button" disabled={Boolean(busyAction) || state.pending_expected.some((item) => busyIds.has(item.id))} onClick={() => void patchParticipants(state.pending_expected.map((item) => ({ id: item.id, attendance_status: 'no_show' })))} className="min-h-11 flex-1 rounded-xl bg-danger-soft px-2 text-[13px] font-bold text-danger disabled:opacity-50">Остальных не было</button></div><div className="mt-2 space-y-1.5">{state.pending_expected.map((item) => <div key={item.id} className="flex items-center gap-2 rounded-xl bg-surface-1 px-3 py-2"><span className="min-w-0 flex-1 truncate text-[13px] font-bold text-text-primary">{item.nickname}</span><button type="button" disabled={busyIds.has(item.id)} onClick={() => void patchParticipants([{ id: item.id, attendance_status: 'attended' }])} className="min-h-11 rounded-[10px] bg-success-soft px-3 text-[13px] font-semibold text-success disabled:opacity-40">Был</button><button type="button" disabled={busyIds.has(item.id)} onClick={() => void patchParticipants([{ id: item.id, attendance_status: 'no_show' }])} className="min-h-11 rounded-[10px] bg-danger-soft px-3 text-[13px] font-semibold text-danger disabled:opacity-40">Не был</button></div>)}</div></> : <div className="text-[12px] text-success">Все ожидаемые игроки сверены.</div>}
        {unexpectedPending.length ? <p className="mt-3 rounded-xl bg-surface-1 px-3 py-2 text-[12px] leading-4 text-text-secondary">Ещё {unexpectedPending.length} игрок(а) не подтверждали участие. Если кто-то пришёл — найди его ниже.</p> : null}
        <button type="button" onClick={() => void openWalkIn()} className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-border-soft bg-surface-1 text-[13px] font-bold text-text-primary"><UserPlus className="h-4 w-4" /> Пришёл без записи / несмотря на ответ</button>
        {showWalkIn ? <div className="mt-2 rounded-xl border border-border-soft bg-surface-1 p-2.5"><div className="flex min-h-11 items-center gap-2 rounded-lg bg-surface-2 px-2"><Search className="h-4 w-4 text-text-muted" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Найти любого игрока" className="min-h-11 min-w-0 flex-1 bg-transparent text-[14px] text-text-primary outline-none" /></div>{walkInCandidates.length ? <div className="mt-2 space-y-1">{walkInCandidates.map((candidate) => <button key={candidate.id} type="button" disabled={Boolean(candidate.participant && busyIds.has(candidate.participant.id))} onClick={() => void markCandidatePresent(candidate)} className="flex min-h-11 w-full items-center justify-between rounded-lg px-2 text-left text-[13px] font-bold text-text-primary hover:bg-surface-2 disabled:opacity-40"><span className="min-w-0 truncate">{candidate.nickname}</span><span className="ml-2 shrink-0 text-success">{candidate.participant ? 'Был →' : '+ Добавить'}</span></button>)}</div> : null}<div className="mt-3 text-[12px] font-semibold text-text-secondary">Сколько должен новый walk-in</div><div className="mt-1.5 grid grid-cols-5 gap-1">{[0, 100, 200, 300, 400].map((amount) => <button key={amount} type="button" onClick={() => setWalkInDue(amount)} className={`min-h-11 rounded-lg text-[12px] font-bold ${walkInDue === amount ? 'bg-accent text-white' : 'bg-surface-2 text-text-secondary'}`}>{amount === 0 ? '0 ₽' : amount}</button>)}</div><div className="mt-2 flex gap-2"><input value={guestNickname} onChange={(e) => setGuestNickname(e.target.value)} placeholder="Или новый гость" className="min-h-11 min-w-0 flex-1 rounded-lg bg-surface-2 px-2 text-[14px] text-text-primary outline-none" /><button disabled={!guestNickname.trim() || Boolean(busyAction)} onClick={() => void addWalkIn({ nickname: guestNickname.trim() })} className="min-h-11 rounded-lg bg-accent px-3 text-[13px] font-bold text-white disabled:opacity-40">Добавить</button></div></div> : null}
        {state.unplanned_attended.length ? <div className="mt-2 text-[12px] text-text-secondary">Без предварительного «Иду»: {state.unplanned_attended.map((item) => item.nickname).join(', ')}</div> : null}
      </div>
    </details>

    <details open={state.outstanding.length > 0} className="mt-2 rounded-[14px] border border-border-soft bg-surface-2">
      <summary className="flex min-h-11 cursor-pointer items-center gap-2 px-3 text-[14px] font-semibold text-text-primary"><CircleDollarSign className="h-4 w-4 text-success" /> Оплаты · {state.outstanding.length ? `долгов ${state.outstanding.length}` : 'готово'}</summary>
      <div className="border-t border-border-soft p-3">{state.outstanding.length ? <div className="space-y-1.5">{state.outstanding.map((item) => { const balance = Math.max(0, Number(item.amount_due || 0) - Number(item.amount_paid || 0)); return <div key={item.id} className="flex items-center gap-2 rounded-xl bg-surface-1 px-3 py-2"><div className="min-w-0 flex-1"><div className="truncate text-[13px] font-bold text-text-primary">{item.nickname}</div><div className="text-[12px] text-text-secondary">осталось {money(balance)}</div></div><button type="button" aria-label={`Отметить оплату ${item.nickname}`} disabled={busyIds.has(item.id)} onClick={() => void patchParticipants([{ id: item.id, amount_paid: Number(item.amount_due || 0), payment_status: 'paid' }])} className="min-h-11 rounded-[10px] bg-success-soft px-3 text-[13px] font-semibold text-success disabled:opacity-50">{busyIds.has(item.id) ? '…' : 'Оплачено'}</button></div>; })}</div> : <div className="text-[12px] text-success">Долгов нет.</div>}{paidAttended.length ? <div className="mt-2 space-y-1.5 border-t border-border-soft pt-2">{paidAttended.map((item) => <div key={`paid-${item.id}`} className="flex items-center gap-2 rounded-xl bg-success-soft/50 px-3 py-2"><div className="min-w-0 flex-1"><div className="truncate text-[13px] font-bold text-text-primary">{item.nickname}</div><div className="text-[12px] text-success">Оплачено {money(Number(item.amount_paid || 0))}</div></div><button type="button" aria-label={`Снять оплату ${item.nickname}`} disabled={busyIds.has(item.id)} onClick={() => void patchParticipants([{ id: item.id, amount_paid: 0, payment_status: 'unpaid' }])} className="min-h-11 rounded-lg border border-border-soft bg-surface-1 px-2.5 text-[12px] font-bold text-text-secondary disabled:opacity-50">{busyIds.has(item.id) ? '…' : 'Снять'}</button></div>)}</div> : null}{state.outstanding.length ? <p className="mt-2 text-[12px] leading-4 text-text-secondary">Неотмеченный остаток автоматически сохранится как долг при закрытии.</p> : null}</div>
    </details>

    <details open={state.games.needs_override} className="mt-2 rounded-[14px] border border-border-soft bg-surface-2">
      <summary className="flex min-h-11 cursor-pointer items-center px-3 text-[14px] font-semibold text-text-primary">Игры · {state.games.completed}/{state.games.total}</summary>
      <div className="border-t border-border-soft p-3">{state.games.needs_override ? <label className="flex min-h-11 cursor-pointer items-start gap-2 rounded-xl bg-warning-soft p-2.5"><input type="checkbox" checked={allowMissingStats} onChange={(e) => setAllowMissingStats(e.target.checked)} className="mt-1" /><span className="text-[13px] leading-5 text-text-secondary"><strong className="text-warning">Закрыть без полной игровой статистики.</strong> {state.games.unfinished.length ? `Черновиков игр: ${state.games.unfinished.length}. Они будут убраны из активной статистики.` : 'Игры за этот вечер не внесены.'}</span></label> : <div className="flex items-center gap-2 text-[12px] text-success"><CheckCircle2 className="h-4 w-4" /> Все внесённые игры завершены.</div>}</div>
    </details>

    {error ? <p className="mt-3 rounded-xl bg-danger-soft px-3 py-2 text-[13px] text-danger">{error}</p> : null}
    {message ? <p className="mt-3 rounded-xl bg-success-soft px-3 py-2 text-[13px] text-success">{message}</p> : null}

    <div className="sticky bottom-[calc(env(safe-area-inset-bottom)+76px)] z-20 mt-3 rounded-[16px] border border-border-soft bg-[#111217]/95 p-2.5 shadow-[0_-12px_36px_rgba(0,0,0,0.35)] backdrop-blur-xl sm:bottom-3" data-testid="evening-closeout-action">
      {blockerReason ? <div className="mb-2 flex items-start gap-1.5 px-1 text-[12px] leading-4 text-warning"><XCircle className="mt-0.5 h-4 w-4 shrink-0" /> {blockerReason}</div> : null}
      <button type="button" disabled={closeDisabled} onClick={() => void settle()} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-[13px] bg-accent px-3 text-[14px] font-bold text-white disabled:opacity-35"><CheckCircle2 className="h-4 w-4" /> {busyAction === 'settle' ? 'Закрываем…' : 'Закрыть вечер'}</button>
    </div>
  </section>;
};

const GameChecklistIcon = ({ ready }: { ready: boolean }) => ready ? <CheckCircle2 className="h-4 w-4 shrink-0 text-success" /> : <XCircle className="h-4 w-4 shrink-0 text-warning" />;

export default EveningCloseoutPanel;
