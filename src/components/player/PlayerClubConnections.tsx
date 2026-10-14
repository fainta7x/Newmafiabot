import ClubConnectionStories from './ClubConnectionStories.tsx';
import { WinOrbit } from './PlayerVisualScenes.tsx';
import type { ClubConnectionStories as ClubStories } from '../../shared/clubConnectionStories.ts';
import { useCallback, useEffect, useRef, useState } from 'react';
import { openCanonicalPlayerProfile } from './playerProfileNavigation.ts';

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

function Avatar({ src, name, size = 36 }: { src?: string | null; name: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  const showImage = Boolean(src) && !failed;
  return <span style={{ width: size, height: size }} className="relative grid shrink-0 place-items-center overflow-hidden rounded-xl bg-gradient-to-br from-white/[0.14] to-white/[0.035] text-xs font-semibold text-white/65 ring-1 ring-white/10" aria-hidden="true">
    {name.trim().slice(0, 1).toUpperCase() || '?'}
    {showImage && <img src={src!} alt="" onError={() => setFailed(true)} className="absolute inset-0 h-full w-full object-cover" />}
  </span>;
}

function DuoRow({ duo }: { duo: ClubDuo }) {
  const red = duo.team === 'red';
  const members = [
    { id: duo.a_id, name: duo.a_name, avatar: duo.a_avatar_url },
    { id: duo.b_id, name: duo.b_name, avatar: duo.b_avatar_url },
  ];
  return <article data-testid={'club-duo-' + duo.a_id + '-' + duo.b_id}
    className={'relative overflow-hidden rounded-[24px] border bg-gradient-to-br p-4 ' + (red ? 'border-rose-200/15 from-rose-400/[.09] via-[#20161c] to-[#111216]' : 'border-violet-200/15 from-violet-400/[.09] via-[#1e1728] to-[#111216]')}>
    <div aria-hidden="true" className="absolute inset-x-0 top-10 h-[90px] bg-[radial-gradient(ellipse_at_center,rgba(213,194,148,.09),transparent_70%)]"/>
    <div className="relative flex items-center justify-between gap-1">
      {members.map((member, index) => <button key={member.id} type="button"
        aria-label={'Открыть профиль ' + member.name}
        onClick={() => openCanonicalPlayerProfile(member.id)}
        className="ds-focus-ring flex min-h-[100px] w-[38%] min-w-0 flex-col items-center justify-center gap-2 rounded-[18px] text-center transition active:scale-[.97]">
        <Avatar src={member.avatar} name={member.name} size={52}/>
        <span className="line-clamp-2 w-full break-words text-xs font-semibold text-white/85">{member.name}</span>
      </button>)}
      <div aria-hidden="true" className="pointer-events-none absolute left-[36%] right-[36%] top-8 flex items-center">
        <span className="h-px flex-1 bg-gradient-to-r from-white/15 to-amber-200/60"/>
        <span className="px-1 text-lg text-amber-200/75">◇</span>
        <span className="h-px flex-1 bg-gradient-to-r from-amber-200/60 to-white/15"/>
      </div>
    </div>
    <div className="mt-1 flex items-center gap-3 border-t border-white/10 pt-3">
      <div className="w-[105px] shrink-0"><WinOrbit percent={duo.win_rate} value={duo.win_rate + '%'} caption="доля побед" tone={red ? 'rose' : 'violet'}/></div>
      <div className="min-w-0 flex-1 space-y-2">
        <div><strong className="text-xl font-semibold tabular-nums text-white">{duo.games}</strong><span className="ml-2 text-xs text-white/55">игр вместе</span></div>
        <div><strong className="text-xl font-semibold tabular-nums text-white">{duo.wins}</strong><span className="ml-2 text-xs text-white/55">побед</span></div>
      </div>
    </div>
  </article>;
}
export default function PlayerClubConnections() {
  const [clubView, setClubView] = useState<'best' | 'played'>('best');
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
      const response = await fetch('/api/player/relationships', { credentials: 'include' });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || 'Не удалось загрузить связи игроков');
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

  return (
    <div className="player-connections-layout space-y-3">
      {data.club_stories && <ClubConnectionStories stories={data.club_stories} />}
      <section data-testid="club-duos" className="rounded-[30px] border border-amber-200/15 bg-gradient-to-br from-amber-200/[0.065] via-[#161519] to-[#101116] p-4 sm:p-6">
        <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-100/60">Клуб</div>
        <h2 className="mt-1 text-lg font-semibold">Лучшие пары</h2>
        <p className="mt-1 text-xs leading-relaxed text-white/45">Кто чаще всего выигрывает вместе — отдельно за красных и за чёрных.</p>
        <div aria-label="Показать клубные пары" className="mt-3 flex gap-2">
          {([['best', 'По результатам'], ['played', 'Самые сыгранные']] as const).map(([value, label]) => <button key={value} type="button" aria-pressed={clubView === value} onClick={() => setClubView(value)} className={`min-h-11 flex-1 rounded-xl px-2 text-[12px] font-medium ${clubView === value ? 'bg-amber-200/10 text-amber-100' : 'bg-white/[0.035] text-white/55'}`}>{label}</button>)}
        </div>
        <p className="mt-2 text-[11px] text-white/40">{clubView === 'best' ? 'В списке пары, которые сыграли вместе хотя бы дважды.' : 'Пары, которые чаще всего играли в одной команде.'}</p>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          {(['red', 'black'] as const).map(team => {
            const pairs = clubView === 'played' ? (data.club_most_played?.[team] ?? data.club_duos[team]) : data.club_duos[team];
            const first = data.club_first_games?.[team] ?? [];
            return <div key={team}>
              <h3 className={`mb-2 text-xs font-semibold ${team === 'red' ? 'text-rose-200/80' : 'text-white/65'}`}>{team === 'red' ? '🔴 Красные' : '⚫ Чёрные'}</h3>
              <div className="space-y-2">{pairs.map(duo => <DuoRow key={`${duo.a_id}:${duo.b_id}`} duo={duo} />)}</div>
              {!pairs.length && <p className="rounded-xl bg-black/15 p-3 text-xs leading-relaxed text-white/45">Пока нет пар, которые сыграли вместе дважды.</p>}
              {!!first.length && <details className="mt-3 rounded-xl border border-white/[0.06] p-3" open={!pairs.length}>
                <summary className="flex min-h-11 cursor-pointer items-center text-xs font-semibold text-white/65">Пока по одной игре · {first.length}</summary>
                <p className="my-2 text-[11px] leading-relaxed text-white/40">Вместе сыграли только раз — рано судить, насколько пара сильна.</p>
                <div className="space-y-2">{first.map(duo => <DuoRow key={`${duo.a_id}:${duo.b_id}`} duo={duo} />)}</div>
              </details>}
            </div>;
          })}
        </div>
      </section>
    </div>
  );
}
