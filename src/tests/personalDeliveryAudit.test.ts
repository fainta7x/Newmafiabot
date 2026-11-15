import { ensureVkIntegrationSchema } from '../db/ensureVkIntegrationSchema.ts';
import * as vk from '../server/services/vkMessageOutboxService.ts';
import { afterEach, expect, it, vi } from 'vitest';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { queuePersonalNotification } from '../server/services/personalNotificationRouterService.ts';
import * as telegram from '../server/services/telegramMessageOutboxService.ts';

const opened:DatabaseWrapper[]=[];
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllEnvs();opened.splice(0).forEach(db=>db.sqlite.close());});
async function setup(channel:'telegram'|'vk'='telegram'){
  const db=createDatabaseConnection(':memory:');opened.push(db);
  const now=new Date().toISOString();
  await db.run("INSERT INTO players (id,nickname,telegram_user_id,created_at,updated_at) VALUES ('p','Delivery audit',?,?,?)",[channel==='telegram'?'777':null,now,now]);
  if(channel==='vk') {
    await ensureVkIntegrationSchema(db);
    await db.run("INSERT INTO player_external_identities (platform,external_user_id,player_id,linked_at,updated_at) VALUES ('vk','888','p',?,?)",[now,now]);
  }
  vi.spyOn(vk,'kickVkMessageOutbox').mockImplementation(()=>{});
  vi.spyOn(vk,'startVkMessageOutboxWorker').mockImplementation(()=>{});
  vi.spyOn(telegram,'kickTelegramMessageOutbox').mockImplementation(()=>{});
  return db;
}

it.each(['telegram','vk'] as const)('concurrent producers enqueue one %s notification and all receive a valid result',async channel=>{
  const db=await setup(channel);
  const result=await Promise.allSettled(Array.from({length:8},(_,i)=>queuePersonalNotification(db,{notificationKey:'audit:one:p',playerId:'p',eventType:'evening_reminder',text:`Reminder ${i}`})));
  expect(result.filter(item=>item.status==='rejected')).toEqual([]);
  const fulfilled=result.filter(item=>item.status==='fulfilled').map(item=>item.value);
  expect(fulfilled.filter(item=>item.created)).toHaveLength(1);
  expect(await db.all("SELECT notification_key FROM personal_notification_deliveries WHERE notification_key='audit:one:p'")).toHaveLength(1);
  const row=await db.get<any>("SELECT text FROM personal_notification_deliveries WHERE notification_key='audit:one:p'");
  const outbox=channel==='telegram'?'telegram_message_outbox':'vk_message_outbox';
  const key=channel==='telegram'?'audit:one:p':'personal:audit:one:p:vk';
  expect(await db.get(`SELECT text FROM ${outbox} WHERE message_key=?`,[key])).toEqual(row);
  expect(fulfilled.every(item=>item.delivery?.text===row.text)).toBe(true);
});

it.each([null,{ok:true},{ok:true,result:{message_id:0}}])('does not mark an incomplete Telegram acknowledgement sent: %j',async payload=>{
  const db=await setup();vi.stubEnv('TELEGRAM_BOT_TOKEN','delivery-audit-token');
  await telegram.enqueueTelegramMessage(db,{messageKey:'audit:receipt',category:'personal',eventType:'evening_reminder',chatId:'777',text:'Reminder'});
  const fetchImpl=vi.fn(async()=>new Response(JSON.stringify(payload),{status:200}));
  const result=await telegram.drainTelegramMessageOutbox(db,{fetchImpl:fetchImpl as typeof fetch});
  expect(result.sent).toBe(0);
  expect((await db.get<any>("SELECT status FROM telegram_message_outbox WHERE message_key='audit:receipt'"))?.status).toBe('failed');
});

it('an uncertain photo acknowledgement does not fall back to a second text send',async()=>{
  vi.stubEnv('TELEGRAM_BOT_TOKEN','delivery-audit-token');
  const send=vi.fn(async()=>new Response('{}',{status:200}));
  const result=await telegram.sendTelegramMessage({chat_id:'777',text:'Reminder',photo_png:Buffer.from('synthetic image')},send as typeof fetch);
  expect(result).toMatchObject({ok:false,ambiguous:true});
  expect(send).toHaveBeenCalledTimes(1);
});


it.each([false,true])('accepts a complete Telegram acknowledgement (photo=%s)',async photo=>{
  vi.stubEnv('TELEGRAM_BOT_TOKEN','delivery-audit-token');
  const send=vi.fn(async()=>new Response(JSON.stringify({ok:true,result:{message_id:902}}),{status:200}));
  expect(await telegram.sendTelegramMessage({chat_id:'777',text:'Reminder',...(photo?{photo_png:Buffer.from('synthetic image')}:{})},send as typeof fetch)).toMatchObject({ok:true});
  expect(send).toHaveBeenCalledTimes(1);
});

it('an uncertain cancellation acknowledgement is not automatically sent again',async()=>{
  const db=await setup();vi.stubEnv('TELEGRAM_BOT_TOKEN','delivery-audit-token');
  await telegram.enqueueTelegramMessage(db,{messageKey:'audit:cancel',category:'personal',eventType:'evening_cancelled',chatId:'777',text:'Cancelled'});
  const send=vi.fn(async()=>new Response('{}',{status:200}));
  expect((await telegram.drainTelegramMessageOutbox(db,{fetchImpl:send as typeof fetch})).failed).toBe(1);
  expect(await db.get("SELECT status,next_attempt_at FROM telegram_message_outbox WHERE message_key='audit:cancel'")).toEqual({status:'failed',next_attempt_at:null});
  await telegram.drainTelegramMessageOutbox(db,{fetchImpl:send as typeof fetch});
  expect(send).toHaveBeenCalledTimes(1);
});
