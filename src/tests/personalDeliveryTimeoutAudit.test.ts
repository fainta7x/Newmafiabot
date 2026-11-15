import { afterEach, expect, it, vi } from 'vitest';
import { sendTelegramMessage } from '../server/services/telegramMessageOutboxService.ts';
import { sendVkCommunityMessage } from '../server/services/vkMessageOutboxService.ts';

afterEach(()=>{vi.useRealTimers();vi.restoreAllMocks();vi.unstubAllEnvs();});
it.each(['telegram','vk'] as const)('%s transport releases a request that never responds',async channel=>{
  vi.useFakeTimers();
  vi.stubEnv('TELEGRAM_BOT_TOKEN','timeout-audit-token');vi.stubEnv('VK_GROUP_ACCESS_TOKEN','timeout-audit-vk-token');
  // Drive the native deadline deterministically; no real network or elapsed-minute wait.
  vi.spyOn(AbortSignal,'timeout').mockImplementation(delay=>{
    const controller=new AbortController();
    setTimeout(()=>controller.abort(new DOMException('request deadline exceeded','TimeoutError')),delay);
    return controller.signal;
  });
  let rejectPending!:(reason:unknown)=>void;
  const fetchImpl=(async(_url:unknown,init?:RequestInit)=>new Promise<Response>((_resolve,reject)=>{
    rejectPending=reject;
    init?.signal?.addEventListener('abort',()=>reject(init.signal?.reason),{once:true});
  })) as typeof fetch;
  let settled=false;
  const sending=(channel==='telegram'
    ?sendTelegramMessage({chat_id:'777',text:'Reminder'},fetchImpl)
    :sendVkCommunityMessage({vk_user_id:'888',random_id:123,text:'Reminder'},fetchImpl))
    .then(result=>{settled=true;return result;});
  await vi.advanceTimersByTimeAsync(60_000);
  try {
    expect(settled).toBe(true);
    expect(await sending).toMatchObject({ok:false,temporary:true});
  } finally {
    rejectPending(new Error('test cleanup'));await sending;
  }
});
