import { useEffect, useState } from 'react';
import type { PlayerMeResponse } from '../../types/player.ts';
import PlayerEloJourney from './PlayerEloJourney.tsx';
import PlayerRatingPeriods from './PlayerRatingPeriods.tsx';
import PlayerSeasonsPanel from './PlayerSeasonsPanel.tsx';

export type PlayerRatingSection = 'rating' | 'elo' | 'ratingperiods' | 'clubworld';

type RatingPlayer = {
  place: number;
  player_id: string;
  nickname: string;
  elo: number;
  avatar_url?: string | null;
};

const TABS: Array<{ id: PlayerRatingSection; label: string }> = [
  { id: 'rating', label: 'Таблица' },
  { id: 'elo', label: 'Динамика' },
  { id: 'ratingperiods', label: 'Периоды' },
  { id: 'clubworld', label: 'Сезоны' },
];

function RatingTable({ playerId }: { playerId: string }) {
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
    <main className="min-h-screen bg-[#090a0d] px-3 pb-28 pt-3 text-white">
      <div className="mx-auto w-full max-w-[430px] space-y-3">
        <header className="px-1 pt-1">
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-100/40">Рейтинг клуба</div>
          <h1 className="mt-1 text-2xl font-semibold">Кто где сейчас</h1>
          <p className="mt-1 text-xs leading-5 text-white/40">Актуальная таблица Elo. Твоя строка всегда выделена.</p>
        </header>

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

export default function PlayerRatingHub({
  data,
  section,
  onOpen,
}: {
  data: PlayerMeResponse;
  section: PlayerRatingSection;
  onOpen: (section: PlayerRatingSection) => void;
}) {
  return (
    <div className="bg-[#090a0d] text-white">
      <div className="mx-auto w-full max-w-[430px] px-3 pt-3">
        <div className="grid grid-cols-4 gap-1 rounded-2xl border border-white/[0.07] bg-white/[0.035] p-1">
          {TABS.map((tab) => {
            const active = section === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => onOpen(tab.id)}
                aria-current={active ? 'page' : undefined}
                className={`min-h-10 rounded-xl px-1 text-[11px] font-semibold transition ${active ? 'bg-white text-black' : 'text-white/42 active:bg-white/[0.05]'}`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {section === 'rating' ? (
        <RatingTable playerId={data.player.id} />
      ) : section === 'elo' ? (
        <PlayerEloJourney />
      ) : section === 'ratingperiods' ? (
        <main className="min-h-screen bg-[#090a0d] px-3 pb-28 pt-3 text-white">
          <div className="mx-auto w-full max-w-[430px] space-y-3">
            <header className="px-1 pt-1"><div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/35">Рейтинговые периоды</div><h1 className="mt-1 text-2xl font-semibold">Текущий зачёт</h1><p className="mt-1 text-xs leading-5 text-white/40">Отдельные рейтинговые дистанции, таблицы и начисленные баллы.</p></header>
            <PlayerRatingPeriods playerId={data.player.id} />
          </div>
        </main>
      ) : (
        <main className="min-h-screen bg-[#090a0d] px-3 pb-28 pt-3 text-white">
          <div className="mx-auto w-full max-w-[430px]">
            <header className="px-1 pt-1"><div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-sky-100/40">Сезоны клуба</div><h1 className="mt-1 text-2xl font-semibold">Сезоны и рекорды</h1><p className="mt-1 text-xs leading-5 text-white/40">Текущий сезон, архив, лидеры и рекорды без лишней клубной ленты.</p></header>
            <div className="mt-3"><PlayerSeasonsPanel /></div>
          </div>
        </main>
      )}
    </div>
  );
}
