import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.ts';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { loadPremiumProfileAwardsLight } from '../server/services/premiumPlayerProfileShowcaseService.ts';

const opened: DatabaseWrapper[] = [];
afterEach(() => { while (opened.length) opened.pop()?.sqlite.close(); });

describe('cheap profile awards for the overview', () => {
  it('returns persisted verified awards with the pinned ones in order, without reconciling trophies', async () => {
    const db = createDatabaseConnection(':memory:'); opened.push(db);
    await createApp(db);
    const now = new Date().toISOString();
    await db.run('INSERT INTO players (id, nickname, created_at, updated_at) VALUES (?,?,?,?)', ['p1', 'Игрок', now, now]);
    const insert = (id: string, pin: number | null, key: string | null) => db.run(
      `INSERT INTO player_verified_awards (id, player_id, kind, title, tournament_name, source, source_type, source_key, verification_status, pinned_position, created_by, verified_by, verified_at, created_at, updated_at)
       VALUES (?, 'p1', 'placement', ?, 'Кубок', 'test', ?, ?, 'verified', ?, 'x', 'x', ?, ?, ?)`,
      [id, `Награда ${id}`, key ? 'automatic' : 'manual', key, pin, now, now, now],
    );
    await insert('a', 2, null);
    await insert('b', 1, null);
    await insert('c', null, null);
    // An automatic trophy nobody earns any more: the cheap read does not touch it (the full read reconciles it).
    await insert('stale', null, 'trusted-tournament:gone:place:1');
    const light = await loadPremiumProfileAwardsLight(db, 'p1');
    expect(light.pinned_awards.map((award: any) => award.id)).toEqual(['b', 'a']);
    expect(light.awards.map((award: any) => award.id).sort()).toEqual(['a', 'b', 'c', 'stale']);
  });
});
