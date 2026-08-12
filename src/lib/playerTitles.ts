export const PLAYER_TITLES = [
  { id: 'old_guard', label: 'Старая гвардия', icon: '🎖️', hint: '150 завершённых игр' },
  { id: 'godfather', label: 'Крёстный отец', icon: '🎩', hint: '20 игр Доном · 8 побед · серия 3' },
  { id: 'commissioner', label: 'Комиссар', icon: '⭐', hint: '25 игр Шерифом · 15 побед · серия 4' },
  { id: 'grey_cardinal', label: 'Серый кардинал', icon: '♠️', hint: '30 игр Мафией · 15 побед · серия 4' },
  { id: 'voice_of_city', label: 'Голос города', icon: '🔴', hint: '50 игр Мирным · 30 побед · серия 5' },
  { id: 'chameleon', label: 'Хамелеон', icon: '🎭', hint: '20 игр и 5 побед каждой ролью' },
  { id: 'unstoppable', label: 'Неостановимый', icon: '🔥', hint: '8 побед подряд' },
  { id: 'red_machine', label: 'Красная машина', icon: '❤️‍🔥', hint: '70 игр за красных · 45 побед' },
  { id: 'black_legend', label: 'Чёрная легенда', icon: '🖤', hint: '50 игр за чёрных · 25 побед' },
  { id: 'centurion', label: 'Сотник', icon: '💯', hint: '100 карьерных побед' },
  { id: 'four_faces', label: 'Четыре лица', icon: '🃏', hint: '10 побед каждой ролью' },
  { id: 'legend_2la', label: 'Легенда 2LA noire', icon: '👑', hint: '200 игр · 100 побед · 10 побед каждой ролью · серия 8' },
] as const;

export type PlayerTitleId = typeof PLAYER_TITLES[number]['id'];
export type PlayerTitleMeta = typeof PLAYER_TITLES[number];

export const getPlayerTitleMeta = (value: unknown): PlayerTitleMeta | null => {
  const id = String(value || '').trim();
  return PLAYER_TITLES.find((title) => title.id === id) || null;
};
