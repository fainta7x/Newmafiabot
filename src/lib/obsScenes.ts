/**
 * Broadcast scenes agreed with the owner (2026-10-01). Create scenes with exactly these names in OBS;
 * the phone shows their buttons in this order, then any other scenes OBS has.
 */
export const OBS_RECOMMENDED_SCENES: Array<{ name: string; hint: string }> = [
  { name: 'Заставка', hint: 'Готовимся к игре' },
  { name: 'Стол', hint: 'Игровой стол и графика игры' },
  { name: 'Стол + комментаторы', hint: 'Стол и окошко комментаторской' },
  { name: 'Комментаторы', hint: 'Только комментаторская' },
  { name: 'Перерыв', hint: 'Пауза между играми' },
  { name: 'Итоги', hint: 'Таблица турнира' },
];

export const orderObsScenes = (scenes: string[]): Array<{ name: string; hint: string | null }> => {
  const known = OBS_RECOMMENDED_SCENES.filter((item) => scenes.includes(item.name));
  const others = scenes.filter((scene) => !OBS_RECOMMENDED_SCENES.some((item) => item.name === scene)).map((name) => ({ name, hint: null }));
  return [...known, ...others];
};
