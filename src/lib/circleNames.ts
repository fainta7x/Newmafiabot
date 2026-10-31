/**
 * Official circle names (owner, 2026-10-26; BUSINESS_RULES «Names of the circles»): a circle is named by how many players sit at
 * the table, never by a day number. The protocol window adds qualifiers on top (`circleTitle` in `protocolReview.ts`).
 */
export const TABLE_NAMES: Record<number, string> = { 10: 'Десятка', 9: 'Девятка', 8: 'Восьмёрка', 7: 'Семёрка', 6: 'Шестёрка', 5: 'Пятёрка', 4: 'Угадайка при 4', 3: 'Угадайка' };

/** Circle name for the live game: `index` is 0 for the zero circle, `tableSize` the players alive at the start of the circle. */
export const circleNameByTableSize = (index: number, tableSize: number | null | undefined): string => {
  if (index <= 0) return 'Нулевой круг';
  return (tableSize != null && TABLE_NAMES[tableSize]) || `Круг ${index}`;
};
