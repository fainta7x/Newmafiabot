import type { HTMLAttributes, LabelHTMLAttributes, ReactNode } from 'react';
import { cn } from '../../lib/cn';

export function Field({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div data-slot="field" className={cn('space-y-1.5', className)} {...props} />;
}

export function FieldLabel({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      data-slot="field-label"
      className={cn('block text-xs font-semibold text-muted-foreground', className)}
      {...props}
    />
  );
}

export function FieldDescription({
  className,
  ...props
}: HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      data-slot="field-description"
      className={cn('text-[11px] leading-4 text-[var(--ds-subtle-foreground)]', className)}
      {...props}
    />
  );
}

export function FieldMessage({
  tone = 'error',
  className,
  children,
  ...props
}: HTMLAttributes<HTMLParagraphElement> & {
  tone?: 'error' | 'success' | 'neutral';
  children?: ReactNode;
}) {
  const toneClass =
    tone === 'error'
      ? 'border-[var(--ds-border-strong)] bg-[var(--ds-danger-soft)] text-[var(--ds-danger)]'
      : tone === 'success'
        ? 'border-[var(--ds-border-strong)] bg-[var(--ds-success-soft)] text-[var(--ds-success)]'
        : 'border-border bg-secondary text-muted-foreground';

  return (
    <p
      data-slot="field-message"
      role={tone === 'error' ? 'alert' : 'status'}
      aria-live={tone === 'error' ? 'assertive' : 'polite'}
      className={cn('rounded-[var(--ds-radius-md)] border px-3 py-2.5 text-xs leading-5', toneClass, className)}
      {...props}
    >
      {children}
    </p>
  );
}
