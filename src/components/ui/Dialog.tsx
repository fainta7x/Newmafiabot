import { Dialog as BaseDialog } from '@base-ui/react/dialog';
import { X } from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';
import { cn } from '../../lib/cn';

export const Dialog = BaseDialog.Root;
export const DialogTrigger = BaseDialog.Trigger;
export const DialogClose = BaseDialog.Close;
export const DialogPortal = BaseDialog.Portal;

export interface DialogContentProps
  extends Omit<ComponentProps<typeof BaseDialog.Popup>, 'className'> {
  className?: string;
  children?: ReactNode;
  showClose?: boolean;
}

export function DialogContent({
  className,
  children,
  showClose = true,
  ...props
}: DialogContentProps) {
  return (
    <BaseDialog.Portal>
      <BaseDialog.Backdrop
        data-slot="dialog-backdrop"
        className="fixed inset-0 z-[var(--ds-layer-modal)] bg-black/65 backdrop-blur-[2px] transition-opacity duration-150 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0"
      />
      <BaseDialog.Viewport
        data-slot="dialog-viewport"
        className="fixed inset-0 z-[var(--ds-layer-modal)] flex items-center justify-center overflow-y-auto p-4 [padding-top:max(1rem,env(safe-area-inset-top))] [padding-bottom:max(1rem,env(safe-area-inset-bottom))]"
      >
        <BaseDialog.Popup
          data-slot="dialog-content"
          className={cn(
            'ds-surface-raised relative w-full max-w-lg rounded-[var(--ds-radius-xl)] p-5 text-foreground shadow-[var(--ds-shadow-raised)] outline-none transition-[opacity,transform] duration-150 data-[ending-style]:scale-[0.98] data-[ending-style]:opacity-0 data-[starting-style]:scale-[0.98] data-[starting-style]:opacity-0',
            className,
          )}
          {...props}
        >
          {children}
          {showClose && (
            <BaseDialog.Close
              aria-label="Закрыть"
              data-slot="dialog-close"
              className="ds-focus-ring absolute right-3 top-3 inline-flex h-10 w-10 items-center justify-center rounded-[var(--ds-radius-md)] text-muted-foreground transition-colors hover:bg-ui-accent hover:text-foreground"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </BaseDialog.Close>
          )}
        </BaseDialog.Popup>
      </BaseDialog.Viewport>
    </BaseDialog.Portal>
  );
}

export function DialogHeader({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="dialog-header"
      className={cn('flex flex-col gap-1.5 pr-10', className)}
      {...props}
    />
  );
}

export function DialogFooter({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn('mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end', className)}
      {...props}
    />
  );
}

export function DialogTitle({
  className,
  ...props
}: Omit<ComponentProps<typeof BaseDialog.Title>, 'className'> & { className?: string }) {
  return (
    <BaseDialog.Title
      data-slot="dialog-title"
      className={cn('text-base font-semibold leading-tight text-foreground', className)}
      {...props}
    />
  );
}

export function DialogDescription({
  className,
  ...props
}: Omit<ComponentProps<typeof BaseDialog.Description>, 'className'> & { className?: string }) {
  return (
    <BaseDialog.Description
      data-slot="dialog-description"
      className={cn('text-sm leading-relaxed text-muted-foreground', className)}
      {...props}
    />
  );
}
