import { getRepositoryPlayerAvatarAsset } from '../../lib/playerAvatarManifest.ts';
import type { DatabaseWrapper } from '../../db/index.ts';
import { loadPlayerAchievementProfile } from './playerAchievementsService.ts';
import { loadPlayerEloHistory } from './playerEloHistoryService.ts';
import { loadPlayerGameProfile, type PlayerGameHistoryItem } from './playerProfileService.ts';
import { winRatePercent } from '../../shared/stats.ts';
import { buildPlayerGameStatistics, type StatGame } from '../../lib/gameStatistics.ts';
import { loadCompletedGameSnapshots } from './clubGameAnalyticsService.ts';
import { loadRatingSeasons, seasonForDate } from './clubSeasonService.ts';
import { loadStatGames } from './gameStatisticsService.ts';
import { buildNightShotStats } from '../../lib/nightShots.ts';
import { buildRevealStats } from '../../lib/revealStats.ts';
import { buildCircleExits } from '../../lib/circleExits.ts';
import { EVENING_FORMATS, EVENING_FORMAT_LABELS, type EveningFormat } from '../../lib/eveningFormat.ts';

export type PremiumProfileRange = 'month' | 'season' | 'all';
/** What the profile statistics are counted over: one rating season or all time, and one evening format or all of them. */
export type ProfileStatFilter = { period?: string; format?: string };
export type PremiumGameRole = 'citizen' | 'sheriff' | 'mafia' | 'don';

const ROLES: PremiumGameRole[] = ['citizen', 'sheriff', 'mafia', 'don'];
const ROLE_LABELS: Record<PremiumGameRole, string> = { citizen: 'Мирный', sheriff: 'Шериф', mafia: 'Мафия', don: 'Дон' };

/** The page of one game in the app (club and tournament games alike). */
const gamePagePath = (gameKey: string) => `/player/games/${encodeURIComponent(String(gameKey))}`;

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
    return { role, games: roleGames.length, wins, win_rate: winRatePercent(wins, roleGames.length) };
  }).filter((item) => item.games > 0);
  if (!candidates.length) return null;
  const reliable = candidates.filter((item) => item.games >= 3);
  const source = reliable.length ? reliable : candidates;
  source.sort((a, b) => b.win_rate - a.win_rate || b.games - a.games);
  return { ...source[0], label: ROLE_LABELS[source[0].role], small_sample: source[0].games < 5 };
};

/** Win streaks from the player's finished games, newest first. */
const winStreaks = (games: PlayerGameHistoryItem[]) => {
  let current = 0;
  for (const game of games) { if (!game.won) break; current += 1; }
  let best = 0;
  let run = 0;
  for (const game of [...games].reverse()) {
    if (game.won) { run += 1; best = Math.max(best, run); } else run = 0;
  }
  return { current, best };
};

const teamSplit = (games: PlayerGameHistoryItem[], team: 'red' | 'black') => {
  const sample = games.filter((game) => game.team === team);
  const wins = sample.filter((game) => game.won).length;
  return { games: sample.length, wins, win_rate: winRatePercent(wins, sample.length) };
};

/**
 * The current season (= the club's rating period): the player's own games come from the same list as every other number of
 * the profile; only the place among the players needs the other players' results.
 */
const loadSeasonBlock = async (db: DatabaseWrapper, playerId: string, games: PlayerGameHistoryItem[]) => {
  const season = seasonForDate(await loadRatingSeasons(db), Date.now());
  const inSeason = (value: string | null | undefined) => { const time = dateTime(value); return time >= season.start && time < season.end; };
  const own = games.filter((game) => inSeason(game.date));
  const wins = own.filter((game) => game.won).length;
  const table = new Map<string, { id: string; nickname: string; games: number; wins: number }>();
  for (const snapshot of (await loadCompletedGameSnapshots(db)).filter((item) => item.dateMs >= season.start && item.dateMs < season.end)) {
    for (const result of snapshot.players) {
      const row = table.get(result.player_id) || { id: result.player_id, nickname: result.nickname, games: 0, wins: 0 };
      row.games += 1;
      if (result.won) row.wins += 1;
      table.set(result.player_id, row);
    }
  }
  const ranking = [...table.values()].sort((a, b) => b.wins - a.wins || winRatePercent(b.wins, b.games) - winRatePercent(a.wins, a.games) || b.games - a.games || a.nickname.localeCompare(b.nickname, 'ru'));
  const place = ranking.findIndex((row) => row.id === playerId) + 1;
  return { label: season.label, games: own.length, wins, win_rate: winRatePercent(wins, own.length), place: place || null, total_players: ranking.length };
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

/**
 * Night shots around one player (owner request 2026-10-12): how often he was killed at night, with which black players at
 * the table it happened most («убит, когда в чёрных …»), and the nights without a victim while he played black.
 */
const profileNightShots = async (db: DatabaseWrapper, games: StatGame[], playerId: string) => {
  const stats = buildNightShotStats(games);
  const own = stats.players.get(playerId);
  if (!own || (own.killed === 0 && own.blackNights === 0)) return null;
  const partners = [...stats.pairs.values()]
    .filter((pair) => pair.victim === playerId && pair.kills >= 2)
    .sort((a, b) => b.kills - a.kills || a.together - b.together)
    .slice(0, 5);
  const names = new Map<string, string>();
  if (partners.length) {
    const rows = await db.all<any>(`SELECT id, nickname FROM players WHERE id IN (${partners.map(() => '?').join(',')})`, partners.map((pair) => pair.black));
    for (const row of rows) names.set(String(row.id), String(row.nickname || 'Игрок'));
  }
  return {
    killed: own.killed, games_as_red: own.redGames, black_nights: own.blackNights, black_misses: own.blackMisses,
    partners: partners.map((pair) => ({ player_id: pair.black, nickname: names.get(pair.black) || 'Игрок', kills: pair.kills, together: pair.together })),
  };
};

/** The player's reveal figures; for a Don also whom he most often names black / red and in which bundles (with nicknames). */
const profileReveals = async (db: DatabaseWrapper, games: StatGame[], playerId: string) => {
  const own = buildRevealStats(games).get(playerId);
  if (!own) return null;
  const { donTargets, donBundles, ...numbers } = own;
  const blackTop = Object.entries(donTargets).filter(([, value]) => value.black > 0).sort((a, b) => b[1].black - a[1].black).slice(0, 5);
  const redTop = Object.entries(donTargets).filter(([, value]) => value.red > 0).sort((a, b) => b[1].red - a[1].red).slice(0, 5);
  const bundleTop = Object.entries(donBundles).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const ids = [...new Set([...blackTop.map(([id]) => id), ...redTop.map(([id]) => id), ...bundleTop.flatMap(([key]) => key.split('|'))])];
  const names = new Map<string, string>();
  if (ids.length) {
    const rows = await db.all<any>(`SELECT id, nickname FROM players WHERE id IN (${ids.map(() => '?').join(',')})`, ids);
    for (const row of rows) names.set(String(row.id), String(row.nickname || 'Игрок'));
  }
  const name = (id: string) => names.get(id) || 'Игрок';
  return {
    ...numbers,
    don: {
      named_black: blackTop.map(([id, value]) => ({ player_id: id, nickname: name(id), count: value.black })),
      named_red: redTop.map(([id, value]) => ({ player_id: id, nickname: name(id), count: value.red })),
      bundles: bundleTop.map(([key, count]) => ({ nicknames: key.split('|').map(name), count })),
    },
  };
};

export async function loadPremiumProfileSummary(db: DatabaseWrapper, playerId: string, viewerId: string, organizer = false, filter: ProfileStatFilter = {}) {
  const player = await loadIdentity(db, playerId);
  const visibility = publicVisibility(player.profile_visibility_json);
  const isSelf = viewerId === playerId;
  const canSeePrivate = organizer || isSelf;
  const statsVisible = visibility.game_statistics || canSeePrivate;
  const [profile, elo, achievements, rankRow] = await Promise.all([
    loadPlayerGameProfile(db, playerId),
    eloRowsForPlayer(db, playerId),
    achievementHighlights(db, playerId),
    db.get<any>('SELECT 1 + COUNT(*) AS place FROM players WHERE COALESCE(contact_status, lifecycle_status, \'normal\') != \'blocked\' AND elo > ?', [numeric(player.elo)]),
  ]);
  if (!canSeePrivate) for (const achievement of achievements.earned) { achievement.evidence = null; achievement.steps = undefined; }
  const games = [...profile.clubGames, ...profile.tournamentGames].filter(isCompleted).sort((a, b) => dateTime(b.date) - dateTime(a.date));
  // One scope for every number of the statistics block: the chosen season (or all time) and the chosen evening format.
  const seasons = await loadRatingSeasons(db);
  // Recent form means the last ten completed games, never the last ten actions or journals.
  // Season is the most recent configured rating season; explicit historical season keys remain supported.
  const latestSeason = [...seasons].sort((a, b) => b.end - a.end)[0] || null;
  const chosenSeason = filter.period === 'season' ? latestSeason : seasons.find((item) => item.key === filter.period) || null;
  const periodKey = filter.period === 'recent10' ? 'recent10' : filter.period === 'season' && chosenSeason ? 'season' : chosenSeason ? chosenSeason.key : 'all';
  const formatKey: EveningFormat | 'all' = (EVENING_FORMATS as readonly string[]).includes(String(filter.format)) ? filter.format as EveningFormat : 'all';
  const inSeason = (game: PlayerGameHistoryItem, season: { start: number; end: number }) => { const time = dateTime(game.date); return time >= season.start && time < season.end; };
  const periodGames = chosenSeason ? games.filter((game) => inSeason(game, chosenSeason)) : games;
  const formatGames = formatKey === 'all' ? periodGames : periodGames.filter((game) => game.evening_format === formatKey);
  const scoped = periodKey === 'recent10' ? formatGames.slice(0, 10) : formatGames;
  const scopeActive = periodKey !== 'all' || formatKey !== 'all';
  const filters = {
    period: periodKey,
    format: formatKey,
    seasons: [...seasons].reverse().map((item) => ({ key: item.key, label: item.label, games: games.filter((game) => inSeason(game, item)).length })).filter((item) => item.games > 0),
    formats: EVENING_FORMATS.map((key) => ({ key, label: EVENING_FORMAT_LABELS[key], games: periodGames.filter((game) => game.evening_format === key).length })).filter((item) => item.games > 0),
    period_label: periodKey === 'recent10' ? 'Последние 10 игр' : chosenSeason ? chosenSeason.label : 'Вся карьера',
    format_label: formatKey === 'all' ? 'Все форматы' : EVENING_FORMAT_LABELS[formatKey],
  };
  const recent = scoped.slice(0, 5);
  const wins = scoped.filter((game) => game.won).length;
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
  const scopedStatGames = statsVisible
    ? (await loadStatGames(db).catch(() => [])).filter((game) => !scopeActive || scoped.some((own) => own.id === game.id))
    : [];
  return {
    viewer: { is_self: isSelf, is_organizer: organizer },
    player: identity,
    stats: visibility.game_statistics || canSeePrivate ? {
      games: scoped.length,
      wins,
      win_rate: winRatePercent(wins, scoped.length),
      recent_form: recent.map((game) => game.won ? 'W' : 'L'),
      recent_wins: recentWins,
      strongest_role: strongestRole(scoped),
      personal_elo_max: elo.length ? Math.max(numeric(player.elo), ...elo.map((item) => item.elo_after)) : numeric(player.elo),
      current_streak: winStreaks(scoped).current,
      best_streak: winStreaks(scoped).best,
      red: teamSplit(scoped, 'red'),
      black: teamSplit(scoped, 'black'),
      // One rule for the whole block: finished games inside the chosen scope (drafts are not counted).
      first_killed: scoped.filter((game) => game.first_killed).length,
      best_moves: scoped.filter((game) => game.best_move).length,
      zero_round_voted: scoped.filter((game) => game.zero_round_voted).length,
    } : null,
    season: statsVisible ? await loadSeasonBlock(db, playerId, games) : null,
    filters: statsVisible ? filters : null,
    game_stats: statsVisible ? buildPlayerGameStatistics(scopedStatGames, playerId) : null,
    night_shots: statsVisible ? await profileNightShots(db, scopedStatGames, playerId) : null,
    circle_exits: statsVisible ? buildCircleExits(scopedStatGames).get(playerId) ?? null : null,
    reveals: statsVisible ? await profileReveals(db, scopedStatGames, playerId) : null,
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

type GameQuery = ProfileStatFilter & { role?: string; team?: string; result?: string; from?: string; to?: string; limit?: number; offset?: number };
/** The season and evening-format scope the overview already uses, applied to the «Игры», «Роли» and «Elo» tabs as well. */
const scopeProfileGames = async <T extends PlayerGameHistoryItem>(db: DatabaseWrapper, games: T[], filter: ProfileStatFilter): Promise<T[]> => {
  const seasons = filter.period && filter.period !== 'all' && filter.period !== 'recent10' ? await loadRatingSeasons(db) : [];
  const season = filter.period === 'season'
    ? [...seasons].sort((a, b) => b.end - a.end)[0] || null
    : seasons.find((item) => item.key === filter.period) || null;
  const format = (EVENING_FORMATS as readonly string[]).includes(String(filter.format)) ? filter.format : null;
  const scoped = games.filter((game) => {
    if (season) { const time = dateTime(game.date); if (time < season.start || time >= season.end) return false; }
    return !format || game.evening_format === format;
  });
  return filter.period === 'recent10' ? scoped.slice(0, 10) : scoped;
};

export async function loadPremiumProfileGames(db: DatabaseWrapper, playerId: string, query: GameQuery) {
  const [profile, elo] = await Promise.all([loadPlayerGameProfile(db, playerId), eloRowsForPlayer(db, playerId)]);
  const eloById = new Map(elo.map((item) => [item.id, item]));
  let games = await scopeProfileGames(db, [...profile.clubGames, ...profile.tournamentGames].filter(isCompleted).sort((a, b) => dateTime(b.date) - dateTime(a.date)), query);
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
      protocol_path: gamePagePath(game.id),
    };
  });
  return { games: page, total, offset, limit, next_offset: offset + page.length < total ? offset + page.length : null };
}

export async function loadPremiumProfileRoles(db: DatabaseWrapper, playerId: string, filter: ProfileStatFilter = {}) {
  const [profile, elo] = await Promise.all([loadPlayerGameProfile(db, playerId), eloRowsForPlayer(db, playerId)]);
  const eloById = new Map(elo.map((item) => [item.id, item]));
  const games = await scopeProfileGames(db, [...profile.clubGames, ...profile.tournamentGames].filter(isCompleted).sort((a, b) => dateTime(b.date) - dateTime(a.date)), filter);
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
      win_rate: winRatePercent(wins, sample.length),
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

export async function loadPremiumProfileElo(db: DatabaseWrapper, playerId: string, range: PremiumProfileRange, filter: ProfileStatFilter = {}) {
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
      game_path: gamePagePath(key),
    });
  }
  const now = Date.now();
  const cutoff = range === 'month' ? now - 31 * 24 * 60 * 60 * 1000 : range === 'season' ? now - 120 * 24 * 60 * 60 * 1000 : 0;
  const scopeActive = Boolean(filter.period && filter.period !== 'all') || (EVENING_FORMATS as readonly string[]).includes(String(filter.format));
  const inScope = scopeActive ? new Set((await scopeProfileGames(db, games, filter)).map((game) => game.id)) : null;
  const ranged = cutoff ? points.filter((point) => dateTime(point.date) >= cutoff) : points;
  const selected = inScope ? ranged.filter((point) => inScope.has(point.id)) : ranged;
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
