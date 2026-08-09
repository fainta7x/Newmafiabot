import React from 'react';
import { Minus, Plus } from 'lucide-react';

export interface PointStepperProps {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (newValue: number) => void;
  disabled?: boolean;
  formatValue?: (val: number) => string;
  ariaLabelMinus?: string;
  ariaLabelPlus?: string;
}

export function roundTenths(val: number): number {
  return Math.round(val * 10) / 10;
}

export const PointStepper: React.FC<PointStepperProps> = ({
  value,
  min,
  max,
  step = 0.1,
  onChange,
  disabled = false,
  formatValue,
  ariaLabelMinus = 'Уменьшить',
  ariaLabelPlus = 'Увеличить',
}) => {
  const roundedCurrent = roundTenths(value);
  const canDecrease = !disabled && roundedCurrent > roundTenths(min);
  const canIncrease = !disabled && roundedCurrent < roundTenths(max);

  const handleDecrease = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!canDecrease) return;
    const nextVal = Math.max(roundTenths(min), roundTenths(roundedCurrent - step));
    onChange(nextVal);
  };

  const handleIncrease = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!canIncrease) return;
    const nextVal = Math.min(roundTenths(max), roundTenths(roundedCurrent + step));
    onChange(nextVal);
  };

  const displayText = formatValue
    ? formatValue(roundedCurrent)
    : roundedCurrent > 0
    ? `+${roundedCurrent}`
    : `${roundedCurrent}`;

  return (
    <div className="inline-flex items-center bg-surface-1 border border-border-soft/80 rounded-xl p-0.5 select-none touch-manipulation">
      <button
        type="button"
        aria-label={ariaLabelMinus}
        disabled={!canDecrease}
        onClick={handleDecrease}
        onMouseDown={(e) => e.preventDefault()}
        className="w-11 h-11 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg bg-surface-2 text-text-primary hover:bg-surface-hover active:bg-surface-hover disabled:opacity-30 disabled:pointer-events-none transition-colors shrink-0"
      >
        <Minus className="w-4 h-4" />
      </button>

      <span className="px-2 text-center text-xs font-semibold text-text-primary min-w-[48px] tabular-nums truncate">
        {displayText}
      </span>

      <button
        type="button"
        aria-label={ariaLabelPlus}
        disabled={!canIncrease}
        onClick={handleIncrease}
        onMouseDown={(e) => e.preventDefault()}
        className="w-11 h-11 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg bg-surface-2 text-text-primary hover:bg-surface-hover active:bg-surface-hover disabled:opacity-30 disabled:pointer-events-none transition-colors shrink-0"
      >
        <Plus className="w-4 h-4" />
      </button>
    </div>
  );
};
