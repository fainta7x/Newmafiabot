import type { ButtonHTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'destructive';
export type ButtonSize = 'sm' | 'md' | 'lg' | 'icon';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'border border-transparent bg-[var(--ds-primary)] text-[var(--ds-on-primary)] hover:bg-[var(--ds-primary-hover)]',
  secondary:
    'border border-[var(--ds-border)] bg-[var(--ds-surface-raised)] text-[var(--ds-foreground)] hover:bg-[var(--ds-surface-hover)]',
  outline:
    'border border-[var(--ds-border-strong)] bg-transparent text-[var(--ds-foreground)] hover:bg-[var(--ds-surface-hover)]',
  ghost:
    'border border-transparent bg-transparent text-[var(--ds-foreground)] hover:bg-[var(--ds-surface-hover)]',
  destructive:
    'border border-transparent bg-[var(--ds-danger)] text-white hover:brightness-110',
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'min-h-[var(--ds-control-sm)] px-3 text-xs',
  md: 'min-h-[var(--ds-control-md)] px-4 text-sm',
  lg: 'min-h-[var(--ds-control-lg)] px-5 text-sm',
  icon: 'h-[var(--ds-touch-min)] w-[var(--ds-touch-min)] p-0',
};

export function Button({
  variant = 'primary',
  size = 'md',
  className,
  ...props
}: ButtonProps) {
  return (
    <button
      data-slot="button"
      className={cn(
        'ds-focus-ring inline-flex shrink-0 items-center justify-center gap-2 rounded-[var(--ds-radius-md)] font-semibold transition-[background-color,border-color,color,box-shadow,transform] duration-150 select-none disabled:pointer-events-none disabled:opacity-45 active:translate-y-px',
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
      {...props}
    />
  );
}
