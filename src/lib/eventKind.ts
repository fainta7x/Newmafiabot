export type EventKind = 'NOVICE' | 'CASUAL' | 'RATING' | 'TOURNAMENT';

/** One colour per evening format, the same in the calendar and on «Сегодня» (owner, 2026-10-13). */
export const kindOfFormat = (format: string): EventKind => {
  const value = String(format || '').toUpperCase();
  if (value.includes('NOV')) return 'NOVICE';
  if (value.includes('RAT')) return 'RATING';
  if (value.includes('TOUR')) return 'TOURNAMENT';
  return 'CASUAL';
};

/** Tinted chip: border, background and text. */
export const kindTone = (kind: EventKind) => {
  if (kind === 'NOVICE') return 'border-sky-300/15 bg-sky-300/[0.09] text-sky-100';
  if (kind === 'RATING') return 'border-amber-200/15 bg-amber-200/[0.09] text-amber-100';
  if (kind === 'TOURNAMENT') return 'border-violet-200/15 bg-violet-300/[0.09] text-violet-100';
  return 'border-emerald-200/15 bg-emerald-300/[0.09] text-emerald-100';
};

/** A coloured stripe on the left edge of a list row plus a faint tint of the same colour. */
export const kindRow = (kind: EventKind) => {
  if (kind === 'NOVICE') return 'border-l-[4px] border-l-sky-300 bg-sky-300/[0.07]';
  if (kind === 'RATING') return 'border-l-[4px] border-l-amber-300 bg-amber-300/[0.07]';
  if (kind === 'TOURNAMENT') return 'border-l-[4px] border-l-violet-300 bg-violet-300/[0.08]';
  return 'border-l-[4px] border-l-emerald-300 bg-emerald-300/[0.07]';
};

export const kindLabel = (kind: EventKind) => kind === 'NOVICE' ? 'Новички' : kind === 'RATING' ? 'Рейтинг' : kind === 'TOURNAMENT' ? 'Турнир' : 'Клубный';
