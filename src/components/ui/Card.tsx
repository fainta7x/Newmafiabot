import type { HTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

type DivProps = HTMLAttributes<HTMLDivElement>;
type HeadingProps = HTMLAttributes<HTMLHeadingElement>;
type ParagraphProps = HTMLAttributes<HTMLParagraphElement>;

export function Card({ className, ...props }: DivProps) {
  return (
    <div
      data-slot="card"
      className={cn('ds-panel rounded-[var(--ds-radius-lg)] text-white', className)}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: DivProps) {
  return <div data-slot="card-header" className={cn('space-y-1.5 p-4', className)} {...props} />;
}

export function CardTitle({ className, ...props }: HeadingProps) {
  return (
    <h3
      data-slot="card-title"
      className={cn('text-base font-semibold leading-tight text-white', className)}
      {...props}
    />
  );
}

export function CardDescription({ className, ...props }: ParagraphProps) {
  return (
    <p
      data-slot="card-description"
      className={cn('text-sm leading-5 text-white/40', className)}
      {...props}
    />
  );
}

export function CardContent({ className, ...props }: DivProps) {
  return <div data-slot="card-content" className={cn('px-4 pb-4', className)} {...props} />;
}

export function CardFooter({ className, ...props }: DivProps) {
  return (
    <div
      data-slot="card-footer"
      className={cn('flex items-center gap-2 border-t border-white/[0.07] px-4 py-3', className)}
      {...props}
    />
  );
}
