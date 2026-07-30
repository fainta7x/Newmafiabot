import React, { useEffect } from 'react';
import { X, Play, AlertTriangle, AlertCircle, RefreshCw } from 'lucide-react';

interface ConfirmStartTournamentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  tournamentTitle: string;
  loading: boolean;
  error?: string | null;
}

export const ConfirmStartTournamentModal: React.FC<ConfirmStartTournamentModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  tournamentTitle,
  loading,
  error,
}) => {
  useEffect(() => {
    if (isOpen) {
      const originalStyle = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalStyle;
      };
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md">
      <div className="bg-surface-1 border border-border-soft rounded-3xl max-w-lg w-full p-5 sm:p-6 text-text-primary shadow-2xl relative space-y-5 animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-border-soft">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
              <Play className="w-4 h-4 fill-emerald-400" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold">Подтверждение запуска</h3>
              <p className="text-[11px] text-text-secondary">Турнир перейдёт в статус «Турнир идёт»</p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={loading}
            className="text-text-muted hover:text-text-primary p-2 rounded-full hover:bg-surface-hover cursor-pointer transition-colors shrink-0 disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Server Error Alert (keeps modal open and allows retry) */}
        {error && (
          <div className="p-3.5 bg-danger/10 border border-danger/30 rounded-2xl flex items-start gap-2.5 text-danger text-xs font-semibold">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">Ошибка запуска турнира:</p>
              <p className="font-normal text-[11px] mt-0.5">{error}</p>
            </div>
          </div>
        )}

        {/* Tournament Readiness Summary */}
        <div className="bg-surface-2 border border-border-soft p-4 rounded-2xl space-y-3">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Название турнира</span>
            <p className="text-sm font-extrabold text-text-primary mt-0.5">{tournamentTitle}</p>
          </div>

          <div className="grid grid-cols-3 gap-2 pt-2 border-t border-border-soft text-center">
            <div className="bg-surface-1 p-2 rounded-xl border border-border-soft">
              <span className="text-base font-black text-emerald-400 block font-mono">10</span>
              <span className="text-[10px] text-text-secondary font-medium">участников</span>
            </div>
            <div className="bg-surface-1 p-2 rounded-xl border border-border-soft">
              <span className="text-base font-black text-accent block font-mono">10</span>
              <span className="text-[10px] text-text-secondary font-medium">созданных игр</span>
            </div>
            <div className="bg-surface-1 p-2 rounded-xl border border-border-soft">
              <span className="text-base font-black text-amber-400 block font-mono">100</span>
              <span className="text-[10px] text-text-secondary font-medium">мест</span>
            </div>
          </div>
        </div>

        {/* Lock Warning */}
        <div className="p-3.5 bg-amber-500/10 border border-amber-500/30 rounded-2xl flex items-start gap-2.5 text-amber-300 text-xs">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
          <div>
            <p className="font-bold">Состав участников и рассадка будут заблокированы</p>
            <p className="text-[11px] text-amber-200/80 mt-0.5">
              После старта турнира вы не сможете изменить список игроков или сгенерировать новую рассадку.
            </p>
          </div>
        </div>

        {/* Modal Footer Buttons */}
        <div className="flex items-center justify-end gap-2.5 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="bg-surface-2 hover:bg-surface-hover text-text-secondary font-bold px-4 py-2.5 rounded-2xl text-xs uppercase tracking-wider cursor-pointer min-h-[44px] disabled:opacity-50"
          >
            Отмена
          </button>

          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-extrabold px-5 py-2.5 rounded-2xl text-xs uppercase tracking-wider transition-all cursor-pointer flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/20 min-h-[44px]"
          >
            {loading ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Запускаем…</span>
              </>
            ) : (
              <>
                <Play className="w-4 h-4 fill-white" />
                <span>Запустить турнир</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
