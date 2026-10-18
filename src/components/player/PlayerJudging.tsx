import { useResumeLiveGame } from '../../lib/useResumeLiveGame.ts';
import { useEffect, useMemo, useState } from 'react';
import JudgeGameLauncher, { type JudgeStartEvening } from './JudgeGameLauncher.tsx';
import { EVENING_FORMAT_LABELS, normalizeEveningFormat } from '../../lib/eveningFormat.ts';
import type { Tournament, TournamentGame } from '../../lib/api.ts';
import type { ClubGameRecord } from '../../lib/clubGamesApi.ts';
import { EveningLiveGameModal } from '../crm/EveningLiveGameModal.tsx';
import { EveningGameProtocolModal } from '../crm/EveningGameProtocolModal.tsx';
import { GameProtocolModal } from '../crm/tournaments/GameProtocolModal.tsx';
import { TournamentGameSetup } from '../crm/tournaments/TournamentGameSetup.tsx';
import TournamentLiveGameModal from './TournamentLiveGameModal.tsx';
import { formatPlayerGameDateTime } from '../../lib/playerGameDate.ts';
import { getJson } from '../../lib/requestJson.ts';

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

const formatDate = formatPlayerGameDateTime;

const levelDescription: Record<JudgeLevel, string> = {
  none: 'Нет полномочий на самостоятельное ведение игр.',
  trainee: 'Можно вести игры новичков, если организатор назначил ведущим конкретной игры.',
  host: 'Можно вести новичковые и обычные клубные игры, если назначен ведущим.',
  judge: 'Можно вести любые клубные, рейтинговые и турнирные игры, если назначен судьёй.',
};

const permissionLabel = (key: keyof PlayerJudgingDashboard['permissions']) => {
  if (key === 'novice') return 'Новички';
  if (key === 'casual') return 'Клубные';
  if (key === 'rating') return 'Рейтинг';
  return 'Турниры';
};

export async function loadPlayerJudgingDashboard(): Promise<PlayerJudgingDashboard> {
  const body = await getJson<any>('/api/player/judging', 'Не удалось загрузить судейство');
  return body as PlayerJudgingDashboard;
}

export default function PlayerJudging({ onBack, evenings = [], onCreated }: { onBack?: () => void; evenings?: JudgeStartEvening[]; onCreated?: (game: ClubGameRecord) => void }) {
  const [dashboard, setDashboard] = useState<PlayerJudgingDashboard | null>(null);
  const [selectedEveningId, setSelectedEveningId] = useState<string | null>(null);
  const [openRequest, setOpenRequest] = useState(0);
  const [previewKey, setPreviewKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [clubLiveGame, setClubLiveGame] = useState<JudgingClubGame | null>(null);
  const [clubProtocolGame, setClubProtocolGame] = useState<JudgingClubGame | null>(null);
  const [tournamentGame, setTournamentGame] = useState<JudgingTournamentGame | null>(null);
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [tournamentLoading, setTournamentLoading] = useState(false);
  const [protocolOpen, setProtocolOpen] = useState(false);
  const [tournamentLiveOpen, setTournamentLiveOpen] = useState(false);
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

  // A reload returns to the game window that was open.
  useResumeLiveGame('club', dashboard ? dashboard.club_games.filter((game) => game.can_conduct) : null, clubLiveGame !== null, setClubLiveGame);
  useResumeLiveGame('tournament', dashboard ? dashboard.tournament_games.filter((game) => game.can_conduct) : null, tournamentGame !== null,
    (game) => { void openTournament(game).then(() => setTournamentLiveOpen(true)); }, (game) => game.status === 'active');

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

  const patchClubInDashboard = (updated: ClubGameRecord) => {
    setDashboard((current) => current ? {
      ...current,
      club_games: current.club_games.map((game) => game.id === updated.id
        ? { ...game, ...updated, can_conduct: updated.status !== 'completed' && game.can_conduct }
        : game),
    } : current);
  };

  const handleClubLiveUpdated = (updated: ClubGameRecord) => {
    patchClubInDashboard(updated);
    setClubLiveGame(null);
    void reload();
  };

  const handleClubProtocolUpdated = (updated: ClubGameRecord) => {
    patchClubInDashboard(updated);
    setClubProtocolGame((current) => current ? ({ ...current, ...updated } as JudgingClubGame) : current);
    if (updated.status === 'completed') {
      setClubProtocolGame(null);
      void reload();
    }
  };

  const openTournament = async (game: JudgingTournamentGame) => {
    if (!game.can_conduct) return;
    setTournamentLoading(true);
    setError(null);
    setFeedback(null);
    try {
      const body = await getJson<any>(`/api/tournaments/${encodeURIComponent(game.tournament_id)}`, 'Не удалось загрузить турнир');
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

  const refreshTournament = async () => {
    if (!tournamentGame) return;
    await reload();
    try {
      const response = await fetch(`/api/tournaments/${encodeURIComponent(tournamentGame.tournament_id)}`, { credentials: 'include' });
      const body = await response.json().catch(() => ({}));
      if (response.ok) setTournament(body as Tournament);
    } catch {}
  };

  if (clubLiveGame) {
    return <EveningLiveGameModal game={clubLiveGame} onClose={() => setClubLiveGame(null)} onUpdated={handleClubLiveUpdated} />;
  }

  if (clubProtocolGame) {
    return (
      <EveningGameProtocolModal
        game={clubProtocolGame}
        isOpen={true}
        onClose={() => { setClubProtocolGame(null); void reload(); }}
        onUpdated={handleClubProtocolUpdated}
      />
    );
  }

  if (tournamentGame && tournament) {
    const currentGame = (tournament.games || []).find((game) => game.id === tournamentGame.id) || tournamentGame;
    const otherActive = (tournament.games || []).find((game) => game.id !== currentGame.id && game.status === 'active');

    return (
      <div className="space-y-3">
        <button type="button" onClick={() => { setTournamentGame(null); setTournament(null); setProtocolOpen(false); setTournamentLiveOpen(false); }} className="min-h-11 rounded-2xl border border-white/10 bg-white/[0.04] px-3 text-sm text-white/60">← К назначениям</button>
        <section className="rounded-3xl border border-white/10 bg-white/[0.045] p-4">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-white/40">Турнир · игра №{currentGame.game_number}</div>
          <h2 className="mt-2 text-xl font-semibold text-white">{tournamentGame.tournament_title}</h2>
          <div className="mt-1 text-sm text-white/40">{formatDate(tournamentGame.tournament_date)}{tournamentGame.venue ? ` · ${tournamentGame.venue}` : ''}</div>
          <div className="mt-3 rounded-2xl bg-black/20 px-3 py-3 text-sm text-white/55">Судейство назначено только на эту игру. Способ ведения можно выбрать после подготовки ролей и запуска игры.</div>
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
                setProtocolOpen(false);
                setTournamentLiveOpen(false);
                void reload();
              }}
              setFeedbackMsg={setFeedback}
            />
          </section>
        ) : currentGame.status === 'active' ? (
          <section className="rounded-3xl border border-white/10 bg-white/[0.045] p-4">
            <div className="text-sm font-medium text-white">Как проводить игру?</div>
            <p className="mt-1 text-sm leading-5 text-white/40">Какой режим ни выберешь, протокол и расчёты будут одинаковые.</p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setTournamentLiveOpen(true)} className="min-h-12 rounded-2xl bg-white px-3 text-sm font-semibold text-black">Вести игру</button>
              <button type="button" onClick={() => setProtocolOpen(true)} className="min-h-12 rounded-2xl border border-white/15 bg-white/[0.05] px-3 text-sm font-semibold text-white">Заполнить протокол</button>
            </div>
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
            void refreshTournament();
          }}
        />

        {tournamentLiveOpen && currentGame.status === 'active' ? (
          <TournamentLiveGameModal
            tournamentId={tournamentGame.tournament_id}
            gameId={String(currentGame.id)}
            judgeName={currentGame.judge_name}
            onClose={() => setTournamentLiveOpen(false)}
            onCompleted={() => void refreshTournament()}
          />
        ) : null}
      </div>
    );
  }

  if (loading) return <div className="rounded-3xl bg-white/[0.04] px-4 py-10 text-center text-sm text-white/45">Загрузка судейства…</div>;

  return (
    <div className="space-y-3">
      {onBack ? <button type="button" onClick={onBack} className="min-h-11 rounded-2xl border border-white/10 bg-white/[0.04] px-3 text-sm text-white/60">← Назад</button> : null}

      {error && <div className="rounded-2xl bg-rose-400/[0.08] px-3 py-3 text-sm text-rose-100/75">{error}</div>}

      {dashboard && (
        <>
          <section className="rounded-3xl border border-white/10 bg-gradient-to-b from-white/[0.08] to-white/[0.035] p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-white/40">Какие игры я веду</div>
            <div className="mt-2 text-2xl font-semibold text-white">{dashboard.player.judge_level_label}</div>
            <p className="mt-2 text-sm leading-5 text-white/40">{dashboard.player.judge_level === 'none' ? levelDescription.none : 'Вести можно те игры, на которые назначил организатор.'}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {(Object.keys(dashboard.permissions) as Array<keyof typeof dashboard.permissions>).map((key) => (
                <span key={key} className={`rounded-full border px-2.5 py-1 text-xs ${dashboard.permissions[key] ? 'border-emerald-300/20 bg-emerald-300/[0.08] text-emerald-100/75' : 'border-white/10 bg-white/[0.03] text-white/25'}`}>{permissionLabel(key)}</span>
              ))}
            </div>
          </section>

          <section className="rounded-3xl border border-white/10 bg-white/[0.045] p-4">
            <div className="flex items-end justify-between gap-3">
              <div><div className="text-xs font-semibold uppercase tracking-[0.18em] text-white/45">Вечера и игры</div><div className="mt-1 text-sm text-white/40">Единый список клубных и турнирных игр. Действия зависят от назначения.</div></div>
              <div className="text-2xl font-semibold text-white">{evenings.length + activeAssignments.length}</div>
            </div>
            <div className="mt-4 space-y-2">
              {[
                ...evenings.map((evening) => ({ kind: 'evening' as const, evening, sortAt: evening.starts_at, key: `evening:${evening.id}` })),
                ...activeAssignments.map((assignment) => ({ ...assignment, sortAt: assignment.kind === 'club' ? (assignment.game as JudgingClubGame).evening_starts_at : (assignment.game as JudgingTournamentGame).tournament_date, key: `${assignment.kind}:${assignment.game.id}` })),
              ].sort((a, b) => (Date.parse(a.sortAt) || 0) - (Date.parse(b.sortAt) || 0)).map((item) => {
                if (item.kind === 'evening') {
                  const evening = item.evening;
                  return <article key={item.key} className="rounded-2xl bg-black/20 p-3">
                    <div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="text-sm font-medium text-white">{evening.title}</div><div className="mt-1 text-xs text-white/40">{formatDate(evening.starts_at)} · {evening.games_count} игр</div></div><span className="shrink-0 rounded-full bg-white/[0.06] px-2 py-1 text-[11px] text-white/60">{EVENING_FORMAT_LABELS[normalizeEveningFormat(evening.format)]}</span></div>
                    <p className="mt-2 text-xs text-white/45">{evening.access_label}</p>
                    <button type="button" onClick={() => { setSelectedEveningId(evening.id); setOpenRequest((current) => current + 1); }} className="mt-3 min-h-11 w-full rounded-xl border border-white/15 bg-white/[0.06] px-3 text-sm font-semibold text-white">{evening.can_create ? 'Открыть · новая игра' : 'Просмотр вечера'}</button>
                  </article>;
                }
                if (item.kind === 'club') {
                  const game = item.game as JudgingClubGame;
                  const key = item.key;
                  return <article key={key} className="rounded-2xl bg-black/20 p-3">
                    <div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="text-sm font-medium text-white">{game.evening_title}</div><div className="mt-1 text-xs text-white/40">Игра #{game.global_game_number} · {formatDate(game.evening_starts_at)}</div></div><span className="shrink-0 rounded-full bg-white/[0.06] px-2 py-1 text-[11px] text-white/60">{EVENING_FORMAT_LABELS[normalizeEveningFormat(game.evening_format)]}</span></div>
                    {game.table_name && <div className="mt-1 text-xs text-white/40">Стол: {game.table_name}</div>}
                    {game.can_conduct ? <div className="mt-3 grid grid-cols-2 gap-2"><button type="button" onClick={() => setClubLiveGame(game)} className="min-h-11 rounded-xl bg-white px-2 text-xs font-semibold text-black">Вести</button><button type="button" onClick={() => setClubProtocolGame(game)} className="min-h-11 rounded-xl border border-white/15 bg-white/[0.05] px-2 text-xs font-semibold text-white">Протокол</button></div> : <><button type="button" onClick={() => setPreviewKey(previewKey === key ? null : key)} className="mt-3 min-h-11 w-full rounded-xl border border-white/15 bg-white/[0.05] px-3 text-sm text-white">Просмотр</button>{previewKey === key && <p className="mt-2 text-xs text-white/50">Игра доступна организатору для просмотра. Проведение и редактирование доступны только назначенному ведущему.</p>}</>}
                  </article>;
                }
                const game = item.game as JudgingTournamentGame;
                return <article key={item.key} className="rounded-2xl bg-black/20 p-3">
                  <div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="text-sm font-medium text-white">{game.tournament_title}</div><div className="mt-1 text-xs text-white/40">Турнир · игра №{game.game_number} · {formatDate(game.tournament_date)}</div></div><span className="shrink-0 rounded-full bg-amber-300/[0.08] px-2 py-1 text-[11px] text-amber-100/65">Турнир</span></div>
                  {game.can_conduct ? <button type="button" disabled={tournamentLoading} onClick={() => void openTournament(game)} className="mt-3 min-h-11 w-full rounded-xl bg-white px-3 text-sm font-semibold text-black disabled:opacity-50">{tournamentLoading ? 'Открываем…' : game.status === 'active' ? 'Вести / открыть' : 'Открыть подготовку'}</button> : <><button type="button" onClick={() => setPreviewKey(previewKey === item.key ? null : item.key)} className="mt-3 min-h-11 w-full rounded-xl border border-white/15 bg-white/[0.05] px-3 text-sm text-white">Просмотр</button>{previewKey === item.key && <p className="mt-2 text-xs text-white/50">Проведение доступно назначенному судье после запуска турнира.</p>}</>}
                </article>;
              })}
              {evenings.length + activeAssignments.length === 0 && <div className="rounded-2xl bg-black/20 px-3 py-8 text-center text-sm text-white/40">Открытых вечеров и доступных игр пока нет.</div>}
            </div>
          </section>
          {onCreated && <JudgeGameLauncher embedded judge={{ id: dashboard.player.id, nickname: dashboard.player.nickname }} evenings={evenings} selectedEveningId={selectedEveningId} openRequest={openRequest} onCreated={onCreated} />}
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
