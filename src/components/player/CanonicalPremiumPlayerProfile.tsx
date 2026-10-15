import { countGames, countWins } from '../../lib/russianPlural';
import { ChevronRight, GraduationCap } from 'lucide-react';
import { openPlayerGame } from './playerProfileNavigation.ts';
import React, { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import PlayerAwardSuggestionAction from './PlayerAwardSuggestionAction.tsx';
import PremiumProfileConnections from './PremiumProfileConnections.tsx';
import PremiumProfileShowcase from './PremiumProfileShowcase.tsx';
import PlayerProfileCareerSections from './PlayerProfileCareerSections.tsx';
import PlayerProfileStatsHero from './PlayerProfileStatsHero.tsx';
import PlayerGoMafiaLink from './PlayerGoMafiaLink.tsx';
import PlayerInsightsPanel from './PlayerInsightsPanel.tsx';
import PlayerEloJourney from './PlayerEloJourney.tsx';
import StaffWorkStats from './StaffWorkStats.tsx';
import SmartFriendInviteSuggestions from './SmartFriendInviteSuggestions.tsx';
import { PlayerProfileCompletionCard } from './PlayerProfileCompleteness.tsx';
import { ROLE_LABELS, type TournamentRole } from '../../lib/tournamentRoleValidation.ts';

type Tab = 'overview' | 'games' | 'roles' | 'elo' | 'awards' | 'history' | 'connections' | 'learning';
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
const roleLabel = (role:any) => ROLE_LABELS[String(role||'') as TournamentRole] || null;
const fmt = (v:any) => v && Number.isFinite(new Date(v).getTime()) ? new Date(v).toLocaleDateString('ru-RU', { timeZone: 'Europe/Moscow' }) : '—';
const deltaText = (value: unknown) => {
  const delta=Math.round(Number(value));
  if(!Number.isFinite(delta)) return '—';
  return `${delta>0?'+':''}${delta}`;
};
/** Elo is shown whole everywhere (the header and the rating table already round it). */
const eloText = (value: unknown) => Number.isFinite(Number(value)) && value!==null ? String(Math.round(Number(value))) : '—';
const teamLabel = (team:any) => team==='red'?'Красные':team==='black'?'Чёрные':null;
/** What the old «Мои игры» card showed: the seat, first killed, best move and the extra points of the game. */
const signedPoints=(label:string,value:any)=>Number(value)?`${label} ${Number(value)>0?'+':''}${value}`:null;
const gameChips = (g:any) => [g.seat_number>0?`№${g.seat_number} за столом`:null,g.first_killed?'ПУ':null,g.best_move?'ЛХ':null,signedPoints('судья',g.judge_bonus),signedPoints('бонус',g.protocol_bonus),signedPoints('Ci',g.ci_points),g.disciplinary_penalty_points?`штраф ${g.disciplinary_penalty_points}`:null].filter(Boolean) as string[];
/** The page of one game (`/player/games/:key`, club and tournament games alike); a click opens it inside the app and Back returns here. */
const gameLinkProps = (id:any) => {
  const key=String(id||'');
  if(!key) return null;
  return {href:`/player/games/${encodeURIComponent(key)}`,onClick:(event:React.MouseEvent)=>{event.preventDefault();openPlayerGame(key);}};
};

export default function CanonicalPremiumPlayerProfile({playerId,mode='public',selfPlayerId,onClose,ownerSettings,learning,initialTab}:{playerId:string;mode?:'self'|'public';selfPlayerId:string;onClose?:()=>void;ownerSettings?:ReactNode;/** «Обучение» tab of the own «Прогресс». */learning?:ReactNode;initialTab?:string|null}) {
  const tabs:Array<[Tab,string]>=learning?[...TABS,['learning','Обучение']]:TABS;
  const mainTabs: Array<[Tab,string]> = learning
    ? [['overview','Обзор'],['games','Карьера'],['awards','Награды'],['connections','Связи'],['learning','Обучение']]
    : [['overview','Обзор'],['games','Карьера'],['awards','Награды'],['connections','Связи']];
  const groupOf=(value:Tab):Tab=>value==='roles'||value==='elo'?'games':value==='history'?'awards':value;
  const [tab,setTab]=useState<Tab>(()=>tabs.some(([key])=>key===initialTab)?initialTab as Tab:'overview');
  const activeGroup=groupOf(tab);
  useEffect(()=>{
    const requested=tabs.some(([key])=>key===initialTab)?initialTab as Tab:'overview';
    setTab(requested);
  },[initialTab]);
  const [summary,setSummary]=useState<any>(null);
  // One scope for the overview statistics: a rating season or all time, and an evening format (owner, 2026-10-12).
  const [statPeriod,setStatPeriod]=useState('all');
  const [statFormat,setStatFormat]=useState('all');
  const statRequest=useRef(0);
  const [birthday,setBirthday]=useState<any>(null);
  const [data,setData]=useState<any>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [profileRetry,setProfileRetry]=useState(0);
  const [brokenAvatarUrl,setBrokenAvatarUrl]=useState<string|null>(null);
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
    setStatPeriod('all');
    setStatFormat('all');
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
  },[playerId,profileRetry]);
  useEffect(()=>{
    const current=summary?.filters;
    if(!current||(current.period===statPeriod&&current.format===statFormat)) return;
    const generation=++statRequest.current;
    const query=new URLSearchParams();
    if(statPeriod!=='all') query.set('period',statPeriod);
    if(statFormat!=='all') query.set('format',statFormat);
    json(`/api/player/profiles/${encodeURIComponent(playerId)}/summary${query.toString()?`?${query}`:''}`).then((next)=>{
      if(generation!==statRequest.current) return;
      // Only the numbers that depend on the scope are replaced; the rest of the page stays put.
      setSummary((previous:any)=>previous?{...previous,stats:next.stats,season:next.season,game_stats:next.game_stats,night_shots:next.night_shots,reveals:next.reveals,circle_exits:next.circle_exits,filters:next.filters,recent_games:next.recent_games}:previous);
    }).catch(()=>{
      if(generation!==statRequest.current) return;
      setStatPeriod(current.period);
      setStatFormat(current.format);
    });
  },[statPeriod,statFormat,summary?.filters?.period,summary?.filters?.format,playerId]);

  useEffect(()=>{
    if(period!=='season') return;
    const controller=new AbortController();
    json('/api/player/rating-periods',controller.signal).then(b=>setActivePeriod(b.active_periods?.[0]||null)).catch((reason:any)=>{
      if(reason?.name!=='AbortError') setActivePeriod(null);
    });
    return ()=>controller.abort();
  },[period]);

  useEffect(()=>{
    setOffset(0);
  },[role,team,result,period,from,to,activePeriod?.starts_at,activePeriod?.ends_at]);

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
    if(tab==='overview'||tab==='awards'||tab==='history'||tab==='connections'||tab==='learning'||settings||(tab==='elo'&&isSelf)) return;
    const generation=playerRequestGeneration.current;
    const controller=new AbortController();
    setData(null);
    setError('');
    setLoading(true);
    const scope=new URLSearchParams();if(statPeriod!=='all')scope.set('period',statPeriod);if(statFormat!=='all')scope.set('format',statFormat);
    const suffix=tab==='games'?`games?${gameQuery}${scope.toString()?`&${scope}`:''}`:tab==='elo'?`elo?range=all${scope.toString()?`&${scope}`:''}`:`${tab}${scope.toString()?`?${scope}`:''}`;
    json(`/api/player/profiles/${encodeURIComponent(playerId)}/${suffix}`,controller.signal).then((body)=>{
      if(generation===playerRequestGeneration.current) setData(body);
    }).catch((reason:any)=>{
      if(reason?.name==='AbortError'||generation!==playerRequestGeneration.current) return;
      setError(reason?.message||'Ошибка загрузки');
    }).finally(()=>{
      if(generation===playerRequestGeneration.current) setLoading(false);
    });
    return ()=>controller.abort();
  },[tab,playerId,gameQuery,settings,statPeriod,statFormat]);

  const switchTab=(next:Tab)=>{
    // Selecting the already visible sub-tab must not clear its fetched data.
    if(tab===next&&!settings) return;
    if(scrollRef.current) scrollByTab.current[tab]=scrollRef.current.scrollTop;
    setSettings(false);
    setError('');
    setData(null);
    setTab(next);
    requestAnimationFrame(()=>{if(scrollRef.current) scrollRef.current.scrollTop=scrollByTab.current[next]||0;});
  };

  if(error&&!summary) return <div role="alert" className="mx-auto max-w-md space-y-3 p-5 text-sm text-rose-200"><p>{error}</p><button type="button" onClick={()=>setProfileRetry((value)=>value+1)} className="min-h-11 w-full rounded-xl border border-white/15 bg-white/[0.07] px-3 font-semibold text-white">Повторить загрузку профиля</button></div>;
  const p=summary?.player||summary?.profile||{};
  const stats=summary?.stats||{};
  /* the player switched «Игровая статистика» off: the server sends no numbers, so say so instead of showing dashes */
  const statsHidden=Boolean(summary)&&!isSelf&&summary?.stats==null;
  const games=data?.games||data?.items||[];
  const total=Number(data?.total||games.length);
  const eloPoints=Array.isArray(data?.points)?data.points:Array.isArray(data?.history)?data.history:[];
  const birthdayText=birthday?.day&&birthday?.month ? `${String(birthday.day).padStart(2,'0')}.${String(birthday.month).padStart(2,'0')}${birthday.year?`.${birthday.year}`:''}` : null;

  const scopeSelector=summary?.filters&&(summary.filters.seasons.length>0||summary.filters.formats.length>1||statPeriod!=='all'||statFormat!=='all')?<section data-testid="profile-stats-scope" aria-label="Что считать в статистике" className="grid grid-cols-2 gap-2">
            <label className="text-[11px] text-white/45">Период<select aria-label="Период статистики" value={statPeriod} onChange={e=>setStatPeriod(e.target.value)} className="mobile-field mt-1 w-full text-sm"><option value="all">Вся карьера</option><option value="season">Текущий рейтинговый сезон</option><option value="recent10">Последние 10 игр</option>{summary.filters.seasons.map((item:any)=><option key={item.key} value={item.key}>{item.label} · {countGames(item.games)}</option>)}</select></label>
            <label className="text-[11px] text-white/45">Формат вечера<select aria-label="Формат вечера" value={statFormat} onChange={e=>setStatFormat(e.target.value)} className="mobile-field mt-1 w-full text-sm"><option value="all">Все форматы</option>{summary.filters.formats.map((item:any)=><option key={item.key} value={item.key}>{item.label} · {countGames(item.games)}</option>)}</select></label>
          </section>:null;
  return <div ref={scrollRef} className="canonical-profile h-full min-h-0 overflow-y-auto bg-[#090a0d] text-white" data-testid="canonical-premium-profile">
    <header className="sticky top-0 z-20 border-b border-white/10 bg-[#090a0d]/95 px-4 py-3 backdrop-blur" style={{paddingTop:'max(12px,var(--tg-content-safe-area-top))',paddingLeft:'max(16px,var(--tg-content-safe-area-left))',paddingRight:'max(16px,var(--tg-content-safe-area-right))'}}>
      <div className="profile-identity flex items-center gap-3">{onClose&&<button onClick={onClose} className="rounded-xl border border-white/10 px-3 py-2" aria-label="Назад">←</button>}{p.avatar_url&&p.avatar_url!==brokenAvatarUrl?<img src={p.avatar_url} alt="" onError={()=>setBrokenAvatarUrl(p.avatar_url)} className="h-12 w-12 shrink-0 rounded-full object-cover"/>:<div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white/10 text-lg font-semibold text-white/70" aria-hidden="true">{String(p.nickname||'?').slice(0,1).toUpperCase()}</div>}<div className="min-w-0 flex-1"><h1 className="truncate text-lg font-semibold">{p.nickname||'Профиль игрока'}</h1>{p.full_name&&<div className="truncate text-xs text-white/55">{p.full_name}</div>}{birthdayText&&<div className="text-[11px] text-white/40">День рождения: {birthdayText}</div>}</div>{isSelf&&ownerSettings&&<button onClick={()=>setSettings(v=>!v)} className="rounded-xl bg-white/10 px-3 py-2 text-xs">{settings?'Готово':'Редактировать'}</button>}</div>
    </header>
    {!settings&&<div className="sticky z-10 border-b border-white/10 bg-[#090a0d]/96 px-2 py-2" data-profile-sticky-tabs>
      {isSelf&&<p className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-[.12em] text-white/35">Прогресс</p>}
      <nav className={`mx-auto grid w-full max-w-3xl ${learning?'grid-cols-5':'grid-cols-4'} gap-1`} aria-label={isSelf?'Разделы прогресса':'Разделы профиля'}>
        {mainTabs.map(([key,label])=><button key={key} type="button" data-track={`profile-group-${key}`}
          aria-current={activeGroup===key?'page':undefined} onClick={()=>switchTab(key)}
          className={`min-h-11 min-w-0 rounded-xl px-0.5 text-center text-[10px] font-semibold sm:text-xs ${activeGroup===key?'bg-white text-black':'bg-white/[.07] text-white/75 hover:bg-white/[.11]'}`}>{label}</button>)}
      </nav>
      {(activeGroup==='games'||activeGroup==='awards')&&<nav className="mt-2 flex gap-1.5" aria-label={activeGroup==='games'?'Разделы карьеры':'Разделы наград'}>
        {(activeGroup==='games'?[['games','Игры'],['roles','Роли'],['elo','Elo']]:[['awards','Витрина'],['history','История клуба']]).map(([key,label])=>
          <button key={key} type="button" data-track={`profile-tab-${key}`}
            aria-current={tab===key?'page':undefined} onClick={()=>switchTab(key as Tab)}
            className={`min-h-11 rounded-lg px-3 text-xs font-medium ${tab===key?'bg-amber-200/15 text-amber-100 ring-1 ring-amber-200/25':'bg-white/[.045] text-white/65'}`}>{label}</button>)}
      </nav>}
    </div>}
    <main className="profile-content mx-auto w-full max-w-5xl space-y-4 p-4 pb-[calc(var(--app-content-bottom)+24px)] lg:px-8">
      {settings&&<>{ownerSettings}</>}
      {!settings&&tab==='overview'&&<div className="profile-overview space-y-4">
        {isSelf&&<PlayerProfileCompletionCard/>}
        {statsHidden?<section data-testid="profile-stats-hidden" className="rounded-2xl border border-white/10 bg-white/[.04] p-4 text-sm text-white/60">Игрок скрыл игровую статистику: игры, роли и Elo недоступны.</section>
        :<>
          {scopeSelector}
          <PlayerProfileStatsHero games={stats.games??stats.completed_games??null} wins={stats.wins??null} winRate={stats.win_rate??null} elo={p.elo!=null?eloText(p.elo):stats.elo!=null?eloText(stats.elo):'—'} seasonPlace={summary?.season?.place??null} />
          {summary?.filters?<p data-testid="profile-stats-scope-note" className="-mt-2 text-[11px] leading-4 text-white/40">Статистика за: {summary.filters.period_label} · {summary.filters.format_label} · {countWins(stats.wins??0)} из {stats.games??0} игр. Elo — общий рейтинг, а место — по победам текущего сезона.</p>:null}
        </>}
        <PlayerGoMafiaLink playerId={playerId} isSelf={isSelf} />
         {isSelf&&<button type="button" onClick={()=>switchTab('learning')} data-testid="profile-learning-shortcut" className="flex min-h-[66px] items-center gap-3 rounded-2xl border border-amber-200/20 bg-amber-200/[.065] px-4 text-left">
           <GraduationCap className="h-5 w-5 shrink-0 text-amber-200/80" />
           <span className="min-w-0 flex-1"><strong className="block text-sm font-semibold text-white">Обучение</strong><span className="mt-1 block text-xs text-white/55">Уроки, правила и тренажёры</span></span>
           <ChevronRight className="h-4 w-4 shrink-0 text-white/50"/>
         </button>}
        {/* The chart and totals above answer «how am I doing»; the detailed block below is open by default (owner, 2026-10-12, reversing the 2026-10-06 «less scrolling» collapse) and can still be folded. */}
        {!statsHidden&&<details open data-testid="profile-more-stats" className="group rounded-2xl border border-white/10 bg-white/[.02]"><summary className="flex min-h-12 cursor-pointer list-none items-center justify-between px-4 text-sm font-semibold">Подробная статистика<span className="text-white/35 transition group-open:rotate-180">⌄</span></summary><div className="space-y-4 px-3 pb-3"><PlayerProfileCareerSections stats={summary?.stats} season={summary?.season} gameStats={summary?.game_stats} nightShots={summary?.night_shots} reveals={summary?.reveals} circleExits={summary?.circle_exits}/></div></details>}
        <PremiumProfileShowcase playerId={playerId} isSelf={isSelf} section="pinned"/>
        <StaffWorkStats stats={summary?.staff} testId="profile-staff-stats" />
        {(summary?.recent_games||[]).length>0&&<section aria-label="Последние игры" className="space-y-3"><div className="flex items-end justify-between gap-3"><div><div className="text-[10px] font-semibold uppercase tracking-[.15em] text-amber-100/50">Мои матчи</div><h2 className="mt-1 text-lg font-semibold">Последние игры</h2></div><button type="button" onClick={()=>switchTab('games')} className="min-h-10 rounded-xl border border-white/10 px-3 text-xs font-semibold text-white/70">Все игры ›</button></div><div className="grid gap-3 sm:grid-cols-2">{summary.recent_games.slice(0,4).map((g:any)=>{const link=gameLinkProps(g.id||g.game_id);const Row:any=link?'a':'div';const won=g.won===true;const lost=g.won===false;return <Row key={g.id||g.game_id} {...(link||{})} className={`relative flex min-h-[105px] flex-col justify-between overflow-hidden rounded-[22px] border p-4 ${won?'border-emerald-200/15 bg-gradient-to-br from-emerald-950/30 to-[#101318]':lost?'border-rose-200/15 bg-gradient-to-br from-rose-950/25 to-[#101318]':'border-white/10 bg-white/[.035]'}`}><div className="flex justify-between gap-3"><span className="min-w-0 truncate text-sm font-semibold">{g.title||'Игра'}{g.game_number?` · №${g.game_number}`:''}</span><span className="shrink-0 text-[11px] text-white/45">{fmt(g.played_at||g.date)}</span></div><div className="mt-3 flex items-end justify-between gap-2"><div className="min-w-0"><span className={`text-xs font-bold uppercase tracking-[.1em] ${won?'text-emerald-200':lost?'text-rose-200':'text-white/60'}`}>{won?'Победа':lost?'Поражение':'Результат не указан'}</span><div className="mt-1 text-[11px] text-white/55">{[roleLabel(g.role),teamLabel(g.team)].filter(Boolean).join(' · ')||'Роль не указана'}</div></div>{link&&<span aria-hidden="true" className="text-lg text-white/40">↗</span>}</div></Row>})}</div></section>}
        <button onClick={()=>switchTab('connections')} className="flex min-h-12 w-full items-center justify-between rounded-2xl border border-white/10 bg-white/[.04] px-4 text-left text-sm font-semibold">Связи и приглашения<span className="text-white/35">›</span></button>
      </div>}
      {!settings&&tab==='games'&&<>
        {scopeSelector}
        <div className="flex flex-wrap gap-2">{(['all','custom'] as const).map(k=><button key={k} onClick={()=>setPeriod(k)} className={`rounded-full px-3 py-2 text-xs ${period===k?'bg-white text-black':'bg-white/10'}`}>{k==='all'?'Любые даты':'Диапазон дат'}</button>)}</div>
        {period==='season'&&<div className="text-xs text-white/45">{activePeriod?.title||'Активный сезон не задан'}</div>}
        {period==='custom'&&<div className="grid grid-cols-2 gap-2"><input type="date" value={from} onChange={e=>setFrom(e.target.value)} className="rounded-xl bg-white/10 p-3"/><input type="date" value={to} onChange={e=>setTo(e.target.value)} className="rounded-xl bg-white/10 p-3"/></div>}
        <details className="rounded-2xl border border-white/10 p-3"><summary className="cursor-pointer text-sm">Дополнительные фильтры</summary><div className="mt-3 grid gap-2 sm:grid-cols-3">
          <label className="text-xs text-white/50">Роль<select aria-label="Роль" value={role} onChange={e=>setRole(e.target.value)} className="mobile-field mt-1 w-full text-sm">{ROLE_OPTIONS.map(([value,label])=><option key={value||'all'} value={value}>{label}</option>)}</select></label>
          <label className="text-xs text-white/50">Команда<select aria-label="Команда" value={team} onChange={e=>setTeam(e.target.value)} className="mobile-field mt-1 w-full text-sm">{TEAM_OPTIONS.map(([value,label])=><option key={value||'all'} value={value}>{label}</option>)}</select></label>
          <label className="text-xs text-white/50">Результат<select aria-label="Результат" value={result} onChange={e=>setResult(e.target.value)} className="mobile-field mt-1 w-full text-sm">{RESULT_OPTIONS.map(([value,label])=><option key={value||'all'} value={value}>{label}</option>)}</select></label>
        </div></details>
        {error?<div className="rounded-xl border border-red-400/20 bg-red-400/10 p-3 text-sm text-red-200">{error}</div>:null}
        <div className="profile-game-list grid gap-3 md:grid-cols-2">{games.map((g:any)=>{const link=gameLinkProps(g.id||g.game_id);const meta=[roleLabel(g.role),teamLabel(g.team)].filter(Boolean).join(' · ');return <article key={g.id||g.game_id} className={`relative overflow-hidden rounded-[22px] border p-4 ${g.won===true?'border-emerald-300/15 bg-gradient-to-r from-emerald-950/25 via-[#11171a] to-[#111216]':g.won===false?'border-rose-300/15 bg-gradient-to-r from-rose-950/25 via-[#191115] to-[#111216]':'border-white/10 bg-white/[.03]'}`}><div className="flex justify-between gap-3"><b className="min-w-0 truncate">{g.title||'Игра'}{g.game_number?` · №${g.game_number}`:''}</b><span className="shrink-0 text-xs text-white/50">{fmt(g.played_at||g.date)}</span></div><div className="mt-2 flex items-center justify-between gap-3 text-xs text-white/60"><span className="min-w-0">{[meta,g.won===true?'победа':g.won===false?'поражение':null].filter(Boolean).join(' · ')}</span>{g.elo_delta!=null&&<span className={`shrink-0 font-semibold ${Number(g.elo_delta)>0?'text-emerald-300':Number(g.elo_delta)<0?'text-red-300':'text-white/40'}`}>Elo {deltaText(g.elo_delta)}</span>}</div>{gameChips(g).length>0&&<div className="mt-2 flex flex-wrap gap-1.5">{gameChips(g).map((chip)=><span key={chip} className="rounded-full bg-white/[.07] px-2 py-1 text-[11px] text-white/60">{chip}</span>)}</div>}{(g.table_name||g.judge_name)&&<div className="mt-2 text-[11px] text-white/35">{[g.table_name,g.judge_name?`судья ${g.judge_name}`:null].filter(Boolean).join(' · ')}</div>}{link&&<a {...link} className="mt-2 inline-flex min-h-11 items-center rounded-lg px-2 text-xs font-semibold text-sky-200/70 hover:bg-white/5">Открыть игру ›</a>}</article>})}</div>
        {!loading&&games.length===0?<div className="rounded-2xl border border-white/10 p-5 text-center text-sm text-white/45">По выбранным фильтрам игр нет.</div>:null}
        {total>15&&<div className="flex justify-between"><button disabled={offset===0} onClick={()=>setOffset(Math.max(0,offset-15))} className="rounded-xl bg-white/10 px-4 py-2 text-sm disabled:opacity-30">Назад</button><button disabled={offset+15>=total} onClick={()=>setOffset(offset+15)} className="rounded-xl bg-white/10 px-4 py-2 text-sm disabled:opacity-30">Дальше</button></div>}
      </>}
      {!settings&&(tab==='roles'||(tab==='elo'&&!isSelf))&&error?<div className="rounded-xl border border-white/10 bg-white/[.04] p-4 text-sm text-white/60">{error}</div>:null}
      {!settings&&tab==='roles'&&scopeSelector}
      {!settings&&tab==='roles'&&!error&&<section className="profile-role-list grid gap-3 sm:grid-cols-2" aria-label="Ролевая статистика">{(data?.roles||data?.items||[]).map((r:any)=>{const played=Number(r.games??r.total??0);const rate=played?Math.max(0,Math.min(100,Number(r.win_rate)||0)):0;const dark=r.role==='mafia'||r.role==='don';return <article key={r.role} className={`relative overflow-hidden rounded-[24px] border p-4 ${dark?'border-violet-300/15 bg-gradient-to-br from-violet-950/35 via-[#14111b] to-[#111216]':'border-rose-300/15 bg-gradient-to-br from-rose-950/25 via-[#171218] to-[#111216]'}`}><div className="flex items-center justify-between gap-3"><div><p className="text-[10px] uppercase tracking-[.15em] text-white/45">{dark?'Чёрная команда':'Красная команда'}</p><h3 className="mt-1 text-lg font-semibold">{r.label||r.role}</h3></div><span aria-hidden="true" className={`flex h-12 w-12 items-center justify-center rounded-2xl border text-2xl ${dark?'border-violet-300/20 bg-violet-300/10':'border-rose-300/20 bg-rose-300/10'}`}>{r.role==='sheriff'?'✦':r.role==='don'?'♛':r.role==='mafia'?'♠':'◆'}</span></div><div className="mt-4 flex items-baseline justify-between gap-2"><div className="text-3xl font-semibold tabular-nums">{played?`${rate}%`:'—'}<span className="ml-2 text-[11px] font-normal text-white/45">побед</span></div><span className="text-xs text-white/55">{played?countGames(played):'Нет игр'}</span></div><div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10" role="img" aria-label={`${r.label||r.role}: ${rate}% побед`}><div className={`h-full rounded-full ${dark?'bg-violet-300':'bg-rose-300'}`} style={{width:`${rate}%`}} /></div></article>})}</section>}
      {!settings&&tab==='elo'&&isSelf&&<>{scopeSelector}<PlayerEloJourney embedded period={statPeriod} format={statFormat}/></>}
      {!settings&&tab==='elo'&&!isSelf&&scopeSelector}
      {!settings&&tab==='elo'&&!isSelf&&!error&&<section className="rounded-2xl border border-white/10 p-4"><h2 className="font-semibold">История Elo</h2><div className="mt-3 space-y-2">{eloPoints.map((x:any,i:number)=><article key={x.id||i} className="rounded-xl bg-white/[.035] p-3"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="truncate text-sm font-medium">{x.title||'Игра'}{x.game_number?` · #${x.game_number}`:''}</div><div className="mt-1 text-xs text-white/45">{fmt(x.date||x.played_at)}{roleLabel(x.role)?` · ${roleLabel(x.role)}`:''}{gameLinkProps(x.id)?<> · <a {...gameLinkProps(x.id)!} className="text-sky-200/70">игра ›</a></>:null}</div></div><div className="shrink-0 text-right"><div className="text-base font-semibold">{eloText(x.elo_after)}</div><div className={`text-xs ${Number(x.elo_delta)>0?'text-emerald-300':Number(x.elo_delta)<0?'text-red-300':'text-white/40'}`}>{deltaText(x.elo_delta)}</div></div></div></article>)}</div>{!loading&&eloPoints.length===0?<div className="mt-3 rounded-xl bg-white/[.035] p-5 text-center text-sm text-white/45">Истории Elo пока нет. Она появится после первых игр, которые идут в рейтинг.</div>:null}</section>}
      {!settings&&tab==='learning'&&learning}
      {!settings&&tab==='awards'&&<><PremiumProfileShowcase playerId={playerId} isSelf={isSelf} section="awards"/>{isSelf?<PlayerAwardSuggestionAction/>:null}</>}
      {!settings&&tab==='history'&&<PremiumProfileShowcase playerId={playerId} isSelf={isSelf} section="history"/>}
      {!settings&&tab==='connections'&&<>{isSelf?<SmartFriendInviteSuggestions/>:null}{isSelf?<PlayerInsightsPanel/>:null}<PremiumProfileConnections playerId={playerId} selfPlayerId={selfPlayerId}/></>}
      {loading&&!settings&&<div className="py-10 text-center text-sm text-white/45">Загрузка…</div>}
    </main>
  </div>;
}
