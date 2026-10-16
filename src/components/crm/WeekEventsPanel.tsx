import { eveningGatheringSize, eventPriority } from '../../lib/eveningGathering.ts';
import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, CalendarDays, Trophy } from 'lucide-react';
import { api, type GameEvening, type Tournament } from '../../lib/api.ts';
import { EVENING_FORMAT_LABELS, normalizeEveningFormat } from '../../lib/eveningFormat.ts';
import { kindOfFormat, kindRow, kindTone, type EventKind } from '../../lib/eventKind.ts';

const DAY = 86_400_000;
// An evening that started a few hours ago is still «this week's» work (it may be running now).
const STARTED_GRACE = 6 * 3_600_000;

type Item = { key: string; id: string; title: string; startsAt: string; label: string; draft: boolean; tournament: boolean; kind: EventKind; venue: string | null; going: number | null; guests: number | null; late: number; thinking: number; required: number; priority: number };

const dayParts = (value: string) => {
  const date = new Date(value);
  return {
    weekday: date.toLocaleDateString('ru-RU', { weekday: 'short', timeZone: 'Europe/Moscow' }),
    day: date.toLocaleDateString('ru-RU', { day: 'numeric', timeZone: 'Europe/Moscow' }),
    month: date.toLocaleDateString('ru-RU', { month: 'short', timeZone: 'Europe/Moscow' }).replace('.', ''),
    time: date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' }),
  };
};

const when = (value: string) => new Date(value).toLocaleString('ru-RU', {
  weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow',
});

/**
 * «На этой неделе» on «Сегодня» (owner, 2026-09-30): every event of the next 7 days — novice, club, rating
 * evenings and tournaments — each one tap away, so the organizer does not have to go through «События».
 */
export default function WeekEventsPanel({ evenings, onOpenEvening, onOpenTournament, now = Date.now(), excludeIds = [], title = 'На этой неделе', includeTournaments = true, variant = 'rows' }: {
  evenings: GameEvening[];
  onOpenEvening: (id: string) => void;
  onOpenTournament: (id: string) => void;
  now?: number;
  /** Evenings already shown above (on «События» the nearest evening has its own card). */
  excludeIds?: string[];
  title?: string;
  /** False when «События» is filtered to one evening format. */
  includeTournaments?: boolean;
  /** «cards» on «События»: a big date tile, the time, the format and how many are coming; «rows» on «Сегодня». */
  variant?: 'rows' | 'cards';
}) {
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  useEffect(() => {
    let cancelled = false;
    void api.getTournaments().then((items) => { if (!cancelled) setTournaments(Array.isArray(items) ? items : []); })
      .catch(() => { if (!cancelled) setTournaments([]); });
    return () => { cancelled = true; };
  }, []);

  const items = useMemo<Item[]>(() => {
    const inWeek = (value: string) => {
      const time = new Date(value).getTime();
      return Number.isFinite(time) && time >= now - STARTED_GRACE && time < now + 7 * DAY;
    };
    const result: Item[] = [];
    for (const evening of evenings) {
      // A running evening stays until it is closed, however long it goes on.
      if (['cancelled', 'completed'].includes(String(evening.status)) || evening.settled_at || excludeIds.includes(evening.id)) continue;
      if (evening.status !== 'active' && !inWeek(evening.starts_at)) continue;
      result.push({
        key: `evening-${evening.id}`, id: evening.id, title: evening.title, startsAt: evening.starts_at,
        label: EVENING_FORMAT_LABELS[normalizeEveningFormat(evening.format)], draft: evening.status === 'draft', tournament: false, kind: kindOfFormat(evening.format),
        venue: evening.venue ? String(evening.venue) : null, going: typeof evening.gathering_count === 'number' ? evening.gathering_count : typeof evening.registered_count === 'number' ? evening.registered_count : null,
        guests: typeof evening.guests_count === 'number' ? evening.guests_count : null, late: Number(evening.late_count || 0), thinking: Number(evening.thinking_count || 0), required: eveningGatheringSize(evening.format), priority: eventPriority(evening.format),
      });
    }
    for (const tournament of includeTournaments ? tournaments : []) {
      const status = String(tournament.status || '').toLowerCase();
      if (['completed', 'cancelled'].includes(status)) continue;
      if (status !== 'active' && !inWeek(tournament.date)) continue;
      result.push({
        key: `tournament-${tournament.id}`, id: tournament.id, title: tournament.title, startsAt: tournament.date,
        label: 'Турнир', draft: false, tournament: true, kind: 'TOURNAMENT', venue: null, going: null, guests: null, late: 0, thinking: 0, required: 0, priority: 1,
      });
    }
    return result.sort((a, b) => a.priority - b.priority || new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
  }, [evenings, tournaments, now, excludeIds, includeTournaments]);

  if (!items.length) return null;
  return (
    <section data-testid="crm-week-events" className="rounded-[18px] border border-border-soft bg-surface-1 p-3">
      <div className="flex items-center gap-2.5 text-[15px] font-bold text-text-primary"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-[11px] bg-accent/10"><CalendarDays className="h-4 w-4 text-accent" /></span> {title} · {items.length}</div>
      <div className="crm-week-list mt-2 space-y-1.5">
        {items.map((item) => variant === 'cards' ? (() => {
          const parts = dayParts(item.startsAt);
          return (
            <button key={item.key} type="button" data-testid="crm-week-event" onClick={() => (item.tournament ? onOpenTournament(item.id) : onOpenEvening(item.id))}
              className={`flex min-h-24 w-full items-center gap-3.5 rounded-[14px] bg-surface-2 px-3.5 py-3 text-left active:opacity-90 ${kindRow(item.kind)}`}>
              <span className={`grid h-16 w-16 shrink-0 place-items-center rounded-[12px] border text-center leading-none ${kindTone(item.kind)}`}>
                <span><span className="block text-[11px] font-bold uppercase tracking-wide opacity-80">{parts.weekday}</span><span className="mt-1 block text-[24px] font-black">{parts.day}</span><span className="block text-[11px] opacity-80">{parts.month}</span></span>
              </span>
              <span className="min-w-0 flex-1">
                <strong className="block truncate text-[15px] text-text-primary">{item.title}</strong>
                <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-text-secondary">
                  <span className="font-semibold text-text-primary">{parts.time}</span>
                  <span className={`rounded-md border px-1.5 py-0.5 text-[12px] font-semibold ${kindTone(item.kind)}`}>{item.label}</span>
                  {item.draft ? <span className="rounded-md bg-surface-1 px-1.5 py-0.5 text-[12px]">черновик</span> : null}
                </span>
                {item.venue ? <span className="mt-1 block text-[12px] text-text-muted">{item.venue}</span> : null}
                <RegistrationSummary item={item} />
              </span>
              <ArrowRight className="h-4 w-4 shrink-0 text-text-muted" />
            </button>
          );
        })() : (
          <button key={item.key} type="button" data-testid="crm-week-event" onClick={() => (item.tournament ? onOpenTournament(item.id) : onOpenEvening(item.id))}
            className={`flex min-h-16 w-full items-center gap-2 rounded-[12px] bg-surface-2 px-3 py-2.5 text-left active:opacity-90 ${kindRow(item.kind)}`}>
            {item.tournament ? <Trophy className="h-4 w-4 shrink-0 text-warning" /> : null}
            <span className="min-w-0 flex-1">
              <strong className="block truncate text-[14px] text-text-primary">{item.title}</strong>
              <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-text-muted"><span>{when(item.startsAt)}</span><span className={`rounded-md border px-1.5 py-0.5 font-semibold ${kindTone(item.kind)}`}>{item.label}</span>{item.draft ? <span>черновик</span> : null}</span>
              <RegistrationSummary item={item} />
            </span>
            <ArrowRight className="h-4 w-4 shrink-0 text-text-muted" />
          </button>
        ))}
      </div>
    </section>
  );
}

function RegistrationSummary({ item }: { item: Item }) {
  if (item.going === null) return null;
  const missing = Math.max(0, item.required - item.going);
  return <span className="mt-2 block space-y-1 text-[12px] leading-4" data-testid="week-registration">
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <strong className={missing ? 'text-text-primary' : 'text-success'}>Идут {item.going} из {item.required}</strong>
      <span className="text-text-muted">{missing ? `ещё ${missing} до сбора` : 'минимум набран'} · с судьёй</span>
    </span>
    <span className="block text-text-muted">{[
      item.guests !== null ? `в том числе гостей: ${item.guests}` : null,
      item.late ? `позже: ${item.late}` : null,
      item.thinking ? `думают: ${item.thinking}` : null,
    ].filter(Boolean).join(' · ')}</span>
  </span>;
}
