import { FileCheck, RotateCcw } from 'lucide-react';
import type { PlayerResultData, TournamentGameProtocolData } from '../../../../lib/api';
import { calculateGuessedBlacks } from './protocolStateUtils';

type ProtocolCompletionDialogsProps = {
  protocol: TournamentGameProtocolData;
  playerResults: PlayerResultData[];
  showCompleteConfirm: boolean;
  showRevertConfirm: boolean;
  submitting: boolean;
  onCancelComplete: () => void;
  onConfirmComplete: () => void;
  onCancelRevert: () => void;
  onConfirmRevert: () => void;
};

export function ProtocolCompletionDialogs({
  protocol,
  playerResults,
  showCompleteConfirm,
  showRevertConfirm,
  submitting,
  onCancelComplete,
  onConfirmComplete,
  onCancelRevert,
  onConfirmRevert,
}: ProtocolCompletionDialogsProps) {
  return (
    <>
      {showCompleteConfirm && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 max-w-md w-full space-y-4 text-slate-100 shadow-2xl">
            <div className="flex items-center space-x-3 text-amber-400">
              <FileCheck className="w-6 h-6" />
              <h3 className="text-lg font-bold">Завершить протокол игры?</h3>
            </div>

            <div className="text-xs sm:text-sm text-slate-300 space-y-2 bg-slate-800/60 p-3 rounded-xl border border-slate-700/60">
              <p>
                Победитель:{' '}
                <strong className={protocol.winner_team === 'red' ? 'text-rose-400' : 'text-slate-100'}>
                  {protocol.winner_team === 'red' ? 'Красные' : protocol.winner_team === 'black' ? 'Чёрные' : 'Не выбран'}
                </strong>
              </p>
              {protocol.best_moves && protocol.best_moves.map((bestMove) => {
                const bestMoveInfo = calculateGuessedBlacks(bestMove.seat_numbers, playerResults);
                const title = bestMove.source === 'first_killed'
                  ? 'ЛХ Первого убитого'
                  : 'ЛХ Заголосованного в 0 круг';
                const formattedSeats = bestMove.seat_numbers.length > 0
                  ? `#${bestMove.seat_numbers.join(', #')}`
                  : '0 номеров';

                return (
                  <p key={bestMove.source}>
                    {title}: {formattedSeats} (+{bestMoveInfo.bonusPoints} б.)
                  </p>
                );
              })}
              {(!protocol.best_moves || protocol.best_moves.length === 0) && (
                <p>Лучший ход: Не указан</p>
              )}
              <p className="text-slate-400 text-xs">
                После завершения игра получит статус «Завершена», и станет доступен запуск следующей игры турнира.
              </p>
            </div>

            <div className="flex items-center justify-end space-x-2 pt-2">
              <button
                type="button"
                disabled={submitting}
                onClick={onCancelComplete}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
              >
                Отмена
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={onConfirmComplete}
                className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs shadow-md"
              >
                {submitting ? 'Завершаем...' : 'Подтвердить завершение'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showRevertConfirm && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 max-w-md w-full space-y-4 text-slate-100 shadow-2xl">
            <div className="flex items-center space-x-3 text-amber-400">
              <RotateCcw className="w-6 h-6" />
              <h3 className="text-lg font-bold">Открыть протокол для правки?</h3>
            </div>

            <p className="text-xs sm:text-sm text-slate-300">
              Игра вернётся в статус «Активна», и вы сможете внести любые исправления в протокол.
            </p>

            <div className="flex items-center justify-end space-x-2 pt-2">
              <button
                type="button"
                disabled={submitting}
                onClick={onCancelRevert}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
              >
                Отмена
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={onConfirmRevert}
                className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs shadow-md"
              >
                {submitting ? 'Возвращаем...' : 'Да, открыть для правки'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
