import * as tokenLedger from '../server/services/tokenLedgerService.ts';
import { afterEach, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.ts';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { generateOrganizerToken } from '../server/auth.ts';
import * as settlements from '../server/services/tournamentGameTokenSettlementService.ts';
import * as achievements from '../server/services/playerAchievementsService.ts';

const databases: DatabaseWrapper[]=[];
afterEach(()=>{vi.restoreAllMocks();databases.splice(0).forEach(db=>db.sqlite.close());});
async function seed() {
  const db=createDatabaseConnection(':memory:');databases.push(db);
  const app=await createApp(db);const now=new Date().toISOString();
  await db.run("INSERT INTO tournaments (id,title,date,status,created_at,updated_at) VALUES ('t','Commit audit',?,'active',?,?)",[now,now,now]);
  await db.run("INSERT INTO tournament_games (id,tournament_id,game_number,status) VALUES ('g','t',1,'active')");
  const results: Array<{participant_id:string;exit_type:'killed'|'alive'}>=[];
  for(let i=1;i<=10;i++) {
    await db.run("INSERT INTO players (id,nickname,created_at,updated_at,tokens) VALUES (?,?,?, ?,0)",[`p${i}`,`Commit ${i}`,now,now]);
    await db.run("INSERT INTO tournament_participants (id,tournament_id,player_id,display_name,participant_number) VALUES (?,'t',?,?,?)",[`tp${i}`,`p${i}`,`Commit ${i}`,i]);
    await db.run("INSERT INTO tournament_game_seats (id,game_id,participant_id,seat_number,role) VALUES (?,'g',?,?,?)",[`seat${i}`,`tp${i}`,i,i<=6?'citizen':i===7?'sheriff':i<=9?'mafia':'don']);
    results.push({participant_id:`tp${i}`,exit_type:i===1?'killed':'alive'});
  }
  const cookie=`organizer_token=${generateOrganizerToken()}`;
  const complete=()=>request(app).post('/api/tournaments/t/games/g/protocol/complete').set('Cookie',cookie)
    .send({protocol:{end_reason:'ppk',ppk_culprit_participant_id:'tp8',first_killed_participant_id:'tp1'},player_results:results});
  const reopen=()=>request(app).post('/api/tournaments/t/games/g/protocol/revert-to-draft').set('Cookie',cookie).send({});
  return {db,complete,reopen};
}

it('an achievement outage does not reject a committed tournament game or skip tokens',async()=>{
  const {db,complete}=await seed();
  vi.spyOn(achievements,'evaluateAchievementsForPlayers').mockRejectedValue(new Error('injected achievement outage'));
  const response=await complete();
  expect(response.status,JSON.stringify(response.body)).toBe(200);
  expect((await db.get<any>("SELECT status FROM tournament_games WHERE id='g'"))?.status).toBe('completed');
  expect((await db.get<any>("SELECT SUM(tokens) AS total FROM players WHERE id IN ('p1','p2','p3','p4','p5','p6','p7','p8','p9','p10')"))?.total).toBeGreaterThan(0);
});

it('failed token settlement rolls completion back and a retry can complete once',async()=>{
  const {db,complete}=await seed();
  const fault=vi.spyOn(settlements,'reconcileTournamentGameTokenSettlement').mockRejectedValueOnce(new Error('injected token outage'));
  const response=await complete();
  expect(response.status).toBe(500);
  expect((await db.get<any>("SELECT status FROM tournament_games WHERE id='g'"))?.status).toBe('active');
  expect(await db.get("SELECT id FROM tournament_game_protocols WHERE game_id='g'")).toBeNull();
  fault.mockRestore();
  expect((await complete()).status).toBe(200);
});

it('failed token reversal rolls reopen back and a retry restores the original balance',async()=>{
  const {db,complete,reopen}=await seed();
  const completed=await complete();expect(completed.status,JSON.stringify(completed.body)).toBe(200);
  const fault=vi.spyOn(settlements,'reconcileTournamentGameTokenSettlement').mockRejectedValueOnce(new Error('injected token reversal outage'));
  expect((await reopen()).status).toBe(500);
  expect((await db.get<any>("SELECT status FROM tournament_games WHERE id='g'"))?.status).toBe('completed');
  expect((await db.get<any>("SELECT status FROM tournament_game_protocols WHERE game_id='g'"))?.status).toBe('completed');
  fault.mockRestore();
  expect((await reopen()).status).toBe(200);
  expect((await db.get<any>("SELECT SUM(tokens) AS total FROM players WHERE id IN ('p1','p2','p3','p4','p5','p6','p7','p8','p9','p10')"))?.total).toBe(0);
});


it('a failure after one player award rolls back every token and the protocol',async()=>{
  const {db,complete}=await seed();
  const original=tokenLedger.mutateTokenBalance;
  const fault=vi.spyOn(tokenLedger,'mutateTokenBalance')
    .mockImplementationOnce((...args)=>original(...args))
    .mockRejectedValueOnce(new Error('second player token write failed'));
  expect((await complete()).status).toBe(500);
  expect((await db.get<any>("SELECT status FROM tournament_games WHERE id='g'"))?.status).toBe('active');
  expect(await db.get("SELECT id FROM tournament_game_protocols WHERE game_id='g'")).toBeNull();
  expect((await db.get<any>("SELECT SUM(tokens) AS total FROM players WHERE id IN ('p1','p2','p3','p4','p5','p6','p7','p8','p9','p10')"))?.total).toBe(0);
  expect(await db.all("SELECT game_id FROM tournament_game_token_settlements WHERE game_id='g'")).toEqual([]);
  fault.mockRestore();
  expect((await complete()).status).toBe(200);
  const once=(await db.get<any>("SELECT SUM(tokens) AS total FROM players WHERE id IN ('p1','p2','p3','p4','p5','p6','p7','p8','p9','p10')"))?.total;
  expect(once).toBeGreaterThan(0);
  expect((await complete()).status).toBe(200);
  expect((await db.get<any>("SELECT SUM(tokens) AS total FROM players WHERE id IN ('p1','p2','p3','p4','p5','p6','p7','p8','p9','p10')"))?.total).toBe(once);
});
