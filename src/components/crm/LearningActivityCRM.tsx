import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronRight, RefreshCw, Search } from 'lucide-react';
import { LEARNING_STUCK_AFTER_TRIES, LEARNING_TRACKS, learningItemKey, type LearningActivityItem, type LearningActivityRow } from '../../lib/learningActivity.ts';

type Status = 'all' | 'stuck' | 'passed' | 'tried' | 'nothing';
const STATUSES: Array<{ id: Status; label: string }> = [
  { id: 'all', label: 'Все' }, { id: 'stuck', label: 'Буксуют' }, { id: 'passed', label: 'Прошли' }, { id: 'tried', label: 'Пробовали' }, { id: 'nothing', label: 'Не начинали' },
];

const dateLabel = (value?: string | null) => (value ? new Date(value).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', timeZone: 'Europe/Moscow' }) : '');
const itemsOf = (row: LearningActivityRow) => Object.values(row.items);
const isStuck = (item: LearningActivityItem) => !item.passed_at && item.attempts >= LEARNING_STUCK_AFTER_TRIES;
const lastAt = (row: LearningActivityRow) => itemsOf(row).map((item) => item.last_at).sort().at(-1) || '';

/** One mark per practice item: passed (with the number of tries), or the tries so far; «буксует» is highlighted. */
const Marks = ({ row }: { row: LearningActivityRow }) => (
  <div className="space-y-1.5">
    {LEARNING_TRACKS.map((track) => {
      const touched = track.items.filter((item) => row.items[learningItemKey(track.id, item.id)]);
      if (!touched.length) return null;
      return (
        <div key={track.id}>
          <div className="text-[10px] uppercase tracking-[.1em] text-white/35">{track.label}</div>
          <div className="mt-0.5 flex flex-wrap gap-1">
            {touched.map((item) => {
              const data = row.items[learningItemKey(track.id, item.id)];
              const stuck = isStuck(data);
              const score = data.best_score !== null && data.max_score ? ` · ${data.best_score}/${data.max_score}` : '';
              return (
                <span key={item.id} data-stuck={stuck ? 'true' : undefined}
                  title={data.passed_at ? `Пройдено ${dateLabel(data.passed_at)}, попыток: ${data.attempts}` : `Попыток: ${data.attempts}, не пройдено`}
                  className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${data.passed_at ? 'bg-emerald-400/20 text-emerald-200' : stuck ? 'bg-amber-300/20 text-amber-100' : 'border border-white/10 text-white/55'}`}>
                  {data.passed_at ? '✓ ' : stuck ? 'буксует · ' : ''}{item.label}{score} · {data.attempts}×
                </span>
              );
            })}
          </div>
        </div>
      );
    })}
  </div>
);

/** Curator view of the reasoning school and the judge's trainer: who passed what, who tried and is stuck, who has not started. */
export default function LearningActivityCRM({ onOpenPlayer }: { onOpenPlayer?: (playerId: string) => void }) {
  const [rows, setRows] = useState<LearningActivityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<Status>('all');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const response = await fetch('/api/learning/activity', { credentials: 'include' });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || 'Не удалось загрузить результаты');
      setRows(Array.isArray(body.players) ? body.players : []);
    } catch (loadError: any) { setError(loadError?.message || 'Не удалось загрузить результаты'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const counts = useMemo(() => ({
    all: rows.length,
    stuck: rows.filter((row) => itemsOf(row).some(isStuck)).length,
    passed: rows.filter((row) => itemsOf(row).some((item) => item.passed_at)).length,
    tried: rows.filter((row) => itemsOf(row).length > 0 && !itemsOf(row).some((item) => item.passed_at)).length,
    nothing: rows.filter((row) => itemsOf(row).length === 0).length,
  }), [rows]);

  const visible = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('ru-RU');
    return rows.filter((row) => {
      if (needle && !row.nickname.toLocaleLowerCase('ru-RU').includes(needle)) return false;
      const items = itemsOf(row);
      if (status === 'stuck') return items.some(isStuck);
      if (status === 'passed') return items.some((item) => item.passed_at);
      if (status === 'tried') return items.length > 0 && !items.some((item) => item.passed_at);
      if (status === 'nothing') return items.length === 0;
      return true;
    }).sort((a, b) => lastAt(b).localeCompare(lastAt(a)) || a.nickname.localeCompare(b.nickname, 'ru'));
  }, [rows, query, status]);

  return (
    <div className="space-y-3" data-testid="crm-learning-activity">
      <section className="rounded-[20px] border border-white/10 bg-white/[0.04] p-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h3 className="text-[15px] font-semibold text-white">Школа мышления и судейство</h3>
            <p className="mt-0.5 text-[12px] leading-5 text-white/50">Кто что прошёл, сколько раз пробовал и где застрял. «Буксует» — {LEARNING_STUCK_AFTER_TRIES} и больше попыток без результата. Считаются только игроки, вошедшие в кабинет; учёт ведётся с момента обновления.</p>
          </div>
          <button type="button" onClick={() => void load()} aria-label="Обновить" className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-white/10 text-white/60"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /></button>
        </div>
      </section>
      <label className="relative block">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
        <input data-testid="crm-learning-activity-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Найти игрока по нику"
          className="min-h-12 w-full rounded-2xl border border-white/10 bg-white/[0.04] pl-10 pr-3 text-[15px] text-white outline-none placeholder:text-white/30" />
      </label>
      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1" aria-label="Состояние">
        {STATUSES.map((item) => (
          <button key={item.id} type="button" data-testid={`crm-learning-activity-${item.id}`} aria-pressed={status === item.id} onClick={() => setStatus(item.id)}
            className={`min-h-9 shrink-0 rounded-full px-3 text-[12px] font-semibold ${status === item.id ? 'bg-white text-black' : 'border border-white/10 bg-white/[0.04] text-white/65'}`}>{item.label} · {counts[item.id]}</button>
        ))}
      </div>
      {error ? <div className="rounded-2xl bg-rose-500/10 px-3 py-2 text-[13px] text-rose-200">{error}</div> : null}
      <p className="px-1 text-[12px] text-white/45" data-testid="crm-learning-activity-count">{loading ? 'Загружаем…' : `Найдено игроков: ${visible.length}`}</p>
      <div className="space-y-1.5">
        {visible.map((row) => (
          <button key={row.id} type="button" data-testid="crm-learning-activity-row" onClick={() => onOpenPlayer?.(row.id)} disabled={!onOpenPlayer}
            className="flex min-h-[60px] w-full items-center gap-3 rounded-[16px] border border-white/10 bg-white/[0.035] px-3 py-2 text-left active:bg-white/[0.06]">
            <span className="min-w-0 flex-1">
              <strong className="block truncate text-[14px] text-white">{row.nickname}</strong>
              {itemsOf(row).length ? <span className="mt-1 block"><Marks row={row} /></span> : <span className="mt-1 block text-[12px] text-white/35">Ещё ничего не проходил</span>}
              {lastAt(row) ? <span className="mt-1 block text-[11px] text-white/40">Последняя попытка: {dateLabel(lastAt(row))}</span> : null}
            </span>
            {onOpenPlayer ? <ChevronRight className="h-5 w-5 shrink-0 text-white/25" /> : null}
          </button>
        ))}
      </div>
    </div>
  );
}
