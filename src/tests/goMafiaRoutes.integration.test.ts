import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { generatePlayerSessionToken } from '../server/auth.ts';
import { ensurePlayerProfileVisibilitySchema } from '../server/services/playerProfileVisibilityService.ts';
import { ensureGoMafiaSchema } from '../db/ensureGoMafiaSchema.ts';
vi.mock('../server/services/goMafiaFederationSync.ts',()=>({queueGoMafiaProfileRefresh:vi.fn(),isGoMafiaProfileRefreshing:()=>false}));
import router from '../server/routes/goMafiaRoutes.ts';
import { queueGoMafiaProfileRefresh } from '../server/services/goMafiaFederationSync.ts';
import career from './fixtures/gomafia/chagin-career.json';
let db: DatabaseWrapper;let app: any;
const cookie=(id:string)=>`player_token=${generatePlayerSessionToken(id)}`;
beforeEach(async()=>{
 vi.mocked(queueGoMafiaProfileRefresh).mockClear();db=createDatabaseConnection(':memory:');
 await ensureGoMafiaSchema(db);await ensurePlayerProfileVisibilitySchema(db);
 for (const id of ['one','two']) await db.run('INSERT INTO players(id,nickname,created_at,updated_at) VALUES (?,?,?,?)',[id,id,'2026-10-12','2026-10-12']);
 app=express();app.use(express.json(),(req:any,_res:any,next:any)=>{req.cookies=Object.fromEntries(String(req.headers.cookie||'').split(';').map((part)=>part.trim()).filter(Boolean).map((part)=>{const i=part.indexOf('=');return [part.slice(0,i),decodeURIComponent(part.slice(i+1))];}));next();});app.use((req:any,_res:any,next:any)=>{req.db=db;if(req.headers['x-test-organizer']==='yes')req.userRole='ORGANIZER';next();});app.use('/api/player',router);
});
afterEach(()=>db.sqlite.close());
describe('verified-ID sports career API',()=>{
 it('requires auth, makes a self claim pending, prevents duplicate identities, and only confirmation starts sync',async()=>{
  expect((await request(app).get('/api/player/gomafia/players/one/career')).status).toBe(401);
  const pending=await request(app).put('/api/player/gomafia/me').set('Cookie',cookie('one')).send({profile:'1202'});
  expect(pending.body.link.status).toBe('pending');expect(queueGoMafiaProfileRefresh).not.toHaveBeenCalled();
  const conflict=await request(app).put('/api/player/gomafia/me').set('Cookie',cookie('two')).send({profile:'1202'});expect(conflict.status).toBe(409);
  const confirmed=await request(app).put('/api/player/gomafia/organizer/one').set('x-test-organizer','yes').send({profile:'1202'});
  expect(confirmed.body.link.status).toBe('verified');expect(queueGoMafiaProfileRefresh).toHaveBeenCalledWith(db,'1202');
  expect((await request(app).put('/api/player/gomafia/me').set('Cookie',cookie('one')).send({profile:'42'})).status).toBe(403);
 });
 it('serves source-backed complete career, respects statistics visibility, and never exposes a pending snapshot',async()=>{
  await request(app).put('/api/player/gomafia/organizer/one').set('x-test-organizer','yes').send({profile:'1202'});
  await db.run('INSERT INTO gomafia_player_snapshots(external_player_id,scope,snapshot_json,retrieved_at,source_url) VALUES (?,?,?,?,?)',['1202','career-v1',JSON.stringify(career),career.retrievedAt,career.profileUrl]);
  const response=await request(app).get('/api/player/gomafia/players/one/career').set('Cookie',cookie('one'));
  expect(response.body.tournaments).toHaveLength(13);expect(response.body.external_games).toHaveLength(164);
  expect(response.body.yearly_stats.map((s:any)=>s.year)).toEqual([2026,2025,2024,2023,2022]);
  await db.run('UPDATE players SET profile_visibility_json=? WHERE id=?',['{"game_statistics":false}','one']);
  expect((await request(app).get('/api/player/gomafia/players/one/career').set('Cookie',cookie('two'))).status).toBe(403);
  expect((await request(app).get('/api/player/gomafia/players/one').set('Cookie',cookie('two'))).status).toBe(403);
  expect((await request(app).get('/api/player/gomafia/players/one').set('Cookie',cookie('one'))).body.link.external_player_id).toBe('1202');
  expect((await request(app).get('/api/player/gomafia/players/one').set('x-test-organizer','yes')).body.link.external_player_id).toBe('1202');
  expect((await request(app).get('/api/player/gomafia/players/one/career').set('Cookie',cookie('one'))).status).toBe(200);
  await db.run("UPDATE gomafia_player_links SET status='pending' WHERE player_id='one'");
  const pending=await request(app).get('/api/player/gomafia/players/one/career').set('Cookie',cookie('one'));
  expect(pending.body.snapshot).toBeNull();expect(pending.body.tournaments).toEqual([]);
 });
});
