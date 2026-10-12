import type { DatabaseWrapper } from '../../db/index.ts';
import { getRepositoryPlayerAvatarAsset } from '../../lib/playerAvatarManifest.ts';
import { EVENING_FORMATS, EVENING_FORMAT_LABELS, normalizeEveningFormat, type EveningFormat } from '../../lib/eveningFormat.ts';
import { winRatePercent } from '../../shared/stats.ts';
import { analyticsInputsVersion, CLUB_SNAPSHOT_INPUTS } from './analyticsInputsVersion.ts';
import { loadCompletedGameSnapshots, type CompletedGameSnapshot } from './clubGameAnalyticsService.ts';
import { loadRatingSeasons } from './clubSeasonService.ts';
import { loadPlayerEloHistory } from './playerEloHistoryService.ts';
import { loadStatGames } from './gameStatisticsService.ts';
import { buildPlayerGameStatistics, createStatMemo, type PlayerGameStatistics, type StatGame, type StatMemo } from '../../lib/gameStatistics.ts';
import { russianPlural } from '../../lib/russianPlural.ts';
import { buildNightShotStats } from '../../lib/nightShots.ts';
import { buildRevealStats } from '../../lib/revealStats.ts';

/**
 * Club rankings by one figure of the player statistics (owner request 2026-10-12): «who collected the most» wins, games,
 * a win streak, wins as sheriff… plus the Elo GAIN (or loss) of the chosen period — never the Elo itself. Every ranking is
 * counted over the same scope as the profile statistics: one rating season or all time, and one evening format or all.
 */

export const TOP_SIZE = 30;

type Group = 'Победы' | 'Игры' | 'Роли и команды' | 'Ход игры' | 'Меткость' | 'Отстрелы' | 'Вскрытия' | 'Elo';
export type MetricKey =
  | 'wins' | 'win_rate' | 'games' | 'best_streak'
  | 'red_wins' | 'black_wins' | 'red_win_rate' | 'black_win_rate'
  | 'citizen_wins' | 'sheriff_wins' | 'mafia_wins' | 'don_wins'
  | 'best_moves' | 'first_killed' | 'zero_round' | 'elo_gain'
  | 'votes_accuracy' | 'nominations_accuracy' | 'sheriff_checks' | 'don_checks' | 'best_move_black'
  | 'black_misses' | 'black_miss_rate' | 'times_shot' | 'night_pairs'
  | 'sheriff_reveals' | 'sheriff_found_black' | 'black_reveals' | 'black_covers';

/** A figure from the move chronology (votes, checks…): its sample is not «games», so it has its own minimum and wording. */
interface Sample { minimum: number; words: [string, string, string] }
interface MetricDef { key: MetricKey; label: string; group: Group; unit: 'count' | 'percent' | 'elo' | 'decimal'; minGames?: number; sample?: Sample; hint: string }

export const METRICS: MetricDef[] = [
  { key: 'wins', label: 'Победы', group: 'Победы', unit: 'count', hint: 'Больше всех побед' },
  { key: 'win_rate', label: 'Винрейт', group: 'Победы', unit: 'percent', minGames: 5, hint: 'Доля побед, от 5 игр' },
  { key: 'best_streak', label: 'Серия побед', group: 'Победы', unit: 'count', hint: 'Самая длинная серия побед подряд' },
  { key: 'games', label: 'Игры', group: 'Игры', unit: 'count', hint: 'Больше всех сыграно игр' },
  { key: 'red_wins', label: 'Победы за красных', group: 'Роли и команды', unit: 'count', hint: 'Победы мирным или шерифом' },
  { key: 'black_wins', label: 'Победы за чёрных', group: 'Роли и команды', unit: 'count', hint: 'Победы мафией или доном' },
  { key: 'red_win_rate', label: 'Винрейт за красных', group: 'Роли и команды', unit: 'percent', minGames: 3, hint: 'От 3 игр за красных' },
  { key: 'black_win_rate', label: 'Винрейт за чёрных', group: 'Роли и команды', unit: 'percent', minGames: 3, hint: 'От 3 игр за чёрных' },
  { key: 'citizen_wins', label: 'Победы мирным', group: 'Роли и команды', unit: 'count', hint: 'Победы в роли мирного' },
  { key: 'sheriff_wins', label: 'Победы шерифом', group: 'Роли и команды', unit: 'count', hint: 'Победы в роли шерифа' },
  { key: 'mafia_wins', label: 'Победы мафией', group: 'Роли и команды', unit: 'count', hint: 'Победы в роли мафии' },
  { key: 'don_wins', label: 'Победы доном', group: 'Роли и команды', unit: 'count', hint: 'Победы в роли дона' },
  { key: 'best_moves', label: 'Лучший ход', group: 'Ход игры', unit: 'count', hint: 'Сколько раз делал лучший ход' },
  { key: 'first_killed', label: 'Первым убит', group: 'Ход игры', unit: 'count', hint: 'Сколько раз был убит первым (ПУ)' },
  { key: 'zero_round', label: 'Нулевой круг', group: 'Ход игры', unit: 'count', hint: 'Сколько раз выставлен на нулевом круге' },
  { key: 'votes_accuracy', label: 'Меткость голосов', group: 'Меткость', unit: 'percent', sample: { minimum: 10, words: ['голос', 'голоса', 'голосов'] }, hint: 'Какая доля голосов красного ушла в чёрных' },
  { key: 'nominations_accuracy', label: 'Меткость выставлений', group: 'Меткость', unit: 'percent', sample: { minimum: 5, words: ['выставление', 'выставления', 'выставлений'] }, hint: 'Какая доля выставленных красным оказалась чёрной' },
  { key: 'sheriff_checks', label: 'Чёрные проверки шерифа', group: 'Меткость', unit: 'percent', sample: { minimum: 5, words: ['проверка', 'проверки', 'проверок'] }, hint: 'Какая доля проверок шерифа нашла чёрного' },
  { key: 'don_checks', label: 'Проверки дона', group: 'Меткость', unit: 'percent', sample: { minimum: 5, words: ['проверка', 'проверки', 'проверок'] }, hint: 'Какая доля проверок дона нашла шерифа' },
  { key: 'best_move_black', label: 'Лучший ход: чёрных в среднем', group: 'Меткость', unit: 'decimal', sample: { minimum: 3, words: ['ход', 'хода', 'ходов'] }, hint: 'Сколько чёрных в среднем в лучшем ходу (из 3)' },
  { key: 'black_misses', label: 'Промахи, когда в чёрной команде', group: 'Отстрелы', unit: 'count', sample: { minimum: 5, words: ['ночь', 'ночи', 'ночей'] }, hint: 'Сколько ночей без жертвы было в играх, где игрок был в чёрной команде (мафией или доном)' },
  { key: 'black_miss_rate', label: 'Доля промахов, когда в чёрной команде', group: 'Отстрелы', unit: 'percent', sample: { minimum: 10, words: ['ночь', 'ночи', 'ночей'] }, hint: 'Какая доля ночей прошла без жертвы, когда игрок был в чёрной команде' },
  { key: 'times_shot', label: 'Чаще всех убивают ночью', group: 'Отстрелы', unit: 'count', sample: { minimum: 5, words: ['игра', 'игры', 'игр'] }, hint: 'Сколько раз игрока убили ночью, пока он играл за красных' },
  { key: 'night_pairs', label: 'Пары: убит, когда в чёрных', group: 'Отстрелы', unit: 'count', hint: 'Игрок убит ночью, когда в чёрной команде был этот игрок (от 3 общих игр и 2 убийств)' },
  { key: 'sheriff_reveals', label: 'Вскрылся шерифом', group: 'Вскрытия', unit: 'count', sample: { minimum: 3, words: ['игра шерифом', 'игры шерифом', 'игр шерифом'] }, hint: 'Сколько раз настоящий шериф открыто назвал себя шерифом' },
  { key: 'sheriff_found_black', label: 'Нашёл чёрных, вскрывшись', group: 'Вскрытия', unit: 'count', sample: { minimum: 3, words: ['игра шерифом', 'игры шерифом', 'игр шерифом'] }, hint: 'Сколько чёрных (дон и мафия) шериф назвал в объявленных проверках' },
  { key: 'black_reveals', label: 'Вскрылся за чёрных', group: 'Вскрытия', unit: 'count', sample: { minimum: 3, words: ['игра за чёрных', 'игры за чёрных', 'игр за чёрных'] }, hint: 'Сколько раз мафия или дон открыто назвал себя шерифом' },
  { key: 'black_covers', label: 'Накрыл своего чёрного', group: 'Вскрытия', unit: 'count', sample: { minimum: 3, words: ['игра за чёрных', 'игры за чёрных', 'игр за чёрных'] }, hint: 'Сколько раз чёрный объявил красной проверку на своего напарника' },
  { key: 'elo_gain', label: 'Прирост Elo', group: 'Elo', unit: 'elo', hint: 'Сколько Elo набрал или потерял за период' },
];
const METRIC_BY_KEY = new Map(METRICS.map((metric) => [metric.key, metric]));

interface Agg {
  games: number; wins: number;
  redGames: number; redWins: number; blackGames: number; blackWins: number;
  roleWins: Record<'citizen' | 'sheriff' | 'mafia' | 'don', number>;
  streak: number; bestStreak: number;
  bestMoves: number; firstKilled: number; zeroRound: number;
  eloGain: number; hasElo: boolean;
}
const emptyAgg = (): Agg => ({
  games: 0, wins: 0, redGames: 0, redWins: 0, blackGames: 0, blackWins: 0,
  roleWins: { citizen: 0, sheriff: 0, mafia: 0, don: 0 }, streak: 0, bestStreak: 0,
  bestMoves: 0, firstKilled: 0, zeroRound: 0, eloGain: 0, hasElo: false,
});

/** Who was first killed / made the best move / was put up in the zero round, per finished game. */
type Highlights = Map<string, { firstKilled: Set<string>; bestMove: Set<string>; zeroRound: Set<string> }>;

const parseJson = (value: unknown): any => {
  if (typeof value !== 'string' || !value.trim()) return null;
  try { return JSON.parse(value); } catch { return null; }
};

async function loadHighlightsUncached(db: DatabaseWrapper): Promise<Highlights> {
  const out: Highlights = new Map();
  const entry = (gameId: string) => {
    let value = out.get(gameId);
    if (!value) { value = { firstKilled: new Set(), bestMove: new Set(), zeroRound: new Set() }; out.set(gameId, value); }
    return value;
  };
  const clubRows = await db.all<any>(`
    SELECT id, protocol_text FROM games
     WHERE evening_id IS NOT NULL AND archived_at IS NULL AND protocol_text IS NOT NULL
       AND json_valid(protocol_text) AND json_extract(protocol_text, '$.protocol.status') = 'completed'
  `);
  for (const row of clubRows) {
    const payload = parseJson(row.protocol_text);
    if (!payload || !Array.isArray(payload.player_results)) continue;
    const playerOf = new Map<string, string>();
    for (const result of payload.player_results) {
      if (result?.participant_id && result?.player_id) playerOf.set(String(result.participant_id), String(result.player_id));
    }
    const protocol = payload.protocol || {};
    const target = entry(`club:${row.id}`);
    const first = playerOf.get(String(protocol.first_killed_participant_id || ''));
    if (first) target.firstKilled.add(first);
    const zero = playerOf.get(String(protocol.zero_round_voted_participant_id || ''));
    if (zero) target.zeroRound.add(zero);
    for (const move of Array.isArray(protocol.best_moves) ? protocol.best_moves : []) {
      const player = playerOf.get(String(move?.participant_id || ''));
      if (player) target.bestMove.add(player);
    }
  }
  const tournamentRows = await db.all<any>(`
    SELECT tg.id AS game_id, tgp.first_killed_participant_id AS first_id, tgp.zero_round_voted_participant_id AS zero_id,
           (SELECT player_id FROM tournament_participants WHERE id = tgp.first_killed_participant_id) AS first_player,
           (SELECT player_id FROM tournament_participants WHERE id = tgp.zero_round_voted_participant_id) AS zero_player
      FROM tournament_game_protocols tgp JOIN tournament_games tg ON tg.id = tgp.game_id
     WHERE tg.status = 'completed' AND tgp.status = 'completed'
  `).catch(() => []);
  for (const row of tournamentRows) {
    const target = entry(`tournament:${row.game_id}`);
    if (row.first_player) target.firstKilled.add(String(row.first_player));
    if (row.zero_player) target.zeroRound.add(String(row.zero_player));
  }
  const bestRows = await db.all<any>(`
    SELECT b.game_id, tp.player_id FROM tournament_game_best_moves b
      JOIN tournament_participants tp ON tp.id = b.participant_id
  `).catch(() => []);
  for (const row of bestRows) if (row.player_id) entry(`tournament:${row.game_id}`).bestMove.add(String(row.player_id));
  return out;
}

// Parsing every protocol is expensive on the synchronous connection: keep the result until a watched input changes, and
// at most a minute (the protocol tables are not all watched).
const HIGHLIGHT_TTL_MS = 60_000;
const highlightCache = new WeakMap<object, { version: string | null; at: number; promise: Promise<Highlights> }>();
async function loadHighlights(db: DatabaseWrapper): Promise<Highlights> {
  const version = analyticsInputsVersion(db, 'club_snapshots', CLUB_SNAPSHOT_INPUTS);
  const cached = highlightCache.get(db as object);
  if (cached && cached.version === version && Date.now() - cached.at < HIGHLIGHT_TTL_MS) return cached.promise;
  const promise = loadHighlightsUncached(db);
  highlightCache.set(db as object, { version, at: Date.now(), promise });
  void promise.catch(() => { if (highlightCache.get(db as object)?.promise === promise) highlightCache.delete(db as object); });
  return promise;
}

// The move chronology of every finished game is parsed once per input change (at most a minute): the analysis of each game
// is memoised on the game object, so many rankings and profiles reuse it.
const statGameCache = new WeakMap<object, { version: string | null; at: number; promise: Promise<{ games: StatGame[]; memo: StatMemo }> }>();
async function loadStatGamesCached(db: DatabaseWrapper): Promise<{ games: StatGame[]; memo: StatMemo }> {
  const version = analyticsInputsVersion(db, 'club_snapshots', CLUB_SNAPSHOT_INPUTS);
  const cached = statGameCache.get(db as object);
  if (cached && cached.version === version && Date.now() - cached.at < HIGHLIGHT_TTL_MS) return cached.promise;
  // These game objects are never mutated, so the analysis of each one can be reused by every player and every request.
  const promise = loadStatGames(db).catch(() => [] as StatGame[]).then((games) => ({ games, memo: createStatMemo() }));
  statGameCache.set(db as object, { version, at: Date.now(), promise });
  return promise;
}

/** The value of a chronology figure and the size of the sample behind it; null when there is nothing to divide by. */
const accuracyOf = (stats: PlayerGameStatistics, key: MetricKey): { value: number; sample: number } | null => {
  const share = key === 'votes_accuracy' ? stats.votesAsRed : key === 'nominations_accuracy' ? stats.nominationsAsRed
    : key === 'sheriff_checks' ? stats.sheriffChecks : key === 'don_checks' ? stats.donChecks : null;
  if (share) return share.percent === null ? null : { value: share.percent, sample: share.total };
  if (key === 'best_move_black') return stats.bestMove.averageBlack === null ? null : { value: stats.bestMove.averageBlack, sample: stats.bestMove.count };
  return null;
};

const visibleStats = (raw: unknown) => {
  const parsed = parseJson(raw) || {};
  return parsed.game_statistics !== false;
};

const avatarUrl = (id: string, hasDb: unknown, suppressed: unknown) =>
  Number(hasDb || 0) || (!Number(suppressed || 0) && Boolean(getRepositoryPlayerAvatarAsset(id)))
    ? `/api/player/players/${encodeURIComponent(id)}/avatar` : null;

const metricValue = (agg: Agg, key: MetricKey): number | null => {
  switch (key) {
    case 'wins': return agg.wins;
    case 'games': return agg.games;
    case 'win_rate': return winRatePercent(agg.wins, agg.games);
    case 'best_streak': return agg.bestStreak;
    case 'red_wins': return agg.redWins;
    case 'black_wins': return agg.blackWins;
    case 'red_win_rate': return winRatePercent(agg.redWins, agg.redGames);
    case 'black_win_rate': return winRatePercent(agg.blackWins, agg.blackGames);
    case 'citizen_wins': return agg.roleWins.citizen;
    case 'sheriff_wins': return agg.roleWins.sheriff;
    case 'mafia_wins': return agg.roleWins.mafia;
    case 'don_wins': return agg.roleWins.don;
    case 'best_moves': return agg.bestMoves;
    case 'first_killed': return agg.firstKilled;
    case 'zero_round': return agg.zeroRound;
    case 'elo_gain': return agg.hasElo ? Math.round(agg.eloGain * 10) / 10 : null;
    default: return null;
  }
};

/** Games behind the figure: the sample size next to a percentage, the whole count otherwise. */
const sampleGames = (agg: Agg, key: MetricKey) => key === 'red_win_rate' ? agg.redGames : key === 'black_win_rate' ? agg.blackGames : agg.games;

const valueText = (value: number, unit: MetricDef['unit']) => {
  if (unit === 'decimal') return value.toFixed(1).replace('.', ',');
  if (unit === 'percent') return `${Math.round(value)}%`;
  if (unit === 'elo') {
    const rounded = Math.round(value);
    return `${rounded > 0 ? '+' : rounded < 0 ? '−' : ''}${Math.abs(rounded)}`;
  }
  return String(Math.round(value));
};

export interface MetricRatingQuery { metric?: string; period?: string; format?: string }

export async function loadMetricRating(db: DatabaseWrapper, viewerId: string, query: MetricRatingQuery) {
  const metric = METRIC_BY_KEY.get(query.metric as MetricKey) || METRICS[0];
  const seasons = await loadRatingSeasons(db);
  const season = seasons.find((item) => item.key === query.period) || null;
  const formatKey: EveningFormat | 'all' = (EVENING_FORMATS as readonly string[]).includes(String(query.format)) ? query.format as EveningFormat : 'all';

  const [snapshots, highlights, timeline, formatRows, playerRows] = await Promise.all([
    loadCompletedGameSnapshots(db),
    loadHighlights(db),
    loadPlayerEloHistory(db),
    db.all<any>('SELECT id, format FROM game_evenings'),
    db.all<any>(`
      SELECT p.id, p.nickname, p.profile_visibility_json,
             EXISTS(SELECT 1 FROM player_avatars pa WHERE pa.player_id = p.id) AS has_db_avatar,
             EXISTS(SELECT 1 FROM player_avatar_repository_suppression s WHERE s.player_id = p.id) AS avatar_suppressed
        FROM players p
       WHERE COALESCE(p.contact_status, 'normal') != 'blocked'
         AND COALESCE(p.source, '') != 'legacy_guest_migrated'
         AND COALESCE(p.lifecycle_status, 'normal') NOT IN ('archived', 'merged')
    `),
  ]);
  const eveningFormat = new Map<string, EveningFormat>(formatRows.map((row: any) => [String(row.id), normalizeEveningFormat(row.format)]));
  const formatOf = (snapshot: CompletedGameSnapshot): EveningFormat => snapshot.source === 'tournament' ? 'TOURNAMENT' : eveningFormat.get(snapshot.event_id) || 'CASUAL';

  const inPeriod = (snapshot: CompletedGameSnapshot) => !season || (snapshot.dateMs >= season.start && snapshot.dateMs < season.end);
  const periodSnapshots = snapshots.filter(inPeriod);
  const scoped = (formatKey === 'all' ? periodSnapshots : periodSnapshots.filter((snapshot) => formatOf(snapshot) === formatKey))
    .sort((a, b) => a.dateMs - b.dateMs || a.game_number - b.game_number || a.id.localeCompare(b.id));
  const scopedIds = new Set(scoped.map((snapshot) => snapshot.id));

  const aggs = new Map<string, Agg>();
  const aggOf = (id: string) => { let value = aggs.get(id); if (!value) { value = emptyAgg(); aggs.set(id, value); } return value; };
  for (const snapshot of scoped) {
    const marks = highlights.get(snapshot.id);
    for (const result of snapshot.players) {
      const agg = aggOf(result.player_id);
      agg.games += 1;
      if (result.team === 'red') agg.redGames += 1; else agg.blackGames += 1;
      if (result.won) {
        agg.wins += 1; agg.streak += 1; agg.bestStreak = Math.max(agg.bestStreak, agg.streak);
        if (result.team === 'red') agg.redWins += 1; else agg.blackWins += 1;
        if (result.role) agg.roleWins[result.role] += 1;
      } else agg.streak = 0;
      if (marks?.bestMove.has(result.player_id)) agg.bestMoves += 1;
      if (marks?.firstKilled.has(result.player_id)) agg.firstKilled += 1;
      if (marks?.zeroRound.has(result.player_id)) agg.zeroRound += 1;
    }
  }
  // Elo is only ever the change over the chosen games; evenings that do not count for Elo have no event and add nothing.
  for (const event of timeline) {
    if (!scopedIds.has(`${event.source}:${event.sourceId}`)) continue;
    for (const row of event.players) {
      const agg = aggs.get(row.playerId);
      if (!agg) continue;
      agg.eloGain += row.totalDelta;
      agg.hasElo = true;
    }
  }

  // Chronology figures are computed only when asked for.
  const accuracy = new Map<string, { value: number; sample: number }>();
  const nightMetrics = new Set<MetricKey>(['black_misses', 'black_miss_rate', 'times_shot', 'night_pairs']);
  const revealMetrics = new Set<MetricKey>(['sheriff_reveals', 'sheriff_found_black', 'black_reveals', 'black_covers']);
  const statSource = metric.sample || metric.key === 'night_pairs' ? await loadStatGamesCached(db) : { games: [] as StatGame[], memo: createStatMemo() };
  const scopedStat = statSource.games.filter((game) => scopedIds.has(game.id));
  const night = nightMetrics.has(metric.key) ? buildNightShotStats(scopedStat) : null;
  const reveal = revealMetrics.has(metric.key) ? buildRevealStats(scopedStat, statSource.memo.facts) : null;
  if (metric.sample && reveal) {
    for (const [id, stats] of reveal) {
      if (metric.key === 'sheriff_reveals' && stats.sheriffGames) accuracy.set(id, { value: stats.sheriffReveals, sample: stats.sheriffGames });
      if (metric.key === 'sheriff_found_black' && stats.sheriffGames) accuracy.set(id, { value: stats.sheriffCheckedDon + stats.sheriffCheckedMafia, sample: stats.sheriffGames });
      if (metric.key === 'black_reveals' && stats.blackGames) accuracy.set(id, { value: stats.blackReveals, sample: stats.blackGames });
      if (metric.key === 'black_covers' && stats.blackGames) accuracy.set(id, { value: stats.blackCovers, sample: stats.blackGames });
    }
  } else if (metric.sample && night) {
    for (const [id, stats] of night.players) {
      if (metric.key === 'black_misses' && stats.blackNights) accuracy.set(id, { value: stats.blackMisses, sample: stats.blackNights });
      if (metric.key === 'black_miss_rate' && stats.blackNights) accuracy.set(id, { value: winRatePercent(stats.blackMisses, stats.blackNights), sample: stats.blackNights });
      if (metric.key === 'times_shot' && stats.redGames) accuracy.set(id, { value: stats.killed, sample: stats.redGames });
    }
  } else if (metric.sample) {
    for (const id of aggs.keys()) {
      const found = accuracyOf(buildPlayerGameStatistics(scopedStat, id, statSource.memo), metric.key);
      if (found) accuracy.set(id, found);
    }
  }

  if (metric.key === 'night_pairs' && night) {
    const visible = new Map(playerRows.filter((player: any) => visibleStats(player.profile_visibility_json) || String(player.id) === viewerId).map((player: any) => [String(player.id), player]));
    const pairRows = [...night.pairs.values()]
      .filter((pair) => pair.kills >= 2 && pair.together >= 3 && visible.has(pair.victim) && visible.has(pair.black))
      .sort((a, b) => b.kills - a.kills || b.kills / b.together - a.kills / a.together || a.together - b.together)
      .map((pair, index, all) => ({ pair, index, rank: 0, all }));
    let place = 0;
    pairRows.forEach((row, index) => { place = index > 0 && pairRows[index - 1].pair.kills === row.pair.kills ? place : index + 1; row.rank = place; });
    const nick = (id: string) => String(visible.get(id)?.nickname || 'Игрок');
    const toPair = (row: (typeof pairRows)[number]) => ({
      rank: row.rank, player_id: row.pair.victim, nickname: nick(row.pair.victim), avatar_url: avatarUrl(row.pair.victim, visible.get(row.pair.victim)?.has_db_avatar, visible.get(row.pair.victim)?.avatar_suppressed),
      partner_id: row.pair.black, partner_nickname: nick(row.pair.black),
      value: row.pair.kills, value_text: String(row.pair.kills), games: row.pair.together,
      sample_text: `из ${row.pair.together} общих игр`,
      is_me: viewerId !== 'organizer' && row.pair.victim === viewerId,
    });
    return {
      metric: { key: metric.key, label: metric.label, group: metric.group, unit: metric.unit, hint: metric.hint, min_games: null, min_sample: null },
      metrics: METRICS.map((item) => ({ key: item.key, label: item.label, group: item.group })),
      filters: {
        period: season ? season.key : 'all', format: formatKey,
        period_label: season ? season.label : 'Всё время', format_label: formatKey === 'all' ? 'Все форматы' : EVENING_FORMAT_LABELS[formatKey],
        seasons: [...seasons].reverse().map((item) => ({ key: item.key, label: item.label })),
        formats: EVENING_FORMATS.map((key) => ({ key, label: EVENING_FORMAT_LABELS[key] })),
      },
      games_in_scope: scoped.length, total: pairRows.length, rows: pairRows.slice(0, TOP_SIZE).map(toPair), me: null,
    };
  }

  const viewerIsPlayer = viewerId !== 'organizer';
  const rows = playerRows.flatMap((player: any) => {
    const id = String(player.id);
    const agg = aggs.get(id);
    if (!agg) return [];
    if (!visibleStats(player.profile_visibility_json) && id !== viewerId) return [];
    const found = metric.sample ? accuracy.get(id) : null;
    const value = metric.sample ? (found ? found.value : null) : metricValue(agg, metric.key);
    if (value === null) return [];
    if (metric.sample && (found?.sample ?? 0) < metric.sample.minimum) return [];
    if (metric.minGames && sampleGames(agg, metric.key) < metric.minGames) return [];
    const sample = metric.sample ? found!.sample : sampleGames(agg, metric.key);
    return [{ id, nickname: String(player.nickname || 'Игрок'), value, games: sample, agg, avatar: avatarUrl(id, player.has_db_avatar, player.avatar_suppressed) }];
  });
  rows.sort((a, b) => b.value - a.value
    || winRatePercent(b.agg.wins, b.agg.games) - winRatePercent(a.agg.wins, a.agg.games)
    || a.games - b.games
    || a.nickname.localeCompare(b.nickname, 'ru'));
  // Equal values share a place (1, 2, 2, 4).
  const ranked = rows.map((row, index) => {
    const same = index > 0 && rows[index - 1].value === row.value;
    return { ...row, rank: same ? 0 : index + 1 };
  });
  for (let i = 0; i < ranked.length; i++) if (ranked[i].rank === 0) ranked[i].rank = ranked[i - 1].rank;
  const toRow = (row: (typeof ranked)[number]) => ({
    rank: row.rank, player_id: row.id, nickname: row.nickname, avatar_url: row.avatar,
    value: row.value, value_text: valueText(row.value, metric.unit), games: row.games,
    sample_text: metric.sample ? `${row.games} ${russianPlural(row.games, ...metric.sample.words)}` : null, is_me: viewerIsPlayer && row.id === viewerId,
  });
  const top = ranked.slice(0, TOP_SIZE).map(toRow);
  const mine = viewerIsPlayer ? ranked.find((row) => row.id === viewerId) : undefined;

  return {
    metric: { key: metric.key, label: metric.label, group: metric.group, unit: metric.unit, hint: metric.hint, min_games: metric.minGames ?? null, min_sample: metric.sample ? { minimum: metric.sample.minimum, word: metric.sample.words[2] } : null },
    metrics: METRICS.map((item) => ({ key: item.key, label: item.label, group: item.group })),
    filters: {
      period: season ? season.key : 'all',
      format: formatKey,
      period_label: season ? season.label : 'Всё время',
      format_label: formatKey === 'all' ? 'Все форматы' : EVENING_FORMAT_LABELS[formatKey],
      seasons: [...seasons].reverse().map((item) => ({ key: item.key, label: item.label })),
      formats: EVENING_FORMATS.map((key) => ({ key, label: EVENING_FORMAT_LABELS[key] })),
    },
    games_in_scope: scoped.length,
    total: ranked.length,
    rows: top,
    me: mine && !top.some((row) => row.is_me) ? toRow(mine) : null,
  };
}
