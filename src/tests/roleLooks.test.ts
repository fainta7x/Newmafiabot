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
  return {...actual,COSMETIC_ASSETS:{...actual.COSMETIC_ASSETS,'test-hat':{slot:'portrait_hat',url:'/cosmetics/test-hat.svg',draft:false},'test-jacket':{slot:'portrait_jacket',url:'/cosmetics/test-jacket.svg',draft:false}}};
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
