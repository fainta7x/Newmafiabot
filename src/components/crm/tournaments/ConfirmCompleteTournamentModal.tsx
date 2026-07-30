import React, { useState, useEffect } from 'react';
import { Trophy, AlertTriangle, X, RefreshCw, Award, Crown, Shield, UserCheck } from 'lucide-react';
import { api } from '../../../lib/api.ts';

interface ConfirmCompleteTournamentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  tournamentId: string;
}

export const ConfirmCompleteTournamentModal: React.FC<ConfirmCompleteTournamentModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  tournamentId,
}) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [top3, setTop3] = useState<any[]>([]);
  const [nominations, setNominations] = useState<any[]>([]);

  useEffect(() => {
    if (isOpen) {
      loadVerificationData();
    }
  }, [isOpen, tournamentId]);

  const loadVerificationData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [standingsRes, nominationsRes] = await Promise.all([
        api.getTournamentStandings(tournamentId),
        api.getTournamentNominations(tournamentId),
      ]);
      setTop3((standingsRes.standings || []).slice(0, 3));
      setNominations(nominationsRes.nominations || []);
    } catch (err: any) {
      setError(err.message || 'Не удалось загрузить данные для сверки');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const handleSubmit = async () => {
    if (submitLoading) return;
    setSubmitLoading(true);
    setError(null);
    try {
      await onConfirm();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Произошла ошибка при завершении турнира');
    } finally {
      setSubmitLoading(false);
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'mvp':
        return <Crown className="w-3.5 h-3.5 text-amber-400" />;
      case 'best_citizen':
        return <UserCheck className="w-3.5 h-3.5 text-emerald-400" />;
      case 'best_sheriff':
        return <Shield className="w-3.5 h-3.5 text-amber-400" />;
      case 'best_mafia':
        return <Award className="w-3.5 h-3.5 text-rose-400" />;
      case 'best_don':
        return <Crown className="w-3.5 h-3.5 text-purple-400" />;
      default:
        return <Trophy className="w-3.5 h-3.5 text-accent" />;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-surface-1 border border-border-soft rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-border-soft flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Trophy className="w-5 h-5 text-amber-400" />
            <h3 className="text-sm sm:text-base font-black text-text-primary uppercase tracking-tight">
              Завершение турнира
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-text-muted hover:text-text-primary p-1.5 hover:bg-surface-2 rounded-xl transition-all cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 sm:p-5 space-y-4 overflow-y-auto flex-1 text-xs">
          {/* Warning Banner */}
          <div className="bg-danger/10 border border-danger/30 rounded-2xl p-3 text-danger flex items-start gap-2.5">
            <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-extrabold uppercase tracking-wide">Внимание! Действие необратимо</p>
              <p className="text-[11px] opacity-90 leading-relaxed font-sans">
                После фиксации результатов турнир перейдет в статус «Завершён». Редактирование игр, ролей, протоколов и штрафов будет полностью заблокировано. Начисленные баллы и номинации станут финальными.
              </p>
            </div>
          </div>

          {error && (
            <div className="bg-danger/10 border border-danger/30 text-danger p-3 rounded-xl font-bold">
              {error}
            </div>
          )}

          {loading ? (
            <div className="py-12 text-center text-text-muted space-y-2">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto text-accent" />
              <p className="font-sans">Сборка финальных итогов для сверки...</p>
            </div>
          ) : (
            <div className="space-y-4">
              
              {/* Standings Verification */}
              <div className="space-y-2">
                <h4 className="font-extrabold uppercase text-text-secondary tracking-wider text-[10px]">
                  Лидеры турнира (Сверка):
                </h4>
                <div className="bg-surface-2/40 border border-border-soft rounded-2xl p-3 space-y-2.5">
                  {top3.length === 0 ? (
                    <p className="italic text-text-muted">Нет данных для сверки</p>
                  ) : (
                    top3.map((player: any) => (
                      <div key={player.participant_id} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className={`w-5 h-5 rounded-full text-[10px] font-black flex items-center justify-center shrink-0 ${
                            player.place === 1
                              ? 'bg-amber-500/20 text-amber-400'
                              : player.place === 2
                              ? 'bg-slate-300/20 text-slate-300'
                              : 'bg-amber-700/20 text-amber-600'
                          }`}>
                            {player.place}
                          </span>
                          <span className="font-extrabold text-text-primary text-[13px]">
                            {player.display_name}
                          </span>
                          <span className="text-[10px] text-text-muted font-mono">
                            (#{player.participant_number})
                          </span>
                        </div>
                        <span className="font-mono font-black text-accent text-sm">
                          {player.total_points} Σ
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Nominations Verification */}
              <div className="space-y-2">
                <h4 className="font-extrabold uppercase text-text-secondary tracking-wider text-[10px]">
                  Победители номинаций (Сверка):
                </h4>
                <div className="bg-surface-2/40 border border-border-soft rounded-2xl p-2.5 space-y-2">
                  {nominations.map((nom: any) => {
                    const topScore = nom.candidates[0]?.nomination_points;
                    const winners = nom.candidates.filter(
                      (c: any) => Math.abs(c.nomination_points - topScore) < 0.0001
                    );

                    return (
                      <div key={nom.category} className="flex items-center justify-between gap-3 text-[11px] py-1 border-b border-border-soft/40 last:border-0">
                        <div className="flex items-center gap-1.5 min-w-0">
                          {getCategoryIcon(nom.category)}
                          <span className="font-semibold text-text-muted">{nom.title}:</span>
                        </div>
                        
                        <div className="text-right min-w-0">
                          {nom.has_tie ? (
                            <span className="text-amber-400 font-extrabold text-[10px] bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded">
                              Равенство
                            </span>
                          ) : winners.length > 0 ? (
                            <span className="font-bold text-text-primary truncate block max-w-[120px]">
                              {winners[0].display_name}
                            </span>
                          ) : (
                            <span className="text-text-muted italic">—</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 sm:p-5 border-t border-border-soft flex gap-3 bg-surface-2/30">
          <button
            type="button"
            onClick={onClose}
            disabled={submitLoading}
            className="flex-1 bg-surface-2 hover:bg-surface-3 text-text-primary font-bold py-2.5 rounded-xl transition-all border border-border-soft cursor-pointer text-center"
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={loading || submitLoading}
            className="flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:bg-surface-2 disabled:text-text-muted disabled:border-border-soft text-white font-extrabold py-2.5 rounded-xl transition-all shadow-md shadow-emerald-600/10 cursor-pointer text-center flex items-center justify-center gap-2"
          >
            {submitLoading ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Фиксация...</span>
              </>
            ) : (
              <span>Подтвердить</span>
            )}
          </button>
        </div>

      </div>
    </div>
  );
};
