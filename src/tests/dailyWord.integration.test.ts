import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { generatePlayerSessionToken } from '../server/auth.ts';
import dailyWordRoutes from '../server/routes/dailyWordRoutes.ts';
import { dailyWordDay, guessDailyWord, loadDailyWord, revealDailyWord, scheduleDailyWord } from '../server/services/dailyWordService.ts';
import { DAILY_WORD_REWARD, dailyWordShare, markDailyWord } from '../shared/dailyWord.ts';
import { DAILY_WORD_ANSWERS } from '../server/data/dailyWordAnswers.ts';
import { DAILY_WORD_GUESSES } from '../server/data/dailyWordGuesses.ts';
const now=new Date('2026-10-28T12:00:00Z');
describe('daily club word',()=>{
 let db:DatabaseWrapper;
 beforeEach(async()=>{db=createDatabaseConnection(':memory:');await db.run("INSERT INTO players(id,nickname,tokens,created_at,updated_at) VALUES ('a','Аня',0,'2026-10-28','2026-10-28'),('b','Борис',0,'2026-10-28','2026-10-28'),('owner','Владелец',0,'2026-10-28','2026-10-28')");await scheduleDailyWord(db,'owner','2026-10-28','маска',new Date('2026-10-27T12:00:00Z'));});
 afterEach(()=>{vi.restoreAllMocks();db.sqlite.close();});
 const guess=(word:string,n=0,id=`attempt-${n}`,player='a',at=now)=>guessDailyWord(db,player,{day:dailyWordDay(at),word,request_id:id,expected_count:n},at);
 it('uses Moscow midnight and common variable-length server-only words',()=>{
  expect(dailyWordDay(new Date('2026-10-28T20:59:59Z'))).toBe('2026-10-28');
  expect(dailyWordDay(new Date('2026-10-28T21:00:00Z'))).toBe('2026-10-29');
  expect(new Set(DAILY_WORD_ANSWERS.map(w=>w.length))).toEqual(new Set([4,5,6,7,8]));
  expect(DAILY_WORD_GUESSES.length).toBeGreaterThan(20000);
  expect(DAILY_WORD_ANSWERS.every(w=>/^[а-я]{4,8}$/.test(w))).toBe(true);
 });
 it('consumes repeated letters only as often as the answer contains them',()=>{
  expect(markDailyWord('маска','касса')).toEqual(['present','correct','correct','absent','correct']);
  expect(markDailyWord('банан','ананас')).toEqual(['present','present','present','present','absent','absent']);
 });
 it('keeps the answer, schedule and other results out of an unfinished player response',async()=>{
  const state=await loadDailyWord(db,'a',now);
  expect(state).toMatchObject({length:5,status:'new',reward:200,token_balance:0,results:[],reward_eligible:true,next_at:'2026-10-28T21:00:00.000Z'});
  expect(JSON.stringify(state)).not.toContain('маска');
  await expect(revealDailyWord(db,'a',state.day,now)).rejects.toThrow('после завершения');
 });
 it('persists tries, normalizes letters and pays exactly once across retries and concurrent requests',async()=>{
  await guess(' КОШКА ');
  expect((await loadDailyWord(db,'a',now)).guesses[0].word).toBe('кошка');
  const win={day:'2026-10-28',word:'маска',expected_count:1,request_id:'winning-attempt'};
  await Promise.all([guessDailyWord(db,'a',win,now),guessDailyWord(db,'a',win,now)]);
  expect((await loadDailyWord(db,'a',now))).toMatchObject({status:'won',reward_earned:DAILY_WORD_REWARD,token_balance:200});
  expect((await db.get<{n:number}>("SELECT COUNT(*) n FROM token_ledger WHERE reason_type='daily_word_win'"))?.n).toBe(1);
  await expect(guess('лампа',2)).rejects.toThrow('завершена');
  expect((await revealDailyWord(db,'a','2026-10-28',now)).answer).toBe('маска');
 });
 it('rejects stale devices and invalid words without using an attempt',async()=>{
  await guess('кошка');
  await expect(guess('лампа',0,'second-device')).rejects.toThrow('другом устройстве');
  await expect(guess('ааааа',1)).rejects.toThrow('словаре');
  await expect(guess('кошка',1)).rejects.toThrow('уже было');
  await expect(guess('кот',1)).rejects.toThrow('5 букв');
  expect((await loadDailyWord(db,'a',now)).guesses).toHaveLength(1);
 });
 it('ends a loss at six tries, reveals on demand and unlocks spoiler-free club comparison',async()=>{
  await guess('маска',0,'boris-win','b');
  expect((await loadDailyWord(db,'a',now)).results).toEqual([]);
  for(const[n,w]of ['кошка','лампа','ложка','миска','шапка','ручка'].entries())await guess(w,n);
  const state=await loadDailyWord(db,'a',now);
  expect(state).toMatchObject({status:'lost',reward_earned:0,token_balance:0});
  expect(state.results).toContainEqual({nickname:'Борис',won:true,attempts:1});
  expect(dailyWordShare(state)).toContain('X/6');
  expect(dailyWordShare(state)).not.toContain('маска');
 });
 it('credits an earned reward even when the previous token balance is negative',async()=>{
  await db.run("UPDATE players SET tokens=-300 WHERE id='a'");
  expect((await guess('маска')).token_balance).toBe(-100);
 });
 it('rolls back the winning guess if token settlement fails',async()=>{
  const run=db.run.bind(db);
  vi.spyOn(db,'run').mockImplementation(async(sql,args)=>{if(sql.startsWith('INSERT INTO token_ledger'))throw Error('ledger failed');return run(sql,args);});
  await expect(guess('маска')).rejects.toThrow('ledger failed');
  expect((await loadDailyWord(db,'a',now))).toMatchObject({status:'new',token_balance:0});
 });
 it('locks the current puzzle, excludes its author from rewards and rejects impossible dates',async()=>{
  await expect(scheduleDailyWord(db,'owner','2026-10-28','лампа',now)).rejects.toThrow('будущую');
  await expect(scheduleDailyWord(db,'owner','2026-02-30','лампа',new Date('2026-01-01'))).rejects.toThrow('будущую');
  const state=await guess('маска',0,'owner-win','owner');
  expect(state).toMatchObject({reward_eligible:false,reward_earned:0,token_balance:0});
  await guess('маска');
  expect((await loadDailyWord(db,'a',now)).results.map(x=>x.nickname)).not.toContain('Владелец');
 });
 it('expires yesterday requests, keeps one shared random puzzle and computes streak without forcing daily attendance',async()=>{
  await guess('маска');
  const tomorrow=new Date('2026-10-28T21:00:01Z');
  const [a,b]=await Promise.all([loadDailyWord(db,'a',tomorrow),loadDailyWord(db,'b',tomorrow)]);
  expect(a).toMatchObject({day:'2026-10-29',streak:1,best_streak:1,status:'new'});
  expect(a.length).toBe(b.length);
  expect((await db.get<{n:number}>("SELECT COUNT(*) n FROM daily_word_puzzles WHERE day='2026-10-29'"))?.n).toBe(1);
  await expect(guessDailyWord(db,'a',{day:'2026-10-28',word:'маска',request_id:'expired-attempt',expected_count:0},tomorrow)).rejects.toThrow('новый день');
  expect((await loadDailyWord(db,'a',new Date('2026-10-30T10:00:00Z'))).streak).toBe(0);
 });
 it('requires a real session and protects word management from players',async()=>{
  const app=express();app.use(express.json());app.use((req,_res,next)=>{req.db=db;req.cookies=req.header('x-player')?{player_token:generatePlayerSessionToken(req.header('x-player')!)}:{};next();});app.use('/api/player',dailyWordRoutes);
  expect((await request(app).get('/api/player/daily-word')).status).toBe(401);
  const state=await request(app).get('/api/player/daily-word').set('x-player','a');expect(state.status).toBe(200);expect(state.headers['cache-control']).toBe('no-store');
  expect((await request(app).get('/api/player/daily-word/schedule').set('x-player','a')).status).toBe(403);
  expect((await request(app).put('/api/player/daily-word/schedule').set('x-player','a').send({day:'2026-12-01',word:'маска'})).status).toBe(403);
  expect((await request(app).get('/api/player/daily-word').set('x-player','missing')).status).toBe(404);
 });
});
