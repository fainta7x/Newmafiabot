/** Russian Moscow-time game date shown by the player game archive and detail.
 * Keep their shared null and invalid-input fallbacks unchanged.
 */
export const formatPlayerGameDate = (value: string | null): string => {
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
