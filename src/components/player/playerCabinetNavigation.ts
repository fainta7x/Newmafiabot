export type PlayerCabinetSection =
  | 'home'
  | 'learning'
  | 'events'
  | 'games'
  | 'stats'
  | 'career'
  | 'recaps'
  | 'rating'
  | 'elo'
  | 'ratingperiods'
  | 'ratingtournaments'
  | 'clubworld'
  | 'club'
  | 'wallet'
  | 'payments'
  | 'profile'
  | 'settings'
  | 'conduct'
  | 'more'
  | 'poker';

/*
 * The bottom menu (owner decision 2026-10-06): four places.
 * «Вечера» — upcoming evenings, past evenings and my games; «Сообщество» — rating, players, connections,
 * activity and the poker table; «Прогресс» — my own profile: statistics, awards, Elo path, «Обучение».
 * The wallet and the settings are icons in the header. Old addresses keep working: the sections stay,
 * only their grouping changed.
 */
export type PlayerCabinetNavId = 'home' | 'evenings' | 'community' | 'progress' | 'school';

export const PLAYER_CABINET_NAV: ReadonlyArray<{ id: PlayerCabinetNavId; label: string }> = [
  { id: 'home', label: 'Главная' },
  { id: 'evenings', label: 'Вечера' },
  { id: 'community', label: 'Сообщество' },
  { id: 'progress', label: 'Прогресс' },
  { id: 'school', label: 'Школа' },
];

/** The section a bottom-menu button opens. */
export const PLAYER_NAV_SECTION: Record<PlayerCabinetNavId, PlayerCabinetSection> = {
  home: 'home',
  evenings: 'events',
  community: 'rating',
  progress: 'profile',
  school: 'learning',
};

const EVENING_SECTIONS = new Set<PlayerCabinetSection>(['events', 'recaps', 'games']);
const GAME_SECTIONS = new Set<PlayerCabinetSection>(['games', 'recaps']);
const RATING_SECTIONS = new Set<PlayerCabinetSection>(['rating', 'ratingperiods', 'ratingtournaments']);
const COMMUNITY_SECTIONS = new Set<PlayerCabinetSection>(['rating', 'ratingperiods', 'ratingtournaments', 'club', 'clubworld']);

export const normalizePlayerCabinetSection = (section: PlayerCabinetSection): PlayerCabinetSection => {
  if (section === 'more') return 'club';
  if (section === 'payments') return 'wallet';
  // «Карьера» and «Статистика» are part of the one player profile now; old links, notifications and bookmarks land there.
  if (section === 'stats' || section === 'career' || section === 'elo') return 'profile';
  return section;
};

export const isPlayerEveningSection = (section: PlayerCabinetSection): boolean => EVENING_SECTIONS.has(section);

export const isPlayerGameSection = (section: PlayerCabinetSection): boolean => GAME_SECTIONS.has(section);

export const isPlayerRatingSection = (section: PlayerCabinetSection): boolean => RATING_SECTIONS.has(section);

export const isPlayerCommunitySection = (section: PlayerCabinetSection): boolean => COMMUNITY_SECTIONS.has(section);

export const isPlayerCabinetNavActive = (
  navId: PlayerCabinetNavId,
  section: PlayerCabinetSection,
): boolean => {
  const normalized = normalizePlayerCabinetSection(section);
  if (navId === 'evenings') return isPlayerEveningSection(normalized);
  if (navId === 'community') return isPlayerCommunitySection(normalized);
  if (navId === 'progress') return normalized === 'profile';
  if (navId === 'school') return normalized === 'learning';
  return normalized === navId;
};
