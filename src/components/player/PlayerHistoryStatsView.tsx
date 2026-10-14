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
          <section data-testid="player-my-games" className="relative overflow-hidden rounded-[30px] border border-amber-200/10 bg-[#111115] p-4 sm:p-6">
            <div aria-hidden="true" className="pointer-events-none absolute -right-8 top-0 text-[170px] leading-none text-amber-200/[.035]">♠</div>
            <div className="relative">
              <div className="text-[10px] font-semibold uppercase tracking-[.18em] text-amber-200/55">2LA Noire · Архив матчей</div>
              <h2 className="mt-1 text-2xl font-semibold">Мои игры</h2>
              <p className="mt-1 max-w-xl text-xs leading-5 text-white/50">История твоих партий. Каждый постер — отдельный матч с ролью, исходом и протоколом.</p>
            </div>
            {personalGames.length ? <>
              <div className="relative mt-5 grid items-center gap-4 rounded-[24px] border border-amber-200/10 bg-gradient-to-r from-amber-200/[.085] via-[#1a1818] to-[#121318] p-4 sm:grid-cols-[1fr_1.1fr]">
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div><div className="text-2xl font-semibold tabular-nums text-white">{personalGames.length}</div><div className="mt-1 text-[10px] text-white/45">матчей</div></div>
                  <div><div className="text-2xl font-semibold tabular-nums text-emerald-200">{wins}</div><div className="mt-1 text-[10px] text-white/45">побед</div></div>
                  <div><div className="text-2xl font-semibold tabular-nums text-amber-100">{finished.length ? Math.round(wins / finished.length * 100) : 0}%</div><div className="mt-1 text-[10px] text-white/45">побед в завершённых</div></div>
                </div>
                <div aria-label="Результаты последних игр">
                  <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-white/50">Последние {Math.min(finished.length, 8)} игр</div>
                  {finished.length ? <div className="flex h-[62px] items-end gap-1.5 overflow-hidden rounded-xl border-b border-white/15 pb-1.5">
                    {finished.slice(0, 8).map((game, i) =>
                      <span key={game.id} title={game.won ? 'Победа' : 'Поражение'} aria-label={game.won ? 'Победа' : 'Поражение'}
                        className={'relative min-w-0 flex-1 rounded-t-md ' + (game.won ? 'bg-gradient-to-t from-emerald-400/35 to-emerald-300' : 'bg-gradient-to-t from-rose-500/30 to-rose-300')}
                        style={{height: game.won ? '100%' : '34%'}}><span className="sr-only">{i + 1}</span></span>)}
                  </div> : <p className="text-xs text-white/45">Завершённых игр пока нет</p>}
                  <p className="mt-1.5 text-[10px] text-white/45">Зелёный — победа, красный — поражение. Слева — последняя.</p>
                </div>
              </div>
              <div className="mt-5 mb-3 flex items-center justify-between"><h3 className="text-xs font-semibold uppercase tracking-[.16em] text-white/65">Каталог партий</h3><span className="text-[10px] text-white/40">{countGames(personalGames.length)}</span></div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {personalGames.map((game) => {
                  const role = game.role ? getPlayerGameRoleLabel(game.role) : null;
                  const red = game.role === 'citizen' || game.role === 'sheriff';
                  const black = game.role === 'mafia' || game.role === 'don';
                  const emblem = game.role === 'don' ? '♛' : game.role === 'sheriff' ? '✦' : game.role === 'mafia' ? '♠' : '◆';
                  return <button key={game.id} type="button" onClick={() => { openedInApp.current = true; void openGame(game.id); onGameChange?.(game.id); }}
                    className={'group relative flex min-h-[230px] min-w-0 flex-col justify-between overflow-hidden rounded-[24px] border p-4 text-left shadow-[0_12px_30px_rgba(0,0,0,.18)] transition-transform enabled:active:scale-[.98] ' +
                      (black ? 'border-violet-200/15 bg-gradient-to-br from-[#352541] via-[#17131e] to-[#111217]' : red ? 'border-rose-200/15 bg-gradient-to-br from-[#472932] via-[#22161a] to-[#111217]' : 'border-amber-200/10 bg-gradient-to-br from-[#2c2826] to-[#111217]')}>
                    <span aria-hidden="true" className="pointer-events-none absolute -right-4 top-3 text-[155px] leading-none text-white/[.07] transition-transform group-hover:scale-105">{emblem}</span>
                    <span className="relative z-10 flex items-start justify-between gap-3">
                      <span className="rounded-full border border-white/15 bg-black/25 px-2.5 py-1 text-[10px] font-semibold text-white/70">№{game.game_number || '—'}</span>
                      <span className={'rounded-full px-2.5 py-1 text-[10px] font-semibold ' + (game.won === true ? 'bg-emerald-300/15 text-emerald-200' : game.won === false ? 'bg-rose-300/15 text-rose-200' : 'bg-white/10 text-white/60')}>{game.won === true ? 'Победа' : game.won === false ? 'Поражение' : 'Без результата'}</span>
                    </span>
                    <span className="relative z-10 flex min-w-0 flex-col items-start gap-2">
                      <span className="text-[10px] uppercase tracking-widest text-amber-200/55">{formatDate(game.date)}</span>
                      <span className="line-clamp-2 text-lg font-semibold leading-6 text-white">{game.title || 'Игра'}</span>
                      <span className="flex flex-wrap items-center gap-2 text-[11px] text-white/60">
                        {role && <span className="rounded-full border border-white/15 px-2 py-1">{role}</span>}
                        {game.seat_number ? <span>Место №{game.seat_number}</span> : null}
                      </span>
                      {(game.best_move || game.first_killed) && <span className="text-[10px] font-medium text-amber-200/80">{[game.best_move ? '✦ Лучший ход' : null, game.first_killed ? 'Убит первым' : null].filter(Boolean).join(' · ')}</span>}
                    </span>
                    <span className="relative z-10 mt-4 flex items-center justify-between border-t border-white/15 pt-3 text-xs font-semibold text-white/65"><span>Протокол матча</span><span className="text-base text-amber-100/70">↗</span></span>
                  </button>;
                })}
              </div>
            </> : <p className="mt-4 rounded-2xl border border-white/10 bg-black/20 px-4 py-5 text-sm text-white/60">Ты ещё не играл. После первой завершённой игры здесь появятся результаты и роли.</p>}
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
                : allGames.length ? <div className="player-archive-list grid gap-3 sm:grid-cols-2">{allGames.map((game) => {
                  const normalizedFormat = normalizeEveningFormat(game.format);
                  return <button key={game.id} type="button" onClick={() => { openedInApp.current = true; void openGame(game.id); onGameChange?.(game.id); }} className="w-full rounded-[22px] border border-white/10 bg-gradient-to-br from-white/[0.055] to-black/30 p-4 text-left transition active:bg-white/[0.08]">
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
