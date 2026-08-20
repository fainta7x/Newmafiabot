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
  secondary: 'ds-button-secondary border text-white/70',
  outline: 'ds-button-outline border text-white/70 hover:bg-[var(--ds-surface-hover)] hover:text-white',
  ghost: 'border border-transparent bg-transparent text-white/55 hover:bg-[var(--ds-surface-hover)] hover:text-white',
  destructive: 'ds-button-destructive border text-white hover:brightness-105',
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'min-h-[var(--ds-control-sm)] rounded-[var(--ds-radius-sm)] px-3 text-xs',
  md: 'min-h-[var(--ds-control-md)] rounded-[var(--ds-radius-sm)] px-4 text-sm',
  lg: 'min-h-[var(--ds-control-lg)] rounded-[var(--ds-radius-md)] px-4 text-sm',
  icon: 'h-[var(--ds-touch-min)] w-[var(--ds-touch-min)] rounded-[var(--ds-radius-md)] p-0',
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
        'ds-focus-ring inline-flex shrink-0 items-center justify-center gap-2 font-semibold transition-[background-color,border-color,color,transform] duration-150 select-none disabled:pointer-events-none disabled:opacity-45 active:translate-y-px',
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
      {...props}
    />
  );
}