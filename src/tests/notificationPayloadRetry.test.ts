import { afterEach, expect, it, vi } from 'vitest';
import { createDatabaseConnection } from '../db/index.ts';
import { queuePersonalNotification } from '../server/services/personalNotificationRouterService.ts';
import * as telegram from '../server/services/telegramMessageOutboxService.ts';

afterEach(() => vi.restoreAllMocks());
it('preserves photo and buttons when the same personal notification is queued without optional payload', async () => {
  vi.spyOn(telegram, 'kickTelegramMessageOutbox').mockImplementation(() => {});
  const db = createDatabaseConnection(':memory:');
  try {
    const now = new Date().toISOString();
    await db.run("INSERT INTO players (id,nickname,telegram_user_id,created_at,updated_at) VALUES ('p','Audit','777',?,?)", [now, now]);
    const input = { notificationKey: 'payload', playerId: 'p', eventType: 'audit', text: 'Reminder' };
    const photo = Buffer.from('synthetic-photo');
    const buttons = { inline_keyboard: [[{ text: 'Open', url: 'https://example.test' }]] };
    await queuePersonalNotification(db, { ...input, telegramPhotoPng: photo, telegramReplyMarkup: buttons });
    await queuePersonalNotification(db, input);
    const stored = await db.get<any>("SELECT photo_png, reply_markup_json FROM telegram_message_outbox WHERE message_key='payload'");
    expect(Buffer.from(stored.photo_png || [])).toEqual(photo);
    expect(JSON.parse(stored.reply_markup_json || 'null')).toEqual(buttons);
    await telegram.enqueueTelegramMessage(db, { messageKey: 'payload', category: 'personal', eventType: 'audit', chatId: '777', text: 'Updated', photoPng: null, replyMarkup: null });
    expect(await db.get("SELECT photo_png, reply_markup_json FROM telegram_message_outbox WHERE message_key='payload'")).toEqual({ photo_png: null, reply_markup_json: null });
  } finally { db.sqlite.close(); }
});
