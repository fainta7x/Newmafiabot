import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ChevronRight, RefreshCw, Search } from 'lucide-react';
import { SPLIT_VOTE_LEVELS, type LearningPlayerRow, type SplitVoteLevelId } from '../../lib/learningProgress.ts';

type Status = 'passed' | 'not_passed' | 'nothing';
type Sort = 'recent' | 'name' | 'progress';

const dateLabel = (value?: string) => (value
  ? new Date(value.includes('T') ? value : `${value.replace(' ', 'T')}Z`).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', timeZone: 'Europe/Moscow' })
  : '');
const passedCount = (row: LearningPlayerRow) => SPLIT_VOTE_LEVELS.filter((level) => row.passed[level.id]).length;
const lastPassed = (row: LearningPlayerRow) => Object.values(row.passed).sort().at(-1) || '';

const Chip = ({ active, onClick, children, testId }: { active: boolean; onClick: () => void; children: ReactNode; testId?: string }) => (
  <button type="button" data-testid={testId} aria-pressed={active} onClick={onClick}
    className={`min-h-9 shrink-0 rounded-full px-3 text-[12px] font-semibold ${active ? 'bg-white text-black' : 'border border-white/10 bg-white/[0.04] text-white/65'}`}>{children}</button>
);

/** A player's trainer exams as small marks: passed levels are filled, the rest are outlined. */
export const LevelMarks = ({ row }: { row: LearningPlayerRow }) => (
  <div className="flex flex-wrap gap-1">
    {SPLIT_VOTE_LEVELS.map((level) => (
      <span key={level.id} title={row.passed[level.id] ? `Сдан ${dateLabel(row.passed[level.id])}` : 'Не сдан'}
        className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${row.passed[level.id] ? 'bg-emerald-400/20 text-emerald-200' : 'border border-white/10 text-white/35'}`}>
        {row.passed[level.id] ? '✓ ' : ''}{level.label}
      </span>
    ))}
  </div>
);

/** Curator view of the split-vote trainer: who passed which exam and when. Read-only. */
export function LearningProgressCRM({ onOpenPlayer }: { onOpenPlayer?: (playerId: string) => void } = {}) {
  const [rows, setRows] = useState<LearningPlayerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [level, setLevel] = useState<SplitVoteLevelId | 'any'>('any');
  const [status, setStatus] = useState<Status>('passed');
  const [sort, setSort] = useState<Sort>('recent');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/learning/split-vote', { credentials: 'include' });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || 'Не удалось загрузить результаты');
      setRows(Array.isArray(body.players) ? body.players : []);
    } catch (loadError: any) {
      setError(loadError?.message || 'Не удалось загрузить результаты');
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const counts = useMemo(() => Object.fromEntries(SPLIT_VOTE_LEVELS.map((item) => [item.id, rows.filter((row) => row.passed[item.id]).length])) as Record<SplitVoteLevelId, number>, [rows]);
  const visible = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('ru-RU');
    const filtered = rows.filter((row) => {
      if (needle && !row.nickname.toLocaleLowerCase('ru-RU').includes(needle)) return false;
      if (status === 'nothing') return passedCount(row) === 0;
      const has = level === 'any' ? passedCount(row) > 0 : Boolean(row.passed[level]);
      return status === 'passed' ? has : !has;
    });
    return filtered.sort((a, b) => (sort === 'name' ? a.nickname.localeCompare(b.nickname, 'ru')
      : sort === 'progress' ? passedCount(b) - passedCount(a) || a.nickname.localeCompare(b.nickname, 'ru')
        : lastPassed(b).localeCompare(lastPassed(a)) || a.nickname.localeCompare(b.nickname, 'ru')));
  }, [rows, query, level, status, sort]);

  return (
    <div className="space-y-3" data-testid="crm-learning">
      <section className="rounded-[20px] border border-white/10 bg-white/[0.04] p-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h3 className="text-[15px] font-semibold text-white">Тренажёр попила</h3>
            <p className="mt-0.5 text-[12px] leading-5 text-white/50">Кто какие экзамены сдал. Практику без экзамена здесь не видно.</p>
          </div>
          <button type="button" onClick={() => void load()} aria-label="Обновить" className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-white/10 text-white/60"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /></button>
        </div>
        <div className="mt-3 grid grid-cols-4 gap-1.5">
          {SPLIT_VOTE_LEVELS.map((item) => (
            <button key={item.id} type="button" onClick={() => { setLevel(item.id); setStatus('passed'); }} className={`rounded-2xl border p-2 text-left ${level === item.id ? 'border-white/40 bg-white/[0.08]' : 'border-white/10 bg-black/10'}`}>
              <strong className="block text-[18px] text-white">{counts[item.id] ?? 0}</strong>
              <span className="text-[11px] text-white/50">{item.label}</span>
            </button>
          ))}
        </div>
      </section>

      <label className="relative block">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
        <input data-testid="crm-learning-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Найти игрока по нику"
          className="min-h-12 w-full rounded-2xl border border-white/10 bg-white/[0.04] pl-10 pr-3 text-[15px] text-white outline-none placeholder:text-white/30" />
      </label>

      <div className="space-y-2">
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1" aria-label="Уровень">
          <Chip active={level === 'any'} onClick={() => setLevel('any')}>Любой уровень</Chip>
          {SPLIT_VOTE_LEVELS.map((item) => <Chip key={item.id} testId={`crm-learning-level-${item.id}`} active={level === item.id} onClick={() => setLevel(item.id)}>{item.label}</Chip>)}
        </div>
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1" aria-label="Результат">
          <Chip testId="crm-learning-status-passed" active={status === 'passed'} onClick={() => setStatus('passed')}>Сдали</Chip>
          <Chip testId="crm-learning-status-not_passed" active={status === 'not_passed'} onClick={() => setStatus('not_passed')}>Не сдали</Chip>
          <Chip testId="crm-learning-status-nothing" active={status === 'nothing'} onClick={() => setStatus('nothing')}>Ничего не сдавали</Chip>
        </div>
        <label className="flex items-center gap-2 px-1 text-[12px] text-white/50">Порядок:
          <select value={sort} onChange={(event) => setSort(event.target.value as Sort)} className="min-h-9 rounded-xl border border-white/10 bg-black/30 px-2 text-[12px] text-white">
            <option value="recent">Сначала недавние сдачи</option>
            <option value="progress">Больше уровней выше</option>
            <option value="name">По нику</option>
          </select>
        </label>
      </div>

      {error ? <div className="rounded-2xl bg-rose-500/10 px-3 py-2 text-[13px] text-rose-200">{error}</div> : null}
      <p className="px-1 text-[12px] text-white/45" data-testid="crm-learning-count">{loading ? 'Загружаем…' : `Найдено игроков: ${visible.length}`}</p>
      <div className="space-y-1.5">
        {visible.map((row) => (
          <button key={row.id} type="button" data-testid="crm-learning-row" onClick={() => onOpenPlayer?.(row.id)} disabled={!onOpenPlayer}
            className="flex min-h-[60px] w-full items-center gap-3 rounded-[16px] border border-white/10 bg-white/[0.035] px-3 py-2 text-left active:bg-white/[0.06]">
            <span className="min-w-0 flex-1">
              <strong className="block truncate text-[14px] text-white">{row.nickname}</strong>
              <span className="mt-1 block"><LevelMarks row={row} /></span>
              {lastPassed(row) ? <span className="mt-1 block text-[11px] text-white/40">Последний экзамен: {dateLabel(lastPassed(row))}</span> : null}
            </span>
            {onOpenPlayer ? <ChevronRight className="h-5 w-5 shrink-0 text-white/25" /> : null}
          </button>
        ))}
      </div>
    </div>
  );
}

/** «Обучение» block on the organizer's player card. */
export function PlayerLearningBlock({ playerId }: { playerId: string }) {
  const [row, setRow] = useState<LearningPlayerRow | null>(null);
  useEffect(() => {
    let active = true;
    fetch(`/api/learning/split-vote/${encodeURIComponent(playerId)}`, { credentials: 'include' })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => { if (active) setRow(data); })
      .catch(() => { if (active) setRow(null); });
    return () => { active = false; };
  }, [playerId]);
  if (!row) return null;
  return (
    <section data-testid="crm-player-learning" className="space-y-1.5 rounded-[17px] border border-border-soft bg-surface-1 p-2.5">
      <div className="text-[13px] font-bold text-text-primary">🎓 Тренажёр попила</div>
      <LevelMarks row={row} />
      <div className="text-[12px] text-text-secondary">{passedCount(row)
        ? SPLIT_VOTE_LEVELS.filter((level) => row.passed[level.id]).map((level) => `${level.label} — ${dateLabel(row.passed[level.id])}`).join(' · ')
        : 'Экзамены пока не сдавал.'}</div>
    </section>
  );
}

export default LearningProgressCRM;
