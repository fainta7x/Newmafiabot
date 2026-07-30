import React, { useState, useEffect } from 'react';
import { RefreshCw, Trophy, AlertCircle, ChevronDown, ChevronUp, Award, UserCheck, Crown, Shield } from 'lucide-react';
import { api } from '../../../lib/api.ts';

interface TournamentNominationsViewProps {
  tournamentId: string;
}

export const TournamentNominationsView: React.FC<TournamentNominationsViewProps> = ({ tournamentId }) => {
  const [nominations, setNominations] = useState<any[]>([]);
  const [provisional, setProvisional] = useState<boolean>(true);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  // Tracks which candidate breakdowns are expanded
  // format: "category-participantId"
  const [expandedCandidates, setExpandedCandidates] = useState<Record<string, boolean>>({});

  const fetchNominations = async (isManual = false) => {
    if (isManual) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const res = await api.getTournamentNominations(tournamentId);
      setNominations(res.nominations || []);
      setProvisional(res.provisional);
    } catch (err: any) {
      setError(err.message || 'Не удалось рассчитать номинации турнира');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchNominations();
  }, [tournamentId]);

  const toggleExpand = (category: string, participantId: string) => {
    const key = `${category}-${participantId}`;
    setExpandedCandidates((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  if (loading) {
    return (
      <div className="bg-surface-1 border border-border-soft rounded-3xl p-8 text-center text-text-muted text-xs space-y-2">
        <RefreshCw className="w-5 h-5 animate-spin mx-auto text-accent" />
        <p>Вычисление номинаций турнира...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-danger/10 border border-danger/30 text-danger p-4 rounded-2xl text-xs font-semibold">
        {error}
      </div>
    );
  }

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

  return (
    <div className="space-y-4 text-text-primary">
      {/* Top Banner & Control */}
      <div className="bg-surface-1 border border-border-soft rounded-3xl p-4 sm:p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Trophy className="w-5 h-5 text-amber-400 animate-pulse" />
            <h3 className="text-base font-extrabold text-text-primary tracking-tight">Номинации турнира</h3>
          </div>

          <button
            type="button"
            onClick={() => fetchNominations(true)}
            disabled={refreshing}
            className="bg-accent/10 hover:bg-accent/20 text-accent border border-accent/30 font-bold px-3.5 py-2 rounded-xl text-xs transition-all flex items-center gap-2 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            <span>Пересчитать</span>
          </button>
        </div>

        {/* Provisional Status Notification Banner */}
        {provisional ? (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-3 text-xs text-amber-400 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">Предварительные результаты</p>
              <p className="text-[11px] opacity-90 mt-0.5">
                Турнир еще не завершён. Ниже представлены промежуточные лидеры номинаций. Окончательные итоги будут зафиксированы после официального завершения турнира главным судьей.
              </p>
            </div>
          </div>
        ) : (
          <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-3 text-xs text-emerald-400 flex items-start gap-2">
            <Trophy className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">Официальные итоги зафиксированы</p>
              <p className="text-[11px] opacity-90 mt-0.5">
                Турнир успешно завершён. Номинации рассчитаны на основе финальных протоколов всех 10 игр по внутреннему регламенту турнира.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Grid of Nominations */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {nominations.map((nom) => {
          const topCandidate = nom.candidates[0];
          
          if (!topCandidate) {
            return (
              <div key={nom.category} className="bg-surface-1 border border-border-soft rounded-3xl p-5 space-y-3">
                <div className="flex items-center gap-2.5 border-b border-border-soft pb-3">
                  {getCategoryIcon(nom.category)}
                  <h4 className="text-sm font-black tracking-tight">{nom.title}</h4>
                </div>
                <p className="text-xs text-text-muted italic">Нет претендентов. Никто еще не сыграл в этой роли.</p>
              </div>
            );
          }

          // In case of a tie, list all candidate(s) sharing the top score
          const topScore = topCandidate.nomination_points;
          const winners = nom.candidates.filter(
            (c: any) => Math.abs(c.nomination_points - topScore) < 0.0001
          );

          return (
            <div key={nom.category} className="bg-surface-1 border border-border-soft rounded-3xl p-4 sm:p-5 space-y-4">
              {/* Header */}
              <div className="flex items-center justify-between border-b border-border-soft pb-3 gap-2">
                <div className="flex items-center gap-2.5">
                  {getCategoryIcon(nom.category)}
                  <h4 className="text-sm font-black tracking-tight">{nom.title}</h4>
                </div>
                {nom.has_tie && (
                  <span className="bg-amber-500/10 text-amber-400 border border-amber-500/30 text-[10px] font-extrabold px-2 py-0.5 rounded-full uppercase tracking-wider text-center">
                    Равенство — требуется решение Главного судьи
                  </span>
                )}
              </div>

              {/* Winners Spotlight */}
              <div className="space-y-2">
                <span className="text-[10px] font-extrabold text-text-muted uppercase tracking-wider block">
                  {winners.length > 1 ? 'Претенденты с равными баллами (решение за Главным судьёй):' : 'Победитель номинации:'}
                </span>

                <div className="grid grid-cols-1 gap-2">
                  {winners.map((winner: any) => (
                    <div
                      key={winner.participant_id}
                      className="bg-accent/5 border border-accent/20 rounded-2xl p-3 flex items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                          winners.length > 1 ? 'bg-accent/10 text-accent' : 'bg-amber-500/20 text-amber-400'
                        }`}>
                          {winners.length > 1 ? (
                            <Award className="w-4.5 h-4.5" />
                          ) : (
                            <Trophy className="w-4.5 h-4.5 fill-amber-500/10" />
                          )}
                        </span>
                        <div className="min-w-0">
                          <span className="text-sm font-black text-text-primary block truncate">
                            {winner.display_name}
                          </span>
                          <span className="text-[10px] text-text-secondary block">
                            Игр в роли: {winner.games_in_role}
                          </span>
                        </div>
                      </div>

                      <div className="text-right font-mono">
                        <div className="text-[9px] text-text-muted uppercase">Очки</div>
                        <div className="text-base font-black text-accent">
                          {winner.nomination_points > 0 ? `+${winner.nomination_points}` : winner.nomination_points}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Candidates Table */}
              <div className="space-y-2 pt-2">
                <span className="text-[10px] font-extrabold text-text-muted uppercase tracking-wider block">
                  Рейтинг претендентов:
                </span>

                <div className="border border-border-soft rounded-2xl overflow-hidden bg-surface-2/20">
                  <table className="w-full text-left text-xs border-collapse font-mono">
                    <thead>
                      <tr className="bg-surface-2 text-text-muted text-[10px] uppercase font-bold border-b border-border-soft">
                        <th className="py-2 px-3 text-center w-8">#</th>
                        <th className="py-2 px-2 text-left font-sans">Игрок</th>
                        <th className="py-2 px-1 text-center">Судья</th>
                        <th className="py-2 px-1 text-center">Проток</th>
                        <th className="py-2 px-1 text-center">ЛХ</th>
                        <th className="py-2 px-1 text-center">Штраф</th>
                        <th className="py-2 px-2 text-center text-accent font-extrabold w-14">Итого</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border-soft/40 text-[11px]">
                      {nom.candidates.map((candidate: any, idx: number) => {
                        const isExpanded = expandedCandidates[`${nom.category}-${candidate.participant_id}`];
                        const isWinner = winners.some((w: any) => w.participant_id === candidate.participant_id);

                        return (
                          <React.Fragment key={candidate.participant_id}>
                            <tr
                              onClick={() => toggleExpand(nom.category, candidate.participant_id)}
                              className={`hover:bg-surface-2/50 transition-colors cursor-pointer ${
                                isWinner ? 'bg-accent/5 font-semibold' : ''
                              }`}
                            >
                              <td className="py-2 px-3 text-center text-text-muted font-bold">
                                {idx + 1}
                              </td>
                              <td className="py-2 px-2 text-left font-sans font-bold text-text-primary">
                                <div className="flex items-center gap-1.5 justify-between min-w-0">
                                  <span className="truncate max-w-[80px]">{candidate.display_name}</span>
                                  {isExpanded ? (
                                    <ChevronUp className="w-3.5 h-3.5 text-text-muted shrink-0" />
                                  ) : (
                                    <ChevronDown className="w-3.5 h-3.5 text-text-muted shrink-0" />
                                  )}
                                </div>
                              </td>
                              <td className="py-2 px-1 text-center text-text-secondary">
                                {candidate.judge_bonus > 0 ? `+${candidate.judge_bonus}` : candidate.judge_bonus}
                              </td>
                              <td className="py-2 px-1 text-center text-text-secondary">
                                {candidate.protocol_bonus > 0 ? `+${candidate.protocol_bonus}` : candidate.protocol_bonus}
                              </td>
                              <td className="py-2 px-1 text-center text-amber-400">
                                {candidate.best_move_points > 0 ? `+${candidate.best_move_points}` : candidate.best_move_points}
                              </td>
                              <td className="py-2 px-1 text-center text-danger">
                                {candidate.penalty_points > 0 ? `-${candidate.penalty_points}` : candidate.penalty_points}
                              </td>
                              <td className="py-2 px-2 text-center text-accent font-black">
                                {candidate.nomination_points > 0 ? `+${candidate.nomination_points}` : candidate.nomination_points}
                              </td>
                            </tr>

                            {/* Collapsible detailed per-game breakdown row */}
                            {isExpanded && (
                              <tr className="bg-surface-2/40">
                                <td colSpan={7} className="py-2 px-3">
                                  <div className="space-y-1.5 text-[10px] py-1">
                                    <span className="font-bold text-text-secondary uppercase tracking-wider block font-sans">
                                      Детализация игр ({candidate.display_name}):
                                    </span>
                                    {candidate.breakdown.length === 0 ? (
                                      <span className="italic text-text-muted font-sans">Нет завершённых игр в этой роли</span>
                                    ) : (
                                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 font-sans">
                                        {candidate.breakdown.map((b: any, bIdx: number) => (
                                          <div
                                            key={bIdx}
                                            className="p-1.5 bg-surface-1 border border-border-soft rounded-lg space-y-0.5"
                                          >
                                            <div className="font-bold flex justify-between">
                                              <span>Игра №{b.game_number}</span>
                                              <span className="text-accent font-mono">+{b.nomination_points} очков</span>
                                            </div>
                                            <div className="grid grid-cols-2 gap-x-2 text-[9px] text-text-muted font-mono">
                                              <div>Судья: +{b.judge_bonus}</div>
                                              <div>Протокол: +{b.protocol_bonus}</div>
                                              <div>ЛХ: +{b.best_move_points}</div>
                                              <div>Штрафы: -{b.penalty_points}</div>
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
            </div>
          );
        })}
      </div>
    </div>
  );
};
