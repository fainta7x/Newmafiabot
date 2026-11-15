import { loadParticipantResponseHistory, setParticipantResponse } from '../server/services/eveningParticipantState.ts';
import { afterEach, expect, it, vi } from 'vitest';
import { createApp } from '../app.ts';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { reserveRoleBeforeDeal, cancelPreGameRolePurchase } from '../server/services/preGameRolePurchaseService.ts';
import { orderGameMusic, cancelGameMusicOrder } from '../server/services/gameMusicOrderService.ts';

const opened: DatabaseWrapper[]=[];
afterEach(()=>{vi.restoreAllMocks();opened.splice(0).forEach(db=>db.sqlite.close());});
async function setup() {
  const db=createDatabaseConnection(':memory:');opened.push(db);await createApp(db);
  const now=new Date().toISOString();
  await db.run("INSERT INTO game_evenings (id,title,starts_at,format,status,created_at,updated_at) VALUES ('e','Purchase recovery',?,'CASUAL','active',?,?)",[now,now,now]);
  const results=[];
  for(let i=1;i<=10;i++) {
    await db.run("INSERT INTO players (id,nickname,tokens,created_at,updated_at) VALUES (?,?,0,?,?)",[`p${i}`,`Recovery ${i}`,now,now]);
    await db.run("INSERT INTO evening_participants (id,evening_id,player_id,attendance_status,payment_status,amount_due,amount_paid,created_at,updated_at) VALUES (?,'e',?,'attended','unpaid',0,0,?,?)",[`ep${i}`,`p${i}`,now,now]);
    results.push({seat_number:i,player_id:`p${i}`,participant_id:`ep${i}`});
  }
  await db.run("INSERT INTO games (id,evening_id,global_game_number,game_date,winner_team,winner_label,protocol_text,slots_json,created_at) VALUES (901,'e',1,?,'draft','Черновик',?,'[]',?)",[now,JSON.stringify({version:1,kind:'club_evening_protocol',protocol:{status:'draft'},player_results:results}),now]);
  const balance=async()=>Number((await db.get<any>("SELECT tokens FROM players WHERE id='p1'"))?.tokens);
  return {db,balance};
}

it.each(['role','music'] as const)('%s checkout recovers after insufficient funds on the first purchase',async kind=>{
  const {db,balance}=await setup();
  const buy=()=>kind==='role'?reserveRoleBeforeDeal(db,901,'p1','sheriff','tokens'):orderGameMusic(db,901,'p1','https://music.yandex.ru/track/123',false,'tokens');
  await expect(buy()).rejects.toMatchObject({statusCode:409});
  expect(await balance()).toBe(0);
  await db.run("UPDATE players SET tokens=20000 WHERE id='p1'");
  const order=await buy();
  expect(order.paidWithTokens).toBe(kind==='role'?10000:5000);
  expect(await balance()).toBe(kind==='role'?10000:15000);
  expect((await db.get<any>("SELECT COUNT(*) AS n FROM shop_purchases WHERE player_id='p1'"))?.n).toBe(1);
  const cancel=()=>kind==='role'?cancelPreGameRolePurchase(db,order.id):cancelGameMusicOrder(db,order.id);
  await Promise.all([cancel(),cancel()]);
  expect(await balance()).toBe(20000);
  expect((await db.get<any>("SELECT COUNT(*) AS n FROM token_ledger WHERE player_id='p1' AND reason_type='game_order_refund'"))?.n).toBe(1);
});

it('a failed shop write rolls the debit back and a later checkout can succeed',async()=>{
  const {db,balance}=await setup();await db.run("UPDATE players SET tokens=20000 WHERE id='p1'");
  const original=db.run.bind(db);
  let fail=true;
  vi.spyOn(db,'run').mockImplementation(async(sql,params)=>{
    if(fail&&sql.includes('INSERT INTO shop_purchases')) {fail=false;throw new Error('injected shop write failure');}
    return original(sql,params);
  });
  await expect(reserveRoleBeforeDeal(db,901,'p1','sheriff','tokens')).rejects.toThrow('injected shop write failure');
  expect(await balance()).toBe(20000);
  expect(await db.all("SELECT id FROM game_role_reservations WHERE player_id='p1'")).toEqual([]);
  const order=await reserveRoleBeforeDeal(db,901,'p1','sheriff','tokens');
  expect(order.paidWithTokens).toBe(10000);
  expect(await balance()).toBe(10000);
});


it('a rolled-back response write does not disable history on the next successful answer',async()=>{
  const {db}=await setup();
  const original=db.run.bind(db);
  let fail=true;
  vi.spyOn(db,'run').mockImplementation(async(sql,params)=>{
    if(fail&&sql.includes('DELETE FROM evening_slot_registrations')) {fail=false;throw new Error('injected slot cleanup failure');}
    return original(sql,params);
  });
  await expect(setParticipantResponse(db,'ep1','declined',{source:'rollback-audit'})).rejects.toThrow('injected slot cleanup failure');
  expect((await db.get<any>("SELECT response_status FROM evening_participants WHERE id='ep1'"))?.response_status).not.toBe('declined');
  await setParticipantResponse(db,'ep1','declined',{source:'rollback-audit'});
  const history=await loadParticipantResponseHistory(db,'ep1');
  expect(history).toHaveLength(1);
  expect(history[0]).toMatchObject({new_status:'declined',source:'rollback-audit'});
});
