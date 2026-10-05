import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../app.ts';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { queuePersonalNotification, savePersonalNotificationPreference } from '../server/services/personalNotificationRouterService.ts';
import { drainVkMessageOutbox } from '../server/services/vkMessageOutboxService.ts';

const opened: DatabaseWrapper[] = [];
afterEach(() => { while (opened.length) opened.pop()?.sqlite.close(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

const setup = async () => {
  const db = createDatabaseConnection(':memory:'); opened.push(db);
  await createApp(db);
  const now = new Date().toISOString();
  await db.run('INSERT INTO players (id, nickname, created_at, updated_at) VALUES (?,?,?,?)', ['p1', 'P1', now, now]);
  return db;
};
const note = (key: string) => ({ notificationKey: key, playerId: 'p1', eventType: 'tournament_seat', entityId: 't1', text: 'Ваше место 3', actionPath: '/player' });

describe('personal notifications that could not be routed', () => {
  it('are delivered on a producer retry once the player has linked a channel', async () => {
    const db = await setup();
    const first = await queuePersonalNotification(db, note('seat:1'));
    expect(first.delivery).toMatchObject({ status: 'unroutable', selected_channel: null });

    await db.run("UPDATE players SET telegram_user_id = '555' WHERE id = 'p1'");
    const again = await queuePersonalNotification(db, note('seat:1'));
    expect(again.delivery).toMatchObject({ status: 'queued', selected_channel: 'telegram', channel_target: '555' });
    expect(await db.get<any>("SELECT chat_id, status FROM telegram_message_outbox WHERE message_key='seat:1'")).toMatchObject({ chat_id: '555', status: 'pending' });
  });

  it('stay unroutable while there is still no channel, and disabled ones are never re-routed', async () => {
    const db = await setup();
    await queuePersonalNotification(db, note('seat:2'));
    expect((await queuePersonalNotification(db, note('seat:2'))).delivery).toMatchObject({ status: 'unroutable' });
    await savePersonalNotificationPreference(db, 'p1', { personalEnabled: false });
    await queuePersonalNotification(db, note('seat:3'));
    await db.run("UPDATE players SET telegram_user_id = '555' WHERE id = 'p1'");
    expect((await queuePersonalNotification(db, note('seat:3'))).delivery).toMatchObject({ status: 'disabled' });
  });
});

describe('a VK message that can no longer be delivered', () => {
  it('goes to Telegram when the player has one linked', async () => {
    vi.stubEnv('VK_GROUP_ACCESS_TOKEN', 'group-secret');
    const db = await setup();
    const now = new Date().toISOString();
    await db.run("UPDATE players SET telegram_user_id = '555' WHERE id = 'p1'");
    await db.run("INSERT INTO player_external_identities (platform, external_user_id, player_id, linked_at, updated_at) VALUES ('vk', '777', 'p1', ?, ?)", [now, now]);
    await savePersonalNotificationPreference(db, 'p1', { preferredChannel: 'vk' });
    // Queueing kicks the VK worker, which sends with the global fetch: make it the same refusal.
    const denied = (async () => new Response(JSON.stringify({ error: { error_code: 901, error_msg: 'denied by user' } }), { status: 200, headers: { 'Content-Type': 'application/json' } })) as typeof fetch;
    vi.stubGlobal('fetch', denied);
    const queued = await queuePersonalNotification(db, note('seat:vk'));
    expect(queued.delivery).toMatchObject({ selected_channel: 'vk', status: 'pending_channel' });
    await vi.waitFor(async () => {
      expect((await db.get<any>("SELECT selected_channel FROM personal_notification_deliveries WHERE notification_key='seat:vk'"))?.selected_channel).toBe('telegram');
    }, { timeout: 2000 });
    await drainVkMessageOutbox(db, { fetchImpl: denied });

    expect(await db.get<any>("SELECT selected_channel, channel_target, status, reason FROM personal_notification_deliveries WHERE notification_key='seat:vk'"))
      .toMatchObject({ selected_channel: 'telegram', channel_target: '555', status: 'queued', reason: 'vk_delivery_failed' });
    expect(await db.get<any>("SELECT chat_id FROM telegram_message_outbox WHERE message_key='seat:vk'")).toMatchObject({ chat_id: '555' });
  });

  it('stays a failed VK delivery when there is no Telegram to fall back to', async () => {
    vi.stubEnv('VK_GROUP_ACCESS_TOKEN', 'group-secret');
    const db = await setup();
    const now = new Date().toISOString();
    await db.run("INSERT INTO player_external_identities (platform, external_user_id, player_id, linked_at, updated_at) VALUES ('vk', '777', 'p1', ?, ?)", [now, now]);
    const denied = (async () => new Response(JSON.stringify({ error: { error_code: 901, error_msg: 'denied' } }), { status: 200, headers: { 'Content-Type': 'application/json' } })) as typeof fetch;
    vi.stubGlobal('fetch', denied);
    await queuePersonalNotification(db, note('seat:vk2'));
    await vi.waitFor(async () => {
      expect((await db.get<any>("SELECT failure_kind FROM vk_message_outbox WHERE notification_key='seat:vk2'"))?.failure_kind).toBe('permission_denied');
    }, { timeout: 2000 });
    expect(await db.get<any>("SELECT selected_channel, status FROM personal_notification_deliveries WHERE notification_key='seat:vk2'")).toMatchObject({ selected_channel: 'vk', status: 'pending_channel' });
  });
});

describe('messages queued inside a transaction', () => {
  it('are not sent before it commits, and never when it rolls back', async () => {
    vi.stubEnv('TELEGRAM_BOT_TOKEN', 'test-token');
    const db = await setup();
    await db.run("UPDATE players SET telegram_user_id = '555' WHERE id = 'p1'");
    const sent: string[] = [];
    vi.stubGlobal('fetch', (async (_url: any, init: any) => { sent.push(JSON.parse(String(init.body)).text); return new Response(JSON.stringify({ ok: true }), { status: 200 }); }) as typeof fetch);

    await expect(db.transaction(async (tx) => {
      await queuePersonalNotification(tx, note('tx:rolled-back'));
      const { drainTelegramMessageOutbox } = await import('../server/services/telegramMessageOutboxService.ts');
      expect(await drainTelegramMessageOutbox(tx)).toMatchObject({ processed: 0 });
      throw new Error('rollback');
    })).rejects.toThrow('rollback');
    await new Promise((resolve) => setTimeout(resolve, 250));
    expect(sent).toEqual([]);
    expect(await db.get<any>("SELECT 1 FROM telegram_message_outbox WHERE message_key = 'tx:rolled-back'")).toBeNull();

    await db.transaction(async (tx) => { await queuePersonalNotification(tx, note('tx:committed')); });
    await vi.waitFor(() => expect(sent).toHaveLength(1), { timeout: 2000 });
  });
});
