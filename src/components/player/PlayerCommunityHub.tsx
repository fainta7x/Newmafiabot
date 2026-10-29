import {useEffect,useState} from 'react';
import {readCommunityView,writeCommunityView,type CommunityDestination} from '../../lib/communityViewMemory.ts';
import type {PlayerMeResponse} from '../../types/player.ts';
import {SegmentedControl} from '../ui/SegmentedControl.tsx';
import PlayerClubActivity from './PlayerClubActivity.tsx';
import PlayerClubConnections from './PlayerClubConnections.tsx';
import PlayerClubDirectory from './PlayerClubDirectory.tsx';
import PlayerRatingHub,{type PlayerRatingSection} from './PlayerRatingHub.tsx';
import PlayerMetricRatings from './PlayerMetricRatings.tsx';
import PlayerSeasonsPanel from './PlayerSeasonsPanel.tsx';
import PlayerStoriesPanel from './PlayerStoriesPanel.tsx';
export type CommunitySection=PlayerRatingSection|'club'|'clubworld';
type View='players'|'rating'|'connections'|'history'|'games';
const NAV:Array<{value:View;label:string}>=[{value:'players',label:'Игроки'},{value:'rating',label:'Рейтинг'},{value:'connections',label:'Связи'},{value:'history',label:'История'},{value:'games',label:'Мини-игры'}];
const PURPOSE:Record<View,string>={players:'Люди клуба, их показатели и недавние результаты.',rating:'Elo, спортивный зачёт сезона и результаты турниров.',connections:'Совместные игры, соперничество и встречи за одним столом.',history:'Итоги прошедших вечеров, игры и рекорды клуба.',games:'Клубный досуг: играем между вечерами и зовём друг друга.'};
function destination(section:CommunitySection,target:string|null):CommunityDestination{
 if(section==='clubworld')return target==='form'?{section:'club',target:'form'}:target==='matches'?{section:'club',target:'history'}:{section:'ratingperiods',target:target==='history'?'archive':null};
 if(section==='rating'&&target==='metrics')return{section:'club',target:'metrics'};
 return{section,target};
}
export default function PlayerCommunityHub({data,section,target=null,onOpen,onOpenDailyWord,onOpenPoker,onOpenClocktower,onOpenProfileElo,onOpenMyConnections}:{data:PlayerMeResponse;section:CommunitySection;target?:string|null;onOpen:(section:CommunitySection,target?:string|null)=>void;onOpenDailyWord?:()=>void;onOpenPoker?:()=>void;onOpenClocktower?:()=>void;onOpenProfileElo?:()=>void;onOpenMyConnections?:()=>void}){
 const[route,setRoute]=useState(()=>destination(section,target));
 useEffect(()=>setRoute(destination(section,target)),[section,target]);
 const navigate=(next:CommunitySection,nextTarget:string|null=null)=>{setRoute(destination(next,nextTarget));onOpen(next,nextTarget);};
 const view:View=route.section!=='club'?'rating':route.target==='connections'?'connections':route.target==='games'?'games':route.target==='history'||route.target==='hall'?'history':'players';
 const players=route.target==='metrics'?'metrics':route.target==='form'?'form':'list';
 const history=route.target==='hall'?'hall':'matches';
 useEffect(()=>{const next=readCommunityView(data.player.id);next.last=route;if(view==='rating')next.rating={section:route.section as PlayerRatingSection,target:route.target==='archive'?'archive':null};if(view==='players')next.players=players;if(view==='history')next.history=history;writeCommunityView(data.player.id,next);},[data.player.id,route.section,route.target,view,players,history]);
 const choose=(next:View)=>{const saved=readCommunityView(data.player.id);if(next==='rating'){navigate(saved.rating.section,saved.rating.target);return;}navigate('club',next==='players'?saved.players==='list'?null:saved.players:next==='history'?saved.history==='hall'?'hall':'history':next==='connections'?'connections':'games');};
 return <main className="player-workspace-page min-h-[var(--tg-viewport-stable-height,100dvh)] bg-[#090a0d] pb-[calc(7rem+env(safe-area-inset-bottom))] pt-3 text-white" data-testid="player-community-hub">
  <div className={'player-workspace mx-auto w-full space-y-3 px-3 '+(view==='connections'?'max-w-6xl':'max-w-[430px]')}>
   <header className="px-1 pt-1"><h1 className="text-2xl font-semibold">Сообщество</h1></header>
   <SegmentedControl wrapLabels className="player-community-menu max-w-[430px]" ariaLabel="Разделы сообщества" value={view} items={NAV} onValueChange={choose} itemClassName="!text-[12px]"/>
   {view!=='connections'&&<p className="px-1 text-xs leading-5 text-white/60">{PURPOSE[view]}</p>}
   {view==='players'&&<><SegmentedControl wrapLabels ariaLabel="Разделы игроков" value={players} items={[{value:'list',label:'Список'},{value:'metrics',label:'Показатели'},{value:'form',label:'Форма'}]} onValueChange={next=>navigate('club',next==='list'?null:next)} itemClassName="text-[12px]"/>{players==='list'?<PlayerClubDirectory selfId={data.player.id}/>:players==='form'?<PlayerClubActivity/>:null}</>}
   {view==='history'&&<><SegmentedControl wrapLabels ariaLabel="Разделы истории" value={history} items={[{value:'matches',label:'Вечера и игры'},{value:'hall',label:'Зал славы'}]} onValueChange={next=>navigate('club',next==='hall'?'hall':'history')}/>{history==='hall'?<PlayerSeasonsPanel part="hall"/>:<PlayerStoriesPanel viewerId={data.player.id}/>}</>}
   {view==='connections'&&<><PlayerClubConnections viewerId={data.player.id}/>{onOpenMyConnections&&<button type="button" onClick={onOpenMyConnections} className="min-h-11 rounded-xl border border-white/10 px-3 text-sm text-white/70">Мои связи и приглашения ›</button>}</>}
   {view==='games'&&<section className="space-y-2" data-testid="player-minigames" aria-label="Мини-игры">{[['Слово дня','Одно слово для всего клуба · бесплатно · 200 жетонов за победу',onOpenDailyWord,'player-club-daily-word'],['Покер','Игра на клубные жетоны или с ботами · столы и турниры',onOpenPoker,'player-club-poker'],['Кровь на часовой башне','Настольная игра · комнаты, приглашения, правила',onOpenClocktower,'player-club-clocktower']].map(([name,description,action,testid])=><button key={String(testid)} type="button" data-testid={String(testid)} onClick={()=>{if(typeof action==='function')action();}} className="ds-focus-ring flex min-h-[72px] w-full items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[.045] px-4 py-3 text-left"><span><span className="block text-base font-semibold">{String(name)}</span><span className="mt-1 block text-xs leading-5 text-white/55">{String(description)}</span></span><span aria-hidden="true">›</span></button>)}</section>}
  </div>
  {view==='rating'&&<div className="mt-2"><PlayerRatingHub embedded data={data} section={route.section as PlayerRatingSection} target={route.target} onOpen={navigate} onOpenProfileElo={onOpenProfileElo}/></div>}
  {view==='players'&&players==='metrics'&&<PlayerMetricRatings selfId={data.player.id} onOpenPair={(a,b,period,format)=>{try{sessionStorage.setItem('community-connection-query',JSON.stringify({a,b,period,format}));}catch{}navigate('club','connections');}}/>}
 </main>;
}
