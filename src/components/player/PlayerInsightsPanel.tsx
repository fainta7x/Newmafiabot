import { useEffect, useState } from 'react';

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
  const [data, setData] = useState<InsightsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetch('/api/player/insights', { credentials: 'include' })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body?.error || 'Не удалось загрузить аналитику');
        if (!cancelled) setData(body as InsightsData);
      })
      .catch((err: any) => { if (!cancelled) setError(err?.message || 'Не удалось загрузить аналитику'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);


  if (loading) return <div className="mt-4 rounded-2xl bg-white/[0.03] px-3 py-6 text-center text-[11px] text-white/25">Считаем личную аналитику…</div>;
  if (error || !data) return <div className="mt-4 rounded-2xl bg-rose-400/[0.06] px-3 py-3 text-[11px] text-rose-200/55">{error || 'Аналитика недоступна'}</div>;

  return <div className="mt-5 rounded-[22px] border border-white/[0.06] bg-white/[0.022] p-3">
    <button type="button" onClick={() => setExpanded((value) => !value)} className="flex w-full items-start justify-between gap-3 text-left">
      <span><span className="block text-[11px] font-semibold uppercase tracking-[0.15em] text-white/35">🧠 Моя аналитика</span><span className="mt-1 block text-[11px] text-white/30">Как ты играешь в последнее время</span></span><span className="text-white/25">{expanded ? '⌃' : '⌄'}</span>
    </button>

    <div className="mt-3 grid grid-cols-3 gap-1.5 text-center" aria-label="Форма"><div className="rounded-xl bg-black/15 p-2"><div className="text-sm font-black">{data.performance.recent10.games ? `${data.performance.recent10.win_rate}%` : '—'}</div><div className="text-[11px] text-white/25">последние 10 игр</div></div><div className="rounded-xl bg-black/15 p-2"><div className="text-sm font-black">{data.performance.recent20.games ? `${data.performance.recent20.win_rate}%` : '—'}</div><div className="text-[11px] text-white/25">последние 20 игр</div></div><div className="rounded-xl bg-black/15 p-2"><div className="text-sm font-black">{data.performance.last30_days.games ? `${data.performance.last30_days.win_rate}%` : '—'}</div><div className="text-[11px] text-white/25">за 30 дней</div></div></div>

    {data.insights.length > 0 && <div className="mt-2 space-y-1">{data.insights.slice(0, expanded ? 5 : 1).map((item, index) => <div key={`${item.kind}:${index}`} className="rounded-xl bg-sky-300/[0.035] px-2.5 py-2"><div className="text-[11px] font-semibold text-sky-100/60">{item.title}</div><div className="mt-0.5 text-[11px] leading-3 text-white/30">{item.text}</div></div>)}</div>}

    {expanded && <>

    </>}
  </div>;
}
