import { useEffect, useState } from 'react';

type RatingPlayer = {
  place: number;
  player_id: string;
  nickname: string;
  elo: number;
  avatar_url?: string | null;
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

  return (
    <main className="min-h-screen bg-[#090a0d] px-3 pb-28 pt-2 text-white">
      <div className="mx-auto w-full max-w-[430px]">
        <section className="rounded-[26px] border border-white/10 bg-white/[0.04] p-3">
          {error ? (
            <div className="rounded-2xl bg-rose-400/[0.07] px-3 py-4 text-sm text-rose-200/65">{error}</div>
          ) : players === null ? (
            <div className="rounded-2xl bg-black/20 px-3 py-6 text-center text-sm text-white/35">Загружаем таблицу…</div>
          ) : players.length ? (
            <div className="space-y-1.5">
              {players.map((item) => {
                const self = item.player_id === playerId;
                return (
                  <div key={item.player_id} className={`flex items-center gap-3 rounded-2xl px-3 py-2.5 ${self ? 'border border-amber-200/15 bg-amber-200/[0.06]' : 'bg-black/20'}`}>
                    <div className="w-7 shrink-0 text-center text-sm font-semibold text-white/40">{item.place}</div>
                    {item.avatar_url ? (
                      <img src={item.avatar_url} alt={item.nickname} className="h-10 w-10 shrink-0 rounded-xl object-cover ring-1 ring-white/10" />
                    ) : (
                      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/[0.07] text-sm font-semibold text-white/55">{item.nickname.slice(0, 1).toUpperCase()}</div>
                    )}
                    <div className="min-w-0 flex-1 truncate text-sm font-medium">{item.nickname}{self ? ' · вы' : ''}</div>
                    <div className="shrink-0 text-right"><div className="text-sm font-semibold">{Math.round(Number(item.elo || 0))}</div><div className="text-[9px] uppercase tracking-wide text-white/25">Elo</div></div>
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
