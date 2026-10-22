import { formatMoscowDate } from './moscowDate.ts';

/** Russian Moscow-time game date shown by the player game archive and detail.
 * Keep their shared null and invalid-input fallbacks unchanged.
 */
export const formatPlayerGameDate = (value: string | null | undefined): string =>
  formatMoscowDate(value, 'short', { empty: 'Дата не указана', invalidAsRaw: true });

/** The same Moscow date with the time («12 окт. 2026 г., 21:00»): the wallet and the judge's assignments show it. */
export const formatPlayerGameDateTime = (value: string | null | undefined): string =>
  formatMoscowDate(value, 'short-time', { empty: 'Дата не указана', invalidAsRaw: true });
