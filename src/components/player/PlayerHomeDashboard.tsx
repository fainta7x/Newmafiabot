import { useEffect, useMemo, useState } from 'react';
import { EVENING_FORMAT_LABELS, normalizeEveningFormat } from '../../lib/eveningFormat.ts';
import type { PlayerMeResponse } from '../../types/player.ts';

type PlayerEvening = {
  id: string;
  title: string;
  starts_at: string;
  venue: string | null;
  format: string;
};

type RatingPlayer = {
  place: number;
  player_id: string;
};

const formatEveningDate = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('ru-RU', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
};

const formatGameDate = (value: string | null | undefined) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' }).format(date);
};

const roleLabel = (role: string | null | undefined) => {
  if (role === 'citizen') return 'Мирный';
  if (role === 'sheriff') return 'Шериф';
  if (role === 'mafia') return 'Мафия';
  if (role === 'don') return 'Дон';
  return null;
};

const streakLabel = (games: PlayerMeResponse['games']['all']) => {
  const completed = games.filter((game) => game.status === 'completed' && typeof game.won === 'boolean');
  if (!completed.length) return null;
  const firstResult = completed[0].won;
  let count = 0;
  for (const game of completed) {
    if (game.won !== firstResult) break;
    count += 1;
  }
  if (!count) return null;
  return `${count} ${firstResult ? (count === 1 ? 'победа' : 'победы') : (count === 1 ? 'поражение' : 'поражения')} подряд`;
};

export default function PlayerHomeDashboard({
  data,
  onOpenEvents,
  onOpenGames,
  onOpenRating,
}: {
  data: PlayerMeResponse;
  onOpenEvents: (eventId?: string | null) => void;
  onOpenGames: () => void;
  onOpenRating: () => void;
}) {
  const [evenings, setEvenings] = useState<PlayerEvening[] | null>(null);
  const [rating, setRating] = useState<RatingPlayer[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch('/api/player/evenings', { credentials: 'include' });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) return;
        if (!cancelled) setEvenings(Array.isArray(body?.evenings) ? body.evenings : []);
      } catch {
        if (!cancelled) setEvenings([]);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch('/api/rating', { credentials: 'include' });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) return;
        if (!cancelled) setRating(Array.isArray(body?.players) ? body.players : []);
      } catch {
        if (!cancelled) setRating([]);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const nextEvening = useMemo(() => {
    const now = Date.now() - 60 * 60 * 1000;
    return (evenings || [])
      .filter((item) => new Date(item.starts_at).getTime() >= now)
      .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime())[0] || null;
  }, [evenings]);

  const selfRating = rating?.find((item) => item.player_id === data.player.id) || null;
  const stats = data.games.stats;
  const latestGame = data.games.all[0] as PlayerMeResponse['games']['all'][number] | undefined;
  const currentStreak = streakLabel(data.games.all);
  const recentResult = latestGame?.status === 'completed' && typeof latestGame.won === 'boolean'
    ? `${latestGame.won ? 'Победа' : 'Поражение'}${latestGame.date ? ` · ${formatGameDate(latestGame.date)}` : ''}`
    : null;

  return (
    <main className="min-h-screen bg-[#090a0d] px-3 pb-28 pt-3 text-white">
      <div className="mx-auto w-full max-w-[430px] space-y-3">
        <header className="px-1 pb-1 pt-1">
          <h1 className="text-2xl font-semibold">Главная</h1>
          <p className="mt-1 text-sm leading-5 text-white/50">Привет, {data.player.nickname}</p>
        </header>

        <section className="rounded-[28px] border border-white/10 bg-white/[0.045] p-4 shadow-[0_18px_60px_rgba(0,0,0,0.22)]">
          <div className="text-[12px] font-semibold uppercase tracking-[0.14em] text-white/50">Следующий вечер</div>
          {evenings === null ? (
            <div className="mt-3 rounded-2xl bg-black/20 px-3 py-4 text-sm text-white/50">Загрузка…</div>
          ) : nextEvening ? (
            <div className="mt-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="break-words text-lg font-semibold">{nextEvening.title}</div>
                  <div className="mt-1 text-sm text-white/55">{formatEveningDate(nextEvening.starts_at)}</div>
                  {nextEvening.venue && <div className="mt-1 line-clamp-2 text-sm leading-5 text-white/45">📍 {nextEvening.venue}</div>}
                </div>
                <span className="shrink-0 rounded-full bg-white/[0.07] px-2.5 py-1 text-[12px] font-medium text-white/65">
                  {EVENING_FORMAT_LABELS[normalizeEveningFormat(nextEvening.format)]}
                </span>
              </div>
              <button type="button" onClick={() => onOpenEvents(nextEvening.id)} className="mt-4 flex min-h-12 w-full items-center justify-between rounded-2xl bg-white px-4 text-sm font-semibold text-black">
                <span>Выбрать игры</span>
                <span>→</span>
              </button>
            </div>
          ) : (
            <div className="mt-3 rounded-2xl bg-black/20 px-3 py-4 text-sm text-white/50">Ближайших игровых вечеров пока нет.</div>
          )}
        </section>

        <section className="rounded-[28px] border border-white/10 bg-gradient-to-b from-white/[0.08] to-white/[0.035] p-4 shadow-[0_18px_60px_rgba(0,0,0,0.22)]">
          <div className="text-[12px] font-semibold uppercase tracking-[0.14em] text-white/50">Твоя игра</div>
          <div className="mt-3 grid grid-cols-4 gap-1.5">
            <div className="min-w-0 rounded-2xl bg-black/20 px-2 py-3"><div className="text-lg font-semibold tabular-nums">{data.player.elo}</div><div className="mt-1 text-[12px] text-white/50">Elo</div></div>
            <div className="min-w-0 rounded-2xl bg-black/20 px-2 py-3"><div className="text-lg font-semibold tabular-nums">{selfRating ? `#${selfRating.place}` : '—'}</div><div className="mt-1 text-[12px] text-white/50">место</div></div>
            <div className="min-w-0 rounded-2xl bg-black/20 px-2 py-3"><div className="text-lg font-semibold tabular-nums">{stats.completedGames}</div><div className="mt-1 text-[12px] text-white/50">игр</div></div>
            <div className="min-w-0 rounded-2xl bg-black/20 px-2 py-3"><div className="text-lg font-semibold tabular-nums">{stats.winRate}%</div><div className="mt-1 text-[12px] text-white/50">побед</div></div>
          </div>
          {(currentStreak || recentResult) ? (
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 rounded-2xl bg-black/15 px-3 py-2 text-[12px] text-white/55">
              {currentStreak ? <span>Серия: <b className="font-semibold text-white/75">{currentStreak}</b></span> : null}
              {recentResult ? <span>Последняя: <b className="font-semibold text-white/75">{recentResult}</b></span> : null}
            </div>
          ) : null}
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button type="button" onClick={onOpenRating} className="min-h-11 rounded-xl bg-white/[0.07] px-3 text-sm font-semibold text-white/75">Рейтинг</button>
            <button type="button" onClick={onOpenGames} className="min-h-11 rounded-xl bg-white/[0.07] px-3 text-sm font-semibold text-white/75">Мои игры</button>
          </div>
        </section>

        {latestGame && (
          <button type="button" onClick={onOpenGames} className="min-h-11 w-full rounded-[24px] border border-white/10 bg-white/[0.035] p-4 text-left">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="text-[12px] font-semibold uppercase tracking-[0.12em] text-white/45">Последняя игра</div>
                <div className="mt-1 line-clamp-2 text-sm font-semibold">{latestGame.title || 'Игра'}</div>
                <div className="mt-1 text-xs text-white/50">{[formatGameDate(latestGame.date), roleLabel(latestGame.role), latestGame.won === true ? 'Победа' : latestGame.won === false ? 'Поражение' : null].filter(Boolean).join(' · ')}</div>
              </div>
              <span className="text-xl text-white/35">›</span>
            </div>
          </button>
        )}
      </div>
    </main>
  );
}