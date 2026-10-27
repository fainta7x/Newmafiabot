import type React from 'react';
import { SEAT_COLORS } from './seatColors.ts';

/** A seat number as the coloured badge it wears at the table (owner, 2026-10-27: «прям иконку с цветом»). */
export function SeatBadge({ seat, size = 'md' }: { seat: number; size?: 'sm' | 'md' }) {
  const color = SEAT_COLORS[seat];
  const style: React.CSSProperties = color
    ? { background: color.fill, borderColor: color.line, color: seat === 3 ? '#111827' : '#fff' }
    : {};
  const box = size === 'sm' ? 'h-6 min-w-6 px-1 text-xs' : 'h-7 min-w-7 px-1.5 text-sm';
  return (
    <span data-seat-badge={seat} aria-label={`№${seat}`} style={style} className={`inline-flex items-center justify-center rounded-lg border font-mono font-black leading-none align-middle ${box}`}>
      {seat}
    </span>
  );
}
