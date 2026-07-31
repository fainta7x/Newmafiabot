import React from 'react';
import { Moon, Plus, Trash2, Award } from 'lucide-react';
import { TournamentGameProtocolData, PlayerResultData } from '../../../../lib/api';

export interface ProtocolNightsTabProps {
  protocol: TournamentGameProtocolData;
  playerResults: PlayerResultData[];
  onFirstKilledChange: (newId: string | null) => void;
  onZeroRoundVotedChange: (newId: string | null) => void;
  onToggleBestMoveSeat: (
    source: 'first_killed' | 'zero_round_voted',
    participantId: string,
    seatNumber: number
  ) => void;
  onAddNight: () => void;
  onDeleteNight: (sIdx: number) => void;
  onShotChange: (
    sIdx: number,
    targetSeat: number,
    result: 'killed' | 'miss' | 'agreement_failed'
  ) => void;
  calculateGuessedBlacks: (seats: number[]) => { guessedBlacks: number; bonusPoints: number };
}

export const ProtocolNightsTab: React.FC<ProtocolNightsTabProps> = ({
  protocol,
  playerResults,
  onFirstKilledChange,
  onZeroRoundVotedChange,
  onToggleBestMoveSeat,
  onAddNight,
  onDeleteNight,
  onShotChange,
  calculateGuessedBlacks
}) => {

  const renderBmCard = (source: 'first_killed' | 'zero_round_voted', participantId: string) => {
    const player = playerResults.find(p => p.participant_id === participantId);
    if (!player) return null;
    const bm = (protocol.best_moves || []).find(b => b.source === source);
    const seats = bm?.seat_numbers || [];
    const { guessedBlacks, bonusPoints } = calculateGuessedBlacks(seats);
    const title = source === 'first_killed' ? 'ЛХ первого убитого' : 'ЛХ игрока нулевого круга';

    return (
      <div className="bg-slate-800/80 rounded-xl p-4 border border-slate-700/80 flex flex-col space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-700/60 pb-3 gap-2">
          <div className="flex flex-col">
            <div className="flex items-center space-x-2">
              <Award className="w-4 h-4 text-amber-400 shrink-0" />
              <h3 className="text-sm font-bold text-slate-100">{title}</h3>
            </div>
            <div className="text-xs text-slate-400 mt-1 pl-6">
              #{player.seat_number} — {player.display_name}
            </div>
          </div>

          <div className="flex flex-row items-center gap-3 sm:justify-end">
             <div className="text-xs font-semibold text-slate-300 bg-slate-900/50 px-2 py-1 rounded-md border border-slate-700/50">
               {seats.length} из 3
             </div>
             <div className="text-xs font-medium text-amber-400 bg-amber-900/20 px-2 py-1 rounded-md border border-amber-900/40">
               Угадано: {guessedBlacks} (+{bonusPoints} б.)
             </div>
          </div>
        </div>

        <div>
          <div className="grid grid-cols-5 gap-2 pt-1">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => {
              const isSelected = seats.includes(num);
              return (
                <button
                  key={num}
                  type="button"
                  disabled={protocol.status === 'completed'}
                  onClick={() => onToggleBestMoveSeat(source, participantId, num)}
                  className={`min-h-[44px] flex items-center justify-center rounded-xl text-sm font-bold border transition ${
                    isSelected
                      ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-md'
                      : 'bg-slate-900 text-slate-400 border-slate-700 hover:bg-slate-800 hover:text-slate-200'
                  }`}
                >
                  {num}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-5">
      {/* First Killed & Zero Round Voted Selectors */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-slate-800/60 rounded-xl p-3.5 border border-slate-700/80 space-y-2">
          <label className="text-xs font-semibold text-slate-200 block">
            Первоубиенный игрок (ночь 1):
          </label>
          <select
            disabled={protocol.status === 'completed'}
            value={protocol.first_killed_participant_id || ''}
            onChange={(e) => onFirstKilledChange(e.target.value || null)}
            className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-slate-100 focus:border-amber-500 focus:outline-none"
          >
            <option value="">Не выбрано</option>
            {playerResults.map((p) => (
              <option key={p.participant_id} value={p.participant_id}>
                #{p.seat_number} - {p.display_name} ({p.exit_type})
              </option>
            ))}
          </select>
        </div>

        <div className="bg-slate-800/60 rounded-xl p-3.5 border border-slate-700/80 space-y-2">
          <label className="text-xs font-semibold text-slate-200 block">
            Заголосованный в нулевой круг (день 1):
          </label>
          <select
            disabled={protocol.status === 'completed'}
            value={protocol.zero_round_voted_participant_id || ''}
            onChange={(e) => onZeroRoundVotedChange(e.target.value || null)}
            className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-slate-100 focus:border-amber-500 focus:outline-none"
          >
            <option value="">Не выбрано</option>
            {playerResults.map((p) => (
              <option key={p.participant_id} value={p.participant_id}>
                #{p.seat_number} - {p.display_name} ({p.exit_type})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Best Move Section */}
      <div className="space-y-4">
        {protocol.first_killed_participant_id && renderBmCard('first_killed', protocol.first_killed_participant_id)}
        {protocol.zero_round_voted_participant_id && renderBmCard('zero_round_voted', protocol.zero_round_voted_participant_id)}

        {!protocol.first_killed_participant_id && !protocol.zero_round_voted_participant_id && (
          <div className="text-xs text-slate-500 italic py-2">
            Выберите первоубиенного игрока или заголосованного в нулевой круг для ввода ЛХ.
          </div>
        )}
      </div>

      {/* Night Shots Journal */}
      <div className="bg-slate-800/60 rounded-xl p-4 border border-slate-700/80 space-y-3">
        <div className="flex items-center justify-between border-b border-slate-700/60 pb-2">
          <div className="flex items-center space-x-2">
            <Moon className="w-4 h-4 text-indigo-400" />
            <h3 className="text-xs font-bold text-slate-100">Журнал ночных отстрелов</h3>
          </div>
          {protocol.status === 'draft' && (
            <button
              type="button"
              onClick={onAddNight}
              className="px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs flex items-center space-x-1"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Добавить ночь</span>
            </button>
          )}
        </div>

        {!protocol.shots || protocol.shots.length === 0 ? (
          <div className="text-xs text-slate-500 italic py-2">
            Записи ночных выстрелов отсутствуют.
          </div>
        ) : (
          <div className="space-y-2">
            {protocol.shots.map((shot, sIdx) => (
              <div
                key={sIdx}
                className="bg-slate-800/60 p-3 rounded-xl border border-slate-700/80 flex flex-wrap sm:flex-nowrap items-center justify-between gap-2 text-xs"
              >
                <span className="font-bold text-amber-400 min-w-fit w-full sm:w-auto mb-2 sm:mb-0">
                  Ночь #{shot.night_number}
                </span>

                <div className="flex items-center space-x-2 w-full sm:w-auto">
                  <span className="text-slate-400 hidden sm:inline">Цель:</span>
                  <select
                    value={shot.target_seat}
                    disabled={protocol.status === 'completed'}
                    onChange={(e) => {
                      const target = parseInt(e.target.value);
                      onShotChange(sIdx, target, shot.result);
                    }}
                    className="bg-slate-900 border border-slate-700 rounded px-2 min-h-[44px] sm:min-h-0 py-1 text-slate-200 focus:border-amber-500 focus:outline-none flex-1 sm:flex-none"
                  >
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => (
                      <option key={num} value={num}>
                        Игрок #{num}
                      </option>
                    ))}
                  </select>

                  <select
                    value={shot.result}
                    disabled={protocol.status === 'completed'}
                    onChange={(e) => {
                      const res = e.target.value as 'killed' | 'miss' | 'agreement_failed';
                      onShotChange(sIdx, shot.target_seat, res);
                    }}
                    className="bg-slate-900 border border-slate-700 rounded px-2 min-h-[44px] sm:min-h-0 py-1 text-slate-200 focus:border-amber-500 focus:outline-none flex-1 sm:flex-none"
                  >
                    <option value="killed">Убит</option>
                    <option value="miss">Промах</option>
                    <option value="agreement_failed">Несогл.</option>
                  </select>

                  {protocol.status === 'draft' && (
                    <button
                      type="button"
                      onClick={() => onDeleteNight(sIdx)}
                      className="text-slate-500 hover:text-rose-400 min-w-[44px] min-h-[44px] sm:min-w-0 sm:min-h-0 flex items-center justify-center rounded shrink-0"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
