import React, { useState } from 'react';
import { RotateCcw, AlertTriangle, X } from 'lucide-react';

interface ConfirmReopenTournamentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}

export const ConfirmReopenTournamentModal: React.FC<ConfirmReopenTournamentModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleConfirm = async () => {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      await onConfirm();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Ошибка при возврате турнира на корректировку');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-surface-1 border border-border-soft rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl flex flex-col">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-border-soft flex items-center justify-between">
          <div className="flex items-center gap-2">
            <RotateCcw className="w-5 h-5 text-amber-400" />
            <h3 className="text-sm sm:text-base font-black text-text-primary uppercase tracking-tight">
              Возврат турнира на корректировку
            </h3>
          </div>
          <button
            type="button"
            disabled={loading}
            onClick={onClose}
            className="text-text-muted hover:text-text-primary p-1.5 hover:bg-surface-2 rounded-xl transition-all cursor-pointer disabled:opacity-50 min-h-[44px] min-w-[44px] flex items-center justify-center"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 sm:p-5 space-y-4">
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4 text-xs text-amber-300 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-2">
              <span className="font-bold block text-text-primary text-sm">Внимание!</span>
              <ul className="list-disc list-inside space-y-1.5 text-text-secondary text-xs leading-relaxed">
                <li>Турнир вернётся в режим корректировки.</li>
                <li>Публичные результаты временно перестанут отображаться.</li>
                <li>Решения по ничьям и номинациям будут сброшены.</li>
                <li>Игры и протоколы сохранятся.</li>
                <li>Для исправления конкретной игры нужно открыть её протокол и нажать «Вернуть в черновик».</li>
              </ul>
            </div>
          </div>

          {error && (
            <div className="p-3.5 rounded-xl bg-danger/10 border border-danger/20 text-danger text-xs font-medium">
              {error}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="p-4 sm:p-5 border-t border-border-soft bg-surface-2/50 flex items-center justify-end gap-3">
          <button
            type="button"
            disabled={loading}
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl border border-border-soft text-text-secondary hover:text-text-primary font-bold text-xs sm:text-sm transition-all cursor-pointer min-h-[44px] disabled:opacity-50"
          >
            Отмена
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={handleConfirm}
            className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs sm:text-sm uppercase tracking-wider transition-all shadow-md shadow-amber-500/20 cursor-pointer min-h-[44px] flex items-center gap-2 disabled:opacity-50"
          >
            {loading ? (
              <span>Загрузка...</span>
            ) : (
              <>
                <RotateCcw className="w-4 h-4" />
                <span>Вернуть на корректировку</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
