import type { AchievementDefinition } from './achievementCatalog';
export type StoryEvidence = { gameId: string | null; eventId?: string; date: string; detail: string };
export type StoryResult = { current: number; target?: number; evidence?: StoryEvidence; steps?: string[] };
const story = (id: string, name: string, description: string, category: AchievementDefinition['category'], rarity: AchievementDefinition['rarity'] = 'rare'): Omit<AchievementDefinition, 'order'> =>
  ({ id, name, description, category, rarity, metric: 'story', threshold: 1, icon: category === 'judge' ? '⚖️' : category === 'special' ? '🔎' : '🎭' });
export const ACHIEVEMENT_STORIES = [
  story('case_closed', 'Дело доведено', 'Мирным выставить чёрного, проголосовать за него при его заголосовании и выиграть. Без нулевого круга и решений «поднять / оставить».', 'roles'),
  story('last_argument', 'Последний аргумент', 'Мирным на тройке с одним чёрным проголосовать за него при заголосовании и обычной победе красных.', 'roles', 'epic'),
  story('two_shadows', 'Две тени', 'Красным ПУ назвать минимум двух чёрных среди трёх разных мест ЛХ.', 'special'),
  story('whole_picture', 'Вся картина', 'Красным ПУ назвать всю чёрную тройку в ЛХ.', 'special', 'legendary'),
  story('trail_remains', 'След остался', 'В ЛХ ПУ назвать минимум двух чёрных, которые затем заголосованы; красные выигрывают.', 'special', 'epic'),
  story('two_cases', 'Два дела раскрыты', 'Шерифом проверить двух разных чёрных в игровых ночах и выиграть.', 'roles', 'epic'),
  story('case_handed_over', 'Дело передано', 'Шерифом проверить чёрного до своего убийства; после твоей смерти его заголосовали и красные выиграли.', 'roles', 'epic'),
  story('alone_in_shadow', 'Один в тени', 'Остаться единственным живым чёрным против минимум двух красных и дожить до обычной победы.', 'roles', 'epic'),
  story('identity_found', 'Личность установлена', 'Доном проверить живого шерифа до его убийства и выиграть.', 'roles'),
  story('four_faces', 'Четыре лица', 'Выиграть каждой ролью: мирный, шериф, мафия и дон.', 'games'),
  story('full_shift', 'Полная смена', 'За один вечер выиграть минимум одну игру за красных и одну за чёрных.', 'games'),
  story('brought_to_game', 'Привёл в игру', 'Твой подтверждённый приглашённый завершил первую игру.', 'special'),
  story('own_company', 'Своя компания', 'Трое твоих подтверждённых приглашённых сыграли каждый на двух разных вечерах.', 'special', 'epic'),
  story('other_side_of_table', 'По другую сторону стола', 'Сыграть завершённую игру и провести завершённую игру назначенным судьёй.', 'judge'),
  story('full_judge_evening', 'Полный вечер', 'Провести судьёй все сыгранные игры закрытого вечера: минимум три, без незавершённых игр.', 'judge', 'epic'),
  story('first_distance', 'Первая дистанция', 'Сыграть каждую игру фактической дистанции завершённого турнира.', 'games'),
];
export const STORY_PATHS = [
  { id: 'citizen', name: 'Мирный', ids: ['case_closed','last_argument'] },
  { id: 'sheriff', name: 'Шериф', ids: ['two_cases','case_handed_over'] },
  { id: 'black', name: 'Чёрная игра', ids: ['identity_found','alone_in_shadow'] },
  { id: 'last_word', name: 'Последнее слово', ids: ['two_shadows','whole_picture','trail_remains'] },
  { id: 'versatility', name: 'Разносторонность', ids: ['four_faces','full_shift','first_distance'] },
  { id: 'club', name: 'Жизнь клуба', ids: ['brought_to_game','own_company','other_side_of_table','full_judge_evening'] },
];
export const STORY_IDS = new Set(ACHIEVEMENT_STORIES.map(a => a.id));
