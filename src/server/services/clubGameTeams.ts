export type ClubGameTeam = 'red' | 'black';

const normalizeToken = (value: unknown): string => String(value || '').trim().toLocaleLowerCase('ru-RU').replace(/ё/g, 'е');

/** Team of a stored role label; shared by the Elo and token calculations, so their alias lists cannot drift apart. */
export const teamFromRoleAlias = (role: unknown): ClubGameTeam | null => {
  const value = normalizeToken(role);
  if (['citizen', 'мирный', 'мирный житель', 'red', 'красный', 'sheriff', 'шериф'].includes(value)) return 'red';
  if (['mafia', 'мафия', 'маф', 'black', 'черный', 'don', 'дон'].includes(value)) return 'black';
  return null;
};

/** Winning team of a stored result label. */
export const winnerTeamFromLabel = (value: unknown): ClubGameTeam | null => {
  const normalized = normalizeToken(value);
  if (['red', 'красные', 'красная', 'город'].includes(normalized)) return 'red';
  if (['black', 'черные', 'черная', 'мафия'].includes(normalized)) return 'black';
  return null;
};
