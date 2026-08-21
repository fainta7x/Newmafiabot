import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, ArrowLeft, CheckCircle2, ChevronRight, RefreshCw, Search, UserPlus } from 'lucide-react';
import { api, type EveningParticipant, type GameEvening } from '../../lib/api.ts';
import { EVENING_RESPONSE_LABELS, countEveningResponses, getEveningResponse, isAttendingResponse } from '../../lib/eveningResponse.ts';
import { MobileSheet } from '../ui/MobileSheet.tsx';
import { PlayerAvatar } from '../ui/PlayerAvatar.tsx';

type EveningData = GameEvening & { participants: EveningParticipant[] };
type WorkFilter = 'action' | 'here' | 'all' | 'other';
type QuickAction = 'attend' | 'pay' | null;

type ParticipantView = {
  participant: EveningParticipant;
  action: QuickAction;
  needsAction: boolean;
  subtitle: string;
};

const eventDayOrPast = (startsAt: string) => {
  const now = new Date();
  const event = new Date(startsAt);
  if (Number.isNaN(event.getTime())) return false;
  return new Date(event.getFullYear(), event.getMonth(), event.getDate()).getTime()
    <= new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
};

const money = (value: number) => `${Math.max(0, Math.round(Number(value || 0))).toLocaleString('ru-RU')} ₽`;
const debt = (participant: EveningParticipant) => Math.max(0, Number(participant.amount_due || 0) - Number(participant.amount_paid || 0));
const paymentComplete = (participant: EveningParticipant) => participant.payment_status === 'paid' || participant.payment_status === 'waived' || debt(participant) === 0;

const actionWord = (count: number) => {
  const mod100 = count % 100;
  const mod10 = count % 10;
  if (mod100 >= 11 && mod100 <= 14) return 'действий';
  if (mod10 === 1) return 'действие';
  if (mod10 >= 2 && mod10 <= 4) return 'действия';
  return 'действий';
};

const eveningMeta = (evening: GameEvening) => {
  const date = new Date(evening.starts_at);
  const when = Number.isNaN(date.getTime())
    ? ''
    : `${date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })} · ${date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`;
  return [when, evening.venue].filter(Boolean).join(' · ');
};

const responseTone = (participant: EveningParticipant) => {
  const response = getEveningResponse(participant);
  if (response === 'going') return 'bg-success-soft text-success';
  if (response === 'late') return 'bg-accent-soft text-text-primary';
  if (response === 'thinking') return 'bg-warning-soft text-warning';
  return 'bg-surface-2 text-text-muted';
};

const rowStatusLabel = (participant: EveningParticipant) => {
  if (participant.attendance_status === 'attended') return 'Здесь';
  if (participant.attendance_status === 'no_show') return 'Не пришёл';
  return EVENING_RESPONSE_LABELS[getEveningResponse(participant)];
};

const rowStatusTone = (participant: EveningParticipant) => {
  if (participant.attendance_status === 'attended') return 'bg-success-soft text-success';
  if (participant.attendance_status === 'no_show') return 'bg-danger-soft text-danger';
  return responseTone(participant);
};

const factSummary = (participant: EveningParticipant) => {
  if (participant.attendance_status === 'no_show') return 'Не пришёл';
  if (participant.attendance_status === 'attended') {
    const remaining = debt(participant);
    if (!paymentComplete(participant) && remaining > 0) return `Здесь · осталось ${money(remaining)}`;
    return participant.payment_status === 'waived' ? 'Здесь · без оплаты' : 'Здесь · оплачено';
  }
  return 'Явка не отмечена';
};

const buildParticipantView = (participant: EveningParticipant, canMarkFacts: boolean, canEdit: boolean): ParticipantView => {
  if (participant.attendance_status === 'no_show') {
    return { participant, action: null, needsAction: false, subtitle: 'Не пришёл' };
  }

  if (participant.attendance_status === 'attended') {
    const remaining = debt(participant);
    if (!paymentComplete(participant) && remaining > 0) {
      return { participant, action: canEdit ? 'pay' : null, needsAction: canEdit, subtitle: `Осталось ${money(remaining)}` };
    }
    return {
      participant,
      action: null,
      needsAction: false,
      subtitle: participant.payment_status === 'waived' ? 'Без оплаты' : 'Оплачено',
    };
  }

  const response = getEveningResponse(participant);
  if (canMarkFacts && isAttendingResponse(participant)) {
    return { participant, action: 'attend', needsAction: true, subtitle: 'Явка не отмечена' };
  }

  return { participant, action: null, needsAction: false, subtitle: EVENING_RESPONSE_LABELS[response] };
};

interface EveningParticipantsWorkboardProps {
  eveningId: string;
  onBack: () => void;
  onAddPlayer: () => void;
  onOpenPlayerCard?: (id: string) => void;
  onChanged?: () => void;
}

export default function EveningParticipantsWorkboard({ eveningId, onBack, onAddPlayer, onOpenPlayerCard, onChanged }: EveningParticipantsWorkboardProps) {
  const [evening, setEvening] = useState<EveningData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<WorkFilter>('action');
  const [activeParticipant, setActiveParticipant] = useState<EveningParticipant | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const data = await api.getEvening(eveningId) as EveningData;
      setEvening(data);
      setActiveParticipant((current) => current
        ? data.participants.find((participant) => participant.id === current.id) || null
        : null);
    } catch (err: any) {
      setError(err?.message || 'Не удалось загрузить состав вечера');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [eveningId]);

  useEffect(() => { void load(); }, [load]);

  const readonly = Boolean(evening && (evening.status === 'completed' || evening.status === 'cancelled' || evening.settled_at));
  const canMarkFacts = Boolean(evening && eventDayOrPast(evening.starts_at) && !readonly);
  const participantViews = useMemo(
    () => (evening?.participants || []).map((participant) => buildParticipantView(participant, canMarkFacts, !readonly)),
    [evening, canMarkFacts, readonly],
  );
  const responseCounts = useMemo(() => countEveningResponses(evening?.participants || []), [evening]);
  const actionViews = useMemo(() => participantViews.filter((item) => item.needsAction), [participantViews]);
  const attendedCount = useMemo(() => participantViews.filter((item) => item.participant.attendance_status === 'attended').length, [participantViews]);
  const attendanceActions = actionViews.filter((item) => item.action === 'attend').length;
  const paymentActions = actionViews.filter((item) => item.action === 'pay').length;

  useEffect(() => {
    if (!loading && filter === 'action' && actionViews.length === 0) setFilter('all');
  }, [actionViews.length, filter, loading]);

  const visibleViews = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('ru-RU');
    return participantViews.filter((item) => {
      const participant = item.participant;
      const matchesSearch = !query || participant.nickname.toLocaleLowerCase('ru-RU').includes(query);
      if (!matchesSearch) return false;
      if (filter === 'action') return item.needsAction;
      if (filter === 'here') return participant.attendance_status === 'attended';
      if (filter === 'other') return !item.needsAction && participant.attendance_status !== 'attended';
      return true;
    });
  }, [filter, participantViews, search]);

  const patch = async (participant: EveningParticipant, data: Partial<EveningParticipant>, action: string) => {
    if (busy || readonly) return;
    setBusy(`${action}:${participant.id}`);
    setError(null);
    try {
      await api.updateParticipant(participant.id, data);
      await load(true);
      onChanged?.();
    } catch (err: any) {
      setError(err?.message || 'Не удалось обновить игрока');
    } finally {
      setBusy(null);
    }
  };

  const markAttended = (participant: EveningParticipant) => patch(participant, { attendance_status: 'attended' }, 'attend');
  const markNoShow = (participant: EveningParticipant) => patch(participant, { attendance_status: 'no_show' }, 'no-show');
  const markPaid = (participant: EveningParticipant) => patch(participant, { amount_paid: Number(participant.amount_due || 0), payment_status: 'paid' }, 'pay');
  const undoPaid = (participant: EveningParticipant) => patch(participant, { amount_paid: 0, payment_status: 'unpaid' }, 'unpay');

  if (loading && !evening) return <div className="rounded-[18px] border border-border-soft bg-surface-1 py-14 text-center text-[12px] text-text-muted">Загрузка состава…</div>;
  if (!evening) return <div className="rounded-[18px] border border-danger/30 bg-danger-soft p-4 text-[12px] text-danger">{error || 'Не удалось загрузить вечер'}<button type="button" onClick={() => void load()} className="ml-2 font-bold underline">Повторить</button></div>;

  const filters: Array<{ id: WorkFilter; label: string; count: number }> = [
    { id: 'action', label: 'Действия', count: actionViews.length },
    { id: 'here', label: 'Здесь', count: attendedCount },
    { id: 'all', label: 'Все', count: participantViews.length },
    { id: 'other', label: 'Остальные', count: participantViews.filter((item) => !item.needsAction && item.participant.attendance_status !== 'attended').length },
  ];

  return <section data-testid="evening-roster-workboard" className="space-y-2.5">
    <div className="rounded-[17px] border border-border-soft bg-surface-1 p-3">
      <div className="flex items-center gap-2.5">
        <button type="button" aria-label="Назад" onClick={onBack} className="grid h-11 w-11 shrink-0 place-items-center rounded-[12px] border border-border-soft bg-surface-2 text-text-secondary"><ArrowLeft className="h-4 w-4" /></button>
        <div className="min-w-0 flex-1">
          <div className="text-[8px] font-semibold uppercase tracking-[0.13em] text-text-muted">Состав вечера</div>
          <h2 className="mt-0.5 truncate text-[14px] font-semibold text-text-primary">{evening.title}</h2>
          <p className="mt-0.5 truncate text-[9px] text-text-muted">{eveningMeta(evening)}</p>
        </div>
        <button type="button" aria-label="Обновить состав" disabled={Boolean(busy)} onClick={() => void load()} className="grid h-11 w-11 shrink-0 place-items-center rounded-[12px] border border-border-soft bg-surface-2 text-text-secondary disabled:opacity-40"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /></button>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5 text-[8px] font-semibold text-text-muted">
        <span className="rounded-full bg-black/20 px-2 py-1"><strong className="text-text-primary">{participantViews.length}</strong> в составе</span>
        <span className="rounded-full bg-black/20 px-2 py-1"><strong className="text-success">{attendedCount}</strong> здесь</span>
        <span className="rounded-full bg-black/20 px-2 py-1"><strong className="text-text-primary">{responseCounts.late}</strong> позже</span>
        <span className="rounded-full bg-black/20 px-2 py-1"><strong className="text-warning">{responseCounts.thinking}</strong> думают</span>
      </div>
    </div>

    {error ? <div className="flex gap-2 rounded-[14px] border border-danger/30 bg-danger-soft p-3 text-[11px] text-danger"><AlertCircle className="h-4 w-4 shrink-0" />{error}</div> : null}

    <div data-testid="evening-roster-action-summary" className={`rounded-[15px] border px-3 py-2.5 ${actionViews.length ? 'border-warning/25 bg-warning-soft' : 'border-success/20 bg-success-soft'}`}>
      {actionViews.length ? <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1"><div className="text-[8px] font-semibold uppercase tracking-[0.12em] text-warning">Нужно сделать</div><div className="mt-0.5 text-[13px] font-semibold text-text-primary">{actionViews.length} {actionWord(actionViews.length)}</div><div className="mt-0.5 truncate text-[9px] text-text-muted">Сверху вниз: явка → оплата</div></div>
        <div className="shrink-0 rounded-[11px] bg-surface-1/60 px-2.5 py-1.5 text-[9px] text-text-muted"><strong className="text-text-primary">Явка {attendanceActions}</strong><span className="mx-1 text-border-strong">·</span><strong className="text-text-primary">Оплата {paymentActions}</strong></div>
      </div> : <div className="flex items-center gap-2.5"><CheckCircle2 className="h-4 w-4 shrink-0 text-success" /><div><div className="text-[12px] font-semibold text-text-primary">По составу всё готово</div><div className="mt-0.5 text-[9px] text-text-muted">Можно переходить к играм.</div></div></div>}
    </div>

    <div className="flex gap-2">
      <div className="relative min-w-0 flex-1"><Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Найти игрока" className="mobile-field pl-10" /></div>
      <button data-testid="evening-roster-add-player" type="button" onClick={onAddPlayer} aria-label="Добавить игрока или изменить состав" className="grid h-[44px] w-[48px] shrink-0 place-items-center rounded-[12px] bg-white text-[#090a0d]"><UserPlus className="h-4 w-4" /></button>
    </div>

    <div className="grid grid-cols-4 gap-1.5">
      {filters.map((item) => <button key={item.id} data-testid={`evening-roster-filter-${item.id}`} type="button" onClick={() => setFilter(item.id)} className={`min-h-[44px] min-w-0 rounded-[12px] border px-1 text-[9px] font-semibold ${filter === item.id ? 'border-white/16 bg-white/[0.09] text-text-primary' : 'border-border-soft bg-surface-1 text-text-secondary'}`}><span className="block truncate">{item.label}</span><span className="mt-0.5 block text-[10px] font-bold">{item.count}</span></button>)}
    </div>

    {visibleViews.length ? <div data-testid="evening-roster-list" className="overflow-hidden rounded-[17px] border border-border-soft bg-surface-1">
      {visibleViews.map((item, index) => {
        const participant = item.participant;
        const rowBusy = Boolean(busy?.endsWith(`:${participant.id}`));
        return <div key={participant.id} data-testid={`evening-roster-row-${participant.id}`} className={`${index ? 'border-t border-border-soft' : ''} flex min-h-[62px] items-center gap-2 px-2.5 py-2`}>
          <button type="button" onClick={() => setActiveParticipant(participant)} className="flex min-w-0 flex-1 items-center gap-2.5 text-left">
            <PlayerAvatar playerId={participant.player_id} nickname={participant.nickname} size="xs" />
            <span className="min-w-0 flex-1">
              <span className="flex min-w-0 items-center gap-1.5"><strong className="truncate text-[12px] font-semibold text-text-primary">{participant.nickname}</strong><span className={`shrink-0 rounded-full px-2 py-0.5 text-[8px] font-semibold ${rowStatusTone(participant)}`}>{rowStatusLabel(participant)}</span></span>
              <span className={`mt-0.5 block truncate text-[9px] ${item.needsAction ? 'text-warning' : 'text-text-muted'}`}>{item.subtitle}</span>
            </span>
          </button>
          {item.action === 'attend' ? <button data-testid={`evening-roster-action-${participant.id}`} type="button" disabled={Boolean(busy)} onClick={() => void markAttended(participant)} className="min-h-[44px] shrink-0 rounded-[11px] bg-white px-3 text-[10px] font-semibold text-[#090a0d] disabled:opacity-40">{rowBusy ? '…' : 'Пришёл'}</button> : item.action === 'pay' ? <button data-testid={`evening-roster-action-${participant.id}`} type="button" disabled={Boolean(busy)} onClick={() => void markPaid(participant)} className="min-h-[44px] shrink-0 rounded-[11px] bg-success-soft px-3 text-[10px] font-semibold text-success disabled:opacity-40">{rowBusy ? '…' : `Принять ${money(debt(participant))}`}</button> : <button type="button" aria-label={`Открыть ${participant.nickname}`} onClick={() => setActiveParticipant(participant)} className="grid h-11 w-9 shrink-0 place-items-center text-text-muted"><ChevronRight className="h-4 w-4" /></button>}
        </div>;
      })}
    </div> : <div className="rounded-[17px] border border-dashed border-border-soft bg-surface-1 p-6 text-center text-[11px] text-text-muted">{filter === 'action' && !actionViews.length ? 'Все обязательные действия по составу выполнены.' : 'По этому фильтру никого нет.'}</div>}

    <MobileSheet open={Boolean(activeParticipant)} onClose={() => setActiveParticipant(null)} title={activeParticipant ? <div className="flex min-w-0 items-center gap-2.5"><PlayerAvatar playerId={activeParticipant.player_id} nickname={activeParticipant.nickname} size="sm" /><span className="truncate text-[15px] font-semibold text-text-primary">{activeParticipant.nickname}</span></div> : 'Игрок'} subtitle={activeParticipant ? EVENING_RESPONSE_LABELS[getEveningResponse(activeParticipant)] : undefined} widthClass="sm:max-w-lg">
      {activeParticipant ? <div data-testid="evening-roster-player-sheet" className="space-y-3">
        <div className="rounded-[16px] border border-border-soft bg-surface-1 p-3.5">
          <div className="text-[9px] font-semibold uppercase tracking-[0.13em] text-text-muted">В этом вечере</div>
          <div className="mt-2 text-[13px] font-semibold text-text-primary">{factSummary(activeParticipant)}</div>
          <div className="mt-1 text-[10px] text-text-muted">Ответ: {EVENING_RESPONSE_LABELS[getEveningResponse(activeParticipant)]}{Number(activeParticipant.amount_due || 0) > 0 ? ` · к оплате ${money(activeParticipant.amount_due)}` : ''}</div>
        </div>

        {!readonly && canMarkFacts && activeParticipant.attendance_status === 'pending' ? <div className="grid grid-cols-2 gap-2"><button type="button" disabled={Boolean(busy)} onClick={() => void markAttended(activeParticipant)} className="min-h-[48px] rounded-[13px] bg-white px-3 text-[11px] font-semibold text-[#090a0d] disabled:opacity-40">Пришёл</button><button type="button" disabled={Boolean(busy)} onClick={() => void markNoShow(activeParticipant)} className="min-h-[48px] rounded-[13px] border border-danger/20 bg-danger-soft px-3 text-[11px] font-semibold text-danger disabled:opacity-40">Не пришёл</button></div> : null}

        {!readonly && activeParticipant.attendance_status === 'no_show' && canMarkFacts ? <button type="button" disabled={Boolean(busy)} onClick={() => void markAttended(activeParticipant)} className="min-h-[48px] w-full rounded-[13px] bg-white px-3 text-[11px] font-semibold text-[#090a0d] disabled:opacity-40">Всё-таки пришёл</button> : null}

        {!readonly && activeParticipant.attendance_status === 'attended' && !paymentComplete(activeParticipant) && debt(activeParticipant) > 0 ? <button type="button" disabled={Boolean(busy)} onClick={() => void markPaid(activeParticipant)} className="min-h-[48px] w-full rounded-[13px] bg-success-soft px-3 text-[11px] font-semibold text-success disabled:opacity-40">Принять {money(debt(activeParticipant))}</button> : null}

        {!readonly && activeParticipant.attendance_status === 'attended' && activeParticipant.payment_status === 'paid' && Number(activeParticipant.amount_paid || 0) > 0 ? <button type="button" disabled={Boolean(busy)} onClick={() => void undoPaid(activeParticipant)} className="min-h-[44px] w-full rounded-[12px] border border-border-soft bg-surface-2 px-3 text-[10px] font-semibold text-text-secondary disabled:opacity-40">Снять отметку об оплате</button> : null}

        {activeParticipant.attendance_status === 'attended' && activeParticipant.payment_status === 'partial' ? <div className="rounded-[13px] bg-surface-2 p-3 text-[10px] leading-4 text-text-muted">Частичная оплата сохранена: {money(activeParticipant.amount_paid)} из {money(activeParticipant.amount_due)}. Точную сумму можно изменить в «Полном составе».</div> : null}

        {onOpenPlayerCard ? <button type="button" onClick={() => { const id = activeParticipant.player_id; setActiveParticipant(null); onOpenPlayerCard(id); }} className="min-h-[48px] w-full rounded-[13px] border border-border-soft bg-surface-1 px-3 text-[11px] font-semibold text-text-primary">Открыть профиль игрока</button> : null}
      </div> : null}
    </MobileSheet>
  </section>;
}