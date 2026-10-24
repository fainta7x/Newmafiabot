import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

/**
 * Building blocks of the game protocol window, in the Player Cabinet language (docs/DESIGN_SYSTEM.md): dark neutral
 * surfaces (white at 3.5–8 %), white primary actions with dark text, colour only where it means something.
 */

export const cx = (...parts: Array<string | false | null | undefined>) => parts.filter(Boolean).join(' ');

export type Tone = 'neutral' | 'good' | 'warn' | 'bad' | 'info' | 'night';

const TONE_CHIP: Record<Tone, string> = {
  neutral: 'bg-white/[0.07] text-white/70',
  good: 'bg-emerald-300/[0.12] text-emerald-100',
  warn: 'bg-amber-300/[0.13] text-amber-100',
  bad: 'bg-rose-300/[0.13] text-rose-100',
  info: 'bg-sky-300/[0.12] text-sky-100',
  night: 'bg-violet-300/[0.13] text-violet-100',
};

const TONE_PANEL: Record<Tone, string> = {
  neutral: 'border-white/10 bg-white/[0.045]',
  good: 'border-emerald-300/20 bg-emerald-300/[0.07]',
  warn: 'border-amber-300/20 bg-amber-300/[0.07]',
  bad: 'border-rose-300/20 bg-rose-300/[0.07]',
  info: 'border-sky-300/20 bg-sky-300/[0.06]',
  night: 'border-violet-300/20 bg-violet-300/[0.06]',
};

export const Card: React.FC<{ tone?: Tone; className?: string; children: React.ReactNode; as?: 'section' | 'div'; testId?: string }> = ({ tone = 'neutral', className, children, as: Tag = 'section', testId }) => (
  <Tag data-testid={testId} className={cx('rounded-[24px] border p-4', TONE_PANEL[tone], className)}>{children}</Tag>
);

export const Eyebrow: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => (
  <div className={cx('text-[11px] font-semibold uppercase tracking-[0.14em] text-white/45', className)}>{children}</div>
);

export const Chip: React.FC<{ tone?: Tone; children: React.ReactNode; className?: string }> = ({ tone = 'neutral', children, className }) => (
  <span className={cx('inline-flex min-h-6 shrink-0 items-center gap-1 rounded-full px-2.5 py-0.5 text-[12px] font-medium', TONE_CHIP[tone], className)}>{children}</span>
);

type BtnKind = 'primary' | 'soft' | 'ghost' | 'danger';
const BTN: Record<BtnKind, string> = {
  primary: 'bg-white text-[#090a0d] hover:bg-white/90 disabled:bg-white/20 disabled:text-white/40',
  soft: 'bg-white/[0.07] text-white/80 hover:bg-white/[0.11] disabled:text-white/30',
  ghost: 'border border-white/10 bg-transparent text-white/70 hover:bg-white/[0.05] disabled:text-white/30',
  danger: 'border border-rose-300/25 bg-rose-300/[0.08] text-rose-100 hover:bg-rose-300/[0.13] disabled:text-rose-100/35',
};

export const Btn: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { kind?: BtnKind; big?: boolean; block?: boolean }> = ({ kind = 'soft', big, block, className, type = 'button', ...rest }) => (
  <button
    type={type}
    className={cx('inline-flex items-center justify-center gap-2 rounded-2xl px-4 text-sm font-semibold transition-colors disabled:cursor-not-allowed', big ? 'min-h-[52px] text-[15px]' : 'min-h-11', block && 'w-full', BTN[kind], className)}
    {...rest}
  />
);

/** A seat number in a rounded square; the border says which team the player is on when it is known. */
export const SeatBadge: React.FC<{ seat: number; team?: 'red' | 'black' | null; dim?: boolean; size?: 'sm' | 'md' }> = ({ seat, team, dim, size = 'md' }) => (
  <span
    className={cx(
      'inline-flex shrink-0 items-center justify-center rounded-xl border font-semibold tabular-nums',
      size === 'md' ? 'h-10 w-10 text-[15px]' : 'h-8 w-8 text-[13px]',
      team === 'red' ? 'border-rose-300/35 bg-rose-300/[0.10] text-rose-50' : team === 'black' ? 'border-white/20 bg-black/40 text-white/90' : 'border-white/12 bg-white/[0.06] text-white/85',
      dim && 'opacity-45',
    )}
  >
    {seat}
  </span>
);

export const Segmented: React.FC<{ value: string; options: Array<{ value: string; label: string; tone?: Tone }>; onChange: (value: string) => void; disabled?: boolean; label: string; cols?: number }> = ({ value, options, onChange, disabled, label, cols }) => (
  <div role="radiogroup" aria-label={label} className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${cols || options.length}, minmax(0, 1fr))` }}>
    {options.map((option) => {
      const on = option.value === value;
      return (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={on}
          disabled={disabled}
          onClick={() => onChange(option.value)}
          className={cx('min-h-11 rounded-xl px-2 text-[13px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60', on ? 'bg-white text-[#090a0d]' : 'bg-white/[0.06] text-white/70 hover:bg-white/[0.1]')}
        >
          {option.label}
        </button>
      );
    })}
  </div>
);

export const Stepper: React.FC<{ value: number | string; onMinus: () => void; onPlus: () => void; label: string; disabled?: boolean; minusDisabled?: boolean; plusDisabled?: boolean }> = ({ value, onMinus, onPlus, label, disabled, minusDisabled, plusDisabled }) => (
  <div role="group" aria-label={label} className="flex h-12 items-center justify-between rounded-2xl bg-black/25 px-1">
    <button type="button" aria-label={`${label}: меньше`} disabled={disabled || minusDisabled} onClick={onMinus} className="h-11 w-12 rounded-xl text-xl font-semibold text-white/80 hover:bg-white/[0.07] disabled:text-white/25">−</button>
    <span className="text-base font-semibold tabular-nums" aria-live="polite">{value}</span>
    <button type="button" aria-label={`${label}: больше`} disabled={disabled || plusDisabled} onClick={onPlus} className="h-11 w-12 rounded-xl text-xl font-semibold text-white/80 hover:bg-white/[0.07] disabled:text-white/25">+</button>
  </div>
);

/** Seat picker: ten numbered buttons, any subset or a limited one. */
export const SeatGrid: React.FC<{ selected: number[]; onToggle: (seat: number) => void; disabled?: boolean; label: string; tone?: Tone; max?: number; size?: number; hidden?: number[] }> = ({ selected, onToggle, disabled, label, tone = 'neutral', size = 10, hidden = [] }) => (
  <div role="group" aria-label={label} className="grid grid-cols-5 gap-1.5">
    {Array.from({ length: size }, (_, index) => index + 1).map((seat) => {
      const on = selected.includes(seat);
      const off = hidden.includes(seat);
      return (
        <button
          key={seat}
          type="button"
          aria-pressed={on}
          disabled={disabled || off}
          onClick={() => onToggle(seat)}
          className={cx(
            'min-h-11 rounded-xl text-sm font-semibold tabular-nums transition-colors disabled:cursor-not-allowed',
            on ? (tone === 'bad' ? 'bg-rose-200 text-[#2a0a12]' : tone === 'night' ? 'bg-violet-200 text-[#1d1238]' : 'bg-white text-[#090a0d]') : 'bg-white/[0.06] text-white/70 hover:bg-white/[0.1]',
            off && 'opacity-30',
          )}
        >
          {seat}
        </button>
      );
    })}
  </div>
);

/**
 * Sheet: a bottom sheet on a phone, a side panel on a desktop. Esc and the backdrop close it; focus moves into it and
 * returns to the opener.
 */
export const Sheet: React.FC<{ open: boolean; title: string; subtitle?: string; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode }> = ({ open, title, subtitle, onClose, children, footer }) => {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!open) return;
    openerRef.current = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.stopPropagation(); onClose(); } };
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      openerRef.current?.focus?.();
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[120] flex items-end justify-center lg:justify-end">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-[2px]" onClick={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative flex max-h-[88dvh] w-full max-w-[560px] flex-col rounded-t-[28px] border border-white/10 bg-[#111216] shadow-[0_-24px_80px_rgba(0,0,0,0.5)] outline-none lg:h-full lg:max-h-none lg:max-w-[440px] lg:rounded-none lg:rounded-l-[28px]"
      >
        <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-white/20 lg:hidden" aria-hidden="true" />
        <div className="flex shrink-0 items-start justify-between gap-3 px-5 pb-2 pt-3">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold leading-6">{title}</h2>
            {subtitle ? <p className="mt-0.5 text-[13px] leading-5 text-white/50">{subtitle}</p> : null}
          </div>
          <button type="button" aria-label="Закрыть" onClick={onClose} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/[0.06] text-white/70 hover:bg-white/[0.1]"><X className="h-5 w-5" aria-hidden="true" /></button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-4">{children}</div>
        <div className="shrink-0 border-t border-white/8 px-5 pb-[max(16px,env(safe-area-inset-bottom))] pt-3">
          {footer ?? <Btn kind="primary" big block onClick={onClose}>Готово</Btn>}
        </div>
      </div>
    </div>
  );
};
