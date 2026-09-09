import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DatabaseWrapper } from '../db/index.ts';
import { sendVkCommunityMessage, startVkMessageOutboxWorker } from '../server/services/vkMessageOutboxService.ts';

afterEach(()=>{ vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
const row={message_key:'personal:restart:vk',notification_key:'restart',category:'personal',event_type:'test',entity_id:null,player_id:'p1',vk_user_id:'123',random_id:777,text:'Привет',action_path:'/player/events/e1',status:'pending',retry_count:0,created_at:new Date().toISOString()};

describe('VK personal messages.send delivery',()=>{
  it('uses the community token and stable random_id without exposing credentials in message text',async()=>{
    vi.stubEnv('VK_GROUP_ACCESS_TOKEN','group-secret'); vi.stubEnv('PLAYER_APP_URL','https://club.example');
    const fetchMock=vi.fn(async(_url:any,init:any)=>{ const body=new URLSearchParams(String(init.body)); expect(body.get('access_token')).toBe('group-secret'); expect(body.get('random_id')).toBe('777'); expect(body.get('message')).toContain('https://club.example/player/events/e1'); expect(body.get('message')).not.toContain('group-secret'); return new Response(JSON.stringify({response:42}),{status:200,headers:{'Content-Type':'application/json'}}); });
    await expect(sendVkCommunityMessage(row,fetchMock as any)).resolves.toMatchObject({ok:true});
  });
  it('classifies VK permission failures as non-successful delivery',async()=>{ vi.stubEnv('VK_GROUP_ACCESS_TOKEN','group-secret'); const fetchMock=vi.fn(async()=>new Response(JSON.stringify({error:{error_code:901,error_msg:'permission denied'}}),{status:200,headers:{'Content-Type':'application/json'}})); await expect(sendVkCommunityMessage(row,fetchMock as any)).resolves.toMatchObject({ok:false,permissionDenied:true,temporary:false}); });
  it('keeps transport failures retryable',async()=>{ vi.stubEnv('VK_GROUP_ACCESS_TOKEN','group-secret'); const fetchMock=vi.fn(async()=>new Response(JSON.stringify({error:{error_code:6,error_msg:'too many requests'}}),{status:200,headers:{'Content-Type':'application/json'}})); await expect(sendVkCommunityMessage(row,fetchMock as any)).resolves.toMatchObject({ok:false,temporary:true}); });
  it('reports missing community configuration without falling back to user OAuth',async()=>{ vi.stubEnv('VK_GROUP_ACCESS_TOKEN',''); await expect(sendVkCommunityMessage(row,vi.fn() as any)).resolves.toMatchObject({ok:false,temporary:true,error:'VK_GROUP_ACCESS_TOKEN is not configured'}); });

  it('immediately drains a pending row when the runtime worker starts after restart',async()=>{
    vi.stubEnv('VK_GROUP_ACCESS_TOKEN','group-secret');
    const updates:string[]=[];
    const fetchMock=vi.fn(async()=>new Response(JSON.stringify({response:99}),{status:200,headers:{'Content-Type':'application/json'}}));
    vi.stubGlobal('fetch',fetchMock);
    const db={
      exec:vi.fn(async()=>{}),
      run:vi.fn(async(sql:string)=>{ updates.push(sql); return {changes:1,lastID:null}; }),
      get:vi.fn(async(sql:string)=> sql.includes('SELECT status, retry_count')?{status:'pending',retry_count:0}:null),
      all:vi.fn(async(sql:string)=>{
        if(sql.includes('SELECT * FROM vk_message_outbox WHERE status')) return [row];
        return [];
      }),
      transaction:vi.fn(),sqlite:{} as any,drizzle:{} as any,dbPath:':memory:',
    } as unknown as DatabaseWrapper;
    startVkMessageOutboxWorker(db);
    await vi.waitFor(()=>expect(fetchMock).toHaveBeenCalledTimes(1),{timeout:1000});
    expect(updates.some((sql)=>sql.includes("SET status='sent'"))).toBe(true);
  });
});
