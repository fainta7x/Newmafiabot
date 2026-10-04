import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.ts';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { syncTrustedTournamentAwards } from '../server/services/playerVerifiedAwardsService.ts';

const opened: DatabaseWrapper[] = [];
afterEach(() => { while (opened.length) opened.pop()?.sqlite.close(); });

const insertAward = (db: DatabaseWrapper, id: string, sourceType: string, sourceKey: string | null) => {
  const now = new Date().toISOString();
  return db.run(
    `INSERT INTO player_verified_awards (id, player_id, kind, title, tournament_name, source, source_type, source_key, verification_status, created_by, verified_by, verified_at, created_at, updated_at)
     VALUES (?, 'p1', 'placement', '1 место', 'Кубок', 'test', ?, ?, 'verified', 'x', 'x', ?, ?, ?)`,
    [id, sourceType, sourceKey, now, now, now],
  );
};

describe('trusted tournament trophies', () => {
  it('removes an automatic trophy that is no longer earned, keeps manual ones', async () => {
    const db = createDatabaseConnection(':memory:'); opened.push(db);
    await createApp(db);
    const now = new Date().toISOString();
    await db.run('INSERT INTO players (id, nickname, created_at, updated_at) VALUES (?,?,?,?)', ['p1', 'Игрок', now, now]);
    await insertAward(db, 'stale', 'automatic', 'trusted-tournament:old-tournament:place:1');
    await insertAward(db, 'manual', 'manual', null);
    await syncTrustedTournamentAwards(db, 'p1');
    const ids = (await db.all<any>("SELECT id FROM player_verified_awards WHERE player_id = 'p1'")).map((row) => row.id);
    expect(ids).toEqual(['manual']);
  });
});
