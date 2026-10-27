import { useEffect, useState } from 'react';
import { gameResultText, previousTenResults } from '../../lib/playerResultObservations.ts';

type Summary = { games: number; wins: number; win_rate: number };
type RoleStat = Summary & { role: string };
type Opponent = { player_id: string; nickname: string; games: number; wins: number; win_rate: number; avatar_url: string };
type SocialNode = {
  player_id: string;
  nickname: string;
  total_games: number;
  same_team_games: number;
  opposite_games: number;
  same_team_wins: number;
  same_team_win_rate: number;
  avatar_url: string;
  closeness: number;
};

type InsightsData = {
  player: { id: string; nickname: string; elo: number; avatar_url: string };
  performance: {
    career: Summary;
    recent10: Summary;
    recent20: Summary;
    last30_days: Summary;
    red: Summary;
    black: Summary;
    roles: RoleStat[];
    trend_vs_career: number | null;
  };
  insights: Array<{ kind: string; title: string; text: string }>;
  opponents: { nemesis: Opponent[]; comfortable: Opponent[] };
  social_graph: { center: { player_id: string; nickname: string; avatar_url: string }; nodes: SocialNode[] };
  elo_history: { source: string; points: Array<{ value: number; date: string }> };
  meta?: { opponents?: string; elo_history?: string };
};


export default function PlayerInsightsPanel() {
  const [retry,setRetry]=useState(0);
  const [data, setData] = useState<InsightsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);setError(null);
    void fetch('/api/player/insights', { credentials: 'include' })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body?.error || 'Не удалось загрузить аналитику');
        if(!body?.performance||!Array.isArray(body?.insights)) throw new Error('Не удалось загрузить аналитику');
        if (!cancelled) setData(body as InsightsData);
      })
      .catch((err: any) => { if (!cancelled) setError(err?.message || 'Не удалось загрузить аналитику'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [retry]);


  if (loading) return <div className="mt-4 rounded-2xl bg-white/[0.03] px-3 py-6 text-center text-[11px] text-white/25">Считаем личную аналитику…</div>;
  if (error || !data) return <div className="mt-4 rounded-2xl bg-rose-400/[0.06] px-3 py-3 text-[11px] text-rose-200/55">{error || 'Аналитика недоступна'}<button type="button" onClick={()=>setRetry(v=>v+1)} className="mt-2 block min-h-11 px-3">Повторить загрузку аналитики</button></div>;

  const previous = previousTenResults(data.performance.recent10, data.performance.recent20);
  const recent = data.performance.recent10;
  const comparison = previous ?? data.performance.career;
  return <div data-testid="player-result-observations" className="rounded-[22px] border border-white/10 bg-white/[0.025] p-4">
    <button type="button" onClick={() => setExpanded((value) => !value)} className="flex w-full items-start justify-between gap-3 text-left">
      <span><span className="block text-sm font-semibold">Моя аналитика</span><span className="mt-1 block text-xs leading-5 text-white/60">Последние игры · все форматы</span></span><span aria-hidden="true" className="text-white/60">{expanded ? '⌃' : '⌄'}</span>
    </button>

    <div className="mt-3 grid grid-cols-2 gap-3" aria-label="Недавние результаты">
      {[['Последние игры',recent],[previous?'Предыдущие 10 игр':'Вся карьера',comparison]].map(([label,raw])=>{const sample=raw as Summary|undefined;return <div key={String(label)} className="rounded-xl bg-black/20 p-3"><p className="text-xs leading-5 text-white/60">{String(label)}</p><p className="mt-1 text-xl font-semibold">{sample?.games?`${sample.win_rate}%`:'—'}</p><p className="mt-1 text-xs leading-5 text-white/65">{sample?.games?gameResultText(sample):'Пока нет игр'}</p></div>;})}
    </div>
    <p className="mt-3 text-xs leading-5 text-white/55">У аналитики свой период: фильтры обзора к ней не применяются. Процент показывает результат команды.</p>

    {expanded && <div className="mt-3 space-y-3">
      <p className="text-xs leading-5 text-white/65">За 30 дней: {data.performance.last30_days.games?gameResultText(data.performance.last30_days):'пока нет игр'}.</p>
      {data.insights.filter(item=>item.kind!=='recent_results').map((item,index)=><div key={`${item.kind}:${index}`} className="border-t border-white/10 pt-3"><h3 className="text-xs font-semibold">{item.title}</h3><p className="mt-1 text-xs leading-5 text-white/65">{item.text}</p></div>)}
    </div>}
  </div>;
}
