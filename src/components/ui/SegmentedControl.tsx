import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { Button } from './Button.tsx';

export type SegmentedControlItem<T extends string> = {
  value: T;
  label: ReactNode;
  disabled?: boolean;
};

export function SegmentedControl<T extends string>({
  value,
  items,
  onValueChange,
  ariaLabel,
  className,
  itemClassName,
}: {
  value: T;
  items: Array<SegmentedControlItem<T>>;
  onValueChange: (value: T) => void;
  ariaLabel: string;
  className?: string;
  itemClassName?: string;
}) {
  return (
    <nav
      aria-label={ariaLabel}
      data-slot="segmented-control"
      className={cn(
        'ds-panel grid gap-1 rounded-[var(--ds-radius-lg)] p-1',
        className,
      )}
      style={{ gridTemplateColumns: `repeat(${Math.max(items.length, 1)}, minmax(0, 1fr))` }}
    >
      {items.map((item) => {
        const active = value === item.value;
        return (
          <Button
            key={item.value}
            type="button"
            size="md"
            variant="ghost"
            disabled={item.disabled}
            aria-current={active ? 'page' : undefined}
            onClick={() => onValueChange(item.value)}
            className={cn(
              'min-w-0 px-2 text-xs',
              active ? 'ds-segmented-active' : 'text-muted-foreground',
              itemClassName,
            )}
          >
            <span className="truncate">{item.label}</span>
          </Button>
        );
      })}
    </nav>
  );
}
