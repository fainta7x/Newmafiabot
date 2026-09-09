import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DatabaseWrapper } from '../db/index.ts';
import { sendVkCommunityMessage } from '../server/services/vkMessageOutboxService.ts';

afterEach(()=>vi.unstubAllEnvs());
const row={vk_user_id:'123',random_id:777,text:'Привет',action_path:'/player/events/e1'};

describe('VK personal messages.send delivery',()=>{
  it('uses the community token and stable random_id without exposing credentials in payload text',async()=>{
    vi.stubEnv('VK_GROUP_ACCESS_TOKEN','group-secret'); vi.stubEnv('PLAYER_APP_URL','https://club.example');
    const fetchMock=vi.fn(async(_url:any,init:any)=>{
      const body=new URLSearchParams(String(init.body));
      expect(body.get('access_token')).toBe('group-secret'); expect(body.get('random_id')).toBe('777');
      expect(body.get('message')).toContain('https://club.example/player/events/e1');
      return new Response(JSON.stringify({response:42}),{status:200,headers:{'Content-Type':'application/json'}});
    });
    await expect(sendVkCommunityMessage(row,fetchMock as any)).resolves.toMatchObject({ok:true});
  });
  it('classifies VK permission failures as non-successful delivery',async()=>{
    vi.stubEnv('VK_GROUP_ACCESS_TOKEN','group-secret');
    const fetchMock=vi.fn(async()=>new Response(JSON.stringify({error:{error_code:901,error_msg:'permission denied'}}),{status:200,headers:{'Content-Type':'application/json'}}));
    await expect(sendVkCommunityMessage(row,fetchMock as any)).resolves.toMatchObject({ok:false,permissionDenied:true,temporary:false});
  });
  it('keeps transport failures retryable',async()=>{
    vi.stubEnv('VK_GROUP_ACCESS_TOKEN','group-secret');
    const fetchMock=vi.fn(async()=>new Response(JSON.stringify({error:{error_code:6,error_msg:'too many requests'}}),{status:200,headers:{'Content-Type':'application/json'}}));
    await expect(sendVkCommunityMessage(row,fetchMock as any)).resolves.toMatchObject({ok:false,temporary:true});
  });
  it('reports missing community configuration without falling back to user OAuth',async()=>{
    vi.stubEnv('VK_GROUP_ACCESS_TOKEN','');
    await expect(sendVkCommunityMessage(row,vi.fn() as any)).resolves.toMatchObject({ok:false,temporary:true,error:'VK_GROUP_ACCESS_TOKEN is not configured'});
  });
});
