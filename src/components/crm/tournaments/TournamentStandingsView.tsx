import React, { useState, useEffect } from 'react';
import { RefreshCw, Trophy, AlertCircle, ChevronDown, ChevronUp, Gamepad2, Image as ImageIcon } from 'lucide-react';
import { api, TournamentStandingItem, Tournament } from '../../../lib/api.ts';
import { ResultsImageExportModal } from './ResultsImageExportModal.tsx';
import { PlayerAvatar } from '../../ui/PlayerAvatar.tsx';

interface TournamentStandingsViewProps {
  tournamentId: string;
  refreshTrigger?: number;
}

export const TournamentStandingsView: React.FC<TournamentStandingsViewProps> = ({ tournamentId, refreshTrigger }) => {
  const [standings, setStandings] = useState<TournamentStandingItem[]>([]);
  const [completedGamesCount, setCompletedGamesCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tieRequiresDraw, setTieRequiresDraw] = useState<boolean>(false);
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);

  // Expanded row state for main stats (< 640px)
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);

  // Expanded games breakdown state (both mobile and desktop)
  const [expandedGamesId, setExpandedGamesId] = useState<string | null>(null);

  const fetchStandings = async (isManual = false) => {
    if (isManual) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const [res, tRes] = await Promise.all([
        api.getTournamentStandings(tournamentId),
        api.getTournament(tournamentId),
      ]);
      setCompletedGamesCount(res.completed_games_count ?? 0);
      setStandings(res.standings || []);
      setTieRequiresDraw(res.tie_requires_draw ?? false);
      setTournament(tRes);
    } catch (err: any) {
      setError(err.message || 'Не удалось загрузить турнирную таблицу');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchStandings();
  }, [tournamentId, refreshTrigger]);

  const toggleExpandRow = (id: string) => {
    setExpandedRowId(expandedRowId === id ? null : id);
  };

  const toggleExpandGames = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setExpandedGamesId(expandedGamesId === id ? null : id);
  };

  if (loading) {
    return (
      <div className="bg-surface-1 border border-border-soft rounded-3xl p-8 text-center text-text-muted text-xs space-y-2">
        <RefreshCw className="w-5 h-5 animate-spin mx-auto text-accent" />
        <p>Загрузка турнирной таблицы...</p>
      </div>
    );
  }

  const top3 = standings.filter((item) => item.place <= 3);
  const restParticipants = standings.filter((item) => item.place > 3);

  return (
    <div className="space-y-4 text-text-primary">
      {/* Header controls & Note */}
      <div className="bg-surface-1 border border-border-soft rounded-3xl p-4 sm:p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Trophy className="w-5 h-5 text-amber-400" />
            <h3 className="text-base font-extrabold text-text-primary tracking-tight">Турнирная таблица</h3>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => fetchStandings(true)}
              disabled={refreshing}
              className="bg-accent/10 hover:bg-accent/20 text-accent border border-accent/30 font-bold px-3.5 py-2 rounded-xl text-xs transition-all flex items-center gap-2 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              <span>Обновить таблицу</span>
            </button>

            {completedGamesCount > 0 && (
              <button
                type="button"
                id="btn-download-standings-png-trigger"
                onClick={() => setIsExportModalOpen(true)}
                className="bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-bold px-3.5 py-2 rounded-xl text-xs transition-all flex items-center gap-2 cursor-pointer"
              >
                <ImageIcon className="w-3.5 h-3.5" />
                <span>Скачать таблицу PNG</span>
              </button>
            )}
          </div>
        </div>

        {/* Ci note badge */}
        <div className="bg-surface-2 border border-border-soft rounded-2xl p-3 text-xs text-text-secondary flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-text-primary">Компенсация Ci по правилам ФСМ 2022</p>
            <p className="text-[11px] text-text-muted mt-0.5">
              {standings[0]?.ci_calculation?.provisional
                ? 'Ci предварительный и может измениться после следующих игр.'
                : 'Ci рассчитан по полной дистанции турнира.'}
            </p>
          </div>
        </div>
      </div>

      {tieRequiresDraw && (
        <div className="bg-amber-500/15 border border-amber-500/40 rounded-3xl p-4 text-xs text-amber-400 space-y-1.5 shadow-md">
          <div className="flex items-center gap-2 font-black text-sm uppercase tracking-wide">
            <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 animate-pulse" />
            <span>Внимание! Требуется проведение жребия</span>
          </div>
          <p className="text-[11px] opacity-90 leading-relaxed font-sans">
            У двух или более участников полностью совпадают все основные и дополнительные показатели (очки, доп. баллы, победы, победы за Дона/Шерифа, количество первых убийств). Для определения точных финальных мест требуется проведение официального жребия Главным судьей.
          </p>
        </div>
      )}

      {error && (
        <div className="bg-danger/10 border border-danger/30 text-danger p-4 rounded-2xl text-xs font-semibold">
          {error}
        </div>
      )}

      {/* Empty State when completed_games_count === 0 */}
      {completedGamesCount === 0 || standings.length === 0 ? (
        <div className="bg-surface-1 border border-border-soft rounded-3xl p-8 text-center text-text-muted text-xs space-y-2">
          <Trophy className="w-8 h-8 text-amber-400/50 mx-auto" />
          <p className="text-sm font-semibold text-text-secondary">
            Таблица появится после завершения первой игры
          </p>
        </div>
      ) : (
        <>
          {/* ====================================================== */}
          {/* MOBILE VIEW (< 640px)                                  */}
          {/* ====================================================== */}
          <div className="block sm:hidden space-y-3">
            {/* Top 3 Compact Cards */}
            {top3.length > 0 && (
              <div className="space-y-2">
                <div className="text-xs font-extrabold uppercase tracking-wider text-text-muted px-1 flex items-center gap-1.5">
                  <Trophy className="w-3.5 h-3.5 text-amber-400" />
                  <span>Лидеры турнира</span>
                </div>

                <div className="grid grid-cols-1 gap-2.5">
                  {top3.map((item) => {
                    const isRowExpanded = expandedRowId === item.participant_id;
                    const isGamesExpanded = expandedGamesId === item.participant_id;

                    return (
                      <div
                        key={item.participant_id}
                        onClick={() => toggleExpandRow(item.participant_id)}
                        className={`bg-surface-1 border rounded-2xl p-3 space-y-2 cursor-pointer transition-all ${
                          item.place === 1
                            ? 'border-amber-500/50 shadow-sm bg-gradient-to-r from-amber-500/5 to-transparent'
                            : item.place === 2
                            ? 'border-slate-400/40'
                            : 'border-amber-700/40'
                        }`}
                      >
                        {/* Top visible row: Place, Nick, Σ, Σдб, И, П */}
                        <div className="flex items-center justify-between gap-2 text-xs">
                          <div className="flex items-center gap-2 min-w-0">
                            <span
                              className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs shrink-0 ${
                                item.place === 1
                                  ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40 font-black'
                                  : item.place === 2
                                  ? 'bg-slate-300/20 text-slate-300 border border-slate-300/40 font-bold'
                                  : 'bg-amber-700/20 text-amber-600 border border-amber-700/40 font-bold'
                              }`}
                            >
                              {item.place}
                            </span>
                            <PlayerAvatar playerId={item.player_id || undefined} avatarVersion={item.avatar_updated_at} forceStoredLookup nickname={item.display_name} size="xs" />

                            <div className="min-w-0 truncate">
                              <span className="text-text-muted text-[11px] font-mono mr-1">
                                #{item.participant_number}
                              </span>
                              <span className="font-extrabold text-text-primary text-sm truncate">
                                {item.display_name}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0 font-mono text-xs">
                            <div className="text-right">
                              <div className="text-[10px] text-text-muted">Σ</div>
                              <div className="font-black text-sm text-accent">{item.total_points}</div>
                            </div>
                            <div className="text-right">
                              <div className="text-[10px] text-text-muted">Σдб</div>
                              <div className="font-bold text-text-secondary">
                                {item.additional_total > 0 ? `+${item.additional_total}` : item.additional_total}
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="text-[10px] text-text-muted">И</div>
                              <div className="font-semibold text-text-secondary">{item.games_played}</div>
                            </div>
                            <div className="text-right">
                              <div className="text-[10px] text-text-muted">П</div>
                              <div className="font-bold text-emerald-400">{item.wins}</div>
                            </div>
                            {isRowExpanded ? (
                              <ChevronUp className="w-4 h-4 text-text-muted ml-1" />
                            ) : (
                              <ChevronDown className="w-4 h-4 text-text-muted ml-1" />
                            )}
                          </div>
                        </div>

                        {/* Collapsible expanded stats (+, −, ЛХ, Ci, Д, Ш, У) */}
                        {isRowExpanded && (
                          <div className="pt-2 border-t border-border-soft/60 grid grid-cols-5 gap-y-2 gap-x-1 text-center text-[11px] font-mono bg-surface-2/40 p-2 rounded-xl">
                            <div>
                              <div className="text-[9px] text-text-muted uppercase" title="Доп. балл судьи">+</div>
                              <div className="font-bold text-emerald-400">
                                {(item.positive_judge_points ?? 0) > 0 ? `+${item.positive_judge_points}` : (item.positive_judge_points ?? 0)}
                              </div>
                            </div>
                            <div>
                              <div className="text-[9px] text-text-muted uppercase" title="Доп. балл за протокол">+Пр</div>
                              <div className="font-bold text-emerald-400/80">
                                {(item.positive_protocol_points ?? 0) > 0 ? `+${item.positive_protocol_points}` : (item.positive_protocol_points ?? 0)}
                              </div>
                            </div>
                            <div>
                              <div className="text-[9px] text-text-muted uppercase" title="Минусы по игре (штраф судьи)">−</div>
                              <div className="font-bold text-danger">
                                {(item.negative_judge_points ?? 0) > 0 ? `-${item.negative_judge_points}` : (item.negative_judge_points ?? 0)}
                              </div>
                            </div>
                            <div>
                              <div className="text-[9px] text-text-muted uppercase" title="Протокольный штраф">−Пр</div>
                              <div className="font-bold text-danger/80">
                                {(item.negative_protocol_points ?? 0) > 0 ? `-${item.negative_protocol_points}` : (item.negative_protocol_points ?? 0)}
                              </div>
                            </div>
                            <div>
                              <div className="text-[9px] text-text-muted uppercase" title="Дисциплинарный штраф">−Д</div>
                              <div className="font-bold text-rose-400">
                                {(item.disciplinary_penalty_points ?? 0) > 0 ? `-${item.disciplinary_penalty_points}` : (item.disciplinary_penalty_points ?? 0)}
                              </div>
                            </div>

                            {/* Row 2 */}
                            <div>
                              <div className="text-[9px] text-text-muted uppercase">ЛХ</div>
                              <div className="font-bold text-amber-400">
                                {item.best_move_points > 0 ? `+${item.best_move_points}` : item.best_move_points}
                              </div>
                            </div>
                            <div>
                              <div className="text-[9px] text-text-muted uppercase">Ci</div>
                              <div className="font-bold text-cyan-400">
                                {item.ci_points > 0 ? `+${item.ci_points}` : item.ci_points}
                              </div>
                            </div>
                            <div>
                              <div className="text-[9px] text-text-muted uppercase">Д</div>
                              <div className="font-bold text-purple-400">{item.don_wins}</div>
                            </div>
                            <div>
                              <div className="text-[9px] text-text-muted uppercase">Ш</div>
                              <div className="font-bold text-amber-400">{item.sheriff_wins}</div>
                            </div>
                            <div>
                              <div className="text-[9px] text-text-muted uppercase">У</div>
                              <div className="font-bold text-rose-400">{item.first_killed_count}</div>
                            </div>

                            {item.place !== item.calculated_place && (
                              <div className="col-span-5 pt-2 text-left text-[10px] text-text-muted font-sans border-t border-border-soft/40 mt-1">
                                Исходное место по показателям: <span className="font-mono font-bold text-text-secondary">{item.calculated_place}</span>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Button to open per-game breakdown */}
                        <div className="pt-1 flex justify-end">
                          <button
                            type="button"
                            onClick={(e) => toggleExpandGames(item.participant_id, e)}
                            className="bg-surface-2 hover:bg-surface-3 text-text-secondary hover:text-text-primary px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1 transition-all"
                          >
                            <Gamepad2 className="w-3 h-3 text-accent" />
                            <span>{isGamesExpanded ? 'Скрыть детализацию' : 'Детализация по играм'}</span>
                          </button>
                        </div>

                        {/* Per-game breakdown if active */}
                        {isGamesExpanded && (
                          <div
                            onClick={(e) => e.stopPropagation()}
                            className="pt-2 border-t border-border-soft/60 space-y-2 text-xs"
                          >
                            <h4 className="text-[11px] font-bold text-text-secondary uppercase tracking-wider">
                              Игры игрока: {item.display_name}
                            </h4>
                            {item.games.length === 0 ? (
                              <p className="text-[11px] text-text-muted italic">Нет данных об играх</p>
                            ) : (
                              <div className="space-y-1.5">
                                {item.games.map((g) => (
                                  <div
                                    key={g.game_number}
                                    className="p-2.5 bg-surface-2/60 rounded-xl border border-border-soft space-y-1"
                                  >
                                    <div className="flex items-center justify-between font-bold">
                                      <span>
                                        Игра №{g.game_number} (Слот {g.seat_number})
                                      </span>
                                      <span
                                        className={`px-2 py-0.5 rounded text-[10px] font-extrabold uppercase ${
                                          g.win_point === 1
                                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                                            : 'bg-danger/10 text-danger border border-danger/30'
                                        }`}
                                      >
                                        {g.win_point === 1 ? 'Победа' : 'Поражение'}
                                      </span>
                                    </div>
                                    <div className="grid grid-cols-2 gap-1 text-[11px] text-text-secondary pt-1 border-t border-border-soft/60">
                                      <div>
                                        Роль:{' '}
                                        <span className="font-semibold text-text-primary capitalize">
                                          {g.role || '—'}
                                        </span>
                                      </div>
                                      <div>
                                        Победа:{' '}
                                        <span className="font-semibold text-text-primary">
                                          {g.winner_team === 'red'
                                            ? 'Красные'
                                            : g.winner_team === 'black'
                                            ? 'Чёрные'
                                            : '—'}
                                        </span>
                                      </div>
                                      <div>
                                        Балл судьи:{' '}
                                        <span className={`font-mono ${(g.judge_bonus ?? 0) > 0 ? 'text-emerald-400' : (g.judge_bonus ?? 0) < 0 ? 'text-rose-400' : 'text-slate-400'}`}>
                                          {(g.judge_bonus ?? 0) > 0 ? `+${g.judge_bonus}` : (g.judge_bonus ?? 0)}
                                        </span>
                                      </div>
                                      <div>
                                        ЛХ: <span className="font-mono text-amber-400">+{g.best_move_points}</span>
                                      </div>
                                      {!!g.protocol_bonus && (
                                        <div>
                                          Протокол: <span className="font-mono text-emerald-400">+{g.protocol_bonus}</span>
                                        </div>
                                      )}
                                      {!!g.disciplinary_penalty_points && (
                                        <div>
                                          Дисципл.: <span className="font-mono text-rose-400">-{g.disciplinary_penalty_points}</span>
                                        </div>
                                      )}
                                      <div className="col-span-2 pt-1 border-t border-border-soft/40 mt-1 space-y-0.5 text-[10px]">
                                        <div className="flex justify-between">
                                          <span className="text-text-muted">Ставка Ci:</span>
                                          <span className="font-mono text-text-primary">{g.ci_rate}</span>
                                        </div>
                                        <div className="flex justify-between">
                                          <span className="text-text-muted">Начисленный Ci:</span>
                                          <span className="font-mono text-cyan-400 font-extrabold">+{g.ci_points}</span>
                                        </div>
                                        <div className="text-[9px] text-text-muted italic leading-tight mt-0.5">
                                          {g.ci_reason === 'red_loss_full'
                                            ? 'полная компенсация за поражение красных'
                                            : g.ci_reason === 'red_win_half_with_black_lh'
                                            ? 'половина компенсации за победу красных с чёрным в ЛХ'
                                            : 'компенсация не начислена'}
                                        </div>
                                      </div>
                                    </div>
                                    <div className="pt-1 text-right font-extrabold text-[11px] text-accent">
                                      Итого за игру: {g.game_total}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Remaining participants (Place 4+) vertical rows */}
            {restParticipants.length > 0 && (
              <div className="space-y-2">
                <div className="text-xs font-extrabold uppercase tracking-wider text-text-muted px-1">
                  Все участники
                </div>

                <div className="space-y-2">
                  {restParticipants.map((item) => {
                    const isRowExpanded = expandedRowId === item.participant_id;
                    const isGamesExpanded = expandedGamesId === item.participant_id;

                    return (
                      <div
                        key={item.participant_id}
                        onClick={() => toggleExpandRow(item.participant_id)}
                        className="bg-surface-1 border border-border-soft rounded-2xl p-3 space-y-2 cursor-pointer hover:bg-surface-2/40 transition-all"
                      >
                        {/* Top visible row: Place, Nick, Σ, Σдб, И, П */}
                        <div className="flex items-center justify-between gap-2 text-xs">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full text-xs shrink-0 font-semibold text-text-muted bg-surface-2 border border-border-soft">
                              {item.place}
                            </span>
                            <PlayerAvatar playerId={item.player_id || undefined} avatarVersion={item.avatar_updated_at} forceStoredLookup nickname={item.display_name} size="xs" />

                            <div className="min-w-0 truncate">
                              <span className="text-text-muted text-[11px] font-mono mr-1">
                                #{item.participant_number}
                              </span>
                              <span className="font-extrabold text-text-primary text-sm truncate">
                                {item.display_name}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0 font-mono text-xs">
                            <div className="text-right">
                              <div className="text-[10px] text-text-muted">Σ</div>
                              <div className="font-black text-sm text-accent">{item.total_points}</div>
                            </div>
                            <div className="text-right">
                              <div className="text-[10px] text-text-muted">Σдб</div>
                              <div className="font-bold text-text-secondary">
                                {item.additional_total > 0 ? `+${item.additional_total}` : item.additional_total}
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="text-[10px] text-text-muted">И</div>
                              <div className="font-semibold text-text-secondary">{item.games_played}</div>
                            </div>
                            <div className="text-right">
                              <div className="text-[10px] text-text-muted">П</div>
                              <div className="font-bold text-emerald-400">{item.wins}</div>
                            </div>
                            {isRowExpanded ? (
                              <ChevronUp className="w-4 h-4 text-text-muted ml-1" />
                            ) : (
                              <ChevronDown className="w-4 h-4 text-text-muted ml-1" />
                            )}
                          </div>
                        </div>

                        {/* Collapsible expanded stats (+, −, ЛХ, Ci, Д, Ш, У) */}
                        {isRowExpanded && (
                          <div className="pt-2 border-t border-border-soft/60 grid grid-cols-5 gap-y-2 gap-x-1 text-center text-[11px] font-mono bg-surface-2/40 p-2 rounded-xl">
                            <div>
                              <div className="text-[9px] text-text-muted uppercase" title="Доп. балл судьи">+</div>
                              <div className="font-bold text-emerald-400">
                                {(item.positive_judge_points ?? 0) > 0 ? `+${item.positive_judge_points}` : (item.positive_judge_points ?? 0)}
                              </div>
                            </div>
                            <div>
                              <div className="text-[9px] text-text-muted uppercase" title="Доп. балл за протокол">+Пр</div>
                              <div className="font-bold text-emerald-400/80">
                                {(item.positive_protocol_points ?? 0) > 0 ? `+${item.positive_protocol_points}` : (item.positive_protocol_points ?? 0)}
                              </div>
                            </div>
                            <div>
                              <div className="text-[9px] text-text-muted uppercase" title="Минусы по игре (штраф судьи)">−</div>
                              <div className="font-bold text-danger">
                                {(item.negative_judge_points ?? 0) > 0 ? `-${item.negative_judge_points}` : (item.negative_judge_points ?? 0)}
                              </div>
                            </div>
                            <div>
                              <div className="text-[9px] text-text-muted uppercase" title="Протокольный штраф">−Пр</div>
                              <div className="font-bold text-danger/80">
                                {(item.negative_protocol_points ?? 0) > 0 ? `-${item.negative_protocol_points}` : (item.negative_protocol_points ?? 0)}
                              </div>
                            </div>
                            <div>
                              <div className="text-[9px] text-text-muted uppercase" title="Дисциплинарный штраф">−Д</div>
                              <div className="font-bold text-rose-400">
                                {(item.disciplinary_penalty_points ?? 0) > 0 ? `-${item.disciplinary_penalty_points}` : (item.disciplinary_penalty_points ?? 0)}
                              </div>
                            </div>

                            {/* Row 2 */}
                            <div>
                              <div className="text-[9px] text-text-muted uppercase">ЛХ</div>
                              <div className="font-bold text-amber-400">
                                {item.best_move_points > 0 ? `+${item.best_move_points}` : item.best_move_points}
                              </div>
                            </div>
                            <div>
                              <div className="text-[9px] text-text-muted uppercase">Ci</div>
                              <div className="font-bold text-cyan-400">
                                {item.ci_points > 0 ? `+${item.ci_points}` : item.ci_points}
                              </div>
                            </div>
                            <div>
                              <div className="text-[9px] text-text-muted uppercase">Д</div>
                              <div className="font-bold text-purple-400">{item.don_wins}</div>
                            </div>
                            <div>
                              <div className="text-[9px] text-text-muted uppercase">Ш</div>
                              <div className="font-bold text-amber-400">{item.sheriff_wins}</div>
                            </div>
                            <div>
                              <div className="text-[9px] text-text-muted uppercase">У</div>
                              <div className="font-bold text-rose-400">{item.first_killed_count}</div>
                            </div>

                            {item.place !== item.calculated_place && (
                              <div className="col-span-5 pt-2 text-left text-[10px] text-text-muted font-sans border-t border-border-soft/40 mt-1">
                                Исходное место по показателям: <span className="font-mono font-bold text-text-secondary">{item.calculated_place}</span>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Button to open per-game breakdown */}
                        <div className="pt-1 flex justify-end">
                          <button
                            type="button"
                            onClick={(e) => toggleExpandGames(item.participant_id, e)}
                            className="bg-surface-2 hover:bg-surface-3 text-text-secondary hover:text-text-primary px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1 transition-all"
                          >
                            <Gamepad2 className="w-3 h-3 text-accent" />
                            <span>{isGamesExpanded ? 'Скрыть детализацию' : 'Детализация по играм'}</span>
                          </button>
                        </div>

                        {/* Per-game breakdown if active */}
                        {isGamesExpanded && (
                          <div
                            onClick={(e) => e.stopPropagation()}
                            className="pt-2 border-t border-border-soft/60 space-y-2 text-xs"
                          >
                            <h4 className="text-[11px] font-bold text-text-secondary uppercase tracking-wider">
                              Игры игрока: {item.display_name}
                            </h4>
                            {item.games.length === 0 ? (
                              <p className="text-[11px] text-text-muted italic">Нет данных об играх</p>
                            ) : (
                              <div className="space-y-1.5">
                                {item.games.map((g) => (
                                  <div
                                    key={g.game_number}
                                    className="p-2.5 bg-surface-2/60 rounded-xl border border-border-soft space-y-1"
                                  >
                                    <div className="flex items-center justify-between font-bold">
                                      <span>
                                        Игра №{g.game_number} (Слот {g.seat_number})
                                      </span>
                                      <span
                                        className={`px-2 py-0.5 rounded text-[10px] font-extrabold uppercase ${
                                          g.win_point === 1
                                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                                            : 'bg-danger/10 text-danger border border-danger/30'
                                        }`}
                                      >
                                        {g.win_point === 1 ? 'Победа' : 'Поражение'}
                                      </span>
                                    </div>
                                    <div className="grid grid-cols-2 gap-1 text-[11px] text-text-secondary pt-1 border-t border-border-soft/60">
                                      <div>
                                        Роль:{' '}
                                        <span className="font-semibold text-text-primary capitalize">
                                          {g.role || '—'}
                                        </span>
                                      </div>
                                      <div>
                                        Победа:{' '}
                                        <span className="font-semibold text-text-primary">
                                          {g.winner_team === 'red'
                                            ? 'Красные'
                                            : g.winner_team === 'black'
                                            ? 'Чёрные'
                                            : '—'}
                                        </span>
                                      </div>
                                      <div>
                                        Балл судьи:{' '}
                                        <span className={`font-mono ${(g.judge_bonus ?? 0) > 0 ? 'text-emerald-400' : (g.judge_bonus ?? 0) < 0 ? 'text-rose-400' : 'text-slate-400'}`}>
                                          {(g.judge_bonus ?? 0) > 0 ? `+${g.judge_bonus}` : (g.judge_bonus ?? 0)}
                                        </span>
                                      </div>
                                      <div>
                                        ЛХ: <span className="font-mono text-amber-400">+{g.best_move_points}</span>
                                      </div>
                                      {!!g.protocol_bonus && (
                                        <div>
                                          Протокол: <span className="font-mono text-emerald-400">+{g.protocol_bonus}</span>
                                        </div>
                                      )}
                                      {!!g.disciplinary_penalty_points && (
                                        <div>
                                          Дисципл.: <span className="font-mono text-rose-400">-{g.disciplinary_penalty_points}</span>
                                        </div>
                                      )}
                                      <div className="col-span-2 pt-1 border-t border-border-soft/40 mt-1 space-y-0.5 text-[10px]">
                                        <div className="flex justify-between">
                                          <span className="text-text-muted">Ставка Ci:</span>
                                          <span className="font-mono text-text-primary">{g.ci_rate}</span>
                                        </div>
                                        <div className="flex justify-between">
                                          <span className="text-text-muted">Начисленный Ci:</span>
                                          <span className="font-mono text-cyan-400 font-extrabold">+{g.ci_points}</span>
                                        </div>
                                        <div className="text-[9px] text-text-muted italic leading-tight mt-0.5">
                                          {g.ci_reason === 'red_loss_full'
                                            ? 'полная компенсация за поражение красных'
                                            : g.ci_reason === 'red_win_half_with_black_lh'
                                            ? 'половина компенсации за победу красных с чёрным в ЛХ'
                                            : 'компенсация не начислена'}
                                        </div>
                                      </div>
                                    </div>
                                    <div className="pt-1 text-right font-extrabold text-[11px] text-accent">
                                      Итого за игру: {g.game_total}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* ====================================================== */}
          {/* DESKTOP VIEW (>= 640px)                                */}
          {/* Exact matched headers:                                 */}
          {/* Место | Игрок | Σ | Σдб | + | − | ЛХ | Ci | П | Д | Ш | У | И */}
          {/* ====================================================== */}
          <div className="hidden sm:block bg-surface-1 border border-border-soft rounded-3xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-surface-2 border-b border-border-soft text-text-muted text-[11px] uppercase tracking-wider font-extrabold">
                    <th className="py-3 px-3 text-center w-12">Место</th>
                    <th className="py-3 px-3">Игрок</th>
                    <th className="py-3 px-2 text-center text-accent">Σ</th>
                    <th className="py-3 px-2 text-center">Σдб</th>
                    <th className="py-3 px-2 text-center text-emerald-400" title="Доп. балл судьи">+</th>
                    <th className="py-3 px-2 text-center text-emerald-400/80" title="Доп. балл за протокол">+Пр</th>
                    <th className="py-3 px-2 text-center text-danger" title="Минусы по игре (штраф судьи)">−</th>
                    <th className="py-3 px-2 text-center text-danger/80" title="Протокольный штраф">−Пр</th>
                    <th className="py-3 px-2 text-center text-rose-400/90" title="Дисциплинарный штраф">−Д</th>
                    <th className="py-3 px-2 text-center text-amber-400">ЛХ</th>
                    <th className="py-3 px-2 text-center text-cyan-400">Ci</th>
                    <th className="py-3 px-2 text-center text-emerald-400">П</th>
                    <th className="py-3 px-2 text-center text-purple-400">Д</th>
                    <th className="py-3 px-2 text-center text-amber-400">Ш</th>
                    <th className="py-3 px-2 text-center text-rose-400">У</th>
                    <th className="py-3 px-2 text-center">И</th>
                    <th className="py-3 px-2 text-center w-8"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-soft/60">
                  {standings.map((item) => {
                    const isGamesExpanded = expandedGamesId === item.participant_id;

                    return (
                      <React.Fragment key={item.participant_id}>
                        <tr
                          onClick={() => toggleExpandGames(item.participant_id)}
                          className={`hover:bg-surface-2/60 transition-colors cursor-pointer ${
                            isGamesExpanded ? 'bg-surface-2/40' : ''
                          }`}
                        >
                          {/* Место */}
                          <td className="py-3 px-3 text-center font-bold">
                            <span
                              className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs ${
                                item.place === 1
                                  ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40 font-black'
                                  : item.place === 2
                                  ? 'bg-slate-300/20 text-slate-300 border border-slate-300/40 font-bold'
                                  : item.place === 3
                                  ? 'bg-amber-700/20 text-amber-600 border border-amber-700/40 font-bold'
                                  : 'text-text-muted font-semibold'
                              }`}
                            >
                              {item.place}
                            </span>
                          </td>

                          {/* Игрок */}
                          <td className="py-3 px-3 font-extrabold text-text-primary">
                            <div className="flex items-center gap-1.5">
                              <PlayerAvatar playerId={item.player_id || undefined} avatarVersion={item.avatar_updated_at} forceStoredLookup nickname={item.display_name} size="xs" />
                              <span className="text-text-muted text-[11px] font-mono">
                                #{item.participant_number}
                              </span>
                              <span>{item.display_name}</span>
                            </div>
                          </td>

                          {/* Σ (total_points) */}
                          <td className="py-3 px-2 text-center font-black text-sm text-accent">
                            {item.total_points}
                          </td>

                          {/* Σдб (additional_total) */}
                          <td className="py-3 px-2 text-center font-bold text-text-primary">
                            {item.additional_total > 0 ? `+${item.additional_total}` : item.additional_total}
                          </td>

                          {/* + (positive_judge_points) */}
                          <td className="py-3 px-2 text-center font-mono text-emerald-400 font-semibold">
                            {(item.positive_judge_points ?? 0) > 0 ? `+${item.positive_judge_points}` : (item.positive_judge_points ?? 0)}
                          </td>

                          {/* +Пр (positive_protocol_points) */}
                          <td className="py-3 px-2 text-center font-mono text-emerald-400/80 font-semibold">
                            {(item.positive_protocol_points ?? 0) > 0 ? `+${item.positive_protocol_points}` : (item.positive_protocol_points ?? 0)}
                          </td>

                          {/* − (negative_judge_points) */}
                          <td className="py-3 px-2 text-center font-mono text-danger font-semibold">
                            {(item.negative_judge_points ?? 0) > 0 ? `-${item.negative_judge_points}` : (item.negative_judge_points ?? 0)}
                          </td>

                          {/* −Пр (negative_protocol_points) */}
                          <td className="py-3 px-2 text-center font-mono text-danger/80 font-semibold">
                            {(item.negative_protocol_points ?? 0) > 0 ? `-${item.negative_protocol_points}` : (item.negative_protocol_points ?? 0)}
                          </td>

                          {/* −Д (disciplinary_penalty_points) */}
                          <td className="py-3 px-2 text-center font-mono text-rose-400 font-semibold">
                            {(item.disciplinary_penalty_points ?? 0) > 0 ? `-${item.disciplinary_penalty_points}` : (item.disciplinary_penalty_points ?? 0)}
                          </td>

                          {/* ЛХ (best_move_points) */}
                          <td className="py-3 px-2 text-center font-mono text-amber-400 font-semibold">
                            {item.best_move_points > 0 ? `+${item.best_move_points}` : item.best_move_points}
                          </td>

                          {/* Ci (ci_points) */}
                          <td className="py-3 px-2 text-center font-mono text-cyan-400 font-semibold">
                            {item.ci_points > 0 ? `+${item.ci_points}` : item.ci_points}
                          </td>

                          {/* П (wins) */}
                          <td className="py-3 px-2 text-center font-bold text-emerald-400">
                            {item.wins}
                          </td>

                          {/* Д (don_wins) */}
                          <td className="py-3 px-2 text-center font-bold text-purple-400">
                            {item.don_wins}
                          </td>

                          {/* Ш (sheriff_wins) */}
                          <td className="py-3 px-2 text-center font-bold text-amber-400">
                            {item.sheriff_wins}
                          </td>

                          {/* У (first_killed_count) */}
                          <td className="py-3 px-2 text-center font-bold text-rose-400">
                            {item.first_killed_count}
                          </td>

                          {/* И (games_played) */}
                          <td className="py-3 px-2 text-center font-mono text-text-secondary">
                            {item.games_played}
                          </td>

                          {/* Expand Icon */}
                          <td className="py-3 px-2 text-center text-text-muted">
                            {isGamesExpanded ? (
                              <ChevronUp className="w-4 h-4 mx-auto" />
                            ) : (
                              <ChevronDown className="w-4 h-4 mx-auto" />
                            )}
                          </td>
                        </tr>

                        {/* Expanded Games Breakdown Row */}
                        {isGamesExpanded && (
                          <tr className="bg-surface-2/30">
                            <td colSpan={14} className="p-4">
                              <div className="space-y-2">
                                <h4 className="text-xs font-bold text-text-secondary uppercase tracking-wider">
                                  Детализация по играм: {item.display_name}
                                </h4>
                                {item.place !== item.calculated_place && (
                                  <div className="text-xs text-text-muted bg-surface-2 px-3 py-1.5 rounded-xl border border-border-soft inline-block font-sans">
                                    Исходное место по показателям: <span className="font-mono font-bold text-text-secondary">{item.calculated_place}</span>
                                  </div>
                                )}
                                {item.games.length === 0 ? (
                                  <p className="text-xs text-text-muted italic">Нет данных об играх</p>
                                ) : (
                                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                                    {item.games.map((g) => (
                                      <div
                                        key={g.game_number}
                                        className="p-3 bg-surface-1 rounded-2xl border border-border-soft space-y-1.5 text-xs"
                                      >
                                        <div className="flex items-center justify-between font-bold">
                                          <span>
                                            Игра №{g.game_number} (Слот {g.seat_number})
                                          </span>
                                          <span
                                            className={`px-2 py-0.5 rounded text-[10px] font-extrabold uppercase ${
                                              g.win_point === 1
                                                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                                                : 'bg-danger/10 text-danger border border-danger/30'
                                            }`}
                                          >
                                            {g.win_point === 1 ? 'Победа' : 'Поражение'}
                                          </span>
                                        </div>

                                        <div className="grid grid-cols-2 gap-1 text-[11px] text-text-secondary pt-1 border-t border-border-soft/60">
                                          <div>
                                            Роль:{' '}
                                            <span className="font-semibold text-text-primary capitalize">
                                              {g.role || '—'}
                                            </span>
                                          </div>
                                          <div>
                                            Победа team:{' '}
                                            <span className="font-semibold text-text-primary">
                                              {g.winner_team === 'red'
                                                ? 'Красные'
                                                : g.winner_team === 'black'
                                                ? 'Чёрные'
                                                : '—'}
                                            </span>
                                          </div>
                                          <div>
                                            Балл судьи:{' '}
                                            <span className={`font-mono ${(g.judge_bonus ?? 0) > 0 ? 'text-emerald-400' : (g.judge_bonus ?? 0) < 0 ? 'text-rose-400' : 'text-slate-400'}`}>
                                              {(g.judge_bonus ?? 0) > 0 ? `+${g.judge_bonus}` : (g.judge_bonus ?? 0)}
                                            </span>
                                          </div>
                                          <div>
                                            ЛХ: <span className="font-mono text-amber-400">+{g.best_move_points}</span>
                                          </div>
                                          {!!g.protocol_bonus && (
                                            <div>
                                              Протокол: <span className="font-mono text-emerald-400">+{g.protocol_bonus}</span>
                                            </div>
                                          )}
                                          {!!g.disciplinary_penalty_points && (
                                            <div>
                                              Дисципл.: <span className="font-mono text-rose-400">-{g.disciplinary_penalty_points}</span>
                                            </div>
                                          )}
                                          <div className="col-span-2 pt-1 border-t border-border-soft/40 mt-1 space-y-0.5 text-[10px]">
                                            <div className="flex justify-between">
                                              <span className="text-text-muted">Ставка Ci:</span>
                                              <span className="font-mono text-text-primary">{g.ci_rate}</span>
                                            </div>
                                            <div className="flex justify-between">
                                              <span className="text-text-muted">Начисленный Ci:</span>
                                              <span className="font-mono text-cyan-400 font-extrabold">+{g.ci_points}</span>
                                            </div>
                                            <div className="text-[9px] text-text-muted italic leading-tight mt-0.5">
                                              {g.ci_reason === 'red_loss_full'
                                                ? 'полная компенсация за поражение красных'
                                                : g.ci_reason === 'red_win_half_with_black_lh'
                                                ? 'половина компенсации за победу красных с чёрным в ЛХ'
                                                : 'компенсация не начислена'}
                                            </div>
                                          </div>
                                        </div>

                                        <div className="pt-1 text-right font-extrabold text-xs text-accent border-t border-border-soft/60">
                                          Итого за игру: {g.game_total}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {tournament && (
        <ResultsImageExportModal
          isOpen={isExportModalOpen}
          onClose={() => setIsExportModalOpen(false)}
          tournament={tournament}
          exportType="standings"
        />
      )}
    </div>
  );
};
