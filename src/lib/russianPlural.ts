/** Russian noun form for a count: 1 игра · 2 игры · 5 игр. */
export const russianPlural = (value: number, one: string, few: string, many: string): string => {
  const absoluteValue = Math.abs(Number(value || 0));
  if (!Number.isInteger(absoluteValue)) return few;
  const absolute = Math.trunc(absoluteValue);
  const mod100 = absolute % 100;
  const mod10 = absolute % 10;
  if (mod100 >= 11 && mod100 <= 14) return many;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
};

const count = (one: string, few: string, many: string) => (value: number | null | undefined) => {
  const n = Number(value || 0);
  return `${n} ${russianPlural(n, one, few, many)}`;
};

export const countGames = count('игра', 'игры', 'игр');
export const countPlayers = count('игрок', 'игрока', 'игроков');
export const countWins = count('победа', 'победы', 'побед');
export const countVisits = count('визит', 'визита', 'визитов');
