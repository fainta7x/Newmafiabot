import React, { useCallback, useEffect, useState } from 'react';

type LivePlayer = {
  seat_number: number;
  player_id: string | null;
  nickname: string;
};

type LiveGame = {
  id: number;
  local_number: number;
  global_number: number;
  table_name: string | null;
  judge_name: string | null;
  created_at: string | null;
  status: 'draft' | 'completed';
  winner_team: 'red' | 'black' | null;
  players: LivePlayer[];
};

type LiveCenterData = {
  evening: {
    id: string;
    title: string;
    starts_at: string | null;
    venue: string | null;
    format: string;
  };
  score: {
    red: number;
    black: number;
    completed: number;
    total_created: number;
  };
  present_count: number;
  state: 'game' | 'waiting';
  current_game: LiveGame | null;
  recent_results: Array<{
    id: number;
    local_number: number;
    winner_team: 'red' | 'black' | null;
    table_name: string | null;
    judge_name: string | null;
  }>;
};

const winnerText = (winner: 'red' | 'black' | null) => {
  if (winner === 'red') return '🔴 Красные';
  if (winner === 'black') return '⚫ Чёрные';
  return 'Результат не указан';
};

export default function PlayerLiveCenter() {
  const [live, setLive] = useState<LiveCenterData | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const refresh = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const response = await fetch('/api/player/live', { credentials: 'include' });
      if (!response.ok) return;
      const body = await response.json().catch(() => ({}));
      setLive(body?.live || null);
      setUpdatedAt(new Date());
      if (!body?.live) setOpen(false);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh(true);
    }, 15_000);

    const onVisibility = () => {
      if (document.visibilityState === 'visible') void refresh(true);
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [refresh]);

  if (!live) return null;

  const current = live.current_game;
  const statusText = current ? `Игра ${current.local_number}` : 'Между играми';

  return (
    <>
      <button
        type="button"
        onClick={() => { setOpen(true); void refresh(true); }}
        className="fixed bottom-[154px] left-1/2 z-40 flex w-[calc(100%-24px)] max-w-[406px] -translate-x-1/2 items-center gap-3 rounded-2xl border border-rose-400/25 bg-[#171318]/95 px-3 py-2.5 text-left shadow-[0_12px_40px_rgba(0,0,0,0.45)] backdrop-blur-xl"
      >
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-rose-500/15 px-2 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-rose-300">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-rose-400" />
          Live
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs font-semibold text-white">{live.evening.title}</span>
          <span className="mt-0.5 block truncate text-[10px] text-white/40">{statusText} · {live.score.completed} завершено</span>
        </span>
        <span className="shrink-0 text-sm font-black tabular-nums text-white">
          <span className="text-rose-300">{live.score.red}</span>
          <span className="mx-1 text-white/30">:</span>
          <span>{live.score.black}</span>
        </span>
      </button>

      {open && (
        <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/75 backdrop-blur-sm sm:items-center sm:p-4" onClick={() => setOpen(false)}>
          <section
            role="dialog"
            aria-modal="true"
            aria-label="Live-центр клуба"
            onClick={(event) => event.stopPropagation()}
            className="max-h-[88dvh] w-full max-w-[430px] overflow-y-auto rounded-t-[28px] border border-white/10 bg-[#111217] p-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-white shadow-2xl sm:rounded-[28px]"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/15 px-2 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-rose-300">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-rose-400" />Live
                  </span>
                  <span className="text-[10px] text-white/30">2LA Noire</span>
                </div>
                <h2 className="mt-2 truncate text-xl font-semibold">{live.evening.title}</h2>
                <p className="mt-1 text-xs text-white/40">{live.evening.venue || 'Игровой вечер клуба'}</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white/[0.06] text-lg text-white/55">×</button>
            </div>

            <div className="mt-4 rounded-[24px] border border-white/10 bg-gradient-to-b from-white/[0.08] to-white/[0.035] p-4">
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 text-center">
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-rose-300/70">Красные</div>
                  <div className="mt-1 text-4xl font-black tabular-nums text-rose-300">{live.score.red}</div>
                </div>
                <div className="text-xl font-light text-white/20">:</div>
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45">Чёрные</div>
                  <div className="mt-1 text-4xl font-black tabular-nums text-white">{live.score.black}</div>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <div className="rounded-2xl bg-black/20 p-3 text-center"><div className="text-lg font-semibold">{live.score.completed}</div><div className="text-[10px] text-white/35">игр завершено</div></div>
                <div className="rounded-2xl bg-black/20 p-3 text-center"><div className="text-lg font-semibold">{live.present_count}</div><div className="text-[10px] text-white/35">сейчас в клубе</div></div>
              </div>
            </div>

            <div className="mt-4 rounded-[22px] border border-white/10 bg-white/[0.04] p-4">
              {current ? (
                <>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-rose-300/70">Сейчас за столом</div>
                      <h3 className="mt-1 text-lg font-semibold">Игра {current.local_number}</h3>
                      <p className="mt-1 text-[11px] text-white/35">{[current.table_name, current.judge_name ? `ведущий ${current.judge_name}` : null].filter(Boolean).join(' · ') || 'Игра сформирована'}</p>
                    </div>
                    <span className="rounded-full bg-rose-500/10 px-2 py-1 text-[10px] font-semibold text-rose-300">в процессе</span>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-1.5">
                    {current.players.map((item) => (
                      <div key={`${current.id}:${item.seat_number}`} className="flex min-w-0 items-center gap-2 rounded-xl bg-black/20 px-2.5 py-2">
                        <span className="w-5 shrink-0 text-center text-[10px] font-mono text-white/30">{item.seat_number}</span>
                        <span className="truncate text-xs font-medium text-white/80">{item.nickname}</span>
                      </div>
                    ))}
                  </div>
                  <p className="mt-3 text-[10px] leading-4 text-white/25">Роли и скрытая информация игры в Live-центре не показываются.</p>
                </>
              ) : (
                <div className="py-4 text-center">
                  <div className="text-2xl">☕</div>
                  <div className="mt-2 text-sm font-semibold">Между играми</div>
                  <div className="mt-1 text-xs text-white/35">Ждём, когда ведущий сформирует следующую десятку.</div>
                </div>
              )}
            </div>

            {live.recent_results.length > 0 && (
              <div className="mt-4">
                <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">Последние результаты</div>
                <div className="space-y-1.5">
                  {live.recent_results.map((result) => (
                    <div key={result.id} className="flex items-center justify-between gap-3 rounded-xl bg-white/[0.04] px-3 py-2.5">
                      <div className="min-w-0"><div className="text-xs font-medium">Игра {result.local_number}</div><div className="mt-0.5 truncate text-[10px] text-white/30">{[result.table_name, result.judge_name ? `ведущий ${result.judge_name}` : null].filter(Boolean).join(' · ') || '2LA Noire'}</div></div>
                      <div className="shrink-0 text-xs font-semibold text-white/70">{winnerText(result.winner_team)}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-4 flex items-center justify-between text-[10px] text-white/25">
              <span>{updatedAt ? `Обновлено ${updatedAt.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}` : 'Live-данные'}</span>
              <button type="button" disabled={loading} onClick={() => void refresh()} className="min-h-9 rounded-xl bg-white/[0.06] px-3 font-semibold text-white/45 disabled:opacity-40">{loading ? 'Обновляем…' : 'Обновить'}</button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
