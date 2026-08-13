import { useEffect, useMemo, useState } from 'react';

type RankingEntry = {
  place: number;
  player_id: string;
  nickname: string;
  avatar_url: string;
  games: number;
  wins: number;
  win_rate: number;
};

type RecordEntry = {
  label: string;
  value: number;
  player_id: string;
  nickname: string;
  avatar_url: string;
};

type SeasonHistoryItem = {
  key: string;
  label: string;
  start: number;
  end: number;
  games: number;
  players: number;
  ranking: RankingEntry[];
  viewer: null | { games: number; wins: number; win_rate: number; place: number | null };
  champion: RankingEntry | null;
};

type ClubWorldData = {
  viewer_id: string;
  season: {
    key: string;
    label: string;
    games: number;
    players: number;
    ranking: RankingEntry[];
    role_champions: Array<{
      role: string;
      player_id: string;
      nickname: string;
      avatar_url: string;
      games: number;
      wins: number;
      win_rate: number;
    }>;
    viewer: null | { games: number; wins: number; win_rate: number };
    previous_viewer: null | { games: number; wins: number; win_rate: number };
  };
  season_history: SeasonHistoryItem[];
  season_records: RecordEntry[];
  hall_of_fame: RecordEntry[];
  feed: Array<{
    key: string;
    type: string;
    date: string;
    icon: string;
    title: string;
    text: string;
    player_id?: string;
    avatar_url?: string;
  }>;
  meta?: { season?: string; hall_of_fame?: string };
};

const dateText = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' }).format(date);
};

const roleMeta = (role: string) => {
  if (role === 'citizen') return { icon: '🔴', label: 'Мирный' };
  if (role === 'sheriff') return { icon: '⭐', label: 'Шериф' };
  if (role === 'mafia') return { icon: '⚫', label: 'Мафия' };
  return { icon: '🎩', label: 'Дон' };
};

const isPercentRecord = (label: string) => label.includes('винрейт') || label.includes('Винрейт') || label.includes('Шериф') || label.includes('Дон');
const Avatar = ({ src, size = 36 }: { src: string; size?: number }) => (
  <img src={src} alt="" onError={(event) => { event.currentTarget.style.display = 'none'; }} style={{ width: size, height: size }} className="shrink-0 rounded-xl object-cover" />
);

function RankingRows({ rows, viewerId, limit = 5 }: { rows: RankingEntry[]; viewerId: string; limit?: number }) {
  return <div className="space-y-1.5">{rows.slice(0, limit).map((item) => <div key={item.player_id} className={`flex items-center gap-2 rounded-xl px-2.5 py-2 ${item.player_id === viewerId ? 'bg-white/[0.09]' : 'bg-black/20'}`}><div className="w-5 text-center text-[11px] font-black text-white/35">{item.place}</div><Avatar src={item.avatar_url} size={30} /><div className="min-w-0 flex-1"><div className="truncate text-[11px] font-semibold">{item.nickname}{item.player_id === viewerId ? ' · вы' : ''}</div><div className="text-[9px] text-white/25">{item.wins}/{item.games} побед</div></div><div className="text-[11px] font-black">{item.win_rate}%</div></div>)}</div>;
}

export default function PlayerClubWorldPanel() {
  const [data, setData] = useState<ClubWorldData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showHall, setShowHall] = useState(false);
  const [showFeed, setShowFeed] = useState(false);
  const [selectedSeasonKey, setSelectedSeasonKey] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void fetch('/api/player/club-world', { credentials: 'include' })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body?.error || 'Не удалось загрузить мир клуба');
        if (!cancelled) {
          const next = body as ClubWorldData;
          setData(next);
          setSelectedSeasonKey(next.season_history?.[0]?.key || next.season.key);
        }
      })
      .catch((err: any) => { if (!cancelled) setError(err?.message || 'Не удалось загрузить мир клуба'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const selectedSeason = useMemo(() => data?.season_history?.find((item) => item.key === selectedSeasonKey) || null, [data, selectedSeasonKey]);

  if (loading) return <div className="mt-4 rounded-2xl bg-white/[0.035] px-3 py-7 text-center text-[10px] text-white/30">Собираем сезоны и рекорды…</div>;
  if (error || !data) return <div className="mt-4 rounded-2xl bg-rose-400/[0.07] px-3 py-3 text-[10px] text-rose-200/60">{error || 'Мир клуба недоступен'}</div>;

  const viewerRank = data.season.ranking.find((item) => item.player_id === data.viewer_id) || null;
  const seasonDelta = data.season.viewer && data.season.previous_viewer
    ? data.season.viewer.win_rate - data.season.previous_viewer.win_rate
    : null;

  return <div className="mt-5 space-y-3">
    <div className="rounded-[24px] border border-sky-200/10 bg-gradient-to-br from-sky-300/[0.055] to-white/[0.02] p-4">
      <div className="flex items-start justify-between gap-3"><div><div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-sky-100/45">Сезон клуба</div><div className="mt-1 text-lg font-black">{data.season.label}</div><div className="mt-1 text-[10px] text-white/30">{data.season.games} игр · {data.season.players} игроков</div></div>{viewerRank && <div className="rounded-2xl bg-black/20 px-3 py-2 text-center"><div className="text-xl font-black">#{viewerRank.place}</div><div className="text-[8px] text-white/25">ваше место</div></div>}</div>

      {data.season.viewer && <div className="mt-3 grid grid-cols-3 gap-1.5 text-center"><div className="rounded-xl bg-black/20 p-2"><div className="text-sm font-bold">{data.season.viewer.games}</div><div className="text-[8px] text-white/25">игр</div></div><div className="rounded-xl bg-black/20 p-2"><div className="text-sm font-bold">{data.season.viewer.wins}</div><div className="text-[8px] text-white/25">побед</div></div><div className="rounded-xl bg-black/20 p-2"><div className="text-sm font-bold">{data.season.viewer.win_rate}%</div><div className="text-[8px] text-white/25">винрейт{seasonDelta != null && seasonDelta !== 0 ? ` · ${seasonDelta > 0 ? '+' : ''}${seasonDelta}` : ''}</div></div></div>}

      <div className="mt-4"><div className="text-[9px] font-semibold uppercase tracking-[0.14em] text-white/30">Топ сезона</div><div className="mt-2"><RankingRows rows={data.season.ranking} viewerId={data.viewer_id} /></div></div>

      {data.season.role_champions.length > 0 && <div className="mt-4"><div className="text-[9px] font-semibold uppercase tracking-[0.14em] text-white/30">Лидеры ролей</div><div className="mt-2 grid grid-cols-2 gap-1.5">{data.season.role_champions.map((item) => { const meta = roleMeta(item.role); return <div key={item.role} className="flex items-center gap-2 rounded-xl bg-black/20 p-2"><span className="text-base">{meta.icon}</span><div className="min-w-0 flex-1"><div className="truncate text-[10px] font-semibold">{item.nickname}</div><div className="text-[8px] text-white/25">{meta.label} · {item.win_rate}%</div></div></div>; })}</div></div>}
    </div>

    {data.season_records.length > 0 && <div className="rounded-[22px] border border-emerald-200/10 bg-emerald-200/[0.025] p-3"><div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-100/40">Рекорды текущего сезона</div><div className="mt-3 grid grid-cols-3 gap-1.5">{data.season_records.map((record) => <div key={record.label} className="rounded-xl bg-black/20 p-2"><Avatar src={record.avatar_url} size={28} /><div className="mt-2 truncate text-[9px] font-semibold">{record.nickname}</div><div className="mt-0.5 text-lg font-black">{record.value}{isPercentRecord(record.label) ? '%' : ''}</div><div className="mt-0.5 text-[7px] leading-3 text-white/25">{record.label}</div></div>)}</div></div>}

    {data.season_history.length > 0 && <div className="rounded-[22px] border border-white/[0.06] bg-white/[0.025] p-3"><div className="flex items-end justify-between gap-3"><div><div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/35">Архив сезонов</div><div className="mt-0.5 text-[9px] text-white/20">История не обнуляется — каждый сезон остаётся в клубе</div></div></div><div className="mt-3 flex gap-1.5 overflow-x-auto pb-1">{data.season_history.map((season) => <button key={season.key} type="button" onClick={() => setSelectedSeasonKey(season.key)} className={`shrink-0 rounded-xl px-3 py-2 text-left ${selectedSeasonKey === season.key ? 'bg-white text-black' : 'bg-black/20 text-white/45'}`}><div className="text-[9px] font-semibold">{season.label}</div><div className="mt-0.5 text-[8px] opacity-60">{season.games} игр</div></button>)}</div>{selectedSeason && <div className="mt-3"><div className="flex items-center justify-between gap-3"><div><div className="text-sm font-black">{selectedSeason.label}</div><div className="mt-0.5 text-[9px] text-white/25">{selectedSeason.players} игроков · {selectedSeason.games} игр</div></div>{selectedSeason.champion && <div className="text-right"><div className="text-[8px] text-amber-100/35">👑 чемпион</div><div className="mt-0.5 text-[10px] font-semibold">{selectedSeason.champion.nickname}</div></div>}</div>{selectedSeason.ranking.length ? <div className="mt-2"><RankingRows rows={selectedSeason.ranking} viewerId={data.viewer_id} limit={3} /></div> : <div className="mt-3 text-[10px] text-white/25">В этом сезоне ещё нет завершённых игр.</div>}</div>}</div>}

    <button type="button" onClick={() => setShowHall((value) => !value)} className="flex min-h-12 w-full items-center justify-between rounded-2xl border border-amber-200/10 bg-amber-200/[0.03] px-3 text-left"><span><span className="block text-[10px] uppercase tracking-[0.13em] text-amber-100/40">🏛 Зал славы</span><span className="mt-0.5 block text-[11px] text-white/35">Рекорды всей истории клуба</span></span><span className="text-white/25">{showHall ? '⌃' : '⌄'}</span></button>

    {showHall && <div className="grid grid-cols-2 gap-1.5">{data.hall_of_fame.map((record) => <div key={record.label} className="rounded-2xl border border-white/[0.05] bg-white/[0.025] p-3"><div className="flex items-center gap-2"><Avatar src={record.avatar_url} size={34} /><div className="min-w-0"><div className="truncate text-[10px] font-semibold">{record.nickname}</div><div className="mt-0.5 text-[8px] leading-3 text-white/25">{record.label}</div></div></div><div className="mt-2 text-xl font-black">{record.value}{isPercentRecord(record.label) ? '%' : ''}</div></div>)}</div>}

    <div className="rounded-[22px] border border-white/[0.06] bg-white/[0.025] p-3">
      <div className="flex items-end justify-between gap-3"><div><div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-white/35">📰 Лента клуба</div><div className="mt-0.5 text-[10px] text-white/25">Автоматически из игр, серий и сезонов</div></div><button type="button" onClick={() => setShowFeed((value) => !value)} className="text-[9px] font-semibold text-white/35">{showFeed ? 'Свернуть' : 'Вся лента'}</button></div>
      <div className="mt-3 space-y-1.5">{data.feed.slice(0, showFeed ? 30 : 5).map((item) => <div key={item.key} className="flex items-start gap-2.5 rounded-xl bg-black/15 px-2.5 py-2.5">{item.avatar_url ? <Avatar src={item.avatar_url} size={32} /> : <div className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-white/[0.04] text-sm">{item.icon}</div>}<div className="min-w-0 flex-1"><div className="truncate text-[11px] font-semibold">{item.title}</div><div className="mt-0.5 text-[9px] leading-3 text-white/30">{item.text}</div></div><div className="shrink-0 text-[8px] text-white/20">{dateText(item.date)}</div></div>)}</div>
    </div>

    <p className="text-[9px] leading-4 text-white/20">Сезоны и Зал славы — отдельная клубная история. Официальный Elo живёт по своей формуле и не сбрасывается с началом нового сезона.</p>
  </div>;
}
