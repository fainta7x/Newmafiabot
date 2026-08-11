import {
  ACHIEVEMENT_CATEGORIES,
  ACHIEVEMENT_RARITIES,
  ACHIEVEMENTS,
  type AchievementCategoryId,
  type AchievementDefinition,
  type AchievementMetric,
  type AchievementRarity,
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
const VALID_CATEGORIES = new Set<AchievementCategoryId>(['games', 'wins', 'rating', 'roles', 'judge', 'special']);
const VALID_METRICS = new Set<AchievementMetric>(['games', 'wins', 'rating', 'judged', 'role', 'pu', 'perfect_game']);
const VALID_RARITIES = new Set<AchievementRarity>(['common', 'rare', 'epic', 'legendary']);

const achievementDefinitionsTableExists = async (db: any) => Boolean(await db.get(
  "SELECT 1 AS ok FROM sqlite_master WHERE type='table' AND name='achievement_definitions'"
));

export const loadAchievementDefinitions = async (db: any, includeInactive = false): Promise<AchievementDefinition[]> => {
  if (!(await achievementDefinitionsTableExists(db))) return ACHIEVEMENTS.slice();
  const rows = await db.all(`
    SELECT id, name, description, icon, category, metric, threshold, role, rarity, sort_order, active
      FROM achievement_definitions
     ${includeInactive ? '' : 'WHERE active = 1'}
     ORDER BY sort_order ASC, id ASC
  `);
  if (!rows.length && !includeInactive) return [];
  return rows.flatMap((row: any) => {
    const fallback = ACHIEVEMENTS.find((item) => item.id === String(row.id));
    const category = VALID_CATEGORIES.has(row.category as AchievementCategoryId) ? row.category as AchievementCategoryId : fallback?.category;
    const metric = VALID_METRICS.has(row.metric as AchievementMetric) ? row.metric as AchievementMetric : fallback?.metric;
    const rarity = VALID_RARITIES.has(row.rarity as AchievementRarity) ? row.rarity as AchievementRarity : fallback?.rarity;
    if (!category || !metric || !rarity) return [];
    const role = ['sheriff', 'mafia', 'don'].includes(String(row.role || '')) ? row.role as 'sheriff' | 'mafia' | 'don' : undefined;
    return [{
      id: String(row.id),
      name: String(row.name || fallback?.name || row.id),
      description: String(row.description || fallback?.description || ''),
      icon: String(row.icon || fallback?.icon || '🏅'),
      category,
      metric,
      threshold: Number.isFinite(Number(row.threshold)) ? Number(row.threshold) : Number(fallback?.threshold || 1),
      role,
      rarity,
      order: Number.isFinite(Number(row.sort_order)) ? Number(row.sort_order) : Number(fallback?.order || 0),
    }];
  });
};

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
  const [stats, definitions, overrideRows] = await Promise.all([
    collectPlayerAchievementStats(db, playerId),
    loadAchievementDefinitions(db),
    db.all('SELECT achievement_id, state FROM player_achievement_overrides WHERE player_id = ?', [playerId]),
  ]);
  const overrides = new Map(overrideRows.map((row: any) => [String(row.achievement_id), String(row.state)]));
  const qualifying = definitions.filter((achievement) => overrides.get(achievement.id) !== 'revoke' && qualifiesForAchievement(achievement, stats));
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
  const [stats, definitions, earnedRows, overrideRows] = await Promise.all([
    collectPlayerAchievementStats(db, playerId),
    loadAchievementDefinitions(db),
    db.all('SELECT achievement_id, earned_at FROM player_achievements WHERE player_id = ?', [playerId]),
    db.all('SELECT achievement_id, state FROM player_achievement_overrides WHERE player_id = ?', [playerId]),
  ]);
  const definitionIds = new Set(definitions.map((item) => item.id));
  const earnedMap = new Map<string, string | null>();
  for (const row of earnedRows) {
    if (definitionIds.has(String(row.achievement_id))) earnedMap.set(String(row.achievement_id), row.earned_at || null);
  }
  const overrides = new Map(overrideRows.map((row: any) => [String(row.achievement_id), String(row.state)]));

  const categories = ACHIEVEMENT_CATEGORIES
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((category) => {
      const categoryDefinitions = definitions.filter((achievement) => achievement.category === category.id).sort((a, b) => a.order - b.order);
      const achievements = categoryDefinitions.map((achievement) => {
        const rarity = ACHIEVEMENT_RARITIES[achievement.rarity];
        const override = overrides.get(achievement.id);
        const isEarned = override === 'grant' || (override !== 'revoke' && earnedMap.has(achievement.id));
        const earnedAt = isEarned ? earnedMap.get(achievement.id) || null : null;
        return {
          id: achievement.id,
          name: achievement.name,
          description: achievement.description,
          icon: achievement.icon,
          rarity: achievement.rarity,
          rarity_name: rarity.name,
          rarity_icon: rarity.icon,
          earned: isEarned,
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
    })
    .filter((category) => category.total > 0);
  const earned = categories.reduce((sum, category) => sum + category.earned, 0);
  const total = definitions.length;
  return { earned, total, percentage: total ? Math.round((earned / total) * 100) : 0, categories };
};
