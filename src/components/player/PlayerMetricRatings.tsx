import { useEffect, useRef, useState } from 'react';
import { openCanonicalPlayerProfile } from './playerProfileNavigation.ts';
import { countGames } from '../../lib/russianPlural';
import { SegmentedControl } from '../ui/SegmentedControl.tsx';
import PlayerRoleTables from './PlayerRoleTables.tsx';

type Row = { rank: number; player_id: string; nickname: string; avatar_url?: string | null; value: number; value_text: string; games: number; sample_text?: string | null; partner_nickname?: string | null; is_me: boolean };
type Rating = {
  metric: { key: string; label: string; group: string; unit: string; hint: string };
  metrics: Array<{ key: string; label: string; group: string }>;
  filters: { period: string; format: string; period_label: string; format_label: string; seasons: Array<{ key: string; label: string }>; formats: Array<{ key: string; label: string }> };
  games_in_scope: number;
  total: number;
  rows: Row[];
  me: Row | null;
};

const chip = (rank: number) => rank === 1 ? 'border-amber-200/15 bg-amber-300/[0.12] text-amber-100' : rank === 2 ? 'border-white/12 bg-white/[0.08] text-white/75' : rank === 3 ? 'border-orange-200/10 bg-orange-300/[0.09] text-orange-100/80' : 'border-white/[0.07] bg-black/20 text-white/38';

function PlayerLine({ row }: { row: Row }) {
  return <button type="button" onClick={() => openCanonicalPlayerProfile(row.player_id)} data-testid={`metric-row-${row.player_id}`} className={`flex min-h-12 w-full items-center gap-3 rounded-2xl px-2.5 py-2 text-left ${row.is_me ? 'border border-sky-200/20 bg-sky-200/[0.07]' : 'bg-black/20'}`}>
    <div className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg border text-xs font-semibold ${chip(row.rank)}`}>{row.rank}</div>
    {row.avatar_url ? <img src={row.avatar_url} alt="" className="h-8 w-8 shrink-0 rounded-xl object-cover ring-1 ring-white/10" /> : <div className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-white/[0.07] text-xs text-white/45">{row.nickname.slice(0, 1).toUpperCase()}</div>}
    <div className="min-w-0 flex-1"><div className="truncate text-sm font-medium">{row.nickname}{row.partner_nickname ? <span className="font-normal text-white/50"> · убит, когда в чёрных {row.partner_nickname}</span> : null}{row.is_me ? <span className="ml-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-sky-100/60">вы</span> : null}</div><div className="text-[11px] text-white/35">{row.sample_text || countGames(row.games)}</div></div>
    <div className="shrink-0 text-right text-base font-semibold tabular-nums">{row.value_text}</div>
  </button>;
}

/** Club rankings by one figure of the statistics: who collected the most, over a season or all time and an evening format. */
export default function PlayerMetricRatings() {
  const [view, setView] = useState<'metrics' | 'roles'>('metrics');
  const [metric, setMetric] = useState('wins');
  const [period, setPeriod] = useState('all');
  const [format, setFormat] = useState('all');
  const [data, setData] = useState<Rating | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const generation = useRef(0);

  useEffect(() => {
    const current = ++generation.current;
    setLoading(true);
    setError('');
    const query = new URLSearchParams({ metric });
    if (period !== 'all') query.set('period', period);
    if (format !== 'all') query.set('format', format);
    void fetch(`/api/rating/metrics?${query}`, { credentials: 'include' }).then(async (response) => {
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || 'Не удалось загрузить рейтинг по показателю');
      if (current === generation.current) setData(body);
    }).catch((reason: any) => {
      if (current === generation.current) setError(reason?.message || 'Не удалось загрузить рейтинг по показателю');
    }).finally(() => { if (current === generation.current) setLoading(false); });
  }, [metric, period, format]);

  const groups = data ? Array.from(new Set(data.metrics.map((item) => item.group))) : [];
  return <main className="player-workspace-page min-h-screen bg-[#090a0d] px-3 pb-28 pt-2 text-white"><div className="player-workspace mx-auto w-full max-w-[430px] space-y-3">
    <SegmentedControl ariaLabel="Вид рейтинга" value={view} items={[{ value: 'metrics', label: 'По показателям' }, { value: 'roles', label: 'По ролям' }]} onValueChange={setView} itemClassName="px-1 text-[12px]" />
    <section data-testid="metric-ratings-controls" className="rounded-[24px] border border-white/10 bg-white/[0.04] p-3">
      {view === 'metrics' ? <label className="block text-[11px] text-white/45">Показатель
        <select aria-label="Показатель" value={metric} onChange={(event) => setMetric(event.target.value)} className="mobile-field mt-1 w-full text-sm">
          {data ? groups.map((group) => <optgroup key={group} label={group}>{data.metrics.filter((item) => item.group === group).map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}</optgroup>) : <option value={metric}>{metric}</option>}
        </select>
      </label> : null}
      <div className={`${view === 'metrics' ? 'mt-2 ' : ''}grid grid-cols-2 gap-2`}>
        <label className="text-[11px] text-white/45">Период<select aria-label="Период рейтинга" value={period} onChange={(event) => setPeriod(event.target.value)} className="mobile-field mt-1 w-full text-sm"><option value="all">Всё время</option>{data?.filters.seasons.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}</select></label>
        <label className="text-[11px] text-white/45">Формат вечера<select aria-label="Формат вечера рейтинга" value={format} onChange={(event) => setFormat(event.target.value)} className="mobile-field mt-1 w-full text-sm"><option value="all">Все форматы</option>{data?.filters.formats.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}</select></label>
      </div>
    </section>

    {view === 'roles' ? <PlayerRoleTables period={period} format={format} /> : <>
    <section className="rounded-[24px] border border-white/10 bg-white/[0.04] p-3">
      {data ? <div className="mb-3 px-1" data-testid="metric-ratings-scope">
        <div className="text-sm font-semibold">{data.metric.label}</div>
        <p className="mt-0.5 text-[11px] leading-4 text-white/40">{data.metric.hint}. Без минимального порога: достаточно одного подтверждённого наблюдения; размер выборки указан у каждого игрока. Считаем: {data.filters.period_label} · {data.filters.format_label}, игр в выборе: {data.games_in_scope}.{data.metric.unit === 'elo' ? ' Это изменение рейтинга за выбранные игры, а не сам Elo.' : ''}</p>
      </div> : null}
      {error ? <div role="alert" className="rounded-2xl border border-rose-300/15 bg-rose-300/[0.07] px-3 py-4 text-sm text-rose-100/75">{error}</div>
        : !data ? <div className="rounded-2xl bg-black/20 px-3 py-6 text-center text-sm text-white/40">Загружаю рейтинг…</div>
        : data.rows.length ? <div className={`space-y-1.5 ${loading ? 'opacity-60' : ''}`}>
          {data.rows.map((row) => <PlayerLine key={row.player_id} row={row} />)}
          {data.me ? <><div className="px-2 pt-1 text-center text-[11px] text-white/30">· · ·</div><PlayerLine row={data.me} /></> : null}
        </div>
        : <div className="rounded-2xl bg-black/20 px-3 py-6 text-center text-sm text-white/40">По этому показателю пока нет подтверждённых данных за выбранный период.</div>}
    </section>
    </>}
  </div></main>;
}
