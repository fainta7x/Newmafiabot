import React from 'react';
import { X } from 'lucide-react';
import { Button } from './Button.tsx';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from './Sheet.tsx';

interface MobileSheetProps {
  open: boolean;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  widthClass?: string;
  bodyClassName?: string;
}

export const MobileSheet: React.FC<MobileSheetProps> = ({
  open,
  title,
  subtitle,
  onClose,
  children,
  footer,
  widthClass = 'sm:max-w-2xl',
  bodyClassName = 'px-4 py-4',
}) => (
  <Sheet
    side="bottom"
    open={open}
    onOpenChange={(nextOpen) => {
      if (!nextOpen) onClose();
    }}
  >
    <SheetContent
      showClose={false}
      viewportClassName="sm:items-center sm:p-4"
      className={`${widthClass} sm:rounded-[var(--ds-radius-xl)] sm:border`}
      bodyClassName={bodyClassName}
      header={(
        <header className="flex min-h-16 shrink-0 items-center gap-3 border-b border-[var(--ds-border)] bg-[var(--ds-surface)] px-4 py-3">
          <div className="min-w-0 flex-1">
            <SheetTitle>{title}</SheetTitle>
            {subtitle ? <SheetDescription className="mt-1">{subtitle}</SheetDescription> : null}
          </div>
          <Button
            type="button"
            size="icon"
            variant="secondary"
            aria-label="Закрыть"
            onClick={onClose}
            className="shrink-0"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </Button>
        </header>
      )}
      footer={footer ? (
        <footer className="shrink-0 border-t border-[var(--ds-border)] bg-[var(--ds-surface)] px-4 py-3 pb-[max(.75rem,env(safe-area-inset-bottom))]">
          {footer}
        </footer>
      ) : undefined}
    >
      {children}
    </SheetContent>
  </Sheet>
);

export default MobileSheet;
