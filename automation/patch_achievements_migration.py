from pathlib import Path

ROOT = Path('.')

def write(path: str, content: str):
    p = ROOT / path
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(content, encoding='utf-8')


def replace_once(path: str, old: str, new: str):
    p = ROOT / path
    text = p.read_text(encoding='utf-8')
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'{path}: expected exactly one match, got {count}: {old[:120]!r}')
    p.write_text(text.replace(old, new, 1), encoding='utf-8')

catalog = r'''export type AchievementCategoryId = 'games' | 'wins' | 'rating' | 'roles' | 'judge' | 'special';
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
'''
write('src/lib/achievementCatalog.ts', catalog)

service = r'''import {
  ACHIEVEMENT_BY_ID,
  ACHIEVEMENT_CATEGORIES,
  ACHIEVEMENT_RARITIES,
  ACHIEVEMENTS,
  type AchievementDefinition,
} from '../../lib/achievementCatalog.ts';

export interface AchievementStats {
  completedGames: number;
  wins: number;
  elo: number;
  judgedGames: number;
  puCount: number;
  perfectGames: number;
  roleWins: { sheriff: number; mafia: number; don: number };
}

export interface PlayerAchievementProfile {
  earned: number;
  total: number;
  percentage: number;
  categories: Array<{
    id: string;
    name: string;
    icon: string;
    order: number;
    earned: number;
    total: number;
    percentage: number;
    achievements: Array<{
      id: string;
      name: string;
      description: string;
      icon: string;
      rarity: string;
      rarity_name: string;
      rarity_icon: string;
      earned: boolean;
      earned_at: string | null;
      progress: { current: number; target: number } | null;
    }>;
  }>;
}

const safeJsonParse = <T>(value: unknown, fallback: T): T => {
  if (typeof value !== 'string' || !value.trim()) return fallback;
  try { return JSON.parse(value) as T; } catch { return fallback; }
};

const normalizeRole = (role: unknown): 'citizen' | 'sheriff' | 'mafia' | 'don' | null => {
  const value = String(role || '').trim().toLocaleLowerCase('ru-RU').replace(/ё/g, 'е');
  if (['citizen', 'мирный', 'мирный житель', 'red', 'красный'].includes(value)) return 'citizen';
  if (['sheriff', 'шериф'].includes(value)) return 'sheriff';
  if (['mafia', 'мафия', 'маф', 'black', 'черный', 'чёрный'].includes(value)) return 'mafia';
  if (['don', 'дон'].includes(value)) return 'don';
  return null;
};

const teamFromRole = (role: unknown): 'red' | 'black' | null => {
  const normalized = normalizeRole(role);
  if (normalized === 'mafia' || normalized === 'don') return 'black';
  if (normalized === 'citizen' || normalized === 'sheriff') return 'red';
  return null;
};

const normalizeWinner = (winner: unknown): 'red' | 'black' | null => {
  const value = String(winner || '').trim().toLocaleLowerCase('ru-RU').replace(/ё/g, 'е');
  if (['red', 'красные', 'красная', 'город'].includes(value)) return 'red';
  if (['black', 'черные', 'чёрные', 'черная', 'чёрная', 'мафия'].includes(value)) return 'black';
  return null;
};

const numberOrZero = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;

export const getAchievementMetricValue = (achievement: AchievementDefinition, stats: AchievementStats): number => {
  switch (achievement.metric) {
    case 'games': return stats.completedGames;
    case 'wins': return stats.wins;
    case 'rating': return stats.elo;
    case 'judged': return stats.judgedGames;
    case 'pu': return stats.puCount;
    case 'perfect_game': return stats.perfectGames;
    case 'role': return achievement.role ? stats.roleWins[achievement.role] : 0;
  }
};

export const qualifiesForAchievement = (achievement: AchievementDefinition, stats: AchievementStats) =>
  getAchievementMetricValue(achievement, stats) >= achievement.threshold;

const playerAchievementsTableExists = async (db: any) => Boolean(await db.get(
  "SELECT 1 AS ok FROM sqlite_master WHERE type='table' AND name='player_achievements'"
));

const legacyAchievementsTableExists = async (db: any) => Boolean(await db.get(
  "SELECT 1 AS ok FROM sqlite_master WHERE type='table' AND name='user_achievements'"
));

export const collectPlayerAchievementStats = async (db: any, playerId: string): Promise<AchievementStats> => {
  const player = await db.get('SELECT id, elo FROM players WHERE id = ?', [playerId]);
  if (!player) throw new Error('Player not found');

  const stats: AchievementStats = {
    completedGames: 0,
    wins: 0,
    elo: numberOrZero(player.elo),
    judgedGames: 0,
    puCount: 0,
    perfectGames: 0,
    roleWins: { sheriff: 0, mafia: 0, don: 0 },
  };

  const seenGames = new Set<string>();
  const clubRows = await db.all(`
    SELECT g.id, g.protocol_text, g.winner_team, e.status AS evening_status
      FROM games g
 LEFT JOIN game_evenings e ON e.id = g.evening_id
     WHERE g.archived_at IS NULL
       AND g.protocol_text IS NOT NULL
       AND (e.status IS NULL OR e.status != 'cancelled')
  `);

  for (const row of clubRows) {
    const payload = safeJsonParse<any>(row.protocol_text, null);
    if (!payload || payload.kind !== 'club_evening_protocol' || payload.protocol?.status !== 'completed') continue;
    if (!Array.isArray(payload.player_results)) continue;
    const result = payload.player_results.find((entry: any) => String(entry.player_id || '') === String(playerId));
    if (!result || !result.player_id) continue;
    const key = `club:${row.id}`;
    if (seenGames.has(key)) continue;
    seenGames.add(key);

    const winner = normalizeWinner(payload.protocol?.winner_team || row.winner_team);
    const role = normalizeRole(result.role);
    const team = teamFromRole(role);
    stats.completedGames += 1;
    if (winner && team && winner === team) {
      stats.wins += 1;
      if (role === 'sheriff' || role === 'mafia' || role === 'don') stats.roleWins[role] += 1;
    }
    if (String(payload.protocol?.first_killed_participant_id || '') === String(result.participant_id || '')) stats.puCount += 1;
    const technical = numberOrZero(result.technical_fouls) + numberOrZero(result.minor_technical_fouls) + numberOrZero(result.major_technical_fouls);
    if (numberOrZero(result.regular_fouls) === 0 && technical === 0) stats.perfectGames += 1;
  }

  const tournamentRows = await db.all(`
    SELECT tg.id AS game_id, tg.status AS game_status, tg.winner_team,
           t.status AS tournament_status, tgs.role, tp.id AS participant_id,
           tgpr.regular_fouls, tgpr.technical_fouls, tgpr.minor_technical_fouls, tgpr.major_technical_fouls,
           tgp.status AS protocol_status, tgp.first_killed_participant_id
      FROM tournament_participants tp
      JOIN tournaments t ON t.id = tp.tournament_id
      JOIN tournament_game_seats tgs ON tgs.participant_id = tp.id
      JOIN tournament_games tg ON tg.id = tgs.game_id
      JOIN tournament_game_protocols tgp ON tgp.game_id = tg.id
      JOIN tournament_game_player_results tgpr ON tgpr.game_id = tg.id AND tgpr.participant_id = tp.id
     WHERE tp.player_id = ? AND tg.status = 'completed' AND tgp.status = 'completed'
  `, [playerId]);

  for (const row of tournamentRows) {
    const key = `tournament:${row.game_id}`;
    if (seenGames.has(key)) continue;
    seenGames.add(key);
    const winner = normalizeWinner(row.winner_team);
    const role = normalizeRole(row.role);
    const team = teamFromRole(role);
    stats.completedGames += 1;
    if (winner && team && winner === team) {
      stats.wins += 1;
      if (role === 'sheriff' || role === 'mafia' || role === 'don') stats.roleWins[role] += 1;
    }
    if (String(row.first_killed_participant_id || '') === String(row.participant_id || '')) stats.puCount += 1;
    const technical = numberOrZero(row.technical_fouls) + numberOrZero(row.minor_technical_fouls) + numberOrZero(row.major_technical_fouls);
    if (numberOrZero(row.regular_fouls) === 0 && technical === 0) stats.perfectGames += 1;
  }

  // Judge milestones deliberately require stable UUID identity. judge_name text is never matched.
  const judgedClubRows = await db.all(`
    SELECT g.id, g.protocol_text, e.status AS evening_status
      FROM games g
 LEFT JOIN game_evenings e ON e.id = g.evening_id
     WHERE g.judge_player_id = ? AND g.archived_at IS NULL
       AND (e.status IS NULL OR e.status != 'cancelled')
  `, [playerId]);
  const judged = new Set<string>();
  for (const row of judgedClubRows) {
    const payload = safeJsonParse<any>(row.protocol_text, null);
    if (payload?.kind === 'club_evening_protocol' && payload.protocol?.status === 'completed') judged.add(`club:${row.id}`);
  }
  const judgedTournamentRows = await db.all(`
    SELECT tg.id
      FROM tournament_games tg
      JOIN tournament_game_protocols tgp ON tgp.game_id = tg.id
     WHERE tg.judge_player_id = ? AND tg.status = 'completed' AND tgp.status = 'completed'
  `, [playerId]);
  for (const row of judgedTournamentRows) judged.add(`tournament:${row.id}`);
  stats.judgedGames = judged.size;

  return stats;
};

export const importLegacyPlayerAchievements = async (db: any): Promise<number> => {
  if (!(await playerAchievementsTableExists(db)) || !(await legacyAchievementsTableExists(db))) return 0;
  const rows = await db.all(`
    SELECT p.id AS player_id, ua.user_id AS legacy_user_id, ua.achievement_id, ua.earned_at
      FROM user_achievements ua
      JOIN players p ON p.telegram_user_id = CAST(ua.user_id AS TEXT)
     WHERE ua.achievement_id IS NOT NULL AND TRIM(ua.achievement_id) != ''
  `);
  let inserted = 0;
  for (const row of rows) {
    const earnedAt = row.earned_at || new Date().toISOString();
    const result = await db.run(
      `INSERT OR IGNORE INTO player_achievements
       (id, player_id, achievement_id, earned_at, source, legacy_user_id, created_at)
       VALUES (?, ?, ?, ?, 'legacy', ?, ?)`,
      [`${row.player_id}:${row.achievement_id}`, row.player_id, row.achievement_id, earnedAt, String(row.legacy_user_id), earnedAt]
    );
    inserted += Number(result.changes || 0);
  }
  return inserted;
};

export const evaluatePlayerAchievements = async (db: any, playerId: string): Promise<string[]> => {
  const stats = await collectPlayerAchievementStats(db, playerId);
  const qualifying = ACHIEVEMENTS.filter((achievement) => qualifiesForAchievement(achievement, stats));
  if (!qualifying.length) return [];
  const now = new Date().toISOString();
  const newlyEarned: string[] = [];
  await db.transaction(async (tx: any) => {
    for (const achievement of qualifying) {
      const result = await tx.run(
        `INSERT OR IGNORE INTO player_achievements
         (id, player_id, achievement_id, earned_at, source, legacy_user_id, created_at)
         VALUES (?, ?, ?, ?, 'evaluator', NULL, ?)`,
        [`${playerId}:${achievement.id}`, playerId, achievement.id, now, now]
      );
      if (Number(result.changes || 0) > 0) newlyEarned.push(achievement.id);
    }
  });
  return newlyEarned;
};

export const evaluateAchievementsForPlayers = async (db: any, playerIds: Iterable<string>) => {
  const ids = [...new Set([...playerIds].map(String).filter(Boolean))];
  for (const playerId of ids) await evaluatePlayerAchievements(db, playerId);
};

export const reconcileAllPlayerAchievements = async (db: any) => {
  await importLegacyPlayerAchievements(db);
  const players = await db.all('SELECT id FROM players ORDER BY id');
  for (const player of players) await evaluatePlayerAchievements(db, String(player.id));
};

export const loadPlayerAchievementProfile = async (db: any, playerId: string, evaluate = true): Promise<PlayerAchievementProfile> => {
  if (evaluate) await evaluatePlayerAchievements(db, playerId);
  const stats = await collectPlayerAchievementStats(db, playerId);
  const earnedRows = await db.all('SELECT achievement_id, earned_at FROM player_achievements WHERE player_id = ?', [playerId]);
  const earnedMap = new Map<string, string | null>();
  for (const row of earnedRows) {
    if (ACHIEVEMENT_BY_ID.has(String(row.achievement_id))) earnedMap.set(String(row.achievement_id), row.earned_at || null);
  }

  const categories = ACHIEVEMENT_CATEGORIES
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((category) => {
      const definitions = ACHIEVEMENTS.filter((achievement) => achievement.category === category.id);
      const achievements = definitions.map((achievement) => {
        const rarity = ACHIEVEMENT_RARITIES[achievement.rarity];
        const earnedAt = earnedMap.get(achievement.id) || null;
        return {
          id: achievement.id,
          name: achievement.name,
          description: achievement.description,
          icon: achievement.icon,
          rarity: achievement.rarity,
          rarity_name: rarity.name,
          rarity_icon: rarity.icon,
          earned: earnedMap.has(achievement.id),
          earned_at: earnedAt,
          progress: { current: getAchievementMetricValue(achievement, stats), target: achievement.threshold },
        };
      });
      const earned = achievements.filter((achievement) => achievement.earned).length;
      return {
        ...category,
        earned,
        total: achievements.length,
        percentage: achievements.length ? Math.round((earned / achievements.length) * 100) : 0,
        achievements,
      };
    });
  const earned = earnedMap.size;
  return { earned, total: ACHIEVEMENTS.length, percentage: Math.round((earned / ACHIEVEMENTS.length) * 100), categories };
};
'''
write('src/server/services/playerAchievementsService.ts', service)

# Schema: stable judge identity and durable achievement persistence.
replace_once('src/db/schema.ts',
"  judge_name: text('judge_name'),\n  protocol_text: text('protocol_text'),",
"  judge_name: text('judge_name'),\n  judge_player_id: text('judge_player_id').references(() => players.id, { onDelete: 'set null' }),\n  protocol_text: text('protocol_text'),")
replace_once('src/db/schema.ts',
"  judge_name: text('judge_name'),\n  status: text('status').notNull().default('planned'), // planned, active, completed",
"  judge_name: text('judge_name'),\n  judge_player_id: text('judge_player_id').references(() => players.id, { onDelete: 'set null' }),\n  status: text('status').notNull().default('planned'), // planned, active, completed")
player_table_anchor = "export const gameEvenings = sqliteTable('game_evenings', {"
ach_table = r'''export const playerAchievements = sqliteTable('player_achievements', {
  id: text('id').primaryKey(),
  player_id: text('player_id').notNull().references(() => players.id, { onDelete: 'cascade' }),
  achievement_id: text('achievement_id').notNull(),
  earned_at: text('earned_at').notNull(),
  source: text('source').notNull().default('evaluator'), // evaluator, legacy
  legacy_user_id: text('legacy_user_id'),
  created_at: text('created_at').notNull(),
}, (table) => ({
  playerAchievementUnique: uniqueIndex('idx_player_achievement_unique').on(table.player_id, table.achievement_id),
}));

'''
replace_once('src/db/schema.ts', player_table_anchor, ach_table + player_table_anchor)

replace_once('src/db/index.ts',
"  addColumnIfNotExists('games', 'archived_at', 'TEXT');",
"  addColumnIfNotExists('games', 'archived_at', 'TEXT');\n  addColumnIfNotExists('games', 'judge_player_id', 'TEXT REFERENCES players(id) ON DELETE SET NULL');\n  addColumnIfNotExists('tournament_games', 'judge_player_id', 'TEXT REFERENCES players(id) ON DELETE SET NULL');")
replace_once('src/db/index.ts',
"  // Migrate legacy lifecycle_status values to contact_status without losing players",
r'''  try {
    dbWrapper.sqlite.exec(`
      CREATE TABLE IF NOT EXISTS player_achievements (
        id TEXT PRIMARY KEY,
        player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
        achievement_id TEXT NOT NULL,
        earned_at TEXT NOT NULL,
        source TEXT NOT NULL DEFAULT 'evaluator',
        legacy_user_id TEXT,
        created_at TEXT NOT NULL,
        UNIQUE(player_id, achievement_id)
      );
      CREATE INDEX IF NOT EXISTS idx_player_achievements_player ON player_achievements(player_id);
    `);
  } catch (e) {
    console.error('Failed to initialize player_achievements:', e);
  }

  // Migrate legacy lifecycle_status values to contact_status without losing players''')

# Player details response.
replace_once('src/server/routes/playersRoutes.ts',
"import { loadPlayerGameProfile } from '../services/playerProfileService.ts';",
"import { loadPlayerGameProfile } from '../services/playerProfileService.ts';\nimport { loadPlayerAchievementProfile } from '../services/playerAchievementsService.ts';")
replace_once('src/server/routes/playersRoutes.ts',
"    const gameProfile = await loadPlayerGameProfile(db, req.params.id);\n\n    res.json({",
"    const gameProfile = await loadPlayerGameProfile(db, req.params.id);\n    const achievements = await loadPlayerAchievementProfile(db, req.params.id);\n\n    res.json({")
replace_once('src/server/routes/playersRoutes.ts',
"      ...gameProfile,\n    });",
"      ...gameProfile,\n      achievements,\n    });")

# Bot protected readers.
bot = r'''import { Router } from 'express';
import { botServiceAuth } from '../botServiceAuth.ts';
import { loadPlayerAchievementProfile } from '../services/playerAchievementsService.ts';

const router = Router();
router.use(botServiceAuth);

router.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'mafia-webapp', api_version: '1' });
});

router.get('/players/:playerId/achievements', async (req, res) => {
  try {
    const db = (req as any).db;
    const player = await db.get('SELECT id, nickname, telegram_user_id FROM players WHERE id = ?', [req.params.playerId]);
    if (!player) return res.status(404).json({ error: 'Игрок не найден' });
    const achievements = await loadPlayerAchievementProfile(db, String(player.id));
    res.json({ player, achievements });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'Не удалось загрузить ачивки' });
  }
});

router.get('/players/by-telegram/:telegramUserId/achievements', async (req, res) => {
  try {
    const db = (req as any).db;
    const player = await db.get(
      'SELECT id, nickname, telegram_user_id FROM players WHERE telegram_user_id = ?',
      [String(req.params.telegramUserId)]
    );
    if (!player) return res.status(404).json({ error: 'Игрок не найден' });
    const achievements = await loadPlayerAchievementProfile(db, String(player.id));
    res.json({ player, achievements });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'Не удалось загрузить ачивки' });
  }
});

export default router;
'''
write('src/server/routes/botRoutes.ts', bot)

# Startup/backfill reconciliation.
replace_once('src/app.ts',
"import botRoutes from './server/routes/botRoutes.ts';",
"import botRoutes from './server/routes/botRoutes.ts';\nimport { reconcileAllPlayerAchievements } from './server/services/playerAchievementsService.ts';")
replace_once('src/app.ts',
"  const db = customDb || (await getDb());\n  app.use((req, _res, next) => {",
"  const db = customDb || (await getDb());\n  try {\n    await reconcileAllPlayerAchievements(db);\n  } catch (error) {\n    console.error('[ACHIEVEMENTS] Backfill reconciliation failed:', error);\n  }\n  app.use((req, _res, next) => {")

# Award after completed club game updates.
replace_once('src/server/routes/gamesRoutes.ts',
"import { createGameSchema } from '../validation.ts';",
"import { createGameSchema } from '../validation.ts';\nimport { evaluateAchievementsForPlayers } from '../services/playerAchievementsService.ts';")
replace_once('src/server/routes/gamesRoutes.ts',
"    const row = await db.get(\n      `SELECT g.*, et.name AS table_name\n         FROM games g\n    LEFT JOIN evening_tables et ON et.id = g.evening_table_id\n        WHERE g.id = ?`,\n      [gameId]\n    );\n    res.json(normalizeGame(row));\n  } catch (err: any) {\n    res.status(400).json({ error: err.message || 'Не удалось сохранить протокол' });",
"    if (status === 'completed') {\n      const achievementIds = incomingResults.map((item: any) => String(item.player_id || '')).filter(Boolean);\n      if (existing.judge_player_id) achievementIds.push(String(existing.judge_player_id));\n      await evaluateAchievementsForPlayers(db, achievementIds);\n    }\n\n    const row = await db.get(\n      `SELECT g.*, et.name AS table_name\n         FROM games g\n    LEFT JOIN evening_tables et ON et.id = g.evening_table_id\n        WHERE g.id = ?`,\n      [gameId]\n    );\n    res.json(normalizeGame(row));\n  } catch (err: any) {\n    res.status(400).json({ error: err.message || 'Не удалось сохранить протокол' });")

# Award after completed tournament game updates.
replace_once('src/server/routes/tournamentProtocolRoutes.ts',
"import { createPreviewCheckpoint } from '../../db/previewDatabaseCheckpoint.ts';",
"import { createPreviewCheckpoint } from '../../db/previewDatabaseCheckpoint.ts';\nimport { evaluateAchievementsForPlayers } from '../services/playerAchievementsService.ts';")
replace_once('src/server/routes/tournamentProtocolRoutes.ts',
"    // Fetch and return completed protocol\n    const savedProtocol = await db.get<any>('SELECT * FROM tournament_game_protocols WHERE game_id = ?', [gameId]);",
r'''    const achievementPlayers = await db.all<any>(`
      SELECT DISTINCT tp.player_id
        FROM tournament_game_seats tgs
        JOIN tournament_participants tp ON tp.id = tgs.participant_id
       WHERE tgs.game_id = ? AND tp.player_id IS NOT NULL
    `, [gameId]);
    const achievementPlayerIds = achievementPlayers.map((row: any) => String(row.player_id));
    if (game.judge_player_id) achievementPlayerIds.push(String(game.judge_player_id));
    await evaluateAchievementsForPlayers(db, achievementPlayerIds);

    // Fetch and return completed protocol
    const savedProtocol = await db.get<any>('SELECT * FROM tournament_game_protocols WHERE game_id = ?', [gameId]);''')

# API types.
api_anchor = "export interface PlayerDetails extends Player {"
api_types = r'''export interface PlayerAchievementItem {
  id: string;
  name: string;
  description: string;
  icon: string;
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
  rarity_name: string;
  rarity_icon: string;
  earned: boolean;
  earned_at: string | null;
  progress: { current: number; target: number } | null;
}

export interface PlayerAchievementCategory {
  id: string;
  name: string;
  icon: string;
  order: number;
  earned: number;
  total: number;
  percentage: number;
  achievements: PlayerAchievementItem[];
}

export interface PlayerAchievementProfile {
  earned: number;
  total: number;
  percentage: number;
  categories: PlayerAchievementCategory[];
}

'''
replace_once('src/lib/api.ts', api_anchor, api_types + api_anchor)
replace_once('src/lib/api.ts',
"  awardTournaments: PlayerAwardTournament[];\n}",
"  awardTournaments: PlayerAwardTournament[];\n  achievements?: PlayerAchievementProfile;\n}")

# Noir UI achievement section in the current profile only.
ui_anchor = '''      <section className="space-y-3 rounded-[18px] border border-border-soft bg-surface-1 p-3.5">\n        <div className="flex items-center justify-between gap-2">\n          <h3 className="flex items-center gap-2 text-[12px] font-black uppercase tracking-wider text-text-primary">\n            <Sparkles className="h-4 w-4 text-accent" /> Последние игры'''
ach_ui = r'''      {player.achievements ? (
        <section className="space-y-3 rounded-[18px] border border-accent/20 bg-surface-1 p-3.5" data-testid="player-achievements">
          <div className="flex items-end justify-between gap-3">
            <div>
              <h3 className="flex items-center gap-2 text-[12px] font-black uppercase tracking-wider text-text-primary">
                <Award className="h-4 w-4 text-accent" /> Ачивки
              </h3>
              <p className="mt-1 text-[11px] text-text-muted">40 достижений клуба · прогресс считается по завершённым играм</p>
            </div>
            <div className="shrink-0 text-right">
              <strong className="block text-[20px] tabular-nums text-text-primary">{player.achievements.earned} / {player.achievements.total}</strong>
              <span className="text-[10px] font-black text-accent">{player.achievements.percentage}%</span>
            </div>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
            <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${player.achievements.percentage}%` }} />
          </div>

          <div className="space-y-2">
            {player.achievements.categories.map((category, categoryIndex) => (
              <details key={category.id} className="group rounded-[14px] border border-border-soft bg-surface-2" open={categoryIndex === 0}>
                <summary className="flex min-h-[48px] cursor-pointer list-none items-center justify-between gap-3 px-3 py-2.5">
                  <span className="min-w-0 text-[12px] font-black text-text-primary">{category.name}</span>
                  <span className="shrink-0 text-[10px] font-bold tabular-nums text-text-secondary">{category.earned} / {category.total}</span>
                </summary>
                <div className="space-y-2 border-t border-border-soft p-2.5">
                  {category.achievements.map((achievement) => {
                    const progress = achievement.progress;
                    const pct = progress && progress.target > 0 ? Math.min(100, Math.round((progress.current / progress.target) * 100)) : 0;
                    return (
                      <article key={achievement.id} className={`rounded-[12px] border p-3 ${achievement.earned ? 'border-success/25 bg-success-soft' : 'border-border-soft bg-surface-1'}`}>
                        <div className="flex items-start gap-2.5">
                          <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] text-lg ${achievement.earned ? 'bg-success/10' : 'bg-surface-2 grayscale-[0.35]'}`}>{achievement.icon}</span>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                              <strong className={`text-[12px] ${achievement.earned ? 'text-text-primary' : 'text-text-secondary'}`}>{achievement.name}</strong>
                              <span className="text-[9px] font-black uppercase tracking-wide text-text-muted">{achievement.rarity_icon} {achievement.rarity_name}</span>
                              <span className={`ml-auto text-[9px] font-black uppercase ${achievement.earned ? 'text-success' : 'text-text-muted'}`}>{achievement.earned ? 'Получено' : 'Закрыто'}</span>
                            </div>
                            <p className="mt-1 text-[11px] leading-4 text-text-secondary">{achievement.description}</p>
                            {achievement.earned && achievement.earned_at ? (
                              <p className="mt-1.5 text-[10px] font-semibold text-success">Получено: {fmtDate(achievement.earned_at)}</p>
                            ) : null}
                            {progress ? (
                              <div className="mt-2">
                                <div className="mb-1 flex items-center justify-between text-[10px] text-text-muted">
                                  <span>Прогресс</span>
                                  <span className="font-bold tabular-nums text-text-secondary">{progress.current} / {progress.target}</span>
                                </div>
                                <div className="h-1 overflow-hidden rounded-full bg-surface-2">
                                  <div className={`h-full rounded-full ${achievement.earned ? 'bg-success' : 'bg-accent'}`} style={{ width: `${pct}%` }} />
                                </div>
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </details>
            ))}
          </div>
        </section>
      ) : null}

'''
replace_once('src/components/crm/PlayerProfileContent.tsx', ui_anchor, ach_ui + ui_anchor)

# Focused tests.
tests = r'''import { describe, expect, it } from 'vitest';
import { createDatabaseConnection } from '../db/index.ts';
import { ACHIEVEMENT_CATEGORIES, ACHIEVEMENT_ORDER, ACHIEVEMENTS } from '../lib/achievementCatalog.ts';
import {
  collectPlayerAchievementStats,
  evaluatePlayerAchievements,
  qualifiesForAchievement,
  type AchievementStats,
} from '../server/services/playerAchievementsService.ts';

const baseStats = (patch: Partial<AchievementStats> = {}): AchievementStats => ({
  completedGames: 0,
  wins: 0,
  elo: 1000,
  judgedGames: 0,
  puCount: 0,
  perfectGames: 0,
  roleWins: { sheriff: 0, mafia: 0, don: 0 },
  ...patch,
});
const byId = (id: string) => ACHIEVEMENTS.find((item) => item.id === id)!;

const addPlayer = async (db: any, id: string, nickname: string, elo = 1000, telegram: string | null = null) => {
  const now = '2026-08-09T12:00:00.000Z';
  await db.run('INSERT INTO players (id, telegram_user_id, nickname, contact_status, lifecycle_status, elo, tokens, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)', [id, telegram, nickname, 'normal', 'normal', elo, now, now]);
};

const addCompletedClubGame = async (db: any, playerId: string, options: { role?: string; winner?: 'red'|'black'; firstKilled?: boolean; regular?: number; tech?: number } = {}) => {
  const eveningId = `evening-${Math.random()}`;
  await db.run("INSERT INTO game_evenings (id,title,starts_at,timezone,format,status,capacity,default_price,created_at,updated_at) VALUES (?, 'Test', '2026-08-09T12:00:00Z', 'Europe/Moscow', 'STANDARD', 'completed', 10, 0, '2026-08-09', '2026-08-09')", [eveningId]);
  const participantId = `participant-${Math.random()}`;
  const role = options.role || 'sheriff';
  const winner = options.winner || 'red';
  const tech = options.tech || 0;
  const protocol = {
    version: 1,
    kind: 'club_evening_protocol',
    protocol: { status: 'completed', winner_team: winner, first_killed_participant_id: options.firstKilled ? participantId : null },
    player_results: [{ participant_id: participantId, player_id: playerId, seat_number: 1, role, regular_fouls: options.regular || 0, technical_fouls: tech, minor_technical_fouls: tech, major_technical_fouls: 0 }],
  };
  await db.run("INSERT INTO games (evening_id, global_game_number, game_date, winner_team, winner_label, protocol_text, slots_json, created_at) VALUES (?, 1, '2026-08-09', ?, 'done', ?, '[]', '2026-08-09')", [eveningId, winner, JSON.stringify(protocol)]);
};

describe('legacy achievement catalog', () => {
  it('keeps all 40 achievements and the legacy display order', () => {
    expect(ACHIEVEMENTS).toHaveLength(40);
    expect(ACHIEVEMENT_CATEGORIES.map((item) => item.id)).toEqual(['games','wins','rating','roles','judge','special']);
    expect(ACHIEVEMENT_ORDER).toEqual([
      'first_game','ten_games','twenty_games','thirty_games','fifty_games','seventy_games','hundred_games','one_fifty_games','two_hundred_games',
      'first_win','five_wins','ten_wins','twenty_wins','thirty_wins','forty_wins','fifty_wins','seventy_wins','hundred_wins',
      'elo_1400','elo_1500','elo_1550','elo_1600','elo_1650','elo_1700','elo_1750','elo_1800','elo_1900',
      'first_judge','five_judged','ten_judged','twenty_judged','fifty_judged','sheriff_win','mafia_win','don_win','pu_once','pu_three','pu_master','pu_ten','perfect_game'
    ]);
  });

  it('honours exact milestone boundaries, role wins, PU and perfect game', () => {
    expect(qualifiesForAchievement(byId('ten_games'), baseStats({ completedGames: 9 }))).toBe(false);
    expect(qualifiesForAchievement(byId('ten_games'), baseStats({ completedGames: 10 }))).toBe(true);
    expect(qualifiesForAchievement(byId('five_wins'), baseStats({ wins: 5 }))).toBe(true);
    expect(qualifiesForAchievement(byId('elo_1500'), baseStats({ elo: 1499 }))).toBe(false);
    expect(qualifiesForAchievement(byId('elo_1500'), baseStats({ elo: 1500 }))).toBe(true);
    expect(qualifiesForAchievement(byId('sheriff_win'), baseStats({ roleWins: { sheriff: 1, mafia: 0, don: 0 } }))).toBe(true);
    expect(qualifiesForAchievement(byId('mafia_win'), baseStats({ roleWins: { sheriff: 0, mafia: 1, don: 0 } }))).toBe(true);
    expect(qualifiesForAchievement(byId('don_win'), baseStats({ roleWins: { sheriff: 0, mafia: 0, don: 1 } }))).toBe(true);
    expect(qualifiesForAchievement(byId('pu_three'), baseStats({ puCount: 2 }))).toBe(false);
    expect(qualifiesForAchievement(byId('pu_three'), baseStats({ puCount: 3 }))).toBe(true);
    expect(qualifiesForAchievement(byId('perfect_game'), baseStats({ perfectGames: 1 }))).toBe(true);
  });
});

describe('canonical achievement evaluator', () => {
  it('derives PU, perfect game and role win from a completed canonical club protocol', async () => {
    const db = createDatabaseConnection(':memory:');
    await addPlayer(db, 'p1', 'Earned');
    await addCompletedClubGame(db, 'p1', { role: 'sheriff', winner: 'red', firstKilled: true, regular: 0, tech: 0 });
    const stats = await collectPlayerAchievementStats(db, 'p1');
    expect(stats.completedGames).toBe(1);
    expect(stats.wins).toBe(1);
    expect(stats.roleWins.sheriff).toBe(1);
    expect(stats.puCount).toBe(1);
    expect(stats.perfectGames).toBe(1);
    db.sqlite.close();
  });

  it('never guesses judged games from judge_name and counts stable judge_player_id only', async () => {
    const db = createDatabaseConnection(':memory:');
    await addPlayer(db, 'judge-1', 'Judge Nick');
    const eveningId = 'judge-evening';
    await db.run("INSERT INTO game_evenings (id,title,starts_at,timezone,format,status,capacity,default_price,created_at,updated_at) VALUES (?, 'Judge', '2026-08-09', 'Europe/Moscow', 'STANDARD', 'completed', 10, 0, '2026-08-09', '2026-08-09')", [eveningId]);
    const payload = JSON.stringify({ version:1, kind:'club_evening_protocol', protocol:{status:'completed',winner_team:'red'}, player_results:[] });
    const inserted = await db.run("INSERT INTO games (evening_id,global_game_number,game_date,winner_team,winner_label,judge_name,protocol_text,slots_json,created_at) VALUES (?,1,'2026-08-09','red','done','Judge Nick',?,'[]','2026-08-09')", [eveningId,payload]);
    expect((await collectPlayerAchievementStats(db, 'judge-1')).judgedGames).toBe(0);
    await db.run('UPDATE games SET judge_player_id = ? WHERE id = ?', ['judge-1', inserted.lastID]);
    expect((await collectPlayerAchievementStats(db, 'judge-1')).judgedGames).toBe(1);
    db.sqlite.close();
  });

  it('is idempotent and never removes already-earned achievements', async () => {
    const db = createDatabaseConnection(':memory:');
    await addPlayer(db, 'p2', 'Idempotent', 1500);
    const first = await evaluatePlayerAchievements(db, 'p2');
    const second = await evaluatePlayerAchievements(db, 'p2');
    expect(first).toEqual(expect.arrayContaining(['elo_1400', 'elo_1500']));
    expect(second).toEqual([]);
    const count = await db.get("SELECT COUNT(*) AS n FROM player_achievements WHERE player_id = 'p2'");
    expect(Number(count.n)).toBe(2);
    await db.run("UPDATE players SET elo = 1000 WHERE id = 'p2'");
    await evaluatePlayerAchievements(db, 'p2');
    const afterEdit = await db.get("SELECT COUNT(*) AS n FROM player_achievements WHERE player_id = 'p2'");
    expect(Number(afterEdit.n)).toBe(2);
    db.sqlite.close();
  });

  it('preserves legacy earned_at when a stable Telegram identity exists', async () => {
    const db = createDatabaseConnection(':memory:');
    await addPlayer(db, 'legacy-player', 'Legacy', 1000, '12345');
    await db.exec('CREATE TABLE user_achievements (user_id INTEGER, achievement_id TEXT, earned_at TEXT, PRIMARY KEY(user_id, achievement_id))');
    await db.run("INSERT INTO user_achievements (user_id,achievement_id,earned_at) VALUES (12345,'first_judge','2025-01-02T03:04:05Z')");
    const { importLegacyPlayerAchievements } = await import('../server/services/playerAchievementsService.ts');
    await importLegacyPlayerAchievements(db);
    const row = await db.get("SELECT achievement_id,earned_at,source FROM player_achievements WHERE player_id='legacy-player' AND achievement_id='first_judge'");
    expect(row).toMatchObject({ achievement_id:'first_judge', earned_at:'2025-01-02T03:04:05Z', source:'legacy' });
    db.sqlite.close();
  });
});
'''
write('src/tests/playerAchievements.test.ts', tests)

print('Achievement migration patch applied.')
