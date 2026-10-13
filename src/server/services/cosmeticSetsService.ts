import { z } from 'zod';
import type { DatabaseWrapper } from '../../db/index.ts';
import { COSMETIC_RARITIES } from '../../lib/cosmeticAssets.ts';
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
      if (!item.slot.startsWith('portrait_')) throw new CosmeticsError('set_item_not_wearable');
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
