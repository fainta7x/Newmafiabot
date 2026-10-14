import { useState, type ReactNode } from 'react';
import { SegmentedControl } from '../ui/SegmentedControl.tsx';
import { countGames } from '../../lib/russianPlural.ts';
import type { ClubConnectionStories as Stories, ConnectionMember, ConnectionSample } from '../../shared/clubConnectionStories.ts';
import { openCanonicalPlayerProfile } from './playerProfileNavigation.ts';
import { ConnectionGraph, WinOrbit } from './PlayerVisualScenes.tsx';

const signature = (members: ConnectionMember[]) => members.map((person) => person.player_id).join(':');
const percent = (value: number) => Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0;

function Feature({ title, description, empty, children, tone = 'violet' }: {
  title: string; description: string; empty: boolean; children: ReactNode;
  tone?: 'rose' | 'violet' | 'amber';
}) {
  const frame = { rose: 'border-rose-200/15 from-rose-400/[.11]', violet: 'border-violet-200/15 from-violet-400/[.12]', amber: 'border-amber-200/15 from-amber-300/[.10]' }[tone];
  return <article className={'min-w-0 overflow-hidden rounded-[28px] border bg-gradient-to-br via-[#17151b] to-[#0f1014] p-4 sm:p-5 ' + frame}>
    <div className="flex items-center gap-2"><span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-amber-200/70"/><h3 className="text-sm font-semibold text-white/90">{title}</h3></div>
    <p className="mt-1 text-[11px] leading-5 text-white/50">{description}</p>
    {empty ? <div className="mt-4 grid min-h-[160px] place-items-center rounded-[22px] border border-dashed border-white/10 text-center text-xs text-white/45">Ещё нет сыгранных сочетаний</div> : <div className="mt-3 grid gap-3">{children}</div>}
  </article>;
}

function Scene({ members, sample, roles, tone = 'violet' }: {
  members: ConnectionMember[]; sample: ConnectionSample;
  roles?: string[]; tone?: 'rose' | 'violet' | 'amber';
}) {
  return <div className="rounded-[22px] border border-white/[.08] bg-black/25 p-3" key={signature(members)}>
    <ConnectionGraph members={members} roles={roles} tone={tone}/>
    <div className="flex items-center justify-between gap-3 border-t border-white/10 pt-2">
      <div><div className="text-xl font-semibold tabular-nums text-white/90">{sample.games}</div><div className="text-[10px] text-white/45">игр вместе · {sample.events} вечеров и турниров</div></div>
      <div className="w-[115px] shrink-0"><WinOrbit percent={sample.win_rate} caption="побед" tone={tone}/></div>
    </div>
  </div>;
}

function RivalryScene({ members, aWins, bWins, games, events }: {
  members: ConnectionMember[]; aWins: number; bWins: number; games: number; events: number;
}) {
  const total = aWins + bWins;
  return <div className="rounded-[22px] border border-white/10 bg-black/25 p-3">
    <ConnectionGraph members={members} tone="rose"/>
    <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-white/60">
      <span>{members[0]?.nickname ?? 'Первый'} · {aWins}</span>
      <b className="font-medium text-amber-100/55">VS</b>
      <span>{bWins} · {members[1]?.nickname ?? 'Второй'}</span>
    </div>
    <div role="img" aria-label={'Победы соперников: ' + aWins + ' против ' + bWins} className="mt-2 flex h-3 overflow-hidden rounded-full bg-white/10">
      <span style={{width: percent(total ? aWins / total * 100 : 0) + '%'}} className="bg-rose-300"/>
      <span style={{width: percent(total ? bWins / total * 100 : 0) + '%'}} className="bg-violet-300"/>
    </div>
    <div className="mt-2 text-[10px] text-white/45">{countGames(games)} друг против друга · {events} вечеров и турниров</div>
  </div>;
}

function VersatileScene({ members, red, black }: { members: ConnectionMember[]; red: ConnectionSample; black: ConnectionSample }) {
  return <div className="rounded-[22px] border border-white/10 bg-black/25 p-3">
    <ConnectionGraph members={members} tone="amber"/>
    {([{ label: 'Красные', sample: red, tone: 'bg-rose-300' }, { label: 'Чёрные', sample: black, tone: 'bg-violet-300' }] as const).map((side) =>
      <div key={side.label} className="mt-2 flex items-center gap-2 text-xs">
        <span className="w-[62px] shrink-0 text-white/65">{side.label}</span>
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/10" role="img" aria-label={side.label + ': ' + side.sample.win_rate + '% побед'}>
          <div className={'h-full rounded-full ' + side.tone} style={{width: percent(side.sample.win_rate) + '%'}}/>
        </div>
        <span className="w-12 text-right tabular-nums text-white/75">{side.sample.win_rate}%</span>
      </div>)}
    <p className="mt-2 text-[10px] text-white/45">Красные: {countGames(red.games)} · чёрные: {countGames(black.games)}</p>
  </div>;
}

export default function ClubConnectionStories({ stories }: { stories: Stories }) {
  const [view, setView] = useState<'teams' | 'opposition' | 'circle'>('teams');
  const total = stories.black_trios.length + stories.don_mafia.length + stories.sheriff_citizen.length;
  return <section data-testid="club-stories" className="relative overflow-hidden rounded-[30px] border border-amber-200/15 bg-[#101014] p-4 sm:p-6">
    <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-[220px] bg-[radial-gradient(ellipse_at_50%_0%,rgba(217,175,111,.16),transparent_65%)]"/>
    <header className="relative">
      <div className="text-[10px] font-semibold uppercase tracking-[.21em] text-amber-200/60">Социальная карта клуба</div>
      <h2 className="mt-1 text-2xl font-semibold tracking-tight text-white">Кто с кем играет</h2>
      <p className="mt-2 max-w-2xl text-xs leading-5 text-white/55">Здесь видны сыгранные сочетания за столом: союзники, противостояния и самые общительные игроки. Касание имени открывает профиль.</p>
      <div aria-hidden="true" className="mt-4 flex h-12 items-center justify-center gap-4 overflow-hidden rounded-2xl border border-amber-200/10 bg-[#1d1b1b]/80">
        {['♛', '♠', '✦', '◆', '♠', '♛', '◆'].map((symbol, index) => <span key={index} className={'text-xl ' + (index % 2 ? 'text-violet-200/50' : 'text-amber-100/45')}>{symbol}</span>)}
        <span className="sr-only">{total} командных сочетаний</span>
      </div>
    </header>
    <SegmentedControl className="relative mt-4" value={view} onValueChange={setView} ariaLabel="Что показать"
      items={[{ value: 'teams', label: 'Команды' }, { value: 'opposition', label: 'Соперники' }, { value: 'circle', label: 'Знакомства' }]} />
    <div data-testid={'club-stories-' + view} className={'relative mt-4 grid gap-3 ' + (view === 'teams' ? 'lg:grid-cols-3' : view === 'opposition' ? 'lg:grid-cols-2' : 'lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]')}>
      {view === 'teams' && <>
        <Feature title="Чёрные тройки" description="Дон и две мафии, игравшие вместе." tone="violet" empty={!stories.black_trios.length}>
          {stories.black_trios.map((group) => <Scene key={signature(group.members)} members={group.members} sample={group} roles={['Дон', 'Мафия', 'Мафия']}/>)}
        </Feature>
        <Feature title="Дон и мафия" description="Напарники по чёрной команде." tone="violet" empty={!stories.don_mafia.length}>
          {stories.don_mafia.map((group) => <Scene key={signature(group.members)} members={group.members} sample={group} roles={['Дон', 'Мафия']}/>)}
        </Feature>
        <Feature title="Шериф и мирный" description="Сыгранные сочетания красной команды." tone="rose" empty={!stories.sheriff_citizen.length}>
          {stories.sheriff_citizen.map((group) => <Scene key={signature(group.members)} members={group.members} sample={group} roles={['Шериф', 'Мирный']} tone="rose"/>)}
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
        <div className="grid gap-3 sm:grid-cols-2">{stories.table_circles.map((person) =>
          <div key={person.player_id} className="rounded-[22px] border border-amber-200/10 bg-black/20 p-4">
            <button type="button" onClick={() => openCanonicalPlayerProfile(person.player_id)}
              className="flex min-h-12 w-full items-center gap-3 text-left">
              <span aria-hidden="true" className="grid h-12 w-12 shrink-0 place-items-center rounded-full border border-amber-200/40 bg-amber-200/10 text-xl font-semibold text-amber-100">{person.nickname.slice(0,1)}</span>
              <span className="min-w-0 flex-1 truncate font-semibold text-white">{person.nickname}</span>
              <span aria-hidden="true" className="text-amber-100/45">↗</span>
            </button>
            <div className="mt-3 flex items-baseline gap-2"><strong className="text-3xl font-semibold tabular-nums text-amber-100">{person.people}</strong><span className="text-xs text-white/50">разных игроков</span></div>
            <div className="mt-2 h-1.5 rounded-full bg-white/10"><div className="h-full rounded-full bg-amber-200/75" style={{width: Math.min(100, person.people / Math.max(1, ...stories.table_circles.map((item) => item.people)) * 100) + '%'}}/></div>
            <p className="mt-2 text-[10px] text-white/45">{countGames(person.games)} · {person.events} вечеров и турниров</p>
          </div>)}</div>
      </Feature>}
    </div>
    <details className="relative mt-4 rounded-xl border border-white/10 px-3 text-xs text-white/55">
      <summary className="min-h-11 cursor-pointer py-3 font-semibold text-white/70">Что здесь считается</summary>
      <p className="pb-3 leading-relaxed">Берём сыгранные клубные и турнирные игры. Победа общая у команды и не означает оценку личного вклада. Игроки, скрывшие связи в настройках, не показываются.</p>
    </details>
  </section>;
}
