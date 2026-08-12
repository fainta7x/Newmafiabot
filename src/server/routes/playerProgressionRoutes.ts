import { Router } from 'express';
import { PLAYER_TITLES, type PlayerTitleId } from '../../lib/playerTitles.ts';
import { getPlayerSessionId } from '../auth.ts';
import { loadCompletedGameSnapshots, type AnalyticsPlayerResult } from '../services/clubGameAnalyticsService.ts';

const router = Router();
const ROLES = ['citizen', 'sheriff', 'mafia', 'don'] as const;
type Role = typeof ROLES[number];
type Rarity = 'common' | 'rare' | 'epic' | 'legendary';
type AchievementCategory = 'career' | 'wins' | 'form' | 'sides' | 'roles' | 'special';

type PersonalGame = {
  dateMs: number;
  eventId: string;
  source: 'club' | 'tournament';
  won: boolean;
  team: 'red' | 'black';
  role: AnalyticsPlayerResult['role'];
};

type ProgressStats = {
  games: number;
  wins: number;
  winRate: number;
  redGames: number;
  redWins: number;
  blackGames: number;
  blackWins: number;
  currentStreak: number;
  bestStreak: number;
  roleGames: Record<Role, number>;
  roleWins: Record<Role, number>;
  roleBestStreak: Record<Role, number>;
  rolesPlayed: number;
  rolesWon: number;
  strongestRole: Role | null;
  form: boolean[];
  recent7Wins: number;
  recent10Wins: number;
  perfectEvenings: number;
  maxGamesInEvening: number;
};

type Requirement = { label: string; current: number; target: number; completed: boolean };

type AchievementDefinition = {
  id: string;
  name: string;
  description: string;
  icon: string;
  rarity: Rarity;
  category: AchievementCategory;
  current: (stats: ProgressStats) => number;
  target: number;
};

const requirePlayerId = (req: any, res: any): string | null => {
  const playerId = getPlayerSessionId(req);
  if (!playerId) {
    res.status(401).json({ error: 'Player authentication required.' });
    return null;
  }
  return playerId;
};

const ensureSchema = async (db: any) => {
  await db.run(`
    CREATE TABLE IF NOT EXISTS player_profile_cosmetics (
      player_id TEXT PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
      selected_title TEXT,
      updated_at TEXT NOT NULL
    )
  `);
};

const roleLabel = (role: Role | null) => role === 'citizen' ? 'Мирный' : role === 'sheriff' ? 'Шериф' : role === 'mafia' ? 'Мафия' : role === 'don' ? 'Дон' : null;

const bestWinStreak = (games: PersonalGame[]) => {
  let best = 0;
  let current = 0;
  for (const game of games.slice().sort((a, b) => a.dateMs - b.dateMs)) {
    if (game.won) {
      current += 1;
      best = Math.max(best, current);
    } else {
      current = 0;
    }
  }
  return best;
};

const buildStats = (games: PersonalGame[]): ProgressStats => {
  const roleGames: Record<Role, number> = { citizen: 0, sheriff: 0, mafia: 0, don: 0 };
  const roleWins: Record<Role, number> = { citizen: 0, sheriff: 0, mafia: 0, don: 0 };
  const roleBestStreak: Record<Role, number> = { citizen: 0, sheriff: 0, mafia: 0, don: 0 };
  let redGames = 0;
  let redWins = 0;
  let blackGames = 0;
  let blackWins = 0;
  let wins = 0;

  for (const game of games) {
    if (game.won) wins += 1;
    if (game.team === 'red') {
      redGames += 1;
      if (game.won) redWins += 1;
    } else {
      blackGames += 1;
      if (game.won) blackWins += 1;
    }
    if (game.role && ROLES.includes(game.role as Role)) {
      roleGames[game.role as Role] += 1;
      if (game.won) roleWins[game.role as Role] += 1;
    }
  }

  let currentStreak = 0;
  for (const game of games) {
    if (!game.won) break;
    currentStreak += 1;
  }

  const bestStreak = bestWinStreak(games);
  for (const role of ROLES) {
    roleBestStreak[role] = bestWinStreak(games.filter((game) => game.role === role));
  }

  const roleCandidates = ROLES
    .filter((role) => roleGames[role] > 0)
    .sort((a, b) => {
      const aRate = roleWins[a] / roleGames[a];
      const bRate = roleWins[b] / roleGames[b];
      const aReliable = roleGames[a] >= 5 ? 1 : 0;
      const bReliable = roleGames[b] >= 5 ? 1 : 0;
      return bReliable - aReliable || bRate - aRate || roleGames[b] - roleGames[a];
    });

  const eventMap = new Map<string, PersonalGame[]>();
  for (const game of games) {
    const bucket = eventMap.get(game.eventId) || [];
    bucket.push(game);
    eventMap.set(game.eventId, bucket);
  }
  let perfectEvenings = 0;
  let maxGamesInEvening = 0;
  for (const eventGames of eventMap.values()) {
    maxGamesInEvening = Math.max(maxGamesInEvening, eventGames.length);
    if (eventGames.length >= 4 && eventGames.every((game) => game.won)) perfectEvenings += 1;
  }

  return {
    games: games.length,
    wins,
    winRate: games.length ? Math.round((wins / games.length) * 100) : 0,
    redGames,
    redWins,
    blackGames,
    blackWins,
    currentStreak,
    bestStreak,
    roleGames,
    roleWins,
    roleBestStreak,
    rolesPlayed: ROLES.filter((role) => roleGames[role] > 0).length,
    rolesWon: ROLES.filter((role) => roleWins[role] > 0).length,
    strongestRole: roleCandidates[0] || null,
    form: games.slice(0, 10).map((game) => game.won),
    recent7Wins: games.slice(0, 7).filter((game) => game.won).length,
    recent10Wins: games.slice(0, 10).filter((game) => game.won).length,
    perfectEvenings,
    maxGamesInEvening,
  };
};

const achievement = (
  id: string,
  name: string,
  description: string,
  icon: string,
  rarity: Rarity,
  category: AchievementCategory,
  target: number,
  current: (stats: ProgressStats) => number,
): AchievementDefinition => ({ id, name, description, icon, rarity, category, target, current });

const ACHIEVEMENTS_V2: AchievementDefinition[] = [
  achievement('games_10', 'Дебют пройден', 'Сыграть 10 завершённых игр', '🎭', 'common', 'career', 10, (s) => s.games),
  achievement('games_25', 'Свой за столом', 'Сыграть 25 завершённых игр', '🪑', 'common', 'career', 25, (s) => s.games),
  achievement('games_50', 'Завсегдатай', 'Сыграть 50 завершённых игр', '🎲', 'rare', 'career', 50, (s) => s.games),
  achievement('games_100', 'Сотня партий', 'Сыграть 100 завершённых игр', '💯', 'epic', 'career', 100, (s) => s.games),
  achievement('games_150', 'Старая гвардия', 'Сыграть 150 завершённых игр', '🎖️', 'epic', 'career', 150, (s) => s.games),
  achievement('games_200', 'История клуба', 'Сыграть 200 завершённых игр', '📜', 'legendary', 'career', 200, (s) => s.games),

  achievement('wins_10', 'Первые трофеи', 'Одержать 10 побед', '🏆', 'common', 'wins', 10, (s) => s.wins),
  achievement('wins_25', 'Победная привычка', 'Одержать 25 побед', '🥇', 'rare', 'wins', 25, (s) => s.wins),
  achievement('wins_50', 'Полтинник', 'Одержать 50 побед', '🏅', 'epic', 'wins', 50, (s) => s.wins),
  achievement('wins_75', 'Хищник стола', 'Одержать 75 побед', '🐺', 'epic', 'wins', 75, (s) => s.wins),
  achievement('wins_100', 'Сотник', 'Одержать 100 побед', '👑', 'legendary', 'wins', 100, (s) => s.wins),

  achievement('streak_3', 'Поймал волну', 'Выиграть 3 игры подряд', '🔥', 'common', 'form', 3, (s) => s.bestStreak),
  achievement('streak_5', 'На ходу', 'Выиграть 5 игр подряд', '⚡', 'rare', 'form', 5, (s) => s.bestStreak),
  achievement('streak_7', 'Без тормозов', 'Выиграть 7 игр подряд', '🚀', 'epic', 'form', 7, (s) => s.bestStreak),
  achievement('streak_10', 'Недосягаемый', 'Выиграть 10 игр подряд', '☄️', 'legendary', 'form', 10, (s) => s.bestStreak),

  achievement('red_10', 'За город', 'Одержать 10 побед за красных', '🔴', 'common', 'sides', 10, (s) => s.redWins),
  achievement('red_25', 'Красный костяк', 'Одержать 25 побед за красных', '❤️', 'rare', 'sides', 25, (s) => s.redWins),
  achievement('red_45', 'Красная машина', 'Одержать 45 побед за красных', '❤️‍🔥', 'epic', 'sides', 45, (s) => s.redWins),
  achievement('black_5', 'Тёмная сторона', 'Одержать 5 побед за чёрных', '⚫', 'common', 'sides', 5, (s) => s.blackWins),
  achievement('black_15', 'Чёрная работа', 'Одержать 15 побед за чёрных', '♠️', 'rare', 'sides', 15, (s) => s.blackWins),
  achievement('black_25', 'Ночная смена', 'Одержать 25 побед за чёрных', '🌑', 'epic', 'sides', 25, (s) => s.blackWins),

  achievement('citizen_5', 'Голос города', 'Одержать 5 побед Мирным', '🗣️', 'common', 'roles', 5, (s) => s.roleWins.citizen),
  achievement('citizen_15', 'Гражданская позиция', 'Одержать 15 побед Мирным', '🏙️', 'rare', 'roles', 15, (s) => s.roleWins.citizen),
  achievement('citizen_30', 'Опора города', 'Одержать 30 побед Мирным', '🛡️', 'epic', 'roles', 30, (s) => s.roleWins.citizen),
  achievement('sheriff_3', 'Первый жетон', 'Одержать 3 победы Шерифом', '⭐', 'common', 'roles', 3, (s) => s.roleWins.sheriff),
  achievement('sheriff_8', 'Следователь', 'Одержать 8 побед Шерифом', '🔎', 'rare', 'roles', 8, (s) => s.roleWins.sheriff),
  achievement('sheriff_15', 'Комиссар', 'Одержать 15 побед Шерифом', '🚨', 'epic', 'roles', 15, (s) => s.roleWins.sheriff),
  achievement('mafia_3', 'Вошёл в семью', 'Одержать 3 победы Мафией', '🕴️', 'common', 'roles', 3, (s) => s.roleWins.mafia),
  achievement('mafia_8', 'Тихая работа', 'Одержать 8 побед Мафией', '🔪', 'rare', 'roles', 8, (s) => s.roleWins.mafia),
  achievement('mafia_15', 'Серый кардинал', 'Одержать 15 побед Мафией', '♠️', 'epic', 'roles', 15, (s) => s.roleWins.mafia),
  achievement('don_2', 'За главным столом', 'Одержать 2 победы Доном', '🎩', 'common', 'roles', 2, (s) => s.roleWins.don),
  achievement('don_5', 'Авторитет', 'Одержать 5 побед Доном', '💼', 'rare', 'roles', 5, (s) => s.roleWins.don),
  achievement('don_8', 'Крёстный путь', 'Одержать 8 побед Доном', '🥃', 'epic', 'roles', 8, (s) => s.roleWins.don),

  achievement('roles_played_5', 'Четыре роли', 'Сыграть минимум по 5 игр каждой ролью', '🎭', 'rare', 'roles', 5, (s) => Math.min(...ROLES.map((role) => s.roleGames[role]))),
  achievement('roles_won_3', 'Без любимчиков', 'Одержать минимум по 3 победы каждой ролью', '🃏', 'rare', 'roles', 3, (s) => Math.min(...ROLES.map((role) => s.roleWins[role]))),
  achievement('roles_won_5', 'Универсал', 'Одержать минимум по 5 побед каждой ролью', '🎭', 'epic', 'roles', 5, (s) => Math.min(...ROLES.map((role) => s.roleWins[role]))),
  achievement('roles_won_10', 'Четыре лица', 'Одержать минимум по 10 побед каждой ролью', '🃏', 'legendary', 'roles', 10, (s) => Math.min(...ROLES.map((role) => s.roleWins[role]))),

  achievement('perfect_evening', 'Идеальный вечер', 'Выиграть все свои игры за вечер, сыграв минимум 4', '🌟', 'epic', 'special', 1, (s) => s.perfectEvenings),
  achievement('perfect_evenings_3', 'Стабильное безумие', 'Провести 3 идеальных вечера минимум по 4 игры', '✨', 'legendary', 'special', 3, (s) => s.perfectEvenings),
  achievement('evening_marathon', 'Марафонец', 'Сыграть 6 игр за один вечер', '🏃', 'rare', 'special', 6, (s) => s.maxGamesInEvening),
];

const requirement = (label: string, current: number, target: number): Requirement => ({ label, current: Math.min(current, target), target, completed: current >= target });

const titleRequirements = (id: PlayerTitleId, stats: ProgressStats): Requirement[] => {
  switch (id) {
    case 'old_guard': return [requirement('Завершённые игры', stats.games, 150)];
    case 'godfather': return [
      requirement('Игры Доном', stats.roleGames.don, 20),
      requirement('Победы Доном', stats.roleWins.don, 8),
      requirement('Лучшая серия Доном', stats.roleBestStreak.don, 3),
    ];
    case 'commissioner': return [
      requirement('Игры Шерифом', stats.roleGames.sheriff, 25),
      requirement('Победы Шерифом', stats.roleWins.sheriff, 15),
      requirement('Лучшая серия Шерифом', stats.roleBestStreak.sheriff, 4),
    ];
    case 'grey_cardinal': return [
      requirement('Игры Мафией', stats.roleGames.mafia, 30),
      requirement('Победы Мафией', stats.roleWins.mafia, 15),
      requirement('Лучшая серия Мафией', stats.roleBestStreak.mafia, 4),
    ];
    case 'voice_of_city': return [
      requirement('Игры Мирным', stats.roleGames.citizen, 50),
      requirement('Победы Мирным', stats.roleWins.citizen, 30),
      requirement('Лучшая серия Мирным', stats.roleBestStreak.citizen, 5),
    ];
    case 'chameleon': return ROLES.flatMap((role) => [
      requirement(`Игры · ${roleLabel(role)}`, stats.roleGames[role], 20),
      requirement(`Победы · ${roleLabel(role)}`, stats.roleWins[role], 5),
    ]);
    case 'unstoppable': return [requirement('Лучшая победная серия', stats.bestStreak, 8)];
    case 'red_machine': return [requirement('Игры за красных', stats.redGames, 70), requirement('Победы за красных', stats.redWins, 45)];
    case 'black_legend': return [requirement('Игры за чёрных', stats.blackGames, 50), requirement('Победы за чёрных', stats.blackWins, 25)];
    case 'centurion': return [requirement('Карьерные победы', stats.wins, 100)];
    case 'four_faces': return ROLES.map((role) => requirement(`Победы · ${roleLabel(role)}`, stats.roleWins[role], 10));
    case 'legend_2la': return [
      requirement('Завершённые игры', stats.games, 200),
      requirement('Карьерные победы', stats.wins, 100),
      ...ROLES.map((role) => requirement(`Победы · ${roleLabel(role)}`, stats.roleWins[role], 10)),
      requirement('Лучшая победная серия', stats.bestStreak, 8),
    ];
  }
};

const buildChallenges = (stats: ProgressStats) => [
  { id: 'form_5_of_7', title: 'Горячая неделя', icon: '🔥', description: 'Выиграть 5 из последних 7 игр', progress: stats.recent7Wins, target: 5, completed: stats.games >= 7 && stats.recent7Wins >= 5 },
  { id: 'form_7_of_10', title: 'Форма претендента', icon: '⚡', description: 'Выиграть 7 из последних 10 игр', progress: stats.recent10Wins, target: 7, completed: stats.games >= 10 && stats.recent10Wins >= 7 },
  { id: 'streak_5_now', title: 'Не сбавлять ход', icon: '🚀', description: 'Собрать текущую серию из 5 побед', progress: stats.currentStreak, target: 5, completed: stats.currentStreak >= 5 },
  { id: 'red_20', title: 'Город держится', icon: '🔴', description: 'Дойти до 20 побед за красных', progress: stats.redWins, target: 20, completed: stats.redWins >= 20 },
  { id: 'black_12', title: 'Ночная работа', icon: '⚫', description: 'Дойти до 12 побед за чёрных', progress: stats.blackWins, target: 12, completed: stats.blackWins >= 12 },
  { id: 'citizen_15', title: 'Народный голос', icon: '🗣️', description: 'Одержать 15 побед Мирным', progress: stats.roleWins.citizen, target: 15, completed: stats.roleWins.citizen >= 15 },
  { id: 'sheriff_8', title: 'Вести расследование', icon: '⭐', description: 'Одержать 8 побед Шерифом', progress: stats.roleWins.sheriff, target: 8, completed: stats.roleWins.sheriff >= 8 },
  { id: 'mafia_8', title: 'Работать тихо', icon: '♠️', description: 'Одержать 8 побед Мафией', progress: stats.roleWins.mafia, target: 8, completed: stats.roleWins.mafia >= 8 },
  { id: 'don_5', title: 'Заработать авторитет', icon: '🎩', description: 'Одержать 5 побед Доном', progress: stats.roleWins.don, target: 5, completed: stats.roleWins.don >= 5 },
  { id: 'all_roles_5', title: 'Без слабой роли', icon: '🎭', description: 'Одержать минимум по 5 побед каждой ролью', progress: Math.min(...ROLES.map((role) => stats.roleWins[role])), target: 5, completed: ROLES.every((role) => stats.roleWins[role] >= 5) },
  { id: 'games_100', title: 'Большая дистанция', icon: '💯', description: 'Дойти до 100 завершённых игр', progress: stats.games, target: 100, completed: stats.games >= 100 },
  { id: 'perfect_evening', title: 'Забрать вечер', icon: '🌟', description: 'Выиграть все свои игры за вечер при минимум 4 партиях', progress: stats.perfectEvenings, target: 1, completed: stats.perfectEvenings >= 1 },
];

const buildProgression = async (db: any, playerId: string) => {
  await ensureSchema(db);
  const [player, cosmetics, snapshots] = await Promise.all([
    db.get(`SELECT id, nickname, elo, game_level FROM players WHERE id = ? LIMIT 1`, [playerId]),
    db.get(`SELECT selected_title FROM player_profile_cosmetics WHERE player_id = ? LIMIT 1`, [playerId]),
    loadCompletedGameSnapshots(db),
  ]);
  if (!player) return null;

  const personalGames: PersonalGame[] = snapshots.flatMap((game) => {
    const result = game.players.find((item) => item.player_id === playerId);
    if (!result) return [];
    return [{
      dateMs: game.dateMs,
      eventId: `${game.source}:${game.event_id}`,
      source: game.source,
      won: result.won,
      team: result.team,
      role: result.role,
    }];
  }).sort((a, b) => b.dateMs - a.dateMs);

  const stats = buildStats(personalGames);
  const achievements = ACHIEVEMENTS_V2.map((item) => {
    const rawCurrent = item.current(stats);
    return {
      id: item.id,
      name: item.name,
      description: item.description,
      icon: item.icon,
      rarity: item.rarity,
      category: item.category,
      progress: Math.min(rawCurrent, item.target),
      target: item.target,
      completed: rawCurrent >= item.target,
    };
  });

  const titles = PLAYER_TITLES.map((title) => {
    const requirements = titleRequirements(title.id, stats);
    return { ...title, requirements, unlocked: requirements.every((item) => item.completed) };
  });
  const unlockedIds = new Set(titles.filter((title) => title.unlocked).map((title) => title.id));
  const selectedId = cosmetics?.selected_title && unlockedIds.has(String(cosmetics.selected_title) as PlayerTitleId)
    ? String(cosmetics.selected_title) as PlayerTitleId
    : null;
  const selectedTitle = titles.find((title) => title.id === selectedId) || null;

  return {
    version: 2,
    player: {
      id: String(player.id),
      nickname: String(player.nickname || 'Игрок'),
      elo: Number(player.elo || 0),
      game_level: String(player.game_level || 'club'),
      avatar_url: `/api/player/players/${encodeURIComponent(playerId)}/avatar`,
      selected_title: selectedTitle,
    },
    summary: {
      games: stats.games,
      wins: stats.wins,
      win_rate: stats.winRate,
      streak: stats.currentStreak,
      best_streak: stats.bestStreak,
      red: { games: stats.redGames, wins: stats.redWins },
      black: { games: stats.blackGames, wins: stats.blackWins },
      roles: Object.fromEntries(ROLES.map((role) => [role, { games: stats.roleGames[role], wins: stats.roleWins[role], best_streak: stats.roleBestStreak[role] }])),
      strongest_role: stats.strongestRole ? {
        role: stats.strongestRole,
        label: roleLabel(stats.strongestRole),
        games: stats.roleGames[stats.strongestRole],
        wins: stats.roleWins[stats.strongestRole],
        win_rate: stats.roleGames[stats.strongestRole] ? Math.round((stats.roleWins[stats.strongestRole] / stats.roleGames[stats.strongestRole]) * 100) : 0,
      } : null,
      form: stats.form,
    },
    achievements,
    challenges: buildChallenges(stats),
    titles,
  };
};

router.get('/progression', async (req, res) => {
  const playerId = requirePlayerId(req, res);
  if (!playerId) return;
  try {
    const db = (req as any).db;
    const progression = await buildProgression(db, playerId);
    if (!progression) return res.status(404).json({ error: 'Игрок не найден' });
    return res.json(progression);
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Не удалось загрузить прогресс игрока' });
  }
});

router.patch('/progression/title', async (req, res) => {
  const playerId = requirePlayerId(req, res);
  if (!playerId) return;
  const titleId = req.body?.title_id == null ? null : String(req.body.title_id).trim();

  try {
    const db = (req as any).db;
    const progression = await buildProgression(db, playerId);
    if (!progression) return res.status(404).json({ error: 'Игрок не найден' });
    if (titleId && !progression.titles.some((title) => title.id === titleId && title.unlocked)) {
      return res.status(400).json({ error: 'Это звание ещё не заработано' });
    }

    const now = new Date().toISOString();
    await db.run(`
      INSERT INTO player_profile_cosmetics (player_id, selected_title, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(player_id) DO UPDATE SET
        selected_title = excluded.selected_title,
        updated_at = excluded.updated_at
    `, [playerId, titleId, now]);

    return res.json({ success: true, selected_title: titleId, updated_at: now });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Не удалось выбрать звание' });
  }
});

export default router;
