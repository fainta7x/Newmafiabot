import { useState, type ReactNode } from 'react';
import { SegmentedControl } from '../ui/SegmentedControl.tsx';
import { countGames, countWins } from '../../lib/russianPlural.ts';
import type { ClubConnectionStories as Stories, ConnectionMember, ConnectionSample } from '../../shared/clubConnectionStories.ts';
import { openCanonicalPlayerProfile } from './playerProfileNavigation.ts';

function Members({ members, roles }: { members: ConnectionMember[]; roles?: string[] }) {
  return <div className="flex flex-wrap gap-2">{members.map((person, i) => <button key={person.player_id} type="button" onClick={() => openCanonicalPlayerProfile(person.player_id)} className="min-h-11 max-w-full rounded-xl border border-white/[0.08] bg-white/[0.035] px-3 py-2 text-left text-xs font-semibold">
    {roles?.[i] && <span className="mb-0.5 block text-[10px] font-normal text-white/45">{roles[i]}</span>}
    <span className="break-words [overflow-wrap:anywhere]">{person.nickname}</span>
  </button>)}</div>;
}
function Sample({ sample, color }: { sample: ConnectionSample; color?: string }) {
  return <p className="mt-2 text-xs leading-relaxed text-white/55">{color && <span className="font-semibold text-white/75">{color} · </span>}{countGames(sample.games)} вместе · {countWins(sample.wins)} ({sample.win_rate}%) · вечеров и турниров: {sample.events}</p>;
}
function StoryCard({ title, description, empty, children }: { title: string; description: string; empty: boolean; children: ReactNode }) {
  return <section className="min-w-0 rounded-2xl border border-white/[0.08] bg-black/15 p-4">
    <h3 className="text-sm font-semibold text-white/90">{title}</h3>
    <p className="mb-3 mt-1 text-xs leading-relaxed text-white/50">{description}</p>
    {empty ? <p className="rounded-xl bg-white/[0.025] p-3 text-xs text-white/40">Пока никого. Появится после новых игр.</p> : <div className="space-y-3">{children}</div>}
  </section>;
}
const key = (members: ConnectionMember[]) => JSON.stringify(members.map(m => m.player_id));

export default function ClubConnectionStories({ stories }: { stories: Stories }) {
  const [view, setView] = useState<'teams' | 'opposition' | 'circle'>('teams');
  return <section data-testid="club-stories" className="rounded-[24px] border border-amber-200/10 bg-gradient-to-br from-amber-200/[0.045] to-white/[0.02] p-4">
    <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-100/60">Клуб</div>
    <h2 className="mt-1 text-lg font-semibold">Кто с кем играет</h2>
    <p className="mt-1 text-xs leading-relaxed text-white/50">Постоянные команды, пары и соперники клуба по сыгранным играм.</p>
    <SegmentedControl className="mt-3" value={view} onValueChange={setView} ariaLabel="Что показать" items={[{ value: 'teams', label: 'Команды' }, { value: 'opposition', label: 'Соперники' }, { value: 'circle', label: 'Знакомства' }]} />
    <div data-testid={`club-stories-${view}`} className={`mt-4 grid gap-3 ${view === 'teams' ? 'lg:grid-cols-3' : view === 'opposition' ? 'lg:grid-cols-2' : ''}`}>
      {view === 'teams' && <>
        <StoryCard title="Чёрные тройки" description="Дон и две мафии, которые не раз садились играть вместе." empty={!stories.black_trios.length}>
          {stories.black_trios.map(g => <div key={key(g.members)}><Members members={g.members} /><Sample sample={g} /></div>)}
        </StoryCard>
        <StoryCard title="Дон и мафия" description="Дон и его постоянный напарник по мафии." empty={!stories.don_mafia.length}>
          {stories.don_mafia.map(g => <div key={key(g.members)}><Members members={g.members} roles={['Дон', 'Мафия']} /><Sample sample={g} /></div>)}
        </StoryCard>
        <StoryCard title="Шериф и мирный" description="Шериф и мирный, которые не раз играли в одной красной команде." empty={!stories.sheriff_citizen.length}>
          {stories.sheriff_citizen.map(g => <div key={key(g.members)}><Members members={g.members} roles={['Шериф', 'Мирный']} /><Sample sample={g} /></div>)}
        </StoryCard>
      </>}
      {view === 'opposition' && <>
        <StoryCard title="Равные соперники" description="Играли друг против друга не меньше четырёх раз, и никто явно не перевешивает." empty={!stories.balanced_rivalries.length}>
          {stories.balanced_rivalries.map(g => <div key={key(g.members)}><Members members={g.members} />
            <p className="mt-2 text-xs text-white/65">Побед: {g.a_wins} : {g.b_wins}</p>
            <p className="mt-1 text-[11px] text-white/45">{countGames(g.games)} друг против друга · вечеров и турниров: {g.events}</p>
          </div>)}
        </StoryCard>
        <StoryCard title="Играют вместе и за красных, и за чёрных" description="Пара собиралась в одну команду за оба цвета — не меньше двух игр за каждый." empty={!stories.versatile_pairs.length}>
          {stories.versatile_pairs.map(g => <div key={key(g.members)}><Members members={g.members} /><Sample sample={g.red} color="Красные" /><Sample sample={g.black} color="Чёрные" /></div>)}
        </StoryCard>
      </>}
      {view === 'circle' && <StoryCard title="Кто знает всех" description="Игроки, которые сидели за одним столом с самым большим числом разных людей." empty={!stories.table_circles.length}>
        {stories.table_circles.map(p => <div key={p.player_id}><Members members={[p]} />
          <p className="mt-2 text-xs text-white/65">Разных игроков за столом: {p.people}</p>
          <p className="mt-1 text-[11px] text-white/45">{countGames(p.games)} · вечеров и турниров: {p.events}</p>
        </div>)}
      </StoryCard>}
    </div>
    <details className="mt-3 text-xs text-white/50">
      <summary className="min-h-10 cursor-pointer py-2 font-semibold text-white/65">Что здесь считается</summary>
      <p className="mt-1 leading-relaxed">Берём сыгранные клубные и турнирные игры. Победа общая у всей команды — это не оценка личного вклада. Кто скрыл связи в настройках, тут не показан.</p>
    </details>
  </section>;
}
