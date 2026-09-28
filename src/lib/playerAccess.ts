export type GameLevel = 'unrated' | 'novice' | 'club' | 'tournament';
export type ClubRole = 'guest' | 'member' | 'team' | 'organizer';
export type JudgeLevel = 'none' | 'trainee' | 'host' | 'judge';

// Labels are plain words; each hint says what the choice changes in the app and the bot.
export const GAME_LEVELS: Array<{ value: GameLevel; label: string; hint: string }> = [
  { value: 'novice', label: 'Новичок', hint: 'Зовём только на вечера для новичков · так начинает каждый новый игрок' },
  { value: 'club', label: 'Играет в клубе', hint: 'Клубные вечера и вечера для новичков · в боте полное меню клуба' },
  { value: 'tournament', label: 'Турнирный игрок', hint: 'Клубные, рейтинговые вечера и турниры · в боте полное меню клуба' },
];

export const CLUB_ROLES: Array<{ value: ClubRole; label: string; hint: string }> = [
  { value: 'guest', label: 'Ходит иногда', hint: 'Играет время от времени или из другого клуба' },
  { value: 'member', label: 'Ходит постоянно', hint: 'Постоянный игрок клуба' },
  { value: 'team', label: 'Помогает клубу', hint: 'Команда клуба: помогает проводить вечера' },
  { value: 'organizer', label: 'Организатор', hint: 'Можно назначить организатором вечера или турнира' },
];

export const JUDGE_LEVELS: Array<{ value: JudgeLevel; label: string; hint: string }> = [
  { value: 'none', label: 'Не ведёт', hint: 'Не ведёт игры' },
  { value: 'trainee', label: 'Учится вести', hint: 'Может вести вечера для новичков' },
  { value: 'host', label: 'Ведущий', hint: 'Может вести вечера для новичков и клубные' },
  { value: 'judge', label: 'Судья', hint: 'Может вести любые игры, включая рейтинг и турниры' },
];

// «unrated» is a retired legacy value and reads as «Новичок».
export const normalizeGameLevel = (value: unknown): GameLevel =>
  value === 'unrated' || value === 'novice' ? 'novice' : value === 'tournament' ? 'tournament' : 'club';
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
  { value: 'member', label: 'Ходит постоянно', hint: 'Получает анонсы и приглашения' },
  { value: 'guest', label: 'Ходит иногда', hint: 'Получает анонсы и приглашения' },
];

export const CLUB_ORGANIZATION: Array<{ value: ClubOrganization; label: string; hint: string }> = [
  { value: 'none', label: 'Просто игрок', hint: 'Обычный игрок клуба' },
  { value: 'team', label: 'Помогает клубу', hint: 'Команда клуба: помогает проводить вечера' },
  { value: 'organizer', label: 'Организатор', hint: 'Можно назначить организатором вечера или турнира · кабинет не открывает' },
];

/*
 * «Как часто ходит» on the bulk screen: the two membership answers plus «Перестал ходить».
 * «Перестал ходить» pauses announcements and invitations (contact_status=paused with STOPPED_REASON);
 * choosing «постоянно» or «иногда» again turns them back on.
 */
export type PlayerActivity = 'regular' | 'sometimes' | 'stopped';
export const STOPPED_REASON = 'Перестал ходить';
export const PLAYER_ACTIVITY: Array<{ value: PlayerActivity; label: string; hint: string }> = [
  { value: 'regular', label: 'Ходит постоянно', hint: 'Получает анонсы и приглашения' },
  { value: 'sometimes', label: 'Ходит иногда', hint: 'Получает анонсы и приглашения' },
  { value: 'stopped', label: 'Перестал ходить', hint: 'Бот не пишет ему лично: ни анонсов, ни приглашений' },
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
  if (judge !== 'none') parts.push(accessLabel(JUDGE_LEVELS, judge));
  return parts.length ? parts.join(' · ') : 'Просто игрок';
};
