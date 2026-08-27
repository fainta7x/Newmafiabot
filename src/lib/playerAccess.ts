export type GameLevel = 'novice' | 'club' | 'tournament';
export type ClubRole = 'guest' | 'member' | 'team' | 'organizer';
export type JudgeLevel = 'none' | 'trainee' | 'host' | 'judge';

export const GAME_LEVELS: Array<{ value: GameLevel; label: string; hint: string }> = [
  { value: 'novice', label: 'Новичок', hint: 'Школа и новичковые игры' },
  { value: 'club', label: 'Игрок клуба', hint: 'Обычные клубные игры' },
  { value: 'tournament', label: 'Турнирный игрок', hint: 'Рейтинговые игры и турниры' },
];

export const CLUB_ROLES: Array<{ value: ClubRole; label: string; hint: string }> = [
  { value: 'guest', label: 'Гость', hint: 'Не входит в постоянный состав клуба' },
  { value: 'member', label: 'Участник клуба', hint: 'Постоянный участник клуба' },
  { value: 'team', label: 'Команда клуба', hint: 'Входит в команду 2LA noire' },
  { value: 'organizer', label: 'Организатор', hint: 'Организует вечера · без оплаты за игры' },
];

export const JUDGE_LEVELS: Array<{ value: JudgeLevel; label: string; hint: string }> = [
  { value: 'none', label: 'Нет', hint: 'Без полномочий ведущего' },
  { value: 'trainee', label: 'Стажёр', hint: 'Стажировка на ведение игр' },
  { value: 'host', label: 'Ведущий', hint: 'Ведёт клубные игры · без оплаты за игры' },
  { value: 'judge', label: 'Судья', hint: 'Полные судейские полномочия · без оплаты за игры' },
];

export const normalizeGameLevel = (value: unknown): GameLevel => value === 'novice' || value === 'tournament' ? value : 'club';
export const normalizeClubRole = (value: unknown): ClubRole => value === 'guest' || value === 'team' || value === 'organizer' ? value : 'member';
export const normalizeJudgeLevel = (value: unknown): JudgeLevel => value === 'trainee' || value === 'host' || value === 'judge' ? value : 'none';

export const accessLabel = <T extends string>(items: Array<{ value: T; label: string }>, value: T) =>
  items.find((item) => item.value === value)?.label || value;
