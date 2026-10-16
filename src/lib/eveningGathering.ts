import { normalizeEveningFormat } from './eveningFormat.ts';

/** People needed to gather a table, including its judge (not the number of playing seats). */
export const eveningGatheringSize = (format: unknown): number => normalizeEveningFormat(format) === 'NOVICE' ? 9 : 11;

/** Regular club evenings before novice evenings, then sporting/other events. */
export const eventPriority = (format: unknown): number => {
  const key = String(format || '').toUpperCase();
  if (['CASUAL', 'STANDARD'].includes(key)) return 0;
  if (key === 'NOVICE') return 1;
  if (['RATING', 'TOURNAMENT'].includes(key)) return 2;
  return 3;
};
