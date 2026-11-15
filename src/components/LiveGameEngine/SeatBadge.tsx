import type React from 'react';
import { SEAT_COLORS } from './seatColors.ts';

/** A seat number as the coloured badge it wears at the table (owner, 2026-10-27: «прям иконку с цветом»). */
export function SeatBadge({ seat, size = 'md' }: { seat: number; size?: 'xs' | 'sm' | 'md' | 'inline' }) {
  const color = SEAT_COLORS[seat];
  const style: React.CSSProperties = color
    ? { background: color.fill, borderColor: color.line, color: seat === 3 ? '#111827' : '#fff' }
    : {};
  // «inline» follows the font of the text around it (owner, 2026-11-15: seat numbers in the engine's texts are badges too).
  const box = size === 'inline' ? 'h-[1.45em] min-w-[1.45em] px-[0.2em] text-[0.85em] rounded-[0.35em] mx-[0.1em]' : size === 'xs' ? 'h-[17px] min-w-[17px] px-0.5 text-[11px] rounded-md' : size === 'sm' ? 'h-6 min-w-6 px-1 text-xs' : 'h-7 min-w-7 px-1.5 text-sm';
  return (
    <span data-seat-badge={seat} aria-label={size === 'inline' ? `#${seat}` : `№${seat}`} style={style} className={`inline-flex items-center justify-center rounded-lg border font-mono font-black leading-none align-middle ${box}`}>
      {size === 'inline' ? <span className="sr-only">#</span> : null}{seat}
    </span>
  );
}

/**
 * Owner, 2026-11-15: wherever the engine writes a seat as text («Речь #3», «Выстрел в #5», «Поднять #2 и #3?»), it shows the
 * seat's coloured badge instead. Plain strings keep working; toasts and logs to copy stay text.
 */
export function withSeatBadges(text: React.ReactNode): React.ReactNode {
  if (typeof text !== 'string' || !text.includes('#')) return text;
  const parts = text.split(/#(\d{1,2})(?!\d)/);
  if (parts.length === 1) return text;
  return parts.map((part, index) => (index % 2 === 1 && Number(part) >= 1 && Number(part) <= 10
    ? <SeatBadge key={index} seat={Number(part)} size="inline" />
    : part ? <span key={index}>{index % 2 === 1 ? `#${part}` : part}</span> : null));
}
