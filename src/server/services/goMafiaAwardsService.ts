import { randomUUID } from 'node:crypto';
import type { DatabaseWrapper } from '../../db/index.ts';
import { ensurePlayerProfileIntegritySchema } from '../../db/ensurePlayerProfileIntegritySchema.ts';
import { GOMAFIA_NOMINATIONS, type CareerAppearance } from '../../lib/gomafiaCareer.ts';

/**
 * Awards of the federation (owner, 2026-10-12): the podium places 1–3 and the nominations of the tournaments a verified
 * GoMafia profile took part in become awards of the club profile. Awards only: no games are recounted and Elo, ratings and
 * achievements are not touched. One row per tournament and kind, identified by `source_key`, so a refresh never duplicates.
 */
export interface FederationAward {
  sourceKey: string;
  kind: 'placement' | 'nomination';
  title: string;
  placeResult: string | null;
  tournamentName: string;
  awardDate: string;
  awardYear: number;
  description: string;
  sourceUrl: string;
}

export function federationAwardsOf(externalPlayerId: string, tournaments: CareerAppearance[]): FederationAward[] {
  const awards: FederationAward[] = [];
  for (const item of tournaments) {
    const finished = item.status === 'results_published' || item.status === 'completed';
    const base = { tournamentName: item.tournamentName, awardDate: item.dateEnd || item.dateStart, awardYear: Number((item.dateEnd || item.dateStart).slice(0, 4)), sourceUrl: item.sourceUrl };
    if (finished && item.place !== null && item.place >= 1 && item.place <= 3) {
      awards.push({ ...base, sourceKey: `gomafia:${externalPlayerId}:${item.tournamentId}:place`, kind: 'placement', title: `${item.place} место`, placeResult: `${item.place} место`,
        description: `Итоговая таблица турнира GoMafia: ${item.place} место.` });
    }
    // Only the first name of a nomination list is awarded: the meaning of the 2nd and 3rd positions is not confirmed, so nothing is claimed for them.
    for (const nomination of finished ? (item.nominations ?? []).filter((entry) => entry.rank === 1) : []) {
      const label = GOMAFIA_NOMINATIONS[nomination.key];
      awards.push({ ...base, sourceKey: `gomafia:${externalPlayerId}:${item.tournamentId}:nom:${nomination.key}`, kind: 'nomination',
        title: label, placeResult: null,
        description: `Номинация «${label}» на турнире GoMafia.` });
    }
  }
  return awards;
}

/** Writes the awards of one verified link into the player's profile; returns how many rows are now in place. */
export async function syncGoMafiaAwards(db: DatabaseWrapper, playerId: string, externalPlayerId: string, tournaments: CareerAppearance[]) {
  await ensurePlayerProfileIntegritySchema(db);
  const now = new Date().toISOString();
  const awards = federationAwardsOf(externalPlayerId, tournaments);
  for (const award of awards) {
    await db.run(`
      INSERT INTO player_verified_awards
        (id, player_id, kind, title, tournament_name, award_date, award_year, place_result, description, source, source_type, source_key,
         verification_status, created_by, verified_by, verified_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'automatic', ?, 'verified', 'gomafia-sync', 'gomafia-sync', ?, ?, ?)
      ON CONFLICT(source_key) DO UPDATE SET
        title = excluded.title, tournament_name = excluded.tournament_name, award_date = excluded.award_date, award_year = excluded.award_year,
        place_result = excluded.place_result, description = excluded.description, source = excluded.source, updated_at = excluded.updated_at
       WHERE player_verified_awards.player_id = excluded.player_id`,
      [randomUUID(), playerId, award.kind, award.title, award.tournamentName, award.awardDate, award.awardYear, award.placeResult, award.description,
        `GoMafia: ${award.sourceUrl}`, award.sourceKey, now, now, now]);
  }
  return awards.length;
}
