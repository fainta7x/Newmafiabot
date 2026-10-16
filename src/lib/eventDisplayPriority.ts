/** Presentation order only: club evenings before novice, then sporting formats. */
export const eventPriority = (format: unknown): number => {
  const key = String(format || '').toUpperCase();
  if (['CASUAL', 'STANDARD'].includes(key)) return 0;
  if (key === 'NOVICE') return 1;
  if (['RATING', 'TOURNAMENT'].includes(key)) return 2;
  return 3;
};
