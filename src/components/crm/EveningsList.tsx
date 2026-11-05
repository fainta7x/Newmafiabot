import { eventPriority } from '../../lib/eveningGathering.ts';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, CalendarDays, Filter, Plus } from 'lucide-react';
import { api, type GameEvening } from '../../lib/api.ts';
import { EVENING_FORMAT_DESCRIPTIONS, EVENING_FORMAT_LABELS, normalizeEveningFormat, noviceScheduleLine, noviceStartsAt, type EveningFormat } from '../../lib/eveningFormat.ts';
import MobileSheet from '../ui/MobileSheet.tsx';
import { SegmentedControl } from '../ui/SegmentedControl.tsx';
import { OrganizerEventsCalendar } from './OrganizerEventsCalendar.tsx';
import { TournamentDetailView } from './tournaments/TournamentDetailView.tsx';
import { TournamentsList } from './tournaments/TournamentsList.tsx';
import WeekEventsPanel from './WeekEventsPanel.tsx';
import { formatRubles } from '../../lib/formatRubleAmount.ts';

type Props = {
  evenings: GameEvening[];
  onOpenEvening: (id: string) => void;
  onCreateEvening: (data: Partial<GameEvening>) => Promise<void>;
  initialCreateOpen?: boolean;
  onInitialCreateHandled?: () => void;
  /** Open this tournament at once (from «На этой неделе» on «Сегодня»). */
  initialTournamentId?: string | null;
  onInitialTournamentHandled?: () => void;
  /** Shown only under the evenings tab (not under tournaments): the «Свои ивенты — не мафия» block. */
  eveningsFooter?: React.ReactNode;
};

type TimeView = 'current' | 'future' | 'history';
type FormatFilter = 'all' | EveningFormat;

const field = 'w-full min-h-11 rounded-[12px] border border-white/10 bg-black/20 px-3 text-[14px] text-white outline-none placeholder:text-white/35 focus:border-[var(--ds-accent)]';
const label = 'mb-1.5 block text-[12px] font-semibold uppercase tracking-[0.12em] text-white/45';
const moscowIso = (value: string) => `${value.length === 16 ? `${value}:00` : value}+03:00`;

const moscowToday = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Moscow' });
const moscowNow = () => new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Europe/Moscow' });
const upcomingFriday = (weekOffset = 0) => {
  const date = new Date(`${moscowToday()}T12:00:00Z`);
  const days = (5 - date.getUTCDay() + 7) % 7 || 7;
  date.setUTCDate(date.getUTCDate() + days + weekOffset * 7);
  return date.toISOString().slice(0, 10);
};
const readableEveningDate = (date: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return '';
  const parsed = new Date(`${date}T12:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date
    ? parsed.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
    : '';
};
const scheduledMomentValid = (value: string) => {
  const date = value.slice(0, 10);
  const time = value.slice(11, 16);
  if (!readableEveningDate(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return false;
  return date > moscowToday() || (date === moscowToday() && time > moscowNow());
};

const displayMoscow = (value: string) => new Date(value).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' });
const isClosed = (evening: GameEvening) => evening.status === 'completed' || evening.status === 'cancelled' || Boolean(evening.settled_at);
const startTimestamp = (evening: GameEvening) => new Date(evening.starts_at).getTime();
const isOverdueOpen = (evening: GameEvening, now = Date.now()) => !isClosed(evening)
  && evening.status !== 'active'
  && evening.status !== 'draft'
  && startTimestamp(evening) < now;

const statusLabel = (evening: GameEvening) => {
  if (evening.status === 'active') return 'Идёт сейчас';
  if (evening.status === 'draft') return 'Черновик';
  if (evening.status === 'cancelled') return 'Отменён';
  if (isClosed(evening)) return 'Завершён';
  if (isOverdueOpen(evening)) return 'Ожидает запуска';
  return 'Запланирован';
};

const eventStatusTone = (evening: GameEvening) => {
  if (evening.status === 'active') return 'border-emerald-200/10 bg-emerald-300/[0.08] text-emerald-100';
  if (isClosed(evening)) return 'border-white/[0.07] bg-white/[0.055] text-white/55';
  if (evening.status === 'draft' || isOverdueOpen(evening)) return 'border-amber-200/10 bg-amber-200/[0.08] text-amber-100';
  return 'border-sky-200/10 bg-sky-300/[0.08] text-sky-100';
};

const EventRow = ({ evening, onOpenEvening, history = false }: { evening: GameEvening; onOpenEvening: (id: string) => void; history?: boolean }) => {
  const fmt = normalizeEveningFormat(evening.format);
  return (
    <button type="button" data-testid={`crm-evening-${evening.id}`} onClick={() => onOpenEvening(evening.id)} className="flex min-h-[82px] w-full items-center gap-3 border-b border-white/[0.07] px-3.5 py-3 text-left last:border-b-0 active:bg-white/[0.04]">
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-start gap-2">
          <strong className="line-clamp-2 min-w-0 flex-1 text-[14px] font-semibold leading-5 text-white">{evening.title}</strong>
          <span className={`shrink-0 rounded-lg border px-2 py-1 text-[12px] font-semibold ${eventStatusTone(evening)}`}>{statusLabel(evening)}</span>
        </span>
        <span className="mt-1 block line-clamp-2 text-[12px] leading-4 text-white/50">{displayMoscow(evening.starts_at)}{evening.venue ? ` · ${evening.venue}` : ''}</span>
        <span className="mt-1 block text-[12px] text-white/40">{EVENING_FORMAT_LABELS[fmt]} · {history ? `пришло ${evening.attended_count || 0} · ${formatRubles(evening.total_revenue || 0)}` : `записано ${evening.registered_count || 0}`}</span>
      </span>
      <ArrowRight className="h-4 w-4 shrink-0 text-white/35" />
    </button>
  );
};

export const EveningsList: React.FC<Props> = ({ evenings, onOpenEvening, initialCreateOpen = false, onInitialCreateHandled, initialTournamentId = null, onInitialTournamentHandled, eveningsFooter }) => {
  const [tab, setTab] = useState<'evenings' | 'tournaments' | 'custom'>('evenings');
  const [timeView, setTimeView] = useState<TimeView>('current');
  const [showCalendar, setShowCalendar] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [showCancelled, setShowCancelled] = useState(false);
  const [formatFilter, setFormatFilter] = useState<FormatFilter>('all');
  const [tournamentId, setTournamentId] = useState<string | null>(null);
  const tournamentScroll = useRef(0);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [title, setTitle] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [dateConfirmed, setDateConfirmed] = useState(false);
  const [format, setFormat] = useState<EveningFormat>('CASUAL');
  const [slotCount, setSlotCount] = useState(6);
  const [duration, setDuration] = useState(60);
  const [price, setPrice] = useState(100);
  const [venue, setVenue] = useState('Суп с Котом');
  const [notes, setNotes] = useState('');

  const filteredEvenings = useMemo(() => formatFilter === 'all'
    ? evenings
    : evenings.filter((evening) => normalizeEveningFormat(evening.format) === formatFilter), [evenings, formatFilter]);

  const clusters = useMemo(() => {
    const now = Date.now();
    const openEvenings = filteredEvenings.filter((evening) => !isClosed(evening)).sort((a, b) => eventPriority(a.format) - eventPriority(b.format) || startTimestamp(a) - startTimestamp(b));
    const active = openEvenings.filter((evening) => evening.status === 'active').sort((a, b) => startTimestamp(b) - startTimestamp(a));
    const overdue = openEvenings.filter((evening) => isOverdueOpen(evening, now)).sort((a, b) => startTimestamp(b) - startTimestamp(a));
    const upcoming = openEvenings.filter((evening) => evening.status !== 'active' && startTimestamp(evening) >= now);
    const staleDrafts = openEvenings.filter((evening) => evening.status === 'draft' && startTimestamp(evening) < now);
    const currentCandidates = [...active, ...overdue];
    const highlighted = currentCandidates.slice(0, 2);
    if (highlighted.length < 2 && upcoming[0]) highlighted.push(upcoming[0]);
    if (!highlighted.length && staleDrafts[0]) highlighted.push(staleDrafts[0]);
    const highlightedIds = new Set(highlighted.map((item) => item.id));
    return {
      highlighted,
      currentAttention: currentCandidates.filter((evening) => !highlightedIds.has(evening.id)),
      future: upcoming.filter((evening) => !highlightedIds.has(evening.id)),
      staleAttention: staleDrafts.filter((evening) => !highlightedIds.has(evening.id)),
      history: filteredEvenings.filter((evening) => isClosed(evening) && evening.status !== 'cancelled').sort((a, b) => startTimestamp(b) - startTimestamp(a)),
      // Cancelled evenings (incl. the repeated copies of 2026-09-25) stay out of the way, one tap away.
      cancelled: filteredEvenings.filter((evening) => evening.status === 'cancelled').sort((a, b) => startTimestamp(b) - startTimestamp(a)),
    };
  }, [filteredEvenings]);

  const primaryEvening = clusters.highlighted[0] || null;
  // The big card only for a running evening, one whose time has passed and still needs a decision,
  // or one beyond this week (absent from the week list): upcoming evenings sit evenly in the list.
  const primaryStandsOut = Boolean(primaryEvening && (String(primaryEvening.status) === 'active'
    || startTimestamp(primaryEvening) < Date.now()
    || startTimestamp(primaryEvening) >= Date.now() + 7 * 86_400_000));
  const nextEvening = clusters.highlighted[1] || null;
  const activeFormatLabel = formatFilter === 'all' ? 'Все форматы' : EVENING_FORMAT_LABELS[formatFilter];

  const reset = () => { setTitle(''); setStartsAt(''); setDateConfirmed(false); setFormat('CASUAL'); setSlotCount(6); setDuration(60); setPrice(100); setVenue('Суп с Котом'); setNotes(''); setError(''); };
  const chooseStart = (value: string) => { setStartsAt(value); setDateConfirmed(false); setError(''); };
  const chooseDay = (day: string) => chooseStart(day ? `${day}T${startsAt.slice(11, 16) || '19:00'}` : '');
  const chosenDate = startsAt.slice(0, 10);
  const chosenTime = startsAt.slice(11, 16);
  const chosenDateLabel = readableEveningDate(chosenDate);
  const startIsValid = scheduledMomentValid(startsAt);
  const onDateAlreadyPlanned = evenings.filter((evening) => chosenDate && new Date(evening.starts_at).toLocaleDateString('sv-SE', { timeZone: 'Europe/Moscow' }) === chosenDate && !isClosed(evening));
  const sameMoment = onDateAlreadyPlanned.filter((evening) => new Date(evening.starts_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Europe/Moscow' }) === chosenTime);

  const showCreate = () => { reset(); setOpen(true); };
  const showFridayCreate = () => { reset(); setStartsAt(`${upcomingFriday()}T19:00`); setOpen(true); };

  useEffect(() => {
    if (!initialTournamentId) return;
    openTournament(initialTournamentId); onInitialTournamentHandled?.();
  }, [initialTournamentId]);

  useEffect(() => {
    if (!initialCreateOpen) return;
    setTab('evenings'); setTimeView('current'); setTournamentId(null); showCreate(); onInitialCreateHandled?.();
  }, [initialCreateOpen, onInitialCreateHandled]);

  const configureSlots = async (eveningId: string, start: string, count: number, slotDuration: number, pricePerGame: number) => {
    const response = await fetch(`/api/evenings/${encodeURIComponent(eveningId)}/slots`, { method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ planned_slots: count, slot_duration_minutes: slotDuration, price_per_game: pricePerGame, starts_at: start }) });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body?.error || 'Не удалось настроить игры вечера');
  };

  const suggestedTitle = (() => {
    // startsAt is the «Москва» wall-clock value from the input; read its calendar date directly.
    const day = /^\d{4}-\d{2}-\d{2}/.test(startsAt) ? startsAt.slice(0, 10) : new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Moscow' });
    return `Игровой вечер — ${new Date(`${day}T12:00:00Z`).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', timeZone: 'UTC' })}`;
  })();

  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving) return;
    if (!startIsValid) { setError('Выбери будущую дату и время начала по Москве.'); setDateConfirmed(false); return; }
    if (!dateConfirmed) { setDateConfirmed(true); return; }
    setSaving(true); setError('');
    let createdId = '';
    try {
      const start = moscowIso(startsAt);
      const created = await api.createEvening({ title: title.trim() || suggestedTitle, starts_at: start, timezone: 'Europe/Moscow', format, status: 'draft', default_price: price, venue: venue.trim() || 'Суп с Котом', notes: notes.trim() });
      createdId = created.id;
      await configureSlots(created.id, start, slotCount, duration, price);
      setOpen(false); reset(); onOpenEvening(created.id);
    } catch (e: any) {
      if (createdId) { try { await api.deleteEvening(createdId); } catch {} }
      setError(e?.message || 'Не удалось создать вечер');
    } finally { setSaving(false); }
  };

  const moveTop = () => requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'auto' }));
  const openTournament = (id: string) => { tournamentScroll.current = window.scrollY; setTab('tournaments'); setTournamentId(id); moveTop(); };

  return <div className="space-y-3 sm:space-y-4">
    {!tournamentId ? <header className="flex items-center justify-between gap-3 px-0.5">
      <div className="min-w-0"><h2 className="text-[22px] font-semibold tracking-tight text-white sm:text-[24px]">События</h2><p className="mt-1 text-[13px] text-white/45">Мафия, турниры и свои события клуба.</p></div>
      <div className="flex shrink-0 gap-2"><button type="button" aria-label="Календарь" aria-pressed={showCalendar} onClick={() => setShowCalendar((value) => !value)} className={`grid h-11 w-11 place-items-center rounded-[12px] border ${showCalendar ? 'border-white/20 bg-white/[0.1] text-white' : 'border-white/10 bg-white/[0.04] text-white/55'}`}><CalendarDays className="h-4.5 w-4.5" /></button><button data-testid="crm-new-evening" type="button" onClick={showCreate} className="inline-flex min-h-11 items-center gap-1.5 rounded-[12px] bg-white px-3 text-[14px] font-semibold text-[#090a0d]"><Plus className="h-4 w-4" /> Новый</button></div>
    </header> : null}

    {/* Non-mafia events are a third kind next to evenings and tournaments (owner, 2026-10-01), not a block under the list. */}
    {!tournamentId ? <SegmentedControl ariaLabel="Типы событий" value={tab} items={[{ value: 'evenings', label: 'Вечера' }, { value: 'tournaments', label: 'Турниры' }, ...(eveningsFooter ? [{ value: 'custom' as const, label: 'Свои события' }] : [])]} onValueChange={(value) => { setTab(value); setTournamentId(null); setShowCalendar(false); }} /> : null}

    {tab === 'evenings' && !tournamentId ? <div className="rounded-[16px] border border-white/[0.08] bg-white/[0.03] p-1.5">
      <SegmentedControl ariaLabel="Период событий" value={timeView} items={[{ value: 'current', label: 'Актуальное' }, { value: 'future', label: `Будущее${clusters.future.length ? ` · ${clusters.future.length}` : ''}` }, { value: 'history', label: 'История' }]} onValueChange={setTimeView} />
      <button type="button" onClick={() => setFiltersOpen((value) => !value)} aria-expanded={filtersOpen} className="mt-1.5 flex min-h-11 w-full items-center justify-between rounded-[11px] px-3 text-[13px] font-semibold text-white/55 active:bg-white/[0.05]"><span className="inline-flex items-center gap-2"><Filter className="h-4 w-4" /> {activeFormatLabel}</span><span aria-hidden="true">{filtersOpen ? '▴' : '▾'}</span></button>
      {filtersOpen ? <div className="mt-1 border-t border-white/[0.07] p-2"><label className="block text-[12px] font-semibold text-white/45" htmlFor="crm-evening-format-filter">Формат вечера</label><select id="crm-evening-format-filter" aria-label="Формат вечеров" value={formatFilter} onChange={(event) => setFormatFilter(event.target.value as FormatFilter)} className="mt-1 min-h-11 w-full rounded-xl border border-white/10 bg-[#111217] px-3 text-[14px] text-white"><option value="all">Все форматы</option><option value="NOVICE">Для новичков</option><option value="CASUAL">Клубный</option><option value="RATING">Рейтинговый</option><option value="TOURNAMENT">Турнирный вечер</option></select></div> : null}
    </div> : null}

    {showCalendar && !tournamentId ? <OrganizerEventsCalendar evenings={filteredEvenings} onOpenEvening={onOpenEvening} onOpenTournament={openTournament} /> : null}

    {tab === 'custom' ? eveningsFooter : tab === 'tournaments' ? (tournamentId ? <TournamentDetailView tournamentId={tournamentId} onBack={() => { setTournamentId(null); requestAnimationFrame(() => window.scrollTo({ top: tournamentScroll.current })); }} /> : <TournamentsList onOpenTournament={openTournament} />) : <>
      {error && !open ? <div className="rounded-[14px] border border-rose-300/15 bg-rose-300/[0.07] px-3 py-2.5 text-[13px] text-rose-100/80">{error}</div> : null}
      {timeView === 'current' ? <div data-testid="crm-events-current" className="space-y-3">
        {/* The big card only for an evening that is running now; upcoming evenings sit evenly in the week list (owner, 2026-10-01). */}
        {primaryEvening && primaryStandsOut ? <section data-testid={`crm-evening-${primaryEvening.id}`} className={`rounded-[22px] border p-4 ${primaryEvening.status === 'active' ? 'border-emerald-300/20 bg-emerald-300/[0.055]' : 'border-white/10 bg-white/[0.04]'}`}>
          <div className="flex items-start gap-3"><div className="min-w-0 flex-1"><div className={`text-[12px] font-semibold uppercase tracking-[0.12em] ${primaryEvening.status === 'active' ? 'text-emerald-200/80' : primaryEvening.status === 'draft' ? 'text-amber-100/70' : 'text-white/45'}`}>{primaryEvening.status === 'active' ? 'Идёт сейчас' : primaryEvening.status === 'draft' && startTimestamp(primaryEvening) < Date.now() ? 'Требует решения' : isOverdueOpen(primaryEvening) ? 'Время уже наступило' : 'Ближайший вечер'}</div><h3 className="mt-1.5 line-clamp-2 text-[19px] font-semibold leading-6 text-white">{primaryEvening.title}</h3><p className="mt-1 line-clamp-2 text-[12px] leading-4 text-white/50">{displayMoscow(primaryEvening.starts_at)}{primaryEvening.venue ? ` · ${primaryEvening.venue}` : ''}</p></div>{primaryEvening.status === 'active' ? null : <span className={`shrink-0 rounded-xl border px-2.5 py-1 text-[12px] font-semibold ${eventStatusTone(primaryEvening)}`}>{statusLabel(primaryEvening)}</span>}</div>
          <div className="mt-4 grid grid-cols-3 gap-1.5 text-center"><div className="rounded-[12px] bg-black/20 px-1 py-2.5"><div className="text-[17px] font-semibold text-white">{primaryEvening.registered_count || 0}</div><div className="text-[12px] text-white/45">записано</div></div><div className="rounded-[12px] bg-black/20 px-1 py-2.5"><div className="text-[17px] font-semibold text-white">{primaryEvening.attended_count || 0}</div><div className="text-[12px] text-white/45">пришло</div></div><div className="rounded-[12px] bg-black/20 px-1 py-2.5"><div className="text-[17px] font-semibold text-white">{formatRubles(primaryEvening.total_revenue || 0)}</div><div className="text-[12px] text-white/45">собрано</div></div></div>
          <button type="button" onClick={() => onOpenEvening(primaryEvening.id)} className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-[12px] bg-white text-[14px] font-semibold text-[#090a0d]">Открыть вечер <ArrowRight className="h-4 w-4" /></button>
        </section> : !primaryEvening ? <section className="rounded-[22px] border border-white/10 bg-white/[0.04] p-5 text-center"><CalendarDays className="mx-auto h-7 w-7 text-white/30" /><h3 className="mt-3 text-[15px] font-semibold text-white">Актуальных вечеров нет</h3><p className="mt-1 text-[13px] text-white/45">Создай ближайший вечер — он появится здесь первым.</p><button type="button" onClick={showCreate} className="mt-4 min-h-11 rounded-[12px] bg-white px-4 text-[14px] font-semibold text-[#090a0d]">Создать вечер</button></section> : null}
        {/* Every event of the next 7 days, evenly (owner, 2026-09-30 / 2026-10-01); only a running evening stands out above. */}
        <WeekEventsPanel variant="cards" evenings={filteredEvenings} onOpenEvening={onOpenEvening} onOpenTournament={openTournament} excludeIds={primaryEvening && primaryStandsOut ? [primaryEvening.id] : []} title={primaryEvening && primaryStandsOut ? 'Ещё на этой неделе' : 'На этой неделе'} includeTournaments={formatFilter === 'all' || String(formatFilter) === 'TOURNAMENT'} />
        {/* «Следом» only when the next evening is not already in the week list above. */}
        {nextEvening && String(nextEvening.status) !== 'active' && startTimestamp(nextEvening) >= Date.now() + 7 * 86_400_000 ? <div data-testid="crm-events-next" className="overflow-hidden rounded-[18px] border border-white/[0.08] bg-white/[0.03]"><div className="px-3.5 pt-3 text-[12px] font-semibold uppercase tracking-[0.12em] text-white/40">{nextEvening.status === 'active' ? 'Тоже идёт' : 'Следом'}</div><EventRow evening={nextEvening} onOpenEvening={onOpenEvening} /></div> : null}
        {clusters.currentAttention.length ? <div data-testid="crm-events-attention" className="overflow-hidden rounded-[18px] border border-amber-200/10 bg-amber-200/[0.04]"><div className="px-3.5 pt-3 text-[12px] font-semibold uppercase tracking-[0.12em] text-amber-100/60">Ещё требуют внимания · {clusters.currentAttention.length}</div>{clusters.currentAttention.map((evening) => <EventRow key={evening.id} evening={evening} onOpenEvening={onOpenEvening} />)}</div> : null}
        {clusters.staleAttention.length ? <button type="button" data-testid="crm-events-stale-drafts" onClick={() => onOpenEvening(clusters.staleAttention[0].id)} className="flex min-h-[56px] w-full items-center gap-3 rounded-[16px] border border-amber-200/10 bg-amber-200/[0.06] px-3.5 text-left"><span className="min-w-0 flex-1"><strong className="block text-[13px] font-semibold text-amber-100">Черновики требуют решения · {clusters.staleAttention.length}</strong><span className="mt-0.5 block truncate text-[12px] text-amber-100/50">{clusters.staleAttention[0].title}</span></span><ArrowRight className="h-4 w-4 shrink-0 text-amber-100/40" /></button> : null}
      </div> : null}

      {timeView === 'future' ? <section data-testid="crm-events-future" className="space-y-3"><div className="flex items-center justify-between gap-3 px-0.5"><div><h3 className="text-[14px] font-semibold text-white">Будущие вечера</h3><p className="mt-0.5 text-[12px] text-white/40">Сначала регулярные, затем рейтинги и турниры</p></div><button type="button" onClick={showFridayCreate} className="min-h-11 shrink-0 rounded-[11px] border border-emerald-200/10 bg-emerald-300/[0.07] px-3 text-[13px] font-semibold text-emerald-100 disabled:opacity-50">+ След. пятница</button></div>{clusters.future.length ? <div className="overflow-hidden rounded-[18px] border border-white/[0.08] bg-white/[0.03]">{clusters.future.map((evening) => <EventRow key={evening.id} evening={evening} onOpenEvening={onOpenEvening} />)}</div> : <div className="rounded-[18px] border border-white/[0.08] bg-white/[0.03] p-5 text-center text-[13px] text-white/45">После актуального вечера планов пока нет.</div>}</section> : null}
      {timeView === 'history' ? <section data-testid="crm-events-history" className="space-y-3"><div className="px-0.5"><h3 className="text-[14px] font-semibold text-white">История</h3><p className="mt-0.5 text-[12px] text-white/40">Завершённые события; отменённые — отдельным списком ниже</p></div>{clusters.history.length ? <div className="overflow-hidden rounded-[18px] border border-white/[0.08] bg-white/[0.03]">{clusters.history.map((evening) => <EventRow key={evening.id} evening={evening} onOpenEvening={onOpenEvening} history />)}</div> : <div className="rounded-[18px] border border-white/[0.08] bg-white/[0.03] p-5 text-center text-[13px] text-white/45">История пока пустая.</div>}{clusters.cancelled.length ? <><button type="button" data-testid="crm-events-cancelled-toggle" onClick={() => setShowCancelled((value) => !value)} className="flex min-h-11 w-full items-center justify-between rounded-[14px] border border-white/[0.08] bg-white/[0.03] px-3.5 text-left text-[13px] font-semibold text-white/60"><span>Отменённые · {clusters.cancelled.length}</span><span className="text-[12px] text-white/40">{showCancelled ? 'Скрыть' : 'Показать'}</span></button>{showCancelled ? <div className="overflow-hidden rounded-[18px] border border-white/[0.08] bg-white/[0.03]">{clusters.cancelled.map((evening) => <EventRow key={evening.id} evening={evening} onOpenEvening={onOpenEvening} history />)}</div> : null}</> : null}</section> : null}
    </>}

    <MobileSheet open={open} title="Новый игровой вечер" subtitle="Сначала выбери день и время по Москве, затем проверь их перед сохранением." onClose={() => !saving && setOpen(false)} widthClass="sm:max-w-lg" footer={<div className="grid grid-cols-[auto_1fr] gap-2"><button type="button" disabled={saving} onClick={() => dateConfirmed ? setDateConfirmed(false) : setOpen(false)} className="min-h-12 rounded-2xl bg-white/[0.06] px-4 text-[14px] font-medium text-white/60">{dateConfirmed ? 'Изменить' : 'Отмена'}</button><button form="new-evening-v2" type="submit" disabled={saving || !startIsValid} className="min-h-12 rounded-2xl bg-white px-4 text-[14px] font-semibold text-[#090a0d] disabled:bg-white/[0.06] disabled:text-white/30">{saving ? 'Сохраняем…' : dateConfirmed ? 'Да, создать вечер' : 'Проверить дату'}</button></div>}>
      <form id="new-evening-v2" onSubmit={create} onChangeCapture={() => { if (dateConfirmed) setDateConfirmed(false); }} className="space-y-4">
        {error ? <div className="rounded-2xl border border-rose-300/15 bg-rose-300/[0.07] px-3 py-2 text-[13px] text-rose-100/80">{error}</div> : null}
        <label className="block"><span className={label}>Название</span><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={suggestedTitle} className={field} /></label>
        <div data-testid="evening-date-picker" className="space-y-3 rounded-2xl border border-sky-200/20 bg-sky-200/[0.055] p-3">
          <div><p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-sky-100/65">Шаг 1 · Когда играем?</p><p className="mt-1 text-[12px] text-white/60">Дата выбирается отдельно. Время указано по Москве.</p></div>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => chooseDay(upcomingFriday())} aria-pressed={chosenDate === upcomingFriday()} className={`min-h-11 rounded-xl border px-2 text-[13px] font-semibold ${chosenDate === upcomingFriday() ? 'border-sky-200/70 bg-sky-100/20 text-white' : 'border-white/15 bg-white/[0.05] text-white/80'}`}>Ближайшая пятница</button>
            <button type="button" onClick={() => chooseDay(upcomingFriday(1))} aria-pressed={chosenDate === upcomingFriday(1)} className={`min-h-11 rounded-xl border px-2 text-[13px] font-semibold ${chosenDate === upcomingFriday(1) ? 'border-sky-200/70 bg-sky-100/20 text-white' : 'border-white/15 bg-white/[0.05] text-white/80'}`}>Через пятницу</button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="block min-w-0"><span className={label}>Дата · обязательно</span><input data-testid="evening-create-date" type="date" required min={moscowToday()} value={chosenDate} onChange={(e) => chooseDay(e.target.value)} className={`${field} min-w-0 px-2`} /></label>
            <label className="block min-w-0"><span className={label}>Начало · Москва</span><input data-testid="evening-create-time" type="time" required step="300" value={chosenTime} onChange={(e) => chooseStart(chosenDate ? `${chosenDate}T${e.target.value}` : '')} disabled={!chosenDate} className={`${field} min-w-0 px-2`} /></label>
          </div>
          <div className="flex flex-wrap gap-2">{['18:30', '19:00', '21:00'].map((time) => <button key={time} type="button" disabled={!chosenDate} aria-pressed={chosenTime === time} onClick={() => chooseStart(`${chosenDate}T${time}`)} className={`min-h-11 rounded-xl border px-4 text-[13px] font-semibold disabled:opacity-35 ${chosenTime === time ? 'border-sky-200/70 bg-sky-100/20 text-white' : 'border-white/15 text-white/70'}`}>{time}</button>)}</div>
          <div data-testid="evening-date-summary" aria-live="polite" className="rounded-xl bg-black/25 px-3 py-3">
            {chosenDateLabel ? <><span className="block text-[16px] font-bold text-white first-letter:uppercase">{chosenDateLabel}</span><span className="mt-1 block text-[20px] font-bold tabular-nums text-sky-100">{chosenTime || 'Время не выбрано'} <span className="text-[12px] font-normal text-white/50">МСК</span></span></> : <span className="block text-[14px] font-semibold text-amber-100">Выбери дату вечера — она пока не установлена</span>}
          </div>
          {chosenDate && !startIsValid ? <p role="alert" className="text-[12px] font-semibold text-amber-100">Выбери будущее время: прошедшие даты и часы не допускаются.</p> : null}
          {onDateAlreadyPlanned.length ? <p data-testid="evening-date-duplicate-warning" className="rounded-xl border border-amber-200/20 bg-amber-200/[0.07] px-3 py-2 text-[12px] text-amber-100">На эту дату уже запланировано вечеров: {onDateAlreadyPlanned.length}. {sameMoment.length ? 'В это же время тоже есть вечер — проверь, не создаёшь ли дубликат.' : 'Проверь расписание перед созданием.'}</p> : null}
        </div>
        <div className="grid gap-3 sm:grid-cols-2"><label className="block"><span className={label}>Формат</span><select value={format} onChange={(e) => { const next = e.target.value as EveningFormat; setFormat(next); setDateConfirmed(false); if (next === 'NOVICE') { setPrice(200); chooseStart(startsAt ? noviceStartsAt(startsAt) : ''); } else if (next === 'CASUAL') setPrice(100); }} className={field}><option value="NOVICE">Для новичков</option><option value="CASUAL">Клубный</option><option value="RATING">Рейтинговый</option><option value="TOURNAMENT">Турнир</option></select><p className="mt-2 text-[12px] leading-4 text-white/40">{EVENING_FORMAT_DESCRIPTIONS[format]}</p>{format === 'NOVICE' && startsAt ? <p className="mt-1 text-[12px] leading-4 text-sky-100/70">{noviceScheduleLine(moscowIso(startsAt))}</p> : null}</label></div>
        <div className="grid grid-cols-2 gap-3"><label><span className={label}>Количество игр</span><select value={slotCount} onChange={(e) => setSlotCount(Number(e.target.value))} className={`${field} font-mono`}>{Array.from({ length: 12 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}</select></label><label><span className={label}>Минут на игру</span><input type="number" min="15" max="180" step="5" value={duration} onChange={(e) => setDuration(Math.max(15, Math.min(180, Number(e.target.value || 60))))} className={`${field} font-mono`} /></label></div>
        <div className="grid gap-3 sm:grid-cols-2"><label><span className={label}>Цена за игру, ₽</span><input type="number" min="0" value={price} onChange={(e) => setPrice(Math.max(0, Number(e.target.value || 0)))} className={`${field} font-mono`} /></label><label><span className={label}>Локация</span><input value={venue} onChange={(e) => setVenue(e.target.value)} className={field} /></label></div>
        {dateConfirmed ? <div data-testid="evening-create-confirmation" role="status" className="space-y-2 rounded-2xl border border-amber-200/35 bg-amber-200/[0.08] p-4"><p className="text-[12px] font-bold uppercase tracking-widest text-amber-100">Шаг 2 · Проверь перед созданием</p><p className="text-[17px] font-bold leading-6 text-white first-letter:uppercase">{chosenDateLabel} · {chosenTime} МСК</p><p className="text-[13px] text-white/75">{EVENING_FORMAT_LABELS[format]} · {slotCount} игр · {venue.trim() || 'Суп с Котом'}</p><p className="text-[12px] text-amber-100/80">Если дата неверная, нажми «Изменить». Вечер ещё не создан.</p></div> : null}
        <div className="rounded-2xl border border-white/[0.07] bg-black/20 px-3 py-3 text-[12px] text-white/50">Будет создано <b className="text-white/80">{slotCount}</b> игр по <b className="text-white/80">{duration} мин</b>. Стоимость берётся из настроек цен. Бесплатное участие — только по подарку организатора.</div>
        <label className="block"><span className={label}>Заметки / описание</span><textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} className={`${field} min-h-24 resize-none py-3`} /></label>
      </form>
    </MobileSheet>
  </div>;
};
