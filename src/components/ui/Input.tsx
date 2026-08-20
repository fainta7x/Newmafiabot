import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, 'aria-invalid': ariaInvalid, ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      data-slot="input"
      aria-invalid={ariaInvalid}
      className={cn(
        'ds-focus-ring ds-input-surface min-h-[var(--ds-control-md)] w-full rounded-[var(--ds-radius-md)] border px-3.5 text-sm text-white outline-none transition-[border-color,box-shadow,background-color] placeholder:text-white/28 disabled:cursor-not-allowed disabled:opacity-45',
        ariaInvalid ? 'border-[var(--ds-danger)]' : 'border-white/10 focus:border-[var(--ds-accent)]',
        className,
      )}
      {...props}
    />
  );
});
