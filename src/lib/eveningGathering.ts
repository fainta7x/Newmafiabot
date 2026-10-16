import { normalizeEveningFormat } from './eveningFormat.ts';

/** People needed to gather a table, including its judge (not the number of playing seats). */
export const eveningGatheringSize = (format: unknown): number => normalizeEveningFormat(format) === 'NOVICE' ? 9 : 11;

/** Backwards-compatible import; display ordering lives in its own UI-only module. */
export { eventPriority } from './eventDisplayPriority.ts';
