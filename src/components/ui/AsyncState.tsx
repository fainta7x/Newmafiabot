import { Inbox, LoaderCircle, TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { Button } from './Button.tsx';

type AsyncStateKind = 'loading' | 'error' | 'empty';
type AsyncStateTheme = 'player' | 'crm';

type Props = {
  kind: AsyncStateKind;
  title: string;
  description?: string | null;
  icon?: ReactNode;
  actionLabel?: string;
  onAction?: () => void;
  theme?: AsyncStateTheme;
  compact?: boolean;
  className?: string;
};

const defaultIcon = (kind: AsyncStateKind) => {
  if (kind === 'loading') return <LoaderCircle className="h-5 w-5 animate-spin" />;
  if (kind === 'error') return <TriangleAlert className="h-5 w-5" />;
  return <Inbox className="h-5 w-5" />;
};

export default function AsyncState({
  kind,
  title,
  description,
  icon,
  actionLabel = 'Повторить',
  onAction,
  theme = 'player',
  compact = false,
  className = '',
}: Props) {
  const error = kind === 'error';
  const stateIcon = icon ?? defaultIcon(kind);

  return (
    <div
      data-slot="async-state"
      data-legacy-theme={theme}
      data-state-kind={kind}
      role={error ? 'alert' : 'status'}
      aria-live={error ? 'assertive' : 'polite'}
      aria-busy={kind === 'loading'}
      className={cn(
        'w-full rounded-[var(--ds-radius-lg)] border text-center text-foreground',
        error
          ? 'border-[var(--ds-border-strong)] bg-[var(--ds-danger-soft)]'
          : 'border-border bg-[var(--ds-surface)]',
        compact ? 'px-4 py-4' : 'px-5 py-6',
        className,
      )}
    >
      <div
        className={cn(
          'mx-auto grid h-9 w-9 place-items-center rounded-full',
          error ? 'bg-[var(--ds-danger-soft)] text-[var(--ds-danger)]' : 'bg-secondary text-muted-foreground',
        )}
        aria-hidden="true"
      >
        {stateIcon}
      </div>
      <div className="mt-2.5 text-sm font-semibold">{title}</div>
      {description ? <p className="mx-auto mt-1 max-w-sm text-xs leading-5 text-muted-foreground">{description}</p> : null}
      {onAction ? (
        <Button type="button" variant={error ? 'outline' : 'secondary'} size="sm" onClick={onAction} className="mt-4">
          {actionLabel}
        </Button>
      ) : null}
    </div>
  );
}
