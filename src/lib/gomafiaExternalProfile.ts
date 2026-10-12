/**
 * GoMafia external player identity boundary.
 *
 * This module deliberately does not write player records or calculate club Elo.
 * A link is an organizer/player-confirmed external identity, NOT a nickname match.
 */
export interface GoMafiaPlayerReference {
  provider: 'gomafia';
  externalPlayerId: string;
  profileUrl: string;
}

export interface GoMafiaPublicSnapshot {
  source: 'gomafia';
  externalPlayerId: string;
  profileUrl: string;
  retrievedAt: string;
  year: number | null;
  /** Descriptive source filters, NOT an assertion of all-time statistics. */
  gameFilter: string | null;
  tournamentFilter: string | null;
  totalGames: number | null;
  overallElo: number | null;
  tableElo: number | null;
  averageScore: number | null;
  overallWinRatePercent: number | null;
  roleGames: {
    citizen: number | null;
    sheriff: number | null;
    mafia: number | null;
    don: number | null;
  };
  roleWinRatePercent: {
    citizen: number | null;
    sheriff: number | null;
    mafia: number | null;
    don: number | null;
  };
}

const VALID_PLAYER_ID = /^[1-9]\d{0,11}$/;

/**
 * Accept only canonical public profile URLs or bare numeric player IDs.
 * Never fetch user-provided hosts or arbitrary paths (SSRF-safe contract).
 */
export function parseGoMafiaPlayerReference(input: string): GoMafiaPlayerReference | null {
  const raw = String(input || '').trim();
  if (VALID_PLAYER_ID.test(raw)) {
    return {
      provider: 'gomafia',
      externalPlayerId: raw,
      profileUrl: `https://gomafia.pro/stats/${raw}`,
    };
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.hostname.toLowerCase() !== 'gomafia.pro') return null;
  if (url.username || url.password || url.port || url.search || url.hash) return null;
  const match = /^\/stats\/([1-9]\d{0,11})\/?$/.exec(url.pathname);
  if (!match) return null;
  return {
    provider: 'gomafia',
    externalPlayerId: match[1],
    profileUrl: `https://gomafia.pro/stats/${match[1]}`,
  };
}

/** Strict, non-guessing number normalizer for future verified API/HTML adapter. */
export function normalizeGoMafiaMetric(
  value: unknown,
  options: { integer?: boolean; percentage?: boolean } = {},
): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null;
  if (options.integer && !Number.isInteger(value)) return null;
  if (options.percentage && value > 100) return null;
  return value;
}

/** Construct a typed snapshot only from an explicitly sourced, reviewed payload. */
export function createGoMafiaPublicSnapshot(
  reference: GoMafiaPlayerReference,
  values: Partial<Omit<GoMafiaPublicSnapshot, 'source' | 'externalPlayerId' | 'profileUrl' | 'retrievedAt'>>,
  retrievedAt: string,
): GoMafiaPublicSnapshot {
  const canonical = parseGoMafiaPlayerReference(reference.profileUrl);
  if (!canonical || canonical.externalPlayerId !== reference.externalPlayerId) throw new Error('Invalid GoMafia reference');
  if (!Number.isFinite(Date.parse(retrievedAt))) throw new Error('Invalid GoMafia retrieval timestamp');
  const count = (v: unknown) => normalizeGoMafiaMetric(v, { integer: true });
  const metric = (v: unknown) => normalizeGoMafiaMetric(v);
  const percent = (v: unknown) => normalizeGoMafiaMetric(v, { percentage: true });
  return {
    source: 'gomafia',
    externalPlayerId: canonical.externalPlayerId,
    profileUrl: canonical.profileUrl,
    retrievedAt,
    year: values.year === null ? null : count(values.year),
    gameFilter: typeof values.gameFilter === 'string' ? values.gameFilter.slice(0, 80) : null,
    tournamentFilter: typeof values.tournamentFilter === 'string' ? values.tournamentFilter.slice(0, 80) : null,
    totalGames: count(values.totalGames),
    overallElo: metric(values.overallElo),
    tableElo: metric(values.tableElo),
    averageScore: metric(values.averageScore),
    overallWinRatePercent: percent(values.overallWinRatePercent),
    roleGames: {
      citizen: count(values.roleGames?.citizen),
      sheriff: count(values.roleGames?.sheriff),
      mafia: count(values.roleGames?.mafia),
      don: count(values.roleGames?.don),
    },
    roleWinRatePercent: {
      citizen: percent(values.roleWinRatePercent?.citizen),
      sheriff: percent(values.roleWinRatePercent?.sheriff),
      mafia: percent(values.roleWinRatePercent?.mafia),
      don: percent(values.roleWinRatePercent?.don),
    },
  };
}
