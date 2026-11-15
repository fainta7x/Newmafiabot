import { afterEach, expect, it, vi } from 'vitest';
import { createDatabaseConnection } from '../db/index.ts';
import { drainVkMessageOutbox, enqueueVkMessage, sendVkCommunityMessage } from '../server/services/vkMessageOutboxService.ts';

const row = { vk_user_id: '123', random_id: 777, text: 'Audit' };
afterEach(() => { vi.unstubAllEnvs(); });
it.each([null, false, 0, -1, '42', {}, []])('rejects invalid VK message receipt %j', async receipt => {
  vi.stubEnv('VK_GROUP_ACCESS_TOKEN', 'synthetic');
  const send = (async () => new Response(JSON.stringify({ response: receipt }))) as typeof fetch;
  expect(await sendVkCommunityMessage(row, send)).toMatchObject({ ok: false, temporary: true });
});
it.each(['{}', 'not json'])('keeps incomplete response retryable: %s', async body => {
  vi.stubEnv('VK_GROUP_ACCESS_TOKEN', 'synthetic');
  expect(await sendVkCommunityMessage(row, (async () => new Response(body)) as typeof fetch)).toMatchObject({ ok: false, temporary: true });
});
it('recovers an unconfirmed send with the same random_id and marks sent only after acknowledgement', async () => {
  vi.stubEnv('VK_GROUP_ACCESS_TOKEN', 'synthetic');
  const db = createDatabaseConnection(':memory:');
  try {
    await db.exec("CREATE TABLE personal_notification_deliveries (notification_key TEXT PRIMARY KEY, selected_channel TEXT, status TEXT, reason TEXT, updated_at TEXT)");
    await enqueueVkMessage(db, { messageKey: 'audit', notificationKey: 'audit', category: 'personal', eventType: 'audit', vkUserId: '123', text: 'Audit' });
    const ids: string[] = [];
    const send = (async (_url, init) => {
      ids.push(new URLSearchParams(String(init?.body)).get('random_id')!);
      return new Response(JSON.stringify(ids.length === 1 ? { response: null } : { response: 42 }));
    }) as typeof fetch;
    expect(await drainVkMessageOutbox(db, { fetchImpl: send })).toMatchObject({ sent: 0, failed: 1 });
    expect(await db.get('SELECT status, retry_count, next_attempt_at FROM vk_message_outbox')).toMatchObject({ status: 'failed', retry_count: 1, next_attempt_at: expect.any(String) });
    await db.run("UPDATE vk_message_outbox SET next_attempt_at='2000-01-01T00:00:00Z'");
    expect(await drainVkMessageOutbox(db, { fetchImpl: send })).toMatchObject({ sent: 1 });
    expect(ids).toHaveLength(2);
    expect(ids[1]).toBe(ids[0]);
    expect(await db.get('SELECT status, next_attempt_at FROM vk_message_outbox')).toMatchObject({ status: 'sent', next_attempt_at: null });
  } finally { db.sqlite.close(); }
});

it('keeps HTTP408 retryable without exhausting the delivery budget', async () => {
  vi.stubEnv('VK_GROUP_ACCESS_TOKEN', 'synthetic');
  expect(await sendVkCommunityMessage(row, (async () => new Response('{}', { status: 408 })) as typeof fetch)).toMatchObject({ ok: false, temporary: true });
});
