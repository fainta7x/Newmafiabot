import { afterEach, expect, it, vi } from 'vitest';
import { createDatabaseConnection } from '../db/index.ts';
import { ensurePersonalNotificationRoutingSchema } from '../db/ensurePersonalNotificationRoutingSchema.ts';
import { ensureTelegramDirectMessageSchema } from '../db/ensureTelegramDirectMessageSchema.ts';
import { drainVkMessageOutbox, enqueueVkMessage } from '../server/services/vkMessageOutboxService.ts';
import * as telegram from '../server/services/telegramMessageOutboxService.ts';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });
it('rolls back failed fallback creation and recovers on the next worker drain', async () => {
  vi.stubEnv('VK_GROUP_ACCESS_TOKEN', 'synthetic');
  vi.spyOn(telegram, 'kickTelegramMessageOutbox').mockImplementation(() => {});
  const db = createDatabaseConnection(':memory:');
  try {
    await ensurePersonalNotificationRoutingSchema(db);
    await ensureTelegramDirectMessageSchema(db);
    const now = new Date().toISOString();
    await db.run("INSERT INTO players (id,nickname,telegram_user_id,created_at,updated_at) VALUES ('p','Audit','777',?,?)", [now, now]);
    await db.run("INSERT INTO personal_notification_deliveries (notification_key,player_id,category,event_type,selected_channel,channel_target,text,status,created_at,updated_at) VALUES ('audit','p','personal','audit','vk','888','Reminder','pending_channel',?,?)", [now, now]);
    await enqueueVkMessage(db, { messageKey: 'personal:audit:vk', notificationKey: 'audit', category: 'personal', eventType: 'audit', playerId: 'p', vkUserId: '888', text: 'Reminder' });
    await db.exec("CREATE TRIGGER fail_fallback BEFORE INSERT ON telegram_message_outbox BEGIN SELECT RAISE(ABORT, 'injected fallback failure'); END");
    const send = (async () => new Response(JSON.stringify({ error: { error_code: 901, error_msg: 'permission denied' } }))) as typeof fetch;
    await expect(drainVkMessageOutbox(db, { fetchImpl: send })).rejects.toThrow('injected fallback failure');
    expect(await db.get('SELECT status, retry_count FROM vk_message_outbox')).toMatchObject({ status: 'pending', retry_count: 0 });
    expect(await db.get('SELECT selected_channel FROM personal_notification_deliveries')).toMatchObject({ selected_channel: 'vk' });
    expect(await db.all('SELECT * FROM telegram_message_outbox')).toHaveLength(0);
    await db.exec('DROP TRIGGER fail_fallback');
    expect(await drainVkMessageOutbox(db, { fetchImpl: send })).toMatchObject({ failed: 1 });
    expect(await db.get('SELECT selected_channel FROM personal_notification_deliveries')).toMatchObject({ selected_channel: 'telegram' });
    expect(await db.all('SELECT * FROM telegram_message_outbox')).toHaveLength(1);
    expect(await drainVkMessageOutbox(db, { fetchImpl: send })).toMatchObject({ processed: 0 });
    expect(await db.all('SELECT * FROM telegram_message_outbox')).toHaveLength(1);
  } finally { db.sqlite.close(); }
});
