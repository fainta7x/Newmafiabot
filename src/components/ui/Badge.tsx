import type { HTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

export type BadgeVariant = 'neutral' | 'accent' | 'success' | 'warning' | 'danger';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

const variantClasses: Record<BadgeVariant, string> = {
  neutral: 'border-border bg-secondary text-muted-foreground',
  accent: 'border-primary/25 bg-[var(--ds-primary-soft)] text-primary',
  success: 'border-[color:var(--ds-success)]/25 bg-[var(--ds-success-soft)] text-[var(--ds-success)]',
  warning: 'border-[color:var(--ds-warning)]/25 bg-[var(--ds-warning-soft)] text-[var(--ds-warning)]',
  danger: 'border-[color:var(--ds-danger)]/25 bg-[var(--ds-danger-soft)] text-[var(--ds-danger)]',
};

export function Badge({ variant = 'neutral', className, ...props }: BadgeProps) {
  return (
    <span
      data-slot="badge"
      className={cn(
        'inline-flex min-h-6 items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold leading-4',
        variantClasses[variant],
        className,
      )}
      {...props}
    />
  );
}
