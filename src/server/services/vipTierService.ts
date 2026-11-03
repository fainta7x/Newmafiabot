import { randomUUID } from 'node:crypto';
import type { DatabaseWrapper } from '../../db/index.ts';

export type VipLimitScope = 'game' | 'evening';
export type VipTierInput = { name: string; limit: number | null; scope: VipLimitScope; enabled: boolean };
export type VipTier = VipTierInput & { id: string };
export type VipAssignment = { playerId: string; tierId: string };

function fail(message: string, statusCode = 400): never {
  throw Object.assign(new Error(message), { statusCode });
}
export function validateVipTier(input: any): VipTierInput {
  const name = typeof input?.name === 'string' ? input.name.trim() : '';
  if (!name || name.length > 64) fail('Название VIP-уровня должно быть от 1 до 64 символов');
  if (input?.scope !== 'game' && input?.scope !== 'evening') fail('Выберите период лимита');
  const limit = input?.limit == null ? null : input.limit;
  if (limit !== null && (!Number.isInteger(limit) || limit < 0 || limit > 10000))
    fail('Лимит должен быть целым числом от 0 до 10000');
  if (typeof input?.enabled !== 'boolean') fail('Укажите состояние VIP-уровня');
  return { name, limit, scope: input.scope, enabled: input.enabled };
}

export async function ensureVipTiersSchema(db: DatabaseWrapper) {
  await db.exec(`CREATE TABLE IF NOT EXISTS vip_tiers (
    id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE,
    success_limit INTEGER CHECK(success_limit IS NULL OR success_limit BETWEEN 0 AND 10000),
    limit_scope TEXT NOT NULL CHECK(limit_scope IN ('game','evening')),
    enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)),
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS vip_tier_assignments (
    player_id TEXT PRIMARY KEY,
    tier_id TEXT NOT NULL REFERENCES vip_tiers(id) ON DELETE CASCADE,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_vip_tier_assignments_tier ON vip_tier_assignments(tier_id);`);
}

export async function readVipTiers(db: DatabaseWrapper): Promise<{ tiers: VipTier[]; assignments: VipAssignment[] }> {
  await ensureVipTiersSchema(db);
  const rows = await db.all<any>('SELECT id,name,success_limit,limit_scope,enabled FROM vip_tiers ORDER BY name');
  const assignments = await db.all<any>('SELECT player_id,tier_id FROM vip_tier_assignments ORDER BY player_id');
  return {
    tiers: rows.map(row => ({ id: row.id, name: row.name, limit: row.success_limit,
      scope: row.limit_scope, enabled: Boolean(row.enabled) })),
    assignments: assignments.map(row => ({ playerId: row.player_id, tierId: row.tier_id })),
  };
}
export async function saveVipTier(db: DatabaseWrapper, input: unknown, id?: string): Promise<VipTier> {
  const tier = validateVipTier(input);
  await ensureVipTiersSchema(db);
  return db.transaction(async tx => {
    const now = new Date().toISOString();
    const tierId = id ?? randomUUID();
    if (id) {
      const previous = await tx.get('SELECT id FROM vip_tiers WHERE id=?', [id]);
      if (!previous) fail('VIP-уровень не найден', 404);
      await tx.run('UPDATE vip_tiers SET name=?,success_limit=?,limit_scope=?,enabled=?,updated_at=? WHERE id=?',
        [tier.name,tier.limit,tier.scope,Number(tier.enabled),now,id]);
    } else {
      await tx.run('INSERT INTO vip_tiers(id,name,success_limit,limit_scope,enabled,created_at,updated_at) VALUES(?,?,?,?,?,?,?)',
        [tierId,tier.name,tier.limit,tier.scope,Number(tier.enabled),now,now]);
    }
    return { id:tierId,...tier };
  });
}
export async function assignVipTier(db: DatabaseWrapper, playerId: string, tierId: string | null) {
  if (!playerId) fail('Выберите игрока');
  await ensureVipTiersSchema(db);
  return db.transaction(async tx => {
    const player = await tx.get('SELECT id FROM players WHERE id=?', [playerId]);
    if (!player) fail('Игрок не найден',404);
    if (tierId === null) {
      await tx.run('DELETE FROM vip_tier_assignments WHERE player_id=?',[playerId]);
      return {playerId,tierId:null};
    }
    const tier = await tx.get('SELECT id FROM vip_tiers WHERE id=?',[tierId]);
    if (!tier) fail('VIP-уровень не найден',404);
    await tx.run(`INSERT INTO vip_tier_assignments(player_id,tier_id,updated_at) VALUES(?,?,?)
      ON CONFLICT(player_id) DO UPDATE SET tier_id=excluded.tier_id,updated_at=excluded.updated_at`,
      [playerId,tierId,new Date().toISOString()]);
    return {playerId,tierId};
  });
}
export async function deleteVipTier(db: DatabaseWrapper, id:string) {
  await ensureVipTiersSchema(db);
  return db.transaction(async tx => {
    await tx.run('DELETE FROM vip_tier_assignments WHERE tier_id=?',[id]);
    const result = await tx.run('DELETE FROM vip_tiers WHERE id=?',[id]);
    return {deleted:Number(result.changes)>0};
  });
}
/**
 * Rules with individual limits take precedence over tier limits. A null
 * effective limit means unlimited ONLY when explicitly enabled by a future
 * live-dealing controller; a disabled tier never grants its bonuses.
 */
export function resolveVipQuota(ruleLimit:number|null, tier:VipTier|null,
  ruleScope:VipLimitScope, used:number): { allowed:boolean; limit:number|null; scope:VipLimitScope } {
  const limit=ruleLimit ?? (tier?.enabled ? tier.limit : null);
  const scope=ruleLimit !== null ? ruleScope : (tier?.scope ?? ruleScope);
  // Disabling a tier removes tier-only bonuses. A separately configured
  // personal limit is independent and may still be evaluated by the dealer.
  const allowed = tier?.enabled === false && ruleLimit === null
    ? false
    : limit === null || used < limit;
  return {allowed,limit,scope};
}
