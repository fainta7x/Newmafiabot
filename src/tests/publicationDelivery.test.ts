import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { deliverPublication, ensurePublicationDeliverySchema, importLegacyPublicationHolds, listHeldPublications, reconcilePublication } from '../server/services/publicationDeliveryService.ts';
import { publicTelegramResult } from '../server/services/messageDeliveryCertainty.ts';
import { resolvePublication } from '../server/services/publicationRecoveryService.ts';

const databases:DatabaseWrapper[]=[];
afterEach(()=>{databases.splice(0).forEach(db=>db.sqlite.close());vi.unstubAllEnvs();});
const database=()=>{const db=createDatabaseConnection(':memory:');databases.push(db);return db;};
const context={key:'test:one',kind:'test'};
const accepted={ok:true,certainty:'accepted' as const,ids:['10']};
const uncertain={ok:false,certainty:'uncertain' as const,error:'timeout'};

describe('durable public publication attempts',()=>{
  it('claims one sender under concurrency and freezes the original payload and target',async()=>{
    const db=database();let release!:()=>void;const gate=new Promise<void>(done=>{release=done;});
    const send=vi.fn(async(payload:any,target:string)=>{await gate;expect(payload.text).toBe('original');expect(target).toBe('group A');return accepted;});
    const first=deliverPublication(db,context,'telegram','group A',{text:'original'},send);
    await vi.waitFor(async()=>expect(send).toHaveBeenCalledTimes(1));
    const second=await deliverPublication(db,context,'telegram','group B',{text:'edited'},send);
    expect(second.inFlight).toBe(true);release();expect((await first).ok).toBe(true);
    expect((await deliverPublication(db,context,'telegram','group B',{text:'edited'},send)).ok).toBe(true);
    expect(send).toHaveBeenCalledTimes(1);
  });
  it.each([uncertain,{ok:false,certainty:'uncertain' as const,error:'HTTP 503'}])('does not resend an unknown outcome',async result=>{
    const db=database();const send=vi.fn(async()=>result);
    await deliverPublication(db,context,'telegram','A',{text:'x'},send);
    await deliverPublication(db,context,'telegram','A',{text:'x'},send);
    expect(send).toHaveBeenCalledTimes(1);expect(await listHeldPublications(db)).toHaveLength(1);
  });
  it('retries only a confirmed temporary rejection after Retry-After',async()=>{
    const db=database();const send=vi.fn().mockResolvedValueOnce({ok:false,certainty:'rejected',temporary:true,retryAfter:60}).mockResolvedValue(accepted);
    await deliverPublication(db,context,'telegram','A',{text:'original'},send);
    await deliverPublication(db,context,'telegram','A',{text:'new'},send);expect(send).toHaveBeenCalledTimes(1);
    await db.run('UPDATE publication_deliveries SET next_attempt_at=NULL');
    await deliverPublication(db,context,'telegram','B',{text:'new'},send);
    expect(send).toHaveBeenLastCalledWith({text:'original'},'A');
  });
  it('does not resend a permanently rejected request',async()=>{
    const db=database();const send=vi.fn(async()=>({ok:false,certainty:'rejected' as const,temporary:false}));
    await deliverPublication(db,context,'telegram','A',{},send);await deliverPublication(db,context,'telegram','A',{},send);
    expect(send).toHaveBeenCalledTimes(1);
  });
  it('holds a possible remote acceptance when the result write fails',async()=>{
    const db=database();const send=vi.fn(async()=>accepted);const run=db.run.bind(db);
    db.run=async(sql,params)=>{if(sql.startsWith('UPDATE publication_deliveries SET status=?,result='))throw new Error('disk unavailable');return run(sql,params);};
    await expect(deliverPublication(db,context,'telegram','A',{},send)).rejects.toThrow('disk unavailable');db.run=run;
    await db.run("UPDATE publication_deliveries SET updated_at='2000-01-01'");
    await deliverPublication(db,context,'telegram','A',{},send);expect(send).toHaveBeenCalledTimes(1);
    expect(await listHeldPublications(db)).toHaveLength(1);
  });
  it('records a versioned decision and rejects stale or duplicate decisions',async()=>{
    const db=database();await deliverPublication(db,context,'telegram','A',{},async()=>uncertain);
    const [held]=await listHeldPublications(db);const input={key:context.key,attemptId:held.attempt_id,actor:'organizer A',decision:'absent'};
    await expect(reconcilePublication(db,input)).rejects.toMatchObject({statusCode:400});
    await reconcilePublication(db,{...input,confirmed:true});
    await expect(reconcilePublication(db,{...input,confirmed:true})).rejects.toMatchObject({statusCode:409});
    expect(await db.all('SELECT actor,decision FROM publication_delivery_decisions')).toEqual([{actor:'organizer A',decision:'absent'}]);
    const send=vi.fn(async()=>accepted);await deliverPublication(db,context,'telegram','A',{},send);expect(send).toHaveBeenCalledTimes(1);
  });
  it('a late reply cannot overwrite a newer manual decision',async()=>{
    const db=database();let release!:(value:typeof accepted)=>void;const gate=new Promise<typeof accepted>(done=>{release=done;});
    const old=deliverPublication(db,context,'telegram','A',{},()=>gate);
    await vi.waitFor(async()=>expect(await db.get("SELECT 1 FROM publication_deliveries WHERE status='sending'")).toBeTruthy());
    await db.run("UPDATE publication_deliveries SET updated_at='2000-01-01'");const [held]=await listHeldPublications(db);
    await reconcilePublication(db,{key:context.key,attemptId:held.attempt_id,actor:'organizer',decision:'absent',confirmed:true});
    await deliverPublication(db,context,'telegram','A',{},async()=>uncertain);
    release(accepted);await expect(old).rejects.toThrow('уже сверена');
    expect((await db.get<any>('SELECT status FROM publication_deliveries')).status).toBe('uncertain');
  });
  it('manual acceptance is distinct from API proof and never sends again',async()=>{
    const db=database();await deliverPublication(db,context,'telegram','A',{},async()=>uncertain);const [held]=await listHeldPublications(db);
    await reconcilePublication(db,{key:context.key,attemptId:held.attempt_id,actor:'organizer',decision:'accepted',evidence:'https://t.me/example/10'});
    const send=vi.fn(async()=>accepted);await deliverPublication(db,context,'telegram','A',{},send);expect(send).not.toHaveBeenCalled();
    expect(JSON.parse((await db.get<any>('SELECT result FROM publication_deliveries')).result).manual).toBe(true);
  });
  it('cutover is repeatable, isolates databases, preserves terminal results and personal queues',async()=>{
    const db=database(),other=database();
    await db.exec(`CREATE TABLE club_result_posts(post_key TEXT PRIMARY KEY,kind TEXT,status TEXT,evening_id TEXT,game_id TEXT,last_error TEXT);
      INSERT INTO club_result_posts VALUES ('game:1','game','retry','ev',NULL,'timeout'),('game:2','game','sent','ev',NULL,NULL),('game:3','game','failed','ev',NULL,NULL),('mvp-ask:ev','mvp-ask','retry','ev',NULL,NULL),('mvp-result-dm:ev','mvp-result','retry','ev',NULL,NULL)`);
    await importLegacyPublicationHolds(db);await importLegacyPublicationHolds(db);await importLegacyPublicationHolds(other);
    expect(await listHeldPublications(db)).toHaveLength(1);expect(await listHeldPublications(other)).toHaveLength(0);
    expect(await db.all('SELECT status FROM club_result_posts ORDER BY post_key')).toEqual([{status:'uncertain'},{status:'sent'},{status:'failed'},{status:'retry'},{status:'retry'}]);
  });
  it('explicit absence replays the original Telegram request once',async()=>{
    vi.stubEnv('TELEGRAM_BOT_TOKEN','test');const db=database();
    const payload={method:'sendMessage',fields:{chat_id:'A',text:'original'}};
    await deliverPublication(db,context,'telegram','A',payload,async()=>uncertain);
    const [held]=await listHeldPublications(db);const fetchImpl=vi.fn(async()=>new Response(JSON.stringify({ok:true,result:{message_id:100}})));
    await resolvePublication(db,{key:context.key,attemptId:held.attempt_id,decision:'absent',confirmed:true,actor:'organizer'},fetchImpl);
    expect(fetchImpl).toHaveBeenCalledTimes(1);expect(JSON.parse((fetchImpl.mock.calls[0] as any)[1].body).text).toBe('original');
  });
  it('a channel succeeds independently while another remains unknown',async()=>{
    const db=database();await ensurePublicationDeliverySchema(db);
    await Promise.all([deliverPublication(db,{...context,key:'t:telegram'},'telegram','A',{},async()=>accepted),deliverPublication(db,{...context,key:'t:vk'},'vk','B',{},async()=>uncertain)]);
    expect(await db.all('SELECT status FROM publication_deliveries ORDER BY channel')).toEqual([{status:'accepted'},{status:'uncertain'}]);
  });
});

describe('public Telegram acknowledgement boundary',()=>{
  it.each([null,{}, {ok:true}, {ok:true,result:{message_id:0}}, {ok:true,result:{message_id:'10'}}, {ok:false,error_code:500}, {ok:false,error_code:408}])('holds missing or invalid acceptance: %j',body=>{
    expect(publicTelegramResult(200,body).certainty).toBe('uncertain');
  });
  it('requires every expected album ID, and accepts a complete album',()=>{
    expect(publicTelegramResult(200,{ok:true,result:[{message_id:1}]},2).certainty).toBe('uncertain');
    expect(publicTelegramResult(200,{ok:true,result:[{message_id:1},{message_id:2}]},2)).toMatchObject({ok:true,ids:['1','2']});
    expect(publicTelegramResult(429,{ok:false,error_code:429,parameters:{retry_after:42}})).toMatchObject({certainty:'rejected',temporary:true,retryAfter:42});
    expect(publicTelegramResult(503,{ok:false,error_code:400})).toMatchObject({certainty:'uncertain'});
  });
});
