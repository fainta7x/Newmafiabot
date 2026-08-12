import React, { useEffect, useMemo, useState } from 'react';

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

const roleLabel = (role: string) => role === 'citizen' ? 'Мирный' : role === 'sheriff' ? 'Шериф' : role === 'mafia' ? 'Мафия' : role === 'don' ? 'Дон' : role;
const roleIcon = (role: string) => role === 'citizen' ? '🔴' : role === 'sheriff' ? '⭐' : role === 'mafia' ? '⚫' : '🎩';

const Avatar = ({ src, size = 36 }: { src: string; size?: number }) => (
  <img src={src} alt="" onError={(event) => { event.currentTarget.style.display = 'none'; }} style={{ width: size, height: size }} className="shrink-0 rounded-xl object-cover" />
);

function EloChart({ points }: { points: Array<{ value: number; date: string }> }) {
  if (points.length < 2) {
    return <div className="rounded-xl bg-black/15 px-3 py-4 text-center text-[10px] text-white/25">История Elo пока содержит только текущее значение.</div>;
  }
  const width = 320;
  const height = 128;
  const values = points.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const spread = Math.max(1, max - min);
  const coordinates = points.map((point, index) => ({
    x: 12 + (index / Math.max(1, points.length - 1)) * (width - 24),
    y: height - 18 - ((point.value - min) / spread) * (height - 38),
    ...point,
  }));
  const path = coordinates.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(' ');
  const last = coordinates[coordinates.length - 1];

  return <div className="rounded-2xl bg-black/15 p-2.5">
    <svg viewBox={`0 0 ${width} ${height}`} className="h-[128px] w-full" role="img" aria-label="График карьеры Elo">
      <line x1="12" y1={height - 18} x2={width - 12} y2={height - 18} stroke="rgba(255,255,255,.07)" />
      <line x1="12" y1="14" x2={width - 12} y2="14" stroke="rgba(255,255,255,.04)" />
      <path d={path} fill="none" stroke="rgba(255,255,255,.72)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={last.x} cy={last.y} r="5" fill="#ffffff" />
      <text x="14" y="16" fill="rgba(255,255,255,.28)" fontSize="9">{Math.round(max)}</text>
      <text x="14" y={height - 3} fill="rgba(255,255,255,.25)" fontSize="9">{Math.round(min)}</text>
    </svg>
    <div className="mt-1 flex items-center justify-between text-[9px] text-white/25"><span>{new Date(points[0].date).toLocaleDateString('ru-RU')}</span><span>{points.length} точек</span><span>{new Date(points[points.length - 1].date).toLocaleDateString('ru-RU')}</span></div>
  </div>;
}

function SocialGraph({ center, nodes }: InsightsData['social_graph']) {
  const visible = nodes.slice(0, 8);
  if (!visible.length) return <div className="rounded-xl bg-black/15 px-3 py-5 text-center text-[10px] text-white/25">Нужно больше совместных игр для графа связей.</div>;
  const radius = 104;
  return <div className="relative mx-auto h-[270px] w-[270px] overflow-hidden rounded-full border border-white/[0.04] bg-black/10">
    <div className="absolute left-1/2 top-1/2 z-20 -translate-x-1/2 -translate-y-1/2 text-center">
      <Avatar src={center.avatar_url} size={52} />
      <div className="mt-1 max-w-[78px] truncate text-[9px] font-semibold">{center.nickname}</div>
    </div>
    {visible.map((node, index) => {
      const angle = -Math.PI / 2 + (index / visible.length) * Math.PI * 2;
      const x = 135 + Math.cos(angle) * radius;
      const y = 135 + Math.sin(angle) * radius;
      const centerX = 135;
      const centerY = 135;
      const lineLength = Math.sqrt((x - centerX) ** 2 + (y - centerY) ** 2);
      const lineAngle = Math.atan2(y - centerY, x - centerX) * 180 / Math.PI;
      return <React.Fragment key={node.player_id}>
        <div className="absolute left-1/2 top-1/2 z-0 h-px origin-left bg-white/[0.08]" style={{ width: lineLength, transform: `rotate(${lineAngle}deg)` }} />
        <div className="absolute z-10 -translate-x-1/2 -translate-y-1/2 text-center" style={{ left: x, top: y }}>
          <div className={`mx-auto rounded-xl border border-white/10 bg-[#17181d] p-0.5 ${node.closeness > 0.66 ? 'scale-110' : node.closeness < 0.34 ? 'scale-90 opacity-75' : ''}`}><Avatar src={node.avatar_url} size={34} /></div>
          <div className="mt-1 max-w-[66px] truncate text-[8px] font-semibold text-white/65">{node.nickname}</div>
          <div className="text-[7px] text-white/20">{node.total_games} игр</div>
        </div>
      </React.Fragment>;
    })}
  </div>;
}

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

  const bestRole = useMemo(() => data?.performance.roles.filter((item) => item.games >= 2).sort((a, b) => b.win_rate - a.win_rate || b.games - a.games)[0] || null, [data]);

  if (loading) return <div className="mt-4 rounded-2xl bg-white/[0.03] px-3 py-6 text-center text-[10px] text-white/25">Считаем личную аналитику…</div>;
  if (error || !data) return <div className="mt-4 rounded-2xl bg-rose-400/[0.06] px-3 py-3 text-[10px] text-rose-200/55">{error || 'Аналитика недоступна'}</div>;

  return <div className="mt-5 rounded-[22px] border border-white/[0.06] bg-white/[0.022] p-3">
    <button type="button" onClick={() => setExpanded((value) => !value)} className="flex w-full items-start justify-between gap-3 text-left">
      <span><span className="block text-[10px] font-semibold uppercase tracking-[0.15em] text-white/35">🧠 Моя аналитика</span><span className="mt-1 block text-[11px] text-white/30">Форма, Elo, соперники и карта связей</span></span><span className="text-white/25">{expanded ? '⌃' : '⌄'}</span>
    </button>

    <div className="mt-3 grid grid-cols-3 gap-1.5 text-center"><div className="rounded-xl bg-black/15 p-2"><div className="text-sm font-black">{data.performance.career.win_rate}%</div><div className="text-[8px] text-white/25">карьера</div></div><div className="rounded-xl bg-black/15 p-2"><div className="text-sm font-black">{data.performance.recent10.win_rate}%</div><div className="text-[8px] text-white/25">последние 10</div></div><div className="rounded-xl bg-black/15 p-2"><div className="truncate text-[11px] font-black">{bestRole ? `${roleIcon(bestRole.role)} ${bestRole.win_rate}%` : '—'}</div><div className="text-[8px] text-white/25">лучшая роль</div></div></div>

    {data.insights.length > 0 && <div className="mt-2 space-y-1">{data.insights.slice(0, expanded ? 5 : 1).map((item, index) => <div key={`${item.kind}:${index}`} className="rounded-xl bg-sky-300/[0.035] px-2.5 py-2"><div className="text-[10px] font-semibold text-sky-100/60">{item.title}</div><div className="mt-0.5 text-[9px] leading-3 text-white/30">{item.text}</div></div>)}</div>}

    {expanded && <>
      <div className="mt-4"><div className="mb-2 flex items-end justify-between"><div><div className="text-[9px] font-semibold uppercase tracking-[0.13em] text-white/30">📈 Карьера Elo</div><div className="mt-0.5 text-[9px] text-white/20">Источник: {data.elo_history.source}</div></div><div className="text-sm font-black">{Math.round(data.player.elo)}</div></div><EloChart points={data.elo_history.points} /><p className="mt-1 text-[8px] leading-3 text-white/18">{data.meta?.elo_history}</p></div>

      <div className="mt-4 grid grid-cols-2 gap-1.5"><div className="rounded-2xl bg-rose-300/[0.035] p-2.5"><div className="text-[9px] font-semibold uppercase tracking-[0.12em] text-rose-100/45">😈 Nemesis</div><div className="mt-2 space-y-1.5">{data.opponents.nemesis.slice(0, 3).map((item) => <div key={item.player_id} className="flex items-center gap-2"><Avatar src={item.avatar_url} size={28} /><div className="min-w-0 flex-1"><div className="truncate text-[9px] font-semibold">{item.nickname}</div><div className="text-[8px] text-white/20">{item.wins}:{item.games - item.wins} · {item.win_rate}%</div></div></div>)}{!data.opponents.nemesis.length && <div className="text-[8px] text-white/20">Нужно ≥3 очных игр.</div>}</div></div>
        <div className="rounded-2xl bg-emerald-300/[0.035] p-2.5"><div className="text-[9px] font-semibold uppercase tracking-[0.12em] text-emerald-100/45">😎 Удобные</div><div className="mt-2 space-y-1.5">{data.opponents.comfortable.slice(0, 3).map((item) => <div key={item.player_id} className="flex items-center gap-2"><Avatar src={item.avatar_url} size={28} /><div className="min-w-0 flex-1"><div className="truncate text-[9px] font-semibold">{item.nickname}</div><div className="text-[8px] text-white/20">{item.wins}:{item.games - item.wins} · {item.win_rate}%</div></div></div>)}{!data.opponents.comfortable.length && <div className="text-[8px] text-white/20">Нужно ≥3 очных игр.</div>}</div></div></div>
      <p className="mt-1 text-[8px] leading-3 text-white/18">{data.meta?.opponents}</p>

      <div className="mt-4"><div className="text-[9px] font-semibold uppercase tracking-[0.13em] text-white/30">🕸 Социальный граф клуба</div><div className="mt-0.5 text-[9px] text-white/20">Ближе — больше совместных игр</div><div className="mt-2"><SocialGraph {...data.social_graph} /></div></div>
    </>}
  </div>;
}
