import { z } from 'zod';
import type { DatabaseWrapper } from '../../db/index.ts';
import { COSMETIC_ASSETS, COSMETIC_RARITIES, type CosmeticAssetKey } from '../../lib/cosmeticAssets.ts';
import { PORTRAIT_EQUIPMENT_SLOTS, type PortraitEquipmentSlot, type WardrobeSet } from '../../lib/roleLooks.ts';
import { CosmeticsError } from './cosmeticsService.ts';

const key = z.string().trim().min(1).max(120).regex(/^[a-zA-Z0-9:_-]+$/);
export const draftSetInput = z.object({
  id: key,
  name: z.string().trim().min(1).max(120),
  rarity: z.enum(COSMETIC_RARITIES),
  seasonId: key.nullable().default(null),
}).strict();
export const draftSetItemsInput = z.object({
  itemIds: z.array(key).max(64).refine(ids => new Set(ids).size === ids.length, 'duplicate_item'),
}).strict();

/** A set groups independently owned/equipped items. The set is not itself an item. */
export async function createDraftCosmeticSet(db: DatabaseWrapper, input: unknown) {
  const s = draftSetInput.parse(input);
  return db.transaction(async tx => {
    if (s.seasonId && !await tx.get('SELECT id FROM cosmetic_seasons WHERE id=?', [s.seasonId])) {
      throw new CosmeticsError('season_not_found', 404);
    }
    await tx.run(
      'INSERT INTO cosmetic_sets(id,name,rarity,season_id,published,created_at) VALUES(?,?,?,?,0,?)',
      [s.id, s.name, s.rarity, s.seasonId, new Date().toISOString()],
    );
    return { ...s, published: false, items: [] };
  });
}

/** Draft-only editing: never publishes art, grants ownership or equips a player's look. */
export async function replaceDraftCosmeticSetItems(db: DatabaseWrapper, setId: string, input: unknown) {
  key.parse(setId);
  const { itemIds } = draftSetItemsInput.parse(input);
  return db.transaction(async tx => {
    const set = await tx.get<any>('SELECT * FROM cosmetic_sets WHERE id=?', [setId]);
    if (!set) throw new CosmeticsError('set_not_found', 404);
    if (set.published) throw new CosmeticsError('published_set_immutable');
    const occupied = new Set<string>();
    const items: Array<{ id: string; name: string; slot: string; rarity: string }> = [];
    for (const itemId of itemIds) {
      const item = await tx.get<any>('SELECT id,name,slot,rarity,season_id FROM cosmetic_catalog WHERE id=?', [itemId]);
      if (!item) throw new CosmeticsError('set_item_not_found', 404);
      // Outfit sets only group wearable portrait items, not tables, reactions or frames.
      if (!PORTRAIT_EQUIPMENT_SLOTS.some(slot => slot === item.slot)) throw new CosmeticsError('set_item_not_wearable');
      // A full look can only equip one item per slot at a time.
      if (occupied.has(item.slot)) throw new CosmeticsError('set_slot_collision');
      occupied.add(item.slot);
      // A global item may be part of a seasonal set; do not mix two explicit seasons.
      if (item.season_id && item.season_id !== set.season_id) throw new CosmeticsError('set_season_mismatch');
      items.push({ id: item.id, name: item.name, slot: item.slot, rarity: item.rarity });
    }
    await tx.run('DELETE FROM cosmetic_set_items WHERE set_id=?', [setId]);
    for (const item of items) {
      await tx.run('INSERT INTO cosmetic_set_items(set_id,item_id) VALUES(?,?)', [setId, item.id]);
    }
    return { setId, items };
  });
}

/** Owner preview of both draft and released definitions; no set redemption semantics. */
export async function listCosmeticSets(db: DatabaseWrapper) {
  const sets = await db.all<any>('SELECT id,name,rarity,season_id,published FROM cosmetic_sets ORDER BY created_at,id');
  const members = await db.all<any>(`SELECT m.set_id,c.id,c.name,c.rarity,c.slot,c.published
    FROM cosmetic_set_items m JOIN cosmetic_catalog c ON c.id=m.item_id ORDER BY m.set_id,c.slot,c.id`);
  return sets.map(s => ({
    id: s.id, name: s.name, rarity: s.rarity, seasonId: s.season_id, published: Boolean(s.published),
    items: members.filter(m => m.set_id === s.id).map(m => ({
      id: m.id, name: m.name, rarity: m.rarity, slot: m.slot, published: Boolean(m.published),
    })),
  }));
}


/** Owner-only catalog of already defined wearable items. Draft assets are
 * intentionally visible here, but this endpoint can never publish or equip them.
 */
export async function listDraftWearableItems(db: DatabaseWrapper) {
  const rows = await db.all<any>('SELECT id,name,slot,rarity,season_id,asset_key,published FROM cosmetic_catalog ORDER BY created_at,id');
  return rows.flatMap(row => {
    const asset = COSMETIC_ASSETS[row.asset_key as CosmeticAssetKey];
    if (!PORTRAIT_EQUIPMENT_SLOTS.some(slot => slot === row.slot) || !asset || asset.slot !== row.slot) return [];
    return [{
      id: row.id as string, name: row.name as string, slot: row.slot as PortraitEquipmentSlot,
      rarity: row.rarity as string, seasonId: row.season_id as string | null,
      published: Boolean(row.published), url: asset.url, draft: asset.draft,
    }];
  });
}

/** Self-facing gallery: no draft sets, draft art, unpublished item names or
 * arbitrary URLs. Ownership is per component; a set is not an inventory item.
 * A malformed published set is hidden in full, never advertised as complete.
 */
export async function listReleasedWardrobeSets(db: DatabaseWrapper, playerId: string): Promise<WardrobeSet[]> {
  const sets = await db.all<any>('SELECT id,name,rarity FROM cosmetic_sets WHERE published=1 ORDER BY created_at,id');
  if (!sets.length) return [];
  const members = await db.all<any>(`SELECT m.set_id,c.id,c.name,c.slot,c.rarity,c.asset_key,c.published,
      i.quantity AS owned_quantity
    FROM cosmetic_set_items m
    JOIN cosmetic_catalog c ON c.id=m.item_id
    LEFT JOIN cosmetic_inventory i ON i.item_id=c.id AND i.player_id=?
    WHERE m.set_id IN (SELECT id FROM cosmetic_sets WHERE published=1)
    ORDER BY m.set_id,c.slot,c.id`, [playerId]);
  const result: WardrobeSet[] = [];
  for (const set of sets) {
    const rows = members.filter(r => r.set_id === set.id);
    if (!rows.length) continue;
    const items = rows.map(row => {
      const asset = COSMETIC_ASSETS[row.asset_key as CosmeticAssetKey];
      if (!row.published || !asset || asset.draft || asset.slot !== row.slot ||
          !PORTRAIT_EQUIPMENT_SLOTS.some(slot => slot === row.slot)) return null;
      return {
        itemId: row.id as string, name: row.name as string,
        slot: row.slot as PortraitEquipmentSlot, rarity: row.rarity as string,
        url: asset.url, owned: Number(row.owned_quantity) >= 1,
      };
    });
    if (items.some(item => item === null)) continue;
    result.push({ id: set.id, name: set.name, rarity: set.rarity, items: items.filter((x): x is NonNullable<typeof x> => x !== null) });
  }
  return result;
}

/** Allowed source artwork only, no arbitrary URL and no player exposure. */
export function listDraftWearableAssets() {
  return Object.entries(COSMETIC_ASSETS).flatMap(([key, asset]) =>
    PORTRAIT_EQUIPMENT_SLOTS.some(slot => slot === asset.slot)
      ? [{ key, slot: asset.slot as PortraitEquipmentSlot, url: asset.url, draft: asset.draft }]
      : [],
  );
}
