import { normalizeEveningFormat } from './eveningFormat.ts';

/** People needed to gather a table, including its judge (not the number of playing seats). */
export const eveningGatheringSize = (format: unknown): number => normalizeEveningFormat(format) === 'NOVICE' ? 9 : 11;

/** Regular club/novice evenings first, then sporting events, then other formats. */
export const eventPriority = (format: unknown): number => {
  const key = String(format || '').toUpperCase();
  if (['NOVICE', 'CASUAL', 'STANDARD'].includes(key)) return 0;
  if (['RATING', 'TOURNAMENT'].includes(key)) return 1;
  return 2;
};
