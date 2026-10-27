import type { DatabaseWrapper } from '../../db/index.ts';

const MIGRATION_NAME = '2026-10-game20-eight-split-v1';

/**
 * Game №20 of 2026-10-23 (owner, 2026-10-27; AUDIT_LOG «P4»): in the восьмёрка after the miss №5 Алоэ and №3 Богданчик split
 * 4–4, split again 4–4 on the revote, nobody voted to raise them and everybody stayed. The saved record lost that voting and
 * stores the two nights without a shot as «договорённость не состоялась» instead of a miss. This adds the two rounds and
 * puts the misses back, only when the record is exactly the one read on 2026-10-27; the old values go to migration_history.
 * Exits, the event journal and everything else stay as they are.
 */
export async function correctGame20EightSplit(db: DatabaseWrapper): Promise<{ applied: boolean; reason?: string }> {
  const existing = await db.get<{ status?: string }>('SELECT status FROM migration_history WHERE migration_name = ? LIMIT 1', [MIGRATION_NAME]);
  if (existing) return { applied: false, reason: existing.status };
  const record = async (status: string, details: unknown) => db.run(
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
  const expected = payload?.kind === 'club_evening_protocol' && protocol?.status === 'completed' && protocol?.end_reason === 'ppk'
    && results.length === 10 && seat(3)?.display_name === 'Богданчик' && seat(5)?.display_name === 'Алоэ'
    && seat(3)?.exit_type === 'alive' && seat(5)?.exit_type === 'alive' && seat(4)?.exit_type === 'voted_day' && seat(9)?.exit_type === 'killed'
    && votes.length === 4 && votes.every((v, i) => Number(v.round_number) === i + 1) && Number(votes[3].day_number) === 1
    && JSON.stringify(votes[3].nominated_seats) === '[2,4]'
    && shots.length === 3 && Number(shots[0].target_seat) === 9
    && shots.slice(1).every((s, i) => Number(s.night_number) === i + 2 && s.result === 'agreement_failed' && !Number(s.target_seat));
  if (!row || !expected) {
    await record('skipped', { reason: row ? 'the record is not the one read on 2026-10-27' : 'game №20 not found' });
    return { applied: false, reason: 'skipped' };
  }
  const nominated = [5, 8, 2, 3];
  const firstCounts = { 5: 4, 8: 0, 2: 0, 3: 4 };
  const next = {
    ...payload,
    protocol: {
      ...protocol,
      votes: [
        ...votes,
        { round_number: 5, is_revote: false, nominated_seats: nominated, vote_counts: firstCounts, day_number: 2, eligible_voters: 8, parent_round_number: null, outcome: 'tie_revote', eliminated_seats: [], table_leave_votes: null },
        { round_number: 6, is_revote: true, nominated_seats: [5, 3], vote_counts: { 5: 4, 3: 4 }, day_number: 2, eligible_voters: 8, parent_round_number: 5, parent_nominated_seats: nominated, parent_vote_counts: firstCounts, outcome: 'no_elimination', eliminated_seats: [], table_leave_votes: 0 },
      ],
      shots: shots.map((s) => (s.result === 'agreement_failed' ? { ...s, target_seat: 0, result: 'miss' } : s)),
    },
  };
  await db.transaction(async (tx) => {
    await tx.run('UPDATE games SET protocol_text = ? WHERE id = ?', [JSON.stringify(next), row.id]);
    await tx.run(
      'INSERT INTO migration_history (id, migration_name, status, details_json, executed_at) VALUES (?, ?, ?, ?, ?)',
      [MIGRATION_NAME, MIGRATION_NAME, 'completed', JSON.stringify({ game_id: row.id, before: { votes, shots } }), new Date().toISOString()],
    );
  });
  return { applied: true };
}
