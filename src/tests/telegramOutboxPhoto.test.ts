import { afterEach, describe, expect, it } from 'vitest';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { drainTelegramMessageOutbox, enqueueTelegramMessage } from '../server/services/telegramMessageOutboxService.ts';

const opened: DatabaseWrapper[] = [];
afterEach(() => { while (opened.length) opened.pop()?.sqlite.close(); });
const PNG = Buffer.from('89504e470d0a1a0a', 'hex');

describe('a Telegram message with a picture', () => {
  it('goes as one photo with the text as the caption and the buttons, and the picture is cleared once sent', async () => {
    process.env.TELEGRAM_BOT_TOKEN = 'test-token';
    const db = createDatabaseConnection(':memory:'); opened.push(db);
    await enqueueTelegramMessage(db, { messageKey: 'k1', category: 'personal', eventType: 'evening_vote', chatId: '5', text: '🏆 Кто сыграл лучше всех?', replyMarkup: { inline_keyboard: [[{ text: 'Аня', callback_data: 'evv:e:a' }]] }, photoPng: PNG });
    const calls: Array<{ url: string; body: any }> = [];
    const fetchImpl = (async (url: string, init: any) => { calls.push({ url, body: init.body }); return new Response(JSON.stringify({ ok: true }), { status: 200 }); }) as unknown as typeof fetch;
    await drainTelegramMessageOutbox(db, { fetchImpl });
    expect(calls.length).toBe(1);
    expect(calls[0].url).toContain('/sendPhoto');
    expect(calls[0].body.get('caption')).toBe('🏆 Кто сыграл лучше всех?');
    expect(JSON.parse(String(calls[0].body.get('reply_markup'))).inline_keyboard[0][0].callback_data).toBe('evv:e:a');
    const row = await db.get<any>('SELECT status, photo_png FROM telegram_message_outbox WHERE message_key = ?', ['k1']);
    expect(row.status).toBe('sent');
    expect(row.photo_png).toBeNull();
  });

  it('falls back to the text when Telegram refuses the picture, and retries a temporary failure', async () => {
    process.env.TELEGRAM_BOT_TOKEN = 'test-token';
    const db = createDatabaseConnection(':memory:'); opened.push(db);
    await enqueueTelegramMessage(db, { messageKey: 'k2', category: 'personal', eventType: 'evening_mvp_result', chatId: '5', text: 'Итог', photoPng: PNG });
    const urls: string[] = [];
    const refuse = (async (url: string) => { urls.push(url); return url.includes('/sendPhoto') ? new Response(JSON.stringify({ ok: false, description: 'bad' }), { status: 400 }) : new Response(JSON.stringify({ ok: true }), { status: 200 }); }) as unknown as typeof fetch;
    await drainTelegramMessageOutbox(db, { fetchImpl: refuse });
    expect(urls.map((url) => url.split('/').pop())).toEqual(['sendPhoto', 'sendMessage']);
    expect((await db.get<any>("SELECT status FROM telegram_message_outbox WHERE message_key = 'k2'")).status).toBe('sent');

    await enqueueTelegramMessage(db, { messageKey: 'k3', category: 'personal', eventType: 'evening_mvp_result', chatId: '5', text: 'Итог 2', photoPng: PNG });
    const down = (async () => new Response(JSON.stringify({ ok: false, description: 'later' }), { status: 429 })) as unknown as typeof fetch;
    await drainTelegramMessageOutbox(db, { fetchImpl: down });
    const retry = await db.get<any>("SELECT status, next_attempt_at, photo_png FROM telegram_message_outbox WHERE message_key = 'k3'");
    expect(retry.status).toBe('failed');
    expect(retry.next_attempt_at).not.toBeNull();
    expect(retry.photo_png).not.toBeNull();
  });
});
