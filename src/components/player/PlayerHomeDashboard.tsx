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

type JudgingSummary = {
  player: { judge_level: 'none' | 'trainee' | 'host' | 'judge'; judge_level_label: string };
  club_games: Array<{ status: string }>;
  tournament_games: Array<{ status: string }>;
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

export default function PlayerHomeDashboard({
  data,
  canOpenAdmin,
  onOpenEvents,
  onOpenGames,
  onOpenRating,
  onOpenConduct,
}: {
  data: PlayerMeResponse;
  canOpenAdmin: boolean;
  onOpenEvents: (eventId?: string | null) => void;
  onOpenGames: () => void;
  onOpenRating: () => void;
  onOpenConduct: () => void;
}) {
  const [evenings, setEvenings] = useState<PlayerEvening[] | null>(null);
  const [rating, setRating] = useState<RatingPlayer[] | null>(null);
  const [judging, setJudging] = useState<JudgingSummary | null>(null);

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

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch('/api/player/judging', { credentials: 'include' });
        const body = await response.json().catch(() => ({}));
        if (!response.ok || cancelled) return;
        setJudging(body as JudgingSummary);
      } catch {
        if (!cancelled) setJudging(null);
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
  const latestGame = data.games.all[0] as any | undefined;
  const activeAssignments = judging
    ? [...judging.club_games, ...judging.tournament_games].filter((game) => game.status !== 'completed').length
    : 0;
  const canConduct = Boolean(judging && (judging.player.judge_level !== 'none' || activeAssignments > 0));

  return (
    <main className="min-h-screen bg-[#090a0d] px-3 pb-28 pt-3 text-white">
      <div className="mx-auto w-full max-w-[430px] space-y-3">
        <header className="px-1 pb-1 pt-1">
          <h1 className="text-2xl font-semibold">Главная</h1>
          <p className="mt-1 text-xs leading-5 text-white/40">Привет, {data.player.nickname}</p>
        </header>

        <section className="rounded-[28px] border border-white/10 bg-white/[0.045] p-4 shadow-[0_18px_60px_rgba(0,0,0,0.22)]">
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/35">Следующий вечер</div>
          {evenings === null ? (
            <div className="mt-3 rounded-2xl bg-black/20 px-3 py-4 text-sm text-white/40">Загрузка…</div>
          ) : nextEvening ? (
            <div className="mt-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-lg font-semibold">{nextEvening.title}</div>
                  <div className="mt-1 text-sm text-white/45">{formatEveningDate(nextEvening.starts_at)}</div>
                  {nextEvening.venue && <div className="mt-1 truncate text-xs text-white/32">📍 {nextEvening.venue}</div>}
                </div>
                <span className="shrink-0 rounded-full bg-white/[0.07] px-2.5 py-1 text-[10px] font-medium text-white/55">
                  {EVENING_FORMAT_LABELS[normalizeEveningFormat(nextEvening.format)]}
                </span>
              </div>
              <button type="button" onClick={() => onOpenEvents(nextEvening.id)} className="mt-4 flex min-h-12 w-full items-center justify-between rounded-2xl bg-white px-4 text-sm font-semibold text-black">
                <span>Выбрать игры</span>
                <span>→</span>
              </button>
            </div>
          ) : (
            <div className="mt-3 rounded-2xl bg-black/20 px-3 py-4 text-sm text-white/40">Ближайших игровых вечеров пока нет.</div>
          )}
        </section>

        <section className="rounded-[28px] border border-white/10 bg-gradient-to-b from-white/[0.08] to-white/[0.035] p-4 shadow-[0_18px_60px_rgba(0,0,0,0.22)]">
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/35">Твоя игра</div>
          <div className="mt-3 grid grid-cols-4 gap-2">
            <div className="rounded-2xl bg-black/20 p-3"><div className="text-xl font-semibold">{data.player.elo}</div><div className="mt-1 text-[10px] text-white/35">ELO</div></div>
            <div className="rounded-2xl bg-black/20 p-3"><div className="text-xl font-semibold">{selfRating ? `#${selfRating.place}` : '—'}</div><div className="mt-1 text-[10px] text-white/35">место</div></div>
            <div className="rounded-2xl bg-black/20 p-3"><div className="text-xl font-semibold">{stats.completedGames}</div><div className="mt-1 text-[10px] text-white/35">игр</div></div>
            <div className="rounded-2xl bg-black/20 p-3"><div className="text-xl font-semibold">{stats.winRate}%</div><div className="mt-1 text-[10px] text-white/35">побед</div></div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button type="button" onClick={onOpenRating} className="min-h-11 rounded-xl bg-white/[0.07] px-3 text-xs font-semibold text-white/70">Рейтинг</button>
            <button type="button" onClick={onOpenGames} className="min-h-11 rounded-xl bg-white/[0.07] px-3 text-xs font-semibold text-white/70">Мои игры</button>
          </div>
        </section>

        {latestGame && (
          <button type="button" onClick={onOpenGames} className="w-full rounded-[24px] border border-white/10 bg-white/[0.035] p-4 text-left">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/30">Последняя игра</div>
                <div className="mt-1 truncate text-sm font-semibold">{latestGame.title || 'Игра'}</div>
                <div className="mt-1 text-xs text-white/35">{[formatGameDate(latestGame.date), roleLabel(latestGame.role), latestGame.won === true ? 'Победа' : latestGame.won === false ? 'Поражение' : null].filter(Boolean).join(' · ')}</div>
              </div>
              <span className="text-xl text-white/20">›</span>
            </div>
          </button>
        )}

        {(canConduct || canOpenAdmin) && (
          <section className="rounded-[24px] border border-amber-200/10 bg-amber-200/[0.025] p-3">
            <div className="px-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-100/40">Рабочие инструменты</div>
            <div className="mt-2 space-y-1.5">
              {canConduct && (
                <button type="button" onClick={onOpenConduct} className="flex min-h-14 w-full items-center gap-3 rounded-2xl bg-black/20 px-3 text-left active:bg-white/[0.06]">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-200/[0.07] text-amber-100">▶</span>
                  <span className="min-w-0 flex-1"><span className="block text-sm font-semibold">Ведение игр</span><span className="mt-0.5 block text-[10px] text-white/35">{activeAssignments ? `${activeAssignments} активных назначений` : judging?.player.judge_level_label || 'Судейский режим'}</span></span>
                  <span className="text-lg text-white/20">›</span>
                </button>
              )}
              {canOpenAdmin && (
                <a href="/admin" className="flex min-h-14 items-center gap-3 rounded-2xl bg-black/20 px-3 text-left active:bg-white/[0.06]">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/[0.05] text-white/55">⚙</span>
                  <span className="min-w-0 flex-1"><span className="block text-sm font-semibold">Управление клубом</span><span className="mt-0.5 block text-[10px] text-white/35">Вечера, игроки и организационные задачи</span></span>
                  <span className="text-lg text-white/20">›</span>
                </a>
              )}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
