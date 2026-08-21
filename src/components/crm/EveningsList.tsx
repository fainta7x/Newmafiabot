import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, CalendarDays, Plus } from 'lucide-react';
import { api, type GameEvening } from '../../lib/api.ts';
import { EVENING_FORMAT_DESCRIPTIONS, EVENING_FORMAT_LABELS, normalizeEveningFormat, type EveningFormat } from '../../lib/eveningFormat.ts';
import MobileSheet from '../ui/MobileSheet.tsx';
import { SegmentedControl } from '../ui/SegmentedControl.tsx';
import { OrganizerEventsCalendar } from './OrganizerEventsCalendar.tsx';
import { TournamentDetailView } from './tournaments/TournamentDetailView.tsx';
import { TournamentsList } from './tournaments/TournamentsList.tsx';

type Props = {
  evenings: GameEvening[];
  onOpenEvening: (id: string) => void;
  onCreateEvening: (data: Partial<GameEvening>) => Promise<void>;
  initialCreateOpen?: boolean;
  onInitialCreateHandled?: () => void;
};

type TimeView = 'current' | 'future' | 'history';

const field = 'w-full min-h-11 rounded-[12px] border border-white/10 bg-black/20 px-3 text-[13px] text-white outline-none placeholder:text-white/25 focus:border-[var(--ds-accent)]';
const label = 'mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.14em] text-white/35';
const moscowIso = (value: string) => `${value.length === 16 ? `${value}:00` : value}+03:00`;
const displayMoscow = (value: string) => new Date(value).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' });
const eveningTotal = (format: EveningFormat, count: number, price: number) => format === 'CASUAL' ? Math.min(count * price, 400) : count * price;
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
  if (isClosed(evening)) return 'border-white/[0.07] bg-white/[0.055] text-white/45';
  if (evening.status === 'draft' || isOverdueOpen(evening)) return 'border-amber-200/10 bg-amber-200/[0.08] text-amber-100';
  return 'border-sky-200/10 bg-sky-300/[0.08] text-sky-100';
};

const EventRow = ({ evening, onOpenEvening, history = false }: { evening: GameEvening; onOpenEvening: (id: string) => void; history?: boolean }) => {
  const fmt = normalizeEveningFormat(evening.format);
  return (
    <button
      type="button"
      data-testid={`crm-evening-${evening.id}`}
      onClick={() => onOpenEvening(evening.id)}
      className="flex min-h-[78px] w-full items-center gap-3 border-b border-white/[0.07] px-3.5 py-3 text-left last:border-b-0 active:bg-white/[0.04]"
    >
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-center gap-2">
          <strong className="min-w-0 flex-1 truncate text-[13px] font-semibold text-white">{evening.title}</strong>
          <span className={`shrink-0 rounded-lg border px-2 py-1 text-[8px] font-semibold ${eventStatusTone(evening)}`}>{statusLabel(evening)}</span>
        </span>
        <span className="mt-1 block text-[10px] text-white/38">{displayMoscow(evening.starts_at)}{evening.venue ? ` · ${evening.venue}` : ''}</span>
        <span className="mt-1 block text-[9px] text-white/27">
          {EVENING_FORMAT_LABELS[fmt]} · {history ? `пришло ${evening.attended_count || 0} · ${evening.total_revenue || 0} ₽` : `записано ${evening.registered_count || 0}`}
        </span>
      </span>
      <ArrowRight className="h-4 w-4 shrink-0 text-white/25" />
    </button>
  );
};

export const EveningsList: React.FC<Props> = ({ evenings, onOpenEvening, initialCreateOpen = false, onInitialCreateHandled }) => {
  const [tab, setTab] = useState<'evenings' | 'tournaments'>('evenings');
  const [timeView, setTimeView] = useState<TimeView>('current');
  const [showCalendar, setShowCalendar] = useState(false);
  const [tournamentId, setTournamentId] = useState<string | null>(null);
  const tournamentScroll = useRef(0);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [quickBusy, setQuickBusy] = useState(false);
  const [error, setError] = useState('');
  const [title, setTitle] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [format, setFormat] = useState<EveningFormat>('CASUAL');
  const [slotCount, setSlotCount] = useState(6);
  const [duration, setDuration] = useState(60);
  const [price, setPrice] = useState(100);
  const [venue, setVenue] = useState('Суп с Котом');
  const [notes, setNotes] = useState('');

  const clusters = useMemo(() => {
    const now = Date.now();
    const openEvenings = evenings
      .filter((evening) => !isClosed(evening))
      .sort((a, b) => startTimestamp(a) - startTimestamp(b));
    const active = openEvenings
      .filter((evening) => evening.status === 'active')
      .sort((a, b) => startTimestamp(b) - startTimestamp(a));
    const overdue = openEvenings
      .filter((evening) => isOverdueOpen(evening, now))
      .sort((a, b) => startTimestamp(b) - startTimestamp(a));
    const upcoming = openEvenings.filter((evening) => evening.status !== 'active' && startTimestamp(evening) >= now);
    const staleDrafts = openEvenings.filter((evening) => evening.status === 'draft' && startTimestamp(evening) < now);

    const currentCandidates = [...active, ...overdue];
    const highlighted = currentCandidates.slice(0, 2);
    if (highlighted.length < 2 && upcoming[0]) highlighted.push(upcoming[0]);
    if (!highlighted.length && staleDrafts[0]) highlighted.push(staleDrafts[0]);

    const highlightedIds = new Set(highlighted.map((item) => item.id));
    const currentAttention = currentCandidates.filter((evening) => !highlightedIds.has(evening.id));
    const future = upcoming.filter((evening) => !highlightedIds.has(evening.id));
    const staleAttention = staleDrafts.filter((evening) => !highlightedIds.has(evening.id));
    const history = evenings
      .filter(isClosed)
      .sort((a, b) => startTimestamp(b) - startTimestamp(a));

    return { highlighted, currentAttention, future, staleAttention, history };
  }, [evenings]);

  const primaryEvening = clusters.highlighted[0] || null;
  const nextEvening = clusters.highlighted[1] || null;

  const reset = () => {
    setTitle(''); setStartsAt(''); setFormat('CASUAL'); setSlotCount(6); setDuration(60);
    setPrice(100); setVenue('Суп с Котом'); setNotes(''); setError('');
  };
  const showCreate = () => { reset(); setOpen(true); };

  useEffect(() => {
    if (!initialCreateOpen) return;
    setTab('evenings'); setTimeView('current'); setTournamentId(null); showCreate(); onInitialCreateHandled?.();
  }, [initialCreateOpen, onInitialCreateHandled]);

  const configureSlots = async (eveningId: string, start: string, count: number, slotDuration: number, pricePerGame: number) => {
    const response = await fetch(`/api/evenings/${encodeURIComponent(eveningId)}/slots`, {
      method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ planned_slots: count, slot_duration_minutes: slotDuration, price_per_game: pricePerGame, starts_at: start }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body?.error || 'Не удалось настроить игровые слоты');
  };

  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving || !title.trim() || !startsAt) return;
    setSaving(true); setError('');
    let createdId = '';
    try {
      const start = moscowIso(startsAt);
      const created = await api.createEvening({
        title: title.trim(), starts_at: start, timezone: 'Europe/Moscow', format, status: 'draft',
        default_price: price, venue: venue.trim() || 'Суп с Котом', notes: notes.trim(),
      });
      createdId = created.id;
      await configureSlots(created.id, start, slotCount, duration, price);
      setOpen(false); reset(); onOpenEvening(created.id);
    } catch (e: any) {
      if (createdId) { try { await api.deleteEvening(createdId); } catch {} }
      setError(e?.message || 'Не удалось создать вечер');
    } finally { setSaving(false); }
  };

  const createFriday = async () => {
    if (quickBusy) return;
    setQuickBusy(true); setError('');
    try {
      const created = await api.createNextFriday();
      await configureSlots(created.id, created.starts_at, 6, 60, 100);
      onOpenEvening(created.id);
    } catch (e: any) { setError(e?.message || 'Не удалось создать вечер на следующую пятницу'); }
    finally { setQuickBusy(false); }
  };

  const moveTop = () => requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'auto' }));
  const openTournament = (id: string) => { tournamentScroll.current = window.scrollY; setTab('tournaments'); setTournamentId(id); moveTop(); };

  return <div className="space-y-3 sm:space-y-4">
    {!tournamentId ? (
      <header className="flex items-center justify-between gap-3 px-0.5">
        <div className="min-w-0">
          <h2 className="text-[21px] font-semibold tracking-tight text-white sm:text-[24px]">События</h2>
          <p className="mt-0.5 text-[11px] text-white/35">Актуальное отдельно от планов и истории</p>
        </div>
        <div className="flex shrink-0 gap-2">
          <button type="button" aria-label="Календарь" aria-pressed={showCalendar} onClick={() => setShowCalendar((value) => !value)} className={`grid h-11 w-11 place-items-center rounded-[12px] border ${showCalendar ? 'border-white/20 bg-white/[0.1] text-white' : 'border-white/10 bg-white/[0.04] text-white/45'}`}><CalendarDays className="h-4.5 w-4.5" /></button>
          <button data-testid="crm-new-evening" type="button" onClick={showCreate} className="inline-flex min-h-11 items-center gap-1.5 rounded-[12px] bg-white px-3 text-[11px] font-semibold text-[#090a0d]"><Plus className="h-4 w-4" /> Новый</button>
        </div>
      </header>
    ) : null}

    {!tournamentId ? <SegmentedControl
      ariaLabel="Типы событий"
      value={tab}
      items={[{ value: 'evenings', label: 'Игровые вечера' }, { value: 'tournaments', label: 'Турниры' }]}
      onValueChange={(value) => { setTab(value); setTournamentId(null); setShowCalendar(false); }}
    /> : null}

    {showCalendar && !tournamentId ? <OrganizerEventsCalendar evenings={evenings} onOpenEvening={onOpenEvening} onOpenTournament={openTournament} /> : null}

    {tab === 'tournaments' ? (
      tournamentId ? <TournamentDetailView tournamentId={tournamentId} onBack={() => { setTournamentId(null); requestAnimationFrame(() => window.scrollTo({ top: tournamentScroll.current })); }} />
        : <TournamentsList onOpenTournament={openTournament} />
    ) : <>
      <SegmentedControl
        ariaLabel="Период событий"
        value={timeView}
        items={[
          { value: 'current', label: 'Актуальное' },
          { value: 'future', label: `Будущее${clusters.future.length ? ` · ${clusters.future.length}` : ''}` },
          { value: 'history', label: 'История' },
        ]}
        onValueChange={setTimeView}
      />

      {error && !open ? <div className="rounded-[14px] border border-rose-300/15 bg-rose-300/[0.07] px-3 py-2.5 text-[11px] text-rose-100/75">{error}</div> : null}

      {timeView === 'current' ? (
        <div data-testid="crm-events-current" className="space-y-3">
          {primaryEvening ? (
            <section data-testid={`crm-evening-${primaryEvening.id}`} className={`rounded-[22px] border p-4 ${primaryEvening.status === 'active' ? 'border-emerald-300/20 bg-emerald-300/[0.055]' : 'border-white/10 bg-white/[0.04]'}`}>
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className={`text-[9px] font-semibold uppercase tracking-[0.14em] ${primaryEvening.status === 'active' ? 'text-emerald-200/80' : primaryEvening.status === 'draft' ? 'text-amber-100/70' : 'text-white/35'}`}>
                    {primaryEvening.status === 'active' ? 'Идёт сейчас' : primaryEvening.status === 'draft' && startTimestamp(primaryEvening) < Date.now() ? 'Требует решения' : isOverdueOpen(primaryEvening) ? 'Время уже наступило' : 'Ближайший вечер'}
                  </div>
                  <h3 className="mt-1.5 break-words text-[19px] font-semibold leading-tight text-white">{primaryEvening.title}</h3>
                  <p className="mt-1 text-[11px] text-white/42">{displayMoscow(primaryEvening.starts_at)}{primaryEvening.venue ? ` · ${primaryEvening.venue}` : ''}</p>
                </div>
                <span className={`shrink-0 rounded-xl border px-2.5 py-1 text-[9px] font-semibold ${eventStatusTone(primaryEvening)}`}>{statusLabel(primaryEvening)}</span>
              </div>

              <div className="mt-4 grid grid-cols-3 gap-1.5 text-center">
                <div className="rounded-[12px] bg-black/20 px-1 py-2.5"><div className="text-[17px] font-semibold text-white">{primaryEvening.registered_count || 0}</div><div className="text-[8px] text-white/30">записано</div></div>
                <div className="rounded-[12px] bg-black/20 px-1 py-2.5"><div className="text-[17px] font-semibold text-white">{primaryEvening.attended_count || 0}</div><div className="text-[8px] text-white/30">пришло</div></div>
                <div className="rounded-[12px] bg-black/20 px-1 py-2.5"><div className="text-[17px] font-semibold text-white">{primaryEvening.total_revenue || 0} ₽</div><div className="text-[8px] text-white/30">собрано</div></div>
              </div>

              <button type="button" onClick={() => onOpenEvening(primaryEvening.id)} className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-[12px] bg-white text-[11px] font-semibold text-[#090a0d]">Открыть вечер <ArrowRight className="h-4 w-4" /></button>
            </section>
          ) : (
            <section className="rounded-[22px] border border-white/10 bg-white/[0.04] p-5 text-center">
              <CalendarDays className="mx-auto h-7 w-7 text-white/25" />
              <h3 className="mt-3 text-[15px] font-semibold text-white">Актуальных вечеров нет</h3>
              <p className="mt-1 text-[11px] text-white/35">Создай ближайший вечер — он появится здесь первым.</p>
              <button type="button" onClick={showCreate} className="mt-4 min-h-11 rounded-[12px] bg-white px-4 text-[11px] font-semibold text-[#090a0d]">Создать вечер</button>
            </section>
          )}

          {nextEvening ? (
            <div data-testid="crm-events-next" className="overflow-hidden rounded-[18px] border border-white/[0.08] bg-white/[0.03]">
              <div className="px-3.5 pt-3 text-[9px] font-semibold uppercase tracking-[0.14em] text-white/30">Следом</div>
              <EventRow evening={nextEvening} onOpenEvening={onOpenEvening} />
            </div>
          ) : null}

          {clusters.currentAttention.length ? (
            <div data-testid="crm-events-attention" className="overflow-hidden rounded-[18px] border border-amber-200/10 bg-amber-200/[0.04]">
              <div className="px-3.5 pt-3 text-[9px] font-semibold uppercase tracking-[0.14em] text-amber-100/55">Ещё требуют внимания · {clusters.currentAttention.length}</div>
              {clusters.currentAttention.map((evening) => <EventRow key={evening.id} evening={evening} onOpenEvening={onOpenEvening} />)}
            </div>
          ) : null}

          {clusters.staleAttention.length ? (
            <button type="button" data-testid="crm-events-stale-drafts" onClick={() => onOpenEvening(clusters.staleAttention[0].id)} className="flex min-h-[54px] w-full items-center gap-3 rounded-[16px] border border-amber-200/10 bg-amber-200/[0.06] px-3.5 text-left">
              <span className="min-w-0 flex-1"><strong className="block text-[11px] font-semibold text-amber-100">Черновики требуют решения · {clusters.staleAttention.length}</strong><span className="mt-0.5 block truncate text-[9px] text-amber-100/45">{clusters.staleAttention[0].title}</span></span><ArrowRight className="h-4 w-4 shrink-0 text-amber-100/40" />
            </button>
          ) : null}
        </div>
      ) : null}

      {timeView === 'future' ? (
        <section data-testid="crm-events-future" className="space-y-3">
          <div className="flex items-center justify-between gap-3 px-0.5">
            <div><h3 className="text-[14px] font-semibold text-white">Будущие вечера</h3><p className="mt-0.5 text-[10px] text-white/32">По времени, без завершённых событий</p></div>
            <button type="button" disabled={quickBusy} onClick={() => void createFriday()} className="min-h-11 shrink-0 rounded-[11px] border border-emerald-200/10 bg-emerald-300/[0.07] px-3 text-[10px] font-semibold text-emerald-100 disabled:opacity-50">{quickBusy ? 'Создаём…' : '+ След. пятница'}</button>
          </div>
          {clusters.future.length ? <div className="overflow-hidden rounded-[18px] border border-white/[0.08] bg-white/[0.03]">{clusters.future.map((evening) => <EventRow key={evening.id} evening={evening} onOpenEvening={onOpenEvening} />)}</div> : <div className="rounded-[18px] border border-white/[0.08] bg-white/[0.03] p-5 text-center text-[11px] text-white/35">После актуального вечера планов пока нет.</div>}
        </section>
      ) : null}

      {timeView === 'history' ? (
        <section data-testid="crm-events-history" className="space-y-3">
          <div className="px-0.5"><h3 className="text-[14px] font-semibold text-white">История</h3><p className="mt-0.5 text-[10px] text-white/32">Завершённые и отменённые события отдельно от текущей работы</p></div>
          {clusters.history.length ? <div className="overflow-hidden rounded-[18px] border border-white/[0.08] bg-white/[0.03]">{clusters.history.map((evening) => <EventRow key={evening.id} evening={evening} onOpenEvening={onOpenEvening} history />)}</div> : <div className="rounded-[18px] border border-white/[0.08] bg-white/[0.03] p-5 text-center text-[11px] text-white/35">История пока пустая.</div>}
        </section>
      ) : null}
    </>}

    <MobileSheet open={open} title="Новый игровой вечер" subtitle="Сразу задай расписание: первую игру, количество, длительность и цену." onClose={() => !saving && setOpen(false)} widthClass="sm:max-w-lg" footer={<div className="grid grid-cols-[auto_1fr] gap-2"><button disabled={saving} onClick={() => setOpen(false)} className="min-h-12 rounded-2xl bg-white/[0.06] px-4 text-xs font-medium text-white/55">Отмена</button><button form="new-evening-v2" type="submit" disabled={saving || !title.trim() || !startsAt} className="min-h-12 rounded-2xl bg-white px-4 text-xs font-semibold text-[#090a0d] disabled:bg-white/[0.06] disabled:text-white/25">{saving ? 'Сохраняем…' : 'Создать черновик'}</button></div>}>
      <form id="new-evening-v2" onSubmit={create} className="space-y-4">
        {error ? <div className="rounded-2xl border border-rose-300/15 bg-rose-300/[0.07] px-3 py-2 text-xs text-rose-100/75">{error}</div> : null}
        <label className="block"><span className={label}>Название</span><input required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Игровой вечер — 14 августа" className={field} /></label>
        <div className="grid gap-3 sm:grid-cols-2"><label className="block"><span className={label}>Первая игра · Москва</span><input type="datetime-local" required value={startsAt} onChange={(e) => setStartsAt(e.target.value)} className={`${field} font-mono`} /></label><label className="block"><span className={label}>Формат</span><select value={format} onChange={(e) => setFormat(e.target.value as EveningFormat)} className={field}><option value="NOVICE">Для новичков</option><option value="CASUAL">Клубный</option><option value="RATING">Рейтинговый</option><option value="TOURNAMENT">Турнир</option></select><p className="mt-2 text-[10px] leading-4 text-white/28">{EVENING_FORMAT_DESCRIPTIONS[format]}</p></label></div>
        <div className="grid grid-cols-2 gap-3"><label><span className={label}>Количество игр</span><select value={slotCount} onChange={(e) => setSlotCount(Number(e.target.value))} className={`${field} font-mono`}>{Array.from({ length: 12 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}</select></label><label><span className={label}>Минут на игру</span><input type="number" min="15" max="180" step="5" value={duration} onChange={(e) => setDuration(Math.max(15, Math.min(180, Number(e.target.value || 60))))} className={`${field} font-mono`} /></label></div>
        <div className="grid gap-3 sm:grid-cols-2"><label><span className={label}>Цена за игру, ₽</span><input type="number" min="0" value={price} onChange={(e) => setPrice(Math.max(0, Number(e.target.value || 0)))} className={`${field} font-mono`} /></label><label><span className={label}>Локация</span><input value={venue} onChange={(e) => setVenue(e.target.value)} className={field} /></label></div>
        <div className="rounded-2xl border border-white/[0.07] bg-black/20 px-3 py-3 text-[11px] text-white/38">Будет создано <b className="text-white/75">{slotCount}</b> игр по <b className="text-white/75">{duration} мин</b>. {format === 'CASUAL' ? <>Цена: <b className="text-white/75">{price} ₽ за игру</b>, максимум <b className="text-white/75">{eveningTotal(format, slotCount, price)} ₽ за вечер</b>.</> : <>Полный вечер: <b className="text-white/75">{eveningTotal(format, slotCount, price)} ₽</b>.</>}</div>
        <label className="block"><span className={label}>Заметки / описание</span><textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} className={`${field} min-h-24 resize-none py-3`} /></label>
      </form>
    </MobileSheet>
  </div>;
};
