import React, { useEffect, useRef, useState } from 'react';
import { ArrowRight, Calendar, Plus } from 'lucide-react';
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

const field = 'w-full min-h-11 rounded-[12px] border border-white/10 bg-black/20 px-3 text-[13px] text-white outline-none placeholder:text-white/25 focus:border-[var(--ds-accent)]';
const label = 'mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.14em] text-white/35';
const moscowIso = (value: string) => `${value.length === 16 ? `${value}:00` : value}+03:00`;
const displayMoscow = (value: string) => new Date(value).toLocaleString('ru-RU', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Moscow' });
const eveningTotal = (format: EveningFormat, count: number, price: number) => format === 'CASUAL' ? Math.min(count * price, 400) : count * price;

const eventStatusTone = (status: GameEvening['status'], completed: boolean) => {
  if (status === 'active') return 'border-emerald-200/10 bg-emerald-300/[0.08] text-emerald-100';
  if (completed) return 'border-white/[0.07] bg-white/[0.055] text-white/45';
  if (status === 'draft') return 'border-amber-200/10 bg-amber-200/[0.08] text-amber-100';
  return 'border-sky-200/10 bg-sky-300/[0.08] text-sky-100';
};

export const EveningsList: React.FC<Props> = ({ evenings, onOpenEvening, initialCreateOpen = false, onInitialCreateHandled }) => {
  const [tab, setTab] = useState<'evenings' | 'tournaments'>('evenings');
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

  const reset = () => {
    setTitle(''); setStartsAt(''); setFormat('CASUAL'); setSlotCount(6); setDuration(60);
    setPrice(100); setVenue('Суп с Котом'); setNotes(''); setError('');
  };
  const showCreate = () => { reset(); setOpen(true); };

  useEffect(() => {
    if (!initialCreateOpen) return;
    setTab('evenings'); setTournamentId(null); showCreate(); onInitialCreateHandled?.();
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

  return <div className="space-y-4">
    {!tournamentId && <OrganizerEventsCalendar evenings={evenings} onOpenEvening={onOpenEvening} onOpenTournament={openTournament} />}

    <SegmentedControl
      ariaLabel="Типы событий"
      value={tab}
      items={[{ value: 'evenings', label: 'Игровые вечера' }, { value: 'tournaments', label: 'Турниры' }]}
      onValueChange={(value) => { setTab(value); setTournamentId(null); }}
    />

    {tab === 'tournaments' ? (
      tournamentId ? <TournamentDetailView tournamentId={tournamentId} onBack={() => { setTournamentId(null); requestAnimationFrame(() => window.scrollTo({ top: tournamentScroll.current })); }} />
        : <TournamentsList onOpenTournament={openTournament} />
    ) : <>
      <section data-testid="crm-evenings-hero" className="rounded-[28px] border border-white/10 bg-gradient-to-br from-white/[0.065] to-white/[0.03] p-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">Организация клуба</div>
            <h2 className="mt-1 text-xl font-semibold text-white">Игровые вечера</h2>
            <p className="mt-1 text-xs leading-5 text-white/38">Календарь, игровые слоты и запись игроков · 100 ₽ за игру, на клубном вечере максимум 400 ₽</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button disabled={quickBusy} onClick={() => void createFriday()} className="min-h-11 rounded-2xl border border-emerald-200/10 bg-emerald-300/[0.08] px-4 text-xs font-semibold text-emerald-100 disabled:opacity-50"><Plus className="mr-1 inline h-4 w-4" />{quickBusy ? 'Создаём…' : 'Следующая пятница'}</button>
            <button data-testid="crm-new-evening" onClick={showCreate} className="min-h-11 rounded-2xl bg-white px-4 text-xs font-semibold text-[#090a0d]"><Plus className="mr-1 inline h-4 w-4" />Новый вечер</button>
          </div>
        </div>
        {error && !open ? <div className="mt-3 rounded-2xl border border-rose-300/15 bg-rose-300/[0.07] px-3 py-2.5 text-xs text-rose-100/75">{error}</div> : null}
      </section>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
        {evenings.map((evening) => {
          const fmt = normalizeEveningFormat(evening.format);
          const completed = evening.status === 'completed' || Boolean(evening.settled_at);
          return <article key={evening.id} data-testid={`crm-evening-${evening.id}`} className={`rounded-[24px] border border-white/10 bg-white/[0.04] p-4 ${completed ? 'opacity-85' : ''}`}>
            <div className="flex items-center justify-between gap-3"><span className={`rounded-xl border px-2.5 py-1 text-[10px] font-semibold ${eventStatusTone(evening.status, completed)}`}>{evening.status === 'draft' ? 'Черновик' : evening.status === 'active' ? 'Идёт сейчас' : completed ? 'Завершён' : 'Запланирован'}</span><span className="text-[10px] font-semibold text-white/38">{EVENING_FORMAT_LABELS[fmt]}</span></div>
            <h3 className="mt-4 text-base font-semibold text-white">{evening.title}</h3>
            <p className="mt-1 text-xs text-white/40">📅 {displayMoscow(evening.starts_at)}</p>
            {evening.venue ? <p className="mt-0.5 text-[11px] text-white/32">📍 {evening.venue}</p> : null}
            <div className="mt-4 grid grid-cols-3 gap-2 rounded-2xl bg-black/20 p-2.5 text-center"><div><span className="block text-[9px] uppercase tracking-wide text-white/25">Запись</span><b className="mt-0.5 block text-sm font-semibold">{evening.registered_count || 0}</b></div><div><span className="block text-[9px] uppercase tracking-wide text-white/25">Пришло</span><b className="mt-0.5 block text-sm font-semibold">{evening.attended_count || 0}</b></div><div><span className="block text-[9px] uppercase tracking-wide text-white/25">Выручка</span><b className="mt-0.5 block text-sm font-semibold">{evening.total_revenue || 0} ₽</b></div></div>
            <button onClick={() => onOpenEvening(evening.id)} className="mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl bg-white/[0.07] text-xs font-semibold text-white/70 active:bg-white/[0.1]">Открыть вечер <ArrowRight className="h-4 w-4" /></button>
          </article>;
        })}
      </div>
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
