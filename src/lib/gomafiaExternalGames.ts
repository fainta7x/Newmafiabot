/** A validated source-specific federation game, never a club protocol. */
export interface FederationGame {
  source: 'gomafia';
  externalGameId: string;
  externalPlayerId: string;
  tournamentName: string | null;
  date: string | null;
  role: 'citizen' | 'sheriff' | 'mafia' | 'don' | null;
  result: 'win' | 'loss' | null;
  score: number | null;
  sourceUrl: string;
}

const roleNames = new Set(['citizen', 'sheriff', 'mafia', 'don']);
const resultNames = new Set(['win', 'loss']);
const safeString = (x: unknown, max: number): string | null =>
  typeof x === 'string' && x.trim() ? x.trim().slice(0, max) : null;

/** Fail closed on malformed stored or imported data; never invent a winner or club membership. */
export function normalizeFederationGame(row: {
  external_game_id: string;
  external_player_id: string;
  game_payload_json: string;
  source_url: string;
}): FederationGame | null {
  try {
    const payload: unknown = JSON.parse(row.game_payload_json);
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
    const item = payload as Record<string, unknown>;
    const url = new URL(row.source_url);
    if (url.protocol !== 'https:' || url.hostname !== 'gomafia.pro' ||
        url.username || url.password || url.port) return null;
    if (!row.external_game_id || !/^\d{1,16}$/.test(row.external_player_id)) return null;
    const role = roleNames.has(String(item.role)) ? item.role as FederationGame['role'] : null;
    const result = resultNames.has(String(item.result)) ? item.result as FederationGame['result'] : null;
    const date = typeof item.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(item.date) &&
      Number.isFinite(Date.parse(item.date)) ? item.date : null;
    const score = typeof item.score === 'number' && Number.isFinite(item.score) ? item.score : null;
    return {
      source: 'gomafia',
      externalGameId: row.external_game_id,
      externalPlayerId: row.external_player_id,
      tournamentName: safeString(item.tournamentName, 180),
      date, role, result, score, sourceUrl: url.toString(),
    };
  } catch { return null; }
}
