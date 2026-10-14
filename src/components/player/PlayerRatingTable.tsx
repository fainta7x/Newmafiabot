import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { openCanonicalPlayerProfile } from './playerProfileNavigation.ts';

type RatingPlayer = { place: number; player_id: string; nickname: string; elo: number; avatar_url?: string | null };

const rankAppearance = (place: number) => (
  place === 1
    ? 'border-amber-200/20 bg-amber-200/[0.09] text-amber-100'
    : place === 2
      ? 'border-white/20 bg-white/[0.07] text-white/85'
      : place === 3
        ? 'border-orange-200/20 bg-orange-200/[0.07] text-orange-100'
        : 'border-white/[0.08] bg-black/20 text-white/65'
);

function RatingAvatar({ player, featured = false }: { player: RatingPlayer; featured?: boolean }) {
  const size = featured ? 'h-12 w-12 rounded-2xl' : 'h-11 w-11 rounded-[14px]';
  return player.avatar_url
    ? <img src={player.avatar_url} alt="" className={`${size} shrink-0 object-cover ring-1 ring-white/10`} />
    : <div aria-hidden="true" className={`${size} grid shrink-0 place-items-center bg-white/[0.08] text-sm font-semibold text-white/75`}>{player.nickname.slice(0, 1).toUpperCase()}</div>;
}

function RatingPersonCard({ person, selfId, featured = false }: {
  person: RatingPlayer;
  selfId: string;
  featured?: boolean;
}) {
  const isSelf = person.player_id === selfId;
  return (
    <button
      type="button"
      data-testid={isSelf ? 'rating-self-row' : `rating-player-${person.player_id}`}
      onClick={() => openCanonicalPlayerProfile(person.player_id)}
      className={`ds-focus-ring flex min-h-[76px] w-full items-center gap-3 rounded-[20px] border p-3 text-left transition-colors active:bg-white/[0.1] ${isSelf ? 'border-white/25 bg-white/[0.09]' : featured ? rankAppearance(person.place) : 'border-white/[0.07] bg-black/20 hover:bg-white/[0.06]'}`}
      aria-label={`Открыть профиль ${person.nickname}, место ${person.place}, Elo ${Math.round(Number(person.elo || 0))}`}
    >
      <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-[14px] border text-[14px] font-semibold tabular-nums ${rankAppearance(person.place)}`} aria-hidden="true">
        {person.place}
      </span>
      <RatingAvatar player={person} featured={featured} />
      <span className="min-w-0 flex-1">
        <span className={`block line-clamp-2 break-words font-semibold leading-5 text-white ${featured ? 'text-[15px]' : 'text-[14px]'}`}>{person.nickname}</span>
        <span className="mt-0.5 block text-[12px] leading-4 text-white/45">{isSelf ? 'Мой профиль' : `${person.place}-е место`}</span>
      </span>
      <span className="shrink-0 text-right">
        <span className="block text-[17px] font-semibold tabular-nums leading-5 text-white">{Math.round(Number(person.elo || 0))}</span>
        <span className="mt-0.5 block text-[11px] text-white/45">Elo</span>
      </span>
      <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0 text-white/35" />
    </button>
  );
}

export default function PlayerRatingTable({ playerId }: { playerId: string }) {
  const [players, setPlayers] = useState<RatingPlayer[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const requestSeq = useRef(0);

  const loadRating = useCallback(async () => {
    const requestId = ++requestSeq.current;
    setError(null);
    setPlayers(null);
    try {
      const response = await fetch('/api/rating', { credentials: 'include' });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || 'Не удалось загрузить рейтинг');
      if (!Array.isArray(body?.players)) throw new Error('Не удалось загрузить рейтинг');
      if (requestId === requestSeq.current) setPlayers(body.players);
    } catch (err: any) {
      if (requestId === requestSeq.current) setError(err?.message || 'Не удалось загрузить рейтинг');
    }
  }, []);

  useEffect(() => {
    void loadRating();
    return () => { requestSeq.current += 1; };
  }, [loadRating]);

  const sorted = useMemo(() => (players || []).slice().sort((a, b) => a.place - b.place), [players]);
  const leaders = sorted.filter((item) => item.place <= 3);
  const others = sorted.filter((item) => item.place > 3);
  const self = players?.find((item) => item.player_id === playerId) || null;

  return (
    <section className="player-workspace-page min-h-screen bg-[#090a0d] px-3 pb-28 pt-2 text-white" aria-label="Общий рейтинг Elo">
      <div className="player-workspace player-rating-layout mx-auto w-full max-w-[430px] space-y-3">
        {self ? (
          <button
            type="button"
            onClick={() => openCanonicalPlayerProfile(self.player_id)}
            data-testid="rating-self-card"
            className="ds-focus-ring flex min-h-[88px] w-full items-center gap-3 rounded-[24px] border border-white/20 bg-white/[0.075] p-4 text-left"
          >
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white/[0.10] text-[22px] font-semibold tabular-nums text-white">#{self.place}</span>
            <span className="min-w-0 flex-1">
              <span className="block text-[12px] font-medium text-white/50">Моё место</span>
              <span className="mt-0.5 block text-sm font-semibold text-white">{self.nickname}</span>
              <span className="mt-0.5 block text-[11px] text-white/45">Среди {players?.length || 0} игроков</span>
            </span>
            <span className="shrink-0 text-right">
              <span className="block text-xl font-semibold tabular-nums">{Math.round(Number(self.elo || 0))}</span>
              <span className="mt-0.5 block text-[11px] text-white/45">Elo</span>
            </span>
            <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0 text-white/40" />
          </button>
        ) : null}

        <section className="rounded-[28px] border border-white/10 bg-white/[0.04] p-3.5" aria-label="Игроки рейтинга">
          <div className="mb-3 flex items-start justify-between gap-3 px-1">
            <div>
              <h2 className="text-base font-semibold text-white">Общий рейтинг</h2>
              <p className="mt-1 text-[12px] leading-4 text-white/45">Место в клубе по Elo</p>
            </div>
            {players ? <span className="rounded-full bg-white/[0.07] px-2.5 py-1 text-[12px] text-white/65" aria-label={`${players.length} игроков`}>{players.length}</span> : null}
          </div>

          {error ? (
            <div role="alert" data-testid="rating-load-error" className="space-y-3 rounded-2xl border border-rose-300/15 bg-rose-300/[0.07] p-4">
              <p className="text-[13px] leading-5 text-rose-100/80">{error}</p>
              <button type="button" onClick={() => void loadRating()} className="min-h-11 w-full rounded-xl border border-white/15 bg-white/[0.07] px-3 text-sm font-semibold text-white">Повторить</button>
            </div>
          ) : players === null ? (
            <div className="rounded-2xl bg-black/20 px-3 py-6 text-center text-[13px] text-white/50">Загружаем рейтинг…</div>
          ) : players.length ? (
            <div className="space-y-4">
              {leaders.length > 0 ? (
                <div data-testid="rating-leaders" className="space-y-2">
                  <h3 className="px-1 text-[11px] font-semibold uppercase tracking-[0.13em] text-white/50">Лидеры</h3>
                  {leaders.map((person) => <RatingPersonCard key={person.player_id} person={person} selfId={playerId} featured />)}
                </div>
              ) : null}
              {others.length > 0 ? (
                <div data-testid="rating-other-players" className="space-y-2">
                  <h3 className="px-1 text-[11px] font-semibold uppercase tracking-[0.13em] text-white/50">{leaders.length ? 'Остальные игроки' : 'Игроки клуба'}</h3>
                  {others.map((person) => <RatingPersonCard key={person.player_id} person={person} selfId={playerId} />)}
                </div>
              ) : null}
            </div>
          ) : (
            <div className="rounded-2xl bg-black/20 px-3 py-6 text-center text-sm text-white/50">Рейтинг пока пуст.</div>
          )}
        </section>
      </div>
    </section>
  );
}
