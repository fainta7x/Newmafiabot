import ClubConnectionStories from './ClubConnectionStories.tsx';
import type { ClubConnectionStories as ClubStories } from '../../shared/clubConnectionStories.ts';
import { countGames, countWins } from '../../lib/russianPlural';
import { useEffect, useState } from 'react';
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
  return src ? (
    <img src={src} alt="" onError={(event) => { event.currentTarget.style.display = 'none'; }} style={{ width: size, height: size }} className="shrink-0 rounded-xl object-cover" />
  ) : (
    <div style={{ width: size, height: size }} className="grid shrink-0 place-items-center rounded-xl bg-white/[0.06] text-xs font-semibold text-white/45">{name.slice(0, 1).toUpperCase()}</div>
  );
}

function DuoRow({ duo }: { duo: ClubDuo }) {
  const red = duo.team === 'red';
  return (
    <div className={`flex items-center gap-2 rounded-2xl border p-2.5 ${red ? 'border-rose-200/[0.07] bg-rose-300/[0.03]' : 'border-white/[0.06] bg-black/15'}`}>
      <div className="flex -space-x-2">
        <button type="button" aria-label={`Открыть профиль ${duo.a_name}`} onClick={() => openCanonicalPlayerProfile(duo.a_id)}><Avatar src={duo.a_avatar_url} name={duo.a_name} size={32} /></button>
        <button type="button" aria-label={`Открыть профиль ${duo.b_name}`} onClick={() => openCanonicalPlayerProfile(duo.b_id)}><Avatar src={duo.b_avatar_url} name={duo.b_name} size={32} /></button>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap gap-x-1 text-xs font-semibold">
          <button type="button" className="min-h-8 max-w-full break-words text-left" onClick={() => openCanonicalPlayerProfile(duo.a_id)}>{duo.a_name}</button>
          <span aria-hidden="true" className="self-center text-white/30">+</span>
          <button type="button" className="min-h-8 max-w-full break-words text-left" onClick={() => openCanonicalPlayerProfile(duo.b_id)}>{duo.b_name}</button>
        </div>
        <div className="mt-0.5 text-[11px] text-white/45">{countGames(duo.games)} вместе · {countWins(duo.wins)} · {duo.win_rate}%</div>
      </div>
    </div>
  );
}

export default function PlayerClubConnections() {
  const [clubView, setClubView] = useState<'best' | 'played'>('best');
  const [data, setData] = useState<RelationshipData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch('/api/player/relationships', { credentials: 'include' })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body?.error || 'Не удалось загрузить связи игроков');
        if (!cancelled) setData(body as RelationshipData);
      })
      .catch((loadError: any) => { if (!cancelled) setError(loadError?.message || 'Не удалось загрузить связи игроков'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  if (loading) return <div className="rounded-[24px] border border-white/10 bg-white/[0.03] px-4 py-10 text-center text-xs text-white/35">Считаем, кто с кем играл…</div>;
  if (error) return <div className="rounded-2xl border border-rose-300/15 bg-rose-300/[0.07] px-3 py-4 text-xs text-rose-100/75">{error}</div>;
  if (!data) return null;

  return (
    <div className="player-connections-layout space-y-3">
      {data.club_stories && <ClubConnectionStories stories={data.club_stories} />}
      <section data-testid="club-duos" className="rounded-[24px] border border-amber-200/10 bg-gradient-to-br from-amber-200/[0.045] to-white/[0.02] p-4">
        <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-100/60">Клуб</div>
        <h2 className="mt-1 text-lg font-semibold">Лучшие пары</h2>
        <p className="mt-1 text-xs leading-relaxed text-white/45">Кто чаще всего выигрывает вместе — отдельно за красных и за чёрных.</p>
        <div aria-label="Показать клубные пары" className="mt-3 flex gap-2">
          {([['best', 'По результатам'], ['played', 'Самые сыгранные']] as const).map(([value, label]) => <button key={value} type="button" aria-pressed={clubView === value} onClick={() => setClubView(value)} className={`min-h-10 flex-1 rounded-xl px-2 text-xs ${clubView === value ? 'bg-amber-200/10 text-amber-100' : 'bg-white/[0.035] text-white/50'}`}>{label}</button>)}
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
                <summary className="cursor-pointer text-xs font-semibold text-white/65">Пока по одной игре · {first.length}</summary>
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
