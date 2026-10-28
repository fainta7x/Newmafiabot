import { readProfileView, writeProfileView } from '../../lib/profileViewMemory.ts';
import { countGames } from '../../lib/russianPlural';
import { openPlayerGame } from './playerProfileNavigation.ts';
import React, { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import PlayerAwardSuggestionAction from './PlayerAwardSuggestionAction.tsx';
import PremiumProfileConnections from './PremiumProfileConnections.tsx';
import PremiumProfileShowcase from './PremiumProfileShowcase.tsx';
import PlayerProfileCareerSections from './PlayerProfileCareerSections.tsx';
import PlayerProfileStatsHero from './PlayerProfileStatsHero.tsx';
import { RoleMark } from './PlayerGameGraphics.tsx';
import PlayerGoMafiaLink from './PlayerGoMafiaLink.tsx';
import PlayerInsightsPanel from './PlayerInsightsPanel.tsx';
import PlayerRoleResults from './PlayerRoleResults.tsx';
import PlayerEloJourney from './PlayerEloJourney.tsx';
import StaffWorkStats from './StaffWorkStats.tsx';
import { PlayerProfileCompletionCard } from './PlayerProfileCompleteness.tsx';
import { GAME_ROLES, GAME_ROLE_KEYS } from '../../shared/gameRoles.ts';
import { getPlayerGameRoleLabel } from '../../lib/playerGameRoleLabels.ts';
import { FitText } from '../ui/FitText.tsx';

type Tab = 'overview' | 'games' | 'roles' | 'elo' | 'awards' | 'history' | 'connections' | 'learning';
type Period = { starts_at?: string; ends_at?: string; title?: string };
const TABS: Array<[Tab,string]> = [['overview','Обзор'],['games','Игры'],['roles','Роли'],['elo','Elo'],['awards','Награды'],['history','История игрока'],['connections','Связи']];
const ROLE_OPTIONS: Array<readonly [string, string]> = [['', 'Все роли'], ...GAME_ROLE_KEYS.map(key => [key, GAME_ROLES[key].label] as const)];
const TEAM_OPTIONS = [['','Все команды'],['red','Красные'],['black','Чёрные']] as const;
const RESULT_OPTIONS = [['','Любой результат'],['win','Победа'],['loss','Поражение']] as const;
const json = async (url:string, signal?:AbortSignal) => {
  const r=await fetch(url,{credentials:'include',signal});
  const b=await r.json().catch(()=>({}));
  if(!r.ok) throw new Error(b.error||'Ошибка загрузки');
  return b;
};
const roleLabel = (role:any) => getPlayerGameRoleLabel(role);
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
const gameChips = (g:any) => [g.seat_number>0?`№${g.seat_number} за столом`:null,g.first_killed?'ПУ':null,g.best_move?'ЛХ':null,signedPoints('Доп судьи',g.judge_bonus),signedPoints('Протокольный доп',g.protocol_bonus),signedPoints('Ci',g.ci_points),g.disciplinary_penalty_points?`штраф ${g.disciplinary_penalty_points}`:null].filter(Boolean) as string[];
/** The page of one game (`/player/games/:key`, club and tournament games alike); a click opens it inside the app and Back returns here. */
const gameLinkProps = (id:any) => {
  const key=String(id||'');
  if(!key) return null;
  return {href:`/player/games/${encodeURIComponent(key)}`,onClick:(event:React.MouseEvent)=>{event.preventDefault();openPlayerGame(key);}};
};

export default function CanonicalPremiumPlayerProfile({playerId,mode='public',selfPlayerId,onClose,ownerSettings,learning,initialTab,onTabChange}:{playerId:string;mode?:'self'|'public';selfPlayerId:string;onClose?:()=>void;ownerSettings?:ReactNode;/** «Обучение» tab of the own «Прогресс». */learning?:ReactNode;initialTab?:string|null;onTabChange?:(tab:string)=>void}) {
  const remembered=useMemo(()=>readProfileView(selfPlayerId,playerId),[selfPlayerId,playerId]);
  const [summaryRetry,setSummaryRetry]=useState(0);
  const [contentRetry,setContentRetry]=useState(0);
  const [scopeError,setScopeError]=useState('');
  const [scopeLoading,setScopeLoading]=useState(false);
  const failedScope=useRef<{period:string;format:string}|null>(null);
  const tabs:Array<[Tab,string]>=learning?[...TABS,['learning','Обучение']]:TABS;
  const mainTabs: Array<[Tab,string]> = learning
    ? [['overview','Обзор'],['games','Карьера'],['awards','Награды'],['connections','Связи'],['learning','Обучение']]
    : [['overview','Обзор'],['games','Карьера'],['awards','Награды'],['connections','Связи']];
  const groupOf=(value:Tab):Tab=>value==='roles'||value==='elo'?'games':value==='history'?'awards':value;
  const [tab,setTab]=useState<Tab>(()=>tabs.some(([key])=>key===initialTab)?initialTab as Tab:tabs.some(([key])=>key===remembered.tab)?remembered.tab as Tab:'overview');
  const activeGroup=groupOf(tab);
  const groupTabs=useRef({career:['games','roles','elo'].includes(remembered.groupTabs?.career||'')?remembered.groupTabs!.career as Tab:'games' as Tab,awards:remembered.groupTabs?.awards==='history'?'history' as Tab:'awards' as Tab});
  useEffect(()=>{
    if(['games','roles','elo'].includes(tab)) groupTabs.current.career=tab;
    if(tab==='awards'||tab==='history') groupTabs.current.awards=tab;
  },[tab]);
  useEffect(()=>{
    const requested=tabs.some(([key])=>key===initialTab)?initialTab as Tab:tabs.some(([key])=>key===remembered.tab)?remembered.tab as Tab:'overview';
    setTab(requested);
  },[initialTab]);
  const [summary,setSummary]=useState<any>(null);
  // One scope for the overview statistics: a rating season or all time, and an evening format (owner, 2026-10-12).
  const [statPeriod,setStatPeriod]=useState(remembered.statPeriod||'all');
  const [statFormat,setStatFormat]=useState(remembered.statFormat||'all');
  const statRequest=useRef(0);
  const [birthday,setBirthday]=useState<any>(null);
  const [data,setData]=useState<any>(null);
  const [contentLoading,setLoading]=useState(false);
  const [summaryLoading,setSummaryLoading]=useState(true);
  const [error,setError]=useState('');
  const [brokenAvatarUrl,setBrokenAvatarUrl]=useState<string|null>(null);
  const [settings,setSettings]=useState(false);
  const [period,setPeriod]=useState<'all'|'season'|'custom'>(()=>remembered.period||'all');
  const [activePeriod,setActivePeriod]=useState<Period|null>(null);
  const [from,setFrom]=useState(()=>remembered.from||'');
  const [to,setTo]=useState(()=>remembered.to||'');
  const [role,setRole]=useState(()=>remembered.role||'');
  const [team,setTeam]=useState(()=>remembered.team||'');
  const [result,setResult]=useState(()=>remembered.result||'');
  const [offset,setOffset]=useState(remembered.offset||0);
  const scrollRef=useRef<HTMLElement>(null);
  const scrollByTab=useRef<Record<string,number>>(remembered.scrolls||{});
  const latestView=useRef({});
  latestView.current={tab,period,from,to,role,team,result,statPeriod,statFormat,offset,groupTabs:groupTabs.current};
  useEffect(()=>{
    const save=()=>{
      const view=latestView.current as {tab?:string};
      if(scrollRef.current&&view.tab) scrollByTab.current[view.tab]=scrollRef.current.scrollTop;
      writeProfileView(selfPlayerId,playerId,{...latestView.current,scrolls:scrollByTab.current});
    };
    window.addEventListener('pagehide',save);
    return ()=>{save();window.removeEventListener('pagehide',save);};
  },[playerId,selfPlayerId]);
  const restoreScroll=useRef(true);
  const playerRequestGeneration=useRef(0);
  const isSelf=mode==='self';
  const loading=summaryLoading||(['games','roles','elo'].includes(tab)&&!(tab==='elo'&&isSelf)&&contentLoading);

  useEffect(()=>{
    const generation=++playerRequestGeneration.current;
    const controller=new AbortController();
    restoreScroll.current=true;
    setSummary(null);
    const view=readProfileView(selfPlayerId,playerId);
    statRequest.current+=1;
    setStatPeriod(view.statPeriod||'all'); setStatFormat(view.statFormat||'all');
    setPeriod(view.period||'all'); setFrom(view.from||''); setTo(view.to||'');
    setRole(view.role||''); setTeam(view.team||''); setResult(view.result||'');
    setScopeError(''); setScopeLoading(false);
    setBirthday(null);
    setData(null);
    setError('');
    setSummaryLoading(true);
    setSettings(false);
    setOffset(view.offset||0);
    scrollByTab.current=view.scrolls||{};
    if(scrollRef.current) scrollRef.current.scrollTop=0;
    const savedScope=new URLSearchParams();
    if(view.statPeriod&&view.statPeriod!=='all') savedScope.set('period',view.statPeriod);
    if(view.statFormat&&view.statFormat!=='all') savedScope.set('format',view.statFormat);
    Promise.all([
      json(`/api/player/profiles/${encodeURIComponent(playerId)}/summary${savedScope.size?`?${savedScope}`:''}`,controller.signal),
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
      if(generation===playerRequestGeneration.current) setSummaryLoading(false);
    });
    return ()=>controller.abort();
  },[playerId,summaryRetry]);
  useEffect(()=>{
    const current=summary?.filters;
    if(!current||(current.period===statPeriod&&current.format===statFormat)) return;
    const generation=++statRequest.current;
    const controller=new AbortController();
    setScopeLoading(true); setScopeError('');
    const query=new URLSearchParams();
    if(statPeriod!=='all') query.set('period',statPeriod);
    if(statFormat!=='all') query.set('format',statFormat);
    json(`/api/player/profiles/${encodeURIComponent(playerId)}/summary${query.toString()?`?${query}`:''}`,controller.signal).then((next)=>{
      if(generation!==statRequest.current) return;
      // Only the numbers that depend on the scope are replaced; the rest of the page stays put.
      setSummary((previous:any)=>previous?{...previous,stats:next.stats,season:next.season,game_stats:next.game_stats,night_shots:next.night_shots,reveals:next.reveals,circle_exits:next.circle_exits,filters:next.filters,recent_games:next.recent_games}:previous);
    }).catch((reason)=>{
      if(reason?.name==='AbortError'||generation!==statRequest.current) return;
      failedScope.current={period:statPeriod,format:statFormat};
      setScopeError('Не удалось обновить статистику. Сохранён предыдущий срез.');
      setStatPeriod(current.period);
      setStatFormat(current.format);
    }).finally(()=>{if(generation===statRequest.current)setScopeLoading(false);});
    return ()=>controller.abort();
  },[statPeriod,statFormat,summary?.filters?.period,summary?.filters?.format,playerId]);

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



  useEffect(()=>{
    if(tab==='overview'||tab==='awards'||tab==='history'||tab==='connections'||tab==='learning'||settings||(tab==='elo'&&isSelf)) return;
    if(!summary||(!isSelf&&summary.stats==null)) return;
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
      if(!controller.signal.aborted&&generation===playerRequestGeneration.current) setLoading(false);
    });
    return ()=>controller.abort();
  },[tab,playerId,gameQuery,settings,statPeriod,statFormat,contentRetry,summaryRetry,Boolean(summary),summary?.stats===null]);

  useEffect(()=>{
    if(!restoreScroll.current||loading||!summary) return;
    if((tab==='games'||tab==='roles'||(tab==='elo'&&!isSelf))&&!data&&!error) return;
    const frame=requestAnimationFrame(()=>{if(scrollRef.current)scrollRef.current.scrollTop=scrollByTab.current[tab]||0;restoreScroll.current=false;});
    return ()=>cancelAnimationFrame(frame);
  },[tab,loading,summary,data,error]);

  const switchTab=(next:Tab)=>{
    // Selecting the already visible sub-tab must not clear its fetched data.
    if(tab===next&&!settings) return;
    if(scrollRef.current) scrollByTab.current[tab]=scrollRef.current.scrollTop;
    setSettings(false);
    setError('');
    setData(null);
    restoreScroll.current=true;
    setTab(next);
    if(isSelf) onTabChange?.(next);

  };

  if(error&&!summary) return <div role="alert" className="space-y-3 p-5 text-sm text-rose-200"><p>{error}</p><button type="button" onClick={()=>setSummaryRetry(v=>v+1)} className="min-h-11 rounded-xl border border-white/15 px-4">Повторить загрузку профиля</button></div>;
  const p=summary?.player||summary?.profile||{};
  const stats=summary?.stats||{};
  /* the player switched «Игровая статистика» off: the server sends no numbers, so say so instead of showing dashes */
  const statsHidden=Boolean(summary)&&!isSelf&&summary?.stats==null;
  const games=data?.games||data?.items||[];
  const total=Number(data?.total||games.length);
  const gameConstraints = [
    role && ROLE_OPTIONS.find(([value]) => value === role)?.[1],
    team && TEAM_OPTIONS.find(([value]) => value === team)?.[1],
    result && RESULT_OPTIONS.find(([value]) => value === result)?.[1],
    period === 'custom' && (from || to) && `${from ? `с ${fmt(from)}` : ''}${from && to ? ' ' : ''}${to ? `по ${fmt(to)}` : ''}`,
    period === 'season' && (activePeriod?.title || 'Текущий сезон'),
    statPeriod !== 'all' && (summary?.filters?.period_label || 'Выбранный период статистики'),
    statFormat !== 'all' && (summary?.filters?.format_label || 'Выбранный формат'),
  ].filter(Boolean);
  const resetGameSearch = () => { setPeriod('all'); setFrom(''); setTo(''); setRole(''); setTeam(''); setResult(''); setStatPeriod('all'); setStatFormat('all'); setOffset(0); };

  const eloPoints=Array.isArray(data?.points)?data.points:Array.isArray(data?.history)?data.history:[];
  const birthdayText=birthday?.day&&birthday?.month ? `${String(birthday.day).padStart(2,'0')}.${String(birthday.month).padStart(2,'0')}${birthday.year?`.${birthday.year}`:''}` : null;

  const scopeSelector=summary?.filters&&(summary.filters.seasons.length>0||summary.filters.formats.length>1||statPeriod!=='all'||statFormat!=='all')?<section data-testid="profile-stats-scope" aria-label="Что считать в статистике" className="grid grid-cols-2 gap-2">
            <label className="text-[11px] text-white/45">Период<select aria-label="Период статистики" value={statPeriod} onChange={e=>{setOffset(0);setStatPeriod(e.target.value);}} className="mobile-field mt-1 w-full text-sm"><option value="all">Вся карьера</option><option value="season">Текущий рейтинговый сезон</option><option value="recent10">Последние 10 игр</option>{summary.filters.seasons.map((item:any)=><option key={item.key} value={item.key}>{item.label} · {countGames(item.games)}</option>)}</select></label>
            <label className="text-[11px] text-white/45">Формат вечера<select aria-label="Формат вечера" value={statFormat} onChange={e=>{setOffset(0);setStatFormat(e.target.value);}} className="mobile-field mt-1 w-full text-sm"><option value="all">Все форматы</option>{summary.filters.formats.map((item:any)=><option key={item.key} value={item.key}>{item.label} · {countGames(item.games)}</option>)}</select></label>
            {scopeLoading&&<p role="status" className="col-span-2 text-xs text-white/60">Обновляем статистику… До завершения показан предыдущий срез.</p>}
            {scopeError&&<div role="alert" className="col-span-2 text-xs text-rose-200"><p>{scopeError}</p><button type="button" className="mt-1 min-h-11 rounded-lg px-2 font-semibold" onClick={()=>{if(failedScope.current){setStatPeriod(failedScope.current.period);setStatFormat(failedScope.current.format);}}}>Повторить обновление</button></div>}
          </section>:null;
  const recentGames=((summary?.recent_games||[]).length>0&&<section aria-label="Последние игры" className="overflow-hidden rounded-3xl border border-white/10 bg-white/[.035]"><header className="flex items-center justify-between gap-3 px-4 pt-2"><h2 className="text-sm font-semibold">Последние игры</h2><button type="button" onClick={()=>switchTab('games')} className="min-h-11 rounded-lg px-2 text-xs font-semibold text-white/70">Все игры ›</button></header><div className="divide-y divide-white/[.07]">{summary.recent_games.slice(0,4).map((g:any)=>{const link=gameLinkProps(g.id||g.game_id);const Row:any=link?'a':'div';return <Row key={g.id||g.game_id} {...(link||{})} className="ds-focus-ring flex min-h-11 items-center gap-3 px-4 py-3"><span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{g.title||'Игра'}{g.game_number?` · №${g.game_number}`:''}</span><span className="mt-1 block text-xs leading-5 text-white/60">{[fmt(g.played_at||g.date),roleLabel(g.role),teamLabel(g.team),g.won===true?'Победа':g.won===false?'Поражение':'Результат не указан'].filter(Boolean).join(' · ')}</span></span>{link&&<span aria-hidden="true" className="text-lg text-white/45">›</span>}</Row>})}</div></section>);
  const detailedStats=(<details open data-testid="profile-more-stats" className="group mt-4 border-t border-white/10"><summary className="flex min-h-12 cursor-pointer list-none items-center justify-between text-sm font-semibold">Подробная статистика<span className="text-white/45 transition group-open:rotate-180">⌄</span></summary><div className="space-y-4 pb-1"><PlayerProfileCareerSections stats={summary?.stats} season={summary?.season} gameStats={summary?.game_stats} nightShots={summary?.night_shots} reveals={summary?.reveals} circleExits={summary?.circle_exits}/></div></details>);
  return <div className="canonical-profile flex h-[var(--tg-viewport-height,100dvh)] min-h-0 flex-col overflow-visible bg-[#090a0d] text-white" data-testid="canonical-premium-profile">
    <header className="relative z-20 shrink-0 border-b border-white/10 bg-[#090a0d]/95 px-4 py-3 backdrop-blur" style={{paddingTop:'max(12px,var(--tg-content-safe-area-top))',paddingLeft:'max(16px,var(--tg-content-safe-area-left))',paddingRight:'max(16px,var(--tg-content-safe-area-right))'}}>
      <div className="profile-identity flex items-center gap-3">{onClose&&<button onClick={onClose} className="rounded-xl border border-white/10 px-3 py-2" aria-label="Назад">←</button>}{p.avatar_url&&p.avatar_url!==brokenAvatarUrl?<img src={p.avatar_url} alt="" onError={()=>setBrokenAvatarUrl(p.avatar_url)} className="h-12 w-12 shrink-0 rounded-full object-cover"/>:<div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white/10 text-lg font-semibold text-white/70" aria-hidden="true">{String(p.nickname||'?').slice(0,1).toUpperCase()}</div>}<div className="min-w-0 flex-1"><FitText as="div" minPx={13} className="text-lg font-semibold" role="heading" aria-level={1}>{p.nickname||'Профиль игрока'}</FitText>{p.full_name&&<FitText as="div" minPx={10} className="text-xs text-white/55">{p.full_name}</FitText>}{birthdayText&&<div className="text-[11px] text-white/40">День рождения: {birthdayText}</div>}</div>{isSelf&&ownerSettings&&<button onClick={()=>setSettings(v=>!v)} className="rounded-xl bg-white/10 px-3 py-2 text-xs">{settings?'Готово':'Редактировать'}</button>}</div>
    </header>
    {!settings&&<div className="static z-10 shrink-0 border-b border-white/10 bg-[#090a0d]/96 px-2 py-2" data-profile-sticky-tabs>
      {isSelf&&<p className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-[.12em] text-white/35">Прогресс</p>}
      <nav className={`mx-auto grid w-full max-w-3xl ${learning?'grid-cols-5':'grid-cols-4'} gap-1`} aria-label={isSelf?'Разделы прогресса':'Разделы профиля'}>
        {mainTabs.map(([key,label])=><button key={key} type="button" data-track={`profile-group-${key}`}
          aria-current={activeGroup===key?'page':undefined} onClick={()=>switchTab(key==='games'?groupTabs.current.career:key==='awards'?groupTabs.current.awards:key)}
          className={`min-h-11 min-w-0 rounded-xl px-0.5 text-center text-[10px] font-semibold sm:text-xs ${activeGroup===key?'bg-white text-black':'bg-white/[.07] text-white/75 hover:bg-white/[.11]'}`}>{label}</button>)}
      </nav>
      {(activeGroup==='games'||activeGroup==='awards')&&<nav className="mt-2 flex gap-1.5" aria-label={activeGroup==='games'?'Разделы карьеры':'Разделы наград'}>
        {(activeGroup==='games'?[['games','Игры'],['roles','Роли'],['elo','Elo']]:[['awards','Витрина'],['history',isSelf?'Моя история':'История игрока']]).map(([key,label])=>
          <button key={key} type="button" data-track={`profile-tab-${key}`}
            aria-current={tab===key?'page':undefined} onClick={()=>switchTab(key as Tab)}
            className={`min-h-11 rounded-lg px-3 text-xs font-medium ${tab===key?'bg-amber-200/15 text-amber-100 ring-1 ring-amber-200/25':'bg-white/[.045] text-white/65'}`}>{label}</button>)}
      </nav>}
    </div>}
    <main ref={scrollRef} className="profile-content mx-auto min-h-0 w-full max-w-5xl flex-1 space-y-4 overflow-y-auto overscroll-contain p-4 pb-[calc(var(--app-content-bottom)+24px)] lg:px-8">
      {settings&&<>{ownerSettings}</>}
      {!settings&&tab==='overview'&&<div className="profile-overview space-y-4">
        {isSelf&&<PlayerProfileCompletionCard compact/>}
        {statsHidden?<section data-testid="profile-stats-hidden" className="rounded-2xl border border-white/10 bg-white/[.04] p-4 text-sm text-white/60">Игрок скрыл игровую статистику: игры, роли и Elo недоступны.</section>
        :<section data-testid="profile-club-summary" className="rounded-3xl border border-white/10 bg-white/[.035] p-4">
          {scopeSelector}
          <PlayerProfileStatsHero games={stats.games??stats.completed_games??null} wins={stats.wins??null} winRate={stats.win_rate??null} elo={p.elo!=null?eloText(p.elo):stats.elo!=null?eloText(stats.elo):'—'} seasonPlace={summary?.season?.place??null} seasonLabel={summary?.season?.label} scopeLabel={summary?.filters?`${summary.filters.period_label} · ${summary.filters.format_label}`:undefined} />
          {summary?.filters?<p data-testid="profile-stats-scope-note" className="mt-3 text-xs leading-5 text-white/55">Выборка: {summary.filters.period_label} · {summary.filters.format_label}. Текущее положение считается отдельно от выбранного среза.</p>:null}

        </section>}
        {!statsHidden&&recentGames}
        {!statsHidden&&isSelf&&<PlayerInsightsPanel/>}
        {!statsHidden&&<section data-testid="profile-detailed-statistics" className="rounded-3xl border border-white/10 bg-white/[.035] p-4">
          <nav aria-label="Разделы подробной статистики" className="mb-2 flex flex-wrap gap-2">{[['results','Результаты'],['decisions','Решения'],['night','Ночью'],['reveals','Вскрытия'],['exits','Круги ухода']].map(([key,label])=><button type="button" key={key} onClick={()=>scrollRef.current?.querySelector(`[data-profile-stat="${key}"]`)?.scrollIntoView({block:'start'})} className="min-h-11 rounded-xl border border-white/10 px-3 text-xs">{label}</button>)}</nav>
          {detailedStats}
        </section>}
        <PlayerGoMafiaLink playerId={playerId} isSelf={isSelf} />
        <PremiumProfileShowcase playerId={playerId} isSelf={isSelf} section="pinned"/>
        <StaffWorkStats stats={summary?.staff} testId="profile-staff-stats" />


      </div>}
      {!settings&&statsHidden&&['games','roles','elo'].includes(tab)&&<section className="rounded-2xl border border-white/10 p-4 text-sm text-white/60"><p>Игровая статистика скрыта игроком</p><p className="mt-1">Игры, роли и Elo недоступны.</p></section>}
      {!settings&&tab==='games'&&!statsHidden&&<>
        {scopeSelector}
        <p className="text-xs leading-5 text-white/60">Elo — изменение рейтинга за партию. Допы судьи, протокольные допы и Ci показаны в спортивных баллах; протокольный доп отдельно на Elo не влияет.</p>
        <div className="flex flex-wrap gap-2">{(['all','custom'] as const).map(k=><button key={k} onClick={()=>{setOffset(0);setPeriod(k);}} className={`min-h-11 rounded-full px-3 py-2 text-xs ${period===k?'bg-white text-black':'bg-white/10'}`}>{k==='all'?'Любые даты':'Диапазон дат'}</button>)}</div>
        {period==='season'&&<div className="text-xs text-white/45">{activePeriod?.title||'Активный сезон не задан'}</div>}
        {period==='custom'&&<div className="grid grid-cols-2 gap-2"><label className="text-xs text-white/60">С даты<input type="date" value={from} max={to||undefined} onChange={e=>{setOffset(0);setFrom(e.target.value);}} className="mobile-field mt-1 w-full"/></label><label className="text-xs text-white/60">По дату<input type="date" value={to} min={from||undefined} onChange={e=>{setOffset(0);setTo(e.target.value);}} className="mobile-field mt-1 w-full"/></label></div>}
        {gameConstraints.length > 0 && <div className="rounded-2xl border border-sky-200/15 bg-sky-200/[.04] p-3" aria-label="Выбранные фильтры игр"><p className="text-xs leading-5 text-white/75">Показаны: {gameConstraints.join(' · ')}</p><button type="button" onClick={resetGameSearch} className="mt-1 min-h-11 rounded-lg px-2 text-xs font-semibold text-sky-200">Сбросить фильтры</button></div>}
        <details className="rounded-2xl border border-white/10 p-3"><summary className="flex min-h-11 cursor-pointer items-center text-sm">Дополнительные фильтры</summary><div className="mt-3 grid gap-2 sm:grid-cols-3">
          <label className="text-xs text-white/50">Роль<select aria-label="Роль" value={role} onChange={e=>{setOffset(0);setRole(e.target.value);}} className="mobile-field mt-1 w-full text-sm">{ROLE_OPTIONS.map(([value,label])=><option key={value||'all'} value={value}>{label}</option>)}</select></label>
          <label className="text-xs text-white/50">Команда<select aria-label="Команда" value={team} onChange={e=>{setOffset(0);setTeam(e.target.value);}} className="mobile-field mt-1 w-full text-sm">{TEAM_OPTIONS.map(([value,label])=><option key={value||'all'} value={value}>{label}</option>)}</select></label>
          <label className="text-xs text-white/50">Результат<select aria-label="Результат" value={result} onChange={e=>{setOffset(0);setResult(e.target.value);}} className="mobile-field mt-1 w-full text-sm">{RESULT_OPTIONS.map(([value,label])=><option key={value||'all'} value={value}>{label}</option>)}</select></label>
        </div></details>
        {error?<div className="rounded-xl border border-red-400/20 bg-red-400/10 p-3 text-sm text-red-200">{error}<button type="button" onClick={()=>setContentRetry(v=>v+1)} className="mt-2 block min-h-11 rounded-lg border border-white/15 px-3 font-semibold">Повторить</button></div>:null}
        {!loading&&!error&&<p data-testid="profile-game-range" className="text-xs leading-5 text-white/60">{games.length ? `Игры ${offset+1}–${offset+games.length} из ${total} · сначала новые` : `Найдено игр: ${total}`}</p>}
        <div className="profile-game-list divide-y divide-white/[.07] overflow-hidden rounded-3xl border border-white/10 bg-white/[.035]">{games.map((g:any)=>{const link=gameLinkProps(g.id||g.game_id);const meta=[roleLabel(g.role),teamLabel(g.team)].filter(Boolean).join(' · ');return <article key={g.id||g.game_id} className="min-w-0 p-4"><div className="flex items-center gap-3"><RoleMark role={g.role} /><div className="min-w-0 flex-1"><div className="flex justify-between gap-3"><b className="min-w-0 break-words">{g.title||'Игра'}{g.game_number?` · №${g.game_number}`:''}</b><span className="shrink-0 text-xs text-white/50">{fmt(g.played_at||g.date)}</span></div><div className="mt-2 flex items-center justify-between gap-3 text-xs text-white/60"><span className="min-w-0">{[meta,g.won===true?'победа':g.won===false?'поражение':null].filter(Boolean).join(' · ')}</span>{g.elo_delta!=null&&<span className={`shrink-0 font-semibold ${Number(g.elo_delta)>0?'text-emerald-300':Number(g.elo_delta)<0?'text-red-300':'text-white/40'}`}>Elo {deltaText(g.elo_delta)}</span>}</div></div></div>{gameChips(g).length>0&&<div className="mt-2 flex flex-wrap gap-1.5">{gameChips(g).map((chip)=><span key={chip} className="rounded-full bg-white/[.07] px-2 py-1 text-[11px] text-white/60">{chip}</span>)}</div>}{(g.table_name||g.judge_name)&&<div className="mt-2 text-[11px] text-white/35">{[g.table_name,g.judge_name?`судья ${g.judge_name}`:null].filter(Boolean).join(' · ')}</div>}{link&&<a {...link} className="mt-2 inline-flex min-h-11 items-center rounded-lg px-2 text-xs font-semibold text-sky-200/70 hover:bg-white/5">Открыть игру ›</a>}</article>})}</div>
        {!loading&&!error&&games.length===0?<div className="rounded-2xl border border-white/10 p-5 text-center text-sm text-white/45">По выбранным фильтрам игр нет.</div>:null}
        {total>15&&<div className="flex justify-between"><button disabled={offset===0} onClick={()=>setOffset(Math.max(0,offset-15))} className="min-h-11 rounded-xl bg-white/10 px-4 py-2 text-sm disabled:opacity-30">Назад</button><button disabled={offset+15>=total} onClick={()=>setOffset(offset+15)} className="min-h-11 rounded-xl bg-white/10 px-4 py-2 text-sm disabled:opacity-30">Дальше</button></div>}
      </>}
      {!settings&&!statsHidden&&(tab==='roles'||(tab==='elo'&&!isSelf))&&error?<div className="rounded-xl border border-white/10 bg-white/[.04] p-4 text-sm text-white/60">{error}<button type="button" onClick={()=>setContentRetry(v=>v+1)} className="mt-2 block min-h-11 rounded-lg border border-white/15 px-3 font-semibold">Повторить</button></div>:null}
      {!settings&&tab==='roles'&&scopeSelector}
      {!settings&&tab==='roles'&&!error&&!statsHidden&&<PlayerRoleResults roles={data?.roles||data?.items||[]}/>}

      {!settings&&tab==='elo'&&isSelf&&<>{scopeSelector}<PlayerEloJourney embedded period={statPeriod} format={statFormat} onOpenGame={openPlayerGame}/></>}
      {!settings&&tab==='elo'&&!isSelf&&scopeSelector}
      {!settings&&tab==='elo'&&!isSelf&&!error&&!statsHidden&&<section className="rounded-2xl border border-white/10 p-4"><h2 className="font-semibold">История Elo</h2><div className="mt-3 space-y-2">{eloPoints.map((x:any,i:number)=><article key={x.id||i} className="rounded-xl bg-white/[.035] p-3"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="break-words text-sm font-medium">{x.title||'Игра'}{x.game_number?` · #${x.game_number}`:''}</div><div className="mt-1 text-xs text-white/45">{fmt(x.date||x.played_at)}{roleLabel(x.role)?` · ${roleLabel(x.role)}`:''}{gameLinkProps(x.id)?<> · <a {...gameLinkProps(x.id)!} className="text-sky-200/70">игра ›</a></>:null}</div></div><div className="shrink-0 text-right"><div className="text-base font-semibold">{eloText(x.elo_after)}</div><div className={`text-xs ${Number(x.elo_delta)>0?'text-emerald-300':Number(x.elo_delta)<0?'text-red-300':'text-white/40'}`}>{deltaText(x.elo_delta)}</div></div></div></article>)}</div>{!loading&&eloPoints.length===0?<div className="mt-3 rounded-xl bg-white/[.035] p-5 text-center text-sm text-white/45">Истории Elo пока нет. Она появится после первых игр, которые идут в рейтинг.</div>:null}</section>}
      {!settings&&tab==='learning'&&learning}
      {!settings&&tab==='awards'&&<><PremiumProfileShowcase playerId={playerId} isSelf={isSelf} section="awards"/>{isSelf?<PlayerAwardSuggestionAction/>:null}</>}
      {!settings&&tab==='history'&&<PremiumProfileShowcase playerId={playerId} isSelf={isSelf} section="history"/>}
      {!settings&&tab==='connections'&&<><PremiumProfileConnections playerId={playerId} selfPlayerId={selfPlayerId}/></>}
      {loading&&!settings&&<div className="py-10 text-center text-sm text-white/45">Загрузка…</div>}
    </main>
  </div>;
}
