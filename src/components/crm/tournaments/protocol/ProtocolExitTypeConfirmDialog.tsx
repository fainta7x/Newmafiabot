import { AlertTriangle } from 'lucide-react';
import type { PlayerResultData } from '../../../../lib/api';

export type PendingProtocolExitTypeChange = {
  participantId: string;
  newExitType: PlayerResultData['exit_type'];
  playerName: string;
  seatNum: number;
};

type ProtocolExitTypeConfirmDialogProps = {
  pending: PendingProtocolExitTypeChange | null;
  onCancel: () => void;
  onConfirm: () => void;
};

export function ProtocolExitTypeConfirmDialog({
  pending,
  onCancel,
  onConfirm,
}: ProtocolExitTypeConfirmDialogProps) {
  if (!pending) return null;

  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 max-w-md w-full space-y-4 text-slate-100 shadow-2xl">
        <div className="flex items-center space-x-3 text-amber-400">
          <AlertTriangle className="w-6 h-6 text-amber-400" />
          <h3 className="text-base font-bold">Очистить оставленный протокол?</h3>
        </div>

        <p className="text-xs sm:text-sm text-slate-300">
          У игрока #{pending.seatNum} ({pending.playerName}) есть сохранённый цветовой протокол. Изменение статуса ухода с «Убит» удалит эти записи.
        </p>

        <div className="flex items-center justify-end space-x-2 pt-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs shadow-md"
          >
            Удалить и изменить статус
          </button>
        </div>
      </div>
    </div>
  );
}
