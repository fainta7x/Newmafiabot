export type GameLevel = 'unrated' | 'novice' | 'club' | 'tournament';
export type ClubRole = 'guest' | 'member' | 'team' | 'organizer';
export type JudgeLevel = 'none' | 'trainee' | 'host' | 'judge';

export const GAME_LEVELS: Array<{ value: GameLevel; label: string; hint: string }> = [
  { value: 'unrated', label: 'Не определён', hint: 'Уровень игры ещё не оценён организатором' },
  { value: 'novice', label: 'Новичок', hint: 'Начальный уровень · новичковые игры' },
  { value: 'club', label: 'Опытный игрок', hint: 'Регулярные клубные игры' },
  { value: 'tournament', label: 'Турнирный игрок', hint: 'Рейтинговые игры и турниры' },
];

export const CLUB_ROLES: Array<{ value: ClubRole; label: string; hint: string }> = [
  { value: 'guest', label: 'Зарегистрированный игрок', hint: 'Играет эпизодически или представляет другой клуб; это полноценный аккаунт, не гостевой placeholder' },
  { value: 'member', label: 'Участник клуба', hint: 'Постоянный участник клуба' },
  { value: 'team', label: 'Команда клуба', hint: 'Входит в команду 2LA noire' },
  { value: 'organizer', label: 'Организатор клуба', hint: 'Организационная роль в клубе; сама по себе не открывает CRM' },
];

export const JUDGE_LEVELS: Array<{ value: JudgeLevel; label: string; hint: string }> = [
  { value: 'none', label: 'Нет', hint: 'Без полномочий ведущего' },
  { value: 'trainee', label: 'Стажёр', hint: 'Стажировка на ведение игр' },
  { value: 'host', label: 'Ведущий', hint: 'Может вести клубные игры' },
  { value: 'judge', label: 'Судья', hint: 'Полные судейские полномочия' },
];

export const normalizeGameLevel = (value: unknown): GameLevel =>
  value === 'unrated' || value === 'novice' || value === 'tournament' ? value : 'club';
export const normalizeClubRole = (value: unknown): ClubRole => value === 'guest' || value === 'team' || value === 'organizer' ? value : 'member';
export const normalizeJudgeLevel = (value: unknown): JudgeLevel => value === 'trainee' || value === 'host' || value === 'judge' ? value : 'none';

export const accessLabel = <T extends string>(items: Array<{ value: T; label: string }>, value: T) =>
  items.find((item) => item.value === value)?.label || value;
/*
 * Plain-language summary of a player's four independent statuses
 * (BUSINESS_RULES «Organizer player profile roles»): how they play, where
 * they are in the club, whether they belong to the organization, and access.
 * `club_role` answers two questions, so the UI splits it: guest/member is
 * membership («В клубе»), team/organizer is organization («Организация»).
 */
export type ClubMembership = 'guest' | 'member';
export type ClubOrganization = 'none' | 'team' | 'organizer';

export const CLUB_MEMBERSHIPS: Array<{ value: ClubMembership; label: string; hint: string }> = [
  { value: 'member', label: 'Участник клуба', hint: 'Постоянно играет в клубе' },
  { value: 'guest', label: 'Играет иногда', hint: 'Эпизодически или из другого клуба; полноценный аккаунт' },
];

export const CLUB_ORGANIZATION: Array<{ value: ClubOrganization; label: string; hint: string }> = [
  { value: 'none', label: 'Не входит', hint: 'Обычный игрок' },
  { value: 'team', label: 'Команда клуба', hint: 'Помогает проводить вечера' },
  { value: 'organizer', label: 'Организатор клуба', hint: 'Организационная роль; сама по себе не открывает CRM' },
];

export const membershipOf = (role: ClubRole): ClubMembership => (role === 'guest' ? 'guest' : 'member');
export const organizationOf = (role: ClubRole): ClubOrganization => (role === 'team' || role === 'organizer' ? role : 'none');
export const clubRoleFrom = (membership: ClubMembership, organization: ClubOrganization): ClubRole =>
  organization !== 'none' ? organization : membership;

const CLUB_STAGE_LABELS: Record<string, string> = {
  NEW: 'Первая заявка ещё не подтверждена',
  NOVICE_ACTIVE: 'Проходит путь новичка',
  NOVICE_COMPLETED: 'Прошёл путь новичка',
};

export const clubStageNote = (stage: unknown): string | null => CLUB_STAGE_LABELS[String(stage || '').toUpperCase()] || null;

export const organizationSummary = (role: ClubRole, judge: JudgeLevel): string => {
  const parts: string[] = [];
  const organization = organizationOf(role);
  if (organization !== 'none') parts.push(accessLabel(CLUB_ORGANIZATION, organization));
  if (judge !== 'none') parts.push(judge === 'trainee' ? 'Стажёр ведущего' : accessLabel(JUDGE_LEVELS, judge));
  return parts.length ? parts.join(' · ') : 'Не входит';
};
