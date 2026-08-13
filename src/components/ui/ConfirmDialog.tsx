import React from 'react';
import { AlertTriangle, X } from 'lucide-react';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'danger' | 'warning';
  busy?: boolean;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  title,
  description,
  confirmLabel = 'Подтвердить',
  cancelLabel = 'Отмена',
  tone = 'warning',
  busy = false,
  onConfirm,
  onCancel,
}) => {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
      <div role="alertdialog" aria-modal="true" className="w-full max-w-sm rounded-[20px] border border-border-soft bg-surface-1 p-4 text-text-primary shadow-2xl">
        <div className="flex items-start gap-3">
          <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] ${tone === 'danger' ? 'bg-danger-soft text-danger' : 'bg-warning-soft text-warning'}`}>
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-[15px] font-bold">{title}</h3>
            {description ? <p className="mt-1 whitespace-pre-line text-[12px] leading-relaxed text-text-secondary">{description}</p> : null}
          </div>
          <button type="button" onClick={onCancel} disabled={busy} className="-mr-1 -mt-1 flex h-11 w-11 items-center justify-center rounded-[12px] text-text-muted hover:text-text-primary disabled:opacity-50">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <button type="button" onClick={onCancel} disabled={busy} className="min-h-11 rounded-[12px] border border-border-soft bg-surface-2 text-[13px] font-semibold text-text-secondary disabled:opacity-50">
            {cancelLabel}
          </button>
          <button type="button" onClick={() => void onConfirm()} disabled={busy} className={`min-h-11 rounded-[12px] text-[13px] font-bold text-white disabled:opacity-50 ${tone === 'danger' ? 'bg-danger' : 'bg-accent'}`}>
            {busy ? 'Подождите…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmDialog;
