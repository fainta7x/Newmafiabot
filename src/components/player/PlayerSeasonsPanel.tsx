import { useEffect, useMemo, useState } from 'react';

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
  games: number;
  players: number;
  ranking: RankingEntry[];
  viewer: null | { games: number; wins: number; win_rate: number; place: number | null };
  champion: RankingEntry | null;
};

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
  if (src) return <img src={src} alt={name} style={{ width: size, height: size }} className="shrink-0 rounded-xl object-cover ring-1 ring-white/10" />;
  return <div style={{ width: size, height: size }} className="grid shrink-0 place-items-center rounded-xl bg-white/[0.07] text-[10px] font-semibold text-white/55">{name.slice(0, 1).toUpperCase()}</div>;
}

function RankingRows({ rows, viewerId, limit = 10 }: { rows: RankingEntry[]; viewerId: string; limit?: number }) {
  return (
    <div className="space-y-1.5">
      {rows.slice(0, limit).map((item) => (
        <div key={item.player_id} className={`flex items-center gap-2 rounded-xl px-2.5 py-2 ${item.player_id === viewerId ? 'border border-white/10 bg-white/[0.09]' : 'bg-black/20'}`}>
          <div className="w-6 shrink-0 text-center text-[11px] font-black text-white/35">{item.place}</div>
          <Avatar src={item.avatar_url} name={item.nickname} size={32} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[11px] font-semibold">{item.nickname}{item.player_id === viewerId ? ' · вы' : ''}</div>
            <div className="text-[9px] text-white/25">{item.wins}/{item.games} побед</div>
          </div>
          <div className="text-[11px] font-black">{item.win_rate}%</div>
        </div>
      ))}
    </div>
  );
}

export default function PlayerSeasonsPanel() {
  const [data, setData] = useState<ClubWorldData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedSeasonKey, setSelectedSeasonKey] = useState<string | null>(null);
  const [hallOpen, setHallOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetch('/api/player/club-world', { credentials: 'include' })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body?.error || 'Не удалось загрузить сезоны');
        if (cancelled) return;
        const next = body as ClubWorldData;
        setData(next);
        setSelectedSeasonKey(next.season_history?.[0]?.key || next.season?.key || null);
      })
      .catch((err: any) => { if (!cancelled) setError(err?.message || 'Не удалось загрузить сезоны'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const selectedSeason = useMemo(
    () => data?.season_history?.find((item) => item.key === selectedSeasonKey) || null,
    [data, selectedSeasonKey],
  );

  if (loading) return <div className="rounded-2xl bg-white/[0.035] px-3 py-8 text-center text-xs text-white/30">Загружаем сезоны…</div>;
  if (error || !data) return <div className="rounded-2xl bg-rose-400/[0.07] px-3 py-4 text-sm text-rose-200/65">{error || 'Сезоны недоступны'}</div>;

  const viewerRank = data.season.ranking.find((item) => item.player_id === data.viewer_id) || null;

  return (
    <div className="space-y-3">
      <section className="rounded-[26px] border border-sky-200/10 bg-gradient-to-br from-sky-300/[0.055] to-white/[0.02] p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-sky-100/45">Текущий сезон</div>
            <div className="mt-1 text-xl font-black">{data.season.label}</div>
            <div className="mt-1 text-[10px] text-white/30">{data.season.games} игр · {data.season.players} игроков</div>
          </div>
          {viewerRank && <div className="rounded-2xl bg-black/20 px-3 py-2 text-center"><div className="text-xl font-black">#{viewerRank.place}</div><div className="text-[8px] text-white/25">ваше место</div></div>}
        </div>
        {data.season.viewer && (
          <div className="mt-3 grid grid-cols-3 gap-1.5 text-center">
            <div className="rounded-xl bg-black/20 p-2"><div className="text-sm font-bold">{data.season.viewer.games}</div><div className="text-[8px] text-white/25">игр</div></div>
            <div className="rounded-xl bg-black/20 p-2"><div className="text-sm font-bold">{data.season.viewer.wins}</div><div className="text-[8px] text-white/25">побед</div></div>
            <div className="rounded-xl bg-black/20 p-2"><div className="text-sm font-bold">{data.season.viewer.win_rate}%</div><div className="text-[8px] text-white/25">винрейт</div></div>
          </div>
        )}
        <div className="mt-4"><div className="mb-2 text-[9px] font-semibold uppercase tracking-[0.14em] text-white/30">Топ сезона</div><RankingRows rows={data.season.ranking} viewerId={data.viewer_id} /></div>
      </section>

      {data.season_records?.length > 0 && (
        <section className="rounded-[24px] border border-emerald-200/10 bg-emerald-200/[0.025] p-3">
          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-100/40">Рекорды текущего сезона</div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {data.season_records.map((record) => (
              <div key={record.label} className="rounded-2xl bg-black/20 p-3">
                <div className="flex items-center gap-2"><Avatar src={record.avatar_url} name={record.nickname} size={30} /><div className="min-w-0 truncate text-[10px] font-semibold">{record.nickname}</div></div>
                <div className="mt-2 text-xl font-black">{record.value}{isPercentRecord(record.label) ? '%' : ''}</div>
                <div className="mt-0.5 text-[8px] leading-3 text-white/25">{record.label}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      {data.season_history?.length > 0 && (
        <section className="rounded-[24px] border border-white/[0.06] bg-white/[0.025] p-3">
          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/35">Архив сезонов</div>
          <div className="mt-3 flex gap-1.5 overflow-x-auto pb-1">
            {data.season_history.map((season) => (
              <button key={season.key} type="button" onClick={() => setSelectedSeasonKey(season.key)} className={`shrink-0 rounded-xl px-3 py-2 text-left ${selectedSeasonKey === season.key ? 'bg-white text-black' : 'bg-black/20 text-white/45'}`}>
                <div className="text-[9px] font-semibold">{season.label}</div><div className="mt-0.5 text-[8px] opacity-60">{season.games} игр</div>
              </button>
            ))}
          </div>
          {selectedSeason && (
            <div className="mt-3">
              <div className="flex items-center justify-between gap-3"><div><div className="text-sm font-black">{selectedSeason.label}</div><div className="mt-0.5 text-[9px] text-white/25">{selectedSeason.players} игроков · {selectedSeason.games} игр</div></div>{selectedSeason.champion && <div className="text-right"><div className="text-[8px] text-amber-100/35">👑 чемпион</div><div className="mt-0.5 text-[10px] font-semibold">{selectedSeason.champion.nickname}</div></div>}</div>
              <div className="mt-3"><RankingRows rows={selectedSeason.ranking} viewerId={data.viewer_id} limit={5} /></div>
            </div>
          )}
        </section>
      )}

      <button type="button" onClick={() => setHallOpen((value) => !value)} className="flex min-h-12 w-full items-center justify-between rounded-2xl border border-amber-200/10 bg-amber-200/[0.03] px-3 text-left">
        <span><span className="block text-[10px] uppercase tracking-[0.13em] text-amber-100/40">🏛 Зал славы</span><span className="mt-0.5 block text-[11px] text-white/35">Рекорды всей истории клуба</span></span><span className="text-white/25">{hallOpen ? '⌃' : '⌄'}</span>
      </button>
      {hallOpen && <div className="grid grid-cols-2 gap-1.5">{data.hall_of_fame.map((record) => <div key={record.label} className="rounded-2xl border border-white/[0.05] bg-white/[0.025] p-3"><div className="flex items-center gap-2"><Avatar src={record.avatar_url} name={record.nickname} size={34} /><div className="min-w-0"><div className="truncate text-[10px] font-semibold">{record.nickname}</div><div className="mt-0.5 text-[8px] leading-3 text-white/25">{record.label}</div></div></div><div className="mt-2 text-xl font-black">{record.value}{isPercentRecord(record.label) ? '%' : ''}</div></div>)}</div>}
    </div>
  );
}
