import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../app.ts';
import { ensureIsolatedTestRuntimeSchema } from '../db/ensureIsolatedTestRuntimeSchema.ts';
import request from 'supertest';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { ensureCosmeticsSchema } from '../db/ensureCosmeticsSchema.ts';
import { ensureOrganizerPlayerAccessSchema } from '../db/ensureOrganizerPlayerAccessSchema.ts';
import { activateCompendium, compendiumLevel, createCosmeticItem, createCosmeticSeason, dismantleCosmeticDuplicate, equipCosmetic, getCosmetics, grantCosmetic } from '../server/services/cosmeticsService.ts';
import { generateOrganizerToken, generatePlayerSessionToken } from '../server/auth.ts';

// A reviewed asset fixture exercises the ready-art path; real artwork remains draft.
vi.mock('../lib/cosmeticAssets.ts', async importOriginal => {
  const actual = await importOriginal<any>();
  return { ...actual, COSMETIC_ASSETS: { ...actual.COSMETIC_ASSETS,
    'test-frame': { slot: 'profile_frame', url: '/cosmetics/test-frame.svg', draft: false },
  } };
});
const opened: DatabaseWrapper[] = [];
afterEach(() => { while (opened.length) opened.pop()?.sqlite.close(); });
const NOW = '2026-10-13T12:00:00.000Z';
async function setup(configured = true) {
  const db = createDatabaseConnection(':memory:'); opened.push(db);
  await db.run('INSERT INTO players(id,nickname,elo,tokens,created_at,updated_at) VALUES(?,?,?,?,?,?),(?,?,?,?,?,?)', ['p','Игрок',1234,77,NOW,NOW,'other','Другой',1456,55,NOW,NOW]);
  await ensureCosmeticsSchema(db);
  await createCosmeticSeason(db, { id: 'season', name: 'Тестовый сезон', startsAt: '2026-10-01T00:00:00Z', endsAt: '2026-11-01T00:00:00Z', ...(configured ? { levelThresholds: [0, 50, 100], duplicateXp: { rare: 50 } } : {}) });
  await createCosmeticItem(db, { id: 'frame', name: 'Рамка', rarity: 'rare', slot: 'profile_frame', assetKey: 'test-frame', seasonId: 'season', published: true });
  return db;
}
const grant = (db: DatabaseWrapper, key: string) => grantCosmetic(db, 'p', 'frame', key, 'owner', NOW);
const activate = (db: DatabaseWrapper) => activateCompendium(db, 'p', 'season', 'payment-test', 'activate', 'owner', NOW);

describe('cosmetics and compendium foundation', () => {
  it('adds schema idempotently and leaves club money/rating untouched', async () => {
    const db = await setup(); await ensureCosmeticsSchema(db); await grant(db, 'g1'); await grant(db, 'g2'); await activate(db);
    await dismantleCosmeticDuplicate(db, 'p', 'frame', 'season', 'd1', NOW);
    expect(await db.get('SELECT elo,tokens FROM players WHERE id=?', ['p'])).toEqual({ elo: 1234, tokens: 77 });
    expect(await db.get('SELECT elo,tokens FROM players WHERE id=?', ['other'])).toEqual({ elo: 1456, tokens: 55 });
  });
  it('retains duplicates and makes issuance idempotent under concurrent retries', async () => {
    const db = await setup(); await Promise.all([grant(db, 'g1'), grant(db, 'g1')]);
    expect((await getCosmetics(db, 'p')).inventory[0].quantity).toBe(1);
    await grant(db, 'g2'); expect((await getCosmetics(db, 'p')).inventory[0].duplicates).toBe(1);
    await expect(grantCosmetic(db, 'p', 'missing', 'g1', 'owner', NOW)).rejects.toMatchObject({ code: 'request_conflict' });
  });
  it('converts one extra copy to XP once, preserving the final copy and equipment', async () => {
    const db = await setup(); await grant(db, 'g1'); await grant(db, 'g2'); await activate(db); await equipCosmetic(db, 'p', 'profile_frame', 'frame');
    const a = await dismantleCosmeticDuplicate(db, 'p', 'frame', 'season', 'd1', NOW);
    const b = await dismantleCosmeticDuplicate(db, 'p', 'frame', 'season', 'd1', NOW);
    expect(a).toEqual(b); expect(a).toMatchObject({ xp: 50, level: 2, gainedXp: 50 });
    const state = await getCosmetics(db, 'p'); expect(state.inventory[0].quantity).toBe(1); expect(state.equipment).toHaveLength(1);
    await expect(dismantleCosmeticDuplicate(db, 'p', 'frame', 'season', 'd2', NOW)).rejects.toMatchObject({ code: 'duplicate_required' });
  });
  it('concurrent dismantles cannot consume the last copy', async () => {
    const db = await setup(); await grant(db, 'g1'); await grant(db, 'g2'); await activate(db);
    const results = await Promise.allSettled(['d1', 'd2'].map(k => dismantleCosmeticDuplicate(db, 'p', 'frame', 'season', k, NOW)));
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect((await getCosmetics(db, 'p')).compendiums[0].xp).toBe(50);
  });
  it('requires the paid entitlement and configured progression before consuming anything', async () => {
    const db = await setup(false); await grant(db, 'g1'); await grant(db, 'g2');
    await expect(dismantleCosmeticDuplicate(db, 'p', 'frame', 'season', 'd1', NOW)).rejects.toMatchObject({ code: 'compendium_required' });
    await activate(db); await expect(dismantleCosmeticDuplicate(db, 'p', 'frame', 'season', 'd1', NOW)).rejects.toMatchObject({ code: 'progression_not_configured' });
    expect((await getCosmetics(db, 'p')).inventory[0].quantity).toBe(2);
    expect((await getCosmetics(db, 'p')).compendiums[0].level).toBeNull();
    expect(await db.get("SELECT id FROM cosmetic_events WHERE operation='dismantle'")).toBeNull();
  });
  it('keeps seasonal items usable after the end but does not issue new ones or XP', async () => {
    const db = await setup(); await grant(db, 'g1'); await grant(db, 'g2'); await activate(db);
    await db.run("UPDATE cosmetic_seasons SET ends_at='2026-10-12T00:00:00.000Z'");
    await equipCosmetic(db, 'p', 'profile_frame', 'frame');
    expect((await getCosmetics(db, 'p')).inventory[0].quantity).toBe(2);
    await expect(grant(db, 'g3')).rejects.toMatchObject({ code: 'season_inactive' });
    await expect(dismantleCosmeticDuplicate(db, 'p', 'frame', 'season', 'd1', NOW)).rejects.toMatchObject({ code: 'season_inactive' });
  });
  it('denies equipment not owned by this player and mismatched surfaces; permits clearing', async () => {
    const db = await setup(); await grant(db, 'g1');
    await expect(equipCosmetic(db, 'other', 'profile_frame', 'frame')).rejects.toMatchObject({ code: 'item_not_owned_or_wrong_slot' });
    await expect(equipCosmetic(db, 'p', 'poker_table', 'frame')).rejects.toMatchObject({ code: 'item_not_owned_or_wrong_slot' });
    await equipCosmetic(db, 'p', 'profile_frame', 'frame'); await equipCosmetic(db, 'p', 'profile_frame', null);
    expect((await getCosmetics(db, 'p')).equipment).toEqual([]);
  });
  it('rejects unreviewed art, external asset URLs and invalid progression', async () => {
    const db = await setup();
    await expect(createCosmeticItem(db, { id: 'draft', name: 'Draft', rarity: 'rare', slot: 'profile_frame', assetKey: 'noir-frame-v1', published: true })).rejects.toThrow();
    await expect(createCosmeticItem(db, { id: 'remote', name: 'Remote', rarity: 'rare', slot: 'profile_frame', assetKey: 'https://example.com/a.svg' })).rejects.toThrow();
    await expect(createCosmeticSeason(db, { id: 'bad', name: 'Bad', startsAt: '2026-11-01T00:00:00Z', endsAt: '2026-10-01T00:00:00Z' })).rejects.toThrow();
    await expect(createCosmeticSeason(db, { id: 'bad', name: 'Bad', startsAt: '2026-10-01T00:00:00Z', endsAt: '2026-11-01T00:00:00Z', levelThresholds: [0, 20, 20] })).rejects.toThrow();
    expect(compendiumLevel(99, [0, 50, 100])).toBe(2);
  });
  it('exposes no draft items, transfer, automatic XP, chest opening or purchases', async () => {
    const db = await setup(); await createCosmeticItem(db, { id: 'draft', name: 'Draft', rarity: 'common', slot: 'profile_frame', assetKey: 'noir-frame-v1' });
    const state = await getCosmetics(db, 'p'); expect(state.catalog.map(i => i.id)).toEqual(['frame']);
    expect(state.capabilities).toEqual({ chestOpening: false, purchases: false, automaticActivityXp: false, transfers: false });
  });
  it('authenticates self APIs and blocks player/delegated owner writes', async () => {
    const db = await setup(); const app = await createApp(db);
    await db.run("UPDATE cosmetic_seasons SET starts_at='1900-01-01T00:00:00.000Z',ends_at='9999-01-01T00:00:00.000Z'");
    expect((await request(app).get('/api/player/cosmetics')).status).toBe(401);
    const cookie = `player_token=${generatePlayerSessionToken('p')}`;
    expect((await request(app).get('/api/player/cosmetics').set('Cookie', cookie)).status).toBe(200);
    expect((await request(app).post('/api/player/cosmetics/admin/players/p/grants').set('Cookie', cookie).send({ itemId: 'frame', requestId: 'fake' })).status).toBe(401);
    await ensureOrganizerPlayerAccessSchema(db);
    await db.run('INSERT INTO organizer_player_access(player_id,granted_at) VALUES(?,?)', ['other', NOW]);
    const nonOwnerCookie = `organizer_token=${generateOrganizerToken('other')}`;
    expect((await request(app).post('/api/player/cosmetics/admin/players/p/grants').set('Cookie', nonOwnerCookie).send({ itemId: 'frame', requestId: 'non-owner' })).status).toBe(403);
    const ownerCookie = `organizer_token=${generateOrganizerToken()}`;
    const response = await request(app).post('/api/player/cosmetics/admin/players/p/grants').set('Cookie', ownerCookie).send({ itemId: 'frame', requestId: 'owner-grant' });
    expect(response.status).toBe(200);
    const audit = await db.get<any>('SELECT actor_id FROM cosmetic_events WHERE request_id=?', ['owner-grant']); expect(audit.actor_id).toMatch(/^organizer-session:/);
    const otherCookie = `player_token=${generatePlayerSessionToken('other')}`;
    expect((await request(app).get('/api/player/cosmetics').set('Cookie', otherCookie)).body.inventory).toEqual([]);
  });
  it('initializes cosmetics in the isolated sandbox without changing the production collection', async () => {
    const live = await setup(); await grant(live, 'live-grant');
    const sandbox = createDatabaseConnection(':memory:'); opened.push(sandbox);
    await sandbox.run('INSERT INTO players(id,nickname,created_at,updated_at) VALUES(?,?,?,?)', ['p','Песочница',NOW,NOW]);
    await ensureIsolatedTestRuntimeSchema(sandbox);
    const tables = await sandbox.all<any>("SELECT name FROM sqlite_master WHERE type='table' AND (name LIKE 'cosmetic_%' OR name='compendium_memberships')");
    expect(tables).toHaveLength(6);
    expect((await getCosmetics(sandbox, 'p')).inventory).toEqual([]);
    expect((await getCosmetics(live, 'p')).inventory[0].quantity).toBe(1);
  });
});
