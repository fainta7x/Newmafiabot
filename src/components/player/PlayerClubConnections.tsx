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

function PersonRow({ item, kind }: { item: PersonRelationship; kind: 'rival' | 'mate' }) {
  const tone = kind === 'rival'
    ? 'border-rose-200/[0.07] bg-rose-300/[0.035]'
    : 'border-emerald-200/[0.07] bg-emerald-300/[0.035]';
  const valueTone = kind === 'rival' ? 'text-rose-100/85' : 'text-emerald-100/85';

  return (
    <button type="button" onClick={() => openCanonicalPlayerProfile(item.player_id)} className={`flex w-full items-center gap-3 rounded-2xl border p-2.5 text-left ${tone}`}>
      <Avatar src={item.avatar_url} name={item.nickname} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-xs font-semibold">{item.nickname}</div>
        <div className="mt-0.5 text-[11px] text-white/45">{kind === 'rival' ? 'против друг друга' : 'в одной команде'} {countGames(item.games)} · {countWins(item.wins)} твоей команды</div>
      </div>
      <div className={`shrink-0 text-sm font-semibold ${valueTone}`}>{item.win_rate}%</div>
    </button>
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
        <div className="mt-0.5 text-[11px] text-white/45">{countGames(duo.games)} вместе · {countWins(duo.wins)} команды · {duo.win_rate}%</div>
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

  if (loading) return <div className="rounded-[24px] border border-white/10 bg-white/[0.03] px-4 py-10 text-center text-xs text-white/35">Считаем противостояния и связки…</div>;
  if (error) return <div className="rounded-2xl border border-rose-300/15 bg-rose-300/[0.07] px-3 py-4 text-xs text-rose-100/75">{error}</div>;
  if (!data) return null;

  return (
    <div className="player-connections-layout space-y-3">
      {data.club_stories && <ClubConnectionStories stories={data.club_stories} />}
      <section data-testid="club-duos" className="rounded-[24px] border border-amber-200/10 bg-gradient-to-br from-amber-200/[0.045] to-white/[0.02] p-4">
        <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-100/60">Связи всего клуба</div>
        <h2 className="mt-1 text-lg font-semibold">Лучшие связки клуба</h2>
        <p className="mt-1 text-xs leading-relaxed text-white/45">Победы общей команды, отдельно за красных и чёрных. Это история совместных игр, а не оценка вклада каждого.</p>
        <div aria-label="Показать клубные пары" className="mt-3 flex gap-2">
          {([['best', 'По результатам'], ['played', 'Самые сыгранные']] as const).map(([value, label]) => <button key={value} type="button" aria-pressed={clubView === value} onClick={() => setClubView(value)} className={`min-h-10 flex-1 rounded-xl px-2 text-xs ${clubView === value ? 'bg-amber-200/10 text-amber-100' : 'bg-white/[0.035] text-white/50'}`}>{label}</button>)}
        </div>
        <p className="mt-2 text-[11px] text-white/40">{clubView === 'best' ? 'Топ учитывает долю побед и число совместных игр. Минимум две игры.' : 'Пары с наибольшим числом игр в одной команде. Минимум две игры.'}</p>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          {(['red', 'black'] as const).map(team => {
            const pairs = clubView === 'played' ? (data.club_most_played?.[team] ?? data.club_duos[team]) : data.club_duos[team];
            const first = data.club_first_games?.[team] ?? [];
            return <div key={team}>
              <h3 className={`mb-2 text-xs font-semibold ${team === 'red' ? 'text-rose-200/80' : 'text-white/65'}`}>{team === 'red' ? '🔴 За красных' : '⚫ За чёрных'}</h3>
              <div className="space-y-2">{pairs.map(duo => <DuoRow key={`${duo.a_id}:${duo.b_id}`} duo={duo} />)}</div>
              {!pairs.length && <p className="rounded-xl bg-black/15 p-3 text-xs leading-relaxed text-white/45">Пока нет пар с двумя совместными играми. После завершения новых игр топ обновится.</p>}
              {!!first.length && <details className="mt-3 rounded-xl border border-white/[0.06] p-3" open={!pairs.length}>
                <summary className="cursor-pointer text-xs font-semibold text-white/65">Первые совместные игры · {first.length}</summary>
                <p className="my-2 text-[11px] leading-relaxed text-white/40">У каждой пары пока одна игра. Рано делать выводы о силе связки.</p>
                <div className="space-y-2">{first.map(duo => <DuoRow key={`${duo.a_id}:${duo.b_id}`} duo={duo} />)}</div>
              </details>}
            </div>;
          })}
        </div>
      </section>
      <section data-testid="club-recent" className="rounded-[24px] border border-white/10 bg-white/[0.025] p-4">
        <h2 className="text-lg font-semibold">Недавние встречи</h2>
        {data.recent_event ? <>
          <p className="mt-1 text-xs text-white/50">{data.recent_event.title} · {new Date(data.recent_event.date).toLocaleDateString('ru-RU', { timeZone: 'Europe/Moscow' })}</p>
          <p className="mt-1 text-[11px] text-white/40">Твой последний сыгранный вечер или турнир. Один игрок может быть и напарником, и соперником в разных играх.</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">{([['teammates', 'В одной команде', 'mate'], ['rivals', 'По разные стороны', 'rival']] as const).map(([key, label, kind]) => <div key={key}>
            <h3 className="mb-2 text-xs font-semibold text-white/65">{label}</h3>
            <div className="space-y-2">{data.recent_event?.[key].map(item => <PersonRow key={item.player_id} item={item} kind={kind} />)}</div>
            {!data.recent_event?.[key].length && <p className="text-xs text-white/40">В протоколах этого события таких встреч нет.</p>}
          </div>)}</div>
        </> : <p className="mt-2 text-xs text-white/45">Здесь появятся участники твоего последнего завершённого вечера или турнира.</p>}
      </section>

      <section data-testid="club-rivals" className="rounded-[24px] border border-rose-200/[0.08] bg-gradient-to-br from-rose-300/[0.045] to-white/[0.025] p-4">
        <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-rose-200/55">Противостояния</div>
        <h2 className="mt-1 text-lg font-semibold">С кем чаще пересекаешься</h2>
        <div className="mt-3 space-y-1.5">
          {data.rivals.slice(0, 6).map((item) => <PersonRow key={item.player_id} item={item} kind="rival" />)}
          {!data.rivals.length && <p className="rounded-2xl bg-black/15 px-3 py-4 text-xs text-white/30">После новых игр здесь появятся частые соперники.</p>}
        </div>
      </section>

      <section data-testid="club-teammates" className="rounded-[24px] border border-emerald-200/[0.08] bg-gradient-to-br from-emerald-300/[0.045] to-white/[0.025] p-4">
        <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-200/55">Напарники</div>
        <h2 className="mt-1 text-lg font-semibold">С кем хорошо играется вместе</h2>
        <div className="mt-3 space-y-1.5">
          {data.teammates.slice(0, 6).map((item) => <PersonRow key={item.player_id} item={item} kind="mate" />)}
          {!data.teammates.length && <p className="rounded-2xl bg-black/15 px-3 py-4 text-xs text-white/30">Совместные игры появятся здесь.</p>}
        </div>
      </section>


    </div>
  );
}
