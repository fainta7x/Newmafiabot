import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DatabaseWrapper } from '../db/index.ts';
import { loadPersonalNotificationPreference, queuePersonalNotification, resolvePersonalNotificationRouting, savePersonalNotificationPreference } from '../server/services/personalNotificationRouterService.ts';

type Preference = { preferred_channel: string; personal_enabled: number; updated_at: string };
type Delivery = Record<string, any>;
function makeDb(input: { telegram?: string | null; vk?: string | null; preference?: Preference | null } = {}) {
  let preference = input.preference || null;
  const deliveries = new Map<string, Delivery>(), telegramRows = new Map<string, any>(), vkRows = new Map<string, any>();
  const db = {
    exec: vi.fn(async () => {}),
    run: vi.fn(async (sql: string, params: any[] = []) => {
      if (sql.includes('INSERT INTO player_notification_preferences')) preference = { preferred_channel:String(params[1]), personal_enabled:Number(params[2]), updated_at:String(params[3]) };
      if (sql.includes('INSERT INTO personal_notification_deliveries')) {
        const [key,playerId,eventType,entityId,selectedChannel,channelTarget,text,actionPath,status,reason,createdAt,updatedAt]=params;
        deliveries.set(String(key),{notification_key:String(key),player_id:String(playerId),category:'personal',event_type:String(eventType),entity_id:entityId,selected_channel:selectedChannel,channel_target:channelTarget,text,action_path:actionPath,status,reason,created_at:createdAt,updated_at:updatedAt});
      }
      if (sql.includes('INSERT INTO telegram_message_outbox')) telegramRows.set(String(params[0]),{message_key:String(params[0]),chat_id:String(params[5]),text:String(params[6])});
      if (sql.includes('INSERT INTO vk_message_outbox')) vkRows.set(String(params[0]),{message_key:String(params[0]),notification_key:String(params[1]),vk_user_id:String(params[6]),text:String(params[7]),status:'pending',retry_count:0});
      return {changes:1,lastID:null};
    }),
    get: vi.fn(async (sql: string, params: any[] = []) => {
      if (sql.includes('FROM player_notification_preferences')) return preference;
      if (sql.includes('SELECT telegram_user_id FROM players')) return {telegram_user_id:input.telegram||null};
      if (sql.includes('FROM player_external_identities')) return input.vk?{external_user_id:input.vk}:null;
      if (sql.includes('FROM personal_notification_deliveries')) return deliveries.get(String(params[0]))||null;
      if (sql.includes('FROM telegram_message_outbox')) return telegramRows.get(String(params[0]))||null;
      if (sql.includes('FROM vk_message_outbox')) return vkRows.get(String(params[0]))||null;
      return null;
    }),
    all: vi.fn(async () => []), transaction:vi.fn(), sqlite:{} as any, drizzle:{} as any, dbPath:':memory:',
  } as unknown as DatabaseWrapper;
  return {db,deliveries,telegramRows,vkRows,getPreference:()=>preference};
}
beforeEach(()=>vi.clearAllMocks());
describe('personal notification router',()=>{
  it('defaults to Telegram when both identities exist and no preference was set',async()=>{
    const {db}=makeDb({telegram:'111',vk:'222'}); await expect(resolvePersonalNotificationRouting(db,'player-1')).resolves.toMatchObject({preferred_channel:'auto',personal_enabled:true,available_channels:['telegram','vk'],selected_channel:'telegram',channel_target:'111'});
  });
  it('honors explicit VK preference without also routing to Telegram',async()=>{
    const {db}=makeDb({telegram:'111',vk:'222',preference:{preferred_channel:'vk',personal_enabled:1,updated_at:new Date().toISOString()}}); await expect(resolvePersonalNotificationRouting(db,'player-1')).resolves.toMatchObject({selected_channel:'vk',channel_target:'222'});
  });
  it('falls back to an available channel when the preferred one is unavailable',async()=>{
    const {db}=makeDb({telegram:'111',preference:{preferred_channel:'vk',personal_enabled:1,updated_at:new Date().toISOString()}}); await expect(resolvePersonalNotificationRouting(db,'player-1')).resolves.toMatchObject({preferred_channel:'vk',selected_channel:'telegram'});
  });
  it('stores preferences independently of platform identity',async()=>{
    const {db,getPreference}=makeDb(); await savePersonalNotificationPreference(db,'player-1',{preferredChannel:'vk',personalEnabled:false}); expect(getPreference()).toMatchObject({preferred_channel:'vk',personal_enabled:0}); await expect(loadPersonalNotificationPreference(db,'player-1')).resolves.toMatchObject({preferred_channel:'vk',personal_enabled:false});
  });
  it('queues exactly one Telegram delivery for an idempotency key',async()=>{
    const {db,deliveries,telegramRows,vkRows}=makeDb({telegram:'111',vk:'222'}); const input={notificationKey:'evening-invite:42',playerId:'player-1',eventType:'evening_invite',entityId:'42',text:'Приглашение',actionPath:'/player/events/evening-1'}; expect((await queuePersonalNotification(db,input)).created).toBe(true); expect((await queuePersonalNotification(db,input)).created).toBe(false); expect(deliveries.size).toBe(1); expect(telegramRows.size).toBe(1); expect(vkRows.size).toBe(0);
  });
  it('queues durable VK delivery without Telegram duplication',async()=>{
    const {db,deliveries,telegramRows,vkRows}=makeDb({telegram:'111',vk:'222',preference:{preferred_channel:'vk',personal_enabled:1,updated_at:new Date().toISOString()}}); await queuePersonalNotification(db,{notificationKey:'result:42',playerId:'player-1',eventType:'game_result',text:'Игра завершена'}); expect(telegramRows.size).toBe(0); expect(vkRows.get('personal:result:42:vk')).toMatchObject({notification_key:'result:42',vk_user_id:'222'}); expect(deliveries.get('result:42')).toMatchObject({selected_channel:'vk',status:'pending_channel'});
  });
  it('does not route when personal notifications are disabled',async()=>{
    const {db,deliveries,telegramRows,vkRows}=makeDb({telegram:'111',vk:'222',preference:{preferred_channel:'auto',personal_enabled:0,updated_at:new Date().toISOString()}}); await queuePersonalNotification(db,{notificationKey:'summary:42',playerId:'player-1',eventType:'evening_summary',text:'Итоги'}); expect(telegramRows.size).toBe(0); expect(vkRows.size).toBe(0); expect(deliveries.get('summary:42')).toMatchObject({status:'disabled',selected_channel:null});
  });
});
