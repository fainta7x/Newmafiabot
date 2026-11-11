import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.ts';
import { generatePlayerSessionToken } from '../server/auth.ts';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { isSellableShopType, listShopPurchases, loadShopOverview, markShopPurchaseIssued } from '../server/services/shopCatalogService.ts';

describe('token shop: a product is sold only if buying it delivers something (owner, 2026-11-11)', () => {
  let db: DatabaseWrapper;
  const now = '2026-11-11T10:00:00.000Z';
  beforeEach(async () => { db = createDatabaseConnection(':memory:'); await createApp(db); });
  afterEach(() => { try { db.sqlite.close(); } catch {} });

  it('knows which types deliver', () => {
    expect(isSellableShopType('free_evening')).toBe(true);
    expect(isSellableShopType('manual')).toBe(true);
    expect(isSellableShopType('custom')).toBe(true);
    expect(isSellableShopType('role')).toBe(false);
    expect(isSellableShopType('music')).toBe(false);
  });

  it('marks the seeded role and music products as not sold and counts purchases', async () => {
    const overview = await loadShopOverview(db);
    const byId = new Map(overview.items.map((item) => [item.id, item]));
    expect(byId.get('free_evening')?.sellable).toBe(true);
    expect(byId.get('buy_role')?.sellable).toBe(false);
    expect(byId.get('order_music')?.sellable).toBe(false);
  });

  it('hands a manual purchase over once and refuses a self-delivering one', async () => {
    await db.run(`INSERT INTO players (id,nickname,lifecycle_status,source,elo,tokens,created_at,updated_at) VALUES ('p1','Чагин','normal','test',1000,50000,?,?)`, [now, now]);
    await db.run(`INSERT INTO shop_items (id,name,description,price,icon,item_type,active,sort_order,created_at,updated_at) VALUES ('mug','Кружка','Кружка клуба',20000,'☕','manual',1,40,?,?)`, [now, now]);
    for (const [id, item, type] of [['pa', 'mug', 'manual'], ['pb', 'free_evening', 'free_evening']] as const) {
      await db.run(`INSERT INTO shop_purchases (id,player_id,item_id,item_name_snapshot,item_type_snapshot,price_snapshot,status,request_id,purchased_at) VALUES (?,?,?,?,?,?,'purchased',?,?)`, [id, 'p1', item, item, type, 100, id, now]);
    }
    expect((await listShopPurchases(db, { playerId: 'p1' })).map((row) => row.nickname)).toEqual(['Чагин', 'Чагин']);
    await markShopPurchaseIssued(db, 'pa');
    expect((await listShopPurchases(db, { status: 'redeemed' })).map((row) => row.id)).toEqual(['pa']);
    await expect(markShopPurchaseIssued(db, 'pa')).rejects.toMatchObject({ statusCode: 409 });
    await expect(markShopPurchaseIssued(db, 'pb')).rejects.toMatchObject({ statusCode: 409 });
  });

  it('hides a product that delivers nothing from the player and refuses to sell it', async () => {
    const app = await createApp(db);
    await db.run(`INSERT INTO players (id,nickname,lifecycle_status,source,elo,tokens,created_at,updated_at) VALUES ('p1','Чагин','normal','test',1000,50000,?,?)`, [now, now]);
    const cookie = `player_token=${generatePlayerSessionToken('p1')}`;
    const economy = await request(app).get('/api/player/economy').set('Cookie', cookie);
    expect(economy.status).toBe(200);
    expect((economy.body.shop_items as any[]).map((item) => item.id)).toEqual(['free_evening']);
    const refused = await request(app).post('/api/player/shop/purchase').set('Cookie', cookie).send({ item_id: 'buy_role', request_id: 'r1' });
    expect(refused.status).toBe(409);
    const sold = await request(app).post('/api/player/shop/purchase').set('Cookie', cookie).send({ item_id: 'free_evening', request_id: 'r2' });
    expect(sold.status).toBe(201);
  });
});
