import { Router } from 'express';
import { getPlayerSessionId } from '../auth.ts';
import { loadCompletedGameSnapshots, type AnalyticsPlayerResult } from '../services/clubGameAnalyticsService.ts';

const router = Router();
const ROLES = ['citizen', 'sheriff', 'mafia', 'don'] as const;
type Role = typeof ROLES[number];

type PersonalGame = {
  dateMs: number;
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
  streak: number;
  roleGames: Record<Role, number>;
  roleWins: Record<Role, number>;
  rolesPlayed: number;
  rolesWon: number;
  strongestRole: Role | null;
  form: boolean[];
};

const TITLE_DEFS = [
  { id: 'veteran', label: 'Ветеран стола', icon: '🎖️', hint: '25 сыгранных игр', unlocked: (s: ProgressStats) => s.games >= 25 },
  { id: 'red_wave', label: 'Красная волна', icon: '🔴', hint: '10 побед за красных', unlocked: (s: ProgressStats) => s.redWins >= 10 },
  { id: 'black_mark', label: 'Чёрная метка', icon: '⚫', hint: '10 побед за чёрных', unlocked: (s: ProgressStats) => s.blackWins >= 10 },
  { id: 'sheriff_hunter', label: 'Охотник на мафию', icon: '⭐', hint: '5 побед Шерифом', unlocked: (s: ProgressStats) => s.roleWins.sheriff >= 5 },
  { id: 'iron_don', label: 'Железный Дон', icon: '🎩', hint: '3 победы Доном', unlocked: (s: ProgressStats) => s.roleWins.don >= 3 },
  { id: 'universal', label: 'Универсал', icon: '🎭', hint: 'Победа каждой ролью', unlocked: (s: ProgressStats) => s.rolesWon === 4 },
  { id: 'on_fire', label: 'На серии', icon: '🔥', hint: '5 побед подряд', unlocked: (s: ProgressStats) => s.streak >= 5 },
] as const;

type TitleId = typeof TITLE_DEFS[number]['id'];

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

const buildStats = (games: PersonalGame[]): ProgressStats => {
  const roleGames: Record<Role, number> = { citizen: 0, sheriff: 0, mafia: 0, don: 0 };
  const roleWins: Record<Role, number> = { citizen: 0, sheriff: 0, mafia: 0, don: 0 };
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

  let streak = 0;
  for (const game of games) {
    if (!game.won) break;
    streak += 1;
  }

  const roleCandidates = ROLES
    .filter((role) => roleGames[role] > 0)
    .sort((a, b) => {
      const aRate = roleWins[a] / roleGames[a];
      const bRate = roleWins[b] / roleGames[b];
      const aReliable = roleGames[a] >= 2 ? 1 : 0;
      const bReliable = roleGames[b] >= 2 ? 1 : 0;
      return bReliable - aReliable || bRate - aRate || roleGames[b] - roleGames[a];
    });

  return {
    games: games.length,
    wins,
    winRate: games.length ? Math.round((wins / games.length) * 100) : 0,
    redGames,
    redWins,
    blackGames,
    blackWins,
    streak,
    roleGames,
    roleWins,
    rolesPlayed: ROLES.filter((role) => roleGames[role] > 0).length,
    rolesWon: ROLES.filter((role) => roleWins[role] > 0).length,
    strongestRole: roleCandidates[0] || null,
    form: games.slice(0, 5).map((game) => game.won),
  };
};

const challenge = (id: string, title: string, icon: string, progress: number, target: number, reward: string) => ({
  id,
  title,
  icon,
  progress: Math.min(progress, target),
  target,
  completed: progress >= target,
  reward,
});

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
    return [{ dateMs: game.dateMs, won: result.won, team: result.team, role: result.role }];
  }).sort((a, b) => b.dateMs - a.dateMs);

  const stats = buildStats(personalGames);
  const challenges = [
    challenge('first_steps', 'Освоиться за столом', '🎭', stats.games, 5, 'Открывает первые карьерные ориентиры'),
    challenge('ten_wins', 'Десять побед', '🏆', stats.wins, 10, 'Стабильная победная форма'),
    challenge('red_three', 'Красная серия', '🔴', stats.redWins, 5, '5 побед за красных'),
    challenge('black_three', 'Чёрная работа', '⚫', stats.blackWins, 5, '5 побед за чёрных'),
    challenge('all_roles', 'Четыре лица', '🎭', stats.rolesPlayed, 4, 'Сыграть каждую роль'),
    challenge('all_role_wins', 'Полный комплект', '👑', stats.rolesWon, 4, 'Победить каждой ролью'),
    challenge('streak_three', 'Поймать волну', '🔥', stats.streak, 3, '3 победы подряд'),
    challenge('veteran_25', 'Дистанция', '🎖️', stats.games, 25, '25 завершённых игр'),
  ];

  const titles = TITLE_DEFS.map((title) => ({
    id: title.id,
    label: title.label,
    icon: title.icon,
    hint: title.hint,
    unlocked: title.unlocked(stats),
  }));
  const unlockedIds = new Set(titles.filter((title) => title.unlocked).map((title) => title.id));
  const selectedId = cosmetics?.selected_title && unlockedIds.has(String(cosmetics.selected_title))
    ? String(cosmetics.selected_title) as TitleId
    : null;
  const selectedTitle = titles.find((title) => title.id === selectedId) || null;

  return {
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
      streak: stats.streak,
      red: { games: stats.redGames, wins: stats.redWins },
      black: { games: stats.blackGames, wins: stats.blackWins },
      strongest_role: stats.strongestRole ? {
        role: stats.strongestRole,
        label: roleLabel(stats.strongestRole),
        games: stats.roleGames[stats.strongestRole],
        wins: stats.roleWins[stats.strongestRole],
        win_rate: stats.roleGames[stats.strongestRole] ? Math.round((stats.roleWins[stats.strongestRole] / stats.roleGames[stats.strongestRole]) * 100) : 0,
      } : null,
      form: stats.form,
    },
    challenges,
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
      return res.status(400).json({ error: 'Этот титул ещё не заработан' });
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
    return res.status(500).json({ error: error?.message || 'Не удалось выбрать титул' });
  }
});

export default router;
