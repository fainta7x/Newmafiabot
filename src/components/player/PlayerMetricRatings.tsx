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

function PlayerLine({ row, scale, unit }: { row: Row; scale: number; unit: string }) {
  const width = scale > 0 ? Math.max(0, Math.min(100, Math.abs(row.value) / scale * 100)) : 0;
  const negative = row.value < 0;
  return <button type="button" onClick={() => openCanonicalPlayerProfile(row.player_id)} data-testid={`metric-row-${row.player_id}`}
    aria-label={`Открыть профиль ${row.nickname}, место ${row.rank}, результат ${row.value_text}`}
    className={`ds-focus-ring block min-h-[90px] w-full rounded-[20px] border p-3 text-left transition-colors active:bg-white/[0.1] ${row.is_me ? 'border-white/25 bg-white/[0.08]' : 'border-white/[0.07] bg-black/20'}`}>
    <span className="flex items-center gap-3">
      <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl border text-sm font-semibold tabular-nums ${chip(row.rank)}`}>{row.rank}</span>
      {row.avatar_url ? <img src={row.avatar_url} alt="" className="h-11 w-11 shrink-0 rounded-[14px] object-cover ring-1 ring-white/10" />
        : <span aria-hidden="true" className="grid h-11 w-11 shrink-0 place-items-center rounded-[14px] bg-white/[0.07] text-sm font-semibold text-white/60">{row.nickname.slice(0, 1).toUpperCase()}</span>}
      <span className="min-w-0 flex-1">
        <span className="block line-clamp-2 break-words text-sm font-semibold leading-5">{row.nickname}</span>
        <span className="block text-[11px] leading-4 text-white/45">{row.is_me ? 'Мой результат · ' : ''}{row.sample_text || countGames(row.games)}</span>
        {row.partner_nickname ? <span className="block text-[11px] leading-4 text-white/45">Убит, когда в чёрных {row.partner_nickname}</span> : null}
      </span>
      <span className="shrink-0 text-right">
        <span className="block text-lg font-semibold tabular-nums leading-6 text-white">{row.value_text}</span>
        <span className="block text-[10px] leading-4 text-white/40">{unit === 'percent' ? 'доля' : unit === 'elo' ? 'Elo' : unit === 'decimal' ? 'среднее' : 'результат'}</span>
      </span>
    </span>
    <span aria-hidden="true" className="mt-3 block h-1.5 overflow-hidden rounded-full bg-white/[0.07]">
      <span className={`block h-full rounded-full ${negative ? 'bg-rose-300/65' : 'bg-amber-200/70'}`} style={{ width: `${width}%` }} />
    </span>
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
  const [retry, setRetry] = useState(0);
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
  }, [metric, period, format, retry]);

  const maxMagnitude = data ? Math.max(0, ...[...data.rows, ...(data.me ? [data.me] : [])].map((row) => Math.abs(row.value))) : 0;
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
      {data && !error && !loading ? <div className="mb-3 px-1" data-testid="metric-ratings-scope">
        <div className="text-base font-semibold">{data.metric.label}</div>
        <p className="mt-0.5 text-[11px] leading-4 text-white/40">{data.metric.hint}. У каждого игрока указан размер выборки. Считаем: {data.filters.period_label} · {data.filters.format_label}, игр в выборе: {data.games_in_scope}.{data.metric.unit === 'elo' ? ' Это изменение рейтинга за выбранные игры, а не сам Elo.' : ''}</p>
      </div> : null}
      {data && !error && !loading && data.rows.length > 0 ? <div className="mb-3 px-1 text-[11px] leading-4 text-white/35">Полосы показывают соотношение результатов в выбранном списке, не дополнительный рейтинг.</div> : null}
      {error ? <div role="alert" className="space-y-3 rounded-2xl border border-rose-300/15 bg-rose-300/[0.07] px-3 py-4"><p className="text-sm text-rose-100/75">{error}</p><button type="button" onClick={() => setRetry((value) => value + 1)} className="min-h-11 w-full rounded-xl border border-white/15 bg-white/[0.07] px-3 text-sm font-semibold text-white">Повторить</button></div>
        : loading || !data ? <div className="rounded-2xl bg-black/20 px-3 py-6 text-center text-sm text-white/40">Загружаю рейтинг…</div>
        : data.rows.length ? <div className={`space-y-1.5 ${loading ? 'opacity-60' : ''}`}>
          {data.rows.map((row) => <PlayerLine key={row.player_id} row={row} scale={maxMagnitude} unit={data.metric.unit} />)}
          {data.me ? <><div className="px-2 pt-1 text-center text-[11px] text-white/30">· · ·</div><PlayerLine row={data.me} scale={maxMagnitude} unit={data.metric.unit} /></> : null}
        </div>
        : <div className="rounded-2xl bg-black/20 px-3 py-6 text-center text-sm text-white/40">По этому показателю пока нет подтверждённых данных за выбранный период.</div>}
    </section>
    </>}
  </div></main>;
}
