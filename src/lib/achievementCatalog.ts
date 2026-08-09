export type AchievementCategoryId = 'games' | 'wins' | 'rating' | 'roles' | 'judge' | 'special';
export type AchievementRarity = 'common' | 'rare' | 'epic' | 'legendary';
export type AchievementMetric = 'games' | 'wins' | 'rating' | 'judged' | 'role' | 'pu' | 'perfect_game';

export interface AchievementCategoryDefinition {
  id: AchievementCategoryId;
  name: string;
  icon: string;
  order: number;
}

export interface AchievementDefinition {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: AchievementCategoryId;
  metric: AchievementMetric;
  threshold: number;
  role?: 'sheriff' | 'mafia' | 'don';
  rarity: AchievementRarity;
  order: number;
}

export const ACHIEVEMENT_CATEGORIES: AchievementCategoryDefinition[] = [
  { id: 'games', name: '🎮 Игровые', icon: '🎮', order: 1 },
  { id: 'wins', name: '🏆 Победные', icon: '🏆', order: 2 },
  { id: 'rating', name: '📊 Рейтинговые', icon: '📊', order: 3 },
  { id: 'roles', name: '🎭 Ролевые', icon: '🎭', order: 4 },
  { id: 'judge', name: '⚖️ Судейские', icon: '⚖️', order: 5 },
  { id: 'special', name: '✨ Особые', icon: '✨', order: 6 },
];

export const ACHIEVEMENT_RARITIES = {
  common: { name: 'Обычная', icon: '⚪' },
  rare: { name: 'Редкая', icon: '🔵' },
  epic: { name: 'Эпическая', icon: '🟣' },
  legendary: { name: 'Легендарная', icon: '🟡' },
} as const;

const raw: Array<Omit<AchievementDefinition, 'order'>> = [
  { id: 'first_game', name: 'Первая игра', description: 'Сыграть первую игру', icon: '🎭', category: 'games', metric: 'games', threshold: 1, rarity: 'common' },
  { id: 'ten_games', name: 'Новичок', description: 'Сыграть 10 игр', icon: '🌟', category: 'games', metric: 'games', threshold: 10, rarity: 'common' },
  { id: 'twenty_games', name: 'Любитель', description: 'Сыграть 20 игр', icon: '🎲', category: 'games', metric: 'games', threshold: 20, rarity: 'common' },
  { id: 'thirty_games', name: 'Завсегдатай', description: 'Сыграть 30 игр', icon: '🎯', category: 'games', metric: 'games', threshold: 30, rarity: 'rare' },
  { id: 'fifty_games', name: 'Опытный игрок', description: 'Сыграть 50 игр', icon: '⚡', category: 'games', metric: 'games', threshold: 50, rarity: 'rare' },
  { id: 'seventy_games', name: 'Профи', description: 'Сыграть 70 игр', icon: '🎓', category: 'games', metric: 'games', threshold: 70, rarity: 'epic' },
  { id: 'hundred_games', name: 'Ветеран', description: 'Сыграть 100 игр', icon: '🔥', category: 'games', metric: 'games', threshold: 100, rarity: 'epic' },
  { id: 'one_fifty_games', name: 'Мастер', description: 'Сыграть 150 игр', icon: '🏆', category: 'games', metric: 'games', threshold: 150, rarity: 'legendary' },
  { id: 'two_hundred_games', name: 'Легенда', description: 'Сыграть 200 игр', icon: '👑', category: 'games', metric: 'games', threshold: 200, rarity: 'legendary' },
  { id: 'first_win', name: 'Первая победа', description: 'Одержать первую победу', icon: '🏆', category: 'wins', metric: 'wins', threshold: 1, rarity: 'common' },
  { id: 'five_wins', name: 'Первые успехи', description: 'Одержать 5 побед', icon: '🌱', category: 'wins', metric: 'wins', threshold: 5, rarity: 'common' },
  { id: 'ten_wins', name: 'Серийный победитель', description: 'Одержать 10 побед', icon: '🎯', category: 'wins', metric: 'wins', threshold: 10, rarity: 'rare' },
  { id: 'twenty_wins', name: 'Закалка', description: 'Одержать 20 побед', icon: '⚔️', category: 'wins', metric: 'wins', threshold: 20, rarity: 'rare' },
  { id: 'thirty_wins', name: 'Победный дух', description: 'Одержать 30 побед', icon: '🎖️', category: 'wins', metric: 'wins', threshold: 30, rarity: 'rare' },
  { id: 'forty_wins', name: 'Покоритель', description: 'Одержать 40 побед', icon: '⭐', category: 'wins', metric: 'wins', threshold: 40, rarity: 'epic' },
  { id: 'fifty_wins', name: 'Мастер побед', description: 'Одержать 50 побед', icon: '🏅', category: 'wins', metric: 'wins', threshold: 50, rarity: 'epic' },
  { id: 'seventy_wins', name: 'Герой', description: 'Одержать 70 побед', icon: '🦸', category: 'wins', metric: 'wins', threshold: 70, rarity: 'epic' },
  { id: 'hundred_wins', name: 'Легенда побед', description: 'Одержать 100 побед', icon: '🏅', category: 'wins', metric: 'wins', threshold: 100, rarity: 'legendary' },
  { id: 'elo_1400', name: 'Начало пути', description: 'Достичь рейтинга Эло 1400', icon: '🌱', category: 'rating', metric: 'rating', threshold: 1400, rarity: 'common' },
  { id: 'elo_1500', name: 'Старт', description: 'Достичь рейтинга Эло 1500', icon: '🌱', category: 'rating', metric: 'rating', threshold: 1500, rarity: 'common' },
  { id: 'elo_1550', name: 'Бронзовый рейтинг', description: 'Достичь рейтинга Эло 1550', icon: '🥉', category: 'rating', metric: 'rating', threshold: 1550, rarity: 'rare' },
  { id: 'elo_1600', name: 'Серебряный рейтинг', description: 'Достичь рейтинга Эло 1600', icon: '⭐', category: 'rating', metric: 'rating', threshold: 1600, rarity: 'rare' },
  { id: 'elo_1650', name: 'Золотой рейтинг', description: 'Достичь рейтинга Эло 1650', icon: '⭐', category: 'rating', metric: 'rating', threshold: 1650, rarity: 'epic' },
  { id: 'elo_1700', name: 'Платиновый рейтинг', description: 'Достичь рейтинга Эло 1700', icon: '🏅', category: 'rating', metric: 'rating', threshold: 1700, rarity: 'epic' },
  { id: 'elo_1750', name: 'Алмазный рейтинг', description: 'Достичь рейтинга Эло 1750', icon: '💎', category: 'rating', metric: 'rating', threshold: 1750, rarity: 'legendary' },
  { id: 'elo_1800', name: 'Мастер Эло', description: 'Достичь рейтинга Эло 1800', icon: '💎', category: 'rating', metric: 'rating', threshold: 1800, rarity: 'legendary' },
  { id: 'elo_1900', name: 'Элитный рейтинг', description: 'Достичь рейтинга Эло 1900', icon: '👑', category: 'rating', metric: 'rating', threshold: 1900, rarity: 'legendary' },
  { id: 'first_judge', name: 'Первое свидание с правосудием', description: 'Отсудить первую игру', icon: '⚖️', category: 'judge', metric: 'judged', threshold: 1, rarity: 'common' },
  { id: 'five_judged', name: 'Стажёр', description: 'Отсудить 5 игр', icon: '📋', category: 'judge', metric: 'judged', threshold: 5, rarity: 'common' },
  { id: 'ten_judged', name: 'Судья', description: 'Отсудить 10 игр', icon: '👨‍⚖️', category: 'judge', metric: 'judged', threshold: 10, rarity: 'rare' },
  { id: 'twenty_judged', name: 'Мировой судья', description: 'Отсудить 20 игр', icon: '🏛️', category: 'judge', metric: 'judged', threshold: 20, rarity: 'epic' },
  { id: 'fifty_judged', name: 'Верховный судья', description: 'Отсудить 50 игр', icon: '⚖️👑', category: 'judge', metric: 'judged', threshold: 50, rarity: 'legendary' },
  { id: 'sheriff_win', name: 'Защитник города', description: 'Выиграть в роли Шерифа', icon: '🕵️', category: 'roles', metric: 'role', role: 'sheriff', threshold: 1, rarity: 'rare' },
  { id: 'mafia_win', name: 'Тень', description: 'Выиграть в роли Мафии', icon: '🔪', category: 'roles', metric: 'role', role: 'mafia', threshold: 1, rarity: 'rare' },
  { id: 'don_win', name: 'Крёстный отец', description: 'Выиграть в роли Дона', icon: '👑', category: 'roles', metric: 'role', role: 'don', threshold: 1, rarity: 'epic' },
  { id: 'pu_once', name: 'В центре внимания', description: 'Стать ПУ в первый раз', icon: '🎯', category: 'special', metric: 'pu', threshold: 1, rarity: 'common' },
  { id: 'pu_three', name: 'Частая цель', description: 'Стать ПУ 3 раза', icon: '🎪', category: 'special', metric: 'pu', threshold: 3, rarity: 'rare' },
  { id: 'pu_master', name: 'ПУ-мастер', description: 'Стать ПУ 5 раз', icon: '👑', category: 'special', metric: 'pu', threshold: 5, rarity: 'epic' },
  { id: 'pu_ten', name: 'Легендарная жертва', description: 'Стать ПУ 10 раз', icon: '🦁', category: 'special', metric: 'pu', threshold: 10, rarity: 'legendary' },
  { id: 'perfect_game', name: 'Идеальная игра', description: 'Закончить игру без фолов и техфолов', icon: '💎', category: 'special', metric: 'perfect_game', threshold: 1, rarity: 'epic' },
];

export const ACHIEVEMENTS: AchievementDefinition[] = raw.map((item, index) => ({ ...item, order: index + 1 }));
export const ACHIEVEMENT_ORDER = ACHIEVEMENTS.map((item) => item.id);
export const ACHIEVEMENT_BY_ID = new Map(ACHIEVEMENTS.map((item) => [item.id, item]));
