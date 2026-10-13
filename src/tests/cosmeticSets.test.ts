import { afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.ts';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { ensureCosmeticsSchema } from '../db/ensureCosmeticsSchema.ts';
import { createCosmeticItem, createCosmeticSeason, getCosmetics } from '../server/services/cosmeticsService.ts';
import { createDraftCosmeticSet, listCosmeticSets, replaceDraftCosmeticSetItems } from '../server/services/cosmeticSetsService.ts';
import { generateOrganizerToken, generatePlayerSessionToken } from '../server/auth.ts';

const opened: DatabaseWrapper[] = [];
afterEach(() => { while (opened.length) opened.pop()?.sqlite.close(); });

async function setup() {
  const db = createDatabaseConnection(':memory:'); opened.push(db);
  await db.run('INSERT INTO players(id,nickname,created_at,updated_at) VALUES(?,?,?,?)', ['p', 'Player', '2026-10-13', '2026-10-13']);
  await ensureCosmeticsSchema(db);
  await createCosmeticSeason(db, { id: 'autumn', name: 'Autumn', startsAt: '2026-10-01T00:00:00Z', endsAt: '2026-11-01T00:00:00Z' });
  await createCosmeticSeason(db, { id: 'winter', name: 'Winter', startsAt: '2026-12-01T00:00:00Z', endsAt: '2027-01-01T00:00:00Z' });
  for (const item of [
    { id: 'hat1', slot: 'portrait_hat', assetKey: 'autumn-fedora-v1', rarity: 'rare' },
    { id: 'hat2', slot: 'portrait_hat', assetKey: 'autumn-fedora-v1', rarity: 'legendary' },
    { id: 'jacket', slot: 'portrait_jacket', assetKey: 'autumn-jacket-v1', rarity: 'common' },
    { id: 'frame', slot: 'profile_frame', assetKey: 'fiery-autumn-frame-v1', rarity: 'rare' },
  ] as const) {
    await createCosmeticItem(db, { ...item, name: item.id, seasonId: 'autumn' });
  }
  await createCosmeticItem(db, { id: 'winter-hat', name: 'Winter hat', rarity: 'common', slot: 'portrait_hat', assetKey: 'autumn-fedora-v1', seasonId: 'winter' });
  return db;
}

describe('draft clothing collections foundation', () => {
  it('stores a set independently of its items, item rarities, ownership, and economy', async () => {
    const db = await setup();
    await createDraftCosmeticSet(db, { id: 'set', name: 'Draft collection', rarity: 'legendary', seasonId: 'autumn' });
    await replaceDraftCosmeticSetItems(db, 'set', { itemIds: ['hat1', 'jacket'] });
    await ensureCosmeticsSchema(db);
    const [set] = await listCosmeticSets(db);
    expect(set).toMatchObject({ id: 'set', rarity: 'legendary', published: false });
    expect(set.items).toEqual([
      { id: 'hat1', name: 'hat1', rarity: 'rare', slot: 'portrait_hat', published: false },
      { id: 'jacket', name: 'jacket', rarity: 'common', slot: 'portrait_jacket', published: false },
    ]);
    expect((await getCosmetics(db, 'p')).inventory).toEqual([]);
    expect(await db.get('SELECT tokens,elo FROM players WHERE id=?', ['p'])).toMatchObject({ tokens: expect.any(Number), elo: expect.any(Number) });
    expect(await db.get('SELECT COUNT(*) as n FROM compendium_memberships')).toEqual({ n: 0 });
  });

  it('validates membership atomically, rejecting repeated IDs, overlapping slots, non-wardrobe items and cross-season contents', async () => {
    const db = await setup();
    await createDraftCosmeticSet(db, { id: 'set', name: 'Draft', rarity: 'common', seasonId: 'autumn' });
    await replaceDraftCosmeticSetItems(db, 'set', { itemIds: ['hat1', 'jacket'] });
    for (const itemIds of [['hat1', 'hat1'], ['hat1', 'hat2'], ['frame'], ['winter-hat'], ['missing']]) {
      await expect(replaceDraftCosmeticSetItems(db, 'set', { itemIds })).rejects.toThrow();
    }
    expect((await listCosmeticSets(db))[0].items.map(item => item.id)).toEqual(['hat1', 'jacket']);
    await replaceDraftCosmeticSetItems(db, 'set', { itemIds: ['hat2'] });
    expect((await listCosmeticSets(db))[0].items.map(item => item.id)).toEqual(['hat2']);
  });

  it('never changes an already released set and never auto-publishes or releases component artwork', async () => {
    const db = await setup();
    await createDraftCosmeticSet(db, { id: 'set', name: 'Draft', rarity: 'rare', seasonId: 'autumn' });
    await db.run('UPDATE cosmetic_sets SET published=1 WHERE id=?', ['set']);
    await expect(replaceDraftCosmeticSetItems(db, 'set', { itemIds: ['hat1'] })).rejects.toMatchObject({ code: 'published_set_immutable' });
    expect((await getCosmetics(db, 'p')).catalog).toEqual([]);
  });

  it('only permits club owners to manage draft collections through the HTTP API', async () => {
    const db = await setup(), app = await createApp(db);
    const url = '/api/player/cosmetics/admin/sets';
    const cookie = `player_token=${generatePlayerSessionToken('p')}`;
    expect((await request(app).get(url).set('Cookie', cookie)).status).toBe(401);
    expect((await request(app).post(url).set('Cookie', cookie).send({ id: 'set', name: 'Draft', rarity: 'rare', seasonId: 'autumn' })).status).toBe(401);
    const owner = `organizer_token=${generateOrganizerToken()}`;
    expect((await request(app).post(url).set('Cookie', owner).send({ id: 'set', name: 'Draft', rarity: 'rare', seasonId: 'autumn' })).status).toBe(200);
    expect((await request(app).put(url + '/set/items').set('Cookie', owner).send({ itemIds: ['hat1', 'jacket'] })).status).toBe(200);
    expect((await request(app).get(url).set('Cookie', owner)).body[0].items).toHaveLength(2);
  });
});
