import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { ensureCustomEventsSchema } from '../db/ensureCustomEventsSchema.ts';
import { ensureTelegramPublishingSchema } from '../db/ensureTelegramPublishingSchema.ts';
import { publishCustomEvent } from '../server/services/customEventPublishingService.ts';
import { createApp } from '../app.ts';

const opened:DatabaseWrapper[]=[];
afterEach(()=>{delete process.env.TELEGRAM_BOT_TOKEN;while(opened.length)opened.pop()?.sqlite.close();});

async function setup(){
  const db=createDatabaseConnection(':memory:');opened.push(db);await createApp(db);await ensureCustomEventsSchema(db);await ensureTelegramPublishingSchema(db);
  const now=new Date().toISOString(),start=new Date(Date.now()+86400000).toISOString(),end=new Date(Date.now()+90000000).toISOString();
  await db.run(`INSERT INTO players(id,nickname,telegram_user_id,lifecycle_status,source,game_level,club_role,club_stage,created_at,updated_at) VALUES
    ('host','Хост','1','normal','telegram','club','member','CLUB_PLAYER',?,?),
    ('one','Один','2','normal','telegram','club','member','CLUB_PLAYER',?,?),
    ('two','Два','3','normal','telegram','club','member','NOVICE_ACTIVE',?,?)`,[now,now,now,now,now,now]);
  await db.run(`INSERT INTO custom_events(id,organizer_player_id,title,description,starts_at,ends_at,venue,participant_limit,price_rub,status,visibility,allow_guest,announce_telegram_channel,announce_club_group,announce_bot_dm,created_at,updated_at)
    VALUES ('event','host','Киновечер','Описание',?,?,'Клуб',20,0,'published','club',1,1,1,1,?,?)`,[start,end,now,now]);
  await db.run("UPDATE telegram_destinations SET chat_id='-1001',active=1 WHERE id='public'");
  await db.run("UPDATE telegram_destinations SET chat_id='-1002',topic_id=10,active=1 WHERE id='club'");
  return db;
}

describe('custom event manual publishing',()=>{
  it('sends selected public targets and queues visible players only once',async()=>{
    const db=await setup();process.env.TELEGRAM_BOT_TOKEN='token';
    let messageId=100;const fetchImpl=vi.fn(async()=>new Response(JSON.stringify({ok:true,result:{message_id:messageId++}}),{status:200,headers:{'Content-Type':'application/json'}})) as unknown as typeof fetch;
    const queueNotification=vi.fn(async()=>({created:true})) as any;
    const first=await publishCustomEvent(db,'event',{fetchImpl,queueNotification});
    expect(first.results).toEqual(expect.arrayContaining([
      expect.objectContaining({channel:'telegram_channel',status:'sent'}),
      expect.objectContaining({channel:'club_group',status:'sent'}),
      expect.objectContaining({channel:'bot_dm',queued:1}),
    ]));
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(queueNotification).toHaveBeenCalledTimes(1);
    expect(queueNotification.mock.calls[0][1]).toMatchObject({playerId:'one',eventType:'custom_event_announcement'});

    const second=await publishCustomEvent(db,'event',{fetchImpl,queueNotification});
    expect(second.results).toEqual(expect.arrayContaining([
      expect.objectContaining({channel:'telegram_channel',status:'skipped'}),
      expect.objectContaining({channel:'club_group',status:'skipped'}),
      expect.objectContaining({channel:'bot_dm',queued:0,skipped:1}),
    ]));
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(queueNotification).toHaveBeenCalledTimes(1);
    expect(await db.get<any>('SELECT COUNT(*) count FROM telegram_sync_outbox')).toEqual({count:0});
    expect(await db.get<any>('SELECT COUNT(*) count FROM telegram_dispatch_outbox')).toEqual({count:0});
  });

  it('marks a lost Telegram response uncertain and never repeats it automatically',async()=>{
    const db=await setup();process.env.TELEGRAM_BOT_TOKEN='token';
    await db.run('UPDATE custom_events SET announce_club_group=0,announce_bot_dm=0 WHERE id=\'event\'');
    const fetchImpl=vi.fn(async()=>{throw new Error('connection lost');}) as unknown as typeof fetch;
    expect((await publishCustomEvent(db,'event',{fetchImpl})).results[0]).toMatchObject({status:'uncertain'});
    expect((await publishCustomEvent(db,'event',{fetchImpl})).results[0]).toMatchObject({status:'skipped'});
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
