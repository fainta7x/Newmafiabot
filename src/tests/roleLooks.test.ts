import { afterEach, describe, expect, it, vi } from 'vitest';
import { deflateSync } from 'zlib';
import request from 'supertest';
import { createApp } from '../app.ts';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { ensureCosmeticsSchema } from '../db/ensureCosmeticsSchema.ts';
import { attachRoleLookSnapshots, approvePortrait, readPortraitBytes, readRoleLooks, saveRoleLook, validatePortraitPng } from '../server/services/roleLooksService.ts';
import { emptyRoleLook } from '../lib/roleLooks.ts';
import type { LiveBroadcastState } from '../lib/liveBroadcast.ts';
import { generateOrganizerToken, generatePlayerSessionToken } from '../server/auth.ts';

vi.mock('../lib/cosmeticAssets.ts', async original => {
  const actual=await original<any>();
  return {...actual,COSMETIC_ASSETS:{...actual.COSMETIC_ASSETS,'test-hat':{slot:'portrait_hat',url:'/cosmetics/test-hat.svg',draft:false},'test-jacket':{slot:'portrait_jacket',url:'/cosmetics/test-jacket.svg',draft:false},'test-shirt':{slot:'portrait_shirt',url:'/cosmetics/test-shirt.svg',draft:false},'test-vest':{slot:'portrait_vest',url:'/cosmetics/test-vest.svg',draft:false},'test-glasses':{slot:'portrait_eyewear',url:'/cosmetics/test-glasses.png',draft:false,attachment:{target:'eyes',source:[{x:163,y:308},{x:350,y:308}]}}}};
});
const opened: DatabaseWrapper[]=[];
afterEach(()=>{while(opened.length)opened.pop()?.sqlite.close();});
async function setup(){
  const db=createDatabaseConnection(':memory:');opened.push(db);await ensureCosmeticsSchema(db);
  for(const id of ['p','other'])await db.run('INSERT INTO players(id,nickname,elo,tokens,created_at,updated_at) VALUES(?,?,1000,50,?,?)',[id,id,'2026-10-13','2026-10-13']);
  return db;
}
const input=(phrase='',expectedRevision=0)=>({phrase,background:'autumn',hatItemId:null,jacketItemId:null,expectedRevision});
/** Synthetic transparent canvas tests the binary contract, never likeness or production artwork. */
function png(width=512,height=640,raw?:Buffer){
  const chunk=(type:string,body:Buffer)=>{
    const name=Buffer.from(type),n=Buffer.alloc(4);n.writeUInt32BE(body.length);
    let crc=0xffffffff;for(const b of Buffer.concat([name,body])){crc^=b;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}
    const checksum=Buffer.alloc(4);checksum.writeUInt32BE((crc^0xffffffff)>>>0);return Buffer.concat([n,name,body,checksum]);
  };
  const header=Buffer.alloc(13);header.writeUInt32BE(width);header.writeUInt32BE(height,4);header[8]=8;header[9]=6;
  return 'data:image/png;base64,'+Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(raw||Buffer.alloc((width*4+1)*height))),chunk('IEND',Buffer.alloc(0))]).toString('base64');
}
const approve=(db:DatabaseWrapper)=>approvePortrait(db,'p',{dataUrl:png(),layout:'bust-512x640-v1',identityConfirmed:true},'owner');
async function wardrobe(db:DatabaseWrapper){
  for(const [id,slot,asset]of [['hat','portrait_hat','test-hat'],['jacket','portrait_jacket','test-jacket'],['draft','portrait_hat','autumn-fedora-v1']]){
    await db.run('INSERT INTO cosmetic_catalog(id,name,rarity,slot,asset_key,published,created_at) VALUES(?,?,?,?,?,1,?)',[id,id,'rare',slot,asset,'2026-10-13']);
    await db.run('INSERT INTO cosmetic_inventory(player_id,item_id,quantity,acquired_at) VALUES(?,?,1,?)',['p',id,'2026-10-13']);
  }
}
async function extendedWardrobe(db:DatabaseWrapper){
  for(const [id,slot,asset] of [['shirt','portrait_shirt','test-shirt'],['vest','portrait_vest','test-vest']]){
    await db.run('INSERT INTO cosmetic_catalog(id,name,rarity,slot,asset_key,published,created_at) VALUES(?,?,?,?,?,1,?)',[id,id,'common',slot,asset,'2026-10-13']);
    await db.run('INSERT INTO cosmetic_inventory(player_id,item_id,quantity,acquired_at) VALUES(?,?,1,?)',['p',id,'2026-10-13']);
  }
}
describe('four role looks',()=>{
  it('starts with four defaults and saves one role without altering others or club data',async()=>{
    const db=await setup();expect((await readRoleLooks(db,'p')).looks).toHaveLength(4);
    await saveRoleLook(db,'p','don',input('Тишина'));
    const saved=await readRoleLooks(db,'p');expect(saved.looks.find(l=>l.role==='don')).toMatchObject({phrase:'Тишина',revision:1});
    expect(saved.looks.find(l=>l.role==='mafia')).toEqual(emptyRoleLook('mafia'));
    expect((await readRoleLooks(db,'other')).looks.every(l=>l.revision===0)).toBe(true);
    expect(await db.get('SELECT elo,tokens FROM players WHERE id=?',['p'])).toEqual({elo:1000,tokens:50});
  });
  it('rejects invalid roles, control characters, arbitrary URLs and unknown properties',async()=>{
    const db=await setup();
    for(const [role,body]of [['owner',input()],['don',input('a\nb')],['don',{...input(),hatItemId:'https://example.com/a'}],['don',{...input(),face:'other'}],['don',input('a'.repeat(65))]])await expect(saveRoleLook(db,'p',role,body)).rejects.toThrow();
  });
  it('prevents stale/concurrent writes, without overwriting the winning revision',async()=>{
    const db=await setup();const results=await Promise.allSettled(['a','b'].map(s=>saveRoleLook(db,'p','don',input(s))));
    expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);expect(results.filter(r=>r.status==='rejected')[0]).toMatchObject({reason:{code:'look_revision_conflict'}});
    expect(await db.all("SELECT id FROM cosmetic_events WHERE operation='save_role_look'")).toHaveLength(1);
  });
  it('requires prepared identity, ownership, correct slot and released artwork',async()=>{
    const db=await setup();await wardrobe(db);
    await expect(saveRoleLook(db,'p','don',{...input(),hatItemId:'hat'})).rejects.toMatchObject({code:'portrait_preparation_required'});
    await approve(db);
    for(const hatItemId of ['jacket','draft','missing'])await expect(saveRoleLook(db,'p','don',{...input(),hatItemId})).rejects.toMatchObject({code:'item_not_owned_or_not_ready'});
    await saveRoleLook(db,'p','don',{...input(),hatItemId:'hat',jacketItemId:'jacket'});
    await saveRoleLook(db,'p','sheriff',{...input(),hatItemId:'hat'});
    expect((await db.get<any>('SELECT quantity FROM cosmetic_inventory WHERE item_id=?',['hat'])).quantity).toBe(1);
    expect((await readRoleLooks(db,'p')).layers).toHaveLength(2);
    // Independent per-role equipment records mirror the existing UI/API.
    expect(await db.all("SELECT role,slot,item_id FROM player_role_look_equipment WHERE player_id='p' ORDER BY role,slot")).toEqual([
      { role: 'don', slot: 'portrait_hat', item_id: 'hat' },
      { role: 'don', slot: 'portrait_jacket', item_id: 'jacket' },
      { role: 'sheriff', slot: 'portrait_hat', item_id: 'hat' },
    ]);
    await saveRoleLook(db,'p','don',{...input('Без шляпы',1),jacketItemId:'jacket'});
    expect(await db.all("SELECT slot,item_id FROM player_role_look_equipment WHERE player_id='p' AND role='don'")).toEqual([
      { slot: 'portrait_jacket', item_id: 'jacket' },
    ]);
    await ensureCosmeticsSchema(db);
    expect(await db.all("SELECT slot,item_id FROM player_role_look_equipment WHERE player_id='p' AND role='don'")).toEqual([
      { slot: 'portrait_jacket', item_id: 'jacket' },
    ]);
  });
  it('validates bounded RGBA PNGs and rejects wrong geometry, corruption and inflation overflow',()=>{
    expect(validatePortraitPng(png()).length).toBeGreaterThan(0);
    for(const value of [png(1,1),png(512,640,Buffer.alloc(512*640*5)),png().replace('iVBOR','aVBOR'),'data:image/svg+xml;base64,AAAA'])expect(()=>validatePortraitPng(value)).toThrow();
  });
  it('freezes independent club/tournament role snapshots and retains old portrait bytes',async()=>{
    const db=await setup();await wardrobe(db);const old=await approve(db);await saveRoleLook(db,'p','don',{...input('До'),hatItemId:'hat'});
    const state={gameId:1,players:[{playerId:'p',role:'Дон'}]} as LiveBroadcastState;
    const first=await attachRoleLookSnapshots(db,state,'club:1');expect(first.players[0].appearance).toMatchObject({phrase:'До',hatUrl:'/cosmetics/test-hat.svg',portraitVersion:old.version});
    await saveRoleLook(db,'p','don',input('После',1));const next=await approve(db);expect(next.version).not.toBe(old.version);
    expect((await attachRoleLookSnapshots(db,state,'club:1')).players[0].appearance).toEqual(first.players[0].appearance);
    expect((await attachRoleLookSnapshots(db,state,'tournament:t:1')).players[0].appearance).toMatchObject({phrase:'После',portraitVersion:next.version});
    expect(await readPortraitBytes(db,'p',old.version)).not.toBeNull();expect(await readPortraitBytes(db,'other',old.version)).toBeNull();
  });
  it('saves independent mixed-set pieces per role and freezes all layers for live games',async()=>{
    const db=await setup();await wardrobe(db);await extendedWardrobe(db);await approve(db);
    const ownerLook={...input('Мой образ'),hatItemId:'hat',equippedItems:{portrait_shirt:'shirt',portrait_vest:'vest',portrait_hat:'hat'}};
    const saved=await saveRoleLook(db,'p','don',ownerLook);
    expect(saved.equippedItems).toEqual(ownerLook.equippedItems);
    expect((await readRoleLooks(db,'p')).looks.find(l=>l.role==='don')?.equippedItems).toEqual(ownerLook.equippedItems);
    const state={gameId:9,players:[{playerId:'p',role:'Дон'}]} as LiveBroadcastState;
    const first=await attachRoleLookSnapshots(db,state,'club:9');
    expect(first.players[0].appearance?.equippedLayers).toEqual([
      {slot:'portrait_shirt',itemId:'shirt',url:'/cosmetics/test-shirt.svg'},
      {slot:'portrait_vest',itemId:'vest',url:'/cosmetics/test-vest.svg'},
      {slot:'portrait_hat',itemId:'hat',url:'/cosmetics/test-hat.svg'},
    ]);
    // Legacy caller changes hat/jacket while preserving additional slots.
    const next=await saveRoleLook(db,'p','don',{...input('Позднее',1),jacketItemId:'jacket'});
    expect(next.equippedItems).toEqual({portrait_shirt:'shirt',portrait_vest:'vest',portrait_jacket:'jacket'});
    expect(await db.all("SELECT slot,item_id FROM player_role_look_equipment WHERE player_id='p' AND role='don' ORDER BY slot")).toEqual([
      {slot:'portrait_jacket',item_id:'jacket'}, {slot:'portrait_shirt',item_id:'shirt'}, {slot:'portrait_vest',item_id:'vest'},
    ]);
    const newGame=await attachRoleLookSnapshots(db,state,'club:10');
    expect(newGame.players[0].appearance?.equippedLayers?.map(l=>l.slot)).toEqual(['portrait_shirt','portrait_vest','portrait_jacket']);
    expect((await attachRoleLookSnapshots(db,state,'club:9')).players[0].appearance).toEqual(first.players[0].appearance);
    expect((await readRoleLooks(db,'p')).looks.find(l=>l.role==='mafia')).toEqual(emptyRoleLook('mafia'));
    expect((await db.get<any>('SELECT quantity FROM cosmetic_inventory WHERE item_id=?',['shirt'])).quantity).toBe(1);
  });
  it('stores eyewear independently and retains its eye attachment in immutable snapshots',async()=>{
    const db=await setup();await approve(db);
    await db.run("INSERT INTO cosmetic_catalog(id,name,rarity,slot,asset_key,published,created_at) VALUES('glasses','Glasses','common','portrait_eyewear','test-glasses',1,'2026-10-14')");
    await db.run("INSERT INTO cosmetic_inventory(player_id,item_id,quantity,acquired_at) VALUES('p','glasses',1,'2026-10-14')");
    await saveRoleLook(db,'p','civilian',{...input(),equippedItems:{portrait_eyewear:'glasses'}});
    const state={players:[{playerId:'p',role:'civilian'}]} as unknown as LiveBroadcastState;
    const first=await attachRoleLookSnapshots(db,state,'club:41');
    expect(first.players[0].appearance?.equippedLayers).toEqual([{slot:'portrait_eyewear',itemId:'glasses',url:'/cosmetics/test-glasses.png',attachment:{target:'eyes',source:[{x:163,y:308},{x:350,y:308}]}}]);
    await saveRoleLook(db,'p','civilian',{...input('',1),equippedItems:{}});
    expect((await readRoleLooks(db,'p')).looks.find(l=>l.role==='civilian')?.equippedItems).toEqual({});
    expect((await attachRoleLookSnapshots(db,state,'club:41')).players[0].appearance).toEqual(first.players[0].appearance);
  });
  it('rejects unowned or mismatched multi-slot items, malformed slot keys, missing portrait and stale revisions',async()=>{
    const db=await setup();await extendedWardrobe(db);
    const loadout={...input(),equippedItems:{portrait_shirt:'shirt'}};
    await expect(saveRoleLook(db,'p','don',loadout)).rejects.toMatchObject({code:'portrait_preparation_required'});
    await approve(db);
    await expect(saveRoleLook(db,'p','don',{...input(),equippedItems:{portrait_shirt:'missing'}})).rejects.toMatchObject({code:'item_not_owned_or_not_ready'});
    await expect(saveRoleLook(db,'p','don',{...input(),equippedItems:{portrait_hat:'shirt'},hatItemId:'shirt'})).rejects.toMatchObject({code:'item_not_owned_or_not_ready'});
    for(const equippedItems of [{portrait_fake:'shirt'},{portrait_shirt:'https://example.com'},{portrait_hat:'shirt'}]){
      await expect(saveRoleLook(db,'p','don',{...input(),equippedItems})).rejects.toThrow();
    }
    await saveRoleLook(db,'p','don',loadout);
    await expect(saveRoleLook(db,'p','don',loadout)).rejects.toMatchObject({code:'look_revision_conflict'});
    // New map explicitly removes the shirt; old two-column view stays consistent.
    await saveRoleLook(db,'p','don',{...input('Снял вещь',1),equippedItems:{}});
    expect((await readRoleLooks(db,'p')).looks.find(l=>l.role==='don')?.equippedItems).toEqual({});
    expect(await db.all("SELECT slot FROM player_role_look_equipment WHERE player_id='p' AND role='don'")).toEqual([]);
  });
  it('authenticates self writes and restricts identity approval to the owner',async()=>{
    const db=await setup(),app=await createApp(db),cookie=`player_token=${generatePlayerSessionToken('p')}`;
    expect((await request(app).get('/api/player/cosmetics/role-looks')).status).toBe(401);
    expect((await request(app).get('/api/player/cosmetics/role-looks').set('Cookie',cookie)).body.looks).toHaveLength(4);
    expect((await request(app).put('/api/player/cosmetics/role-looks/don').set('Cookie',cookie).send({...input(),playerId:'other'})).status).toBe(400);
    expect((await request(app).put('/api/player/cosmetics/role-looks/don').set('Cookie',cookie).send(input('Своё'))).status).toBe(200);
    const url='/api/player/cosmetics/admin/players/p/portrait',body={dataUrl:png(),layout:'bust-512x640-v1',identityConfirmed:true};
    expect((await request(app).post(url).set('Cookie',cookie).send(body)).status).toBeGreaterThanOrEqual(400);
    const ownerCookie=`organizer_token=${generateOrganizerToken()}`;
    const approved=await request(app).post(url).set('Cookie',ownerCookie).send(body);expect(approved.status).toBe(200);
    expect((await request(app).get('/api/player/cosmetics/portrait/'+approved.body.version).set('Cookie',`player_token=${generatePlayerSessionToken('other')}`)).status).toBe(404);
    expect((await request(app).get('/api/player/cosmetics/portrait/'+approved.body.version).set('Cookie',cookie)).status).toBe(200);
  });
});
