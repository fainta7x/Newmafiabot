import { parseGoMafiaPlayerReference } from './gomafiaExternalProfile.ts';

export interface GoMafiaTournamentReference {
  tournamentId: string;
  sourceUrl: string;
}
export interface PublicTournamentStanding {
  place: number;
  nickname: string;
  totalScore: number;
}
export interface PublicTournamentResult {
  tournamentId: string;
  tournamentName: string;
  dateRange: string | null;
  sourceUrl: string;
  standings: PublicTournamentStanding[];
}
export function parseGoMafiaTournamentReference(value: unknown): GoMafiaTournamentReference | null {
  if (typeof value !== 'string') return null;
  try {
    const u = new URL(value.trim());
    const match = /^\/tournament\/([1-9]\d{0,11})\/?$/.exec(u.pathname);
    if (!match || u.protocol !== 'https:' || u.hostname !== 'gomafia.pro' ||
        u.username || u.password || u.port || u.search || u.hash) return null;
    return { tournamentId: match[1], sourceUrl: 'https://gomafia.pro/tournament/' + match[1] };
  } catch { return null; }
}
export function validateTournamentStanding(value: PublicTournamentStanding): boolean {
  return Number.isInteger(value.place) && value.place >= 1 && value.place <= 10000 &&
    typeof value.nickname === 'string' && value.nickname.trim().length >= 1 &&
    value.nickname.trim().length <= 120 &&
    Number.isFinite(value.totalScore) && value.totalScore >= -100 && value.totalScore <= 1000;
}
/** Only organizer-confirmed tournament standings are linked to club player IDs. */
export function normalizeStoredTournamentAppearance(row: any) {
  if (!row || !parseGoMafiaTournamentReference(row.source_url)) return null;
  const place = Number(row.place);
  const totalScore = Number(row.total_score);
  if (!validateTournamentStanding({ place, nickname: row.external_nickname, totalScore })) return null;
  return {
    source: 'gomafia' as const, tournamentId: String(row.tournament_id),
    tournamentName: String(row.tournament_name), dateRange: row.date_range ?? null,
    place, totalScore, externalNickname: String(row.external_nickname),
    sourceUrl: String(row.source_url), confirmedAt: String(row.confirmed_at),
  };
}
