import type { DatabaseWrapper } from '../../db/index.ts';

const MIGRATION_NAME = '2026-10-owner-no-scoring-tags-v1';

/**
 * Votings the owner tagged «без оценок» by hand (2026-10-26), before the protocol window had the button. Each entry is
 * checked against the stored votes first, so a game that was edited since is left alone. Only `no_scoring` is added.
 */
const TAGS = [
  // 23.10, game 2 of the evening: восьмёрка после промаха, a broken split (owner).
  { gameId: 18, eveningId: '4c5c8366-5e9b-4449-8f2b-8c0ceef02e64', roundNumber: 6, voteCounts: { 1: 2, 2: 2, 4: 1, 9: 3 } },
];

export async function applyOwnerNoScoringTags(db: DatabaseWrapper): Promise<{ applied: boolean; tagged: number }> {
  const existing = await db.get<{ status?: string }>('SELECT status FROM migration_history WHERE migration_name = ? LIMIT 1', [MIGRATION_NAME]);
  if (existing?.status === 'completed') return { applied: false, tagged: 0 };
  const done: Array<{ gameId: number; roundNumber: number; result: string }> = [];
  await db.transaction(async (tx) => {
    for (const tag of TAGS) {
      const row = await tx.get<{ protocol_text: string | null }>('SELECT protocol_text FROM games WHERE id = ? AND evening_id = ? LIMIT 1', [tag.gameId, tag.eveningId]);
      let payload: any = null;
      try { payload = row?.protocol_text ? JSON.parse(row.protocol_text) : null; } catch { payload = null; }
      const round = Array.isArray(payload?.protocol?.votes) ? payload.protocol.votes.find((item: any) => Number(item?.round_number) === tag.roundNumber) : null;
      const counts = round?.vote_counts || {};
      const matches = round && Object.entries(tag.voteCounts).every(([seat, count]) => Number(counts[seat] ?? 0) === count)
        && Object.values(counts).reduce((sum: number, value: any) => sum + Number(value || 0), 0) === Object.values(tag.voteCounts).reduce((sum, value) => sum + value, 0);
      if (!matches) { done.push({ gameId: tag.gameId, roundNumber: tag.roundNumber, result: 'skipped: votes differ' }); continue; }
      round.no_scoring = true;
      await tx.run('UPDATE games SET protocol_text = ? WHERE id = ?', [JSON.stringify(payload), tag.gameId]);
      done.push({ gameId: tag.gameId, roundNumber: tag.roundNumber, result: 'tagged' });
    }
    await tx.run(
      'INSERT INTO migration_history (id, migration_name, status, details_json, executed_at) VALUES (?, ?, ?, ?, ?)',
      [MIGRATION_NAME, MIGRATION_NAME, 'completed', JSON.stringify(done), new Date().toISOString()],
    );
  });
  return { applied: true, tagged: done.filter((item) => item.result === 'tagged').length };
}
