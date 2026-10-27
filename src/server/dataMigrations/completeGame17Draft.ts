import type { DatabaseWrapper } from '../../db/index.ts';
import { saveClubEveningProtocol } from '../routes/gamesRoutes.ts';

const MIGRATION_NAME = '2026-10-game17-complete-v1';
/** The last save of the draft as read on 2026-10-27: any later edit means someone is working on it, and nothing is done. */
const DRAFT_SAVED_AT = '2026-10-26T12:57:30.390Z';

/**
 * Game №17 of 2026-10-23 (owner «Завершить как есть», 2026-10-27; AUDIT_LOG «Missing games in profiles»). It was reopened
 * on 2026-10-26 while the protocol window hung on saving and stayed a draft, so the game is missing from the profiles,
 * Elo and statistics of all ten players. The record passes today's checks; it is completed unchanged through the ordinary
 * protocol save (checks, settlement, Elo, achievements), only when it is still the draft saved at `DRAFT_SAVED_AT`.
 */
export async function completeGame17Draft(db: DatabaseWrapper): Promise<{ applied: boolean; reason?: string }> {
  const existing = await db.get<{ status?: string }>('SELECT status FROM migration_history WHERE migration_name = ? LIMIT 1', [MIGRATION_NAME]);
  if (existing) return { applied: false, reason: existing.status };
  const record = (status: string, details: unknown) => db.run(
    'INSERT INTO migration_history (id, migration_name, status, details_json, executed_at) VALUES (?, ?, ?, ?, ?)',
    [MIGRATION_NAME, MIGRATION_NAME, status, JSON.stringify(details), new Date().toISOString()],
  );
  const row = await db.get<{ id: number; protocol_text: string }>(
    'SELECT id, protocol_text FROM games WHERE global_game_number = 17 AND evening_id IS NOT NULL AND archived_at IS NULL LIMIT 1',
  );
  let payload: any = null;
  try { payload = row?.protocol_text ? JSON.parse(row.protocol_text) : null; } catch { payload = null; }
  const protocol = payload?.protocol;
  if (!row || payload?.kind !== 'club_evening_protocol' || protocol?.status !== 'draft' || protocol?.updated_at !== DRAFT_SAVED_AT) {
    await record('skipped', { reason: row ? 'the game is not the draft saved at ' + DRAFT_SAVED_AT : 'game №17 not found' });
    return { applied: false, reason: 'skipped' };
  }
  try {
    await saveClubEveningProtocol(db, row.id, { protocol: { ...protocol, status: 'completed' }, player_results: payload.player_results });
  } catch (error) {
    await record('refused', { game_id: row.id, reason: error instanceof Error ? error.message : String(error) });
    return { applied: false, reason: 'refused' };
  }
  await record('completed', { game_id: row.id, before: { status: 'draft', updated_at: DRAFT_SAVED_AT } });
  return { applied: true };
}
