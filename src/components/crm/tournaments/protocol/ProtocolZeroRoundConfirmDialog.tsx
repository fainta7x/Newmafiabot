import { AlertTriangle } from 'lucide-react';

type ProtocolZeroRoundConfirmDialogProps = {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export function ProtocolZeroRoundConfirmDialog({
  open,
  onCancel,
  onConfirm,
}: ProtocolZeroRoundConfirmDialogProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 max-w-md w-full space-y-4 text-slate-100 shadow-2xl">
        <div className="flex items-center space-x-3 text-amber-400">
          <AlertTriangle className="w-6 h-6" />
          <h3 className="text-lg font-bold">Подтверждение смены игрока нулевого круга</h3>
        </div>
        <p className="text-xs sm:text-sm text-slate-300">
          Выбранные номера ЛХ прежнего игрока будут очищены.
        </p>
        <div className="flex items-center justify-end space-x-2 pt-2">
          <button type="button" onClick={onCancel} className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold">Отмена</button>
          <button type="button" onClick={onConfirm} className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs shadow-md">Сменить и обнулить</button>
        </div>
      </div>
    </div>
  );
}
