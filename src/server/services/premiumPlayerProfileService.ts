import { getRepositoryPlayerAvatarAsset } from '../../lib/playerAvatarManifest.ts';
import type { DatabaseWrapper } from '../../db/index.ts';
import { loadPlayerAchievementProfile } from './playerAchievementsService.ts';
import { loadPlayerEloHistory } from './playerEloHistoryService.ts';
import { loadPlayerGameProfile, type PlayerGameHistoryItem } from './playerProfileService.ts';

export type PremiumProfileRange = 'month' | 'season' | 'all';
export type PremiumGameRole = 'citizen' | 'sheriff' | 'mafia' | 'don';

const ROLES: PremiumGameRole[] = ['citizen', 'sheriff', 'mafia', 'don'];
const ROLE_LABELS: Record<PremiumGameRole, string> = { citizen: 'Мирный', sheriff: 'Шериф', mafia: 'Мафия', don: 'Дон' };

const numeric = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;
const round = (value: number, digits = 1) => {
  const multiplier = 10 ** digits;
  return Math.round((value + Number.EPSILON) * multiplier) / multiplier;
};
const parseJson = <T>(value: unknown, fallback: T): T => {
  if (typeof value !== 'string' || !value.trim()) return fallback;
  try { return JSON.parse(value) as T; } catch { return fallback; }
};
const dateTime = (value: string | null | undefined) => {
  const time = value ? new Date(value).getTime() : Number.NaN;
  return Number.isFinite(time) ? time : 0;
};
const isCompleted = (game: PlayerGameHistoryItem) => game.status === 'completed' && Boolean(game.winner_team);
const roleOf = (game: PlayerGameHistoryItem): PremiumGameRole | null => ROLES.includes(game.role as PremiumGameRole) ? game.role as PremiumGameRole : null;
const fallbackGamePoints = (game: PlayerGameHistoryItem) => round(
  (game.won ? 1 : 0) + numeric(game.judge_bonus) + numeric(game.protocol_bonus) + numeric(game.ci_points)
    - numeric(game.disciplinary_penalty_points),
  2,
);

const publicVisibility = (raw: unknown) => {
  const parsed = parseJson<Record<string, boolean>>(raw, {});
  return {
    real_name: parsed.real_name === true,
    telegram_username: parsed.telegram_username === true,
    phone: parsed.phone === true,
    game_statistics: parsed.game_statistics !== false,
    connections: parsed.connections !== false,
  };
};

const avatarUrl = (player: any) => {
  const hasDb = Number(player.has_db_avatar || 0) > 0;
  const hasRepo = !Number(player.avatar_suppressed || 0) && Boolean(getRepositoryPlayerAvatarAsset(String(player.id)));
  return hasDb || hasRepo ? `/api/player/players/${encodeURIComponent(String(player.id))}/avatar` : null;
};

const loadIdentity = async (db: DatabaseWrapper, playerId: string) => {
  const player = await db.get<any>(`
    SELECT p.*,
           EXISTS(SELECT 1 FROM player_avatars pa WHERE pa.player_id=p.id) AS has_db_avatar,
           EXISTS(SELECT 1 FROM player_avatar_repository_suppression s WHERE s.player_id=p.id) AS avatar_suppressed
      FROM players p WHERE p.id=? LIMIT 1
  `, [playerId]);
  if (!player) throw new Error('Игрок не найден');
  return player;
};

const eloRowsForPlayer = async (db: DatabaseWrapper, playerId: string) => {
  const timeline = await loadPlayerEloHistory(db);
  return timeline.flatMap((event) => {
    const row = event.players.find((item) => item.playerId === playerId);
    if (!row) return [];
    return [{
      id: `${event.source}:${event.sourceId}`,
      source: event.source,
      source_id: event.sourceId,
      date: event.sortAt,
      game_number: event.sortOrder,
      winner_team: event.winnerTeam,
      team: row.team,
      won: row.won,
      elo_before: round(row.eloBefore, 2),
      elo_after: round(row.eloAfter, 2),
      elo_delta: round(row.totalDelta, 2),
      personal_game_points: round(row.canonicalPersonalGamePoints + (row.won ? 1 : 0), 2),
    }];
  });
};

const achievementHighlights = async (db: DatabaseWrapper, playerId: string) => {
  const profile = await loadPlayerAchievementProfile(db, playerId, false);
  const items = profile.categories.flatMap((category) => category.achievements);
  const earned = items.filter((item) => item.earned).sort((a, b) => dateTime(b.earned_at) - dateTime(a.earned_at)).slice(0, 3);
  const progress = items
    .filter((item) => !item.earned && item.progress && item.progress.target > item.progress.current)
    .sort((a, b) => {
      const aRatio = a.progress ? a.progress.current / Math.max(1, a.progress.target) : 0;
      const bRatio = b.progress ? b.progress.current / Math.max(1, b.progress.target) : 0;
      return bRatio - aRatio;
    })
    .slice(0, 3);
  return { earned, progress };
};

const strongestRole = (games: PlayerGameHistoryItem[]) => {
  const candidates = ROLES.map((role) => {
    const roleGames = games.filter((game) => roleOf(game) === role && isCompleted(game));
    const wins = roleGames.filter((game) => game.won).length;
    return { role, games: roleGames.length, wins, win_rate: roleGames.length ? round((wins / roleGames.length) * 100) : 0 };
  }).filter((item) => item.games > 0);
  if (!candidates.length) return null;
  const reliable = candidates.filter((item) => item.games >= 3);
  const source = reliable.length ? reliable : candidates;
  source.sort((a, b) => b.win_rate - a.win_rate || b.games - a.games);
  return { ...source[0], label: ROLE_LABELS[source[0].role], small_sample: source[0].games < 5 };
};

const buildFacts = (games: PlayerGameHistoryItem[], elo: Awaited<ReturnType<typeof eloRowsForPlayer>>) => {
  const completed = games.filter(isCompleted);
  const facts: Array<{ id: string; text: string; sample_size?: number }> = [];
  const recent = completed.slice(0, 5);
  if (recent.length >= 5) {
    const wins = recent.filter((game) => game.won).length;
    if (wins >= 4) facts.push({ id: 'recent-form', text: `${wins} побед в последних 5 играх`, sample_size: 5 });
  }
  const current = elo.at(-1)?.elo_after ?? null;
  const personalMax = elo.length ? Math.max(...elo.map((item) => item.elo_after)) : null;
  if (current != null && personalMax != null && Math.abs(current - personalMax) < 0.001 && elo.length >= 5) {
    facts.push({ id: 'elo-record', text: 'Текущий Elo — личный максимум', sample_size: elo.length });
  }
  const overallWinRate = completed.length ? completed.filter((game) => game.won).length / completed.length : 0;
  for (const role of ROLES) {
    const sample = completed.filter((game) => roleOf(game) === role);
    if (sample.length < 10 || completed.length < 20) continue;
    const rate = sample.filter((game) => game.won).length / sample.length;
    if (rate >= overallWinRate + 0.12) {
      facts.push({ id: `role-${role}`, text: `${ROLE_LABELS[role]}: результат выше личного среднего`, sample_size: sample.length });
      break;
    }
  }
  return facts.slice(0, 3);
};

export async function loadPremiumProfileSummary(db: DatabaseWrapper, playerId: string, viewerId: string, organizer = false) {
  const player = await loadIdentity(db, playerId);
  const visibility = publicVisibility(player.profile_visibility_json);
  const isSelf = viewerId === playerId;
  const canSeePrivate = organizer || isSelf;
  const [profile, elo, achievements, rankRow] = await Promise.all([
    loadPlayerGameProfile(db, playerId),
    eloRowsForPlayer(db, playerId),
    achievementHighlights(db, playerId),
    db.get<any>('SELECT 1 + COUNT(*) AS place FROM players WHERE COALESCE(contact_status, lifecycle_status, \'normal\') != \'blocked\' AND elo > ?', [numeric(player.elo)]),
  ]);
  const games = [...profile.clubGames, ...profile.tournamentGames].filter(isCompleted).sort((a, b) => dateTime(b.date) - dateTime(a.date));
  const recent = games.slice(0, 5);
  const wins = games.filter((game) => game.won).length;
  const recentWins = recent.filter((game) => game.won).length;
  const monthCutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const movement = round(elo.filter((item) => dateTime(item.date) >= monthCutoff).reduce((sum, item) => sum + item.elo_delta, 0), 2);
  const verifiedAwards = await db.all<any>(`
    SELECT id, kind, title, tournament_name, award_date, award_year, place_result, team_name, photo_url, source_type
      FROM player_verified_awards WHERE player_id=? AND verification_status='verified'
     ORDER BY COALESCE(award_date, created_at) DESC LIMIT 3
  `, [playerId]);
  const joinedAt = player.created_at || null;
  const identity = {
    id: String(player.id),
    nickname: String(player.nickname || 'Игрок'),
    full_name: canSeePrivate || visibility.real_name ? player.full_name || null : null,
    telegram_username: canSeePrivate || visibility.telegram_username ? player.telegram_username || null : null,
    phone: canSeePrivate || visibility.phone ? player.phone || null : null,
    avatar_url: avatarUrl(player),
    game_level: player.game_level || 'club',
    club_role: player.club_role || null,
    contact_status: canSeePrivate ? player.contact_status || null : null,
    elo: numeric(player.elo),
    rating_position: Number(rankRow?.place || 1),
    rating_movement_30d: movement,
    joined_at: joinedAt,
    visibility,
    cosmetics: parseJson<Record<string, unknown>>(player.profile_cosmetics_json, {}),
  };
  return {
    viewer: { is_self: isSelf, is_organizer: organizer },
    player: identity,
    stats: visibility.game_statistics || canSeePrivate ? {
      games: games.length,
      wins,
      win_rate: games.length ? round((wins / games.length) * 100) : 0,
      recent_form: recent.map((game) => game.won ? 'W' : 'L'),
      recent_wins: recentWins,
      strongest_role: strongestRole(games),
      personal_elo_max: elo.length ? Math.max(numeric(player.elo), ...elo.map((item) => item.elo_after)) : numeric(player.elo),
    } : null,
    recent_games: (visibility.game_statistics || canSeePrivate) ? recent.map((game) => ({
      id: game.id, title: game.title, date: game.date, game_number: game.game_number, role: roleOf(game), won: game.won,
    })) : [],
    elo_preview: (visibility.game_statistics || canSeePrivate) ? elo.slice(-8) : [],
    recent_achievements: achievements.earned,
    achievement_progress: isSelf ? achievements.progress : [],
    recent_verified_awards: verifiedAwards,
    facts: (visibility.game_statistics || canSeePrivate) ? buildFacts(games, elo) : [],
  };
}

type GameQuery = { role?: string; team?: string; result?: string; from?: string; to?: string; limit?: number; offset?: number };
export async function loadPremiumProfileGames(db: DatabaseWrapper, playerId: string, query: GameQuery) {
  const [profile, elo] = await Promise.all([loadPlayerGameProfile(db, playerId), eloRowsForPlayer(db, playerId)]);
  const eloById = new Map(elo.map((item) => [item.id, item]));
  let games = [...profile.clubGames, ...profile.tournamentGames].filter(isCompleted).sort((a, b) => dateTime(b.date) - dateTime(a.date));
  if (query.role && ROLES.includes(query.role as PremiumGameRole)) games = games.filter((game) => roleOf(game) === query.role);
  if (query.team === 'red' || query.team === 'black') games = games.filter((game) => game.team === query.team);
  if (query.result === 'win') games = games.filter((game) => game.won === true);
  if (query.result === 'loss') games = games.filter((game) => game.won === false);
  if (query.from) games = games.filter((game) => dateTime(game.date) >= dateTime(query.from));
  if (query.to) games = games.filter((game) => dateTime(game.date) <= dateTime(query.to) + 86_399_999);
  const total = games.length;
  const limit = Math.min(30, Math.max(5, Number(query.limit) || 15));
  const offset = Math.max(0, Number(query.offset) || 0);
  const page = games.slice(offset, offset + limit).map((game) => {
    const eloItem = eloById.get(game.id);
    return {
      ...game,
      role: roleOf(game),
      elo_before: eloItem?.elo_before ?? null,
      elo_after: eloItem?.elo_after ?? null,
      elo_delta: eloItem?.elo_delta ?? null,
      game_points: eloItem?.personal_game_points ?? fallbackGamePoints(game),
      protocol_path: `/player/games?game=${encodeURIComponent(game.id)}`,
    };
  });
  return { games: page, total, offset, limit, next_offset: offset + page.length < total ? offset + page.length : null };
}

export async function loadPremiumProfileRoles(db: DatabaseWrapper, playerId: string) {
  const [profile, elo] = await Promise.all([loadPlayerGameProfile(db, playerId), eloRowsForPlayer(db, playerId)]);
  const eloById = new Map(elo.map((item) => [item.id, item]));
  const games = [...profile.clubGames, ...profile.tournamentGames].filter(isCompleted).sort((a, b) => dateTime(b.date) - dateTime(a.date));
  const overallWins = games.filter((game) => game.won).length;
  const overallRate = games.length ? (overallWins / games.length) * 100 : 0;
  const roles = ROLES.map((role) => {
    const sample = games.filter((game) => roleOf(game) === role);
    const wins = sample.filter((game) => game.won).length;
    const points = sample.map((game) => eloById.get(game.id)?.personal_game_points ?? fallbackGamePoints(game));
    const recent = sample.slice(0, 5);
    return {
      role,
      label: ROLE_LABELS[role],
      games: sample.length,
      wins,
      win_rate: sample.length ? round((wins / sample.length) * 100) : 0,
      average_score: sample.length ? round(points.reduce((sum, value) => sum + value, 0) / sample.length, 2) : 0,
      best_score: points.length ? Math.max(...points) : null,
      recent_form: recent.map((game) => game.won ? 'W' : 'L'),
      versus_overall_pp: sample.length ? round((wins / sample.length) * 100 - overallRate) : 0,
      small_sample: sample.length < 10,
    };
  });
  const redGames = games.filter((game) => game.team === 'red');
  const blackGames = games.filter((game) => game.team === 'black');
  const recent = games.slice(0, 10);
  return {
    overall: { games: games.length, wins: overallWins, win_rate: games.length ? round(overallRate) : 0 },
    roles,
    fingerprint: {
      red_experience: { games: redGames.length, share: games.length ? round((redGames.length / games.length) * 100) : 0 },
      black_experience: { games: blackGames.length, share: games.length ? round((blackGames.length / games.length) * 100) : 0 },
      team_success: { wins: overallWins, games: games.length, win_rate: games.length ? round(overallRate) : 0 },
      form: { wins: recent.filter((game) => game.won).length, games: recent.length },
      versatility: { roles_used: roles.filter((role) => role.games > 0).length, roles_total: ROLES.length },
    },
  };
}

export async function loadPremiumProfileElo(db: DatabaseWrapper, playerId: string, range: PremiumProfileRange) {
  const [player, profile, timeline] = await Promise.all([
    loadIdentity(db, playerId),
    loadPlayerGameProfile(db, playerId),
    loadPlayerEloHistory(db),
  ]);
  const games = [...profile.clubGames, ...profile.tournamentGames];
  const gameById = new Map(games.map((game) => [game.id, game]));
  const seeds = await db.all<any>('SELECT id, COALESCE(elo_seed, 1000) AS elo_seed FROM players');
  const ratings = new Map<string, number>(seeds.map((row) => [String(row.id), numeric(row.elo_seed) || 1000]));
  const points: any[] = [];
  for (const event of timeline) {
    for (const row of event.players) ratings.set(row.playerId, row.eloAfter);
    const own = event.players.find((row) => row.playerId === playerId);
    if (!own) continue;
    const ownRating = ratings.get(playerId) ?? own.eloAfter;
    const position = 1 + [...ratings.entries()].filter(([id, value]) => id !== playerId && value > ownRating).length;
    const key = `${event.source}:${event.sourceId}`;
    const game = gameById.get(key);
    points.push({
      id: key,
      date: event.sortAt,
      game_number: game?.game_number || event.sortOrder,
      title: game?.title || (event.source === 'club' ? 'Клубная игра' : 'Турнир'),
      role: game ? roleOf(game) : null,
      won: own.won,
      elo_before: round(own.eloBefore, 2),
      elo_after: round(own.eloAfter, 2),
      elo_delta: round(own.totalDelta, 2),
      rating_position: position,
      game_path: `/player/games?game=${encodeURIComponent(key)}`,
    });
  }
  const now = Date.now();
  const cutoff = range === 'month' ? now - 31 * 24 * 60 * 60 * 1000 : range === 'season' ? now - 120 * 24 * 60 * 60 * 1000 : 0;
  const selected = cutoff ? points.filter((point) => dateTime(point.date) >= cutoff) : points;
  const startElo = selected[0]?.elo_before ?? numeric(player.elo);
  const endElo = selected.at(-1)?.elo_after ?? numeric(player.elo);
  return {
    range,
    current_elo: numeric(player.elo),
    personal_max: points.length ? Math.max(numeric(player.elo), ...points.map((point) => point.elo_after)) : numeric(player.elo),
    best_rating_position: points.length ? Math.min(...points.map((point) => point.rating_position)) : null,
    period_change: round(endElo - startElo, 2),
    points: selected,
    legacy_missing_snapshots: points.length === 0,
  };
}
