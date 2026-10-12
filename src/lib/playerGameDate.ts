/** Russian Moscow-time game date shown by the player game archive and detail.
 * Keep their shared null and invalid-input fallbacks unchanged.
 */
export const formatPlayerGameDate = (value: string | null | undefined): string => {
  if (!value) return 'Дата не указана';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'Europe/Moscow',
  }).format(date);
};

/** The same Moscow date with the time («12 окт. 2026 г., 21:00»): the wallet and the judge's assignments show it. */
export const formatPlayerGameDateTime = (value: string | null | undefined): string => {
  if (!value) return 'Дата не указана';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Moscow',
  }).format(date);
};
