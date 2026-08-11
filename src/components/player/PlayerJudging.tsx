import React, { useEffect, useMemo, useState } from 'react';
import { EVENING_FORMAT_LABELS, normalizeEveningFormat } from '../../lib/eveningFormat.ts';
import type { Tournament, TournamentGame } from '../../lib/api.ts';
import type { ClubGameRecord } from '../../lib/clubGamesApi.ts';
import { EveningLiveGameModal } from '../crm/EveningLiveGameModal.tsx';
import { GameProtocolModal } from '../crm/tournaments/GameProtocolModal.tsx';
import { TournamentGameSetup } from '../crm/tournaments/TournamentGameSetup.tsx';

type JudgeLevel = 'none' | 'trainee' | 'host' | 'judge';

type JudgingClubGame = ClubGameRecord & {
  evening_title: string;
  evening_format: string;
  evening_starts_at: string;
  required_level: JudgeLevel;
  can_conduct: boolean;
};

type JudgingTournamentGame = TournamentGame & {
  judge_player_id?: string | null;
  tournament_title: string;
  tournament_date: string;
  tournament_status: string;
  venue?: string | null;
  required_level: 'judge';
  can_conduct: boolean;
};

export type PlayerJudgingDashboard = {
  player: {
    id: string;
    nickname: string;
    judge_level: JudgeLevel;
    judge_level_label: string;
  };
  permissions: {
    novice: boolean;
    casual: boolean;
    rating: boolean;
    tournament: boolean;
  };
  club_games: JudgingClubGame[];
  tournament_games: JudgingTournamentGame[];
};

const formatDate = (value?: string | null) => {
  if (!value) return 'Дата не указана';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(date);
};

const levelDescription: Record<JudgeLevel, string> = {
  none: 'Нет полномочий на самостоятельное ведение игр.',
  trainee: 'Можно вести игры новичков, если организатор назначил вас ведущим конкретной игры.',
  host: 'Можно вести новичковые и обычные клубные игры, если вы назначены ведущим.',
  judge: 'Можно вести любые клубные, рейтинговые и турнирные игры, если вы назначены судьёй.',
};

const permissionLabel = (key: keyof PlayerJudgingDashboard['permissions']) => {
  if (key === 'novice') return 'Новички';
  if (key === 'casual') return 'Клубные';
  if (key === 'rating') return 'Рейтинг';
  return 'Турниры';
};

export async function loadPlayerJudgingDashboard(): Promise<PlayerJudgingDashboard> {
  const response = await fetch('/api/player/judging', { credentials: 'include' });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error || 'Не удалось загрузить судейство');
  return body as PlayerJudgingDashboard;
}

export default function PlayerJudging({ onBack }: { onBack: () => void }) {
  const [dashboard, setDashboard] = useState<PlayerJudgingDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [clubGame, setClubGame] = useState<JudgingClubGame | null>(null);
  const [tournamentGame, setTournamentGame] = useState<JudgingTournamentGame | null>(null);
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [tournamentLoading, setTournamentLoading] = useState(false);
  const [protocolOpen, setProtocolOpen] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const reload = async () => {
    setError(null);
    try {
      const next = await loadPlayerJudgingDashboard();
      setDashboard(next);
      if (tournamentGame) {
        const refreshed = next.tournament_games.find((game) => game.id === tournamentGame.id) || null;
        setTournamentGame(refreshed);
      }
    } catch (loadError: any) {
      setError(loadError?.message || 'Не удалось загрузить судейство');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void reload(); }, []);

  const activeAssignments = useMemo(() => {
    if (!dashboard) return [] as Array<{ kind: 'club' | 'tournament'; game: JudgingClubGame | JudgingTournamentGame }>;
    return [
      ...dashboard.club_games.filter((game) => game.status !== 'completed').map((game) => ({ kind: 'club' as const, game })),
      ...dashboard.tournament_games.filter((game) => game.status !== 'completed').map((game) => ({ kind: 'tournament' as const, game })),
    ];
  }, [dashboard]);

  const completedAssignments = useMemo(() => {
    if (!dashboard) return [] as Array<{ kind: 'club' | 'tournament'; game: JudgingClubGame | JudgingTournamentGame }>;
    return [
      ...dashboard.club_games.filter((game) => game.status === 'completed').map((game) => ({ kind: 'club' as const, game })),
      ...dashboard.tournament_games.filter((game) => game.status === 'completed').map((game) => ({ kind: 'tournament' as const, game })),
    ].slice(0, 12);
  }, [dashboard]);

  const openTournament = async (game: JudgingTournamentGame) => {
    if (!game.can_conduct) return;
    setTournamentLoading(true);
    setError(null);
    setFeedback(null);
    try {
      const response = await fetch(`/api/tournaments/${encodeURIComponent(game.tournament_id)}`, { credentials: 'include' });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || 'Не удалось загрузить турнир');
      const detail = body as Tournament;
      const freshGame = detail.games?.find((item) => item.id === game.id);
      setTournament(detail);
      setTournamentGame({ ...game, ...(freshGame || {}) });
    } catch (openError: any) {
      setError(openError?.message || 'Не удалось открыть турнирную игру');
    } finally {
      setTournamentLoading(false);
    }
  };

  if (clubGame) {
    return (
      <EveningLiveGameModal
        game={clubGame}
        onClose={() => setClubGame(null)}
        onUpdated={(updated) => {
          setClubGame(null);
          setDashboard((current) => current ? {
            ...current,
            club_games: current.club_games.map((game) => game.id === updated.id ? { ...game, ...updated, can_conduct: false } : game),
          } : current);
          void reload();
        }}
      />
    );
  }

  if (tournamentGame && tournament) {
    const currentGame = (tournament.games || []).find((game) => game.id === tournamentGame.id) || tournamentGame;
    const otherActive = (tournament.games || []).find((game) => game.id !== currentGame.id && game.status === 'active');

    return (
      <div className="space-y-3">
        <button type="button" onClick={() => { setTournamentGame(null); setTournament(null); setProtocolOpen(false); }} className="min-h-11 rounded-2xl border border-white/10 bg-white/[0.04] px-3 text-sm text-white/60">← К назначениям</button>
        <section className="rounded-3xl border border-white/10 bg-white/[0.045] p-4">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-white/40">Турнир · игра №{currentGame.game_number}</div>
          <h2 className="mt-2 text-xl font-semibold text-white">{tournamentGame.tournament_title}</h2>
          <div className="mt-1 text-sm text-white/40">{formatDate(tournamentGame.tournament_date)}{tournamentGame.venue ? ` · ${tournamentGame.venue}` : ''}</div>
          <div className="mt-3 rounded-2xl bg-black/20 px-3 py-3 text-sm text-white/55">Вы назначены судьёй только этой игры. Управление турниром, составом и результатами других игр недоступно.</div>
        </section>

        {feedback && <div className={`rounded-2xl px-3 py-3 text-sm ${feedback.type === 'success' ? 'bg-emerald-400/[0.08] text-emerald-100/75' : 'bg-rose-400/[0.08] text-rose-100/75'}`}>{feedback.text}</div>}

        {currentGame.status === 'planned' ? (
          <section className="rounded-3xl border border-white/10 bg-white/[0.045] p-3 text-slate-100">
            <TournamentGameSetup
              tournamentId={tournamentGame.tournament_id}
              game={currentGame}
              tournamentStatus={tournament.status}
              isAnotherGameActive={Boolean(otherActive)}
              activeGameNumber={otherActive?.game_number}
              judgeName={currentGame.judge_name}
              chiefJudgeName={tournament.chief_judge_name}
              canEditJudgeAndRoles={true}
              canSwapSeats={false}
              onOpenSwapModal={() => undefined}
              onGameStarted={() => {
                setTournament((current) => current ? {
                  ...current,
                  games: current.games?.map((game) => game.id === currentGame.id ? { ...game, status: 'active' } : game),
                } : current);
                setTournamentGame((current) => current ? { ...current, status: 'active' } : current);
                setProtocolOpen(true);
                void reload();
              }}
              setFeedbackMsg={setFeedback}
            />
          </section>
        ) : currentGame.status === 'active' ? (
          <section className="rounded-3xl border border-white/10 bg-white/[0.045] p-4">
            <div className="text-sm font-medium text-white">Игра идёт</div>
            <p className="mt-1 text-sm leading-5 text-white/40">Откройте протокол и ведите голосования, ночи, фолы, ЛХ и результат игры.</p>
            <button type="button" onClick={() => setProtocolOpen(true)} className="mt-4 min-h-12 w-full rounded-2xl bg-white px-4 text-sm font-semibold text-black">Открыть протокол игры</button>
          </section>
        ) : (
          <section className="rounded-3xl border border-white/10 bg-white/[0.045] p-4 text-sm text-white/45">Игра завершена. Исправление завершённого протокола доступно только организатору.</section>
        )}

        <GameProtocolModal
          tournamentId={tournamentGame.tournament_id}
          gameId={String(currentGame.id)}
          isOpen={protocolOpen}
          onClose={() => setProtocolOpen(false)}
          onProtocolUpdated={() => {
            setProtocolOpen(false);
            void (async () => {
              await reload();
              try {
                const response = await fetch(`/api/tournaments/${encodeURIComponent(tournamentGame.tournament_id)}`, { credentials: 'include' });
                const body = await response.json().catch(() => ({}));
                if (response.ok) setTournament(body as Tournament);
              } catch {}
            })();
          }}
        />
      </div>
    );
  }

  if (loading) return <div className="rounded-3xl bg-white/[0.04] px-4 py-10 text-center text-sm text-white/45">Загрузка судейства…</div>;

  return (
    <div className="space-y-3">
      <button type="button" onClick={onBack} className="min-h-11 rounded-2xl border border-white/10 bg-white/[0.04] px-3 text-sm text-white/60">← Назад в профиль</button>

      {error && <div className="rounded-2xl bg-rose-400/[0.08] px-3 py-3 text-sm text-rose-100/75">{error}</div>}

      {dashboard && (
        <>
          <section className="rounded-3xl border border-white/10 bg-gradient-to-b from-white/[0.08] to-white/[0.035] p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-white/40">Мой уровень</div>
            <div className="mt-2 text-2xl font-semibold text-white">{dashboard.player.judge_level_label}</div>
            <p className="mt-2 text-sm leading-5 text-white/40">{levelDescription[dashboard.player.judge_level]}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {(Object.keys(dashboard.permissions) as Array<keyof typeof dashboard.permissions>).map((key) => (
                <span key={key} className={`rounded-full border px-2.5 py-1 text-xs ${dashboard.permissions[key] ? 'border-emerald-300/20 bg-emerald-300/[0.08] text-emerald-100/75' : 'border-white/10 bg-white/[0.03] text-white/25'}`}>{permissionLabel(key)}</span>
              ))}
            </div>
          </section>

          <section className="rounded-3xl border border-white/10 bg-white/[0.045] p-4">
            <div className="flex items-end justify-between gap-3">
              <div><div className="text-xs font-semibold uppercase tracking-[0.18em] text-white/45">Назначенные игры</div><div className="mt-1 text-sm text-white/35">Доступ появляется только после назначения организатором</div></div>
              <div className="text-2xl font-semibold text-white">{activeAssignments.length}</div>
            </div>
            <div className="mt-4 space-y-2">
              {activeAssignments.length ? activeAssignments.map((assignment) => {
                if (assignment.kind === 'club') {
                  const game = assignment.game as JudgingClubGame;
                  const format = normalizeEveningFormat(game.evening_format);
                  return <article key={`club:${game.id}`} className="rounded-2xl bg-black/20 p-3">
                    <div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="truncate text-sm font-medium text-white">{game.evening_title}</div><div className="mt-1 text-xs text-white/35">Игра #{game.global_game_number} · {formatDate(game.evening_starts_at)}</div></div><span className="shrink-0 rounded-full bg-white/[0.06] px-2 py-1 text-[10px] text-white/50">{EVENING_FORMAT_LABELS[format]}</span></div>
                    {game.table_name && <div className="mt-1 text-xs text-white/30">Стол: {game.table_name}</div>}
                    {game.can_conduct ? <button type="button" onClick={() => setClubGame(game)} className="mt-3 min-h-11 w-full rounded-xl bg-white px-3 text-sm font-semibold text-black">Провести игру</button> : <div className="mt-3 rounded-xl bg-white/[0.04] px-3 py-2 text-xs text-white/35">Ваш текущий ранг не позволяет вести этот формат.</div>}
                  </article>;
                }
                const game = assignment.game as JudgingTournamentGame;
                return <article key={`tournament:${game.id}`} className="rounded-2xl bg-black/20 p-3">
                  <div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="truncate text-sm font-medium text-white">{game.tournament_title}</div><div className="mt-1 text-xs text-white/35">Игра №{game.game_number} · {formatDate(game.tournament_date)}</div></div><span className="shrink-0 rounded-full bg-amber-300/[0.08] px-2 py-1 text-[10px] text-amber-100/65">Турнир</span></div>
                  {game.can_conduct ? <button type="button" disabled={tournamentLoading} onClick={() => void openTournament(game)} className="mt-3 min-h-11 w-full rounded-xl bg-white px-3 text-sm font-semibold text-black disabled:opacity-50">{tournamentLoading ? 'Открываем…' : game.status === 'active' ? 'Продолжить игру' : 'Подготовить и провести'}</button> : <div className="mt-3 rounded-xl bg-white/[0.04] px-3 py-2 text-xs text-white/35">Проведение станет доступно после запуска турнира организатором.</div>}
                </article>;
              }) : <div className="rounded-2xl bg-black/20 px-3 py-8 text-center text-sm text-white/35">Сейчас у вас нет назначенных активных игр.</div>}
            </div>
          </section>

          {completedAssignments.length > 0 && (
            <details className="rounded-3xl border border-white/10 bg-white/[0.035]">
              <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between px-4 text-sm font-medium text-white/55"><span>Проведённые игры</span><span>{completedAssignments.length}</span></summary>
              <div className="space-y-2 border-t border-white/10 p-3">
                {completedAssignments.map((assignment) => assignment.kind === 'club' ? (
                  <div key={`done-club:${assignment.game.id}`} className="rounded-2xl bg-black/20 px-3 py-3"><div className="text-sm text-white/65">{(assignment.game as JudgingClubGame).evening_title}</div><div className="mt-1 text-xs text-white/30">Игра #{(assignment.game as JudgingClubGame).global_game_number} · завершена</div></div>
                ) : (
                  <div key={`done-tournament:${assignment.game.id}`} className="rounded-2xl bg-black/20 px-3 py-3"><div className="text-sm text-white/65">{(assignment.game as JudgingTournamentGame).tournament_title}</div><div className="mt-1 text-xs text-white/30">Турнир · игра №{(assignment.game as JudgingTournamentGame).game_number} · завершена</div></div>
                ))}
              </div>
            </details>
          )}
        </>
      )}
    </div>
  );
}
