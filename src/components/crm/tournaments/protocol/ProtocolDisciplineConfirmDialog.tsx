import { AlertTriangle } from 'lucide-react';
import type { DisciplineActionType, TechFoulType } from './protocolDisciplineUtils';

export type PendingProtocolDisciplineAction = {
  participantId: string;
  type: DisciplineActionType;
  playerName: string;
  seatNum: number;
  techType?: TechFoulType;
};

type ProtocolDisciplineConfirmDialogProps = {
  pending: PendingProtocolDisciplineAction | null;
  winnerTeam: 'red' | 'black' | null;
  onCancel: () => void;
  onConfirm: () => void;
};

// Presentation-only confirmation; GameProtocolModal remains the owner of discipline mutations.
export function ProtocolDisciplineConfirmDialog({
  pending,
  winnerTeam,
  onCancel,
  onConfirm,
}: ProtocolDisciplineConfirmDialogProps) {
  if (!pending) return null;

  const canConfirmPpk = pending.type !== 'ppk' || !!winnerTeam;

  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 max-w-md w-full space-y-4 text-slate-100 shadow-2xl">
        <div className="flex items-center space-x-3 text-rose-400">
          <AlertTriangle className="w-6 h-6" />
          <h3 className="text-base font-bold">
            {pending.type === 'foul_4' && 'Подтвердите 4-й фол'}
            {pending.type === 'tech_2' && 'Подтвердите 2-й техфол'}
            {pending.type === 'direct_removal' && 'Удаление решением судьи'}
            {pending.type === 'ppk' && 'Завершить игру по ППК?'}
            {pending.type === 'cancel_ppk' && 'Отменить завершение по ППК?'}
            {pending.type === 'cancel_direct' && 'Отменить удаление судьи?'}
          </h3>
        </div>

        <div className="text-xs sm:text-sm text-slate-300 space-y-2">
          <p>
            Игрок <strong>#{pending.seatNum} ({pending.playerName})</strong>
          </p>
          {pending.type === 'foul_4' && (
            <p>Будет автоматически удалён из игры по причине «4-й фол».</p>
          )}
          {pending.type === 'tech_2' && (
            <p>
              Будет автоматически удалён из игры по причине «2-й техфол».
              Тип фола: <span className="text-rose-400 font-bold">{pending.techType === 'minor' ? 'Малый' : 'Большой'}</span>
            </p>
          )}
          {pending.type === 'direct_removal' && (
            <p>Игрок будет удалён из игры по решению судьи (дисквалификация).</p>
          )}
          {pending.type === 'ppk' && (
            <div className="bg-slate-800/60 p-3 rounded-lg border border-slate-700/60 space-y-1">
              <p>Игровой процесс завершится, но протокол останется открыт для проверки и выставления баллов.</p>
              <p className="text-rose-400 font-bold">
                Победитель: {winnerTeam === 'red' ? 'Красные' : winnerTeam === 'black' ? 'Чёрные' : 'Не определён'}
              </p>
              {!winnerTeam && (
                <p className="text-rose-500 text-[11px] mt-1 bg-rose-500/10 p-2 rounded">
                  Сначала назначьте роль участнику в рассадке
                </p>
              )}
              <p className="text-amber-500 font-medium">Виновнику будет начислен штраф −1.0.</p>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end space-x-2 pt-2">
          <button
            type="button"
            onClick={onCancel}
            className="min-h-[44px] px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold flex-1 sm:flex-none"
          >
            Отмена
          </button>
          <button
            type="button"
            disabled={!canConfirmPpk}
            onClick={onConfirm}
            className={`min-h-[44px] px-4 py-2 rounded-xl text-white font-bold text-xs shadow-md flex-1 sm:flex-none ${
              ['foul_4', 'tech_2', 'direct_removal', 'ppk'].includes(pending.type)
                ? 'bg-rose-600 hover:bg-rose-500'
                : 'bg-amber-500 hover:bg-amber-400 text-slate-950'
            } disabled:opacity-50`}
          >
            Подтвердить
          </button>
        </div>
      </div>
    </div>
  );
}
