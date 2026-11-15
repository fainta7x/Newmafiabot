import { afterEach, expect, it, vi } from 'vitest';
import { createApp } from '../app.ts';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { loadEveningSlotPlan } from '../server/services/eveningSlotPlanningService.ts';
import { ensureEveningSeatingSchema } from '../server/services/eveningSeatBookingService.ts';
import { queueEveningSeatingJudgeSummary } from '../server/services/eveningSeatingNotificationsService.ts';
import * as telegram from '../server/services/telegramMessageOutboxService.ts';
const opened:DatabaseWrapper[]=[];
afterEach(()=>{vi.restoreAllMocks();opened.splice(0).forEach(db=>db.sqlite.close());});
async function setup(){
  const db=createDatabaseConnection(':memory:');opened.push(db);await createApp(db);
  vi.spyOn(telegram,'kickTelegramMessageOutbox').mockImplementation(()=>{});
  const now=new Date().toISOString();
  await db.run("INSERT INTO players (id,nickname,telegram_user_id,created_at,updated_at) VALUES ('p','Seated player','777',?,?),('ja','Judge A','991',?,?),('jb','Judge B','992',?,?)",[now,now,now,now,now,now]);
  await db.run("INSERT INTO game_evenings (id,title,starts_at,format,status,created_at,updated_at) VALUES ('e','Summary audit',?,'CASUAL','published',?,?)",[now,now,now]);
  const plan=await loadEveningSlotPlan(db,'e');await ensureEveningSeatingSchema(db);
  await db.run("INSERT INTO evening_tables (id,evening_id,name,capacity,created_at,updated_at) VALUES ('t','e','Table',10,?,?)",[now,now]);
  await db.run("INSERT INTO evening_seat_plans (id,evening_id,slot_id,table_id,seat_number,player_id,locked,started,created_at,updated_at) VALUES ('b','e',?,'t',1,'p',1,0,?,?)",[plan.slots[0].id,now,now]);
  await db.run("INSERT INTO evening_staff_assignments (evening_id,judge_player_id,assigned_at,updated_at) VALUES ('e','ja',?,?) ON CONFLICT(evening_id) DO UPDATE SET judge_player_id='ja'",[now,now]);
  return db;
}
it('the newly assigned judge receives unchanged seating without duplicating the first judge notice',async()=>{
  const db=await setup();
  expect((await queueEveningSeatingJudgeSummary(db,'e')).queued).toBe(true);
  expect((await queueEveningSeatingJudgeSummary(db,'e')).queued).toBe(false);
  await db.run("UPDATE evening_staff_assignments SET judge_player_id='jb' WHERE evening_id='e'");
  expect((await queueEveningSeatingJudgeSummary(db,'e')).queued).toBe(true);
  expect((await queueEveningSeatingJudgeSummary(db,'e')).queued).toBe(false);
  expect(await db.all("SELECT player_id FROM personal_notification_deliveries WHERE event_type='evening_seating' ORDER BY player_id")).toEqual([{player_id:'ja'},{player_id:'jb'}]);
  expect(await db.all("SELECT chat_id FROM telegram_message_outbox WHERE event_type='evening_seating' ORDER BY chat_id")).toEqual([{chat_id:'991'},{chat_id:'992'}]);
});

it('does not duplicate a legacy-key summary already sent to the same judge',async()=>{
  const db=await setup();
  expect((await queueEveningSeatingJudgeSummary(db,'e')).queued).toBe(true);
  const row=await db.get<any>("SELECT notification_key FROM personal_notification_deliveries WHERE player_id='ja'");
  const legacyKey=row.notification_key.endsWith(':ja')?row.notification_key.slice(0,-3):row.notification_key;
  await db.run('UPDATE personal_notification_deliveries SET notification_key=? WHERE notification_key=?',[legacyKey,row.notification_key]);
  await db.run("UPDATE telegram_message_outbox SET message_key=?,status='sent',next_attempt_at=NULL WHERE message_key=?",[legacyKey,row.notification_key]);
  expect((await queueEveningSeatingJudgeSummary(db,'e')).queued).toBe(false);
  expect(await db.all("SELECT player_id FROM personal_notification_deliveries WHERE event_type='evening_seating'")).toEqual([{player_id:'ja'}]);
  expect(await db.all("SELECT chat_id,status FROM telegram_message_outbox WHERE event_type='evening_seating'")).toEqual([{chat_id:'991',status:'sent'}]);
});
