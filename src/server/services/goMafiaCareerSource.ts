import { createGoMafiaPublicSnapshot, parseGoMafiaPlayerReference, type GoMafiaPlayerReference, type GoMafiaPublicSnapshot } from '../../lib/gomafiaExternalProfile.ts';
import type { FederationGame } from '../../lib/gomafiaExternalGames.ts';
import { GOMAFIA_NOMINATIONS, type CareerAppearance, type GoMafiaNominationKey } from '../../lib/gomafiaCareer.ts';

const MAX_BODY = 2 * 1024 * 1024;
const number = (v: unknown): number | null => {
  if (typeof v !== 'number' && (typeof v !== 'string' || !/^-?\d+(?:\.\d+)?$/.test(v))) return null;
  const n = Number(v); return Number.isFinite(n) ? n : null;
};
const id = (v: unknown) => /^[1-9]\d{0,11}$/.test(String(v)) ? String(v) : null;
const date = (v: unknown) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v)) ? v : null;

/** Public SSR data only. No script execution or access to the private backend. */
export function readGoMafiaNextData(html: string): any {
  const match = /<script\b[^>]*\bid=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i.exec(html);
  if (!match || match[1].length > MAX_BODY) throw new Error('GoMafia public Next.js data unavailable');
  const data = JSON.parse(match[1])?.props?.pageProps?.serverData;
  if (!data || typeof data !== 'object') throw new Error('GoMafia public data changed');
  return data;
}
export function parseGoMafiaStructuredStats(data: any, ref: GoMafiaPlayerReference, period: number | 'all', now: string): GoMafiaPublicSnapshot {
  if (String(data?.user?.id) !== ref.externalPlayerId) throw new Error('GoMafia returned another player');
  const stats = data.stats;
  if (!stats?.primary || number(stats.primary.total_games) === null || number(data.user.elo) === null)
    throw new Error('GoMafia statistics incomplete');
  return createGoMafiaPublicSnapshot(ref, {
    year: period === 'all' ? null : period, gameFilter: 'Все игры', tournamentFilter: 'Все турниры',
    totalGames: number(stats.primary.total_games), overallElo: number(data.user.elo),
    tableElo: number(data.average_elo ?? data.averageElo), averageScore: number(stats.games_stats?.average_points),
    overallWinRatePercent: number(stats.win_rate?.total_wins?.percent),
    roleGames: { citizen: number(stats.primary.red), sheriff: number(stats.primary.sheriff), mafia: number(stats.primary.mafia), don: number(stats.primary.don) },
    roleWinRatePercent: { citizen: number(stats.win_rate?.red?.win?.percent), sheriff: number(stats.win_rate?.sheriff?.win?.percent), mafia: number(stats.win_rate?.mafia?.win?.percent), don: number(stats.win_rate?.don?.win?.percent) },
  }, now);
}
/** The profile's ID-linked history marks only winners with <nomination>_id:1. */
function historyNominations(value: unknown): CareerAppearance['nominations'] {
  if (Array.isArray(value)) return value.length === 0 ? [] : undefined;
  if (!value || typeof value !== 'object') return undefined;
  return (Object.keys(GOMAFIA_NOMINATIONS) as GoMafiaNominationKey[])
    .filter(key => number((value as Record<string,unknown>)[key + '_id']) === 1)
    .map(key => ({key, rank:1}));
}
export function parseGoMafiaHistory(data: any, ref: GoMafiaPlayerReference): { total: number; tournaments: CareerAppearance[] } {
  if (String(data?.user?.id) !== ref.externalPlayerId) throw new Error('GoMafia history identity mismatch');
  const total = number(data.historyTotal);
  if (!Number.isInteger(total) || total! < 0 || total! > 2000 || !Array.isArray(data.history)) throw new Error('GoMafia history incomplete or exceeds safe limit');
  const eloPoints = new Map<string, number>();
  for (const point of Array.isArray(data.chart?.elo) ? data.chart.elo : []) {
    const tid = id(point.id), value = number(point.y);
    if (tid && value !== null) eloPoints.set(tid, value);
  }
  const tournaments = data.history.map((row: any): CareerAppearance => {
    const tid = id(row.id), start = date(row.date_start), end = date(row.date_end);
    if (!tid || !start || !end || typeof row.title !== 'string' || !Array.isArray(row.games)) throw new Error('Malformed GoMafia appearance');
    const sourceUrl = `https://gomafia.pro/tournament/${tid}`;
    const place = number(row.place);
    const nominations = historyNominations(row.nominations);
    const games = row.games.map((game: any) => {
      const gameNumber = number(game.game_num);
      if (!Number.isInteger(gameNumber) || gameNumber! < 1) throw new Error('Missing GoMafia game number');
      const role = ({ red: 'citizen', sheriff: 'sheriff', mafia: 'mafia', don: 'don' } as const)[game.role as 'red'];
      const winner = game.win === 'city' ? 'red' : game.win === 'mafia' ? 'black' : null;
      const team = role === 'citizen' || role === 'sheriff' ? 'red' : role ? 'black' : null;
      return { source: 'gomafia' as const, externalGameId: `${ref.externalPlayerId}:${tid}:${gameNumber}`,
        externalPlayerId: ref.externalPlayerId, tournamentName: row.title.slice(0, 180), date: null,
        role: role ?? null, result: winner && team ? (winner === team ? 'win' as const : 'loss' as const) : null,
        score: null, externalTableId: null, scoreRetrievedAt: null, sourceUrl, gameNumber: gameNumber!, seat: number(game.place), eloDelta: number(game.elo) };
    });
    if (new Set(games.map((g: FederationGame) => g.externalGameId)).size !== games.length) throw new Error('Duplicate GoMafia game number');
    return { tournamentId: tid, tournamentName: row.title.slice(0, 180), dateStart: start, dateEnd: end,
      location: [row.country_translate, row.city_translate].filter(v => typeof v === 'string').join(', ') || null,
      place: place && Number.isInteger(place) && place > 0 ? place : null, participantCount: null, totalScore: null, scoreRetrievedAt: null, scoreStatus: 'not_checked', eloDelta: number(row.elo), eloAfter: eloPoints.get(tid) ?? null,
      nominations, nominationsStatus: nominations === undefined ? 'unavailable' : 'available',
      status: place && place > 0 ? 'results_published' : 'unknown', sourceUrl, games };
  });
  return { total: total!, tournaments };
}
/** Exact federation user_id only; login is never an association key. */
export function nominationsOfPlayer(data: any, externalPlayerId: string): NonNullable<CareerAppearance['nominations']> {
  const found: NonNullable<CareerAppearance['nominations']> = [];
  for (const key of Object.keys(GOMAFIA_NOMINATIONS) as GoMafiaNominationKey[]) {
    const list = Array.isArray(data?.nominations?.[key]) ? data.nominations[key] : [];
    const matches = list.map((item: any,index:number)=>({id:id(item?.user?.id),rank:index+1})).filter((item:any)=>item.id===externalPlayerId);
    if (matches.length === 1) found.push({key,rank:matches[0].rank});
  }
  return found;
}

export function enrichGoMafiaAppearance(appearance: CareerAppearance, data: any, externalPlayerId: string): CareerAppearance {
  if (String(data?.tournament?.id) !== appearance.tournamentId) throw new Error('Tournament identity mismatch');
  const reportedCount = number(data?.tournament?.usersCount);
  // Never infer tournament size from the player's place or games; neither measures entrants.
  const participantCount = reportedCount != null && Number.isInteger(reportedCount) && reportedCount > 0 ? reportedCount : null;
  appearance = { ...appearance, participantCount };
  const unavailable = { ...appearance, totalScore: null, scoreStatus: 'unavailable' as const, scoreRetrievedAt: new Date().toISOString() };
  if (String(data.tournament.is_hidden_result) === '1') return { ...unavailable, nominations:[], nominationsStatus:'hidden', status:'unknown' };
  const nominationsAvailable = data.nominations && Object.keys(GOMAFIA_NOMINATIONS).every(key=>{
    const list=data.nominations[key];
    return Array.isArray(list) && list.every(entry=>id(entry?.user?.id)) && new Set(list.map(entry=>id(entry?.user?.id))).size===list.length;
  });
  // A successfully read but ambiguous payload must not inherit winner flags.
  // History flags remain the fallback only when the tournament request fails.
  appearance = { ...appearance, nominations:nominationsAvailable ? nominationsOfPlayer(data,externalPlayerId) : undefined,
    nominationsStatus:nominationsAvailable ? 'available' : 'unavailable' };
  unavailable.nominations = appearance.nominations; unavailable.nominationsStatus = appearance.nominationsStatus;
  const games = appearance.games.map(game => {
    const matches: Array<{ tableId: string; points: number | null }> = [];
    for (const round of Array.isArray(data.games) ? data.games : []) {
      if (number(round.gameNum) !== game.gameNumber) continue;
      for (const table of Array.isArray(round.game) ? round.game : []) {
        const tableId = id(table.table_id);
        if (!tableId) continue;
        for (const player of Array.isArray(table.table) ? table.table : []) {
          const role = ({ red:'citizen', sheriff:'sheriff', mafia:'mafia', don:'don' } as Record<string,string>)[player.role];
          if (String(player.id) === externalPlayerId && number(player.place) === game.seat && role === game.role)
            matches.push({ tableId, points:number(player.points) });
        }
      }
    }
    return matches.length === 1 ? { ...game, score:matches[0].points, externalTableId:matches[0].tableId,
      scoreRetrievedAt:new Date().toISOString() } : game;
  });
  const finals = Array.isArray(data.tournamentResultWithFinal) ? data.tournamentResultWithFinal : [];
  const qualifying = Array.isArray(data.tournamentResultWithoutFinal) ? data.tournamentResultWithoutFinal : [];
  // The site exposes finalist and qualifying tables separately; one player may be in both.
  const finalRows = finals.filter((row: any) => String(row.user_id) === externalPlayerId);
  const rows = finalRows.length ? finalRows : qualifying.filter((row: any) => String(row.user_id) === externalPlayerId);
  if (rows.length !== 1) return { ...unavailable, games };
  const row = rows[0];
  const place = number(row.place);
  return { ...appearance, games, totalScore: number(row.sum), scoreRetrievedAt: new Date().toISOString(), scoreStatus: number(row.sum) === null ? 'unavailable' : 'available', place: place && Number.isInteger(place) && place > 0 ? place : appearance.place,
    status: data.tournament.status === 'completed' ? 'results_published' : 'unknown' };
}

/** Bounded reads from fixed public paths observed in the site's own client, without credentials. */
export async function readPublicGoMafia(path: string, params?: Record<string, string>): Promise<any> {
  if (!/^\/(?:stats\/[1-9]\d*(?:\?tab=history&page=\d+)?|tournament\/[1-9]\d*|api\/stats\/get)$/.test(path)) throw new Error('Invalid GoMafia source path');
  const response = await fetch('https://gomafia.pro' + path, {
    method: params ? 'POST' : 'GET', redirect: 'error', credentials: 'omit', signal: AbortSignal.timeout(15000),
    headers: { Accept: params ? 'application/json' : 'text/html', ...(params ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}), 'User-Agent': '2LA-Noire-player-career/1.0' },
    body: params ? new URLSearchParams(params).toString() : undefined,
  });
  if (!response.ok || !String(response.headers.get('content-type')).includes(params ? 'application/json' : 'text/html')) throw new Error('GoMafia public source unavailable');
  if (Number(response.headers.get('content-length') || 0) > MAX_BODY) throw new Error('GoMafia response too large');
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Empty GoMafia response');
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    for (;;) { const chunk = await reader.read(); if (chunk.done) break; size += chunk.value.length;
      if (size > MAX_BODY) throw new Error('GoMafia response too large'); chunks.push(chunk.value); }
  } finally { await reader.cancel(); }
  const body = Buffer.concat(chunks).toString('utf8');
  if (!params) return readGoMafiaNextData(body);
  const json = JSON.parse(body);
  if (json.result !== 'success' || !json.data) throw new Error('GoMafia public stats unavailable');
  return json.data;
}
export async function fetchPublicGoMafiaCareer(ref: GoMafiaPlayerReference, read = readPublicGoMafia, previous?: GoMafiaPublicSnapshot): Promise<GoMafiaPublicSnapshot> {
  if (parseGoMafiaPlayerReference(ref.profileUrl)?.externalPlayerId !== ref.externalPlayerId) throw new Error('Invalid GoMafia reference');
  const now = new Date().toISOString();
  const deadline = Date.now() + 180_000;
  const request = async (path: string, params?: Record<string,string>) => {
    if (Date.now() >= deadline) throw new Error('GoMafia career refresh time budget exceeded');
    return read(path, params);
  };
  const first = await request(`/stats/${ref.externalPlayerId}`);
  const initial = parseGoMafiaHistory(first, ref);
  const appearances = new Map(initial.tournaments.map(t => [t.tournamentId, t]));
  const pages = Math.ceil(initial.total / 10);
  for (let page = 2; page <= pages; page++) {
    const next = parseGoMafiaHistory(await request(`/stats/${ref.externalPlayerId}?tab=history&page=${page}`), ref);
    if (next.total !== initial.total || next.tournaments.length === 0) throw new Error('GoMafia history changed during pagination');
    for (const item of next.tournaments) appearances.set(item.tournamentId, item);
  }
  if (appearances.size !== initial.total) throw new Error('GoMafia history pagination incomplete');
  const snapshot = parseGoMafiaStructuredStats(await request('/api/stats/get', { id: ref.externalPlayerId, period: 'all', gameType: 'all', tournamentType: 'all' }), ref, 'all', now);
  const years = [...new Set([...appearances.values()].map(t => Number(t.dateStart.slice(0, 4))))].sort((a,b) => b-a);
  const yearlyStats = [];
  const unavailableYears: number[] = [];
  for (const year of years) {
    try { yearlyStats.push(parseGoMafiaStructuredStats(await request('/api/stats/get', { id: ref.externalPlayerId, period: String(year), gameType: 'all', tournamentType: 'all' }), ref, year, now)); }
    catch { unavailableYears.push(year); }
  }
  const tournaments: CareerAppearance[] = [];
  // Published history already has stable player associations. Enrichment failure must not discard history.
  let missingScores = 0;
  const previouslyScored = new Set(previous?.career?.tournaments.filter(t => t.totalScore !== null).map(t => t.tournamentId) ?? []);
  // Large careers resume missing score enrichment first on the next scheduled refresh.
  const ordered = [...appearances.values()].sort((a,b) => Number(previouslyScored.has(a.tournamentId)) - Number(previouslyScored.has(b.tournamentId)));
  for (const appearance of ordered) {
    try { tournaments.push(enrichGoMafiaAppearance(appearance, await request(`/tournament/${appearance.tournamentId}`), ref.externalPlayerId)); }
    catch {
      const earlier = previous?.career?.tournaments.find(item => item.tournamentId === appearance.tournamentId);
      tournaments.push({ ...appearance, participantCount: earlier?.participantCount ?? null, scoreStatus: 'refresh_failed' });
      missingScores++;
    }
  }
  snapshot.career = { tournaments: tournaments.sort((a,b)=>b.dateStart.localeCompare(a.dateStart)), yearlyStats,
    historyTotal: initial.total, registrationsStatus: 'unavailable', limitations: [
      'Публичный профиль показывает сыгранные турниры. Автоматическое обнаружение будущей регистрации недоступно: в проверенных открытых карточках нет состава с ID игроков.',
      'Точная дата отдельной игры и полный протокол событий не опубликованы в используемых источниках. Баллы игры доступны только при однозначном совпадении игрока, номера игры и места в открытой таблице турнира.',
      ...(unavailableYears.length ? [`Не удалось обновить статистику за ${unavailableYears.join(', ')}; повторим при следующей синхронизации.`] : []),
      ...(missingScores ? [`Не удалось обновить итоговые баллы ${missingScores} турниров; повторим при следующей синхронизации.`] : []),
    ] };
  return snapshot;
}
