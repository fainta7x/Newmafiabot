import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import PlayerAwardSuggestionAction from './PlayerAwardSuggestionAction.tsx';
import PremiumProfileConnections from './PremiumProfileConnections.tsx';
import PremiumProfileShowcase from './PremiumProfileShowcase.tsx';
import SmartFriendInviteSuggestions from './SmartFriendInviteSuggestions.tsx';
import { PlayerProfileCompletionCard } from './PlayerProfileCompleteness.tsx';

type Tab = 'overview' | 'games' | 'roles' | 'elo' | 'awards' | 'history' | 'connections';
type Period = { starts_at?: string; ends_at?: string; title?: string };
const TABS: Array<[Tab,string]> = [['overview','Обзор'],['games','Игры'],['roles','Роли'],['elo','Elo'],['awards','Награды'],['history','История клуба'],['connections','Связи']];
const ROLE_OPTIONS = [['','Все роли'],['citizen','Мирный'],['sheriff','Шериф'],['mafia','Мафия'],['don','Дон']] as const;
const TEAM_OPTIONS = [['','Все команды'],['red','Красные'],['black','Чёрные']] as const;
const RESULT_OPTIONS = [['','Любой результат'],['win','Победа'],['loss','Поражение']] as const;
const json = async (url:string, signal?:AbortSignal) => {
  const r=await fetch(url,{credentials:'include',signal});
  const b=await r.json().catch(()=>({}));
  if(!r.ok) throw new Error(b.error||'Ошибка загрузки');
  return b;
};
const fmt = (v:any) => v && Number.isFinite(new Date(v).getTime()) ? new Date(v).toLocaleDateString('ru-RU') : '—';
const deltaText = (value: unknown) => {
  const delta=Number(value);
  if(!Number.isFinite(delta)) return '—';
  return `${delta>0?'+':''}${delta}`;
};

export default function CanonicalPremiumPlayerProfile({playerId,mode='public',selfPlayerId,onClose,ownerSettings}:{playerId:string;mode?:'self'|'public';selfPlayerId:string;onClose?:()=>void;ownerSettings?:ReactNode}) {
  const [tab,setTab]=useState<Tab>('overview');
  const [summary,setSummary]=useState<any>(null);
  const [birthday,setBirthday]=useState<any>(null);
  const [data,setData]=useState<any>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [settings,setSettings]=useState(false);
  const [period,setPeriod]=useState<'all'|'season'|'custom'>('all');
  const [activePeriod,setActivePeriod]=useState<Period|null>(null);
  const [from,setFrom]=useState('');
  const [to,setTo]=useState('');
  const [role,setRole]=useState('');
  const [team,setTeam]=useState('');
  const [result,setResult]=useState('');
  const [offset,setOffset]=useState(0);
  const scrollRef=useRef<HTMLDivElement>(null);
  const scrollByTab=useRef<Record<string,number>>({});
  const playerRequestGeneration=useRef(0);
  const isSelf=mode==='self';

  useEffect(()=>{
    const generation=++playerRequestGeneration.current;
    const controller=new AbortController();
    setSummary(null);
    setBirthday(null);
    setData(null);
    setError('');
    setLoading(true);
    setSettings(false);
    setOffset(0);
    scrollByTab.current={};
    if(scrollRef.current) scrollRef.current.scrollTop=0;
    Promise.all([
      json(`/api/player/profiles/${encodeURIComponent(playerId)}/summary`,controller.signal),
      json(`/api/player/profiles/${encodeURIComponent(playerId)}/birthday`,controller.signal).catch((reason)=>{
        if(reason?.name==='AbortError') throw reason;
        return null;
      }),
    ]).then(([s,b])=>{
      if(generation!==playerRequestGeneration.current) return;
      setSummary(s);
      setBirthday(b);
    }).catch((reason:any)=>{
      if(reason?.name==='AbortError'||generation!==playerRequestGeneration.current) return;
      setError(reason?.message||'Ошибка загрузки');
    }).finally(()=>{
      if(generation===playerRequestGeneration.current) setLoading(false);
    });
    return ()=>controller.abort();
  },[playerId]);

  useEffect(()=>{
    if(period!=='season') return;
    const controller=new AbortController();
    json('/api/player/rating-periods',controller.signal).then(b=>setActivePeriod(b.active_periods?.[0]||null)).catch((reason:any)=>{
      if(reason?.name!=='AbortError') setActivePeriod(null);
    });
    return ()=>controller.abort();
  },[period]);

  const gameQuery=useMemo(()=>{
    const q=new URLSearchParams({limit:'15',offset:String(offset)});
    if(role)q.set('role',role);
    if(team)q.set('team',team);
    if(result)q.set('result',result);
    if(period==='custom'){
      if(from)q.set('from',from);
      if(to)q.set('to',to);
    }
    if(period==='season'&&activePeriod){
      if(activePeriod.starts_at)q.set('from',activePeriod.starts_at);
      if(activePeriod.ends_at)q.set('to',activePeriod.ends_at);
    }
    return q.toString();
  },[role,team,result,period,from,to,activePeriod,offset]);

  useEffect(()=>{setOffset(0)},[role,team,result,period,from,to]);

  useEffect(()=>{
    if(tab==='overview'||tab==='awards'||tab==='history'||tab==='connections'||settings) return;
    const generation=playerRequestGeneration.current;
    const controller=new AbortController();
    setData(null);
    setError('');
    setLoading(true);
    const suffix=tab==='games'?`games?${gameQuery}`:tab==='elo'?'elo?range=all':tab;
    json(`/api/player/profiles/${encodeURIComponent(playerId)}/${suffix}`,controller.signal).then((body)=>{
      if(generation===playerRequestGeneration.current) setData(body);
    }).catch((reason:any)=>{
      if(reason?.name==='AbortError'||generation!==playerRequestGeneration.current) return;
      setError(reason?.message||'Ошибка загрузки');
    }).finally(()=>{
      if(generation===playerRequestGeneration.current) setLoading(false);
    });
    return ()=>controller.abort();
  },[tab,playerId,gameQuery,settings]);

  const switchTab=(next:Tab)=>{
    if(scrollRef.current) scrollByTab.current[tab]=scrollRef.current.scrollTop;
    setSettings(false);
    setError('');
    setData(null);
    setTab(next);
    requestAnimationFrame(()=>{if(scrollRef.current) scrollRef.current.scrollTop=scrollByTab.current[next]||0;});
  };

  if(error&&!summary) return <div className="p-5 text-sm text-red-300">{error}</div>;
  const p=summary?.player||summary?.profile||{};
  const stats=summary?.stats||{};
  const games=data?.games||data?.items||[];
  const total=Number(data?.total||games.length);
  const eloPoints=Array.isArray(data?.points)?data.points:Array.isArray(data?.history)?data.history:[];
  const birthdayText=birthday?.day&&birthday?.month ? `${String(birthday.day).padStart(2,'0')}.${String(birthday.month).padStart(2,'0')}${birthday.year?`.${birthday.year}`:''}` : null;

  return <div ref={scrollRef} className="h-full min-h-0 overflow-y-auto bg-[#090a0d] text-white" data-testid="canonical-premium-profile">
    <header className="sticky top-0 z-20 border-b border-white/10 bg-[#090a0d]/95 px-4 py-3 backdrop-blur" style={{paddingTop:'max(12px,var(--tg-content-safe-area-top))',paddingLeft:'max(16px,var(--tg-content-safe-area-left))',paddingRight:'max(16px,var(--tg-content-safe-area-right))'}}>
      <div className="flex items-center gap-3">{onClose&&<button onClick={onClose} className="rounded-xl border border-white/10 px-3 py-2" aria-label="Назад">←</button>}<img src={p.avatar_url||`/api/player/players/${playerId}/avatar`} alt="" className="h-12 w-12 rounded-full object-cover"/><div className="min-w-0 flex-1"><h1 className="truncate text-lg font-semibold">{p.nickname||'Профиль игрока'}</h1>{p.full_name&&<div className="truncate text-xs text-white/55">{p.full_name}</div>}{birthdayText&&<div className="text-[11px] text-white/40">День рождения: {birthdayText}</div>}</div>{isSelf&&<button onClick={()=>setSettings(v=>!v)} className="rounded-xl bg-white/10 px-3 py-2 text-xs">{settings?'Готово':'Редактировать'}</button>}</div>
    </header>
    {!settings&&<nav data-profile-sticky-tabs className="profile-sticky-tabs sticky z-10 flex gap-2 overflow-x-auto border-b border-white/10 bg-[#090a0d]/96 px-3 py-2" aria-label="Разделы профиля">{TABS.map(([k,l])=><button key={k} onClick={()=>switchTab(k)} className={`shrink-0 rounded-full px-3 py-2 text-xs ${tab===k?'bg-white text-black':'bg-white/8 text-white/70'}`}>{l}</button>)}</nav>}
    <main className="mx-auto max-w-3xl space-y-4 p-4 pb-[calc(var(--app-content-bottom)+24px)]">
      {settings&&<>{ownerSettings}</>}
      {!settings&&tab==='overview'&&<>
        {isSelf&&<PlayerProfileCompletionCard/>}
        <section className="grid grid-cols-3 gap-2">{[['Игры',stats.games??stats.completed_games??'—'],['Победы',stats.wins??'—'],['Elo',p.elo??stats.elo??'—']].map(([l,v])=><div key={String(l)} className="rounded-2xl border border-white/10 bg-white/[.04] p-3"><div className="text-lg font-semibold">{v}</div><div className="text-[11px] text-white/50">{l}</div></div>)}</section>
        {(summary?.recent_games||[]).length>0&&<section className="rounded-2xl border border-white/10 p-4"><h2 className="font-semibold">Последние игры</h2><div className="mt-3 space-y-2">{summary.recent_games.slice(0,4).map((g:any)=><div key={g.id||g.game_id} className="flex justify-between text-sm"><span>{g.role||g.team||'Игра'}</span><span className="text-white/50">{fmt(g.played_at||g.date)}</span></div>)}</div></section>}
        <button onClick={()=>switchTab('connections')} className="w-full rounded-2xl border border-white/10 bg-white/[.04] p-4 text-left"><div className="font-semibold">Связи и приглашения</div><div className="mt-1 text-xs text-white/55">С кем чаще играешь, кто ещё не записался и кого можно позвать.</div></button>
      </>}
      {!settings&&tab==='games'&&<>
        <div className="flex flex-wrap gap-2">{(['all','season','custom'] as const).map(k=><button key={k} onClick={()=>setPeriod(k)} className={`rounded-full px-3 py-2 text-xs ${period===k?'bg-white text-black':'bg-white/10'}`}>{k==='all'?'За всё время':k==='season'?'Текущий период':'Диапазон дат'}</button>)}</div>
        {period==='season'&&<div className="text-xs text-white/45">{activePeriod?.title||'Активный рейтинговый период не задан'}</div>}
        {period==='custom'&&<div className="grid grid-cols-2 gap-2"><input type="date" value={from} onChange={e=>setFrom(e.target.value)} className="rounded-xl bg-white/10 p-3"/><input type="date" value={to} onChange={e=>setTo(e.target.value)} className="rounded-xl bg-white/10 p-3"/></div>}
        <details className="rounded-2xl border border-white/10 p-3"><summary className="cursor-pointer text-sm">Дополнительные фильтры</summary><div className="mt-3 grid gap-2 sm:grid-cols-3">
          <label className="text-xs text-white/50">Роль<select aria-label="Роль" value={role} onChange={e=>setRole(e.target.value)} className="mobile-field mt-1 w-full text-sm">{ROLE_OPTIONS.map(([value,label])=><option key={value||'all'} value={value}>{label}</option>)}</select></label>
          <label className="text-xs text-white/50">Команда<select aria-label="Команда" value={team} onChange={e=>setTeam(e.target.value)} className="mobile-field mt-1 w-full text-sm">{TEAM_OPTIONS.map(([value,label])=><option key={value||'all'} value={value}>{label}</option>)}</select></label>
          <label className="text-xs text-white/50">Результат<select aria-label="Результат" value={result} onChange={e=>setResult(e.target.value)} className="mobile-field mt-1 w-full text-sm">{RESULT_OPTIONS.map(([value,label])=><option key={value||'all'} value={value}>{label}</option>)}</select></label>
        </div></details>
        {error?<div className="rounded-xl border border-red-400/20 bg-red-400/10 p-3 text-sm text-red-200">{error}</div>:null}
        <div className="space-y-2">{games.map((g:any)=><article key={g.id||g.game_id} className="rounded-2xl border border-white/10 p-4"><div className="flex justify-between gap-3"><b>{g.role||'Игра'}</b><span className="shrink-0 text-xs text-white/50">{fmt(g.played_at||g.date)}</span></div><div className="mt-2 text-xs text-white/60">{g.team||''} {g.won===true?'· победа':g.won===false?'· поражение':''}</div></article>)}</div>
        {!loading&&games.length===0?<div className="rounded-2xl border border-white/10 p-5 text-center text-sm text-white/45">По выбранным фильтрам игр нет.</div>:null}
        {total>15&&<div className="flex justify-between"><button disabled={offset===0} onClick={()=>setOffset(Math.max(0,offset-15))} className="rounded-xl bg-white/10 px-4 py-2 text-sm disabled:opacity-30">Назад</button><button disabled={offset+15>=total} onClick={()=>setOffset(offset+15)} className="rounded-xl bg-white/10 px-4 py-2 text-sm disabled:opacity-30">Дальше</button></div>}
      </>}
      {!settings&&tab==='roles'&&<section className="space-y-2">{(data?.roles||data?.items||[]).map((r:any)=><div key={r.role} className="rounded-2xl border border-white/10 p-4"><b>{r.label||r.role}</b><div className="text-xs text-white/55">{r.games??r.total??0} игр · {r.win_rate??0}% побед</div></div>)}</section>}
      {!settings&&tab==='elo'&&<section className="rounded-2xl border border-white/10 p-4"><h2 className="font-semibold">История Elo</h2><div className="mt-3 space-y-2">{eloPoints.map((x:any,i:number)=><article key={x.id||i} className="rounded-xl bg-white/[.035] p-3"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="truncate text-sm font-medium">{x.title||'Игра'}{x.game_number?` · #${x.game_number}`:''}</div><div className="mt-1 text-xs text-white/45">{fmt(x.date||x.played_at)}{x.role?` · ${x.role}`:''}</div></div><div className="shrink-0 text-right"><div className="text-base font-semibold">{x.elo_after??'—'}</div><div className={`text-xs ${Number(x.elo_delta)>0?'text-emerald-300':Number(x.elo_delta)<0?'text-red-300':'text-white/40'}`}>{deltaText(x.elo_delta)}</div></div></div>{x.elo_before!=null?<div className="mt-2 text-[11px] text-white/35">До игры: {x.elo_before} → после: {x.elo_after??'—'}</div>:null}</article>)}</div>{!loading&&eloPoints.length===0?<div className="mt-3 rounded-xl bg-white/[.035] p-5 text-center text-sm text-white/45">Истории Elo пока нет. Она появится после завершённых игр с рейтинговыми снимками.</div>:null}</section>}
      {!settings&&tab==='awards'&&<><PremiumProfileShowcase playerId={playerId} isSelf={isSelf} section="awards"/>{isSelf?<PlayerAwardSuggestionAction/>:null}</>}
      {!settings&&tab==='history'&&<PremiumProfileShowcase playerId={playerId} isSelf={isSelf} section="history"/>}
      {!settings&&tab==='connections'&&<>{isSelf?<SmartFriendInviteSuggestions/>:null}<PremiumProfileConnections playerId={playerId} selfPlayerId={selfPlayerId}/></>}
      {loading&&!settings&&<div className="py-10 text-center text-sm text-white/45">Загрузка…</div>}
    </main>
  </div>;
}
