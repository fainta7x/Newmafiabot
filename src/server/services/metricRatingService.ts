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
import { buildRevealStats, emptyRevealStats } from '../../lib/revealStats.ts';
import { buildCircleExits } from '../../lib/circleExits.ts';
import { buildZeroRoundPlayerCounts } from '../../lib/zeroRoundPlayerCounts.ts';

/**
 * Club rankings by one figure of the player statistics (owner request 2026-10-12): «who collected the most» wins, games,
 * a win streak, wins as sheriff… plus the Elo GAIN (or loss) of the chosen period — never the Elo itself. Every ranking is
 * counted over the same scope as the profile statistics: one rating season or all time, and one evening format or all.
 */

export const TOP_SIZE = 30;

type Group = 'Победы' | 'Игры' | 'Роли' | 'Команды' | 'Ход игры' | 'Меткость' | 'Отстрелы' | 'Вскрытия' | 'Федерация' | 'Elo';
export type MetricKey =
  | 'wins' | 'win_rate' | 'games' | 'best_streak'
  | 'red_wins' | 'black_wins' | 'red_win_rate' | 'black_win_rate'
  | 'citizen_wins' | 'sheriff_wins' | 'mafia_wins' | 'don_wins'
  | 'best_moves' | 'first_killed' | 'zero_round' | 'zero_round_broke' | 'zero_round_raised' | 'elo_gain'
  | 'votes_accuracy' | 'nominations_accuracy' | 'sheriff_checks' | 'don_checks' | 'best_move_black'
  | 'black_misses' | 'black_miss_rate' | 'times_shot' | 'night_pairs'
  | 'fed_avg_place' | 'fed_best_place' | 'fed_tournaments' | 'critical_exits' | 'sheriff_reveals' | 'sheriff_found_black' | 'black_reveals' | 'black_covers' | 'don_reveals' | 'don_handed_reveal';

/** The sample indicates the unit of observed events, never an eligibility cutoff. */
interface Sample { words: [string, string, string] }
interface MetricDef { key: MetricKey; label: string; group: Group; unit: 'count' | 'percent' | 'elo' | 'decimal'; sample?: Sample; hint: string; /** A place in a tournament: the smaller the better. */ lowerIsBetter?: boolean }

export const METRICS: MetricDef[] = [
  { key: 'wins', label: 'Победы', group: 'Победы', unit: 'count', hint: 'Больше всех побед' },
  { key: 'win_rate', label: 'Винрейт', group: 'Победы', unit: 'percent', hint: 'Доля побед среди всех сыгранных игр' },
  { key: 'best_streak', label: 'Серия побед', group: 'Победы', unit: 'count', hint: 'Самая длинная серия побед подряд' },
  { key: 'games', label: 'Игры', group: 'Игры', unit: 'count', hint: 'Больше всех сыграно игр' },
  { key: 'red_wins', label: 'Победы за красных', group: 'Команды', unit: 'count', hint: 'Победы мирным или шерифом' },
  { key: 'black_wins', label: 'Победы за чёрных', group: 'Команды', unit: 'count', hint: 'Победы мафией или доном' },
  { key: 'red_win_rate', label: 'Винрейт за красных', group: 'Команды', unit: 'percent', hint: 'Доля побед среди игр за красных' },
  { key: 'black_win_rate', label: 'Винрейт за чёрных', group: 'Команды', unit: 'percent', hint: 'Доля побед среди игр за чёрных' },
  { key: 'citizen_wins', label: 'Победы мирным', group: 'Роли', unit: 'count', hint: 'Победы в роли мирного' },
  { key: 'sheriff_wins', label: 'Победы шерифом', group: 'Роли', unit: 'count', hint: 'Победы в роли шерифа' },
  { key: 'mafia_wins', label: 'Победы мафией', group: 'Роли', unit: 'count', hint: 'Победы в роли мафии' },
  { key: 'don_wins', label: 'Победы доном', group: 'Роли', unit: 'count', hint: 'Победы в роли дона' },
  { key: 'best_moves', label: 'Лучший ход', group: 'Ход игры', unit: 'count', hint: 'Сколько раз игрок сделал лучший ход по протоколу' },
  { key: 'first_killed', label: 'ПУ', group: 'Ход игры', unit: 'count', hint: 'Сколько раз был убит первым (ПУ)' },
  { key: 'zero_round', label: 'Заголосован в нулевом круге', group: 'Ход игры', unit: 'count', hint: 'Сколько раз игрока заголосовали в нулевом круге' },
  { key: 'zero_round_broke', label: 'Сломал в нуле', group: 'Ход игры', unit: 'count', sample: { words: ['случай', 'случая', 'случаев'] }, hint: 'Сколько раз игрок прямо отмечен судьёй как сломавший попил нулевого круга; по одним итоговым голосам не угадываем' },
  { key: 'zero_round_raised', label: 'Подняли в нуле', group: 'Ход игры', unit: 'count', sample: { words: ['случай', 'случая', 'случаев'] }, hint: 'Сколько раз игрок оказался в подтверждённом попиле на первом голосовании нулевого круга' },
  { key: 'votes_accuracy', label: 'Меткость голосов', group: 'Меткость', unit: 'percent', sample: { words: ['голос', 'голоса', 'голосов'] }, hint: 'Какая доля голосов красного ушла в чёрных' },
  { key: 'nominations_accuracy', label: 'Меткость выставлений', group: 'Меткость', unit: 'percent', sample: { words: ['выставление', 'выставления', 'выставлений'] }, hint: 'Какая доля выставленных красным оказалась чёрной' },
  { key: 'sheriff_checks', label: 'Чёрные проверки шерифа', group: 'Меткость', unit: 'percent', sample: { words: ['проверка', 'проверки', 'проверок'] }, hint: 'Какая доля проверок шерифа нашла чёрного' },
  { key: 'don_checks', label: 'Проверки дона', group: 'Меткость', unit: 'percent', sample: { words: ['проверка', 'проверки', 'проверок'] }, hint: 'Какая доля проверок дона нашла шерифа' },
  { key: 'best_move_black', label: 'Лучший ход: чёрных в среднем', group: 'Меткость', unit: 'decimal', sample: { words: ['ход', 'хода', 'ходов'] }, hint: 'Сколько чёрных в среднем в лучшем ходу (из 3)' },
  { key: 'black_misses', label: 'Промахи, когда в чёрной команде', group: 'Отстрелы', unit: 'count', sample: { words: ['ночь', 'ночи', 'ночей'] }, hint: 'Сколько ночей без жертвы было в играх, где игрок был в чёрной команде (мафией или доном)' },
  { key: 'black_miss_rate', label: 'Доля промахов, когда в чёрной команде', group: 'Отстрелы', unit: 'percent', sample: { words: ['ночь', 'ночи', 'ночей'] }, hint: 'Какая доля ночей прошла без жертвы, когда игрок был в чёрной команде' },
  { key: 'times_shot', label: 'Чаще всех убивают ночью', group: 'Отстрелы', unit: 'count', sample: { words: ['игра', 'игры', 'игр'] }, hint: 'Сколько раз игрока убили ночью, пока он играл за красных' },
  { key: 'night_pairs', label: 'Пары: убит, когда в чёрных', group: 'Отстрелы', unit: 'count', hint: 'Сколько раз игрок был убит ночью, когда этот игрок находился в чёрной команде' },
  { key: 'fed_avg_place', label: 'Среднее место на турнирах федерации', group: 'Федерация', unit: 'decimal', lowerIsBetter: true, sample: { words: ['турнир', 'турнира', 'турниров'] }, hint: 'Среднее место в итоговой таблице турниров GoMafia (меньше — лучше); считаются игроки с подтверждённой привязкой. Не зависит от выбранного периода и формата клуба' },
  { key: 'fed_best_place', label: 'Лучшее место на турнире федерации', group: 'Федерация', unit: 'count', lowerIsBetter: true, sample: { words: ['турнир', 'турнира', 'турниров'] }, hint: 'Лучшее итоговое место на турнире GoMafia (1 — победа)' },
  { key: 'fed_tournaments', label: 'Турниров сыграно в федерации', group: 'Федерация', unit: 'count', sample: { words: ['турнир', 'турнира', 'турниров'] }, hint: 'Сколько турниров GoMafia с опубликованным итогом сыграл игрок' },
  { key: 'critical_exits', label: 'Заголосован на критике', group: 'Ход игры', unit: 'count', sample: { words: ['игра', 'игры', 'игр'] }, hint: 'Сколько раз игрока заголосовали на критическом круге (красных больше чёрных не более чем на 2)' },
  { key: 'sheriff_reveals', label: 'Вскрылся шерифом', group: 'Вскрытия', unit: 'count', sample: { words: ['игра шерифом', 'игры шерифом', 'игр шерифом'] }, hint: 'Сколько раз настоящий шериф открыто назвал себя шерифом' },
  { key: 'sheriff_found_black', label: 'Нашёл чёрных, вскрывшись', group: 'Вскрытия', unit: 'count', sample: { words: ['игра шерифом', 'игры шерифом', 'игр шерифом'] }, hint: 'Сколько чёрных (дон и мафия) шериф назвал в объявленных проверках' },
  { key: 'black_reveals', label: 'Вскрылся за чёрных', group: 'Вскрытия', unit: 'count', sample: { words: ['игра за чёрных', 'игры за чёрных', 'игр за чёрных'] }, hint: 'Сколько раз мафия или дон открыто назвал себя шерифом' },
  { key: 'black_covers', label: 'Накрыл своего чёрного', group: 'Вскрытия', unit: 'count', sample: { words: ['игра за чёрных', 'игры за чёрных', 'игр за чёрных'] }, hint: 'Сколько раз чёрный объявил красной проверку на своего напарника' },
  { key: 'don_reveals', label: 'Вскрылся доном', group: 'Вскрытия', unit: 'count', sample: { words: ['игра доном', 'игры доном', 'игр доном'] }, hint: 'Сколько раз дон сам открыто назвал себя шерифом' },
  { key: 'don_handed_reveal', label: 'Отдал вскрытие обычному чёрному', group: 'Вскрытия', unit: 'count', sample: { words: ['игра доном', 'игры доном', 'игр доном'] }, hint: 'Сколько раз вскрылся обычный чёрный, пока дон молчал' },
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


/** Federation tournament results (GoMafia, verified links only): the places of the final standings, per club player. */
async function loadFederationPlaces(db: DatabaseWrapper): Promise<Map<string, number[]>> {
  const out = new Map<string, number[]>();
  try {
    const rows = await db.all<any>(`
      SELECT l.player_id, s.snapshot_json FROM gomafia_player_links l
        JOIN gomafia_player_snapshots s ON s.external_player_id = l.external_player_id AND s.scope = 'career-v1'
       WHERE l.status = 'verified'`);
    for (const row of rows) {
      let tournaments: any[] = [];
      try { tournaments = JSON.parse(row.snapshot_json)?.career?.tournaments ?? []; } catch { continue; }
      const places = tournaments.map((item) => Number(item?.place)).filter((place) => Number.isInteger(place) && place > 0);
      if (places.length) out.set(String(row.player_id), places);
    }
  } catch {
    // The federation tables exist only after the first link: no data means no federation ranking.
  }
  return out;
}

export interface MetricRatingQuery { metric?: string; period?: string; format?: string }

/** The games of the chosen season and evening format (oldest first) with everything the club tables need around them. */
export async function loadMetricScope(db: DatabaseWrapper, query: { period?: string; format?: string }) {
  const seasons = await loadRatingSeasons(db);
  let season = seasons.find((item) => item.key === query.period) || null;
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

  const years = [...new Set(snapshots.map((item) => new Date(item.dateMs).getUTCFullYear()).filter((year) => Number.isInteger(year)))].sort((a, b) => b - a);
  if (!season && /^year:\\d{4}$/.test(String(query.period || ''))) {
    const year = Number(String(query.period).slice(5));
    if (years.includes(year)) season = { key: `year:${year}`, label: `${year} год`, start: Date.UTC(year, 0, 1), end: Date.UTC(year + 1, 0, 1) };
  }
  const availableSeasons = [...seasons].reverse().map((item) => ({ key: item.key, label: item.label }));
  const availableYears = years.map((year) => ({ key: `year:${year}`, label: `${year} год` }));
  const inPeriod = (snapshot: CompletedGameSnapshot) => !season || (snapshot.dateMs >= season.start && snapshot.dateMs < season.end);
  const periodSnapshots = snapshots.filter(inPeriod);
  const scoped = (formatKey === 'all' ? periodSnapshots : periodSnapshots.filter((snapshot) => formatOf(snapshot) === formatKey))
    .sort((a, b) => a.dateMs - b.dateMs || a.game_number - b.game_number || a.id.localeCompare(b.id));
  const scopedIds = new Set(scoped.map((snapshot) => snapshot.id));

  return { seasons, season, availablePeriods: [...availableSeasons, ...availableYears], formatKey, scoped, scopedIds, highlights, timeline, playerRows };
}

export async function loadMetricRating(db: DatabaseWrapper, viewerId: string, query: MetricRatingQuery, options: { scope?: Awaited<ReturnType<typeof loadMetricScope>>; all?: boolean } = {}) {
  const metric = METRIC_BY_KEY.get(query.metric as MetricKey) || METRICS[0];
  const { season, availablePeriods, formatKey, scoped, scopedIds, highlights, timeline, playerRows } = options.scope ?? await loadMetricScope(db, query);

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
  const revealMetrics = new Set<MetricKey>(['sheriff_reveals', 'sheriff_found_black', 'black_reveals', 'black_covers', 'don_reveals', 'don_handed_reveal']);
  const statSource = (metric.sample && metric.group !== 'Федерация') || metric.key === 'night_pairs' ? await loadStatGamesCached(db) : { games: [] as StatGame[], memo: createStatMemo() };
  const scopedStat = statSource.games.filter((game) => scopedIds.has(game.id));
  const night = nightMetrics.has(metric.key) ? buildNightShotStats(scopedStat) : null;
  if (metric.key === 'zero_round_broke' || metric.key === 'zero_round_raised') {
    const results = buildZeroRoundPlayerCounts(scopedStat);
    for (const [id, result] of results) {
      const count = metric.key === 'zero_round_broke' ? result.broke : result.raised;
      if (count) accuracy.set(id, { value: count, sample: count });
    }
  }
  if (metric.group === 'Федерация') {
    for (const [id, places] of await loadFederationPlaces(db)) {
      const value = metric.key === 'fed_avg_place' ? places.reduce((sum, place) => sum + place, 0) / places.length
        : metric.key === 'fed_best_place' ? Math.min(...places) : places.length;
      accuracy.set(id, { value, sample: places.length });
    }
  } else if (metric.key === 'critical_exits') {
    for (const [id, stats] of buildCircleExits(scopedStat, statSource.memo.facts)) if (stats.games) accuracy.set(id, { value: stats.critical, sample: stats.games });
  }
  const reveal = revealMetrics.has(metric.key) ? buildRevealStats(scopedStat, statSource.memo.facts) : null;
  if (metric.sample && reveal) {
    for (const [id, stats] of reveal) {
      if (metric.key === 'sheriff_reveals' && stats.sheriffGames) accuracy.set(id, { value: stats.sheriffReveals, sample: stats.sheriffGames });
      if (metric.key === 'sheriff_found_black' && stats.sheriffGames) accuracy.set(id, { value: stats.sheriffCheckedDon + stats.sheriffCheckedMafia, sample: stats.sheriffGames });
      if (metric.key === 'black_reveals' && stats.blackGames) accuracy.set(id, { value: stats.blackReveals, sample: stats.blackGames });
      if (metric.key === 'don_reveals' && stats.donGames) accuracy.set(id, { value: stats.blackRevealsDon, sample: stats.donGames });
      if (metric.key === 'don_handed_reveal' && stats.donGames) accuracy.set(id, { value: stats.donHandedReveal, sample: stats.donGames });
      if (metric.key === 'black_covers' && stats.blackGames) accuracy.set(id, { value: stats.blackCovers, sample: stats.blackGames });
    }
  } else if (metric.key === 'critical_exits' || metric.group === 'Федерация' || metric.key === 'zero_round_broke' || metric.key === 'zero_round_raised') {
    // filled above
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
      .filter((pair) => pair.kills > 0 && pair.together > 0 && visible.has(pair.victim) && visible.has(pair.black))
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
        seasons: availablePeriods,
        formats: EVENING_FORMATS.map((key) => ({ key, label: EVENING_FORMAT_LABELS[key] })),
      },
      games_in_scope: scoped.length, total: pairRows.length, rows: pairRows.slice(0, options.all ? undefined : TOP_SIZE).map(toPair), me: null,
    };
  }

  const viewerIsPlayer = viewerId !== 'organizer';
  const rows = playerRows.flatMap((player: any) => {
    const id = String(player.id);
    const agg = aggs.get(id) ?? (metric.group === 'Федерация' ? emptyAgg() : undefined);
    if (!agg) return [];
    if (!visibleStats(player.profile_visibility_json) && id !== viewerId) return [];
    const found = metric.sample ? accuracy.get(id) : null;
    const value = metric.sample ? (found ? found.value : null) : metricValue(agg, metric.key);
    if (value === null) return [];
    // Keep every real observation, including one game, vote, night or tournament.
    // Metrics requiring a ratio still need a real denominator; missing observations stay absent.
    if ((metric.key === 'red_win_rate' && agg.redGames === 0) || (metric.key === 'black_win_rate' && agg.blackGames === 0)) return [];
    const sample = metric.sample ? found!.sample : sampleGames(agg, metric.key);
    return [{ id, nickname: String(player.nickname || 'Игрок'), value, games: sample, agg, avatar: avatarUrl(id, player.has_db_avatar, player.avatar_suppressed) }];
  });
  const direction = metric.lowerIsBetter ? -1 : 1;
  rows.sort((a, b) => (b.value - a.value) * direction
    || winRatePercent(b.agg.wins, b.agg.games) - winRatePercent(a.agg.wins, a.agg.games)
    || b.games - a.games
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
  const top = ranked.slice(0, options.all ? undefined : TOP_SIZE).map(toRow);
  const mine = viewerIsPlayer ? ranked.find((row) => row.id === viewerId) : undefined;

  return {
    metric: { key: metric.key, label: metric.label, group: metric.group, unit: metric.unit, hint: metric.hint, lowerIsBetter: !!metric.lowerIsBetter, min_games: null, min_sample: null },
    metrics: METRICS.map((item) => ({ key: item.key, label: item.label, group: item.group })),
    filters: {
      period: season ? season.key : 'all',
      format: formatKey,
      period_label: season ? season.label : 'Всё время',
      format_label: formatKey === 'all' ? 'Все форматы' : EVENING_FORMAT_LABELS[formatKey],
      seasons: availablePeriods,
      formats: EVENING_FORMATS.map((key) => ({ key, label: EVENING_FORMAT_LABELS[key] })),
    },
    games_in_scope: scoped.length,
    total: ranked.length,
    rows: top,
    me: mine && !top.some((row) => row.is_me) ? toRow(mine) : null,
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// «По ролям» (owner request 2026-10-12): for each role the club's players who played it, with the role's own figures.
// ---------------------------------------------------------------------------------------------------------------------
export type RoleKey = 'don' | 'mafia' | 'sheriff' | 'citizen';
export const ROLE_TABLES: Record<RoleKey, { label: string; hint: string; columns: Array<{ key: string; label: string }> }> = {
  don: { label: 'Дон', hint: 'Игроки, игравшие доном', columns: [{ key: 'reveals', label: 'Вскрылся сам' }, { key: 'handed', label: 'Отдал вскрытие' }, { key: 'named_red', label: 'Назвал чёрными красных' }] },
  mafia: { label: 'Мафия', hint: 'Игроки, игравшие мафией', columns: [{ key: 'reveals', label: 'Вскрылся' }] },
  sheriff: { label: 'Шериф', hint: 'Игроки, игравшие шерифом', columns: [{ key: 'found_black', label: 'Нашёл чёрных' }] },
  citizen: { label: 'Мирный', hint: 'Игроки, игравшие мирным', columns: [] },
};

export async function loadRoleRating(db: DatabaseWrapper, viewerId: string, query: { role?: string; period?: string; format?: string }, options: { scope?: Awaited<ReturnType<typeof loadMetricScope>>; all?: boolean } = {}) {
  const role: RoleKey = (['don', 'mafia', 'sheriff', 'citizen'] as const).find((item) => item === query.role) || 'don';
  const { season, availablePeriods, formatKey, scoped, scopedIds, playerRows } = options.scope ?? await loadMetricScope(db, query);
  const statSource = await loadStatGamesCached(db);
  const reveal = buildRevealStats(statSource.games.filter((game) => scopedIds.has(game.id)), statSource.memo.facts);

  const own = new Map<string, { games: number; wins: number }>();
  for (const snapshot of scoped) for (const result of snapshot.players) {
    if (result.role !== role) continue;
    const value = own.get(result.player_id) || { games: 0, wins: 0 };
    value.games += 1;
    if (result.won) value.wins += 1;
    own.set(result.player_id, value);
  }
  const figure = (id: string): Record<string, number> => {
    const stats = reveal.get(id) ?? emptyRevealStats();
    if (role === 'don') return { reveals: stats.blackRevealsDon, handed: stats.donHandedReveal, named_red: stats.donNamedBlackRed };
    if (role === 'mafia') return { reveals: stats.blackRevealsMafia };
    if (role === 'sheriff') return { reveals: stats.sheriffReveals, found_black: stats.sheriffCheckedDon + stats.sheriffCheckedMafia };
    return { votes_revealed: stats.townVotesSheriff + stats.townVotesMafia + stats.townVotesDon };
  };

  const rows = playerRows.flatMap((player: any) => {
    const id = String(player.id);
    const played = own.get(id);
    if (!played || (!visibleStats(player.profile_visibility_json) && id !== viewerId)) return [];
    return [{
      player_id: id, nickname: String(player.nickname || 'Игрок'), avatar_url: avatarUrl(id, player.has_db_avatar, player.avatar_suppressed),
      games: played.games, wins: played.wins, win_rate: winRatePercent(played.wins, played.games), figures: figure(id), is_me: viewerId !== 'organizer' && id === viewerId,
    }];
  }).sort((a, b) => b.games - a.games || b.win_rate - a.win_rate || a.nickname.localeCompare(b.nickname, 'ru'));

  return {
    role: { key: role, label: ROLE_TABLES[role].label, hint: ROLE_TABLES[role].hint, columns: ROLE_TABLES[role].columns },
    roles: (Object.keys(ROLE_TABLES) as RoleKey[]).map((key) => ({ key, label: ROLE_TABLES[key].label })),
    filters: {
      period: season ? season.key : 'all', format: formatKey,
      seasons: availablePeriods,
      formats: EVENING_FORMATS.map((key) => ({ key, label: EVENING_FORMAT_LABELS[key] })),
    },
    games_in_scope: scoped.length,
    total: rows.length,
    rows: rows.slice(0, options.all ? undefined : TOP_SIZE),
  };
}
