import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import Database from 'better-sqlite3';
import request from 'supertest';
import express from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { createApp } from '../app.ts';
import { anonymizeSnapshotFile, buildAnonymizedSnapshot } from '../server/services/anonymizedSnapshotService.ts';
import { createDeveloperSnapshotHandler } from '../server/routes/developerSnapshotRoute.ts';

const opened: DatabaseWrapper[] = [], dirs: string[] = [];
const key = 'snapshot-test-key-0000000000000000000000';
afterEach(() => { opened.splice(0).forEach(db => db.sqlite.close()); dirs.splice(0).forEach(dir => fs.rmSync(dir, { recursive: true, force: true })); vi.unstubAllEnvs(); });
const temp = () => { const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dev-copy-test-')); dirs.push(dir); return path.join(dir, 'copy.sqlite'); };
const binary = (res: any, done: (error: Error | null, body: Buffer) => void) => { const chunks: Buffer[] = []; res.on('data', (chunk: Buffer) => chunks.push(chunk)); res.on('end', () => done(null, Buffer.concat(chunks))); };
async function fixture(full = false) {
  const db = createDatabaseConnection(':memory:'); opened.push(db);
  const app = full ? await createApp(db) : null;
  const now = '2026-10-01T12:00:00Z';
  await db.run(`INSERT INTO players (id,nickname,full_name,phone,telegram_user_id,telegram_username,notes,tokens,lifecycle_status,source,created_at,updated_at) VALUES ('person-private-id','RealNickname','Private Name','+79990001122','555000111','private_username','Private note',42,'normal','telegram',?,?)`, [now, now]);
  if (full) await db.run("UPDATE players SET game_level='club',club_stage='CLUB_PLAYER'");
  await db.run(`INSERT INTO game_evenings (id,title,starts_at,format,status,default_price,created_at,updated_at) VALUES ('evening-private-id','Private party',?,'CASUAL','published',400,?,?)`, [now,now,now]);
  await db.run(`INSERT INTO evening_participants (id,evening_id,player_id,attendance_status,amount_due,amount_paid,created_at,updated_at) VALUES ('registration-private-id','evening-private-id','person-private-id','present',400,200,?,?)`, [now,now]);
  await db.exec(`CREATE TABLE unknown_private_payload (id TEXT, payload TEXT DEFAULT 'DDL-secret-value'); INSERT INTO unknown_private_payload VALUES ('secret-session','nested-secret-value');`);
  await db.run(`INSERT INTO games (evening_id,global_game_number,game_date,winner_team,winner_label,slots_json,created_at) VALUES ('evening-private-id',1,?,'red','Private winner',?,?)`, [now,JSON.stringify([{slot:1,player_id:'person-private-id',nickname:'RealNickname',role:'sheriff',extra_points:0.5,notes:'nested-note-value',payload:{token:'nested-token-value'}}]),now]);
  await db.run(`INSERT INTO tournaments (id,title,date,status,public_token,created_at,updated_at) VALUES ('t-private','Private tournament',?,'completed','public-secret-token',?,?)`,[now,now,now]);
  await db.run(`INSERT INTO tournament_participants (id,tournament_id,player_id,display_name,participant_number) VALUES ('tp-private','t-private','person-private-id','RealNickname',1)`);
  await db.run(`INSERT INTO tournament_games (id,tournament_id,game_number,status,winner_team) VALUES ('tg-private','t-private',1,'completed','red')`);
  await db.run(`INSERT INTO tournament_game_seats (id,game_id,participant_id,seat_number,role) VALUES ('seat-private','tg-private','tp-private',1,'sheriff')`);
  await db.run(`INSERT INTO tournament_game_player_results (id,game_id,participant_id,ci_points) VALUES ('result-private','tg-private','tp-private',1.75)`);
  await db.run('UPDATE games SET protocol_text=?',[JSON.stringify({version:1,kind:'club_evening_protocol',protocol:{game_id:'1',status:'completed',winner_team:'red',comment:'protocol-private-note'},player_results:[{player_id:'person-private-id',role:'Шериф',ci_points:1.5,notes:'protocol-private-note'}]})]);
  return { db, app };
}

describe('development snapshot export', () => {
  it('builds a clean relational SQLite and leaves the live database untouched', async () => {
    const { db } = await fixture(true);
    const snapshot = await buildAnonymizedSnapshot(db);
    const raw = zlib.gunzipSync(snapshot.gzip), file = temp(); fs.writeFileSync(file, raw);
    const copy = new Database(file, { readonly: true });
    try {
      const player = copy.prepare('SELECT * FROM players').get() as any;
      expect(player).toMatchObject({ full_name:null, phone:null, telegram_user_id:null, telegram_username:null, notes:null, tokens:42 });
      expect(player.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/); expect(player.nickname).not.toBe('RealNickname');
      expect(copy.prepare('SELECT player_id FROM evening_participants').get()).toEqual({player_id:player.id});
      expect(copy.prepare('SELECT amount_due,amount_paid FROM evening_participants').get()).toEqual({amount_due:400,amount_paid:200});
      const slot = JSON.parse((copy.prepare('SELECT slots_json FROM games').get() as any).slots_json)[0];
      expect(slot).toMatchObject({player_id:player.id,role:'sheriff',extra_points:0.5}); expect(slot.payload).toBeUndefined();
      const protocol = JSON.parse((copy.prepare('SELECT protocol_text FROM games').get() as any).protocol_text);
      expect(protocol.player_results[0]).toEqual({player_id:player.id,role:'Шериф',ci_points:1.5});
      expect(copy.prepare('SELECT ci_points FROM tournament_game_player_results').get()).toEqual({ci_points:1.75});
      expect(copy.prepare('SELECT public_token FROM tournaments').get()).toEqual({public_token:null});
      expect(copy.pragma('foreign_key_check')).toEqual([]); expect(copy.pragma('integrity_check',{simple:true})).toBe('ok');
      expect(copy.prepare("SELECT name FROM sqlite_master WHERE name='unknown_private_payload'").get()).toBeUndefined();
    } finally { copy.close(); }
    for (const secret of ['person-private-id','RealNickname','Private Name','+79990001122','555000111','private_username','Private note','Private party','secret-session','nested-secret-value','nested-note-value','nested-token-value','DDL-secret-value','protocol-private-note','public-secret-token','Private tournament']) expect(raw.includes(Buffer.from(secret)),secret).toBe(false);
    expect(await db.get('SELECT phone FROM players')).toEqual({phone:'+79990001122'});
    const next = zlib.gunzipSync((await buildAnonymizedSnapshot(db)).gzip); expect(next.equals(raw)).toBe(false);
  });
  it('fails closed for newly added fields even if they are null', async () => {
    const { db } = await fixture(); await db.exec('ALTER TABLE players ADD COLUMN unreviewed_private_field TEXT');
    await expect(buildAnonymizedSnapshot(db)).rejects.toThrow('schema needs review');
  });
  it('rejects an unreviewed enum without returning data and keeps the source intact', async () => {
    const { db } = await fixture(); await db.run("UPDATE players SET source='private-token-as-source'");
    await expect(buildAnonymizedSnapshot(db)).rejects.toThrow('enum needs review');
    expect(await db.get('SELECT source FROM players')).toEqual({source:'private-token-as-source'});
  });
  it('requires only the scoped key, including in the mounted application', async () => {
    vi.stubEnv('DEVELOPMENT_SNAPSHOT_KEY',key);vi.stubEnv('DEVELOPER_READ_KEY',key);vi.stubEnv('BOT_API_SECRET',key);
    const { app } = await fixture(true);
    for (const header of ['X-Bot-Token','X-Developer-Read-Key']) expect((await request(app!).post('/__developer-read/snapshot').set(header,key)).status).toBe(401);
    const response = await request(app!).post('/__developer-read/snapshot').set('X-Development-Snapshot-Key',key).buffer(true).parse(binary);
    expect(response.status).toBe(200);expect(response.headers['cache-control']).toBe('no-store');
    expect(JSON.parse(response.headers['x-snapshot-metadata']).version).toBe(1);
  });
  it('limits concurrent exports and releases the lock after failure', async () => {
    vi.stubEnv('DEVELOPMENT_SNAPSHOT_KEY',key);
    let reject!: (e:Error)=>void; let started!: ()=>void; const ready = new Promise<void>(resolve => {started=resolve;});
    const build = vi.fn().mockImplementationOnce(() => {started();return new Promise((_resolve,r)=>{reject=r;});}).mockRejectedValue(new Error('secret detail'));
    const app = express();app.post('/snapshot',createDeveloperSnapshotHandler(build));
    const first = request(app).post('/snapshot').set('X-Development-Snapshot-Key',key).then(r=>r); await ready;
    expect((await request(app).post('/snapshot').set('X-Development-Snapshot-Key',key)).status).toBe(429);
    reject(new Error('secret detail'));const failure = await first;expect(failure.status).toBe(500);expect(JSON.stringify(failure.body)).not.toContain('secret detail');
    expect((await request(app).post('/snapshot').set('X-Development-Snapshot-Key',key)).status).toBe(500);expect(build).toHaveBeenCalledTimes(2);
  });
  it('refuses to export broken relational links', async () => {
    const {db}=await fixture();db.sqlite.pragma('foreign_keys = OFF');
    await db.run("UPDATE evening_participants SET player_id='missing-player'");
    await expect(buildAnonymizedSnapshot(db)).rejects.toThrow('relationship validation');
    expect(await db.get('SELECT player_id FROM evening_participants')).toEqual({player_id:'missing-player'});
  });
  it('is disabled without a strong configuration key', async () => {
    vi.stubEnv('DEVELOPMENT_SNAPSHOT_KEY','short'); const app=express();app.post('/snapshot',createDeveloperSnapshotHandler());
    expect((await request(app).post('/snapshot')).status).toBe(503);
  });
  it('cleans the rejected output instead of overwriting the input copy', async () => {
    const {db}=await fixture();await db.exec('ALTER TABLE players ADD COLUMN unsafe TEXT');const file=temp();await db.sqlite.backup(file);const before=fs.readFileSync(file);
    expect(()=>anonymizeSnapshotFile(file)).toThrow();expect(fs.readFileSync(file).equals(before)).toBe(true);expect(fs.existsSync(`${file}.scrubbed`)).toBe(false);
  });
});
