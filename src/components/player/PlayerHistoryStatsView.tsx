import { useCallback, useEffect, useRef, useState } from 'react';
import { EVENING_FORMAT_LABELS, normalizeEveningFormat } from '../../lib/eveningFormat.ts';
import { formatPlayerGameDate as formatDate } from '../../lib/playerGameDate.ts';
import { getPlayerGameWinnerLabel } from '../../lib/playerGameResultLabels.ts';
import { getPlayerGameRoleLabel } from '../../lib/playerGameRoleLabels.ts';
import { countGames } from '../../lib/russianPlural.ts';
import { RoleMark } from './PlayerGameGraphics.tsx';
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
      <div className="player-workspace mx-auto flex w-full max-w-5xl flex-col gap-3">
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
          <section data-testid="player-my-games" className="overflow-hidden rounded-3xl border border-white/10 bg-white/[.035]">
            <header className="p-4">
              <h2 className="text-lg font-semibold">Мои игры</h2><a href="/player/profile/games" className="mt-2 inline-flex min-h-11 items-center text-xs font-semibold text-sky-200">Найти игру по дате, роли или результату ›</a>
              {personalGames.length > 0 && <p className="mt-1 text-sm text-white/55">{countGames(personalGames.length)} · {wins} побед{finished.length ? ` · ${Math.round(wins / finished.length * 100)}% в завершённых` : ''}</p>}
            </header>
            {personalGames.length ? <div className="divide-y divide-white/[.07]">
              {personalGames.map((game) => <button key={game.id} type="button"
                onClick={() => { openedInApp.current = true; void openGame(game.id); onGameChange?.(game.id); }}
                className="ds-focus-ring flex min-h-11 w-full items-center gap-3 px-4 py-3 text-left hover:bg-white/[.035]">
                <RoleMark role={game.role} />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                    <span className="text-sm font-semibold">{game.title || 'Игра'} · №{game.game_number || '—'}</span>
                    <span className="text-xs text-white/50">{formatDate(game.date)}</span>
                  </span>
                  <span className="mt-1 block text-xs leading-5 text-white/65">
                    {[game.role ? getPlayerGameRoleLabel(game.role) : null, game.seat_number ? `Место №${game.seat_number}` : null,
                      game.won === true ? 'Победа' : game.won === false ? 'Поражение' : 'Без результата',
                      game.best_move ? 'Лучший ход' : null, game.first_killed ? 'Убит первым' : null].filter(Boolean).join(' · ')}
                  </span>
                </span>
                <span aria-hidden="true" className="shrink-0 text-lg text-white/45">›</span>
                <span className="sr-only">Протокол матча</span>
              </button>)}
            </div> : <p className="px-4 pb-4 text-sm leading-5 text-white/60">После первой завершённой игры здесь появятся результаты и роли.</p>}
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
                : allGames.length ? <div className="player-archive-list divide-y divide-white/[.07]">{allGames.map((game) => {
                  const normalizedFormat = normalizeEveningFormat(game.format);
                  return <button key={game.id} type="button" onClick={() => { openedInApp.current = true; void openGame(game.id); onGameChange?.(game.id); }}
                    className="ds-focus-ring flex min-h-11 w-full items-center gap-3 py-3 text-left hover:bg-white/[.035]">
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold">{game.title}<span className="font-normal text-white/55"> · №{game.game_number || '—'}</span></span>
                      <span className="mt-1 block text-xs leading-5 text-white/55">{[formatDate(game.date), game.source === 'tournament' ? 'Турнир' : EVENING_FORMAT_LABELS[normalizedFormat], winnerLabel(game.winner_team), game.judge_name ? 'Судья ' + game.judge_name : null].filter(Boolean).join(' · ')}</span>
                    </span><span aria-hidden="true" className="text-lg text-white/45">›</span>
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
