import { useEffect, useRef, type ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { Button } from './Button.tsx';
import { FitText } from './FitText.tsx';

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
  scrollable = false,
}: {
  value: T;
  items: Array<SegmentedControlItem<T>>;
  onValueChange: (value: T) => void;
  ariaLabel: string;
  className?: string;
  itemClassName?: string;
  scrollable?: boolean;
}) {
  const navRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!scrollable) return;
    const nav = navRef.current;
    const active = nav?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!nav || !active) return;
    const parent = nav.getBoundingClientRect(), child = active.getBoundingClientRect();
    if (child.right > parent.right) nav.scrollLeft += child.right - parent.right;
    else if (child.left < parent.left) nav.scrollLeft += child.left - parent.left;
  }, [value, scrollable]);
  return (
    <nav
      ref={navRef}
      aria-label={ariaLabel}
      data-slot="segmented-control"
      className={cn('ds-segmented gap-1 rounded-2xl p-1', scrollable ? 'flex overflow-x-auto' : 'grid', className)}
      style={scrollable ? undefined : { gridTemplateColumns: `repeat(${Math.max(items.length, 1)}, minmax(0, 1fr))` }}
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
            style={{ minHeight: '40px', paddingInline: '4px' }}
            className={cn(
              'min-w-0 rounded-xl text-[11px] font-semibold',
              scrollable && 'min-w-11 shrink-0 !px-3',
              active ? 'ds-segmented-active' : 'text-white/42 active:bg-white/[0.05]',
              itemClassName,
            )}
          >
            {/* A label shrinks to fit its segment instead of «…» (owner, 2026-10-27). */}
            {scrollable ? <span className="whitespace-nowrap">{item.label}</span> : <FitText minPx={9} className="block w-full">{item.label}</FitText>}
          </Button>
        );
      })}
    </nav>
  );
}
