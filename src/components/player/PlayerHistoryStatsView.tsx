import { useCallback, useEffect, useRef, useState } from 'react';
import { EVENING_FORMAT_LABELS, normalizeEveningFormat } from '../../lib/eveningFormat.ts';
import { formatPlayerGameDate as formatDate } from '../../lib/playerGameDate.ts';
import { getPlayerGameWinnerLabel } from '../../lib/playerGameResultLabels.ts';
import { getPlayerGameRoleLabel } from '../../lib/playerGameRoleLabels.ts';
import { countGames, countWins } from '../../lib/russianPlural.ts';
import type { PlayerMeResponse } from './PlayerCabinet.tsx';
import PlayerGameDetail, { type PlayerGameDetailData } from './PlayerGameDetail.tsx';
import { getJson } from '../../lib/requestJson.ts';

/**
 * «Вечера → Мои игры» starts with the signed-in player's actual game history.
 * The complete club archive remains available as a secondary disclosure.
 * Both lists reuse the same canonical game-detail URL /player/games/:key.
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

const winnerLabel = (winner: 'red' | 'black' | null) =>
  getPlayerGameWinnerLabel(winner) ?? 'Результат';

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
  const [clubArchiveOpen, setClubArchiveOpen] = useState(false);
  const [allGames, setAllGames] = useState<AllGame[] | null>(null);
  const [allGamesError, setAllGamesError] = useState<string | null>(null);
  const archiveRequestSeq = useRef(0);
  const [selectedGameKey, setSelectedGameKey] = useState<string | null>(null);
  const [selectedGameDetail, setSelectedGameDetail] = useState<PlayerGameDetailData | null>(null);
  const [gameDetailLoading, setGameDetailLoading] = useState(false);
  const [gameDetailError, setGameDetailError] = useState<string | null>(null);
  const requested = useRef(0);

  const loadClubArchive = useCallback(async () => {
    const requestId = ++archiveRequestSeq.current;
    setAllGames(null);
    setAllGamesError(null);
    try {
      const body = await getJson<any>('/api/player/games/all', 'Не удалось загрузить все игры');
      if (requestId === archiveRequestSeq.current) setAllGames(Array.isArray(body?.games) ? body.games : []);
    } catch (error: any) {
      if (requestId === archiveRequestSeq.current) setAllGamesError(error?.message || 'Не удалось загрузить все игры');
    }
  }, []);

  useEffect(() => {
    if (clubArchiveOpen) void loadClubArchive();
    return () => { archiveRequestSeq.current += 1; };
  }, [clubArchiveOpen, loadClubArchive]);

  const personalGames = data.games?.all ?? [];
  const finished = personalGames.filter((game) => game.status === 'completed' && typeof game.won === 'boolean');
  const wins = finished.filter((game) => game.won).length;

  const openGame = async (gameKey: string) => {
    const generation = ++requested.current;
    setSelectedGameKey(gameKey);
    setSelectedGameDetail(null);
    setGameDetailLoading(true);
    setGameDetailError(null);
    try {
      const body = await getJson<any>(`/api/player/games/${encodeURIComponent(gameKey)}`, 'Не удалось загрузить игру');
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
    <main className="player-workspace-page min-h-screen bg-[#090a0d] px-3 pb-28 pt-3 text-white">
      <div className="player-workspace mx-auto flex w-full max-w-[430px] flex-col gap-3">
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
              <button type="button" onClick={() => { window.history.pushState({ replayFromProtocol: true }, '', `/player/replay/${encodeURIComponent(selectedGameKey)}`); window.dispatchEvent(new PopStateEvent('popstate')); }} data-track="game-open-replay" className="flex min-h-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.045] px-4 text-sm font-semibold text-sky-200/80">Replay игры ›</button>
            ) : null}
          </>
        ) : (
          <>
          <section data-testid="player-my-games" className="rounded-3xl border border-white/10 bg-white/[0.045] p-4 shadow-[0_18px_60px_rgba(0,0,0,0.22)]">
            <h2 className="text-lg font-semibold">Мои игры</h2>
            <p className="mt-1 text-xs leading-5 text-white/55">Твои роли, места за столом и результаты. Нажми на игру, чтобы открыть протокол.</p>
            {personalGames.length ? (
              <>
                <div className="mt-3 flex items-center gap-2 text-xs text-white/60">
                  <span className="rounded-xl bg-white/[0.055] px-3 py-2"><b className="text-white">{countGames(personalGames.length)}</b></span>
                  <span className="rounded-xl bg-white/[0.055] px-3 py-2"><b className="text-emerald-300">{countWins(wins)}</b></span>
                  <span className="rounded-xl bg-white/[0.055] px-3 py-2"><b className="text-white">{finished.length ? Math.round(wins / finished.length * 100) : 0}%</b> побед</span>
                </div>
                {finished.length ? <div className="mt-3" aria-label="Результаты последних игр">
                  <div className="mb-2 text-[11px] uppercase tracking-wider text-white/45">Последние {Math.min(finished.length, 8)} игр</div>
                  <div className="grid grid-cols-8 gap-1.5">{finished.slice(0, 8).map((game) => (
                    <span key={game.id} title={game.won ? 'Победа' : 'Поражение'} aria-label={game.won ? 'Победа' : 'Поражение'} className={`h-2.5 rounded-full ${game.won ? 'bg-emerald-400/85' : 'bg-rose-400/80'}`} />
                  ))}</div>
                  <p className="mt-1.5 text-[11px] text-white/45">Зелёный — победа, красный — поражение. Слева — последняя.</p>
                </div> : null}
                <div className="mt-4 space-y-2">
                  {personalGames.map((game) => (
                    <button key={game.id} type="button" onClick={() => { openedInApp.current = true; void openGame(game.id); onGameChange?.(game.id); }} className="flex min-h-16 w-full items-start justify-between gap-3 rounded-2xl border border-white/[0.07] bg-black/20 p-3 text-left active:bg-white/[0.06]">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">{game.title || 'Игра'}{game.game_number ? ` · №${game.game_number}` : ''}</span>
                        <span className="mt-1 block text-xs text-white/50">{[formatDate(game.date), game.role ? getPlayerGameRoleLabel(game.role) : null, game.seat_number ? `место №${game.seat_number}` : null].filter(Boolean).join(' · ')}</span>
                        {(game.best_move || game.first_killed) ? <span className="mt-1.5 block text-[11px] text-amber-200/80">{[game.best_move ? 'Лучший ход' : null, game.first_killed ? 'Убит первым' : null].filter(Boolean).join(' · ')}</span> : null}
                      </span>
                      <span className="shrink-0 text-right">
                        <span className={`block text-xs font-semibold ${game.won === true ? 'text-emerald-300' : game.won === false ? 'text-rose-300' : 'text-white/50'}`}>{game.won === true ? 'Победа' : game.won === false ? 'Поражение' : 'Без результата'}</span>
                        <span className="mt-2 block text-[11px] text-white/45">Подробнее ›</span>
                      </span>
                    </button>
                  ))}
                </div>
              </>
            ) : <p className="mt-4 rounded-2xl bg-black/20 px-4 py-5 text-sm text-white/60">Ты ещё не играл. После первой завершённой игры здесь появятся результаты и роли.</p>}
          </section>
          <details className="rounded-3xl border border-white/10 bg-white/[0.025] p-4" onToggle={(event) => setClubArchiveOpen(event.currentTarget.open)}>
            <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-2 text-sm font-semibold text-white/70">
              Все игры клуба <span className="text-white/40">Открыть архив ▾</span>
            </summary>
            <p className="mt-1 text-xs leading-5 text-white/45">Полный архив, включая игры других участников.</p>
            <div className="mt-3">
              {allGamesError ? <div role="alert" data-testid="player-games-archive-error" className="space-y-3 rounded-2xl bg-black/20 px-3 py-4 text-sm text-white/60">
                  <p>{allGamesError}</p>
                  <button type="button" onClick={() => void loadClubArchive()} className="min-h-11 w-full rounded-xl border border-white/15 bg-white/[0.07] px-3 font-semibold text-white">Повторить</button>
                </div>
                : allGames === null ? <p className="rounded-2xl bg-black/20 px-3 py-4 text-sm text-white/45">Загрузка общего архива…</p>
                : allGames.length ? <div className="player-archive-list space-y-2">{allGames.map((game) => {
                  const normalizedFormat = normalizeEveningFormat(game.format);
                  return <button key={game.id} type="button" onClick={() => { openedInApp.current = true; void openGame(game.id); onGameChange?.(game.id); }} className="w-full rounded-2xl bg-black/20 p-3 text-left transition active:bg-white/[0.06]">
                    <div className="flex items-start justify-between gap-3"><div className="min-w-0 flex-1"><div className="truncate font-medium">{game.title}</div><div className="mt-1 text-xs text-white/40">{formatDate(game.date)}{game.game_number ? ` · Игра №${game.game_number}` : ''}</div></div><span className="shrink-0 rounded-full bg-white/[0.07] px-2 py-1 text-[11px] text-white/55">{game.source === 'tournament' ? 'Турнир' : EVENING_FORMAT_LABELS[normalizedFormat]}</span></div>
                    <div className="mt-3 flex items-center justify-between gap-2 text-xs"><span className="text-white/65">{winnerLabel(game.winner_team)}</span><span className="min-w-0 truncate text-right text-white/30">{game.judge_name ? `судья ${game.judge_name} · ` : ''}Подробнее ›</span></div>
                  </button>;
                })}</div> : <p className="rounded-2xl bg-black/20 px-3 py-4 text-sm text-white/45">Завершённых игр пока нет.</p>}
            </div>
          </details>
          </>
        )}
      </div>
    </main>
  );
}
