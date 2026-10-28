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
  rivals: PersonRelationship[];
  teammates: PersonRelationship[];
  club_duos: { red: ClubDuo[]; black: ClubDuo[] };
  club_most_played?: { red: ClubDuo[]; black: ClubDuo[] };
  club_first_games?: { red: ClubDuo[]; black: ClubDuo[] };
  recent_event?: { title: string; date: string; teammates: PersonRelationship[]; rivals: PersonRelationship[] } | null;
};

function DuoRow({duo}:{duo:ClubDuo}){return <ClubConnectionCard testId={'club-duo-'+duo.a_id+'-'+duo.b_id} members={[{player_id:duo.a_id,nickname:duo.a_name},{player_id:duo.b_id,nickname:duo.b_name}]} context={'В одной команде · '+(duo.team==='red'?'красные':'чёрные')}><p className="text-sm font-semibold">{gameResultText(duo)} · {duo.win_rate}%</p></ClubConnectionCard>;}

export default function PlayerClubConnections() {
  const [clubView, setClubView] = useState<'best' | 'played'>(()=>{try{return sessionStorage.getItem('club-duos-view')==='played'?'played':'best';}catch{return 'best';}});
  const [data, setData] = useState<RelationshipData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestSeq = useRef(0);

  const loadRelationships = useCallback(async () => {
    const requestId = ++requestSeq.current;
    setLoading(true);
    setError(null);
    setData(null);
    try {
      const body = await getJson('/api/player/relationships', 'Не удалось загрузить связи игроков');
      if (!body?.club_duos?.red || !body?.club_duos?.black) throw new Error('Не удалось загрузить связи игроков');
      if (requestId === requestSeq.current) setData(body as RelationshipData);
    } catch (loadError: any) {
      if (requestId === requestSeq.current) setError(loadError?.message || 'Не удалось загрузить связи игроков');
    } finally {
      if (requestId === requestSeq.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRelationships();
    return () => { requestSeq.current += 1; };
  }, [loadRelationships]);

  if (loading) return <div className="rounded-[24px] border border-white/10 bg-white/[0.03] px-4 py-10 text-center text-xs text-white/35">Считаем, кто с кем играл…</div>;
  if (error) return (
    <div role="alert" data-testid="player-connections-error" className="space-y-3 rounded-[24px] border border-rose-300/15 bg-rose-300/[0.07] p-4">
      <p className="text-[13px] leading-5 text-rose-100/80">{error}</p>
      <button type="button" onClick={() => void loadRelationships()} className="min-h-11 w-full rounded-xl border border-white/15 bg-white/[0.06] px-3 text-[13px] font-semibold text-white">Повторить</button>
    </div>
  );
  if (!data) return null;

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
            const first = data.club_first_games?.[team] ?? [];
            return <div key={team}>
              <h3 className={`mb-2 text-xs font-semibold ${team === 'red' ? 'text-rose-200/80' : 'text-white/65'}`}>{team === 'red' ? 'Красные' : 'Чёрные'}</h3>
              <div className="space-y-3">{pairs.map(duo => <DuoRow key={`${duo.a_id}:${duo.b_id}`} duo={duo} />)}</div>
              {!pairs.length && <p className="rounded-xl bg-black/15 p-3 text-xs leading-relaxed text-white/45">Пока нет пар, которые сыграли вместе дважды.</p>}
              {!!first.length && <details className="mt-3 rounded-xl border border-white/[0.06] p-3" open={!pairs.length}>
                <summary className="flex min-h-11 cursor-pointer items-center text-xs font-semibold text-white/65">Пока по одной игре · {first.length}</summary>
                <p className="my-2 text-[11px] leading-relaxed text-white/40">Вместе сыграли только раз — рано судить, насколько пара сильна.</p>
                <div className="space-y-3">{first.map(duo => <DuoRow key={`${duo.a_id}:${duo.b_id}`} duo={duo} />)}</div>
              </details>}
            </div>;
          })}
        </div>
      </section>
  );
  return (
    <div className="player-connections-layout space-y-3">
      {data.club_stories ? <ClubConnectionStories stories={data.club_stories} pairs={pairs} /> : pairs}

    </div>
  );
}
