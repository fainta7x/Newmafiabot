export const PLAYER_TITLES = [
  { id: 'veteran', label: 'Ветеран стола', icon: '🎖️', hint: '25 сыгранных игр' },
  { id: 'red_wave', label: 'Красная волна', icon: '🔴', hint: '10 побед за красных' },
  { id: 'black_mark', label: 'Чёрная метка', icon: '⚫', hint: '10 побед за чёрных' },
  { id: 'sheriff_hunter', label: 'Охотник на мафию', icon: '⭐', hint: '5 побед Шерифом' },
  { id: 'iron_don', label: 'Железный Дон', icon: '🎩', hint: '3 победы Доном' },
  { id: 'universal', label: 'Универсал', icon: '🎭', hint: 'Победа каждой ролью' },
  { id: 'on_fire', label: 'На серии', icon: '🔥', hint: '5 побед подряд' },
] as const;

export type PlayerTitleId = typeof PLAYER_TITLES[number]['id'];
export type PlayerTitleMeta = typeof PLAYER_TITLES[number];

export const getPlayerTitleMeta = (value: unknown): PlayerTitleMeta | null => {
  const id = String(value || '').trim();
  return PLAYER_TITLES.find((title) => title.id === id) || null;
};
