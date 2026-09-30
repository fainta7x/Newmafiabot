import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, CalendarDays, Trophy } from 'lucide-react';
import { api, type GameEvening, type Tournament } from '../../lib/api.ts';
import { EVENING_FORMAT_LABELS, normalizeEveningFormat } from '../../lib/eveningFormat.ts';

const DAY = 86_400_000;
// An evening that started a few hours ago is still «this week's» work (it may be running now).
const STARTED_GRACE = 6 * 3_600_000;

type Item = { key: string; id: string; title: string; startsAt: string; label: string; draft: boolean; tournament: boolean };

const when = (value: string) => new Date(value).toLocaleString('ru-RU', {
  weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow',
});

/**
 * «На этой неделе» on «Сегодня» (owner, 2026-09-30): every event of the next 7 days — novice, club, rating
 * evenings and tournaments — each one tap away, so the organizer does not have to go through «События».
 */
export default function WeekEventsPanel({ evenings, onOpenEvening, onOpenTournament, now = Date.now() }: {
  evenings: GameEvening[];
  onOpenEvening: (id: string) => void;
  onOpenTournament: (id: string) => void;
  now?: number;
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
      if (['cancelled', 'completed'].includes(String(evening.status)) || evening.settled_at || !inWeek(evening.starts_at)) continue;
      result.push({
        key: `evening-${evening.id}`, id: evening.id, title: evening.title, startsAt: evening.starts_at,
        label: EVENING_FORMAT_LABELS[normalizeEveningFormat(evening.format)], draft: evening.status === 'draft', tournament: false,
      });
    }
    for (const tournament of tournaments) {
      if (['completed', 'cancelled'].includes(String(tournament.status || '').toLowerCase()) || !inWeek(tournament.date)) continue;
      result.push({
        key: `tournament-${tournament.id}`, id: tournament.id, title: tournament.title, startsAt: tournament.date,
        label: 'Турнир', draft: false, tournament: true,
      });
    }
    return result.sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
  }, [evenings, tournaments, now]);

  if (!items.length) return null;
  return (
    <section data-testid="crm-week-events" className="rounded-[18px] border border-border-soft bg-surface-1 p-3">
      <div className="flex items-center gap-2 text-[13px] font-semibold text-text-primary"><CalendarDays className="h-4 w-4 text-accent" /> На этой неделе · {items.length}</div>
      <div className="mt-2 space-y-1.5">
        {items.map((item) => (
          <button key={item.key} type="button" data-testid="crm-week-event" onClick={() => (item.tournament ? onOpenTournament(item.id) : onOpenEvening(item.id))}
            className="flex min-h-12 w-full items-center gap-2 rounded-[12px] bg-surface-2 px-3 py-2 text-left active:opacity-90">
            {item.tournament ? <Trophy className="h-4 w-4 shrink-0 text-warning" /> : null}
            <span className="min-w-0 flex-1">
              <strong className="block truncate text-[13px] text-text-primary">{item.title}</strong>
              <span className="block truncate text-[12px] text-text-muted">{when(item.startsAt)} · {item.label}{item.draft ? ' · черновик' : ''}</span>
            </span>
            <ArrowRight className="h-4 w-4 shrink-0 text-text-muted" />
          </button>
        ))}
      </div>
    </section>
  );
}
