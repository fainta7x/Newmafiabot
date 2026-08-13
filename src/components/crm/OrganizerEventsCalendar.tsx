import React, { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { api, type GameEvening, type Tournament } from '../../lib/api.ts';

type CalendarItem = {
  key: string;
  id: string;
  title: string;
  startsAt: string;
  venue?: string | null;
  kind: 'NOVICE' | 'CASUAL' | 'RATING' | 'TOURNAMENT';
  status?: string | null;
  evening?: GameEvening;
  tournament?: Tournament;
};

type Filter = 'ALL' | CalendarItem['kind'];

const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: 'ALL', label: 'Все' },
  { id: 'NOVICE', label: 'Новички' },
  { id: 'CASUAL', label: 'Клуб' },
  { id: 'RATING', label: 'Рейтинг' },
  { id: 'TOURNAMENT', label: 'Турниры' },
];

const kindOfEvening = (format: string): CalendarItem['kind'] => {
  const value = String(format || '').toUpperCase();
  if (value.includes('NOV')) return 'NOVICE';
  if (value.includes('RAT')) return 'RATING';
  if (value.includes('TOUR')) return 'TOURNAMENT';
  return 'CASUAL';
};

const tone = (kind: CalendarItem['kind']) => {
  if (kind === 'NOVICE') return 'border-sky-400/20 bg-sky-400/10 text-sky-200';
  if (kind === 'RATING') return 'border-amber-400/20 bg-amber-400/10 text-amber-200';
  if (kind === 'TOURNAMENT') return 'border-violet-400/20 bg-violet-400/10 text-violet-200';
  return 'border-emerald-400/20 bg-emerald-400/10 text-emerald-200';
};

const label = (kind: CalendarItem['kind']) => kind === 'NOVICE' ? 'Новички' : kind === 'RATING' ? 'Рейтинг' : kind === 'TOURNAMENT' ? 'Турнир' : 'Клубный';
const dayKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const localTime = (value: string) => new Date(value).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

interface Props {
  evenings: GameEvening[];
  onOpenEvening: (id: string) => void;
  onOpenTournament: (id: string) => void;
}

export const OrganizerEventsCalendar: React.FC<Props> = ({ evenings, onOpenEvening, onOpenTournament }) => {
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [filter, setFilter] = useState<Filter>('ALL');
  const [tournaments, setTournaments] = useState<Tournament[]>([]);

  useEffect(() => {
    let cancelled = false;
    void api.getTournaments().then((items) => {
      if (!cancelled) setTournaments(Array.isArray(items) ? items : []);
    }).catch(() => {
      if (!cancelled) setTournaments([]);
    });
    return () => { cancelled = true; };
  }, []);

  const items = useMemo<CalendarItem[]>(() => {
    const result: CalendarItem[] = [];
    for (const evening of evenings) {
      if (evening.status === 'cancelled' || evening.status === 'completed' || evening.settled_at) continue;
      const kind = kindOfEvening(evening.format);
      result.push({
        key: `evening-${evening.id}`,
        id: evening.id,
        title: evening.title,
        startsAt: evening.starts_at,
        venue: evening.venue,
        kind,
        status: evening.status,
        evening,
      });
    }
    for (const tournament of tournaments) {
      if (String(tournament.status || '').toLowerCase() === 'completed' || String(tournament.status || '').toLowerCase() === 'cancelled') continue;
      result.push({
        key: `tournament-${tournament.id}`,
        id: tournament.id,
        title: tournament.title,
        startsAt: tournament.date,
        venue: tournament.venue,
        kind: 'TOURNAMENT',
        status: tournament.status,
        tournament,
      });
    }
    return result.sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
  }, [evenings, tournaments]);

  const visible = useMemo(() => items.filter((item) => filter === 'ALL' || item.kind === filter), [items, filter]);
  const byDay = useMemo(() => {
    const result = new Map<string, CalendarItem[]>();
    for (const item of visible) {
      const date = new Date(item.startsAt);
      if (date.getFullYear() !== month.getFullYear() || date.getMonth() !== month.getMonth()) continue;
      const key = dayKey(date);
      result.set(key, [...(result.get(key) || []), item]);
    }
    return result;
  }, [visible, month]);

  const cells = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const count = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    const leading = (first.getDay() + 6) % 7;
    return Array.from({ length: 42 }, (_, index) => {
      const day = index - leading + 1;
      return day > 0 && day <= count ? day : null;
    });
  }, [month]);

  const open = (item: CalendarItem) => item.tournament ? onOpenTournament(item.id) : onOpenEvening(item.id);

  return (
    <section className="rounded-3xl border border-border-soft bg-surface-1 p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <button type="button" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl border border-border-soft bg-surface-2 text-text-secondary"><ChevronLeft className="h-4 w-4" /></button>
        <div className="text-center">
          <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-text-muted">Календарь клуба</div>
          <h2 className="mt-1 text-base font-black capitalize text-text-primary">{month.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })}</h2>
        </div>
        <button type="button" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl border border-border-soft bg-surface-2 text-text-secondary"><ChevronRight className="h-4 w-4" /></button>
      </div>

      <div className="mt-3 flex gap-1.5 overflow-x-auto pb-1">
        {FILTERS.map((item) => (
          <button key={item.id} type="button" onClick={() => setFilter(item.id)} className={`shrink-0 rounded-full px-3 py-1.5 text-[11px] font-bold ${filter === item.id ? 'bg-accent text-white' : 'border border-border-soft bg-surface-2 text-text-secondary'}`}>{item.label}</button>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-7 gap-1 text-center text-[9px] font-bold uppercase text-text-muted">
        {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map((value) => <div key={value}>{value}</div>)}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {cells.map((day, index) => {
          if (!day) return <div key={`empty-${index}`} className="min-h-[72px]" />;
          const date = new Date(month.getFullYear(), month.getMonth(), day);
          const dayItems = byDay.get(dayKey(date)) || [];
          return (
            <div key={dayKey(date)} className="min-h-[72px] rounded-xl border border-border-soft bg-surface-2 p-1">
              <div className="px-0.5 text-[9px] font-bold text-text-muted">{day}</div>
              <div className="mt-1 space-y-1">
                {dayItems.slice(0, 2).map((item) => (
                  <button key={item.key} type="button" onClick={() => open(item)} title={item.title} className={`block w-full truncate rounded-md border px-1 py-1 text-left text-[7px] font-bold leading-none ${tone(item.kind)}`}>
                    {localTime(item.startsAt)} {label(item.kind)}
                  </button>
                ))}
                {dayItems.length > 2 && <div className="px-1 text-[7px] text-text-muted">+{dayItems.length - 2}</div>}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex flex-wrap gap-2 text-[10px] text-text-secondary">
        {(['NOVICE', 'CASUAL', 'RATING', 'TOURNAMENT'] as CalendarItem['kind'][]).map((kind) => <span key={kind} className={`rounded-full border px-2 py-1 ${tone(kind)}`}>{label(kind)}</span>)}
      </div>
    </section>
  );
};
