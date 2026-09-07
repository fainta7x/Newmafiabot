import { ArrowLeftRight } from 'lucide-react';

const mobileLabelClassName = 'product-mode-switch__mobile-label hidden';

type ProductMode = 'player' | 'organizer';

export default function ProductModeSwitch({
  activeMode,
  onSwitch,
}: {
  activeMode: ProductMode;
  onSwitch: () => void;
}) {
  const destination = activeMode === 'player' ? 'Управление' : 'Кабинет';
  const ariaLabel = activeMode === 'player'
    ? 'Перейти в режим организатора'
    : 'Перейти в кабинет игрока';

  return (
    <button
      data-testid={`product-mode-switch-${activeMode}`}
      type="button"
      onClick={onSwitch}
      aria-label={ariaLabel}
      className="ds-focus-ring inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl border border-border-soft bg-surface-1 px-2.5 text-[11px] font-bold text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
    >
      <ArrowLeftRight className="h-4 w-4" aria-hidden="true" />
      <span className="product-mode-switch__label">{destination}</span>
      {activeMode === 'player' ? (
        <span className={mobileLabelClassName} aria-hidden="true">CRM</span>
      ) : null}
    </button>
  );
}
