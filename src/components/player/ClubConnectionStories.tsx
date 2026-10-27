import { getGameRoleDefinition, type GameRole } from '../../shared/gameRoles.ts';
import { useState, type ReactNode } from 'react';
import { SegmentedControl } from '../ui/SegmentedControl.tsx';
import { countGames } from '../../lib/russianPlural.ts';
import type { ClubConnectionStories as Stories, ConnectionMember, ConnectionSample } from '../../shared/clubConnectionStories.ts';
import { openCanonicalPlayerProfile } from './playerProfileNavigation.ts';
import { ResultTrack, RoleMark } from './PlayerGameGraphics.tsx';

const signature = (members: ConnectionMember[]) => members.map((person) => person.player_id).join(':');
const percent = (value: number) => Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0;

function Feature({ title, description, empty, children, tone = 'violet' }: {
  title: string; description: string; empty: boolean; children: ReactNode;
  tone?: 'rose' | 'violet' | 'amber';
}) {
  const accent = { rose: 'text-rose-200', violet: 'text-violet-200', amber: 'text-amber-100' }[tone];
  return <article className="min-w-0">
    <h3 className={'text-sm font-semibold ' + accent}>{title}</h3>
    <p className="mt-1 text-xs leading-5 text-white/55">{description}</p>
    {empty ? <p className="py-3 text-xs text-white/50">Ещё нет сыгранных сочетаний</p> : <div className="mt-2 divide-y divide-white/[.07]">{children}</div>}
  </article>;
}

function Members({ members, roles = [] }: { members: ConnectionMember[]; roles?: GameRole[] }) {
  return <div className="relative grid gap-3" style={{ gridTemplateColumns: `repeat(${Math.max(1, members.length)}, minmax(0, 1fr))` }}>
    {members.length > 1 && <span aria-hidden="true" className="absolute left-[15%] right-[15%] top-6 h-px bg-gradient-to-r from-violet-200/15 via-white/30 to-violet-200/15" />}
    {members.map((member, i) => <button key={member.player_id} type="button" aria-label={member.nickname}
    onClick={() => openCanonicalPlayerProfile(member.player_id)}
    className="ds-focus-ring relative flex min-h-11 min-w-0 flex-col items-center gap-1.5 rounded-xl text-center text-white/90">
    {roles[i] ? <RoleMark role={roles[i]} /> : <span aria-hidden="true" className="grid h-12 w-12 place-items-center rounded-full border border-amber-200/25 bg-[#29251d] text-lg font-semibold text-amber-100">{member.nickname.trim().slice(0, 1)}</span>}
    <span className="break-words text-xs font-semibold leading-4">{member.nickname}</span>{roles[i] && <span className="text-xs text-white/50">{getGameRoleDefinition(roles[i])?.label}</span>}
  </button>)}</div>;
}

function Scene({ members, sample, roles }: { members: ConnectionMember[]; sample: ConnectionSample; roles?: GameRole[]; tone?: 'rose' | 'violet' | 'amber' }) {
  return <div className="py-3">
    <Members members={members} roles={roles}/>
    <div className="mt-3"><ResultTrack value={sample.win_rate} tone={roles?.includes('sheriff') ? 'rose' : 'violet'} /></div>
    <p className="mt-2 text-xs leading-5 text-white/60">{countGames(sample.games)} вместе · {sample.wins} побед ({sample.win_rate}%) · {sample.events} вечеров и турниров</p>
  </div>;
}

function RivalryScene({ members, aWins, bWins, games, events }: {
  members: ConnectionMember[]; aWins: number; bWins: number; games: number; events: number;
}) {
  return <div className="py-2">
    <Members members={members}/>
    <p className="text-sm tabular-nums text-white/85">Победы: {aWins} : {bWins}</p>
    <p className="mt-1 text-xs leading-5 text-white/55">{countGames(games)} друг против друга · {events} вечеров и турниров</p>
  </div>;
}

function VersatileScene({ members, red, black }: { members: ConnectionMember[]; red: ConnectionSample; black: ConnectionSample }) {
  return <div className="py-2">
    <Members members={members}/>
    {([{ label: 'Красные', sample: red, tone: 'bg-rose-300' }, { label: 'Чёрные', sample: black, tone: 'bg-violet-300' }] as const).map((side) =>
      <div key={side.label} className="mt-2 flex items-center gap-2 text-xs">
        <span className="w-16 shrink-0 text-white/65">{side.label}</span>
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10" aria-hidden="true"><div className={'h-full rounded-full ' + side.tone} style={{width: percent(side.sample.win_rate) + '%'}}/></div>
        <span className="w-12 shrink-0 text-right tabular-nums text-white/85">{side.sample.win_rate}%</span>
      </div>)}
    <p className="mt-2 text-xs text-white/55">Красные: {countGames(red.games)} · чёрные: {countGames(black.games)}</p>
  </div>;
}

export default function ClubConnectionStories({ stories, pairs }: { stories: Stories; pairs?: ReactNode }) {
  const [view, setView] = useState<'teams' | 'opposition' | 'circle' | 'pairs'>(()=>{try{const value=sessionStorage.getItem('club-stories-view');return value==='opposition'||value==='circle'||(value==='pairs'&&pairs)?value:'teams';}catch{return 'teams';}});
  return <section data-testid="club-stories" className="rounded-3xl border border-white/10 bg-white/[.035] p-4">
    <header><h2 className="text-lg font-semibold">Кто с кем играет</h2><p className="mt-1 text-xs leading-5 text-white/55">Команды, соперники и знакомства за игровым столом.</p></header>
    <SegmentedControl wrapLabels className="relative mt-4 !grid-cols-2 sm:!grid-cols-4" value={view} onValueChange={value=>{setView(value);try{sessionStorage.setItem('club-stories-view',value);}catch{}}} ariaLabel="Что показать"
      items={[{ value: 'teams', label: 'Команды' }, { value: 'opposition', label: 'Соперники' }, { value: 'circle', label: 'Знакомства' },...(pairs?[{value:'pairs' as const,label:'Пары'}]:[])]} />
    <div data-testid={'club-stories-' + view} className={'relative mt-4 grid gap-5 ' + (view === 'teams' ? 'lg:grid-cols-3' : view === 'opposition' ? 'lg:grid-cols-2' : 'lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]')}>
      {view === 'pairs'&&<div className="col-span-full">{pairs}</div>}
      {view === 'teams' && <>
        <Feature title="Чёрные тройки" description="Дон и две мафии, игравшие вместе." tone="violet" empty={!stories.black_trios.length}>
          {stories.black_trios.map((group) => <Scene key={signature(group.members)} members={group.members} sample={group} roles={['don', 'mafia', 'mafia']}/>)}
        </Feature>
        <Feature title="Дон и мафия" description="Напарники по чёрной команде." tone="violet" empty={!stories.don_mafia.length}>
          {stories.don_mafia.map((group) => <Scene key={signature(group.members)} members={group.members} sample={group} roles={['don', 'mafia']}/>)}
        </Feature>
        <Feature title="Шериф и мирный" description="Сыгранные сочетания красной команды." tone="rose" empty={!stories.sheriff_citizen.length}>
          {stories.sheriff_citizen.map((group) => <Scene key={signature(group.members)} members={group.members} sample={group} roles={['sheriff', 'citizen']} tone="rose"/>)}
        </Feature>
      </>}
      {view === 'opposition' && <>
        <Feature title="Равные соперники" description="Минимум четыре встречи по разные стороны; результат близок." tone="rose" empty={!stories.balanced_rivalries.length}>
          {stories.balanced_rivalries.map((group) => <RivalryScene key={signature(group.members)} members={group.members} aWins={group.a_wins} bWins={group.b_wins} games={group.games} events={group.events}/>)}
        </Feature>
        <Feature title="Играют вместе и за красных, и за чёрных" description="Одна пара в обеих командах, не менее двух игр за каждый цвет." tone="amber" empty={!stories.versatile_pairs.length}>
          {stories.versatile_pairs.map((group) => <VersatileScene key={signature(group.members)} members={group.members} red={group.red} black={group.black}/>)}
        </Feature>
      </>}
      {view === 'circle' && <Feature title="Кто знает всех" description="Широта круга знакомств — число разных игроков, с которыми сидели за столом." tone="amber" empty={!stories.table_circles.length}>
        <div className="divide-y divide-white/[.07]">{stories.table_circles.map((person) =>
          <button key={person.player_id} type="button" aria-label={person.nickname} onClick={() => openCanonicalPlayerProfile(person.player_id)} className="ds-focus-ring flex min-h-11 w-full items-center gap-3 py-3 text-left">
            <span className="min-w-0 flex-1"><span className="block break-words text-sm font-semibold">{person.nickname}</span><span className="mt-1 block text-xs text-white/55">{countGames(person.games)} · {person.events} вечеров и турниров</span></span><span className="text-right text-sm tabular-nums">{person.people}<span className="block text-xs text-white/55">игроков</span></span>
          </button>)}</div>
      </Feature>}
    </div>
    <details className="relative mt-4 rounded-xl border border-white/10 px-3 text-xs text-white/55">
      <summary className="min-h-11 cursor-pointer py-3 font-semibold text-white/70">Что здесь считается</summary>
      <p className="pb-3 leading-relaxed">Берём сыгранные клубные и турнирные игры. Победа общая у команды и не означает оценку личного вклада. Игроки, скрывшие связи в настройках, не показываются.</p>
    </details>
  </section>;
}
