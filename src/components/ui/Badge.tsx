import type { HTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

export type BadgeVariant = 'neutral' | 'accent' | 'success' | 'warning' | 'danger';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

const variantClasses: Record<BadgeVariant, string> = {
  neutral: 'border-[var(--ds-border)] bg-[var(--ds-surface-raised)] text-muted-foreground',
  accent: 'border-[var(--ds-border-strong)] bg-[var(--ds-primary-soft)] text-[var(--ds-primary)]',
  success: 'border-[var(--ds-border-strong)] bg-[var(--ds-success-soft)] text-[var(--ds-success)]',
  warning: 'border-[var(--ds-border-strong)] bg-[var(--ds-warning-soft)] text-[var(--ds-warning)]',
  danger: 'border-[var(--ds-border-strong)] bg-[var(--ds-danger-soft)] text-[var(--ds-danger)]',
};

export function Badge({ variant = 'neutral', className, ...props }: BadgeProps) {
  return (
    <span
      data-slot="badge"
      className={cn(
        'ds-badge inline-flex min-h-6 items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold leading-4 tracking-[-0.01em]',
        variantClasses[variant],
        className,
      )}
      {...props}
    />
  );
}
