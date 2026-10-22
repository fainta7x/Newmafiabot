import { afterEach, describe, expect, it } from 'vitest';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { queuePersonalNotification } from '../server/services/personalNotificationRouterService.ts';

const opened: DatabaseWrapper[] = [];
afterEach(() => { while (opened.length) opened.pop()?.sqlite.close(); });

const writes = (db: DatabaseWrapper) => Number((db.sqlite.prepare('SELECT total_changes() AS n').get() as any).n);
const settle = () => new Promise((resolve) => { setTimeout(resolve, 50); });

describe('a producer re-running every minute', () => {
  it('leaves a sent message alone, refreshes a pending one and restores a lost one', async () => {
    const db = createDatabaseConnection(':memory:'); opened.push(db);
    const now = new Date().toISOString();
    await db.run("INSERT INTO players (id, nickname, telegram_user_id, created_at, updated_at) VALUES ('p1', 'Игрок', '777', ?, ?)", [now, now]);
    const note = (text: string) => queuePersonalNotification(db, { notificationKey: 'reminder:24h:e1:p1', playerId: 'p1', eventType: 'evening_reminder', entityId: 'e1', text });

    expect((await note('Вечер в 19:00')).created).toBe(true);
    await settle();
    const row = () => db.get<any>("SELECT status, text FROM telegram_message_outbox WHERE message_key = 'reminder:24h:e1:p1'");

    // Still pending: the row is refreshed as before (the text comes from the recorded delivery).
    await db.run("UPDATE telegram_message_outbox SET status = 'pending', next_attempt_at = NULL WHERE message_key = 'reminder:24h:e1:p1'");
    const pendingBefore = writes(db);
    await note('Вечер в 19:00');
    expect(writes(db)).toBeGreaterThan(pendingBefore);
    await settle();

    // Sent: nothing is written.
    await db.run("UPDATE telegram_message_outbox SET status = 'sent', next_attempt_at = NULL WHERE message_key = 'reminder:24h:e1:p1'");
    const before = writes(db);
    expect((await note('Вечер в 19:00')).created).toBe(false);
    expect(writes(db)).toBe(before);

    // Lost after the delivery was recorded: put back.
    await db.run("DELETE FROM telegram_message_outbox WHERE message_key = 'reminder:24h:e1:p1'");
    await note('Вечер в 19:00');
    expect((await row())?.status).toBe('pending');
  });
});
