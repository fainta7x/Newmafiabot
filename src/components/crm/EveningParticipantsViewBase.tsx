import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, ArrowDownUp, ArrowLeft, CheckCircle2, MoreHorizontal, Search, Trash2, UserPlus } from 'lucide-react';
import { api, type EveningParticipant, type EveningTable, type GameEvening, type Player } from '../../lib/api.ts';
import { EVENING_RESPONSE_LABELS, countEveningResponses, getEveningResponse, getEveningResponseLabel, isAttendingResponse, type EveningResponseStatus } from '../../lib/eveningResponse.ts';
import { ConfirmDialog } from '../ui/ConfirmDialog.tsx';
import { MobileSheet } from '../ui/MobileSheet.tsx';
import { PlayerAvatar } from '../ui/PlayerAvatar.tsx';

interface EveningParticipantsViewProps {
  eveningId: string;
  onBack: () => void;
  onOpenPlayerCard?: (id: string) => void;
  initialAddOpen?: boolean;
  onInitialAddHandled?: () => void;
}
type EveningData = GameEvening & { tables: EveningTable[]; participants: EveningParticipant[] };
type RosterFilter = 'all' | EveningResponseStatus;
type SortMode = 'response' | 'name' | 'payment' | 'attendance';
type AddMode = 'players' | 'guest';
type RosterParticipant = EveningParticipant & { response_status?: EveningResponseStatus; audience_only?: boolean };
type AnnouncementAudiencePlayer = {
  id: string;
  nickname: string;
  telegram_username?: string | null;
  phone?: string | null;
  response_status: EveningResponseStatus;
  attention_status: 'answered' | 'unanswered' | 'failed' | 'not_sent';
};

const formatLabel = (format: string) => format === 'NOVICE' ? 'Новичковый' : format === 'TOURNAMENT' ? 'Турнир' : 'Обычный';
const paymentExpected = (participant: EveningParticipant) => participant.attendance_status === 'attended' || isAttendingResponse(participant);
const participantDebt = (participant: EveningParticipant) => paymentExpected(participant) ? Math.max(0, Number(participant.amount_due || 0) - Number(participant.amount_paid || 0)) : 0;
const paymentLabel = (participant: EveningParticipant) => !paymentExpected(participant) ? 'Оплата не ожидается' : participant.payment_status === 'waived' ? 'Без оплаты' : participant.payment_status === 'paid' ? 'Оплачено' : participant.payment_status === 'partial' ? `Оплачено ${participant.amount_paid}/${participant.amount_due} ₽` : `Не оплачено ${participantDebt(participant)} ₽`;
const attendanceLabel = (participant: EveningParticipant) => participant.attendance_status === 'attended' ? 'Пришёл' : participant.attendance_status === 'no_show' ? 'Не пришёл' : 'Явка не отмечена';
const isEventDayOrPast = (startsAt: string) => {
  const now = new Date();
  const event = new Date(startsAt);
  if (Number.isNaN(event.getTime())) return false;
  return new Date(event.getFullYear(), event.getMonth(), event.getDate()).getTime() <= new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
};

const responsePriority: Record<EveningResponseStatus, number> = {
  going: 0,
  late: 1,
  thinking: 2,
  unanswered: 3,
  declined: 4,
};

export const EveningParticipantsView: React.FC<EveningParticipantsViewProps> = ({ eveningId, onBack, onOpenPlayerCard, initialAddOpen = false, onInitialAddHandled }) => {
  const [evening, setEvening] = useState<EveningData | null>(null);
  const [participants, setParticipants] = useState<EveningParticipant[]>([]);
  const [unansweredAudience, setUnansweredAudience] = useState<AnnouncementAudiencePlayer[]>([]);
  const [allPlayers, setAllPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState<RosterFilter>('all');
  const [sortMode, setSortMode] = useState<SortMode>('response');
  const [search, setSearch] = useState('');
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [inlineError, setInlineError] = useState<{ key: string; message: string } | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [addMode, setAddMode] = useState<AddMode>('players');
  const [addSearch, setAddSearch] = useState('');
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<string[]>([]);
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [guestNickname, setGuestNickname] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [activeParticipant, setActiveParticipant] = useState<EveningParticipant | null>(null);
  const [paymentAmount, setPaymentAmount] = useState(0);
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDueAt, setTaskDueAt] = useState('');
  const [participantError, setParticipantError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<EveningParticipant | null>(null);
  const [showEventMenu, setShowEventMenu] = useState(false);
  const [showSettleConfirm, setShowSettleConfirm] = useState(false);

  const loadAnnouncementAudience = async (): Promise<AnnouncementAudiencePlayer[]> => {
    const headers: Record<string, string> = {};
    if (typeof window !== 'undefined') {
      const token = localStorage.getItem('organizer_token');
      if (token) headers.Authorization = `Bearer ${token}`;
    }
    const response = await fetch(`/api/evenings/${encodeURIComponent(eveningId)}/announcement-overview`, {
      credentials: 'include',
      headers,
    });
    if (!response.ok) return [];
    const body = await response.json().catch(() => ({}));
    return Array.isArray(body?.players) ? body.players : [];
  };

  const load = async (silent = false) => {
    if (!silent) setLoading(true);
    setLoadError(null);
    try {
      const [data, players, announcementPlayers] = await Promise.all([
        api.getEvening(eveningId),
        api.getPlayers(),
        loadAnnouncementAudience().catch(() => []),
      ]);
      const normalized = data as EveningData;
      const actualParticipants = normalized.participants || [];
      const actualPlayerIds = new Set(actualParticipants.map((participant) => participant.player_id));
      setEvening(normalized);
      setParticipants(actualParticipants);
      setUnansweredAudience(
        announcementPlayers.filter((player) => player.attention_status === 'unanswered' && !actualPlayerIds.has(player.id)),
      );
      setAllPlayers(players);
    } catch (err: any) {
      setLoadError(err?.message || 'Не удалось загрузить вечер');
    } finally {
      if (!silent) setLoading(false);
    }
  };
  useEffect(() => { void load(); }, [eveningId]);
  useEffect(() => {
    if (!initialAddOpen) return;
    setShowAdd(true);
    setAddMode('players');
    onInitialAddHandled?.();
  }, [initialAddOpen, onInitialAddHandled]);

  const isReadonly = evening?.status === 'completed' || Boolean(evening?.settled_at);
  const rosterParticipants = useMemo<RosterParticipant[]>(() => {
    const audienceRows = unansweredAudience.map((player): RosterParticipant => ({
      id: `audience:${player.id}`,
      evening_id: eveningId,
      player_id: player.id,
      nickname: player.nickname,
      phone: player.phone || null,
      telegram_username: player.telegram_username || null,
      lifecycle_status: 'normal',
      elo: 0,
      registration_status: 'invited',
      response_status: 'unanswered',
      attendance_status: 'pending',
      arrival_status: 'unknown',
      payment_status: 'waived',
      amount_due: 0,
      amount_paid: 0,
      created_at: '',
      updated_at: '',
      audience_only: true,
    }));
    return [...participants, ...audienceRows];
  }, [eveningId, participants, unansweredAudience]);

  const responseCounts = useMemo(() => countEveningResponses(rosterParticipants), [rosterParticipants]);
  const visibleParticipants = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('ru-RU');
    const filtered = rosterParticipants.filter((participant) => {
      const response = getEveningResponse(participant);
      if (filter !== 'all' && response !== filter) return false;
      return !query || participant.nickname.toLocaleLowerCase('ru-RU').includes(query) || (participant.phone || '').includes(query);
    });

    return [...filtered].sort((a, b) => {
      if (sortMode === 'name') return a.nickname.localeCompare(b.nickname, 'ru');
      if (sortMode === 'payment') return participantDebt(b) - participantDebt(a) || a.nickname.localeCompare(b.nickname, 'ru');
      if (sortMode === 'attendance') {
        const priority: Record<string, number> = { pending: 0, attended: 1, no_show: 2 };
        return (priority[a.attendance_status] ?? 3) - (priority[b.attendance_status] ?? 3) || a.nickname.localeCompare(b.nickname, 'ru');
      }
      const aResponse = getEveningResponse(a);
      const bResponse = getEveningResponse(b);
      return responsePriority[aResponse] - responsePriority[bResponse] || a.nickname.localeCompare(b.nickname, 'ru');
    });
  }, [rosterParticipants, filter, search, sortMode]);

  const existingPlayerIds = useMemo(() => new Set(participants.map((item) => item.player_id)), [participants]);
  const availablePlayers = useMemo(() => {
    const query = addSearch.trim().toLocaleLowerCase('ru-RU');
    return allPlayers.filter((player) => !existingPlayerIds.has(player.id)).filter((player) => !query || player.nickname.toLocaleLowerCase('ru-RU').includes(query) || (player.full_name || '').toLocaleLowerCase('ru-RU').includes(query) || (player.telegram_username || '').toLocaleLowerCase('ru-RU').includes(query)).sort((a, b) => a.nickname.localeCompare(b.nickname, 'ru'));
  }, [addSearch, allPlayers, existingPlayerIds]);

  const patchParticipant = async (participant: EveningParticipant, patch: Partial<EveningParticipant>, key: string) => {
    if (busyAction) return;
    setBusyAction(key);
    setInlineError(null);
    setParticipantError(null);
    try {
      const updated = await api.updateParticipant(participant.id, patch);
      setParticipants((current) => current.map((item) => item.id === updated.id ? updated : item));
      setActiveParticipant((current) => current?.id === updated.id ? updated : current);
      if (updated.id === activeParticipant?.id) setPaymentAmount(Number(updated.amount_paid || 0));
    } catch (err: any) {
      const message = err?.message || 'Не удалось обновить участника';
      if (activeParticipant?.id === participant.id) setParticipantError(message);
      else setInlineError({ key: participant.id, message });
    } finally {
      setBusyAction(null);
    }
  };

  const markAttended = (participant: EveningParticipant) => patchParticipant(participant, { attendance_status: 'attended' }, `attended:${participant.id}`);
  const markPaid = (participant: EveningParticipant) => patchParticipant(participant, { amount_paid: participant.amount_due, payment_status: 'paid' }, `paid:${participant.id}`);
  const savePayment = async () => {
    if (!activeParticipant) return;
    const amount = Math.max(0, Math.min(Number(activeParticipant.amount_due || 0), Number(paymentAmount || 0)));
    const status: EveningParticipant['payment_status'] = activeParticipant.amount_due === 0 ? 'waived' : amount <= 0 ? 'unpaid' : amount >= activeParticipant.amount_due ? 'paid' : 'partial';
    await patchParticipant(activeParticipant, { amount_paid: amount, payment_status: status }, `payment:${activeParticipant.id}`);
  };
  const createTask = async () => {
    if (!activeParticipant || !taskTitle.trim() || busyAction) return;
    setBusyAction(`task:${activeParticipant.id}`);
    setParticipantError(null);
    try {
      await api.createTask({ title: taskTitle.trim(), player_id: activeParticipant.player_id, evening_id: eveningId, due_at: taskDueAt ? new Date(taskDueAt).toISOString() : null, priority: 'medium' });
      setTaskTitle('');
      setTaskDueAt('');
    } catch (err: any) {
      setParticipantError(err?.message || 'Не удалось создать задачу');
    } finally {
      setBusyAction(null);
    }
  };
  const addSelectedPlayers = async () => {
    if (!selectedPlayerIds.length || adding || !evening) return;
    setAdding(true); setAddError(null);
    try {
      await api.bulkAddParticipants(eveningId, selectedPlayerIds, null, 'going', evening.default_price);
      setSelectedPlayerIds([]); setAddSearch(''); setShowAdd(false); await load(true);
    } catch (err: any) { setAddError(err?.message || 'Не удалось добавить игроков'); } finally { setAdding(false); }
  };
  const addGuest = async () => {
    if (!guestNickname.trim() || adding || !evening) return;
    setAdding(true); setAddError(null);
    try {
      await api.addParticipant(eveningId, { nickname: guestNickname.trim(), phone: guestPhone.trim() || undefined, table_id: null, registration_status: 'going', amount_due: evening.default_price });
      setGuestNickname(''); setGuestPhone(''); setShowAdd(false); await load(true);
    } catch (err: any) { setAddError(err?.message || 'Не удалось добавить гостя'); } finally { setAdding(false); }
  };
  const deleteParticipant = async () => {
    if (!pendingDelete || busyAction) return;
    setBusyAction(`delete:${pendingDelete.id}`);
    try {
      await api.deleteParticipant(pendingDelete.id);
      setParticipants((current) => current.filter((item) => item.id !== pendingDelete.id));
      setPendingDelete(null); setActiveParticipant(null);
    } catch (err: any) { setParticipantError(err?.message || 'Не удалось убрать игрока с вечера'); setPendingDelete(null); } finally { setBusyAction(null); }
  };
  const settleEvening = async () => {
    if (busyAction) return;
    setBusyAction('settle');
    try { await api.settleEvening(eveningId); setShowSettleConfirm(false); setShowEventMenu(false); await load(true); }
    catch (err: any) { setLoadError(err?.message || 'Не удалось рассчитать вечер'); setShowSettleConfirm(false); }
    finally { setBusyAction(null); }
  };

  if (loading) return <div className="py-16 text-center text-[13px] text-text-secondary">Загрузка вечера…</div>;
  if (!evening) return <div className="rounded-[18px] border border-danger/30 bg-danger-soft p-4 text-[13px] text-danger">{loadError || 'Не удалось загрузить вечер'}<button type="button" onClick={() => void load()} className="ml-2 font-bold underline">Повторить</button></div>;

  const eventDayOrPast = isEventDayOrPast(evening.starts_at);
  const filterItems: Array<{ id: RosterFilter; label: string; count: number }> = [
    { id: 'all', label: 'Все', count: rosterParticipants.length },
    { id: 'going', label: 'Идут', count: responseCounts.going },
    { id: 'late', label: 'Позже', count: responseCounts.late },
    { id: 'thinking', label: 'Думают', count: responseCounts.thinking },
    { id: 'declined', label: 'Не идут', count: responseCounts.declined },
    { id: 'unanswered', label: 'Не ответили', count: responseCounts.unanswered },
  ];

  return <div className="space-y-3 pb-4">
    <section className="rounded-[16px] border border-border-soft bg-surface-1 p-3">
      <div className="flex items-start gap-2.5">
        <button type="button" aria-label="Назад" onClick={onBack} className="grid h-10 w-10 shrink-0 place-items-center rounded-[11px] border border-border-soft bg-surface-2 text-text-secondary"><ArrowLeft className="h-4 w-4" /></button>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[16px] font-black leading-5 text-text-primary">{evening.title}</h2>
          <p className="mt-0.5 truncate text-[11px] text-text-secondary">{new Date(evening.starts_at).toLocaleString('ru-RU', { dateStyle: 'medium', timeStyle: 'short' })}{evening.venue ? ` · ${evening.venue}` : ''}</p>
          <p className="mt-0.5 text-[10px] text-text-muted">{formatLabel(evening.format)}</p>
        </div>
        {!isReadonly ? <button type="button" aria-label="Ещё действия" onClick={() => setShowEventMenu(true)} className="grid h-10 w-10 shrink-0 place-items-center rounded-[11px] border border-border-soft bg-surface-2 text-text-secondary"><MoreHorizontal className="h-4 w-4" /></button> : null}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[10px] font-bold">
        <span className="rounded-full bg-success-soft px-2.5 py-1 text-success">{responseCounts.going} идут</span>
        <span className="rounded-full bg-surface-2 px-2.5 py-1 text-text-secondary">{responseCounts.late} позже</span>
        <span className="rounded-full bg-warning-soft px-2.5 py-1 text-warning">{responseCounts.thinking} думают</span>
        <span className="rounded-full bg-surface-2 px-2.5 py-1 text-text-muted">{responseCounts.declined} не идут</span>
        {responseCounts.unanswered ? <span className="rounded-full bg-surface-2 px-2.5 py-1 text-text-muted">{responseCounts.unanswered} без ответа</span> : null}
      </div>
      {!isReadonly ? <button type="button" onClick={() => { setAddMode('players'); setAddError(null); setShowAdd(true); }} className="mt-3 inline-flex min-h-[42px] w-full items-center justify-center gap-2 rounded-[11px] bg-accent px-4 text-[12px] font-bold text-white sm:w-auto"><UserPlus className="h-4 w-4" /> Добавить на вечер</button> : null}
    </section>

    <section className="space-y-2.5">
      <div className="grid grid-cols-[minmax(0,1fr)_142px] gap-2">
        <div className="relative"><Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Найти игрока" className="mobile-field pl-10" /></div>
        <label className="relative"><ArrowDownUp className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-muted" /><select aria-label="Сортировка состава" value={sortMode} onChange={(event) => setSortMode(event.target.value as SortMode)} className="mobile-field pl-8 pr-2 text-[11px]"><option value="response">По ответу</option><option value="name">По имени</option><option value="payment">Долги сверху</option><option value="attendance">Явка сверху</option></select></label>
      </div>
      <div className="-mx-1 overflow-x-auto px-1 pb-1"><div className="flex w-max min-w-full gap-1.5">{filterItems.map((item) => <button key={item.id} type="button" onClick={() => setFilter(item.id)} className={`min-h-[36px] whitespace-nowrap rounded-full border px-3 text-[11px] font-semibold ${filter === item.id ? 'border-accent bg-accent-soft text-text-primary' : 'border-border-soft bg-surface-1 text-text-secondary'}`}>{item.label} {item.count}</button>)}</div></div>
      <div className="flex items-center justify-between px-1 text-[10px] text-text-muted"><span>Показано {visibleParticipants.length} из {rosterParticipants.length}</span><span>{filter === 'all' ? 'Все ответы' : EVENING_RESPONSE_LABELS[filter]}</span></div>

      {visibleParticipants.length ? <div className="overflow-hidden rounded-[15px] border border-border-soft bg-surface-1">{visibleParticipants.map((participant, index) => {
        const response = getEveningResponse(participant);
        const audienceOnly = Boolean(participant.audience_only);
        const canMarkAttendance = !audienceOnly && !isReadonly && eventDayOrPast && isAttendingResponse(participant) && participant.attendance_status === 'pending';
        const canMarkPaid = !audienceOnly && !isReadonly && participant.attendance_status === 'attended' && participant.payment_status !== 'paid' && participant.payment_status !== 'waived' && participant.amount_due > participant.amount_paid;
        const rowBusy = busyAction === `attended:${participant.id}` || busyAction === `paid:${participant.id}`;
        return <div key={participant.id} className={`${index ? 'border-t border-border-soft' : ''} px-2.5 py-2`}>
          <div className="flex min-w-0 items-center gap-2">
            <button type="button" onClick={() => onOpenPlayerCard?.(participant.player_id)} className="flex min-w-0 flex-1 items-center gap-2.5 text-left">
              <PlayerAvatar playerId={participant.player_id} nickname={participant.nickname} avatarVersion={(participant as any).avatar_updated_at} size="xs" />
              <span className="min-w-0 flex-1">
                <span className="flex min-w-0 items-center gap-1.5"><strong className="truncate text-[13px] font-bold text-text-primary">{participant.nickname}</strong><span className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold ${response === 'going' ? 'bg-success-soft text-success' : response === 'late' ? 'bg-accent-soft text-text-primary' : response === 'thinking' ? 'bg-warning-soft text-warning' : 'bg-surface-2 text-text-muted'}`}>{EVENING_RESPONSE_LABELS[response]}</span></span>
                {audienceOnly ? <span className="mt-0.5 block truncate text-[10px] text-text-muted">Анонс доставлен · ждём ответ</span> : eventDayOrPast ? <span className="mt-0.5 block truncate text-[10px] text-text-muted">{attendanceLabel(participant)} · {paymentLabel(participant)}</span> : null}
              </span>
            </button>
            {canMarkAttendance ? <button type="button" disabled={Boolean(busyAction)} onClick={() => void markAttended(participant)} className="min-h-[40px] shrink-0 rounded-[10px] bg-accent px-2.5 text-[11px] font-bold text-white disabled:opacity-50">{rowBusy ? '…' : 'Пришёл'}</button> : canMarkPaid ? <button type="button" disabled={Boolean(busyAction)} onClick={() => void markPaid(participant)} className="min-h-[40px] shrink-0 rounded-[10px] border border-border-soft bg-surface-2 px-2.5 text-[11px] font-bold text-text-primary disabled:opacity-50">{rowBusy ? '…' : 'Оплачено'}</button> : null}
            {!audienceOnly && !isReadonly ? <button type="button" aria-label={`Действия ${participant.nickname}`} onClick={() => { setActiveParticipant(participant); setPaymentAmount(Number(participant.amount_paid || 0)); setParticipantError(null); }} className="grid h-10 w-10 shrink-0 place-items-center rounded-[10px] border border-border-soft bg-surface-2 text-text-secondary"><MoreHorizontal className="h-4 w-4" /></button> : null}
          </div>
          {inlineError?.key === participant.id ? <div className="mt-1.5 flex gap-1.5 text-[10px] text-danger"><AlertCircle className="h-3.5 w-3.5 shrink-0" /> {inlineError.message}</div> : null}
        </div>;
      })}</div> : <div className="rounded-[15px] border border-dashed border-border-soft bg-surface-1 p-6 text-center text-[12px] text-text-muted">По выбранному фильтру никого нет.</div>}
    </section>

    <MobileSheet open={showAdd} onClose={() => setShowAdd(false)} title="Добавить на вечер" subtitle="Ручная запись — исключение. Добавленный игрок считается ответившим «Иду»." widthClass="sm:max-w-lg" footer={addMode === 'players' ? <button type="button" disabled={!selectedPlayerIds.length || adding} onClick={() => void addSelectedPlayers()} className="min-h-[48px] w-full rounded-[13px] bg-accent text-[13px] font-bold text-white disabled:opacity-40">{adding ? 'Добавляем…' : `Добавить выбранных${selectedPlayerIds.length ? ` · ${selectedPlayerIds.length}` : ''}`}</button> : <button type="button" disabled={!guestNickname.trim() || adding} onClick={() => void addGuest()} className="min-h-[48px] w-full rounded-[13px] bg-accent text-[13px] font-bold text-white disabled:opacity-40">{adding ? 'Добавляем…' : 'Добавить гостя'}</button>}>
      <div className="space-y-4">
        {addError ? <div className="rounded-[13px] border border-danger/30 bg-danger-soft p-3 text-[12px] text-danger">{addError}</div> : null}
        <div className="grid grid-cols-2 gap-2 rounded-[13px] bg-surface-2 p-1"><button type="button" onClick={() => setAddMode('players')} className={`min-h-[44px] rounded-[10px] text-[12px] font-bold ${addMode === 'players' ? 'bg-surface-1 text-text-primary' : 'text-text-secondary'}`}>Игроки</button><button type="button" onClick={() => setAddMode('guest')} className={`min-h-[44px] rounded-[10px] text-[12px] font-bold ${addMode === 'guest' ? 'bg-surface-1 text-text-primary' : 'text-text-secondary'}`}>Быстрый гость</button></div>
        {addMode === 'players' ? <>
          <div className="relative"><Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" /><input value={addSearch} onChange={(event) => setAddSearch(event.target.value)} placeholder="Найти существующего игрока" className="mobile-field pl-10" /></div>
          <div className="max-h-[48dvh] overflow-y-auto rounded-[15px] border border-border-soft bg-surface-1">{availablePlayers.map((player, index) => {
            const selected = selectedPlayerIds.includes(player.id);
            return <button key={player.id} type="button" onClick={() => setSelectedPlayerIds((current) => selected ? current.filter((id) => id !== player.id) : [...current, player.id])} className={`${index ? 'border-t border-border-soft' : ''} flex min-h-[56px] w-full items-center gap-3 px-3 text-left`}><span className={`grid h-5 w-5 shrink-0 place-items-center rounded-md border ${selected ? 'border-accent bg-accent text-white' : 'border-border-soft bg-surface-2'}`}>{selected ? '✓' : ''}</span><PlayerAvatar playerId={player.id} nickname={player.nickname} avatarVersion={player.avatar_updated_at} size="xs" /><span className="min-w-0"><strong className="block truncate text-[13px] text-text-primary">{player.nickname}</strong>{player.full_name ? <span className="block truncate text-[11px] text-text-muted">{player.full_name}</span> : null}</span></button>;
          })}{!availablePlayers.length ? <div className="p-5 text-center text-[12px] text-text-muted">Подходящих игроков не найдено или они уже есть на вечере.</div> : null}</div>
        </> : <div className="space-y-3"><input value={guestNickname} onChange={(event) => setGuestNickname(event.target.value)} placeholder="Никнейм" className="mobile-field" /><input value={guestPhone} onChange={(event) => setGuestPhone(event.target.value)} placeholder="Телефон — необязательно" className="mobile-field" /><div className="rounded-[13px] bg-surface-2 p-3 text-[12px] leading-relaxed text-text-secondary">Стоимость: {evening.default_price} ₽ · Ответ: «Иду». Стол выбирается только при формировании конкретной игры.</div></div>}
      </div>
    </MobileSheet>

    <MobileSheet open={Boolean(activeParticipant)} onClose={() => setActiveParticipant(null)} title={activeParticipant?.nickname || 'Участник'} subtitle="Ответ, фактическая явка и оплата — независимые факты." widthClass="sm:max-w-md">
      {activeParticipant ? <div className="space-y-4">
        {participantError ? <div className="rounded-[13px] border border-danger/30 bg-danger-soft p-3 text-[12px] text-danger">{participantError}</div> : null}
        <button type="button" onClick={() => { const id = activeParticipant.player_id; setActiveParticipant(null); onOpenPlayerCard?.(id); }} className="min-h-[48px] w-full rounded-[13px] border border-border-soft bg-surface-2 px-4 text-[13px] font-bold text-text-primary">Открыть профиль игрока</button>
        {!isReadonly ? <>
          <label className="block"><span className="mb-1.5 block text-[11px] font-semibold text-text-secondary">Ответ на вечер</span><select value={getEveningResponse(activeParticipant)} disabled={Boolean(busyAction)} onChange={(event) => { const value = event.target.value as EveningResponseStatus; if (value !== 'unanswered') void patchParticipant(activeParticipant, { response_status: value } as any, `response:${activeParticipant.id}`); }} className="mobile-field">{getEveningResponse(activeParticipant) === 'unanswered' ? <option value="unanswered">Не ответил</option> : null}<option value="going">Иду</option><option value="late">Приду позже</option><option value="thinking">Пока думаю</option><option value="declined">Не иду</option></select></label>
          <label className="block"><span className="mb-1.5 block text-[11px] font-semibold text-text-secondary">Фактическая явка</span><select value={activeParticipant.attendance_status} disabled={Boolean(busyAction)} onChange={(event) => void patchParticipant(activeParticipant, { attendance_status: event.target.value as EveningParticipant['attendance_status'] }, `attendance:${activeParticipant.id}`)} className="mobile-field"><option value="pending">Не отмечена</option><option value="attended">Пришёл</option><option value="no_show">Не пришёл</option></select></label>
          <div className="rounded-[14px] border border-border-soft bg-surface-2 p-3"><div className="flex items-center justify-between gap-3"><div><span className="block text-[11px] text-text-muted">Оплата</span><strong className="mt-0.5 block text-[13px] text-text-primary">{paymentLabel(activeParticipant)}</strong></div><span className="text-[11px] text-text-muted">К оплате {paymentExpected(activeParticipant) ? activeParticipant.amount_due : 0} ₽</span></div><div className="mt-3 flex gap-2"><input type="number" min={0} max={activeParticipant.amount_due} value={paymentAmount} onChange={(event) => setPaymentAmount(Number(event.target.value) || 0)} className="mobile-field min-w-0 flex-1" /><button type="button" disabled={Boolean(busyAction)} onClick={() => void savePayment()} className="min-h-[48px] rounded-[12px] bg-accent px-4 text-[12px] font-bold text-white disabled:opacity-50">Сохранить</button></div></div>
          <div className="rounded-[14px] border border-border-soft bg-surface-1 p-3"><span className="block text-[11px] font-semibold text-text-secondary">Только если реально нужно персональное действие</span><input value={taskTitle} onChange={(event) => setTaskTitle(event.target.value)} placeholder="Например: уточнить оплату" className="mobile-field mt-2" /><input type="datetime-local" value={taskDueAt} onChange={(event) => setTaskDueAt(event.target.value)} className="mobile-field mt-2" /><button type="button" disabled={!taskTitle.trim() || Boolean(busyAction)} onClick={() => void createTask()} className="mt-2 min-h-[44px] w-full rounded-[11px] border border-border-soft bg-surface-2 text-[12px] font-bold text-text-primary disabled:opacity-40">Создать задачу</button></div>
          <button type="button" onClick={() => setPendingDelete(activeParticipant)} className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 text-[12px] font-bold text-danger"><Trash2 className="h-4 w-4" /> Убрать с вечера</button>
        </> : <div className="rounded-[13px] bg-surface-2 p-3 text-[12px] text-text-secondary">{getEveningResponseLabel(activeParticipant)} · {attendanceLabel(activeParticipant)} · {paymentLabel(activeParticipant)}</div>}
      </div> : null}
    </MobileSheet>

    <MobileSheet open={showEventMenu} onClose={() => setShowEventMenu(false)} title="Действия вечера" subtitle="Анонс и опрос остаются на стороне существующего Telegram-бота." widthClass="sm:max-w-sm"><div className="space-y-2">{!isReadonly ? <button type="button" onClick={() => setShowSettleConfirm(true)} className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-[12px] border border-border-soft bg-surface-2 px-4 text-[13px] font-bold text-text-primary"><CheckCircle2 className="h-4 w-4 text-success" /> Рассчитать и закрыть вечер</button> : null}</div></MobileSheet>
    <ConfirmDialog open={Boolean(pendingDelete)} title={`Убрать ${pendingDelete?.nickname || 'игрока'} с вечера?`} description="Запись этого участника на текущий вечер будет удалена. Историю уже завершённых вечеров это не меняет." tone="danger" busy={Boolean(busyAction)} confirmLabel="Убрать" onCancel={() => setPendingDelete(null)} onConfirm={() => void deleteParticipant()} />
    <ConfirmDialog open={showSettleConfirm} title="Рассчитать и закрыть вечер?" description="Перед закрытием у всех реально ожидавшихся участников должна быть отмечена фактическая явка." busy={busyAction === 'settle'} confirmLabel="Рассчитать и закрыть" onCancel={() => setShowSettleConfirm(false)} onConfirm={() => void settleEvening()} />
  </div>;
};

export default EveningParticipantsView;
