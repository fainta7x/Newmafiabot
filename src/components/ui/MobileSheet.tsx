import React from 'react';
import { X } from 'lucide-react';

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
}) => {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm sm:p-4 flex items-end sm:items-center justify-center" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section
        role="dialog"
        aria-modal="true"
        className={`mobile-sheet w-full ${widthClass} h-[100dvh] sm:h-auto sm:max-h-[92dvh] bg-surface-1 border border-border-soft sm:rounded-[24px] flex flex-col overflow-hidden text-text-primary`}
      >
        <header className="shrink-0 min-h-[64px] border-b border-border-soft bg-surface-1/95 backdrop-blur-xl px-4 py-3 flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-[15px] font-bold leading-tight min-w-0">{title}</div>
            {subtitle ? <div className="mt-1 text-[11px] text-text-secondary leading-snug">{subtitle}</div> : null}
          </div>
          <button
            type="button"
            aria-label="Закрыть"
            onClick={onClose}
            className="w-11 h-11 shrink-0 rounded-[12px] border border-border-soft bg-surface-2 text-text-secondary hover:text-text-primary hover:bg-surface-hover flex items-center justify-center"
          >
            <X className="w-5 h-5" />
          </button>
        </header>
        <div className={`min-h-0 flex-1 overflow-y-auto overscroll-contain ${bodyClassName} pb-[max(1rem,env(safe-area-inset-bottom))]`}>
          {children}
        </div>
        {footer ? (
          <footer className="shrink-0 border-t border-border-soft bg-surface-1/95 backdrop-blur-xl px-4 py-3 pb-[max(.75rem,env(safe-area-inset-bottom))]">
            {footer}
          </footer>
        ) : null}
      </section>
    </div>
  );
};

export default MobileSheet;
