import React from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { Button } from './Button.tsx';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from './Dialog.tsx';

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
}) => (
  <Dialog
    open={open}
    onOpenChange={(nextOpen) => {
      if (!nextOpen && !busy) onCancel();
    }}
  >
    <DialogContent
      role="alertdialog"
      showClose={false}
      className="max-w-sm"
      data-slot="confirm-dialog"
    >
      <div className="flex items-start gap-3">
        <div
          aria-hidden="true"
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--ds-radius-md)] ${
            tone === 'danger'
              ? 'bg-[var(--ds-danger-soft)] text-[var(--ds-danger)]'
              : 'bg-[var(--ds-warning-soft)] text-[var(--ds-warning)]'
          }`}
        >
          <AlertTriangle className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <DialogTitle>{title}</DialogTitle>
          {description ? (
            <DialogDescription className="mt-1 whitespace-pre-line">{description}</DialogDescription>
          ) : null}
        </div>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          aria-label="Закрыть"
          onClick={onCancel}
          disabled={busy}
          className="-mr-2 -mt-2"
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </Button>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-2">
        <Button type="button" variant="secondary" onClick={onCancel} disabled={busy}>
          {cancelLabel}
        </Button>
        <Button
          type="button"
          variant={tone === 'danger' ? 'destructive' : 'primary'}
          onClick={() => void onConfirm()}
          disabled={busy}
        >
          {busy ? 'Подождите…' : confirmLabel}
        </Button>
      </div>
    </DialogContent>
  </Dialog>
);

export default ConfirmDialog;
