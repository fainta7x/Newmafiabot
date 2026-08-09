import React, { useEffect, useState } from 'react';
import { Award, ChevronDown, ChevronUp, Crown, RefreshCw, Shield, Trophy, UserCheck, AlertCircle } from 'lucide-react';
import { api } from '../../../lib/api.ts';
import { PlayerAvatar } from '../../ui/PlayerAvatar.tsx';

interface TournamentNominationsViewProps {
  tournamentId: string;
  refreshTrigger?: number;
}

const signed = (value: number) => value > 0 ? `+${value}` : String(value);

export const TournamentNominationsView: React.FC<TournamentNominationsViewProps> = ({ tournamentId, refreshTrigger }) => {
  const [nominations, setNominations] = useState<Awaited<ReturnType<typeof api.getTournamentNominations>>['nominations']>([]);
  const [provisional, setProvisional] = useState(true);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const load = async (manual = false) => {
    manual ? setRefreshing(true) : setLoading(true);
    setError(null);
    try {
      const response = await api.getTournamentNominations(tournamentId);
      setNominations(response.nominations || []);
      setProvisional(response.provisional);
    } catch (err: any) {
      setError(err.message || 'Не удалось рассчитать номинации турнира');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { void load(); }, [tournamentId, refreshTrigger]);

  const icon = (category: string) => {
    if (category === 'mvp') return <Crown className="w-5 h-5 text-amber-400" />;
    if (category === 'best_citizen') return <UserCheck className="w-5 h-5 text-emerald-400" />;
    if (category === 'best_sheriff') return <Shield className="w-5 h-5 text-amber-400" />;
    if (category === 'best_mafia') return <Award className="w-5 h-5 text-rose-400" />;
    if (category === 'best_don') return <Crown className="w-5 h-5 text-purple-400" />;
    return <Trophy className="w-5 h-5 text-accent" />;
  };

  if (loading) return <div className="bg-surface-1 border border-border-soft rounded-3xl p-8 text-center text-text-muted text-xs"><RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-accent" />Вычисление номинаций турнира...</div>;
  if (error) return <div className="bg-danger/10 border border-danger/30 text-danger p-4 rounded-2xl text-xs font-semibold">{error}</div>;

  return (
    <div className="space-y-4 text-text-primary">
      <div className="bg-surface-1 border border-border-soft rounded-3xl p-4 sm:p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2"><Trophy className="w-5 h-5 text-amber-400" /><h3 className="text-base font-extrabold">Номинации турнира</h3></div>
          <button type="button" onClick={() => void load(true)} disabled={refreshing} className="bg-accent/10 hover:bg-accent/20 text-accent border border-accent/30 font-bold px-3.5 py-2 rounded-xl text-xs flex items-center gap-2">
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />Пересчитать
          </button>
        </div>
        <div className={`${provisional ? 'bg-amber-500/10 border-amber-500/30 text-amber-400' : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'} border rounded-2xl p-3 text-xs flex items-start gap-2`}>
          {provisional ? <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /> : <Trophy className="w-4 h-4 shrink-0 mt-0.5" />}
          <div><p className="font-bold">{provisional ? 'Предварительные результаты' : 'Канонические итоги номинаций'}</p><p className="text-[11px] opacity-90 mt-0.5">Сравнение: Баллы → Доп. баллы → для Дона/Шерифа победы в роли → личное сравнение. Ручного выбора победителя нет.</p></div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {nominations.map((nom) => {
          const winner = nom.winner_participant_id ? nom.candidates.find((candidate) => candidate.participant_id === nom.winner_participant_id) : null;
          const tied = nom.comparison?.tied_participant_ids || [];
          return (
            <div key={nom.category} className="bg-surface-1 border border-border-soft rounded-3xl p-4 sm:p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-border-soft pb-3 gap-2">
                <div className="flex items-center gap-2.5">{icon(nom.category)}<h4 className="text-sm font-black">{nom.title}</h4></div>
                {nom.has_tie ? <span className="bg-amber-500/10 text-amber-400 border border-amber-500/30 text-[10px] font-extrabold px-2 py-0.5 rounded-full uppercase">Полное равенство</span> : null}
              </div>

              {winner ? (
                <div className="bg-accent/5 border border-accent/20 rounded-2xl p-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0"><PlayerAvatar nickname={winner.display_name} size="sm" /><div className="min-w-0"><span className="font-black text-sm block truncate">{winner.display_name}</span><span className="text-[10px] text-text-muted">{winner.games_in_role} игр в выборке</span></div></div>
                  <div className="text-right font-mono text-[11px]"><div><span className="text-text-muted">Баллы </span><strong>{signed(winner.points)}</strong></div><div><span className="text-text-muted">Доп. </span><strong>{signed(winner.additional_points)}</strong></div>{(nom.category === 'best_don' || nom.category === 'best_sheriff') && <div><span className="text-text-muted">Победы в роли </span><strong>{winner.role_wins}</strong></div>}</div>
                </div>
              ) : nom.has_tie ? (
                <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-3 text-xs text-amber-300">Все критерии, включая личное сравнение, исчерпаны. Победитель не назначается автоматически и не выбирается вручную.</div>
              ) : null}

              <div className="space-y-2">
                <span className="text-[10px] font-extrabold text-text-muted uppercase tracking-wider">Претенденты</span>
                {nom.candidates.map((candidate, index) => {
                  const key = `${nom.category}-${candidate.participant_id}`;
                  const isExpanded = Boolean(expanded[key]);
                  const isWinner = candidate.participant_id === nom.winner_participant_id;
                  const isTied = tied.includes(candidate.participant_id);
                  return (
                    <div key={candidate.participant_id} className={`border rounded-2xl overflow-hidden ${isWinner ? 'border-accent/30 bg-accent/5' : isTied ? 'border-amber-500/30 bg-amber-500/5' : 'border-border-soft bg-surface-2/20'}`}>
                      <button type="button" onClick={() => setExpanded((prev) => ({ ...prev, [key]: !prev[key] }))} className="w-full p-3 min-h-[44px] flex items-center gap-3 text-left">
                        <span className="w-5 text-xs text-text-muted font-bold">{index + 1}</span><PlayerAvatar nickname={candidate.display_name} size="xs" /><span className="font-bold text-sm truncate flex-1">{candidate.display_name}</span>
                        <div className="font-mono text-[10px] text-right shrink-0"><div>Б {signed(candidate.points)}</div><div>Д {signed(candidate.additional_points)}</div>{(nom.category === 'best_don' || nom.category === 'best_sheriff') && <div>Р {candidate.role_wins}</div>}</div>
                        {isExpanded ? <ChevronUp className="w-4 h-4 text-text-muted" /> : <ChevronDown className="w-4 h-4 text-text-muted" />}
                      </button>
                      {isExpanded && <div className="p-3 border-t border-border-soft bg-surface-2/40 space-y-2">{candidate.breakdown.map((game: any) => <div key={game.game_number} className="text-[10px] flex flex-wrap gap-x-3 gap-y-1"><strong>Игра №{game.game_number}</strong><span>Судья {signed(game.judge_bonus)}</span><span>Протокол {signed(game.protocol_bonus)}</span><span>ЛХ {signed(game.best_move_points)}</span></div>)}</div>}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
