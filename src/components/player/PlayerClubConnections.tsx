import type {ConnectionContent} from '../../shared/connectionContent.ts';
import ConnectionPairHistory from './ConnectionPairHistory.tsx';
import ClubConnectionCard from './ClubConnectionCard.tsx';
import {gameResultText} from '../../lib/playerResultObservations.ts';
import ClubConnectionStories from './ClubConnectionStories.tsx';
import type { ClubConnectionStories as ClubStories } from '../../shared/clubConnectionStories.ts';
import { useCallback, useEffect, useRef, useState } from 'react';
import { getJson } from '../../lib/requestJson.ts';

type PersonRelationship = {
  player_id: string;
  nickname: string;
  games: number;
  wins: number;
  win_rate: number;
  avatar_url: string;
};

type ClubDuo = {
  a_id: string;
  a_name: string;
  b_id: string;
  b_name: string;
  team: 'red' | 'black';
  games: number;
  wins: number;
  win_rate: number;
  a_avatar_url: string;
  b_avatar_url: string;
};

type RelationshipData = {
  club_stories?: ClubStories;
  content?:ConnectionContent;
  rivals: PersonRelationship[];
  teammates: PersonRelationship[];
  club_duos: { red: ClubDuo[]; black: ClubDuo[] };
  club_most_played?: { red: ClubDuo[]; black: ClubDuo[] };
  club_first_games?: { red: ClubDuo[]; black: ClubDuo[] };
  recent_event?: { title: string; date: string; teammates: PersonRelationship[]; rivals: PersonRelationship[] } | null;
};

function DuoRow({duo,onOpenPair}:{duo:ClubDuo;onOpenPair?:(a:string,b:string)=>void}){return <ClubConnectionCard onOpenPair={onOpenPair} testId={'club-duo-'+duo.a_id+'-'+duo.b_id} members={[{player_id:duo.a_id,nickname:duo.a_name},{player_id:duo.b_id,nickname:duo.b_name}]} context={'В одной команде · '+(duo.team==='red'?'красные':'чёрные')}><p className="text-sm font-semibold">{gameResultText(duo)} · {duo.win_rate}%</p></ClubConnectionCard>;}

export default function PlayerClubConnections({viewerId}:{viewerId?:string}) {
  const memoryKey='community-connection-view:'+String(viewerId||'viewer');
  const [query,setQuery]=useState<{period:string;format:string;a:string;b:string}>(()=>{try{return {period:'all',format:'all',a:'',b:'',...JSON.parse(sessionStorage.getItem('community-connection-query')||sessionStorage.getItem(memoryKey)||'{}')};}catch{return {period:'all',format:'all',a:'',b:''};}});
  useEffect(()=>{try{sessionStorage.removeItem('community-connection-query');sessionStorage.setItem(memoryKey,JSON.stringify(query));}catch{}},[memoryKey,query]);
  const pairRef=useRef<HTMLElement>(null);
  const scrollPair=useRef(false);
  const openPair=(a:string,b:string)=>{setQuery(q=>({...q,a,b}));scrollPair.current=true;};
  const [clubView, setClubView] = useState<'best' | 'played'>(()=>{try{return sessionStorage.getItem('club-duos-view')==='played'?'played':'best';}catch{return 'best';}});
  const [data, setData] = useState<RelationshipData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestSeq = useRef(0);
  useEffect(()=>{if(!loading&&scrollPair.current){pairRef.current?.scrollIntoView?.({behavior:'smooth',block:'start'});scrollPair.current=false;}},[loading,data]);

  const loadRelationships = useCallback(async () => {
    const requestId = ++requestSeq.current;
    setLoading(true);
    setError(null);

    try {
      const body = await getJson('/api/player/relationships?'+new URLSearchParams(query), 'Не удалось загрузить связи игроков');
      if (!body?.club_duos?.red || !body?.club_duos?.black) throw new Error('Не удалось загрузить связи игроков');
      if (requestId === requestSeq.current) setData(body as RelationshipData);
    } catch (loadError: any) {
      if (requestId === requestSeq.current) setError(loadError?.message || 'Не удалось загрузить связи игроков');
    } finally {
      if (requestId === requestSeq.current) setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    void loadRelationships();
    return () => { requestSeq.current += 1; };
  }, [loadRelationships]);

  const controls=<section className="space-y-3 rounded-3xl border border-white/10 bg-white/[.04] p-3" data-testid="connection-controls"><h2 className="text-lg font-semibold">Связи игроков</h2><p className="text-xs leading-5 text-white/55">{data?.content?data.content.filters.period_label+' · '+data.content.filters.format_label:'Общие игры и история пары'}</p><div className="grid grid-cols-2 gap-2"><details className="rounded-xl border border-white/10 px-3 open:col-span-2"><summary className="flex min-h-11 cursor-pointer items-center text-xs font-semibold text-white/75">Период и формат</summary><div className="grid grid-cols-2 gap-2"><label className="text-xs text-white/60">Период<select aria-label="Период связей" value={query.period} onChange={e=>setQuery(q=>({...q,period:e.target.value}))} className="mobile-field mt-1 w-full"><option value="all">Всё время</option>{data?.content?.filters.seasons.map(p=><option key={p.key} value={p.key}>{p.label}</option>)}</select></label><label className="text-xs text-white/60">Формат<select aria-label="Формат связей" value={query.format} onChange={e=>setQuery(q=>({...q,format:e.target.value}))} className="mobile-field mt-1 w-full"><option value="all">Все форматы</option>{data?.content?.filters.formats.map(p=><option key={p.key} value={p.key}>{p.label}</option>)}</select></label></div></details>{data?.content&&<><details open={!!query.a||!!query.b} className="rounded-xl border border-white/10 px-3 open:col-span-2"><summary className="flex min-h-11 cursor-pointer items-center text-xs font-semibold text-white/75">Найти пару</summary><div className="grid grid-cols-2 gap-2">{(['a','b']as const).map((key,i)=><label key={key} className="min-w-0 text-xs text-white/60">{i===0?'Первый участник':'Второй участник'}<select aria-label={i===0?'Первый участник пары':'Второй участник пары'} className="mobile-field mt-1 w-full" value={query[key]} onChange={e=>setQuery(q=>({...q,[key]:e.target.value}))}><option value="">Выбрать игрока</option>{data.content!.players.filter(p=>p.player_id!==query[i===0?'b':'a']).map(p=><option key={p.player_id} value={p.player_id}>{p.nickname}</option>)}</select></label>)}</div>{(query.a||query.b)&&<button type="button" className="min-h-11 rounded-xl border border-white/10 px-3 text-xs text-white/65" onClick={()=>setQuery(q=>({...q,a:'',b:''}))}>Сбросить пару</button>}</details></>}</div></section>;
  if(loading||error||!data)return <div className="space-y-3">{controls}{error?<div role="alert" data-testid="player-connections-error" className="rounded-2xl border border-rose-300/15 p-4"><p className="text-sm">{error}</p><button type="button" className="mt-3 min-h-11 rounded-xl border border-white/15 px-3 text-sm" onClick={()=>void loadRelationships()}>Повторить</button></div>:<p className="p-4 text-xs text-white/50">Считаем, кто с кем играл…</p>}</div>;

  const pairs = (
<section data-testid="club-duos" className={data.club_stories?'':'rounded-3xl border border-white/10 bg-white/[.035] p-4'}>
        <h2 className="mt-1 text-lg font-semibold">Пары напарников</h2>
        <div aria-label="Показать клубные пары" className="mt-3 flex gap-2">
          {([['best', 'По результатам'], ['played', 'По числу игр']] as const).map(([value, label]) => <button key={value} type="button" aria-pressed={clubView === value} onClick={() => {setClubView(value);try{sessionStorage.setItem('club-duos-view',value);}catch{}}} className={`min-h-11 flex-1 rounded-xl px-2 text-[12px] font-medium ${clubView === value ? 'bg-amber-200/10 text-amber-100' : 'bg-white/[0.035] text-white/55'}`}>{label}</button>)}
        </div>
        <p className="mt-2 text-[11px] text-white/40">{clubView === 'best' ? 'От двух игр вместе. Порядок учитывает процент побед и число игр.' : 'Пары, которые чаще всего играли в одной команде.'}</p>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          {(['red', 'black'] as const).map(team => {
            const pairs = clubView === 'played' ? (data.club_most_played?.[team] ?? data.club_duos[team]) : data.club_duos[team];
            const first = (data.club_first_games?.[team] ?? []).filter(duo=>!data.content?.new_pairs.some(pair=>pair.team===team&&pair.members.some(p=>p.player_id===duo.a_id)&&pair.members.some(p=>p.player_id===duo.b_id)));
            return <div key={team}>
              <h3 className={`mb-2 text-xs font-semibold ${team === 'red' ? 'text-rose-200/80' : 'text-white/65'}`}>{team === 'red' ? 'Красные' : 'Чёрные'}</h3>
              <div className="space-y-3">{pairs.map(duo => <DuoRow onOpenPair={openPair} key={`${duo.a_id}:${duo.b_id}`} duo={duo} />)}</div>
              {!pairs.length && <p className="rounded-xl bg-black/15 p-3 text-xs leading-relaxed text-white/45">Пока нет пар, которые сыграли вместе дважды.</p>}
              {!!first.length && <details className="mt-3 rounded-xl border border-white/[0.06] p-3" open={!pairs.length}>
                <summary className="flex min-h-11 cursor-pointer items-center text-xs font-semibold text-white/65">Пока по одной игре · {first.length}</summary>
                <p className="my-2 text-[11px] leading-relaxed text-white/40">Вместе сыграли только раз — рано судить, насколько пара сильна.</p>
                <div className="space-y-3">{first.map(duo => <DuoRow onOpenPair={openPair} key={`${duo.a_id}:${duo.b_id}`} duo={duo} />)}</div>
              </details>}
            </div>;
          })}
        </div>
      </section>
  );
  return (
    <div className="player-connections-layout space-y-3">
      {controls}
      {query.a&&query.b&&<section ref={pairRef}>{data.content?.pair?<ConnectionPairHistory pair={data.content.pair}/>:<p className="rounded-2xl border border-white/10 p-4 text-sm leading-6 text-white/60">Нет доступных общих игр этой пары в выбранном периоде и формате. Проверьте выбор; закрытые связи не показываются.</p>}</section>}
      {data.club_stories ? <ClubConnectionStories stories={data.club_stories} pairs={pairs} content={data.content} onOpenPair={openPair} /> : pairs}

    </div>
  );
}
