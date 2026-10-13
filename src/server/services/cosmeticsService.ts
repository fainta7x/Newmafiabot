import { z } from 'zod';
import type { DatabaseWrapper } from '../../db/index.ts';
import { COSMETIC_ASSETS, COSMETIC_RARITIES, COSMETIC_SLOTS, type CosmeticAssetKey } from '../../lib/cosmeticAssets.ts';

const key = z.string().trim().min(1).max(120).regex(/^[a-zA-Z0-9:_-]+$/);
const name = z.string().trim().min(1).max(120);
const date = z.iso.datetime({ offset: true }).transform(value => new Date(value).toISOString());
export const seasonInput = z.object({ id: key, name, startsAt: date, endsAt: date,
  levelThresholds: z.array(z.number().int().safe().nonnegative()).max(200).default([]),
  duplicateXp: z.partialRecord(z.enum(COSMETIC_RARITIES), z.number().int().safe().positive()).default({}),
}).strict().superRefine((s, ctx) => {
  if (s.startsAt >= s.endsAt) ctx.addIssue({ code: 'custom', message: 'Season end must follow its start' });
  if (s.levelThresholds.length && (s.levelThresholds[0] !== 0 || s.levelThresholds.some((v, i) => i > 0 && v <= s.levelThresholds[i - 1]))) ctx.addIssue({ code: 'custom', message: 'Thresholds must start at zero and increase strictly' });
});
export const itemInput = z.object({ id: key, name, rarity: z.enum(COSMETIC_RARITIES), slot: z.enum(COSMETIC_SLOTS),
  assetKey: z.enum(Object.keys(COSMETIC_ASSETS) as [CosmeticAssetKey, ...CosmeticAssetKey[]]), seasonId: key.nullable().default(null), published: z.boolean().default(false),
}).strict().superRefine((s, ctx) => {
  if (COSMETIC_ASSETS[s.assetKey].slot !== s.slot) ctx.addIssue({ code: 'custom', message: 'Asset does not support this slot' });
  if (s.published && COSMETIC_ASSETS[s.assetKey].draft) ctx.addIssue({ code: 'custom', message: 'Draft artwork cannot be published' });
});
export const operationInput = z.object({ requestId: key }).strict();
export class CosmeticsError extends Error {
  constructor(public code: string, public status = 409) { super(code); }
}
const requireThat = (value: unknown, code: string, status = 409) => { if (!value) throw new CosmeticsError(code, status); };
async function player(db: DatabaseWrapper, playerId: string) {
  requireThat(await db.get('SELECT id FROM players WHERE id=?', [playerId]), 'player_not_found', 404);
}
async function season(db: DatabaseWrapper, id: string) {
  const row = await db.get<any>('SELECT * FROM cosmetic_seasons WHERE id=?', [id]);
  requireThat(row, 'season_not_found', 404); return row;
}
function isActive(row: any, now: string) { return row.starts_at <= now && now < row.ends_at; }
export function compendiumLevel(xp: number, thresholds: number[]): number | null {
  if (!thresholds.length) return null;
  return thresholds.filter(n => xp >= n).length;
}
/** Immutable definitions: no silently edited reward/XP rules after publication. */
export async function createCosmeticSeason(db: DatabaseWrapper, input: unknown) {
  const s = seasonInput.parse(input);
  await db.run('INSERT INTO cosmetic_seasons(id,name,starts_at,ends_at,level_thresholds_json,duplicate_xp_json,created_at) VALUES(?,?,?,?,?,?,?)',
    [s.id, s.name, s.startsAt, s.endsAt, JSON.stringify(s.levelThresholds), JSON.stringify(s.duplicateXp), new Date().toISOString()]);
  return season(db, s.id);
}
export async function createCosmeticItem(db: DatabaseWrapper, input: unknown) {
  const s = itemInput.parse(input);
  await db.run('INSERT INTO cosmetic_catalog(id,name,rarity,slot,asset_key,season_id,published,created_at) VALUES(?,?,?,?,?,?,?,?)',
    [s.id, s.name, s.rarity, s.slot, s.assetKey, s.seasonId, Number(s.published), new Date().toISOString()]);
  return s;
}
async function event<T>(db: DatabaseWrapper, playerId: string, requestId: string, operation: string, payload: unknown, actorId: string, action: (tx: DatabaseWrapper) => Promise<T>): Promise<T> {
  key.parse(requestId); requireThat(actorId, 'actor_required', 400);
  const json = JSON.stringify(payload);
  return db.transaction(async tx => {
    await player(tx, playerId);
    const old = await tx.get<any>('SELECT * FROM cosmetic_events WHERE player_id=? AND request_id=?', [playerId, requestId]);
    if (old) {
      requireThat(old.operation === operation && old.payload_json === json, 'request_conflict');
      return JSON.parse(old.result_json) as T;
    }
    const result = await action(tx);
    await tx.run('INSERT INTO cosmetic_events(player_id,request_id,operation,payload_json,result_json,actor_id,created_at) VALUES(?,?,?,?,?,?,?)',
      [playerId, requestId, operation, json, JSON.stringify(result), actorId, new Date().toISOString()]);
    return result;
  });
}
export async function activateCompendium(db: DatabaseWrapper, playerId: string, seasonId: string, paymentReference: string, requestId: string, actorId: string, now = new Date().toISOString()) {
  key.parse(seasonId); name.parse(paymentReference);
  return event(db, playerId, requestId, 'activate', { seasonId, paymentReference }, actorId, async tx => {
    const s = await season(tx, seasonId); requireThat(isActive(s, now), 'season_inactive');
    requireThat(!await tx.get('SELECT player_id FROM compendium_memberships WHERE player_id=? AND season_id=?', [playerId, seasonId]), 'already_activated');
    await tx.run('INSERT INTO compendium_memberships(player_id,season_id,payment_reference,activated_at) VALUES(?,?,?,?)', [playerId, seasonId, paymentReference, now]);
    return { seasonId, xp: 0 };
  });
}
/** Owner-only explicit issuance; random chest grants and purchase writers are deliberately absent. */
export async function grantCosmetic(db: DatabaseWrapper, playerId: string, itemId: string, requestId: string, actorId: string, now = new Date().toISOString()) {
  key.parse(itemId);
  return event(db, playerId, requestId, 'grant', { itemId }, actorId, async tx => {
    const item = await tx.get<any>('SELECT * FROM cosmetic_catalog WHERE id=?', [itemId]);
    requireThat(item?.published, 'item_unavailable', 404);
    if (item.season_id) requireThat(isActive(await season(tx, item.season_id), now), 'season_inactive');
    await tx.run('INSERT INTO cosmetic_inventory(player_id,item_id,quantity,acquired_at) VALUES(?,?,1,?) ON CONFLICT(player_id,item_id) DO UPDATE SET quantity=quantity+1', [playerId, itemId, now]);
    const owned = await tx.get<any>('SELECT quantity FROM cosmetic_inventory WHERE player_id=? AND item_id=?', [playerId, itemId]);
    return { itemId, quantity: Number(owned.quantity) };
  });
}
export async function equipCosmetic(db: DatabaseWrapper, playerId: string, slot: string, itemId: string | null) {
  z.enum(COSMETIC_SLOTS).parse(slot);
  if (itemId !== null) key.parse(itemId);
  return db.transaction(async tx => {
    await player(tx, playerId);
    if (itemId === null) { await tx.run('DELETE FROM cosmetic_equipment WHERE player_id=? AND slot=?', [playerId, slot]); return { slot, itemId: null }; }
    const item = await tx.get<any>('SELECT c.* FROM cosmetic_catalog c JOIN cosmetic_inventory i ON i.item_id=c.id WHERE i.player_id=? AND c.id=? AND i.quantity>=1', [playerId, itemId]);
    requireThat(item && item.slot === slot, 'item_not_owned_or_wrong_slot');
    requireThat(COSMETIC_ASSETS[item.asset_key as CosmeticAssetKey] && !COSMETIC_ASSETS[item.asset_key as CosmeticAssetKey].draft, 'asset_not_ready');
    // Lifetime ownership: the source season ending does not prevent equipment.
    await tx.run('INSERT INTO cosmetic_equipment(player_id,slot,item_id,updated_at) VALUES(?,?,?,?) ON CONFLICT(player_id,slot) DO UPDATE SET item_id=excluded.item_id,updated_at=excluded.updated_at', [playerId, slot, itemId, new Date().toISOString()]);
    return { slot, itemId };
  });
}
export async function dismantleCosmeticDuplicate(db: DatabaseWrapper, playerId: string, itemId: string, seasonId: string, requestId: string, now = new Date().toISOString()) {
  key.parse(itemId); key.parse(seasonId);
  return event(db, playerId, requestId, 'dismantle', { itemId, seasonId }, playerId, async tx => {
    const s = await season(tx, seasonId); requireThat(isActive(s, now), 'season_inactive');
    const member = await tx.get<any>('SELECT xp FROM compendium_memberships WHERE player_id=? AND season_id=?', [playerId, seasonId]);
    requireThat(member, 'compendium_required');
    const item = await tx.get<any>('SELECT c.rarity,i.quantity FROM cosmetic_inventory i JOIN cosmetic_catalog c ON c.id=i.item_id WHERE i.player_id=? AND i.item_id=?', [playerId, itemId]);
    requireThat(item && item.quantity > 1, 'duplicate_required');
    const rates = JSON.parse(s.duplicate_xp_json); const gain = rates[item.rarity];
    requireThat(Number.isSafeInteger(gain) && gain > 0 && JSON.parse(s.level_thresholds_json).length, 'progression_not_configured');
    const xp = Number(member.xp) + gain; requireThat(Number.isSafeInteger(xp), 'xp_overflow');
    const debit = await tx.run('UPDATE cosmetic_inventory SET quantity=quantity-1 WHERE player_id=? AND item_id=? AND quantity>1', [playerId, itemId]);
    requireThat(debit.changes === 1, 'duplicate_required');
    await tx.run('UPDATE compendium_memberships SET xp=? WHERE player_id=? AND season_id=?', [xp, playerId, seasonId]);
    return { itemId, seasonId, gainedXp: gain, xp, level: compendiumLevel(xp, JSON.parse(s.level_thresholds_json)) };
  });
}
export async function getCosmetics(db: DatabaseWrapper, playerId: string) {
  await player(db, playerId);
  const catalog = await db.all<any>('SELECT * FROM cosmetic_catalog WHERE published=1 ORDER BY created_at,id');
  const inventory = await db.all<any>('SELECT i.*,c.name,c.rarity,c.slot,c.asset_key,c.season_id FROM cosmetic_inventory i JOIN cosmetic_catalog c ON c.id=i.item_id WHERE i.player_id=? ORDER BY i.acquired_at,i.item_id', [playerId]);
  const equipment = await db.all<any>('SELECT slot,item_id FROM cosmetic_equipment WHERE player_id=? ORDER BY slot', [playerId]);
  const compendiums = await db.all<any>('SELECT s.id,s.name,s.starts_at,s.ends_at,s.level_thresholds_json,m.xp FROM compendium_memberships m JOIN cosmetic_seasons s ON s.id=m.season_id WHERE m.player_id=? ORDER BY s.starts_at DESC', [playerId]);
  const itemDto = (r: any) => ({ id: r.item_id || r.id, name: r.name, rarity: r.rarity, slot: r.slot, seasonId: r.season_id, asset: COSMETIC_ASSETS[r.asset_key as CosmeticAssetKey] || null, ...(r.quantity ? { quantity: r.quantity, duplicates: r.quantity - 1, acquiredAt: r.acquired_at } : {}) });
  return { catalog: catalog.map(itemDto), inventory: inventory.map(itemDto), equipment,
    compendiums: compendiums.map(s => ({ id: s.id, name: s.name, startsAt: s.starts_at, endsAt: s.ends_at, paid: true, xp: s.xp, level: compendiumLevel(s.xp, JSON.parse(s.level_thresholds_json)), progressionConfigured: JSON.parse(s.level_thresholds_json).length > 0 })),
    capabilities: { chestOpening: false, purchases: false, automaticActivityXp: false, transfers: false } };
}
