import { Menu as BaseMenu } from '@base-ui/react/menu';
import type { ComponentProps, ReactNode } from 'react';
import { cn } from '../../lib/cn';

export const Menu = BaseMenu.Root;
export const MenuTrigger = BaseMenu.Trigger;
export const MenuPortal = BaseMenu.Portal;
export const MenuGroup = BaseMenu.Group;
export const MenuRadioGroup = BaseMenu.RadioGroup;

export interface MenuContentProps
  extends Omit<ComponentProps<typeof BaseMenu.Popup>, 'className' | 'children'> {
  className?: string;
  children?: ReactNode;
  side?: ComponentProps<typeof BaseMenu.Positioner>['side'];
  align?: ComponentProps<typeof BaseMenu.Positioner>['align'];
  sideOffset?: ComponentProps<typeof BaseMenu.Positioner>['sideOffset'];
  alignOffset?: ComponentProps<typeof BaseMenu.Positioner>['alignOffset'];
}

export function MenuContent({
  className,
  children,
  side = 'bottom',
  align = 'start',
  sideOffset = 8,
  alignOffset = 0,
  ...props
}: MenuContentProps) {
  return (
    <BaseMenu.Portal>
      <BaseMenu.Positioner
        data-slot="menu-positioner"
        side={side}
        align={align}
        sideOffset={sideOffset}
        alignOffset={alignOffset}
        className="z-[var(--ds-layer-popover)]"
      >
        <BaseMenu.Popup
          data-slot="menu-content"
          className={cn(
            'ds-surface-raised min-w-44 max-w-[min(20rem,calc(100vw-1.5rem))] rounded-[var(--ds-radius-lg)] p-1.5 text-sm text-foreground shadow-[var(--ds-shadow-raised)] outline-none transition-[opacity,transform] duration-150 data-[ending-style]:scale-[0.98] data-[ending-style]:opacity-0 data-[starting-style]:scale-[0.98] data-[starting-style]:opacity-0',
            className,
          )}
          {...props}
        >
          {children}
        </BaseMenu.Popup>
      </BaseMenu.Positioner>
    </BaseMenu.Portal>
  );
}

export interface MenuItemProps
  extends Omit<ComponentProps<typeof BaseMenu.Item>, 'className'> {
  className?: string;
  destructive?: boolean;
}

export function MenuItem({ className, destructive = false, ...props }: MenuItemProps) {
  return (
    <BaseMenu.Item
      data-slot="menu-item"
      data-destructive={destructive || undefined}
      className={cn(
        'ds-focus-ring flex min-h-10 cursor-default select-none items-center gap-2 rounded-[var(--ds-radius-sm)] px-3 py-2 text-sm outline-none transition-colors data-[highlighted]:bg-ui-accent data-[disabled]:pointer-events-none data-[disabled]:opacity-45',
        destructive && 'text-[var(--ds-danger)] data-[highlighted]:bg-[var(--ds-danger-soft)]',
        className,
      )}
      {...props}
    />
  );
}

export function MenuSeparator({
  className,
  ...props
}: Omit<ComponentProps<typeof BaseMenu.Separator>, 'className'> & { className?: string }) {
  return (
    <BaseMenu.Separator
      data-slot="menu-separator"
      className={cn('my-1 h-px bg-[var(--ds-border)]', className)}
      {...props}
    />
  );
}

export function MenuGroupLabel({
  className,
  ...props
}: Omit<ComponentProps<typeof BaseMenu.GroupLabel>, 'className'> & { className?: string }) {
  return (
    <BaseMenu.GroupLabel
      data-slot="menu-group-label"
      className={cn('px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground', className)}
      {...props}
    />
  );
}

export function MenuCheckboxItem({
  className,
  ...props
}: Omit<ComponentProps<typeof BaseMenu.CheckboxItem>, 'className'> & { className?: string }) {
  return (
    <BaseMenu.CheckboxItem
      data-slot="menu-checkbox-item"
      className={cn(
        'ds-focus-ring flex min-h-10 cursor-default select-none items-center gap-2 rounded-[var(--ds-radius-sm)] px-3 py-2 text-sm outline-none transition-colors data-[highlighted]:bg-ui-accent data-[disabled]:pointer-events-none data-[disabled]:opacity-45',
        className,
      )}
      {...props}
    />
  );
}

export const MenuCheckboxItemIndicator = BaseMenu.CheckboxItemIndicator;
export const MenuRadioItem = BaseMenu.RadioItem;
export const MenuRadioItemIndicator = BaseMenu.RadioItemIndicator;
