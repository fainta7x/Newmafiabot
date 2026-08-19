import { Drawer as BaseDrawer } from '@base-ui/react/drawer';
import { X } from 'lucide-react';
import {
  createContext,
  useContext,
  type ComponentProps,
  type ReactNode,
} from 'react';
import { cn } from '../../lib/cn';

export type SheetSide = 'top' | 'right' | 'bottom' | 'left';

const SheetSideContext = createContext<SheetSide>('bottom');

export interface SheetProps
  extends Omit<ComponentProps<typeof BaseDrawer.Root>, 'swipeDirection'> {
  side?: SheetSide;
}

export function Sheet({ side = 'bottom', children, ...props }: SheetProps) {
  const swipeDirection = side === 'bottom' ? 'down' : side === 'top' ? 'up' : side;
  return (
    <SheetSideContext.Provider value={side}>
      <BaseDrawer.Root swipeDirection={swipeDirection} {...props}>
        {children}
      </BaseDrawer.Root>
    </SheetSideContext.Provider>
  );
}

export const SheetTrigger = BaseDrawer.Trigger;
export const SheetClose = BaseDrawer.Close;
export const SheetPortal = BaseDrawer.Portal;

const viewportClasses: Record<SheetSide, string> = {
  bottom: 'items-end justify-center',
  top: 'items-start justify-center',
  left: 'items-stretch justify-start',
  right: 'items-stretch justify-end',
};

const popupClasses: Record<SheetSide, string> = {
  bottom:
    'max-h-[min(88dvh,var(--tg-viewport-stable-height,88dvh))] w-full max-w-2xl rounded-t-[var(--ds-radius-xl)] border-x-0 border-b-0',
  top: 'max-h-[88dvh] w-full max-w-2xl rounded-b-[var(--ds-radius-xl)] border-x-0 border-t-0',
  left: 'h-full w-[min(88vw,380px)] rounded-r-[var(--ds-radius-xl)] border-y-0 border-l-0',
  right: 'h-full w-[min(88vw,380px)] rounded-l-[var(--ds-radius-xl)] border-y-0 border-r-0',
};

export interface SheetContentProps
  extends Omit<ComponentProps<typeof BaseDrawer.Popup>, 'className' | 'children'> {
  className?: string;
  children?: ReactNode;
  showClose?: boolean;
  header?: ReactNode;
  footer?: ReactNode;
  bodyClassName?: string;
}

export function SheetContent({
  className,
  children,
  showClose = true,
  header,
  footer,
  bodyClassName,
  ...props
}: SheetContentProps) {
  const side = useContext(SheetSideContext);
  const showHandle = side === 'bottom' || side === 'top';

  return (
    <BaseDrawer.Portal>
      <BaseDrawer.Backdrop
        data-slot="sheet-backdrop"
        className="fixed inset-0 z-[var(--ds-layer-modal)] bg-black/65 backdrop-blur-[2px] transition-opacity duration-150 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0"
      />
      <BaseDrawer.Viewport
        data-slot="sheet-viewport"
        className={cn(
          'pointer-events-none fixed inset-0 z-[var(--ds-layer-modal)] flex overflow-hidden [padding-top:env(safe-area-inset-top)] [padding-bottom:env(safe-area-inset-bottom)]',
          viewportClasses[side],
        )}
      >
        <BaseDrawer.Popup
          data-slot="sheet-content"
          className={cn(
            'ds-surface-raised pointer-events-auto relative flex min-h-0 flex-col overflow-hidden border-[var(--ds-border-strong)] shadow-[var(--ds-shadow-raised)] outline-none',
            popupClasses[side],
            className,
          )}
          {...props}
        >
          {showHandle && (
            <div
              aria-hidden="true"
              className={cn(
                'mx-auto h-1 w-10 shrink-0 rounded-full bg-[var(--ds-border-strong)]',
                side === 'bottom' ? 'mt-2.5' : 'mb-2.5 order-last',
              )}
            />
          )}
          {header}
          <BaseDrawer.Content
            className={cn(
              'min-h-0 flex-1 overflow-y-auto overscroll-contain',
              bodyClassName ?? 'p-5',
            )}
          >
            {children}
          </BaseDrawer.Content>
          {footer}
          {showClose && (
            <BaseDrawer.Close
              aria-label="Закрыть"
              data-slot="sheet-close"
              className="ds-focus-ring absolute right-3 top-3 inline-flex h-10 w-10 items-center justify-center rounded-[var(--ds-radius-md)] text-muted-foreground transition-colors hover:bg-ui-accent hover:text-foreground"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </BaseDrawer.Close>
          )}
        </BaseDrawer.Popup>
      </BaseDrawer.Viewport>
    </BaseDrawer.Portal>
  );
}

export function SheetHeader({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="sheet-header"
      className={cn('flex flex-col gap-1.5 pr-10', className)}
      {...props}
    />
  );
}

export function SheetFooter({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="sheet-footer"
      className={cn('mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end', className)}
      {...props}
    />
  );
}

export function SheetTitle({
  className,
  ...props
}: Omit<ComponentProps<typeof BaseDrawer.Title>, 'className'> & { className?: string }) {
  return (
    <BaseDrawer.Title
      data-slot="sheet-title"
      className={cn('text-base font-bold leading-tight text-foreground', className)}
      {...props}
    />
  );
}

export function SheetDescription({
  className,
  ...props
}: Omit<ComponentProps<typeof BaseDrawer.Description>, 'className'> & { className?: string }) {
  return (
    <BaseDrawer.Description
      data-slot="sheet-description"
      className={cn('text-sm leading-relaxed text-muted-foreground', className)}
      {...props}
    />
  );
}
