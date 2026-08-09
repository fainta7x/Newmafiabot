import React, { useState, useEffect } from 'react';
import {
  Trophy,
  AlertCircle,
  Award,
  Check,
  X,
  Crown,
  Shield,
  UserCheck,
  RefreshCw,
  ArrowDown,
} from 'lucide-react';
import { api, TournamentStandingItem } from '../../../lib/api.ts';
import { ResultsImageExportModal } from './ResultsImageExportModal.tsx';

interface TournamentOfficialResultsProps {
  tournamentId: string;
  onResolve: () => void;
  refreshTrigger: number;
}

export const TournamentOfficialResults: React.FC<TournamentOfficialResultsProps> = ({
  tournamentId,
  onResolve,
  refreshTrigger,
}) => {
  const [tournament, setTournament] = useState<any>(null);
  const [showOfficialExport, setShowOfficialExport] = useState(false);

  const [readiness, setReadiness] = useState<any>(null);
  const [resolutions, setResolutions] = useState<any[]>([]);
  const [standings, setStandings] = useState<TournamentStandingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Standings modal state
  const [activeStandingsTie, setActiveStandingsTie] = useState<any>(null);
  const [orderedParticipants, setOrderedParticipants] = useState<any[]>([]);
  const [standingsMethod, setStandingsMethod] = useState<'draw' | 'chief_judge_decision'>('draw');
  const [standingsComment, setStandingsComment] = useState('');
  const [standingsSubmitting, setStandingsSubmitting] = useState(false);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [readinessRes, resolutionsRes, standingsRes, tournamentRes] = await Promise.all([
        api.getTournamentFinalReadiness(tournamentId),
        api.getTournamentFinalResolutions(tournamentId),
        api.getTournamentStandings(tournamentId),
        api.getTournament(tournamentId),
      ]);
      setReadiness(readinessRes);
      setResolutions(resolutionsRes.resolutions || []);
      setStandings(standingsRes.standings || []);
      setTournament(tournamentRes);
    } catch (err: any) {
      setError(err.message || 'Ошибка загрузки данных официальных итогов');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [tournamentId, refreshTrigger]);

  const handleOpenStandingsTie = (tie: any) => {
    setActiveStandingsTie(tie);
    // Find matching standing items to get current stats & numbers
    const mapped = tie.participant_ids.map((id: string) => {
      const found = standings.find((s) => s.participant_id === id);
      return {
        id,
        name: found ? found.display_name : id,
        number: found ? found.participant_number : 0,
        points: found ? found.total_points : 0,
        addPoints: found ? found.additional_total : 0,
        wins: found ? found.wins : 0,
        donSheriffWins: found ? found.don_wins + found.sheriff_wins : 0,
        fkCount: found ? found.first_killed_count : 0,
      };
    });
    setOrderedParticipants(mapped);
    setStandingsMethod('draw');
    setStandingsComment('');
  };

  const handleMoveUp = (index: number) => {
    if (index === 0) return;
    const nextList = [...orderedParticipants];
    const temp = nextList[index];
    nextList[index] = nextList[index - 1];
    nextList[index - 1] = temp;
    setOrderedParticipants(nextList);
  };

  const handleMoveDown = (index: number) => {
    if (index === orderedParticipants.length - 1) return;
    const nextList = [...orderedParticipants];
    const temp = nextList[index];
    nextList[index] = nextList[index + 1];
    nextList[index + 1] = temp;
    setOrderedParticipants(nextList);
  };

  const handleSaveStandingsTie = async () => {
    if (!activeStandingsTie || standingsSubmitting) return;

    // Safety checks
    const originalIds = new Set(activeStandingsTie.participant_ids);
    const savedIds = new Set(orderedParticipants.map((p) => p.id));
    if (originalIds.size !== savedIds.size || [...originalIds].some((id) => !savedIds.has(id))) {
      alert('Ошибка: состав участников группы равенства не совпадает с исходным');
      return;
    }

    setStandingsSubmitting(true);
    try {
      await api.resolveStandingsTie(tournamentId, activeStandingsTie.tie_group_id, {
        ordered_participant_ids: orderedParticipants.map((p) => p.id),
        resolution_method: standingsMethod,
        comment: standingsComment.trim() || undefined,
      });
      setActiveStandingsTie(null);
      onResolve();
    } catch (err: any) {
      alert(err.message || 'Ошибка сохранения решения');
    } finally {
      setStandingsSubmitting(false);
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'mvp':
        return <Crown className="w-5 h-5 text-amber-400" />;
      case 'best_citizen':
        return <UserCheck className="w-5 h-5 text-emerald-400" />;
      case 'best_sheriff':
        return <Shield className="w-5 h-5 text-amber-400" />;
      case 'best_mafia':
        return <Award className="w-5 h-5 text-rose-400" />;
      case 'best_don':
        return <Crown className="w-5 h-5 text-purple-400" />;
      default:
        return <Trophy className="w-5 h-5 text-accent" />;
    }
  };

  if (loading) {
    return (
      <div className="bg-surface-1 border border-border-soft rounded-3xl p-6 text-center text-text-muted text-xs space-y-2">
        <RefreshCw className="w-5 h-5 animate-spin mx-auto text-accent" />
        <span>Загрузка решений турнира...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-danger/10 border border-danger/30 text-danger p-4 rounded-3xl text-xs font-semibold">
        {error}
      </div>
    );
  }

  const isReady = readiness?.ready;
  const unresolvedStandings = readiness?.unresolved_standings_ties || [];
  const unresolvedNominations = readiness?.unresolved_nomination_ties || [];

  return (
    <div className="space-y-4">
      {/* Status Panel */}
      <div className="bg-surface-1 border border-border-soft rounded-3xl p-4 sm:p-5 space-y-3 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Trophy className="w-5 h-5 text-amber-400" />
            <h3 className="text-base font-extrabold text-text-primary">Официальные итоги</h3>
          </div>
          <span
            className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border ${
              isReady
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                : 'bg-amber-500/10 text-amber-400 border-amber-500/30 animate-pulse'
            }`}
          >
            {isReady ? 'Официальные итоги готовы' : 'Есть неразрешённые равенства'}
          </span>
        </div>

        {isReady ? (
          <p className="text-xs text-text-muted leading-relaxed">
            Все итоговые места и номинации имеют однозначный результат по действующим критериям.
          </p>
        ) : (
          <p className="text-xs text-text-muted leading-relaxed">
            Равенства мест в итоговой таблице обрабатываются отдельно. Точное равенство в номинации означает, что все канонические статистические критерии исчерпаны — вручную выбирать победителя нельзя.
          </p>
        )}

        {/* Fresh official PNG card. Legacy public-link state is intentionally ignored here. */}
        <div className="pt-3 border-t border-border-soft/60 flex flex-col gap-3">
          <div>
            <div className="text-[13px] font-extrabold text-text-primary">Итоговая карточка турнира</div>
            {tournament?.status === 'correction' ? (
              <p className="mt-1 text-xs leading-relaxed text-text-muted">
                Завершите корректировку турнира и повторно зафиксируйте итоги — после этого можно будет сформировать новое изображение.
              </p>
            ) : tournament?.status === 'completed' && isReady ? (
              <p className="mt-1 text-xs leading-relaxed text-text-muted">
                PNG будет сформирован заново из актуальной таблицы и официальных наград. Генерация не меняет данные турнира.
              </p>
            ) : (
              <p className="mt-1 text-xs leading-relaxed text-text-muted">
                Итоговый PNG станет доступен после завершения турнира и разрешения всех равенств.
              </p>
            )}
          </div>
          {tournament?.status === 'completed' && isReady ? (
            <button
              type="button"
              onClick={() => setShowOfficialExport(true)}
              className="min-h-[48px] w-full sm:w-auto sm:self-start bg-accent hover:bg-accent-hover text-white font-black text-xs px-5 py-3 rounded-xl transition-all shadow-md flex items-center justify-center gap-2"
            >
              <Trophy className="w-4 h-4 text-amber-300" />
              Сформировать итоговый PNG
            </button>
          ) : null}
        </div>
      </div>

      {/* Unresolved Standings Ties */}
      {unresolvedStandings.length > 0 && (
        <div className="bg-surface-1 border border-border-soft rounded-3xl p-4 sm:p-5 space-y-3.5">
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-text-secondary">
            <AlertCircle className="w-4 h-4 text-amber-400" />
            <span>Равенства в турнирной таблице ({unresolvedStandings.length})</span>
          </div>

          <div className="space-y-2.5">
            {unresolvedStandings.map((tie: any) => (
              <div
                key={tie.tie_group_id}
                className="bg-surface-2 p-3.5 rounded-2xl border border-border-soft flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="space-y-1 min-w-0">
                  <span className="text-[10px] uppercase font-black tracking-widest text-text-muted block">
                    Группа равенства #{tie.tie_group_id.slice(0, 8)}
                  </span>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    {tie.display_names.map((name: string, i: number) => (
                      <span key={i} className="text-xs font-extrabold text-text-primary bg-surface-3 px-2 py-0.5 rounded-lg border border-border-soft/60">
                        {name}
                      </span>
                    ))}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleOpenStandingsTie(tie)}
                  className="bg-accent hover:bg-accent-hover text-white font-extrabold text-xs px-4 py-2 rounded-xl transition-all shadow-md shrink-0 w-full sm:w-auto min-h-[38px]"
                >
                  Определить места
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Unresolved Nomination Ties */}
      {unresolvedNominations.length > 0 && (
        <div className="bg-surface-1 border border-border-soft rounded-3xl p-4 sm:p-5 space-y-3.5">
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-text-secondary">
            <Award className="w-4 h-4 text-cyan-400" />
            <span>Равенства в номинациях ({unresolvedNominations.length})</span>
          </div>

          <div className="space-y-2.5">
            {unresolvedNominations.map((tie: any) => (
              <div
                key={tie.category}
                className="bg-surface-2 p-3.5 rounded-2xl border border-border-soft flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="flex items-start gap-3 min-w-0">
                  <div className="p-2.5 bg-surface-3 rounded-xl border border-border-soft/60 shrink-0">
                    {getCategoryIcon(tie.category)}
                  </div>
                  <div className="space-y-0.5 min-w-0">
                    <span className="text-xs font-extrabold text-text-primary block truncate">
                      {tie.title}
                    </span>
                    <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                      {tie.display_names.map((name: string, i: number) => (
                        <span key={i} className="text-[10px] font-semibold text-text-muted">
                          {name}{i < tie.display_names.length - 1 ? ',' : ''}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="text-[10px] font-bold uppercase tracking-wider text-amber-400 sm:text-right">
                  Полное равенство после личного сравнения
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Resolved list (For audit / info if any exists) */}
      {resolutions.length > 0 && (
        <div className="bg-surface-1 border border-border-soft rounded-3xl p-4 sm:p-5 space-y-3 shadow-sm">
          <div className="text-xs font-black uppercase tracking-wider text-text-muted">
            Принятые решения ({resolutions.length})
          </div>
          <div className="divide-y divide-border-soft/60">
            {resolutions.map((res) => {
              return (
                <div key={res.id} className="py-2.5 first:pt-0 last:pb-0 flex items-start justify-between gap-3 text-xs">
                  <div>
                    <div className="font-extrabold text-text-primary">
                      <span>Утверждены места в таблице</span>
                    </div>
                    <div className="text-[11px] text-text-muted mt-0.5">
                      Способ:{' '}
                      <span className="font-semibold text-text-secondary">
                        {res.resolution_method === 'draw' ? 'Жребий' : 'Решение Главного судьи'}
                      </span>
                      {res.comment && <span className="block italic mt-0.5">«{res.comment}»</span>}
                    </div>
                  </div>
                  <span className="text-[10px] font-mono text-text-muted uppercase bg-surface-2 px-1.5 py-0.5 rounded border border-border-soft">
                    Таблица
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ========================================== */}
      {/* MODAL: Standings Tie Resolution            */}
      {/* ========================================== */}
      {activeStandingsTie && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-surface-1 border border-border-soft rounded-3xl w-full max-w-md overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="p-4 border-b border-border-soft flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-amber-400" />
                <h3 className="text-sm font-black text-text-primary uppercase tracking-tight">
                  Разрешение равенства мест
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setActiveStandingsTie(null)}
                className="text-text-muted hover:text-text-primary p-1 rounded-lg hover:bg-surface-2 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Content (Scrollable) */}
            <div className="p-4 space-y-4 overflow-y-auto flex-1 text-xs">
              <p className="text-text-secondary leading-relaxed font-sans text-[11px] bg-surface-2 p-2.5 rounded-2xl border border-border-soft/60">
                Передвигайте участников вверх и вниз с помощью кнопок справа, чтобы установить точный официальный порядок мест. Верхний игрок займет наилучшее доступное место.
              </p>

              <div className="space-y-1.5">
                {orderedParticipants.map((player, idx) => (
                  <div
                    key={player.id}
                    className="bg-surface-2 border border-border-soft rounded-2xl p-2.5 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-extrabold text-[13px] text-text-primary truncate">
                          {player.name}
                        </span>
                        <span className="text-[10px] text-text-muted font-mono">
                          (#{player.number})
                        </span>
                      </div>
                      <div className="text-[10px] text-text-muted font-mono flex flex-wrap gap-x-2 mt-0.5">
                        <span>Очки: {player.points}</span>
                        <span>Σдб: {player.addPoints}</span>
                        <span>Поб: {player.wins}</span>
                        <span>Д+Ш: {player.donSheriffWins}</span>
                        <span>У: {player.fkCount}</span>
                      </div>
                    </div>

                    {/* Reorder actions */}
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleMoveUp(idx)}
                        disabled={idx === 0}
                        className="p-1.5 bg-surface-3 hover:bg-surface-hover border border-border-soft text-text-secondary hover:text-text-primary rounded-xl disabled:opacity-20 disabled:cursor-not-allowed cursor-pointer min-h-[32px] min-w-[32px] flex items-center justify-center"
                        title="Поднять выше"
                      >
                        <ArrowDown className="w-3.5 h-3.5 rotate-180" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleMoveDown(idx)}
                        disabled={idx === orderedParticipants.length - 1}
                        className="p-1.5 bg-surface-3 hover:bg-surface-hover border border-border-soft text-text-secondary hover:text-text-primary rounded-xl disabled:opacity-20 disabled:cursor-not-allowed cursor-pointer min-h-[32px] min-w-[32px] flex items-center justify-center"
                        title="Опустить ниже"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Resolution Method Selector */}
              <div className="space-y-2 pt-2 border-t border-border-soft/60">
                <span className="font-bold text-text-secondary uppercase tracking-wider text-[10px] block">
                  Способ принятия решения:
                </span>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setStandingsMethod('draw')}
                    className={`py-2 px-3 rounded-xl font-bold border transition-all text-center cursor-pointer min-h-[38px] ${
                      standingsMethod === 'draw'
                        ? 'bg-accent/10 border-accent text-accent'
                        : 'bg-surface-2 border-border-soft text-text-secondary hover:bg-surface-3'
                    }`}
                  >
                    Жребий
                  </button>
                  <button
                    type="button"
                    onClick={() => setStandingsMethod('chief_judge_decision')}
                    className={`py-2 px-3 rounded-xl font-bold border transition-all text-center cursor-pointer min-h-[38px] ${
                      standingsMethod === 'chief_judge_decision'
                        ? 'bg-accent/10 border-accent text-accent'
                        : 'bg-surface-2 border-border-soft text-text-secondary hover:bg-surface-3'
                    }`}
                  >
                    Решение ГС
                  </button>
                </div>
              </div>

              {/* Comment text area */}
              <div className="space-y-1.5">
                <span className="font-bold text-text-secondary uppercase tracking-wider text-[10px] block">
                  Комментарий (необязательно):
                </span>
                <textarea
                  value={standingsComment}
                  onChange={(e) => setStandingsComment(e.target.value)}
                  placeholder="Например, результаты жребия или пункт регламента..."
                  className="w-full bg-surface-2 border border-border-soft rounded-2xl p-2.5 text-xs text-text-primary focus:outline-none focus:border-accent min-h-[60px]"
                />
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-border-soft bg-surface-2 shrink-0 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setActiveStandingsTie(null)}
                className="bg-surface-3 hover:bg-surface-hover text-text-primary font-bold px-4 py-2 rounded-xl text-xs min-h-[40px]"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={handleSaveStandingsTie}
                disabled={standingsSubmitting}
                className="bg-accent hover:bg-accent-hover text-white font-black px-5 py-2 rounded-xl text-xs min-h-[40px] flex items-center gap-1.5 shadow-md shadow-accent/20 cursor-pointer"
              >
                {standingsSubmitting ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Сохранение...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Сохранить порядок</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {tournament ? (
        <ResultsImageExportModal
          isOpen={showOfficialExport}
          onClose={() => setShowOfficialExport(false)}
          tournament={tournament}
          exportType="official"
        />
      ) : null}
    </div>
  );
};
