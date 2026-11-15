import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.ts';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { ensureGiftCollectionSchema } from '../db/ensureGiftCollectionSchema.ts';
import { organizerSetContribution } from '../server/services/giftCollectionService.ts';
import { placePoolBet } from '../server/services/bettingPoolService.ts';
import { mutateTokenBalance } from '../server/services/tokenLedgerService.ts';
import { generateOrganizerToken, generatePlayerSessionToken } from '../server/auth.ts';
import { reportTournamentPayment, reviewTournamentPayment } from '../server/services/tournamentEveningService.ts';
import * as notificationRouter from '../server/services/personalNotificationRouterService.ts';
import { createTelegramLinkRequest } from '../server/services/telegramLinkRequestService.ts';

let db: DatabaseWrapper, app: any;
const now = new Date().toISOString();
beforeEach(async () => {
 db = createDatabaseConnection(':memory:'); app = await createApp(db);
 await db.run("INSERT INTO players (id,nickname,telegram_user_id,game_level,club_stage,tokens,created_at,updated_at) VALUES ('p','Audit','777','club','CLUB_PLAYER',0,?,?)",[now,now]);
});
afterEach(() => { vi.restoreAllMocks(); db.sqlite.close(); });
async function gift() {
 await ensureGiftCollectionSchema(db);
 await db.run("INSERT INTO gift_collections (id,honoree_player_id,created_at) VALUES ('g','p',?)",[now]);
 await db.run("INSERT INTO gift_contributions (collection_id,player_id,pledged_amount,created_at,updated_at) VALUES ('g','p',100,?,?)",[now,now]);
}
async function evening() {
 await db.run("INSERT INTO game_evenings (id,title,starts_at,timezone,format,status,capacity,default_price,created_at,updated_at) VALUES ('e','Audit',?,'Europe/Moscow','CASUAL','active',10,100,?,?)",[now,now,now]);
 await db.run("INSERT INTO evening_participants (id,evening_id,player_id,response_status,registration_status,attendance_status,payment_status,amount_due,amount_paid,created_at,updated_at) VALUES ('part','e','p','going','going','attended','unpaid',300,0,?,?)",[now,now]);
}
it('AF01: confirm, undo, confirm a gift contribution should restore tokens',async()=>{
 await gift();
 await organizerSetContribution(db,'g','p','org',{status:'paid'});
 await organizerSetContribution(db,'g','p','org',{status:'unpaid'});
 await organizerSetContribution(db,'g','p','org',{status:'paid'});
 expect(await db.get("SELECT tokens FROM players WHERE id='p'")).toEqual({tokens:100});
});
it('AF02: failed contribution update should not commit the token credit',async()=>{
 await gift();
 await db.exec("CREATE TRIGGER fail_gift BEFORE UPDATE ON gift_contributions BEGIN SELECT RAISE(ABORT,'injected gift failure'); END");
 await expect(organizerSetContribution(db,'g','p','org',{status:'paid'})).rejects.toThrow('injected gift failure');
 expect(await db.get("SELECT tokens FROM players WHERE id='p'")).toEqual({tokens:0});
});
it('AF03: an unrelated active transaction must not disable token mutation rollback',async()=>{
 await db.exec("CREATE TRIGGER fail_tokens BEFORE UPDATE OF tokens ON players WHEN NEW.id='p' BEGIN SELECT RAISE(ABORT,'injected token failure'); END");
 let release!:()=>void, started!:()=>void;
 const gate=new Promise<void>(r=>{release=r;}), ready=new Promise<void>(r=>{started=r;});
 const holding=db.transaction(async()=>{started();await gate;}); await ready;
 const mutation=mutateTokenBalance(db,{playerId:'p',delta:50,reasonType:'audit',description:'Audit',sourceType:'audit',idempotencyKey:'audit'}).catch(e=>e);
 release(); await holding;
 expect(await mutation).toBeInstanceOf(Error);
 expect(await db.all("SELECT id FROM token_ledger WHERE idempotency_key='audit'")).toHaveLength(0);
});
it('AF04: a rejected participant edit must not change the table',async()=>{
 await evening();
 await db.run("INSERT INTO evening_tables (id,evening_id,name,capacity,created_at,updated_at) VALUES ('t','e','Audit',10,?,?)",[now,now]);
 await db.exec("CREATE TRIGGER fail_notes BEFORE UPDATE OF notes ON evening_participants BEGIN SELECT RAISE(ABORT,'injected notes failure'); END");
 const r=await request(app).patch('/api/evening-participants/part').set('Cookie',`organizer_token=${generateOrganizerToken()}`).send({table_id:'t',notes:'fail'});
 expect(r.status).toBe(400);
 expect(await db.get("SELECT table_id FROM evening_participants WHERE id='part'")).toEqual({table_id:null});
});
it('AF05: a failed persistent waiver must not consume the free-evening credit',async()=>{
 await evening();
 await db.run("INSERT INTO shop_purchases (id,player_id,item_id,item_name_snapshot,item_type_snapshot,price_snapshot,status,request_id,purchased_at) VALUES ('credit','p','free_evening','Audit','free_evening',100,'purchased','audit',?)",[now]);
 await db.exec("CREATE TRIGGER fail_waiver BEFORE INSERT ON evening_fee_waivers BEGIN SELECT RAISE(ABORT,'injected waiver failure'); END");
 const r=await request(app).post('/api/player/payments/part/use-free-evening').set('Cookie',`player_token=${generatePlayerSessionToken('p')}`);
 expect(r.status).toBe(500);
 expect(await db.get("SELECT status FROM shop_purchases WHERE id='credit'")).toEqual({status:'purchased'});
});
it('AF06: concurrent new Telegram links should leave only one live request',async()=>{
 await Promise.all([createTelegramLinkRequest(db,{telegramUserId:'888',baseUrl:'https://example.test'}),createTelegramLinkRequest(db,{telegramUserId:'888',baseUrl:'https://example.test'})]);
 expect(await db.all("SELECT code_hash FROM telegram_link_requests WHERE telegram_user_id='888' AND used_at IS NULL")).toHaveLength(1);
});

async function tournament() {
 await db.run("INSERT INTO tournaments (id,title,date,status,tournament_evening_flow,published_at,created_at,updated_at) VALUES ('tournament','Audit',?,'draft',1,?,?,?)",[now,now,now,now]);
 await db.run("INSERT INTO tournament_registrations (id,tournament_id,player_id,status,slot_number,registered_at,updated_at) VALUES ('reg','tournament','p','confirmed',1,?,?)",[now,now]);
 await reportTournamentPayment(db,'tournament','p',500);
}
it('AF07: retrying payment confirmation after notification failure should recover its notification',async()=>{
 await tournament();
 const enqueue=vi.spyOn(notificationRouter,'queuePersonalNotification').mockRejectedValueOnce(new Error('injected notification failure'));
 await expect(reviewTournamentPayment(db,'tournament','p','confirmed','org',500)).rejects.toThrow('injected notification failure');
 enqueue.mockClear();
 await reviewTournamentPayment(db,'tournament','p','confirmed','org',500);
 expect(enqueue).toHaveBeenCalledTimes(1);
});
it('AF08: an older player request must recheck a newer organizer confirmation',async()=>{
 await tournament();
 vi.spyOn(notificationRouter,'queuePersonalNotification').mockResolvedValue({delivery:null,created:false});
 const transaction=db.transaction.bind(db);
 let release!:()=>void, started!:()=>void, hold=true;
 const gate=new Promise<void>(r=>{release=r;}), ready=new Promise<void>(r=>{started=r;});
 vi.spyOn(db,'transaction').mockImplementation((async (work:any)=>{
   if(hold){hold=false;started();await gate;}
   return transaction(work);
 }) as any);
 const reporting=reportTournamentPayment(db,'tournament','p',450,'changed').catch(e=>e);
 await ready;
 await reviewTournamentPayment(db,'tournament','p','confirmed','org',500);
 release();
 expect(await reporting).toMatchObject({message:'PAYMENT_REVIEW_REQUIRED'});
 expect(await db.get("SELECT state FROM tournament_payment_claims WHERE tournament_id='tournament' AND player_id='p'")).toEqual({state:'confirmed'});
});
it('CONTROL: ordinary token mutation rolls back its ledger on player update failure',async()=>{
 await db.exec("CREATE TRIGGER fail_tokens BEFORE UPDATE OF tokens ON players WHEN NEW.id='p' BEGIN SELECT RAISE(ABORT,'injected token failure'); END");
 await expect(mutateTokenBalance(db,{playerId:'p',delta:50,reasonType:'audit',description:'Audit',sourceType:'audit',idempotencyKey:'audit'})).rejects.toThrow('injected token failure');
 expect(await db.all("SELECT id FROM token_ledger WHERE idempotency_key='audit'")).toHaveLength(0);
});
it('CONTROL: confirming a contribution twice without reversal credits only once',async()=>{
 await gift(); await organizerSetContribution(db,'g','p','org',{status:'paid'}); await organizerSetContribution(db,'g','p','org',{status:'paid'});
 expect(await db.get("SELECT tokens FROM players WHERE id='p'")).toEqual({tokens:100});
});
it('CONTROL: sequential Telegram link creation leaves only one active request',async()=>{
 await createTelegramLinkRequest(db,{telegramUserId:'888',baseUrl:'https://example.test'});
 await createTelegramLinkRequest(db,{telegramUserId:'888',baseUrl:'https://example.test'});
 expect(await db.all("SELECT code_hash FROM telegram_link_requests WHERE telegram_user_id='888' AND used_at IS NULL")).toHaveLength(1);
});

it('AF03b: a failed bet during another transaction must not consume its stake',async()=>{
 await db.run("UPDATE players SET tokens=100 WHERE id='p'");
 await db.run("INSERT INTO betting_pools (id,game_id,status,opens_at,closes_at,role_snapshot_json,created_at,updated_at) VALUES ('pool',1,'open',?,?,'[]',?,?)",[now,new Date(Date.now()+600000).toISOString(),now,now]);
 await db.exec("CREATE TRIGGER fail_bet BEFORE INSERT ON betting_bets BEGIN SELECT RAISE(ABORT,'injected bet failure'); END");
 let release!:()=>void, started!:()=>void;
 const gate=new Promise<void>(r=>{release=r;}), ready=new Promise<void>(r=>{started=r;});
 const holding=db.transaction(async()=>{started();await gate;}); await ready;
 const betting=placePoolBet(db,{gameId:1,playerId:'p',team:'red',amount:50,requestId:'audit'}).catch(e=>e);
 release(); await holding;
 expect(await betting).toBeInstanceOf(Error);
 expect(await db.get("SELECT tokens FROM players WHERE id='p'")).toEqual({tokens:100});
});
it('owned concurrent token mutations preserve both credits and the enclosing rollback',async()=>{
 await db.transaction(async tx=>{
   await Promise.all(['one','two'].map(idempotencyKey=>mutateTokenBalance(tx,{playerId:'p',delta:50,reasonType:'audit',description:'Audit',sourceType:'audit',idempotencyKey})));
 });
 expect(await db.get("SELECT tokens FROM players WHERE id='p'")).toEqual({tokens:100});
 await expect(db.transaction(async tx=>{
   await mutateTokenBalance(tx,{playerId:'p',delta:50,reasonType:'audit',description:'Audit',sourceType:'audit',idempotencyKey:'rollback'});
   throw new Error('outer failure');
 })).rejects.toThrow('outer failure');
 expect(await db.get("SELECT tokens FROM players WHERE id='p'")).toEqual({tokens:100});
});
