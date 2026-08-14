import { useEffect, useMemo, useState } from 'react';
import PlayerEventSlotDetail from './PlayerEventSlotDetail.tsx';

type EventSlot = {
  id: string;
  slot_number: number;
  starts_at: string;
  registered_count: number;
  selected?: boolean;
};

type EventItem = {
  id: string;
  title: string;
  starts_at: string;
  venue?: string | null;
  format: string;
  event_type: 'evening' | 'tournament';
  assembled?: boolean;
  assembled_slots?: number;
  required_slots?: number;
  price_per_game?: number;
  participant_count?: number;
  slots?: EventSlot[];
};

type Filter = 'all' | 'novice' | 'club' | 'rating' | 'tournament';
type View = 'list' | 'calendar';

const FILTERS: Array<[Filter, string]> = [
  ['all', 'Все'],
  ['novice', 'Новички'],
  ['club', 'Клуб'],
  ['rating', 'Рейтинг'],
  ['tournament', 'Турниры'],
];

const SLOT_CAPACITY = 11;

const eventKind = (event: EventItem): Filter => {
  if (event.event_type === 'tournament') return 'tournament';
  const format = String(event.format || '').toUpperCase();
  if (format.includes('NOV')) return 'novice';
  if (format.includes('RAT')) return 'rating';
  return 'club';
};

const kindLabel = (event: EventItem) => ({
  novice: 'Новички',
  club: 'Клубный',
  rating: 'Рейтинг',
  tournament: 'Турнир',
  all: 'Все',
} as const)[eventKind(event)];

const kindTone = (event: EventItem) => {
  if (eventKind(event) === 'tournament') return 'bg-violet-400/15 text-violet-100';
  if (eventKind(event) === 'novice') return 'bg-sky-400/15 text-sky-100';
  if (eventKind(event) === 'rating') return 'bg-amber-400/15 text-amber-100';
  return 'bg-emerald-400/15 text-emerald-100';
};

const formatEventDate = (value: string) => new Date(value).toLocaleString('ru-RU', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

const formatSlotTime = (value: string) => new Date(value).toLocaleTimeString('ru-RU', {
  hour: '2-digit',
  minute: '2-digit',
});

function SlotLoadGrid({ event, compact = false }: { event: EventItem; compact?: boolean }) {
  if (event.event_type !== 'evening' || !event.slots?.length) return null;

  return (
    <div className={compact ? 'mt-2 flex flex-wrap gap-1' : 'mt-3 grid grid-cols-2 gap-1.5'}>
      {event.slots.map((slot) => {
        const ready = Number(slot.registered_count || 0) >= SLOT_CAPACITY;
        return (
          <span
            key={slot.id}
            className={`${compact ? 'rounded-lg px-2 py-1 text-[9px]' : 'rounded-xl px-2.5 py-2 text-[10px]'} ${ready ? 'bg-emerald-300/15 text-emerald-100' : slot.selected ? 'bg-white/[0.10] text-white/80' : 'bg-black/25 text-white/50'}`}
          >
            <span className="font-semibold">{formatSlotTime(slot.starts_at)}</span>
            <span className="ml-1">· {Number(slot.registered_count || 0)}/{SLOT_CAPACITY}{ready ? ' ✓' : ''}</span>
          </span>
        );
      })}
    </div>
  );
}

function EventRow({ event, onOpen }: { event: EventItem; onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} className="w-full rounded-2xl border border-white/10 bg-white/[0.035] p-3 text-left active:bg-white/[0.06]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <b className="block truncate text-sm">{event.title}</b>
          <div className="mt-1 text-xs text-white/35">{formatEventDate(event.starts_at)}</div>
          {event.venue && <div className="mt-1 truncate text-[10px] text-white/25">📍 {event.venue}</div>}
        </div>
        <div className="shrink-0 text-right">
          <span className={`rounded-full px-2 py-1 text-[9px] ${kindTone(event)}`}>{kindLabel(event)}</span>
          <div className="mt-1 text-[9px] text-white/35">{event.event_type === 'evening' ? (event.assembled ? 'стол собран' : `${event.assembled_slots || 0}/${event.required_slots || 4} игр`) : `${event.participant_count || 0} игроков`}</div>
        </div>
      </div>
      <SlotLoadGrid event={event} compact />
    </button>
  );
}

export default function PlayerEventsCalendar({
  initialEventId = null,
  onEventChange,
}: {
  initialEventId?: string | null;
  onEventChange?: (eventId: string | null) => void;
}) {
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [events, setEvents] = useState<EventItem[]>([]);
  const [selected, setSelected] = useState<EventItem | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [view, setView] = useState<View>('list');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const monthKey = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}`;
  const queryEventId = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('event') : null;
  const requestedEventId = initialEventId || queryEventId;

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`/api/player/calendar?month=${monthKey}`, { credentials: 'include' });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || 'Не удалось загрузить календарь');
      setEvents(Array.isArray(body.events) ? body.events : []);
    } catch (loadError: any) {
      setError(loadError?.message || 'Не удалось загрузить календарь');
      setEvents([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [monthKey]);

  useEffect(() => {
    let cancelled = false;
    if (!requestedEventId) {
      setSelected(null);
      return () => { cancelled = true; };
    }

    const local = events.find((event) => event.id === requestedEventId);
    if (local) {
      setSelected((current) => current?.id === local.id ? current : local);
      if (!initialEventId && queryEventId) onEventChange?.(local.id);
      return () => { cancelled = true; };
    }

    void (async () => {
      try {
        const response = await fetch(`/api/player/evenings/${encodeURIComponent(requestedEventId)}/slots`, { credentials: 'include' });
        const body = await response.json().catch(() => ({}));
        if (!response.ok || cancelled || !body?.event) return;
        const event: EventItem = {
          id: String(body.event.id || requestedEventId),
          title: String(body.event.title || 'Игровой вечер'),
          starts_at: String(body.event.starts_at || ''),
          venue: body.event.venue ?? null,
          format: String(body.event.format || 'STANDARD'),
          event_type: 'evening',
          assembled: Boolean(body.event.assembled),
          assembled_slots: Number(body.event.assembled_slots || 0),
          required_slots: Number(body.readiness?.required_slots || 4),
          price_per_game: Number(body.price_per_game || body.slots?.[0]?.price || 100),
          slots: Array.isArray(body.slots) ? body.slots.map((slot: any) => ({
            id: String(slot.id),
            slot_number: Number(slot.slot_number || 0),
            starts_at: String(slot.starts_at || ''),
            registered_count: Number(slot.registered_count || 0),
            selected: Array.isArray(body.selection?.slot_ids) && body.selection.slot_ids.includes(slot.id),
          })) : [],
        };
        setSelected(event);
        if (!initialEventId && queryEventId) onEventChange?.(event.id);
      } catch {
        // The calendar remains usable even if an old deep link cannot be resolved.
      }
    })();

    return () => { cancelled = true; };
  }, [events, initialEventId, queryEventId, requestedEventId]);

  const visible = useMemo(
    () => events
      .filter((event) => filter === 'all' || eventKind(event) === filter)
      .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime()),
    [events, filter],
  );

  const nearest = useMemo(() => {
    const now = Date.now();
    return visible.find((event) => new Date(event.starts_at).getTime() >= now - 6 * 60 * 60 * 1000) || null;
  }, [visible]);

  const openEvent = (event: EventItem) => {
    setSelected(event);
    onEventChange?.(event.id);
  };

  const closeEvent = () => {
    setSelected(null);
    onEventChange?.(null);
  };

  if (selected) {
    return <PlayerEventSlotDetail event={selected} onBack={closeEvent} onSaved={() => void load()} />;
  }

  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const leading = (first.getDay() + 6) % 7;
  const count = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const days = Array.from({ length: 42 }, (_, index) => {
    const day = index - leading + 1;
    return day > 0 && day <= count ? day : null;
  });

  return (
    <main className="min-h-screen bg-[#090a0d] px-3 pb-28 pt-3 text-white">
      <div className="mx-auto max-w-[430px]">
        <header className="px-1 pb-3 pt-1">
          <h1 className="text-2xl font-semibold">События</h1>
          <p className="mt-1 text-xs leading-5 text-white/40">Выбирай вечер и сразу отмечай конкретные игры, на которые приедешь.</p>
        </header>

        <section className="rounded-[24px] border border-white/[0.07] bg-white/[0.035] p-2.5">
          <div className="flex items-center justify-between gap-2">
            <button type="button" aria-label="Предыдущий месяц" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/[0.06] text-lg text-white/55">‹</button>
            <b className="min-w-0 flex-1 text-center text-sm capitalize">{month.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })}</b>
            <button type="button" aria-label="Следующий месяц" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/[0.06] text-lg text-white/55">›</button>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-1 rounded-xl bg-black/20 p-1">
            <button type="button" onClick={() => setView('list')} className={`min-h-9 rounded-lg text-[11px] font-semibold ${view === 'list' ? 'bg-white text-black' : 'text-white/40'}`}>Список</button>
            <button type="button" onClick={() => setView('calendar')} className={`min-h-9 rounded-lg text-[11px] font-semibold ${view === 'calendar' ? 'bg-white text-black' : 'text-white/40'}`}>Календарь</button>
          </div>
          <div className="mt-2 flex gap-1 overflow-x-auto pb-0.5 [scrollbar-width:none]">
            {FILTERS.map(([id, text]) => (
              <button key={id} type="button" onClick={() => setFilter(id)} className={`shrink-0 rounded-full px-3 py-1.5 text-[10px] ${filter === id ? 'bg-white/[0.13] text-white' : 'bg-black/20 text-white/35'}`}>{text}</button>
            ))}
          </div>
        </section>

        {error && <div className="mt-3 rounded-2xl border border-rose-300/15 bg-rose-300/[0.07] px-3 py-3 text-xs text-rose-100">{error}</div>}
        {loading && <div className="mt-3 rounded-2xl bg-white/[0.035] p-4 text-sm text-white/40">Загрузка событий…</div>}

        {!loading && !error && view === 'list' && (
          <div className="mt-3 space-y-2">
            {nearest && (
              <button type="button" onClick={() => openEvent(nearest)} className="w-full rounded-[28px] border border-white/12 bg-gradient-to-br from-white/[0.10] to-white/[0.035] p-4 text-left shadow-[0_18px_60px_rgba(0,0,0,0.20)] active:bg-white/[0.08]">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">Ближайшее</div>
                    <div className="mt-2 truncate text-lg font-semibold">{nearest.title}</div>
                    <div className="mt-1 text-xs text-white/45">{formatEventDate(nearest.starts_at)}</div>
                    {nearest.venue && <div className="mt-1 truncate text-xs text-white/30">📍 {nearest.venue}</div>}
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-1.5 text-[10px] font-medium ${kindTone(nearest)}`}>{kindLabel(nearest)}</span>
                </div>
                <SlotLoadGrid event={nearest} />
                <div className="mt-4 flex items-center justify-between gap-3 border-t border-white/[0.07] pt-3">
                  <div className="text-[11px] text-white/40">{nearest.event_type === 'evening' ? `${nearest.assembled_slots || 0}/${nearest.required_slots || 4} игр собрано · ${nearest.price_per_game || 100} ₽/игра` : `${nearest.participant_count || 0} участников`}</div>
                  <span className="shrink-0 rounded-xl bg-white px-3 py-2 text-xs font-semibold text-black">{nearest.event_type === 'evening' ? 'Выбрать игры' : 'Открыть'} →</span>
                </div>
              </button>
            )}

            {visible.filter((event) => event.id !== nearest?.id).map((event) => (
              <EventRow key={`${event.event_type}-${event.id}`} event={event} onOpen={() => openEvent(event)} />
            ))}

            {!visible.length && <div className="rounded-2xl bg-white/[0.035] p-4 text-sm text-white/40">В этом месяце событий выбранного формата пока нет.</div>}
          </div>
        )}

        {!loading && !error && view === 'calendar' && (
          <section className="mt-3 rounded-[24px] border border-white/10 bg-white/[0.035] p-2.5">
            <div className="grid grid-cols-7 gap-1 text-center text-[9px] text-white/25">
              {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map((value) => <div key={value}>{value}</div>)}
            </div>
            <div className="mt-1 grid grid-cols-7 gap-1">
              {days.map((day, index) => {
                if (!day) return <div key={`empty-${index}`} className="min-h-[58px]" />;
                const items = visible.filter((event) => {
                  const date = new Date(event.starts_at);
                  return date.getFullYear() === month.getFullYear() && date.getMonth() === month.getMonth() && date.getDate() === day;
                });
                return (
                  <div key={day} className="min-h-[58px] rounded-lg border border-white/[0.05] bg-black/20 p-1">
                    <div className="text-[9px] text-white/35">{day}</div>
                    {items.slice(0, 2).map((event) => (
                      <button key={`${event.event_type}-${event.id}`} type="button" onClick={() => openEvent(event)} aria-label={`${event.title} ${formatEventDate(event.starts_at)}`} className={`mt-1 block w-full rounded px-1 py-1 text-left text-[7px] ${kindTone(event)}`}>
                        <span className="block truncate">{new Date(event.starts_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</span>
                        <span className="block truncate opacity-70">{kindLabel(event)}</span>
                      </button>
                    ))}
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
