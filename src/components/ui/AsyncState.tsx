import type { ReactNode } from 'react';

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
  const player = theme === 'player';
  const error = kind === 'error';
  const outer = player
    ? error
      ? 'border-rose-300/10 bg-rose-300/[0.04] text-white'
      : 'border-white/10 bg-white/[0.04] text-white'
    : error
      ? 'border-danger/30 bg-danger-soft text-text-primary'
      : 'border-border-soft bg-surface-1 text-text-primary';
  const descriptionClass = player ? 'text-white/35' : 'text-text-secondary';
  const button = player
    ? 'bg-white text-black'
    : 'bg-accent text-white';

  return (
    <div
      role={error ? 'alert' : 'status'}
      aria-live={error ? 'assertive' : 'polite'}
      className={`w-full rounded-3xl border text-center ${outer} ${compact ? 'px-4 py-5' : 'px-5 py-7'} ${className}`}
    >
      {icon != null ? <div className="text-3xl" aria-hidden="true">{icon}</div> : null}
      <div className={`${icon != null ? 'mt-2' : ''} text-sm font-semibold`}>{title}</div>
      {description ? <p className={`mt-1 text-xs leading-5 ${descriptionClass}`}>{description}</p> : null}
      {onAction ? (
        <button type="button" onClick={onAction} className={`mt-4 min-h-10 rounded-xl px-4 text-xs font-bold ${button}`}>
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}
