import { afterEach, describe, expect, it } from 'vitest';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { createApp } from '../app.ts';
import { listVipProbabilityRules, saveVipProbabilityRule } from '../server/services/vipProbabilityRulesService.ts';

const active: DatabaseWrapper[] = [];
afterEach(() => { while (active.length) active.pop()?.sqlite.close(); });
async function setup() {
  const db = createDatabaseConnection(':memory:'); active.push(db);
  await createApp(db);
  const now = new Date().toISOString();
  for (const [id, nick] of [['p1', 'Игрок'], ['p2', 'Напарник']]) await db.run('INSERT INTO players(id,nickname,created_at,updated_at) VALUES(?,?,?,?)', [id, nick, now, now]);
  return db;
}

describe('VIP: one condition once per player (owner, 2026-11-03)', () => {
  it('refuses the same condition twice and the player paired with himself; editing the one rule still works', async () => {
    const db = await setup();
    const rule = { playerId: 'p1', kind: 'role', role: 'sheriff', otherPlayerId: null, percent: 40, enabled: true };
    const saved = await saveVipProbabilityRule(db, rule);
    await expect(saveVipProbabilityRule(db, { ...rule, percent: 70 })).rejects.toMatchObject({ statusCode: 409 });
    await expect(saveVipProbabilityRule(db, { ...rule, role: 'don' })).resolves.toBeTruthy();
    await expect(saveVipProbabilityRule(db, { ...rule, percent: 90 }, saved.id)).resolves.toBeTruthy();
    const pair = { playerId: 'p1', kind: 'same_color', role: null, otherPlayerId: 'p2', percent: 30, enabled: true };
    await saveVipProbabilityRule(db, pair);
    await expect(saveVipProbabilityRule(db, pair)).rejects.toMatchObject({ statusCode: 409 });
    await expect(saveVipProbabilityRule(db, { ...pair, otherPlayerId: 'p1' })).rejects.toThrow();
    const mine = (await listVipProbabilityRules(db)).filter((item) => item.playerId === 'p1');
    expect(mine).toHaveLength(3);
  });
});
