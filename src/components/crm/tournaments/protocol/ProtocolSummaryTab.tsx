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
      <div className="protocol-noir-section space-y-3">
        <label className="text-xs font-semibold text-text-primary block">
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
                : 'bg-surface-1/60 border-border-soft text-text-secondary hover:bg-surface-2 hover:text-text-primary'
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
                ? 'bg-app-bg border-border-strong text-text-primary shadow-lg ring-2 ring-border-strong/50'
                : 'bg-surface-1/60 border-border-soft text-text-secondary hover:bg-surface-2 hover:text-text-primary'
            } ${protocol.end_reason === 'ppk' ? 'opacity-50 grayscale' : ''}`}
          >
            <Shield className="w-4 h-4 text-text-secondary" />
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
            <p className="text-xs text-text-secondary">
              Виновник: <strong>#{playerResults.find(p => p.participant_id === protocol.ppk_culprit_participant_id)?.seat_number}</strong> ({playerResults.find(p => p.participant_id === protocol.ppk_culprit_participant_id)?.display_name})
            </p>
          </div>
        </div>
      )}

      {/* Substitution Section */}
      <div className="protocol-noir-section space-y-3">
        <div className="flex items-center justify-between border-b border-border-soft/60 pb-2">
          <span className="font-semibold text-xs text-text-primary">Замена в игре</span>
          {protocol.status === 'draft' && (
            <label className="flex items-center space-x-2 text-xs text-text-secondary cursor-pointer">
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
                className="rounded border-border-soft text-amber-500 focus:ring-accent"
              />
              <span>Включить замену</span>
            </label>
          )}
        </div>

        {protocol.replacement ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div>
              <label className="text-text-secondary block mb-1">Заменённое место</label>
              <select
                disabled={protocol.status === 'completed'}
                value={protocol.replacement.replaced_seat || 1}
                onChange={(e) => {
                  const seat = parseInt(e.target.value) || 1;
                  onReplacementChange({ ...protocol.replacement!, replaced_seat: seat });
                }}
                className="w-full bg-surface-1 border border-border-soft rounded-lg px-2.5 py-1.5 text-text-primary focus:border-accent focus:outline-none"
              >
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((s) => (
                  <option key={s} value={s}>
                    Игрок #{s}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-text-secondary block mb-1">Имя или комментарий о замене</label>
              <input
                type="text"
                placeholder="например: Замена на Иванова"
                disabled={protocol.status === 'completed'}
                value={protocol.replacement.replacement_name_or_comment || ''}
                onChange={(e) => {
                  const val = e.target.value;
                  onReplacementChange({ ...protocol.replacement!, replacement_name_or_comment: val });
                }}
                className="w-full bg-surface-1 border border-border-soft rounded-lg px-2.5 py-1.5 text-text-primary focus:border-accent focus:outline-none"
              />
            </div>

            <div>
              <label className="text-text-secondary block mb-1">Момент замены</label>
              <input
                type="text"
                placeholder="например: День 2"
                disabled={protocol.status === 'completed'}
                value={protocol.replacement.replacement_time || ''}
                onChange={(e) => {
                  const val = e.target.value;
                  onReplacementChange({ ...protocol.replacement!, replacement_time: val });
                }}
                className="w-full bg-surface-1 border border-border-soft rounded-lg px-2.5 py-1.5 text-text-primary focus:border-accent focus:outline-none"
              />
            </div>

            <div>
              <label className="text-text-secondary block mb-1">Заметка судьи о замене</label>
              <input
                type="text"
                placeholder="Причина или заметка"
                disabled={protocol.status === 'completed'}
                value={protocol.replacement.notes || ''}
                onChange={(e) => {
                  const val = e.target.value;
                  onReplacementChange({ ...protocol.replacement!, notes: val });
                }}
                className="w-full bg-surface-1 border border-border-soft rounded-lg px-2.5 py-1.5 text-text-primary focus:border-accent focus:outline-none"
              />
            </div>
          </div>
        ) : (
          <div className="text-xs text-text-muted italic">
            Замен в игре не производилось.
          </div>
        )}
      </div>

      {/* Judge Notes */}
      <div className="protocol-noir-section space-y-3">
        <label className="text-xs font-semibold text-text-secondary block">
          Заметки судьи / комментарии по игре:
        </label>
        <textarea
          rows={3}
          disabled={protocol.status === 'completed'}
          value={protocol.judge_notes || ''}
          onChange={(e) => onJudgeNotesChange(e.target.value)}
          placeholder="Замечания, тайминги, особенности партии..."
          className="w-full bg-surface-1 border border-border-soft rounded-lg p-2.5 text-xs text-text-primary placeholder-slate-500 focus:border-accent focus:outline-none"
        />
      </div>

      {/* Full Results Compact Table Overview */}
      <div className="protocol-noir-section space-y-3">
        <h4 className="text-xs font-semibold text-text-primary">
          Сводная таблица параметров игроков
        </h4>
                <div className="sm:hidden">
          {playerResults.map((p) => {
            const discPenalty = calculateDisciplinaryPenalty(
              p.minor_technical_fouls || 0,
              p.major_technical_fouls || 0,
              p.exit_type === 'removed',
              protocol.ppk_culprit_participant_id === p.participant_id
            );
            const isRedRole = p.role === 'citizen' || p.role === 'sheriff';
            const isWinner = protocol.winner_team
              ? (protocol.winner_team === 'red' && isRedRole) || (protocol.winner_team === 'black' && !isRedRole)
              : false;
            return (
              <div key={p.participant_id} className="protocol-summary-mobile-row">
                <span className="text-warning font-black tabular-nums">{String(p.seat_number).padStart(2, '0')}</span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-text-primary break-words">{p.display_name}</span>
                  <span className="block text-[11px] text-text-secondary mt-0.5">
                    {p.role === 'citizen' && 'Мирный'}
                    {p.role === 'sheriff' && 'Шериф'}
                    {p.role === 'mafia' && 'Мафия'}
                    {p.role === 'don' && 'Дон'}
                    {' · '}
                    {p.exit_type === 'alive' ? 'Жив' : p.exit_type === 'killed' ? 'Убит' : p.exit_type === 'removed' ? 'Снят' : 'Заголосован'}
                  </span>
                  <span className="flex flex-wrap gap-x-2 gap-y-0.5 text-[10px] mt-1.5 tabular-nums">
                    <span className="text-warning">Ф {p.regular_fouls}</span>
                    <span className="text-danger">мТ {p.minor_technical_fouls || 0}</span>
                    <span className="text-danger">БТ {p.major_technical_fouls || 0}</span>
                    <span className="text-danger">Дисц. −{discPenalty || 0}</span>
                    <span className="text-accent">Судья {p.judge_bonus || 0}</span>
                    <span className={(p.protocol_bonus || 0) < 0 ? 'text-danger' : 'text-success'}>Прот. {p.protocol_bonus || 0}</span>
                  </span>
                </span>
                <span className={isWinner ? 'text-success font-bold text-xs' : 'text-text-muted text-xs'}>{protocol.winner_team ? (isWinner ? '+1' : '0') : '—'}</span>
              </div>
            );
          })}
        </div>
        <div className="hidden sm:block overflow-x-auto">
          <table className="w-full text-left text-[10px] sm:text-xs border-collapse">
            <thead>
              <tr className="border-b border-border-soft text-text-secondary">
                <th className="py-2 px-1">#</th>
                <th className="py-2 px-2">Игрок</th>
                <th className="py-2 px-2">Роль</th>
                <th className="py-2 px-2">Статус</th>
                <th className="py-2 px-1 text-center" title="Победа">Поб.</th>
                <th className="py-2 px-1 text-center" title="Обычные фолы">Ф</th>
                <th className="py-2 px-1 text-center" title="Малые техфолы">мТ</th>
                <th className="py-2 px-1 text-center" title="Большие техфолы">БТ</th>
                <th className="py-2 px-1 text-right" title="Дисциплинарный минус">Дисц. минус</th>
                <th className="py-2 px-1 text-right" title="Балл судьи">Балл судьи</th>
                <th className="py-2 px-1 text-right" title="Балл за протокол">Протокол</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {playerResults.map((p) => {
                const discPenalty = calculateDisciplinaryPenalty(
                  p.minor_technical_fouls || 0,
                  p.major_technical_fouls || 0,
                  p.exit_type === 'removed',
                  protocol.ppk_culprit_participant_id === p.participant_id
                );
                const jb = p.judge_bonus || 0;
                const formattedJudgeBonus = jb > 0 ? `+${jb}` : jb < 0 ? `−${Math.abs(jb)}` : '0';
                const pb = p.protocol_bonus || 0;
                const formattedProtocolBonus = pb > 0 ? `+${pb}` : pb < 0 ? `−${Math.abs(pb)}` : '0';

                return (
                  <tr key={p.participant_id} className="hover:bg-surface-2/40">
                    <td className="py-2 px-1 font-bold text-amber-400">#{p.seat_number}</td>
                    <td className="py-2 px-2 text-text-primary font-medium">{p.display_name}</td>
                    <td className="py-2 px-2 text-amber-300/90">
                      {p.role === 'citizen' && 'Мирный'}
                      {p.role === 'sheriff' && 'Шериф'}
                      {p.role === 'mafia' && 'Мафия'}
                      {p.role === 'don' && 'Дон'}
                    </td>
                    <td className="py-2 px-2 text-text-secondary">
                      {p.exit_type === 'alive' && <span className="text-emerald-400">Жив</span>}
                      {p.exit_type === 'killed' && <span className="text-rose-400">Убит</span>}
                      {p.exit_type === 'voted_zero_round' && <span className="text-amber-400">Загол. (0)</span>}
                      {p.exit_type === 'voted_day' && <span className="text-amber-400">Загол.</span>}
                      {p.exit_type === 'removed' && <span className="text-accent">Снят</span>}
                    </td>
                    <td className="py-2 px-1 text-center">
                      {!protocol.winner_team ? (
                        <span className="text-text-muted font-bold">-</span>
                      ) : (() => {
                        const isRedRole = p.role === 'citizen' || p.role === 'sheriff';
                        const isWinner = (protocol.winner_team === 'red' && isRedRole) || (protocol.winner_team === 'black' && !isRedRole);
                        return isWinner ? (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                            +1
                          </span>
                        ) : (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-surface-1 text-text-muted border border-border-soft">
                            0
                          </span>
                        );
                      })()}
                    </td>
                    <td className="py-2 px-1 text-center font-bold text-amber-400">{p.regular_fouls}</td>
                    <td className="py-2 px-1 text-center font-bold text-rose-400">{p.minor_technical_fouls || 0}</td>
                    <td className="py-2 px-1 text-center font-bold text-rose-600">{p.major_technical_fouls || 0}</td>
                    <td className="py-2 px-1 text-right font-mono text-rose-400">
                      {discPenalty > 0 ? `−${discPenalty}` : '0'}
                    </td>
                    <td className={`py-2 px-1 text-right font-mono ${jb > 0 ? 'text-emerald-400 font-bold' : jb < 0 ? 'text-rose-400 font-bold' : 'text-text-secondary'}`}>
                      {formattedJudgeBonus}
                    </td>
                    <td className={`py-2 px-1 text-right font-mono ${pb > 0 ? 'text-emerald-400 font-bold' : pb < 0 ? 'text-rose-400 font-bold' : 'text-text-secondary'}`}>
                      {formattedProtocolBonus}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
