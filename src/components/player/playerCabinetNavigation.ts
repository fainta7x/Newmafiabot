export type PlayerCabinetSection =
  | 'home'
  | 'events'
  | 'games'
  | 'stats'
  | 'career'
  | 'recaps'
  | 'rating'
  | 'elo'
  | 'ratingperiods'
  | 'clubworld'
  | 'club'
  | 'wallet'
  | 'payments'
  | 'profile'
  | 'conduct'
  | 'more';

export type PlayerCabinetNavId = 'home' | 'events' | 'games' | 'rating' | 'club';

export const PLAYER_CABINET_NAV: ReadonlyArray<{ id: PlayerCabinetNavId; icon: string; label: string }> = [
  { id: 'home', icon: '⌂', label: 'Главная' },
  { id: 'events', icon: '▣', label: 'События' },
  { id: 'games', icon: '◫', label: 'Игры' },
  { id: 'rating', icon: '★', label: 'Рейтинг' },
  { id: 'club', icon: '◆', label: 'Клуб' },
];

const GAME_SECTIONS = new Set<PlayerCabinetSection>(['games', 'stats', 'career', 'recaps']);
const RATING_SECTIONS = new Set<PlayerCabinetSection>(['rating', 'elo', 'ratingperiods', 'clubworld']);

export const normalizePlayerCabinetSection = (section: PlayerCabinetSection): PlayerCabinetSection => {
  if (section === 'more') return 'club';
  if (section === 'payments') return 'wallet';
  return section;
};

export const isPlayerGameSection = (section: PlayerCabinetSection): boolean => GAME_SECTIONS.has(section);

export const isPlayerRatingSection = (section: PlayerCabinetSection): boolean => RATING_SECTIONS.has(section);

export const isPlayerCabinetNavActive = (
  navId: PlayerCabinetNavId,
  section: PlayerCabinetSection,
): boolean => {
  const normalized = normalizePlayerCabinetSection(section);
  if (navId === 'games') return isPlayerGameSection(normalized);
  if (navId === 'rating') return isPlayerRatingSection(normalized);
  return normalized === navId;
};
