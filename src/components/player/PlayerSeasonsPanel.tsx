import { countGames, countPlayers,   } from '../../lib/russianPlural';
import { useEffect, useMemo, useState } from 'react';
import { formatMoscowDate } from '../../lib/moscowDate.ts';
import { gameResultText } from '../../lib/playerResultObservations.ts';
import { openCanonicalPlayerProfile } from './playerProfileNavigation.ts';

type RankingEntry = {
  place: number;
  player_id: string;
  nickname: string;
  avatar_url?: string | null;
  games: number;
  wins: number;
  win_rate: number;
};

type RecordEntry = {
  label: string;
  value: number;
  player_id: string;
  nickname: string;
  avatar_url?: string | null;
};

type SeasonItem = {
  key: string;
  label: string;
  start?: number;
  end?: number;
  games: number;
  players: number;
  ranking: RankingEntry[];
  viewer: null | { games: number; wins: number; win_rate: number; place: number | null };
  champion: RankingEntry | null;
};

function SeasonContext({ season }: { season: SeasonItem }) {
  const dates=typeof season.start==='number'&&typeof season.end==='number'&&Number.isFinite(season.start)&&Number.isFinite(season.end)&&season.end>season.start
    ? `${formatMoscowDate(new Date(season.start).toISOString())} — ${formatMoscowDate(new Date(season.end-1).toISOString())}` : null;
  return <p className="mt-2 text-xs leading-5 text-white/60">{dates&&<span className="block">{dates}</span>}Места по числу побед, затем по проценту побед и числу игр.</p>;
}

type ClubWorldData = {
  viewer_id: string;
  season: SeasonItem & { role_champions?: Array<{ role: string; nickname: string; win_rate: number }> };
  season_records: RecordEntry[];
  season_history: SeasonItem[];
  hall_of_fame: RecordEntry[];
};

const isPercentRecord = (label: string) => {
  const value = String(label || '').toLocaleLowerCase('ru-RU');
  return value.includes('винрейт') || value.includes('шериф') || value.includes('дон');
};

function Avatar({ src, name, size = 34 }: { src?: string | null; name: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  return <span aria-hidden="true" style={{ width: size, height: size }} className="relative grid shrink-0 place-items-center overflow-hidden rounded-xl bg-gradient-to-br from-amber-200/20 to-white/[0.04] text-[11px] font-semibold text-white/75 ring-1 ring-white/10">
    {name.trim().slice(0, 1).toUpperCase() || '?'}
    {src && !failed && <img src={src} alt="" onError={() => setFailed(true)} className="absolute inset-0 h-full w-full object-cover" />}
  </span>;
}

function RankingRows({ rows, viewerId, limit = 10 }: { rows: RankingEntry[]; viewerId: string; limit?: number }) {
  return (
    <div className="space-y-1.5">
      {rows.slice(0, limit).map((item) => (
        <button type="button" onClick={() => openCanonicalPlayerProfile(item.player_id)} key={item.player_id} className={`flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left ${item.player_id === viewerId ? 'border border-white/10 bg-white/[0.09]' : 'bg-black/20'}`}>
          <div className="w-6 shrink-0 text-center text-[11px] font-black text-white/35">{item.place}</div>
          <Avatar src={item.avatar_url} name={item.nickname} size={32} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[11px] font-semibold">{item.nickname}{item.player_id === viewerId ? ' · вы' : ''}</div>
            <div className="text-[11px] leading-5 text-white/60">{gameResultText(item)}</div>
          </div>
          <div className="text-[11px] font-black">{item.win_rate}%</div>
        </button>
      ))}
    </div>
  );
}

function RecordCard({ record, featured = false }: { record: RecordEntry; featured?: boolean }) {
  const percent = isPercentRecord(record.label);
  const value = Number(record.value);
  return <button type="button" onClick={() => openCanonicalPlayerProfile(record.player_id)} aria-label={`${record.label}: ${record.nickname}, ${record.value}${percent ? '%' : ''}`}
    className={`relative flex min-h-[132px] w-full flex-col justify-between overflow-hidden rounded-[20px] border p-3 text-left transition active:bg-white/10 ${featured ? 'border-amber-200/20 bg-gradient-to-br from-amber-200/[.10] via-[#211b15] to-[#111216]' : 'border-white/10 bg-gradient-to-br from-white/[.06] to-[#111216]'}`}>
    <span className="text-[10px] font-semibold uppercase tracking-[.08em] text-white/55">{record.label}</span>
    <span className="mt-2 text-[28px] font-semibold tabular-nums leading-none text-amber-100">{record.value}{percent ? '%' : ''}</span>
    {percent && Number.isFinite(value) && <span className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10"><span className="block h-full rounded-full bg-amber-200/80" style={{width: `${Math.max(0, Math.min(100, value))}%`}} /></span>}
    <span className="mt-3 flex min-w-0 items-center gap-2"><Avatar src={record.avatar_url} name={record.nickname} size={28} /><span className="min-w-0 truncate text-xs font-medium text-white/85">{record.nickname}</span></span>
  </button>;
}

/**
 * «Активность» shows one part at a time (owner, 2026-10-06: no long feed):
 * «Сезон» — the current season and its records; «Архив» — past seasons and the hall of fame.
 */
export default function PlayerSeasonsPanel({ part }: { part: 'season' | 'history' }) {
  const [data, setData] = useState<ClubWorldData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedSeasonKey, setSelectedSeasonKey] = useState<string | null>(()=>{try{return sessionStorage.getItem('club-archive-season');}catch{return null;}});
  const [retry,setRetry]=useState(0);
  useEffect(()=>{try{if(selectedSeasonKey)sessionStorage.setItem('club-archive-season',selectedSeasonKey);}catch{}},[selectedSeasonKey]);
  // The season top starts with five rows.
  const [topOpen, setTopOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);setError(null);
    void fetch('/api/player/club-world', { credentials: 'include' })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body?.error || 'Не удалось загрузить сезоны');
        if (cancelled) return;
        const next = body as ClubWorldData;
        setData(next);
        setSelectedSeasonKey(current=>next.season_history?.some(item=>item.key===current)?current:next.season_history?.find((item) => item.key !== next.season?.key)?.key || null);
      })
      .catch((err: any) => { if (!cancelled) setError(err?.message || 'Не удалось загрузить сезоны'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [retry]);

  const selectedSeason = useMemo(
    () => data?.season_history?.find((item) => item.key === selectedSeasonKey) || null,
    [data, selectedSeasonKey],
  );

  if (loading) return <div className="rounded-2xl bg-white/[0.035] px-3 py-8 text-center text-xs text-white/30">Загружаем сезоны…</div>;
  if (error || !data) return <div className="rounded-2xl bg-rose-400/[0.07] px-3 py-4 text-sm text-rose-200/65">{error || 'Сезоны недоступны'}<button type="button" onClick={()=>setRetry(v=>v+1)} className="mt-2 block min-h-11 px-3">Повторить загрузку сезонов</button></div>;

  const viewerRank = data.season.ranking.find((item) => item.player_id === data.viewer_id) || null;

  if (part === 'history') {
    // The API also lists the running season; it belongs to «Сезон», not to the past.
    const pastSeasons = (data.season_history || []).filter((item) => item.key !== data.season.key);
    return (
      <div className="space-y-3">
        {pastSeasons.length > 0 ? (
          <section className="rounded-[24px] border border-white/[0.06] bg-white/[0.025] p-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/35">Прошлые сезоны</div>
            <div className="mt-3 flex gap-1.5 overflow-x-auto pb-1">
              {pastSeasons.map((season) => (
                <button key={season.key} type="button" onClick={() => setSelectedSeasonKey(season.key)} className={`shrink-0 rounded-xl px-3 py-2 text-left ${selectedSeasonKey === season.key ? 'bg-white text-black' : 'bg-black/20 text-white/45'}`}>
                  <div className="text-[11px] font-semibold">{season.label}</div><div className="mt-0.5 text-[11px] opacity-60">{countGames(season.games)}</div>
                </button>
              ))}
            </div>
            {selectedSeason && (
              <div className="mt-3">
                <div className="flex items-center justify-between gap-3"><div><div className="text-sm font-black">{selectedSeason.label}</div><div className="mt-0.5 text-[11px] text-white/25">{countPlayers(selectedSeason.players)} · {countGames(selectedSeason.games)}</div></div>{selectedSeason.champion && <button type="button" onClick={() => openCanonicalPlayerProfile(selectedSeason.champion!.player_id)} className="text-right"><div className="text-[11px] text-amber-100/35">👑 чемпион</div><div className="mt-0.5 text-[11px] font-semibold">{selectedSeason.champion.nickname}</div></button>}</div>
                <SeasonContext season={selectedSeason}/>
                <div className="mt-3"><RankingRows rows={selectedSeason.ranking} viewerId={data.viewer_id} limit={5} /></div>
              </div>
            )}
          </section>
        ) : <div className="rounded-2xl bg-white/[0.035] px-3 py-8 text-center text-xs text-white/35">Прошлых сезонов пока нет.</div>}
        {data.hall_of_fame?.length > 0 ? (
          <section className="rounded-[24px] border border-amber-200/10 bg-amber-200/[0.03] p-3">
            <div className="text-[11px] uppercase tracking-[0.13em] text-amber-100/40">🏛 Зал славы · рекорды всей истории клуба</div>
            <div className="mt-3 grid grid-cols-2 gap-2">{data.hall_of_fame.map((record) => <RecordCard key={record.label} record={record} featured />)}</div>
          </section>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <section className="rounded-[26px] border border-sky-200/10 bg-gradient-to-br from-sky-300/[0.055] to-white/[0.02] p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-sky-100/45">Итоги сезона</div>
            <div className="mt-1 text-xl font-black">{data.season.label}</div>
            <div className="mt-1 text-[11px] text-white/30">{countGames(data.season.games)} · {countPlayers(data.season.players)}</div>
          </div>
          {viewerRank && <div className="rounded-2xl bg-black/20 px-3 py-2 text-center"><div className="text-xl font-black">#{viewerRank.place}</div><div className="text-[11px] text-white/25">моё место</div></div>}
        </div>
        <SeasonContext season={data.season}/>
        {data.season.viewer && (
          <div className="mt-3 grid grid-cols-3 gap-1.5 text-center">
            <div className="rounded-xl bg-black/20 p-2"><div className="text-sm font-bold">{data.season.viewer.games}</div><div className="text-[11px] text-white/25">игр</div></div>
            <div className="rounded-xl bg-black/20 p-2"><div className="text-sm font-bold">{data.season.viewer.wins}</div><div className="text-[11px] text-white/25">побед</div></div>
            <div className="rounded-xl bg-black/20 p-2"><div className="text-sm font-bold">{data.season.viewer.win_rate}%</div><div className="text-[11px] text-white/25">винрейт</div></div>
          </div>
        )}
        <div className="mt-4"><div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/30">Топ сезона</div><RankingRows rows={data.season.ranking} viewerId={data.viewer_id} limit={topOpen ? data.season.ranking.length : 5} />
          {!topOpen && data.season.ranking.length > 5 ? <button type="button" onClick={() => setTopOpen(true)} className="mt-1 min-h-11 w-full rounded-xl text-xs font-semibold text-white/55">Показать всех · {data.season.ranking.length}</button> : null}</div>
      </section>

      {data.hall_of_fame?.length > 0 && <section aria-label="Зал славы клуба" className="overflow-hidden rounded-[24px] border border-amber-200/15 bg-gradient-to-br from-amber-200/[.095] via-[#1b1614] to-[#101216] p-4">
        <div className="flex items-center justify-between gap-3">
          <div><div className="text-[10px] font-semibold uppercase tracking-[.16em] text-amber-100/55">История клуба</div><h2 className="mt-1 text-lg font-semibold">🏛 Зал славы</h2></div>
          <span className="rounded-full border border-amber-200/20 px-3 py-1 text-[10px] text-amber-100/65">Вся история</span>
        </div>
        <p className="mt-1 text-xs leading-5 text-white/50">Абсолютные рекорды клуба. Полный список — во вкладке «Архив».</p>
        <div className="mt-3 grid grid-cols-2 gap-2">{data.hall_of_fame.slice(0, 2).map((record) => <RecordCard key={record.label} record={record} featured />)}</div>
      </section>}

      {data.season_records?.length > 0 && (
        <section className="rounded-[24px] border border-emerald-200/10 bg-emerald-200/[0.025] p-3">
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-100/40">Рекорды текущего сезона</div>
          <div className="mt-3 grid grid-cols-2 gap-2">{data.season_records.map((record) => <RecordCard key={record.label} record={record} featured />)}</div>
        </section>
      )}

    </div>
  );
}
