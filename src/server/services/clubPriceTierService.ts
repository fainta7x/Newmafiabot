import type { DatabaseWrapper } from '../../db/index.ts';
import { clubPriceTierOf, type ClubPriceTier } from '../../lib/eveningPrices.ts';
import { PLAYER_VISITS_SQL } from './playerVisitsService.ts';

/**
 * The club-evening price tier from the last visit before the evening (owner, 2026-11-16: «дороже только после 3 недель
 * пропуска»): a visit in the 21 days before the evening → the regular price; none for 21 days → «Ходит иногда»; none
 * for more than 60 days → «Перестал ходить». «Из другого города» keeps its own price. A player who has never come is
 * priced by his «как ходит» as before.
 */
export const PRICE_REGULAR_DAYS = 21;
export const PRICE_STOPPED_DAYS = 60;
const DAY_MS = 86_400_000;
type Person = { id: string; club_role?: unknown; attends_sometimes?: unknown; stopped_attending?: unknown; from_other_city?: unknown };

export const tierFromLastVisit = (lastVisit: string | null, eveningStart: string): ClubPriceTier | null => {
  if (!lastVisit) return null;
  const days = (Date.parse(eveningStart) - Date.parse(lastVisit)) / DAY_MS;
  return days <= PRICE_REGULAR_DAYS ? 'regular' : days <= PRICE_STOPPED_DAYS ? 'sometimes' : 'stopped';
};

export async function clubPriceTiers(db: DatabaseWrapper, people: Person[], eveningStart: string, eveningId?: string | null): Promise<Map<string, ClubPriceTier>> {
  const result = new Map<string, ClubPriceTier>();
  if (!people.length) return result;
  const ids = people.map((person) => String(person.id));
  const rows = await db.all<{ player_id: string; last_visit: string }>(
    `SELECT player_id, MAX(starts_at) AS last_visit FROM (${PLAYER_VISITS_SQL})
      WHERE player_id IN (${ids.map(() => '?').join(',')}) AND datetime(starts_at) < datetime(?) AND evening_id <> ?
      GROUP BY player_id`, [...ids, eveningStart, eveningId || '']).catch(() => []);
  const last = new Map(rows.map((row) => [String(row.player_id), String(row.last_visit)]));
  for (const person of people) {
    const id = String(person.id);
    result.set(id, Number(person.from_other_city || 0) === 1 ? 'sometimes' : tierFromLastVisit(last.get(id) ?? null, eveningStart) ?? clubPriceTierOf(person));
  }
  return result;
}

/**
 * Owner, 2026-11-16: the closed club evening of 13.11 is repriced by the new rule («Да, исправить на 400+27»). Only the
 * participants priced «иногда» whom the last-visit rule makes regular are changed; the closed-ledger reconciliation then
 * moves their debt. Once per database; a database without this evening does nothing.
 */
export const REPRICE_EVENING_ID = '3ce7717d-8607-48aa-8dda-13f9d96ffeb4';
export async function repriceEvening20261113Once(db: DatabaseWrapper): Promise<number> {
  await db.run('CREATE TABLE IF NOT EXISTS app_data_migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL)');
  const key = '2026-11-16-reprice-evening-2026-11-13';
  if (await db.get('SELECT id FROM app_data_migrations WHERE id = ?', [key])) return 0;
  const evening = await db.get<{ starts_at: string; format: string }>('SELECT starts_at, format FROM game_evenings WHERE id = ?', [REPRICE_EVENING_ID]);
  let changed = 0;
  if (evening && String(evening.format).toUpperCase() === 'CASUAL') {
    const { ensurePriceTierColumn } = await import('./eveningPaymentPricingService.ts');
    await ensurePriceTierColumn(db);
    const rows = await db.all<any>(`SELECT ep.id AS participant_id, p.id, p.club_role, p.attends_sometimes, p.stopped_attending, p.from_other_city
      FROM evening_participants ep JOIN players p ON p.id = ep.player_id WHERE ep.evening_id = ? AND ep.price_tier = 'sometimes'`, [REPRICE_EVENING_ID]);
    const tiers = await clubPriceTiers(db, rows, String(evening.starts_at), REPRICE_EVENING_ID);
    for (const row of rows) {
      if (tiers.get(String(row.id)) !== 'regular') continue;
      await db.run(`UPDATE evening_participants SET price_tier = 'regular' WHERE id = ? AND price_tier = 'sometimes'`, [row.participant_id]);
      changed += 1;
    }
    if (changed) {
      const { reconcileRegularEveningPayments } = await import('./eveningPaymentPricingService.ts');
      await reconcileRegularEveningPayments(db, REPRICE_EVENING_ID);
    }
  }
  await db.run('INSERT OR IGNORE INTO app_data_migrations (id, applied_at) VALUES (?, ?)', [key, new Date().toISOString()]);
  return changed;
}
