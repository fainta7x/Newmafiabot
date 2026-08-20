import type { HTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

export type BadgeVariant = 'neutral' | 'accent' | 'success' | 'warning' | 'danger';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

const variantClasses: Record<BadgeVariant, string> = {
  neutral: 'border-white/10 bg-white/[0.07] text-white/55',
  accent: 'border-[color-mix(in_srgb,var(--ds-accent)_26%,transparent)] bg-[var(--ds-accent-soft)] text-[var(--ds-accent)]',
  success: 'border-white/10 bg-[var(--ds-success-soft)] text-[var(--ds-success)]',
  warning: 'border-white/10 bg-[var(--ds-warning-soft)] text-[var(--ds-warning)]',
  danger: 'border-white/10 bg-[var(--ds-danger-soft)] text-[var(--ds-danger)]',
};

export function Badge({ variant = 'neutral', className, ...props }: BadgeProps) {
  return (
    <span
      data-slot="badge"
      className={cn(
        'ds-badge inline-flex min-h-6 items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium leading-4',
        variantClasses[variant],
        className,
      )}
      {...props}
    />
  );
}
