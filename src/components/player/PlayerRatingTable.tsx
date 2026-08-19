import { useEffect, useMemo, useState } from 'react';
import { Badge } from '../ui/Badge.tsx';

type RatingPlayer = {
  place: number;
  player_id: string;
  nickname: string;
  elo: number;
  avatar_url?: string | null;
};

const rankChipClass = (place: number) => {
  if (place === 1) return 'border-amber-200/15 bg-amber-300/[0.12] text-amber-100';
  if (place === 2) return 'border-white/12 bg-white/[0.08] text-white/75';
  if (place === 3) return 'border-orange-200/10 bg-orange-300/[0.09] text-orange-100/80';
  return 'border-white/[0.07] bg-black/20 text-white/38';
};

export default function PlayerRatingTable({ playerId }: { playerId: string }) {
  const [players, setPlayers] = useState<RatingPlayer[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch('/api/rating', { credentials: 'include' })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body?.error || 'Не удалось загрузить рейтинг');
        if (!cancelled) setPlayers(Array.isArray(body?.players) ? body.players : []);
      })
      .catch((err: any) => { if (!cancelled) setError(err?.message || 'Не удалось загрузить рейтинг'); });
    return () => { cancelled = true; };
  }, []);

  const self = useMemo(
    () => players?.find((item) => item.player_id === playerId) || null,
    [playerId, players],
  );

  return (
    <main className="min-h-screen bg-[#090a0d] px-3 pb-28 pt-2 text-white">
      <div className="mx-auto w-full max-w-[430px] space-y-3">
        {self && (
          <section
            data-testid="rating-self-card"
            className="rounded-[28px] border border-white/10 p-4 shadow-[0_18px_60px_rgba(0,0,0,0.22)]"
            style={{
              background: 'linear-gradient(145deg, color-mix(in srgb, var(--ds-accent) 12%, transparent), rgba(255,255,255,0.045) 58%, rgba(255,255,255,0.025))',
            }}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--ds-accent)]">Твоя позиция</div>
                <div className="mt-2 flex items-end gap-2">
                  <div className="text-[34px] font-semibold leading-none">#{self.place}</div>
                  <div className="pb-0.5 text-xs text-white/35">в общем рейтинге</div>
                </div>
              </div>
              <Badge variant="accent" className="shrink-0">Вы</Badge>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <div className="rounded-2xl bg-black/20 px-3 py-3">
                <div className="text-xl font-semibold">{Math.round(Number(self.elo || 0))}</div>
                <div className="mt-1 text-[10px] uppercase tracking-[0.12em] text-white/32">Elo</div>
              </div>
              <div className="rounded-2xl bg-black/20 px-3 py-3">
                <div className="text-xl font-semibold">{players?.length || 0}</div>
                <div className="mt-1 text-[10px] uppercase tracking-[0.12em] text-white/32">игроков</div>
              </div>
            </div>
          </section>
        )}

        <section className="rounded-[24px] border border-white/10 bg-white/[0.04] p-3">
          <div className="mb-3 flex items-center justify-between gap-3 px-1">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/35">Общий рейтинг</div>
              <div className="mt-1 text-xs text-white/30">Актуальная таблица клуба</div>
            </div>
            {players && <Badge variant="neutral">{players.length}</Badge>}
          </div>

          {error ? (
            <div className="rounded-2xl border border-rose-300/15 bg-rose-300/[0.07] px-3 py-4 text-sm text-rose-100/75">{error}</div>
          ) : players === null ? (
            <div className="rounded-2xl bg-black/20 px-3 py-6 text-center text-sm text-white/35">Загружаем таблицу…</div>
          ) : players.length ? (
            <div className="space-y-1.5">
              {players.map((item) => {
                const isSelf = item.player_id === playerId;
                return (
                  <div
                    key={item.player_id}
                    data-testid={isSelf ? 'rating-self-row' : undefined}
                    className={`flex items-center gap-3 rounded-2xl border px-3 py-2.5 ${isSelf ? 'border-white/12 bg-[var(--ds-accent-soft)]' : 'border-transparent bg-black/20'}`}
                  >
                    <div className={`grid h-8 w-8 shrink-0 place-items-center rounded-xl border text-xs font-semibold ${rankChipClass(item.place)}`}>
                      {item.place}
                    </div>
                    {item.avatar_url ? (
                      <img src={item.avatar_url} alt={item.nickname} className="h-10 w-10 shrink-0 rounded-xl object-cover ring-1 ring-white/10" />
                    ) : (
                      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/[0.07] text-sm font-semibold text-white/55">{item.nickname.slice(0, 1).toUpperCase()}</div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 items-center gap-2">
                        <div className="min-w-0 truncate text-sm font-medium">{item.nickname}</div>
                        {isSelf && <span className="shrink-0 text-[9px] font-semibold uppercase tracking-[0.12em] text-[var(--ds-accent)]">вы</span>}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-sm font-semibold">{Math.round(Number(item.elo || 0))}</div>
                      <div className="text-[9px] uppercase tracking-wide text-white/25">Elo</div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="rounded-2xl bg-black/20 px-3 py-6 text-center text-sm text-white/35">Рейтинг пока пуст.</div>
          )}
        </section>
      </div>
    </main>
  );
}
