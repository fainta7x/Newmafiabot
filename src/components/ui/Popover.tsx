import { Popover as BasePopover } from '@base-ui/react/popover';
import type { ComponentProps, ReactNode } from 'react';
import { cn } from '../../lib/cn';

export const Popover = BasePopover.Root;
export const PopoverTrigger = BasePopover.Trigger;
export const PopoverClose = BasePopover.Close;
export const PopoverPortal = BasePopover.Portal;

export interface PopoverContentProps
  extends Omit<ComponentProps<typeof BasePopover.Popup>, 'className' | 'children'> {
  className?: string;
  children?: ReactNode;
  side?: ComponentProps<typeof BasePopover.Positioner>['side'];
  align?: ComponentProps<typeof BasePopover.Positioner>['align'];
  sideOffset?: ComponentProps<typeof BasePopover.Positioner>['sideOffset'];
  alignOffset?: ComponentProps<typeof BasePopover.Positioner>['alignOffset'];
  showArrow?: boolean;
}

export function PopoverContent({
  className,
  children,
  side = 'bottom',
  align = 'center',
  sideOffset = 8,
  alignOffset = 0,
  showArrow = false,
  ...props
}: PopoverContentProps) {
  return (
    <BasePopover.Portal>
      <BasePopover.Positioner
        data-slot="popover-positioner"
        side={side}
        align={align}
        sideOffset={sideOffset}
        alignOffset={alignOffset}
        className="z-[var(--ds-layer-popover)]"
      >
        <BasePopover.Popup
          data-slot="popover-content"
          className={cn(
            'ds-surface-raised w-[min(20rem,calc(100vw-1.5rem))] rounded-[var(--ds-radius-lg)] p-3 text-sm text-foreground shadow-[var(--ds-shadow-raised)] outline-none transition-[opacity,transform] duration-150 data-[ending-style]:scale-[0.98] data-[ending-style]:opacity-0 data-[starting-style]:scale-[0.98] data-[starting-style]:opacity-0',
            className,
          )}
          {...props}
        >
          {showArrow && (
            <BasePopover.Arrow
              data-slot="popover-arrow"
              className="h-2.5 w-2.5 rotate-45 border-l border-t border-[var(--ds-border-strong)] bg-[var(--ds-surface-raised)]"
            />
          )}
          {children}
        </BasePopover.Popup>
      </BasePopover.Positioner>
    </BasePopover.Portal>
  );
}

export function PopoverHeader({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('mb-2 flex flex-col gap-1', className)} {...props} />;
}

export function PopoverTitle({
  className,
  ...props
}: Omit<ComponentProps<typeof BasePopover.Title>, 'className'> & { className?: string }) {
  return (
    <BasePopover.Title
      data-slot="popover-title"
      className={cn('font-semibold text-foreground', className)}
      {...props}
    />
  );
}

export function PopoverDescription({
  className,
  ...props
}: Omit<ComponentProps<typeof BasePopover.Description>, 'className'> & { className?: string }) {
  return (
    <BasePopover.Description
      data-slot="popover-description"
      className={cn('text-xs leading-relaxed text-muted-foreground', className)}
      {...props}
    />
  );
}
