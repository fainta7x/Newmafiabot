import { useState, type ReactNode } from 'react';
import { SegmentedControl } from '../ui/SegmentedControl.tsx';
import { countGames, countPlayers, countWins } from '../../lib/russianPlural.ts';
import type { ClubConnectionStories as Stories, ConnectionMember, ConnectionSample } from '../../shared/clubConnectionStories.ts';
import { openCanonicalPlayerProfile } from './playerProfileNavigation.ts';

function Members({ members, roles }: { members: ConnectionMember[]; roles?: string[] }) {
  return <div className="flex flex-wrap gap-2">{members.map((person, i) => <button key={person.player_id} type="button" onClick={() => openCanonicalPlayerProfile(person.player_id)} className="min-h-11 max-w-full rounded-xl border border-white/[0.08] bg-white/[0.035] px-3 py-2 text-left text-xs font-semibold">
    {roles?.[i] && <span className="mb-0.5 block text-[10px] font-normal text-white/45">{roles[i]}</span>}
    <span className="break-words [overflow-wrap:anywhere]">{person.nickname}</span>
  </button>)}</div>;
}
function Sample({ sample, color }: { sample: ConnectionSample; color?: string }) {
  return <p className="mt-2 text-xs leading-relaxed text-white/55">{color && <span className="font-semibold text-white/75">{color} · </span>}{countGames(sample.games)} · {countWins(sample.wins)} команды ({sample.win_rate}%) · событий: {sample.events}</p>;
}
function StoryCard({ title, description, empty, children }: { title: string; description: string; empty: boolean; children: ReactNode }) {
  return <section className="min-w-0 rounded-2xl border border-white/[0.08] bg-black/15 p-4">
    <h3 className="text-sm font-semibold text-white/90">{title}</h3>
    <p className="mb-3 mt-1 text-xs leading-relaxed text-white/50">{description}</p>
    {empty ? <p className="rounded-xl bg-white/[0.025] p-3 text-xs text-white/40">Таких встреч пока недостаточно. Список обновится после завершённых игр.</p> : <div className="space-y-3">{children}</div>}
  </section>;
}
const key = (members: ConnectionMember[]) => JSON.stringify(members.map(m => m.player_id));

export default function ClubConnectionStories({ stories }: { stories: Stories }) {
  const [view, setView] = useState<'teams' | 'opposition' | 'circle'>('teams');
  return <section data-testid="club-stories" className="rounded-[24px] border border-amber-200/10 bg-gradient-to-br from-amber-200/[0.045] to-white/[0.02] p-4">
    <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-100/60">Не только пары</div>
    <h2 className="mt-1 text-lg font-semibold">Игровые истории клуба</h2>
    <p className="mt-1 text-xs leading-relaxed text-white/50">Кто собирался в чёрную тройку, менял сторону вместе и встречался в разных составах.</p>
    <SegmentedControl className="mt-3" value={view} onValueChange={setView} ariaLabel="Виды клубных историй" items={[{ value: 'teams', label: 'Команды' }, { value: 'opposition', label: 'Две стороны' }, { value: 'circle', label: 'Круг игры' }]} />
    <div data-testid={`club-stories-${view}`} className={`mt-4 grid gap-3 ${view !== 'circle' ? 'lg:grid-cols-2' : ''}`}>
      {view === 'teams' && <>
        <StoryCard title="Чёрные тройки" description="Один и тот же полный состав: дон и две мафии. Минимум две совместные игры; роли внутри тройки могли меняться." empty={!stories.black_trios.length}>
          {stories.black_trios.map(g => <div key={key(g.members)}><Members members={g.members} /><Sample sample={g} /></div>)}
        </StoryCard>
        <StoryCard title="Дон + мафия" description="Пары именно в этих ролях. Первый игрок — дон, второй — мафия. Минимум две игры." empty={!stories.don_mafia.length}>
          {stories.don_mafia.map(g => <div key={key(g.members)}><Members members={g.members} roles={['Дон', 'Мафия']} /><Sample sample={g} /></div>)}
        </StoryCard>
        <StoryCard title="Шериф + мирный" description="Пары именно в этих ролях. Совместный результат красной команды; минимум две игры." empty={!stories.sheriff_citizen.length}>
          {stories.sheriff_citizen.map(g => <div key={key(g.members)}><Members members={g.members} roles={['Шериф', 'Мирный']} /><Sample sample={g} /></div>)}
        </StoryCard>
      </>}
      {view === 'opposition' && <>
        <StoryCard title="Ровные противостояния" description="По разные стороны минимум четыре игры. Команда каждого выигрывала в 35–65% встреч; первыми — самые близкие к равному счёту." empty={!stories.balanced_rivalries.length}>
          {stories.balanced_rivalries.map(g => <div key={key(g.members)}><Members members={g.members} />
            <p className="mt-2 text-xs text-white/65">Счёт команд: {g.a_wins} : {g.b_wins}</p>
            <p className="mt-1 text-[11px] text-white/45">В порядке имён выше · {countGames(g.games)} · событий: {g.events}</p>
          </div>)}
        </StoryCard>
        <StoryCard title="Вместе за оба цвета" description="Пары минимум с двумя совместными играми за красных и двумя за чёрных. Результаты каждой стороны считаем отдельно." empty={!stories.versatile_pairs.length}>
          {stories.versatile_pairs.map(g => <div key={key(g.members)}><Members members={g.members} /><Sample sample={g.red} color="За красных" /><Sample sample={g.black} color="За чёрных" /></div>)}
        </StoryCard>
      </>}
      {view === 'circle' && <StoryCard title="Разные составы" description="Кто играл за одним столом с наибольшим числом разных участников среди открытых связей. Минимум две игры; каждый человек считается один раз." empty={!stories.table_circles.length}>
        {stories.table_circles.map(p => <div key={p.player_id}><Members members={[p]} />
          <p className="mt-2 text-xs text-white/65">Встречались за столом: {countPlayers(p.people)}</p>
          <p className="mt-1 text-[11px] text-white/45">{countGames(p.games)} · событий: {p.events}</p>
        </div>)}
      </StoryCard>}
    </div>
    <details className="mt-3 text-xs text-white/50">
      <summary className="min-h-10 cursor-pointer py-2 font-semibold text-white/65">Как читать эти истории</summary>
      <p className="mt-1 leading-relaxed">Считаем завершённые клубные и турнирные игры. Одно событие — один вечер или турнир, даже если игр в нём много. Победы принадлежат всей команде: они не доказывают личный вклад, дружбу или «химию». Порог игр — условие показа, а не доказательство силы. Скрытые связи других игроков не показываем.</p>
      <p className="mt-2 leading-relaxed">Командные составы идут по числу игр, затем разных событий и побед. За оба цвета — по меньшему из двух чисел игр. Разные составы — по числу разных игроков, затем событий и игр. Показываем до трёх примеров каждого вида.</p>
    </details>
  </section>;
}
