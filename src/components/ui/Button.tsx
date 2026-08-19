import type { ButtonHTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'destructive';
export type ButtonSize = 'sm' | 'md' | 'lg' | 'icon';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary: 'ds-button-primary border text-[var(--ds-on-primary)]',
  secondary: 'ds-button-secondary border text-[var(--ds-foreground)] hover:bg-[var(--ds-surface-hover)]',
  outline: 'ds-button-outline border text-[var(--ds-foreground)] hover:bg-[var(--ds-surface-hover)]',
  ghost: 'border border-transparent bg-transparent text-[var(--ds-foreground)] hover:bg-[var(--ds-surface-hover)]',
  destructive: 'ds-button-destructive border text-white hover:brightness-105',
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
        'ds-focus-ring inline-flex shrink-0 items-center justify-center gap-2 rounded-[var(--ds-radius-md)] font-semibold tracking-[-0.01em] transition-[background-color,border-color,color,box-shadow,filter,transform] duration-150 select-none disabled:pointer-events-none disabled:opacity-45 active:translate-y-px',
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
      {...props}
    />
  );
}
