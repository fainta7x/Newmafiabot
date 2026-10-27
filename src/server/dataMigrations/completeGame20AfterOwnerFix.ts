import type { DatabaseWrapper } from '../../db/index.ts';
import { saveClubEveningProtocol } from '../routes/gamesRoutes.ts';

const MIGRATION_NAME = '2026-10-game20-owner-fix-v1';
const STALE_NOTE = 'Голосование (День 3)';

/**
 * Game №20 of 2026-10-23 (owner, 2026-10-27; AUDIT_LOG «P4»). The owner put the split of the восьмёрка back by hand
 * (№3 Богданчик 4 – №5 Алоэ 4, revote 4–4, nobody voted to raise, everybody stayed) and left the game as a draft, then asked
 * for the rest to be done in code: the two nights without a shot are misses («промах», not «договорённость не
 * состоялась»), №3 Богданчик loses the note of the exit that did not happen, and the game is completed. It goes through the
 * ordinary protocol save (the same checks, settlement, Elo and achievements as the protocol window); it runs only on the
 * record exactly as the owner left it, and the old values go to migration_history.
 */
export async function completeGame20AfterOwnerFix(db: DatabaseWrapper): Promise<{ applied: boolean; reason?: string }> {
  const existing = await db.get<{ status?: string }>('SELECT status FROM migration_history WHERE migration_name = ? LIMIT 1', [MIGRATION_NAME]);
  if (existing) return { applied: false, reason: existing.status };
  const record = (status: string, details: unknown) => db.run(
    'INSERT INTO migration_history (id, migration_name, status, details_json, executed_at) VALUES (?, ?, ?, ?, ?)',
    [MIGRATION_NAME, MIGRATION_NAME, status, JSON.stringify(details), new Date().toISOString()],
  );
  const row = await db.get<{ id: number; protocol_text: string }>(
    'SELECT id, protocol_text FROM games WHERE global_game_number = 20 AND evening_id IS NOT NULL AND archived_at IS NULL LIMIT 1',
  );
  let payload: any = null;
  try { payload = row?.protocol_text ? JSON.parse(row.protocol_text) : null; } catch { payload = null; }
  const protocol = payload?.protocol;
  const results: any[] = Array.isArray(payload?.player_results) ? payload.player_results : [];
  const seat = (n: number) => results.find((r) => Number(r.seat_number) === n);
  const votes: any[] = Array.isArray(protocol?.votes) ? protocol.votes : [];
  const shots: any[] = Array.isArray(protocol?.shots) ? protocol.shots : [];
  const noShot = (s: any) => !Number(s?.target_seat) && (s?.result === 'agreement_failed' || s?.result === 'miss');
  const expected = payload?.kind === 'club_evening_protocol' && protocol?.end_reason === 'ppk' && results.length === 10
    && seat(3)?.display_name === 'Богданчик' && seat(3)?.exit_type === 'alive' && seat(5)?.display_name === 'Алоэ' && seat(5)?.exit_type === 'alive'
    && votes.length === 6 && Number(votes[4]?.day_number) === 2 && votes[4]?.outcome === 'tie_revote'
    && Number(votes[5]?.day_number) === 2 && votes[5]?.is_revote && votes[5]?.outcome === 'no_elimination'
    && shots.length === 3 && Number(shots[0]?.target_seat) === 9 && noShot(shots[1]) && noShot(shots[2]);
  if (!row || !expected) {
    await record('skipped', { reason: row ? 'the record is not the one the owner left on 2026-10-27' : 'game №20 not found' });
    return { applied: false, reason: 'skipped' };
  }
  const before = { status: protocol.status, shots, note_3: seat(3)?.notes ?? null };
  try {
    await saveClubEveningProtocol(db, row.id, {
      protocol: { ...protocol, status: 'completed', shots: shots.map((s) => (noShot(s) ? { ...s, target_seat: 0, result: 'miss' } : s)) },
      player_results: results.map((r) => (Number(r.seat_number) === 3 && r.notes === STALE_NOTE ? { ...r, notes: null } : r)),
    });
  } catch (error) {
    await record('refused', { game_id: row.id, reason: error instanceof Error ? error.message : String(error) });
    return { applied: false, reason: 'refused' };
  }
  await record('completed', { game_id: row.id, before });
  return { applied: true };
}
