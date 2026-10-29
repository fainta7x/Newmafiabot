import { AvatarImage } from '../ui/AvatarImage.tsx';
import { countGames, countPlayers,   } from '../../lib/russianPlural';
import { useEffect, useState } from 'react';
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
  selected_season?:SeasonItem|null;
  selected_season_records?:RecordEntry[];
};

const isPercentRecord = (label: string) => {
  const value = String(label || '').toLocaleLowerCase('ru-RU');
  return value.includes('винрейт') || value.includes('шериф') || value.includes('дон');
};

function Avatar({ src, name, size = 34 }: { src?: string | null; name: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  return <span aria-hidden="true" style={{ width: size, height: size }} className="relative grid shrink-0 place-items-center overflow-hidden rounded-xl bg-gradient-to-br from-amber-200/20 to-white/[0.04] text-[11px] font-semibold text-white/75 ring-1 ring-white/10">
    {name.trim().slice(0, 1).toUpperCase() || '?'}
    {src && !failed && <AvatarImage src={src} alt="" onError={() => setFailed(true)} className="absolute inset-0 h-full w-full object-cover" />}
  </span>;
}

function SeasonViewer({ season }: { season: SeasonItem }) {
  return <section aria-label="Мой результат в сезоне" className="mt-3 rounded-2xl border border-sky-200/10 bg-sky-200/[0.04] p-3">
    <h3 className="text-xs font-semibold text-sky-100/75">Мои победы за этот период</h3>
    {season.viewer ? <>
      <p className="mt-1 text-sm font-semibold">{gameResultText(season.viewer)} · {season.viewer.win_rate}%</p>
      <p className="mt-1 text-xs text-white/55">{season.viewer.place != null ? `Место по победам: ${season.viewer.place} из ${season.players}` : 'Место не указано'}</p>
    </> : <p className="mt-1 text-xs leading-5 text-white/55">В этом сезоне нет записанных игр.</p>}
  </section>;
}

function RankingExtent({ season, limit }: { season: SeasonItem; limit: number }) {
  const shown = Math.min(limit, season.ranking.length);
  return <p className="text-[11px] leading-5 text-white/55">{shown ? `Показаны места 1–${shown}. Участников в сезоне: ${season.players}.` : 'Мест в таблице пока нет.'}</p>;
}

function RankingRows({ rows, viewerId, limit = 10 }: { rows: RankingEntry[]; viewerId: string; limit?: number }) {
  return (
    <div className="space-y-1.5">
      {rows.slice(0, limit).map((item) => (
        <button type="button" onClick={() => openCanonicalPlayerProfile(item.player_id)} key={item.player_id} className={`flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left ${item.player_id === viewerId ? 'border border-white/10 bg-white/[0.09]' : 'bg-black/20'}`}>
          <div className="w-6 shrink-0 text-center text-[11px] font-black text-white/35">{item.place}</div>
          <Avatar src={item.avatar_url} name={item.nickname} size={32} />
          <div className="min-w-0 flex-1">
            <div className="break-words text-[11px] font-semibold leading-4">{item.nickname}{item.player_id === viewerId ? ' · вы' : ''}</div>
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
    <span className="mt-3 flex min-w-0 items-center gap-2"><Avatar src={record.avatar_url} name={record.nickname} size={28} /><span className="min-w-0 break-words text-xs font-medium text-white/85">{record.nickname}</span></span>
  </button>;
}

/** Period statistics share the exact selected RATING key with the sporting table. */
export default function PlayerSeasonsPanel({part,periodKey}:{part:'period'|'hall'|'season'|'history';periodKey?:string}){
 const[data,setData]=useState<ClubWorldData|null>(null);const[error,setError]=useState<string|null>(null);const[retry,setRetry]=useState(0);const[topOpen,setTopOpen]=useState(false);
 const[fallbackKey,setFallbackKey]=useState<string|null>(()=>{try{return part==='history'?sessionStorage.getItem('club-archive-season'):null;}catch{return null;}});
 useEffect(()=>{let cancelled=false;setData(null);setError(null);setTopOpen(false);const query=periodKey?'?period='+encodeURIComponent(periodKey):'';void fetch('/api/player/club-world'+query,{credentials:'include'}).then(async response=>{const body=await response.json();if(!response.ok)throw new Error(body?.error||'Не удалось загрузить статистику клуба');if(!cancelled)setData(body);}).catch(err=>{if(!cancelled)setError(err?.message||'Не удалось загрузить статистику клуба');});return()=>{cancelled=true;};},[periodKey,retry]);
 if(error)return <section role="alert" className="rounded-2xl border border-rose-300/15 p-4 text-sm"><p>{error}</p><button type="button" onClick={()=>setRetry(value=>value+1)} className="mt-2 min-h-11 px-2">Повторить загрузку</button></section>;
 if(!data)return <p className="rounded-2xl bg-white/[0.035] px-3 py-8 text-center text-xs text-white/50">Загружаем статистику клуба…</p>;
 if(part==='hall')return <section data-testid="club-hall-of-fame" className="rounded-3xl border border-amber-200/15 bg-amber-200/[0.035] p-4"><h2 className="text-lg font-semibold">Зал славы</h2><p className="mt-2 text-xs leading-5 text-white/60">Рекорды всей истории клуба по завершённым играм. У каждой категории свои условия; сезонные рекорды находятся в выбранном сезоне.</p>{data.hall_of_fame?.length?<div className="mt-4 grid grid-cols-2 gap-2">{data.hall_of_fame.map(record=><RecordCard key={record.label} record={record} featured/>)}</div>:<p className="mt-4 text-sm text-white/55">Подтверждённых рекордов пока нет.</p>}</section>;
 const fallbackSeasons=[data.season,...(data.season_history||[])].filter((item,index,all)=>all.findIndex(other=>other.key===item.key)===index);
 const season=periodKey?(data.selected_season?.key===periodKey?data.selected_season:null):fallbackSeasons.find(item=>item.key===fallbackKey)||(part==='history'?fallbackSeasons.find(item=>item.key!==data.season.key):data.season);
 if(!season)return <section data-testid="club-period-unavailable" className="rounded-2xl border border-white/10 p-4 text-xs leading-5 text-white/60">Для выбранного периода статистика клуба недоступна. Спортивный зачёт показан выше.</section>;
 const records=periodKey?data.selected_season_records||[]:season.key===data.season.key?data.season_records||[]:[];
 return <section data-testid="club-period-stats" className="space-y-4 rounded-3xl border border-sky-200/10 bg-sky-200/[0.025] p-4">
  <header><h2 className="text-lg font-semibold">Клуб за этот период</h2>{!periodKey&&fallbackSeasons.length>1&&<label className="mt-3 block text-xs text-white/65">Период статистики<select aria-label="Период статистики клуба" value={season.key} onChange={event=>{setFallbackKey(event.target.value);setTopOpen(false);try{sessionStorage.setItem('club-archive-season',event.target.value);}catch{}}} className="mobile-field mt-2 w-full text-sm">{fallbackSeasons.map(item=><option key={item.key} value={item.key}>{item.label}</option>)}</select></label>}<p className="mt-1 text-sm font-medium text-white/80">{season.label}</p><p className="mt-2 text-xs leading-5 text-white/60">Все форматы завершённых игр в датах периода. Это статистика побед. {periodKey?'Спортивные баллы и зачётная дистанция показаны выше.':'Спортивный зачёт пока недоступен.'}</p><p className="mt-2 text-xs text-white/65">{countGames(season.games)} · {countPlayers(season.players)}</p><SeasonContext season={season}/></header>
  <SeasonViewer season={season.viewer&&season.viewer.place==null?{...season,viewer:{...season.viewer,place:season.ranking.find(item=>item.player_id===data.viewer_id)?.place??null}}:season}/>
  <div className="space-y-2"><h3 className="text-sm font-semibold">По числу побед</h3><RankingExtent season={season} limit={topOpen?season.ranking.length:5}/><RankingRows rows={season.ranking} viewerId={data.viewer_id} limit={topOpen?season.ranking.length:5}/>{!topOpen&&season.ranking.length>5&&<button type="button" onClick={()=>setTopOpen(true)} className="min-h-11 w-full rounded-xl bg-white/5 px-3 text-xs">Показать места 6–{season.ranking.length}</button>}</div>
  {!!records.length&&<div><h3 className="text-sm font-semibold">Рекорды этого периода</h3><div className="mt-3 grid grid-cols-2 gap-2">{records.map(record=><RecordCard key={record.label} record={record}/>)}</div></div>}
 </section>;
}
