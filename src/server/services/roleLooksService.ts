import { randomUUID } from 'crypto';
import { inflateSync } from 'zlib';
import { z } from 'zod';
import type { DatabaseWrapper } from '../../db/index.ts';
import { COSMETIC_ASSETS, type CosmeticAssetKey } from '../../lib/cosmeticAssets.ts';
import { emptyRoleLook, LOOK_BACKGROUNDS, LOOK_ROLES, lookRoleFromGame, plainPhrase, PORTRAIT_LAYOUT, type BroadcastRoleLook, type LookLayer, type RoleLook, type RoleLooksResponse } from '../../lib/roleLooks.ts';
import type { LiveBroadcastState } from '../../lib/liveBroadcast.ts';
import { CosmeticsError } from './cosmeticsService.ts';

const itemId = z.string().min(1).max(120).regex(/^[a-zA-Z0-9:_-]+$/).nullable();
export const roleLookInput = z.object({
  phrase: z.string().trim().max(64).refine(s => plainPhrase(s)===s, 'One plain-text line only'),
  background: z.enum(LOOK_BACKGROUNDS), hatItemId: itemId, jacketItemId: itemId,
  expectedRevision: z.number().int().safe().nonnegative(),
}).strict();
const required = (value: unknown, code: string, status = 409) => { if (!value) throw new CosmeticsError(code, status); };
async function requirePlayer(db: DatabaseWrapper, id: string) { required(await db.get('SELECT id FROM players WHERE id=?', [id]), 'player_not_found', 404); }
const rowLook = (row: any): RoleLook => ({ role: row.role, phrase: row.phrase, background: row.background, hatItemId: row.hat_item_id, jacketItemId: row.jacket_item_id, revision: row.revision });
export async function readRoleLooks(db: DatabaseWrapper, playerId: string): Promise<RoleLooksResponse> {
  await requirePlayer(db, playerId);
  const rows = await db.all<any>('SELECT * FROM player_role_looks WHERE player_id=?', [playerId]);
  const owned = await db.all<any>(`SELECT c.* FROM cosmetic_catalog c JOIN cosmetic_inventory i ON i.item_id=c.id WHERE i.player_id=? AND i.quantity>=1 AND c.published=1 AND c.slot IN ('portrait_hat','portrait_jacket')`, [playerId]);
  const layers: LookLayer[] = owned.flatMap(item => {
    const asset = COSMETIC_ASSETS[item.asset_key as CosmeticAssetKey];
    return asset && !asset.draft && asset.slot === item.slot ? [{ itemId: item.id, name: item.name, slot: item.slot, url: asset.url, rarity: item.rarity }] : [];
  });
  const portrait = await db.get<any>('SELECT version FROM player_portrait_current WHERE player_id=?', [playerId]);
  return { looks: LOOK_ROLES.map(role => { const row = rows.find(r => r.role === role); return row ? rowLook(row) : emptyRoleLook(role); }), layers, portraitVersion: portrait?.version || null };
}
export async function saveRoleLook(db: DatabaseWrapper, playerId: string, roleValue: unknown, input: unknown) {
  const role = z.enum(LOOK_ROLES).parse(roleValue), s = roleLookInput.parse(input);
  return db.transaction(async tx => {
    const state = await readRoleLooks(tx, playerId);
    const previous = state.looks.find(l => l.role === role)!;
    required(previous.revision === s.expectedRevision, 'look_revision_conflict');
    if (s.hatItemId || s.jacketItemId) required(state.portraitVersion, 'portrait_preparation_required');
    for (const [id, slot] of [[s.hatItemId, 'portrait_hat'], [s.jacketItemId, 'portrait_jacket']]) {
      if (id) required(state.layers.some(l => l.itemId === id && l.slot === slot), 'item_not_owned_or_not_ready');
    }
    const revision = previous.revision + 1, now = new Date().toISOString();
    await tx.run(`INSERT INTO player_role_looks(player_id,role,phrase,background,hat_item_id,jacket_item_id,revision,updated_at) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(player_id,role) DO UPDATE SET phrase=excluded.phrase,background=excluded.background,hat_item_id=excluded.hat_item_id,jacket_item_id=excluded.jacket_item_id,revision=excluded.revision,updated_at=excluded.updated_at`, [playerId,role,s.phrase,s.background,s.hatItemId,s.jacketItemId,revision,now]);
    const result: RoleLook = { role, phrase: s.phrase, background: s.background, hatItemId: s.hatItemId, jacketItemId: s.jacketItemId, revision };
    await tx.run('INSERT INTO cosmetic_events(player_id,request_id,operation,payload_json,result_json,actor_id,created_at) VALUES(?,?,?,?,?,?,?)', [playerId,randomUUID(),'save_role_look',JSON.stringify({ role, ...s }),JSON.stringify(result),playerId,now]);
    return result;
  });
}

/** Strict, bounded PNG canvas. No SVG, remote fetch, arbitrary face editor or unbounded decompression. */
export function validatePortraitPng(dataUrl: string): Buffer {
  const match = /^data:image\/png;base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl);
  required(match, 'portrait_png_required', 400);
  const bytes = Buffer.from(match![1], 'base64');
  required(bytes.length <= 1024 * 1024 && bytes.toString('base64') === match![1], 'portrait_size_or_encoding_invalid', 400);
  required(bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])), 'portrait_png_invalid', 400);
  let offset=8, header=false, ended=false; const compressed: Buffer[]=[];
  while (offset+12<=bytes.length) {
    const length=bytes.readUInt32BE(offset), type=bytes.toString('ascii',offset+4,offset+8);
    required(offset+12+length<=bytes.length, 'portrait_png_invalid', 400);
    const body=bytes.subarray(offset+8,offset+8+length);
    let crc=0xffffffff;
    for (const byte of bytes.subarray(offset+4,offset+8+length)) { crc^=byte; for(let bit=0;bit<8;bit++) crc=(crc>>>1)^((crc&1)?0xedb88320:0); }
    required(((crc^0xffffffff)>>>0)===bytes.readUInt32BE(offset+8+length), 'portrait_png_invalid', 400);
    if(type==='IHDR') {
      required(!header && offset===8 && length===13 && body.readUInt32BE(0)===512 && body.readUInt32BE(4)===640 && body[8]===8 && body[9]===6 && body[10]===0 && body[11]===0 && body[12]===0, 'portrait_canvas_invalid', 400); header=true;
    } else if(type==='IDAT') { required(header, 'portrait_png_invalid', 400); compressed.push(body); }
    else if(type==='IEND') { required(length===0 && offset+12===bytes.length, 'portrait_png_invalid', 400); ended=true; break; }
    else required(type!=='acTL' && type[0]===type[0].toLowerCase(), 'portrait_png_chunk_unsupported', 400);
    offset+=length+12;
  }
  required(header && ended && compressed.length, 'portrait_png_invalid', 400);
  try {
    const stride=512*4+1, raw=inflateSync(Buffer.concat(compressed), { maxOutputLength: stride*640 });
    required(raw.length===stride*640 && Array.from({length:640},(_,i)=>raw[i*stride]).every(n=>n<=4), 'portrait_png_invalid', 400);
  } catch { throw new CosmeticsError('portrait_png_invalid',400); }
  return bytes;
}
export async function approvePortrait(db: DatabaseWrapper, playerId: string, input: unknown, actorId: string) {
  const s=z.object({ dataUrl:z.string().max(1400000), layout:z.literal(PORTRAIT_LAYOUT), identityConfirmed:z.literal(true) }).strict().parse(input);
  const bytes=validatePortraitPng(s.dataUrl), version=randomUUID(), now=new Date().toISOString();
  return db.transaction(async tx => {
    await requirePlayer(tx,playerId);
    await tx.run('INSERT INTO player_portrait_versions(version,player_id,image_data,created_at,approved_by) VALUES(?,?,?,?,?)',[version,playerId,bytes,now,actorId]);
    await tx.run('INSERT INTO player_portrait_current(player_id,version) VALUES(?,?) ON CONFLICT(player_id) DO UPDATE SET version=excluded.version',[playerId,version]);
    await tx.run('INSERT INTO cosmetic_events(player_id,request_id,operation,payload_json,result_json,actor_id,created_at) VALUES(?,?,?,?,?,?,?)',[playerId,randomUUID(),'approve_portrait',JSON.stringify({layout:s.layout,identityConfirmed:true}),JSON.stringify({version}),actorId,now]);
    return { version };
  });
}
export async function readPortraitBytes(db: DatabaseWrapper, playerId: string, version: string) {
  const row=await db.get<any>('SELECT image_data FROM player_portrait_versions WHERE player_id=? AND version=?',[playerId,version]);
  return row ? Buffer.from(row.image_data) : null;
}
/** First broadcast use freezes each role's wardrobe and immutable portrait for that game. */
export async function attachRoleLookSnapshots(db: DatabaseWrapper, state: LiveBroadcastState, gameKey: string): Promise<LiveBroadcastState> {
  required(/^(club:\d+|tournament:[a-zA-Z0-9_-]+:[a-zA-Z0-9_-]+)$/.test(gameKey), 'game_identity_invalid',400);
  return db.transaction(async tx => {
    const players=[];
    for (const p of state.players) {
      const role=lookRoleFromGame(p.role);
      if(!p.playerId || !role) { players.push(p); continue; }
      let row=await tx.get<any>('SELECT look_json FROM game_role_look_snapshots WHERE game_key=? AND player_id=? AND role=?',[gameKey,p.playerId,role]);
      if(!row) {
        const saved=await readRoleLooks(tx,p.playerId), look=saved.looks.find(l=>l.role===role)!;
        const appearance: BroadcastRoleLook={...look,gameKey,portraitVersion:saved.portraitVersion,hatUrl:saved.layers.find(l=>l.itemId===look.hatItemId)?.url||null,jacketUrl:saved.layers.find(l=>l.itemId===look.jacketItemId)?.url||null};
        await tx.run('INSERT INTO game_role_look_snapshots(game_key,player_id,role,look_json,created_at) VALUES(?,?,?,?,?)',[gameKey,p.playerId,role,JSON.stringify(appearance),new Date().toISOString()]);
        row={look_json:JSON.stringify(appearance)};
      }
      players.push({...p, appearance:JSON.parse(row.look_json) as BroadcastRoleLook});
    }
    return {...state,players};
  });
}
