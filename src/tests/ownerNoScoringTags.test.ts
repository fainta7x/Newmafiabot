import { afterEach, describe, expect, it } from 'vitest';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { ensureEloSeedSchema } from '../db/ensureEloSeedSchema.ts';
import { applyOwnerNoScoringTags } from '../server/dataMigrations/applyOwnerNoScoringTags.ts';

const opened: DatabaseWrapper[] = [];
afterEach(() => { while (opened.length) opened.pop()?.sqlite.close(); });

const setup = async (counts: Record<number, number>) => {
  const db = createDatabaseConnection(':memory:'); opened.push(db);
  await ensureEloSeedSchema(db);
  (db.sqlite as any).pragma('foreign_keys = OFF'); // the test seeds a game without its evening
  const payload = { protocol: { votes: [{ round_number: 5, day_number: 2 }, { round_number: 6, day_number: 3, vote_counts: counts }] } };
  await db.run('INSERT INTO games (id, global_game_number, game_date, winner_team, winner_label, slots_json, created_at, evening_id, protocol_text) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [18, 18, '2026-10-23', 'red', 'Красные', '[]', '2026-10-23', '4c5c8366-5e9b-4449-8f2b-8c0ceef02e64', JSON.stringify(payload)]);
  return db;
};
const stored = async (db: DatabaseWrapper) => JSON.parse((await db.get<any>('SELECT protocol_text FROM games WHERE id = 18')).protocol_text).protocol.votes;

describe('owner «без оценок» tags (2026-10-26)', () => {
  it('tags the matching voting once and touches nothing else', async () => {
    const db = await setup({ 1: 2, 2: 2, 4: 1, 9: 3 });
    expect(await applyOwnerNoScoringTags(db)).toEqual({ applied: true, tagged: 1 });
    const votes = await stored(db);
    expect(votes[1].no_scoring).toBe(true);
    expect(votes[0].no_scoring).toBeUndefined();
    expect(await applyOwnerNoScoringTags(db)).toEqual({ applied: false, tagged: 0 });
  });

  it('leaves a voting alone when its votes were edited since', async () => {
    const db = await setup({ 1: 3, 2: 2, 4: 1, 9: 2 });
    expect(await applyOwnerNoScoringTags(db)).toEqual({ applied: true, tagged: 0 });
    expect((await stored(db))[1].no_scoring).toBeUndefined();
  });
});
