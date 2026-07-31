import React from 'react';
import { Shield, AlertTriangle } from 'lucide-react';
import { TournamentGameProtocolData, PlayerResultData } from '../../../../lib/api';
import { calculateDisciplinaryPenalty } from '../../../../lib/gameDiscipline';

export interface ProtocolSummaryTabProps {
  protocol: TournamentGameProtocolData;
  playerResults: PlayerResultData[];
  onWinnerTeamChange: (team: 'red' | 'black' | null) => void;
  onReplacementChange: (replacement: any | null) => void;
  onJudgeNotesChange: (notes: string) => void;
}

export const ProtocolSummaryTab: React.FC<ProtocolSummaryTabProps> = ({
  protocol,
  playerResults,
  onWinnerTeamChange,
  onReplacementChange,
  onJudgeNotesChange
}) => {
  return (
    <div className="space-y-5">
      {/* Winner Team Selection */}
      <div className="bg-slate-800/80 rounded-xl p-4 border border-slate-700/80 space-y-3">
        <label className="text-xs font-semibold text-slate-200 block">
          Победившая команда:
        </label>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            disabled={protocol.status === 'completed' || protocol.end_reason === 'ppk'}
            onClick={() => onWinnerTeamChange('red')}
            className={`py-3 px-4 rounded-xl font-bold text-sm flex items-center justify-center space-x-2 border transition ${
              protocol.winner_team === 'red'
                ? 'bg-rose-600/30 border-rose-500 text-rose-300 shadow-lg ring-2 ring-rose-500/50'
                : 'bg-slate-900/60 border-slate-700 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
            } ${protocol.end_reason === 'ppk' ? 'opacity-50 grayscale' : ''}`}
          >
            <Shield className="w-4 h-4 text-rose-400" />
            <span>Победа Красных</span>
          </button>

          <button
            type="button"
            disabled={protocol.status === 'completed' || protocol.end_reason === 'ppk'}
            onClick={() => onWinnerTeamChange('black')}
            className={`py-3 px-4 rounded-xl font-bold text-sm flex items-center justify-center space-x-2 border transition ${
              protocol.winner_team === 'black'
                ? 'bg-slate-950 border-slate-500 text-slate-100 shadow-lg ring-2 ring-slate-400/50'
                : 'bg-slate-900/60 border-slate-700 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
            } ${protocol.end_reason === 'ppk' ? 'opacity-50 grayscale' : ''}`}
          >
            <Shield className="w-4 h-4 text-slate-400" />
            <span>Победа Чёрных</span>
          </button>
        </div>
      </div>

      {/* PPK Status Message */}
      {protocol.end_reason === 'ppk' && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 flex items-center space-x-3">
          <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center text-amber-500">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-amber-400">Игра завершена по ППК</h4>
            <p className="text-xs text-slate-300">
              Виновник: <strong>#{playerResults.find(p => p.participant_id === protocol.ppk_culprit_participant_id)?.seat_number}</strong> ({playerResults.find(p => p.participant_id === protocol.ppk_culprit_participant_id)?.display_name})
            </p>
          </div>
        </div>
      )}

      {/* Substitution Section */}
      <div className="bg-slate-800/60 rounded-xl p-4 border border-slate-700/80 space-y-3">
        <div className="flex items-center justify-between border-b border-slate-700/60 pb-2">
          <span className="font-semibold text-xs text-slate-200">Замена в игре</span>
          {protocol.status === 'draft' && (
            <label className="flex items-center space-x-2 text-xs text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={Boolean(protocol.replacement)}
                onChange={(e) => {
                  if (e.target.checked) {
                    onReplacementChange({
                      replaced_seat: 1,
                      replacement_name_or_comment: '',
                      replacement_time: '',
                      notes: ''
                    });
                  } else {
                    onReplacementChange(null);
                  }
                }}
                className="rounded border-slate-700 text-amber-500 focus:ring-amber-500"
              />
              <span>Включить замену</span>
            </label>
          )}
        </div>

        {protocol.replacement ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div>
              <label className="text-slate-400 block mb-1">Заменённое место</label>
              <select
                disabled={protocol.status === 'completed'}
                value={protocol.replacement.replaced_seat || 1}
                onChange={(e) => {
                  const seat = parseInt(e.target.value) || 1;
                  onReplacementChange({ ...protocol.replacement!, replaced_seat: seat });
                }}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-200 focus:border-amber-500 focus:outline-none"
              >
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((s) => (
                  <option key={s} value={s}>
                    Игрок #{s}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-slate-400 block mb-1">Имя или комментарий о замене</label>
              <input
                type="text"
                placeholder="например: Замена на Иванова"
                disabled={protocol.status === 'completed'}
                value={protocol.replacement.replacement_name_or_comment || ''}
                onChange={(e) => {
                  const val = e.target.value;
                  onReplacementChange({ ...protocol.replacement!, replacement_name_or_comment: val });
                }}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-200 focus:border-amber-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="text-slate-400 block mb-1">Момент замены</label>
              <input
                type="text"
                placeholder="например: День 2"
                disabled={protocol.status === 'completed'}
                value={protocol.replacement.replacement_time || ''}
                onChange={(e) => {
                  const val = e.target.value;
                  onReplacementChange({ ...protocol.replacement!, replacement_time: val });
                }}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-200 focus:border-amber-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="text-slate-400 block mb-1">Заметка судьи о замене</label>
              <input
                type="text"
                placeholder="Причина или заметка"
                disabled={protocol.status === 'completed'}
                value={protocol.replacement.notes || ''}
                onChange={(e) => {
                  const val = e.target.value;
                  onReplacementChange({ ...protocol.replacement!, notes: val });
                }}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-200 focus:border-amber-500 focus:outline-none"
              />
            </div>
          </div>
        ) : (
          <div className="text-xs text-slate-500 italic">
            Замен в игре не производилось.
          </div>
        )}
      </div>

      {/* Judge Notes */}
      <div className="bg-slate-800/60 rounded-xl p-4 border border-slate-700/80 space-y-2">
        <label className="text-xs font-semibold text-slate-300 block">
          Заметки судьи / комментарии по игре:
        </label>
        <textarea
          rows={3}
          disabled={protocol.status === 'completed'}
          value={protocol.judge_notes || ''}
          onChange={(e) => onJudgeNotesChange(e.target.value)}
          placeholder="Замечания, тайминги, особенности партии..."
          className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-xs text-slate-100 placeholder-slate-500 focus:border-amber-500 focus:outline-none"
        />
      </div>

      {/* Full Results Compact Table Overview */}
      <div className="bg-slate-800/60 rounded-xl p-4 border border-slate-700/80 space-y-3">
        <h4 className="text-xs font-semibold text-slate-200">
          Сводная таблица параметров игроков
        </h4>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[10px] sm:text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-700 text-slate-400">
                <th className="py-2 px-1">#</th>
                <th className="py-2 px-2">Игрок</th>
                <th className="py-2 px-2">Роль</th>
                <th className="py-2 px-2">Статус</th>
                <th className="py-2 px-1 text-center" title="Победа">Поб.</th>
                <th className="py-2 px-1 text-center" title="Обычные фолы">Ф</th>
                <th className="py-2 px-1 text-center" title="Малые техфолы">мТ</th>
                <th className="py-2 px-1 text-center" title="Большие техфолы">БТ</th>
                <th className="py-2 px-1 text-right">Игр. м.</th>
                <th className="py-2 px-1 text-right">Дисц. м.</th>
                <th className="py-2 px-1 text-right">Судья</th>
                <th className="py-2 px-1 text-right">Прот.</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {playerResults.map((p) => (
                <tr key={p.participant_id} className="hover:bg-slate-800/40">
                  <td className="py-2 px-1 font-bold text-amber-400">#{p.seat_number}</td>
                  <td className="py-2 px-2 text-slate-100 font-medium">{p.display_name}</td>
                  <td className="py-2 px-2 text-amber-300/90">
                    {p.role === 'citizen' && 'Мирный'}
                    {p.role === 'sheriff' && 'Шериф'}
                    {p.role === 'mafia' && 'Мафия'}
                    {p.role === 'don' && 'Дон'}
                  </td>
                  <td className="py-2 px-2 text-slate-300">
                    {p.exit_type === 'alive' && <span className="text-emerald-400">Жив</span>}
                    {p.exit_type === 'killed' && <span className="text-rose-400">Убит</span>}
                    {p.exit_type === 'voted_zero_round' && <span className="text-amber-400">Загол. (0)</span>}
                    {p.exit_type === 'voted_day' && <span className="text-amber-400">Загол.</span>}
                    {p.exit_type === 'removed' && <span className="text-purple-400">Снят</span>}
                  </td>
                  <td className="py-2 px-1 text-center">
                    {!protocol.winner_team ? (
                      <span className="text-slate-500 font-bold">-</span>
                    ) : (() => {
                      const isRedRole = p.role === 'citizen' || p.role === 'sheriff';
                      const isWinner = (protocol.winner_team === 'red' && isRedRole) || (protocol.winner_team === 'black' && !isRedRole);
                      return isWinner ? (
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                          +1
                        </span>
                      ) : (
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-slate-900 text-slate-500 border border-slate-800">
                          0
                        </span>
                      );
                    })()}
                  </td>
                  <td className="py-2 px-1 text-center font-bold text-amber-400">{p.regular_fouls}</td>
                  <td className="py-2 px-1 text-center font-bold text-rose-400">{p.minor_technical_fouls || 0}</td>
                  <td className="py-2 px-1 text-center font-bold text-rose-600">{p.major_technical_fouls || 0}</td>
                  <td className="py-2 px-1 text-right text-rose-300">{p.penalty_points || 0}</td>
                  <td className="py-2 px-1 text-right text-slate-400">
                    {calculateDisciplinaryPenalty(
                      p.minor_technical_fouls || 0,
                      p.major_technical_fouls || 0,
                      p.exit_type === 'removed',
                      protocol.ppk_culprit_participant_id === p.participant_id
                    )}
                  </td>
                  <td className="py-2 px-1 text-right text-slate-300">{p.judge_bonus || 0}</td>
                  <td className="py-2 px-1 text-right text-slate-300">{p.protocol_bonus || 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
