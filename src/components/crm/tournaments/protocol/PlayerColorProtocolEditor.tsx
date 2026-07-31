import React from 'react';
import { Pencil, ArrowUp, ArrowDown, Trash2, Plus } from 'lucide-react';
import { PlayerResultData } from '../../../../lib/api';

export interface PlayerColorProtocolEditorProps {
  player: PlayerResultData;
  protocolStatus: 'draft' | 'completed';
  selectedColorSeats: number[];
  selectedColorMarkType: 'red' | 'black' | 'sheriff';
  editingColorMarkState: { index: number; seats: number[]; mark: 'red' | 'black' | 'sheriff' } | undefined | null;
  
  formatColorMark: (entry: { seat_numbers: number[]; mark: 'red' | 'black' | 'sheriff' }) => string;
  
  onToggleEditColorSeat: (participantId: string, seatNumber: number) => void;
  onSetEditColorMarkType: (participantId: string, mark: 'red' | 'black' | 'sheriff') => void;
  onCancelEditColorMark: (participantId: string) => void;
  onSaveEditColorMark: (participantId: string) => void;
  onStartEditColorMark: (participantId: string, index: number, entry: { seat_numbers: number[]; mark: 'red' | 'black' | 'sheriff' }) => void;
  onMoveColorMark: (participantId: string, fromIndex: number, toIndex: number) => void;
  onDeleteColorMark: (participantId: string, index: number) => void;
  onToggleColorSeatSelection: (participantId: string, seatNumber: number) => void;
  onSetSelectedColorMark: (participantId: string, mark: 'red' | 'black' | 'sheriff') => void;
  onAddColorMark: (participantId: string) => void;
}

export const PlayerColorProtocolEditor: React.FC<PlayerColorProtocolEditorProps> = ({
  player,
  protocolStatus,
  selectedColorSeats,
  selectedColorMarkType,
  editingColorMarkState,
  formatColorMark,
  onToggleEditColorSeat,
  onSetEditColorMarkType,
  onCancelEditColorMark,
  onSaveEditColorMark,
  onStartEditColorMark,
  onMoveColorMark,
  onDeleteColorMark,
  onToggleColorSeatSelection,
  onSetSelectedColorMark,
  onAddColorMark,
}) => {
  const isKilled = player.exit_type === 'killed';
  const hasMarks = player.color_protocol && player.color_protocol.length > 0;
  const showColorSection = isKilled || hasMarks;

  if (!showColorSection) return null;

  return (
    <div className="bg-slate-900/80 rounded-lg p-2.5 border border-slate-700/60 space-y-2">
      <div className="flex items-center justify-between text-xs font-semibold text-slate-300">
        <span>Оставленный протокол:</span>
        {!isKilled && (
          <span className="text-[10px] text-amber-400/80">
            (Статус изменён, но протокол сохранён)
          </span>
        )}
      </div>

      {/* Saved marks list */}
      {hasMarks ? (
        <div className="space-y-1">
          {player.color_protocol!.map((entry, eIdx) => {
            const isEditingThis = editingColorMarkState && editingColorMarkState.index === eIdx;

            if (isEditingThis) {
              return (
                <div
                  key={eIdx}
                  className="p-2 bg-slate-800/90 rounded border border-amber-500/50 space-y-2 text-xs"
                >
                  <div className="text-[11px] font-bold text-amber-400">
                    Редактирование записи #{eIdx + 1}:
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((sNum) => {
                      const isSel = editingColorMarkState.seats.includes(sNum);
                      return (
                        <button
                          key={sNum}
                          type="button"
                          onClick={() => onToggleEditColorSeat(player.participant_id, sNum)}
                          className={`w-6 h-6 rounded text-[11px] font-bold border transition ${
                            isSel
                              ? 'bg-amber-500 text-slate-950 border-amber-400'
                              : 'bg-slate-900 text-slate-400 border-slate-700 hover:bg-slate-800'
                          }`}
                        >
                          #{sNum}
                        </button>
                      );
                    })}
                  </div>
                  <div className="flex items-center justify-between pt-1">
                    <div className="flex items-center space-x-1 text-[11px]">
                      <button
                        type="button"
                        onClick={() => onSetEditColorMarkType(player.participant_id, 'red')}
                        className={`px-2 py-0.5 rounded font-bold transition ${
                          editingColorMarkState.mark === 'red'
                            ? 'bg-rose-600 text-white'
                            : 'bg-slate-900 text-rose-400 hover:bg-slate-700'
                        }`}
                      >
                        кр
                      </button>
                      <button
                        type="button"
                        onClick={() => onSetEditColorMarkType(player.participant_id, 'black')}
                        className={`px-2 py-0.5 rounded font-bold transition ${
                          editingColorMarkState.mark === 'black'
                            ? 'bg-slate-950 text-amber-400 border border-slate-700'
                            : 'bg-slate-900 text-slate-300 hover:bg-slate-700'
                        }`}
                      >
                        ч
                      </button>
                      <button
                        type="button"
                        onClick={() => onSetEditColorMarkType(player.participant_id, 'sheriff')}
                        className={`px-2 py-0.5 rounded font-bold transition ${
                          editingColorMarkState.mark === 'sheriff'
                            ? 'bg-amber-500 text-slate-950'
                            : 'bg-slate-900 text-amber-400 hover:bg-slate-700'
                        }`}
                      >
                        ш
                      </button>
                    </div>
                    <div className="flex items-center space-x-1">
                      <button
                        type="button"
                        onClick={() => onCancelEditColorMark(player.participant_id)}
                        className="px-2 py-0.5 rounded bg-slate-700 hover:bg-slate-600 text-slate-300 text-[11px]"
                      >
                        Отмена
                      </button>
                      <button
                        type="button"
                        onClick={() => onSaveEditColorMark(player.participant_id)}
                        className="px-2 py-0.5 rounded bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-[11px]"
                      >
                        Сохранить
                      </button>
                    </div>
                  </div>
                </div>
              );
            }

            return (
              <div
                key={eIdx}
                className="flex items-center justify-between bg-slate-800 px-2.5 py-1 rounded border border-slate-700 text-xs"
              >
                <span className="font-bold text-amber-300">
                  {formatColorMark(entry)}
                </span>

                {protocolStatus === 'draft' && (
                  <div className="flex items-center space-x-1">
                    <button
                      type="button"
                      onClick={() => onStartEditColorMark(player.participant_id, eIdx, entry)}
                      title="Редактировать"
                      className="p-0.5 text-slate-400 hover:text-amber-400 transition mr-1"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      disabled={eIdx === 0}
                      onClick={() => onMoveColorMark(player.participant_id, eIdx, eIdx - 1)}
                      className="p-0.5 text-slate-400 hover:text-white disabled:opacity-30"
                    >
                      <ArrowUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      disabled={eIdx === player.color_protocol!.length - 1}
                      onClick={() => onMoveColorMark(player.participant_id, eIdx, eIdx + 1)}
                      className="p-0.5 text-slate-400 hover:text-white disabled:opacity-30"
                    >
                      <ArrowDown className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteColorMark(player.participant_id, eIdx)}
                      className="p-0.5 text-rose-400 hover:text-rose-300 ml-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-[11px] text-slate-500 italic">
          Записи отсутствуют
        </div>
      )}

      {/* Add entry form */}
      {protocolStatus === 'draft' && isKilled && (
        <div className="space-y-1.5 pt-1 border-t border-slate-800">
          <div className="text-[11px] text-slate-400">Выберите места (1-10):</div>
          <div className="flex flex-wrap gap-1">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((sNum) => {
              const isSelected = selectedColorSeats.includes(sNum);
              return (
                <button
                  key={sNum}
                  type="button"
                  onClick={() => onToggleColorSeatSelection(player.participant_id, sNum)}
                  className={`w-6 h-6 rounded text-xs font-bold border transition ${
                    isSelected
                      ? 'bg-amber-500 text-slate-950 border-amber-400'
                      : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                  }`}
                >
                  {sNum}
                </button>
              );
            })}
          </div>

          <div className="flex items-center justify-between pt-1">
            <div className="flex items-center space-x-1 text-xs">
              <button
                type="button"
                onClick={() => onSetSelectedColorMark(player.participant_id, 'red')}
                className={`px-2 py-0.5 rounded text-[11px] font-semibold border ${
                  selectedColorMarkType === 'red'
                    ? 'bg-rose-600 text-white border-rose-500'
                    : 'bg-slate-800 text-slate-400 border-slate-700'
                }`}
              >
                Красный
              </button>
              <button
                type="button"
                onClick={() => onSetSelectedColorMark(player.participant_id, 'black')}
                className={`px-2 py-0.5 rounded text-[11px] font-semibold border ${
                  selectedColorMarkType === 'black'
                    ? 'bg-slate-950 text-slate-200 border-slate-500'
                    : 'bg-slate-800 text-slate-400 border-slate-700'
                }`}
              >
                Чёрный
              </button>
              <button
                type="button"
                onClick={() => onSetSelectedColorMark(player.participant_id, 'sheriff')}
                className={`px-2 py-0.5 rounded text-[11px] font-semibold border ${
                  selectedColorMarkType === 'sheriff'
                    ? 'bg-amber-500 text-slate-950 border-amber-400'
                    : 'bg-slate-800 text-slate-400 border-slate-700'
                }`}
              >
                Шериф
              </button>
            </div>

            <button
              type="button"
              disabled={selectedColorSeats.length === 0}
              onClick={() => onAddColorMark(player.participant_id)}
              className="px-2.5 py-1 rounded bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-slate-950 font-bold text-xs flex items-center space-x-1"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Добавить</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
