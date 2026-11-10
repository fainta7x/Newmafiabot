import { afterEach, describe, expect, it } from 'vitest';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { ensureVipProbabilityRulesSchema, listVipProbabilityRules } from '../server/services/vipProbabilityRulesService.ts';

const opened: DatabaseWrapper[] = [];
afterEach(() => { while (opened.length) opened.pop()?.sqlite.close(); });

describe('duplicate VIP conditions of one player', () => {
  it('collapse into the oldest one once; different conditions stay', async () => {
    const db = createDatabaseConnection(':memory:'); opened.push(db);
    await ensureVipProbabilityRulesSchema(db);
    const add = (id: string, kind: string, role: string | null, at: string, percent = 100) => db.run(
      `INSERT INTO vip_probability_rules (id,player_id,kind,role,other_player_id,percent,enabled,created_at,updated_at) VALUES (?,?,?,?,NULL,?,1,?,?)`, [id, 'p1', kind, role, percent, at, at]);
    await add('old', 'red_color', null, '2026-11-03T10:00:00Z');
    await add('new', 'red_color', null, '2026-11-04T10:00:00Z', 60);
    await add('role-a', 'role', 'sheriff', '2026-11-05T10:00:00Z');
    await add('role-b', 'role', 'don', '2026-11-05T10:00:00Z');
    const rules = await listVipProbabilityRules(db);
    expect(rules.map((rule) => rule.id).filter((id) => id !== 'legacy-chagin-red-guarantee').sort()).toEqual(['old', 'role-a', 'role-b']);
    await add('later', 'role', 'sheriff', '2026-11-06T10:00:00Z');
    // the clean-up runs once: a later duplicate is stopped by the save check, not silently deleted here
    expect((await listVipProbabilityRules(db)).some((rule) => rule.id === 'later')).toBe(true);
  });
});
