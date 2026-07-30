import React, { useState, useEffect } from 'react';
import { RefreshCw, Trophy, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { api, TournamentStandingItem } from '../../../lib/api.ts';

interface TournamentStandingsViewProps {
  tournamentId: string;
}

export const TournamentStandingsView: React.FC<TournamentStandingsViewProps> = ({ tournamentId }) => {
  const [standings, setStandings] = useState<TournamentStandingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchStandings = async (isManual = false) => {
    if (isManual) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const res = await api.getTournamentStandings(tournamentId);
      setStandings(res.standings || []);
    } catch (err: any) {
      setError(err.message || 'Не удалось загрузить турнирную таблицу');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchStandings();
  }, [tournamentId]);

  const toggleExpand = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  if (loading) {
    return (
      <div className="bg-surface-1 border border-border-soft rounded-3xl p-8 text-center text-text-muted text-xs space-y-2">
        <RefreshCw className="w-5 h-5 animate-spin mx-auto text-accent" />
        <p>Загрузка турнирной таблицы...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 text-text-primary">
      {/* Header controls & Note */}
      <div className="bg-surface-1 border border-border-soft rounded-3xl p-4 sm:p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Trophy className="w-5 h-5 text-amber-400" />
            <h3 className="text-base font-extrabold text-text-primary tracking-tight">Турнирная таблица</h3>
          </div>

          <button
            type="button"
            onClick={() => fetchStandings(true)}
            disabled={refreshing}
            className="bg-accent/10 hover:bg-accent/20 text-accent border border-accent/30 font-bold px-3.5 py-2 rounded-xl text-xs transition-all flex items-center gap-2 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            <span>Обновить таблицу</span>
          </button>
        </div>

        {/* Ci note badge */}
        <div className="bg-surface-2 border border-border-soft rounded-2xl p-3 text-xs text-text-secondary flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-text-primary">Автоматический пересчёт баллов</p>
            <p className="text-[11px] text-text-muted mt-0.5">
              Ci пока вводится вручную. Автоматический расчёт будет добавлен после настройки формулы турнира.
            </p>
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-danger/10 border border-danger/30 text-danger p-4 rounded-2xl text-xs font-semibold">
          {error}
        </div>
      )}

      {/* Standings Table */}
      <div className="bg-surface-1 border border-border-soft rounded-3xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-surface-2 border-b border-border-soft text-text-muted text-[11px] uppercase tracking-wider font-extrabold">
                <th className="py-3 px-3 text-center w-10">Место</th>
                <th className="py-3 px-3">Участник</th>
                <th className="py-3 px-2 text-center">Игр</th>
                <th className="py-3 px-2 text-center text-accent">Очки</th>
                <th className="py-3 px-2 text-center">Побед</th>
                <th className="py-3 px-2 text-center">Шериф/Дон</th>
                <th className="py-3 px-2 text-center">Доп. сум.</th>
                <th className="py-3 px-2 text-center">Бонус</th>
                <th className="py-3 px-2 text-center">ЛХ</th>
                <th className="py-3 px-2 text-center">Штраф</th>
                <th className="py-3 px-2 text-center">Ci</th>
                <th className="py-3 px-2 text-center w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-soft/60">
              {standings.length === 0 ? (
                <tr>
                  <td colSpan={12} className="py-8 text-center text-text-muted text-xs">
                    Нет завершённых игр для формирования таблицы
                  </td>
                </tr>
              ) : (
                standings.map((item) => {
                  const isExpanded = expandedId === item.participant_id;

                  return (
                    <React.Fragment key={item.participant_id}>
                      <tr
                        onClick={() => toggleExpand(item.participant_id)}
                        className={`hover:bg-surface-2/60 transition-colors cursor-pointer ${
                          isExpanded ? 'bg-surface-2/40' : ''
                        }`}
                      >
                        {/* Place */}
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

                        {/* Participant */}
                        <td className="py-3 px-3 font-extrabold text-text-primary">
                          <div className="flex items-center gap-1.5">
                            <span className="text-text-muted text-[11px] font-mono">
                              #{item.participant_number}
                            </span>
                            <span>{item.display_name}</span>
                          </div>
                        </td>

                        {/* Games played */}
                        <td className="py-3 px-2 text-center font-mono text-text-secondary">
                          {item.games_played}
                        </td>

                        {/* Total points */}
                        <td className="py-3 px-2 text-center font-black text-sm text-accent">
                          {item.total_points}
                        </td>

                        {/* Wins */}
                        <td className="py-3 px-2 text-center font-bold text-emerald-400">
                          {item.wins}
                        </td>

                        {/* Sheriff / Don wins */}
                        <td className="py-3 px-2 text-center text-[11px] font-mono text-text-secondary">
                          <span title="Побед Шерифом" className="text-amber-400 font-bold">{item.sheriff_wins}Ш</span>
                          {' / '}
                          <span title="Побед Доном" className="text-purple-400 font-bold">{item.don_wins}Д</span>
                        </td>

                        {/* Additional total */}
                        <td className="py-3 px-2 text-center font-bold text-text-primary">
                          {item.additional_total > 0 ? `+${item.additional_total}` : item.additional_total}
                        </td>

                        {/* Positive points */}
                        <td className="py-3 px-2 text-center font-mono text-text-secondary">
                          {item.positive_points > 0 ? `+${item.positive_points}` : item.positive_points}
                        </td>

                        {/* Best move points */}
                        <td className="py-3 px-2 text-center font-mono text-amber-400 font-semibold">
                          {item.best_move_points > 0 ? `+${item.best_move_points}` : item.best_move_points}
                        </td>

                        {/* Penalty points */}
                        <td className="py-3 px-2 text-center font-mono text-danger font-semibold">
                          {item.penalty_points > 0 ? `-${item.penalty_points}` : item.penalty_points}
                        </td>

                        {/* Ci points */}
                        <td className="py-3 px-2 text-center font-mono text-cyan-400 font-semibold">
                          {item.ci_points > 0 ? `+${item.ci_points}` : item.ci_points}
                        </td>

                        {/* Expand Icon */}
                        <td className="py-3 px-2 text-center text-text-muted">
                          {isExpanded ? <ChevronUp className="w-4 h-4 mx-auto" /> : <ChevronDown className="w-4 h-4 mx-auto" />}
                        </td>
                      </tr>

                      {/* Expanded Games Breakdown */}
                      {isExpanded && (
                        <tr className="bg-surface-2/30">
                          <td colSpan={12} className="p-4">
                            <div className="space-y-2">
                              <h4 className="text-xs font-bold text-text-secondary uppercase tracking-wider">
                                Детализация по играм: {item.display_name}
                              </h4>
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
                                        <span>Игра №{g.game_number} (Слот {g.seat_number})</span>
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
                                        <div>Роль: <span className="font-semibold text-text-primary capitalize">{g.role || '—'}</span></div>
                                        <div>Победа team: <span className="font-semibold text-text-primary">{g.winner_team === 'red' ? 'Красные' : g.winner_team === 'black' ? 'Чёрные' : '—'}</span></div>
                                        <div>Бонус судьи/прот: <span className="font-mono text-emerald-400">+{g.positive_points}</span></div>
                                        <div>ЛХ очки: <span className="font-mono text-amber-400">+{g.best_move_points}</span></div>
                                        <div>Штрафы: <span className="font-mono text-danger">-{g.penalty_points}</span></div>
                                        <div>Ci очки: <span className="font-mono text-cyan-400">+{g.ci_points}</span></div>
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
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
