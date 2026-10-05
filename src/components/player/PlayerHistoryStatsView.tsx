import { useEffect, useRef, useState } from 'react';
import { EVENING_FORMAT_LABELS, normalizeEveningFormat } from '../../lib/eveningFormat.ts';
import type { PlayerMeResponse } from './PlayerCabinet.tsx';
import PlayerGameDetail, { type PlayerGameDetailData } from './PlayerGameDetail.tsx';

/**
 * «Игры → История»: the club's archive of finished games and the page of one game. A player's own games (with the filters,
 * roles, Elo change and points) live in his profile — «Профиль → Игры» — and open the same game page from here, so the
 * two places no longer repeat each other. A game has its own address, `/player/games/:key`.
 */

type AllGame = {
  id: string;
  source: 'club' | 'tournament';
  title: string;
  date: string | null;
  game_number: number;
  format: string;
  winner_team: 'red' | 'black' | null;
  judge_name: string | null;
};

const formatDate = (value: string | null) => {
  if (!value) return 'Дата не указана';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Europe/Moscow' }).format(date);
};

const winnerLabel = (winner: 'red' | 'black' | null) => {
  if (winner === 'red') return '🔴 Победа красных';
  if (winner === 'black') return '⚫ Победа чёрных';
  return 'Результат';
};

export default function PlayerGamesArchive({
  data,
  initialGameKey = null,
  onGameChange,
}: {
  data: PlayerMeResponse;
  /** The game opened by the address `/player/games/:key`. */
  initialGameKey?: string | null;
  /** Tells the shell which game is open (or none) so the address follows. */
  onGameChange?: (gameKey: string | null) => void;
}) {
  const [allGames, setAllGames] = useState<AllGame[] | null>(null);
  const [allGamesError, setAllGamesError] = useState<string | null>(null);
  const [selectedGameKey, setSelectedGameKey] = useState<string | null>(null);
  const [selectedGameDetail, setSelectedGameDetail] = useState<PlayerGameDetailData | null>(null);
  const [gameDetailLoading, setGameDetailLoading] = useState(false);
  const [gameDetailError, setGameDetailError] = useState<string | null>(null);
  const requested = useRef(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch('/api/player/games/all', { credentials: 'include' });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body?.error || 'Не удалось загрузить все игры');
        if (!cancelled) setAllGames(Array.isArray(body?.games) ? body.games : []);
      } catch (error: any) {
        if (!cancelled) setAllGamesError(error?.message || 'Не удалось загрузить все игры');
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const openGame = async (gameKey: string) => {
    const generation = ++requested.current;
    setSelectedGameKey(gameKey);
    setSelectedGameDetail(null);
    setGameDetailLoading(true);
    setGameDetailError(null);
    try {
      const response = await fetch(`/api/player/games/${encodeURIComponent(gameKey)}`, { credentials: 'include' });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || 'Не удалось загрузить игру');
      if (generation === requested.current) setSelectedGameDetail(body as PlayerGameDetailData);
    } catch (error: any) {
      if (generation === requested.current) setGameDetailError(error?.message || 'Не удалось загрузить игру');
    } finally {
      if (generation === requested.current) setGameDetailLoading(false);
    }
  };

  const closeGame = () => {
    requested.current += 1;
    setSelectedGameKey(null);
    setSelectedGameDetail(null);
    setGameDetailError(null);
    setGameDetailLoading(false);
  };

  const openedInApp = useRef(false);
  // The address decides which game is open: a link from the profile, the browser's back button, a bookmark.
  useEffect(() => {
    if (initialGameKey) { if (initialGameKey !== selectedGameKey) void openGame(initialGameKey); }
    else if (selectedGameKey) closeGame();
  }, [initialGameKey]);

  return (
    <main className="min-h-screen bg-[#090a0d] px-3 pb-28 pt-3 text-white">
      <div className="mx-auto flex w-full max-w-[430px] flex-col gap-3">
        {selectedGameKey ? (
          <>
            <PlayerGameDetail
              detail={selectedGameDetail}
              loading={gameDetailLoading}
              error={gameDetailError}
              selfId={data.player.id}
              onBack={() => {
                // A detail opened inside the app has its own history entry: step back instead of pushing a list entry on top.
                if (openedInApp.current || window.history.state?.gameReturn) { window.history.back(); return; }
                closeGame(); onGameChange?.(null);
              }}
            />
            {selectedGameKey.startsWith('club:') ? (
              <a href={`/player/replay/${encodeURIComponent(selectedGameKey)}`} data-track="game-open-replay" className="flex min-h-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.045] px-4 text-sm font-semibold text-sky-200/80">Replay игры ›</a>
            ) : null}
          </>
        ) : (
          <section className="rounded-3xl border border-white/10 bg-white/[0.045] p-4 shadow-[0_18px_60px_rgba(0,0,0,0.22)]">
            <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-white/45">Все игры клуба</h2>
            <p className="mt-1 text-[12px] leading-4 text-white/35">Твои игры с ролями, Elo и фильтрами — в профиле, во вкладке «Игры».</p>
            <div className="mt-3">
              {allGamesError ? <p className="rounded-2xl bg-black/20 px-3 py-4 text-sm text-white/45">{allGamesError}</p>
                : allGames === null ? <p className="rounded-2xl bg-black/20 px-3 py-4 text-sm text-white/45">Загрузка общего архива…</p>
                : allGames.length ? <div className="space-y-2">{allGames.map((game) => {
                  const normalizedFormat = normalizeEveningFormat(game.format);
                  return <button key={game.id} type="button" onClick={() => { openedInApp.current = true; void openGame(game.id); onGameChange?.(game.id); }} className="w-full rounded-2xl bg-black/20 p-3 text-left transition active:bg-white/[0.06]">
                    <div className="flex items-start justify-between gap-3"><div className="min-w-0 flex-1"><div className="truncate font-medium">{game.title}</div><div className="mt-1 text-xs text-white/40">{formatDate(game.date)}{game.game_number ? ` · Игра №${game.game_number}` : ''}</div></div><span className="shrink-0 rounded-full bg-white/[0.07] px-2 py-1 text-[11px] text-white/55">{game.source === 'tournament' ? 'Турнир' : EVENING_FORMAT_LABELS[normalizedFormat]}</span></div>
                    <div className="mt-3 flex items-center justify-between gap-2 text-xs"><span className="text-white/65">{winnerLabel(game.winner_team)}</span><span className="min-w-0 truncate text-right text-white/30">{game.judge_name ? `судья ${game.judge_name} · ` : ''}Подробнее ›</span></div>
                  </button>;
                })}</div> : <p className="rounded-2xl bg-black/20 px-3 py-4 text-sm text-white/45">Завершённых игр пока нет.</p>}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
