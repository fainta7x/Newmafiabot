import {useState,type ReactNode} from 'react';
import type {GameRole} from '../../shared/gameRoles.ts';
import {SegmentedControl} from '../ui/SegmentedControl.tsx';
import {countGames} from '../../lib/russianPlural.ts';
import {gameResultText} from '../../lib/playerResultObservations.ts';
import type {ClubConnectionStories as Stories,ConnectionMember,ConnectionSample} from '../../shared/clubConnectionStories.ts';
import ClubConnectionCard from './ClubConnectionCard.tsx';
const signature=(members:ConnectionMember[])=>members.map(person=>person.player_id).join(':');
function Feature({title,description,empty,children}:{title:string;description:string;empty:boolean;children:ReactNode}){return <section className="min-w-0 space-y-3"><header><h3 className="text-sm font-semibold text-white/90">{title}</h3><p className="mt-1 text-xs leading-5 text-white/55">{description}</p></header>{empty?<p className="text-xs leading-5 text-white/50">Подходящих завершённых игр пока недостаточно.</p>:children}</section>;}
function Together({members,sample,roles,context}:{members:ConnectionMember[];sample:ConnectionSample;roles?:GameRole[];context:string}){return <ClubConnectionCard members={members} roles={roles} context={context}><p className="text-sm font-semibold">{gameResultText(sample)} · {sample.win_rate}%</p><p className="text-white/55">Вечеров и турниров: {sample.events}</p></ClubConnectionCard>;}
export default function ClubConnectionStories({stories,pairs}:{stories:Stories;pairs?:ReactNode}){
 const[view,setView]=useState<'teams'|'opposition'|'circle'>(()=>{try{const value=sessionStorage.getItem('club-stories-view');return value==='opposition'||value==='circle'?value:'teams';}catch{return'teams';}});
 return <section data-testid="club-stories" className="space-y-4 rounded-3xl border border-white/10 bg-white/[.035] p-4">
  <header><h2 className="text-lg font-semibold">Кто с кем играет</h2><p className="mt-1 text-xs leading-5 text-white/55">Общие результаты завершённых клубных и турнирных игр.</p></header>
  <SegmentedControl wrapLabels value={view} onValueChange={value=>{setView(value);try{sessionStorage.setItem('club-stories-view',value);}catch{}}} ariaLabel="Что показать" items={[{value:'teams',label:'Напарники'},{value:'opposition',label:'Соперники'},{value:'circle',label:'За одним столом'}]}/>
  <div data-testid={'club-stories-'+view} className="space-y-6">
   {view==='teams'&&<>{pairs}
    <div className="grid gap-6 lg:grid-cols-3">
     <Feature title="Чёрные тройки" description="Дон и две мафии в одном составе. Сначала чаще игравшие вместе." empty={!stories.black_trios.length}>{stories.black_trios.map(group=><Together key={signature(group.members)} members={group.members} sample={group} context="Одна чёрная команда · дон и две мафии"/>)}</Feature>
     <Feature title="Дон и мафия" description="Ролевые сочетания чёрной команды. Сначала по числу совместных игр." empty={!stories.don_mafia.length}>{stories.don_mafia.map(group=><Together key={signature(group.members)} members={group.members} sample={group} roles={['don','mafia']} context="В одной чёрной команде"/>)}</Feature>
     <Feature title="Шериф и мирный" description="Ролевые сочетания красной команды. Сначала по числу совместных игр." empty={!stories.sheriff_citizen.length}>{stories.sheriff_citizen.map(group=><Together key={signature(group.members)} members={group.members} sample={group} roles={['sheriff','citizen']} context="В одной красной команде"/>)}</Feature>
    </div>
    <Feature title="Вместе за оба цвета" description="Одна пара в красной и чёрной командах; не менее двух игр за каждый цвет." empty={!stories.versatile_pairs.length}>{stories.versatile_pairs.map(group=><ClubConnectionCard key={signature(group.members)} members={group.members} context="В одной команде · результаты по цветам"><p>За красных: {gameResultText(group.red)} · {group.red.win_rate}%</p><p>За чёрных: {gameResultText(group.black)} · {group.black.win_rate}%</p></ClubConnectionCard>)}</Feature>
   </>}
   {view==='opposition'&&<Feature title="Равные соперники" description="Минимум четыре встречи по разные стороны. Сначала пары с наиболее близким счётом." empty={!stories.balanced_rivalries.length}>{stories.balanced_rivalries.map(group=><ClubConnectionCard key={signature(group.members)} members={group.members} context={`${countGames(group.games)} друг против друга`}><p>{group.members[0].nickname}: {group.a_wins} побед</p><p>{group.members[1].nickname}: {group.b_wins} побед</p><p className="text-white/55">Вечеров и турниров: {group.events}</p></ClubConnectionCard>)}</Feature>}
   {view==='circle'&&<Feature title="Встречались за одним столом" description="Число разных участников, с которыми играли. Сначала самый широкий круг встреч." empty={!stories.table_circles.length}>{stories.table_circles.map(person=><ClubConnectionCard key={person.player_id} members={[person]} context="Завершённые игры за одним столом"><p className="text-sm font-semibold">Разных участников: {person.people}</p><p>{countGames(person.games)} · вечеров и турниров: {person.events}</p></ClubConnectionCard>)}</Feature>}
  </div>
  <details className="rounded-xl border border-white/10 px-3 text-xs text-white/55"><summary className="flex min-h-11 cursor-pointer items-center font-semibold text-white/70">Что здесь считается</summary><p className="pb-3 leading-5">Командная победа относится ко всему составу. Число встреч описывает совместные игры, а не дружбу или личный вклад. Игроки, скрывшие связи, не показываются. Правила отбора указаны у каждой группы.</p></details>
 </section>;
}
