import { afterEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.ts';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { ensureCosmeticsSchema } from '../db/ensureCosmeticsSchema.ts';
import { createCosmeticItem } from '../server/services/cosmeticsService.ts';
import { createDraftCosmeticSet, listDraftWearableItems, listReleasedWardrobeSets, replaceDraftCosmeticSetItems } from '../server/services/cosmeticSetsService.ts';
import { readRoleLooks } from '../server/services/roleLooksService.ts';
import { generateOrganizerToken, generatePlayerSessionToken } from '../server/auth.ts';

// Reviewed test fixtures never publish the real draft SVGs.
vi.mock('../lib/cosmeticAssets.ts', async original => {
  const actual = await original<any>();
  return { ...actual, COSMETIC_ASSETS: {
    ...actual.COSMETIC_ASSETS,
    'ready-hat': { slot: 'portrait_hat', url: '/cosmetics/ready-hat.svg', draft: false },
    'ready-jacket': { slot: 'portrait_jacket', url: '/cosmetics/ready-jacket.svg', draft: false },
  } };
});
const opened: DatabaseWrapper[] = [];
afterEach(() => { while(opened.length) opened.pop()?.sqlite.close(); });
async function setup() {
  const db = createDatabaseConnection(':memory:'); opened.push(db);
  await ensureCosmeticsSchema(db);
  await db.run('INSERT INTO players(id,nickname,created_at,updated_at) VALUES(?,?,?,?),(?,?,?,?)',
    ['p','Игрок','2026-10-13','2026-10-13','other','Другой','2026-10-13','2026-10-13']);
  for(const item of [
    { id:'hat', name:'Test Hat', slot:'portrait_hat', assetKey:'ready-hat', published:true },
    { id:'jacket', name:'Test Jacket', slot:'portrait_jacket', assetKey:'ready-jacket', published:true },
    { id:'draft', name:'Private Draft', slot:'portrait_hat', assetKey:'autumn-fedora-v1', published:false },
  ] as const) await createCosmeticItem(db,{...item,rarity:'rare'});
  await db.run('INSERT INTO cosmetic_inventory(player_id,item_id,quantity,acquired_at) VALUES(?,?,?,?)',['p','hat',1,'2026-10-13']);
  return db;
}
describe('safe released wardrobe set gallery', () => {
  it('only exposes released reviewed components and marks ownership independently',async()=>{
    const db=await setup();
    await createDraftCosmeticSet(db,{id:'released',name:'Сет без выдуманного дизайна',rarity:'common'});
    await replaceDraftCosmeticSetItems(db,'released',{itemIds:['hat','jacket']});
    await createDraftCosmeticSet(db,{id:'secret',name:'Неопубликованный секрет',rarity:'legendary'});
    await replaceDraftCosmeticSetItems(db,'secret',{itemIds:['draft']});
    await db.run('UPDATE cosmetic_sets SET published=1 WHERE id=?',['released']);
    const [set]=await listReleasedWardrobeSets(db,'p');
    expect(set).toEqual({
      id:'released',name:'Сет без выдуманного дизайна',rarity:'common',
      items:[
        {itemId:'hat',name:'Test Hat',slot:'portrait_hat',rarity:'rare',url:'/cosmetics/ready-hat.svg',owned:true},
        {itemId:'jacket',name:'Test Jacket',slot:'portrait_jacket',rarity:'rare',url:'/cosmetics/ready-jacket.svg',owned:false},
      ],
    });
    expect((await readRoleLooks(db,'p')).sets).toEqual([set]);
    expect((await listReleasedWardrobeSets(db,'other'))[0].items.every(i=>!i.owned)).toBe(true);
    expect(JSON.stringify(await readRoleLooks(db,'p'))).not.toContain('Неопубликованный секрет');
    expect(JSON.stringify(await readRoleLooks(db,'p'))).not.toContain('Private Draft');
    expect(await db.get('SELECT quantity FROM cosmetic_inventory WHERE player_id=? AND item_id=?',['p','hat'])).toEqual({quantity:1});
  });
  it('hides entire set when a member is unpublished or draft; admin can still inspect its art',async()=>{
    const db=await setup();
    await createDraftCosmeticSet(db,{id:'invalid',name:'Not ready',rarity:'rare'});
    await replaceDraftCosmeticSetItems(db,'invalid',{itemIds:['draft','jacket']});
    await db.run('UPDATE cosmetic_sets SET published=1 WHERE id=?',['invalid']);
    expect(await listReleasedWardrobeSets(db,'p')).toEqual([]);
    const draft=(await listDraftWearableItems(db)).find(i=>i.id==='draft');
    expect(draft).toMatchObject({name:'Private Draft',published:false,draft:true});
    const owner=`organizer_token=${generateOrganizerToken()}`;
    const player=`player_token=${generatePlayerSessionToken('p')}`;
    const app=await createApp(db);
    expect((await request(app).get('/api/player/cosmetics/admin/wardrobe-items').set('Cookie',player)).status).toBe(401);
    expect((await request(app).get('/api/player/cosmetics/admin/wardrobe-items').set('Cookie',owner)).body)
      .toEqual(expect.arrayContaining([expect.objectContaining({id:'draft',draft:true})]));
    expect((await request(app).get('/api/player/cosmetics/role-looks').set('Cookie',player)).body.sets).toEqual([]);
  });
});
