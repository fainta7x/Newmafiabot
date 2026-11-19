import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDatabaseConnection } from '../db/index.ts';
import { networkErrorCode, sendPublicTelegram } from '../server/services/publicationTelegramService.ts';

// 2026-11-18: the daily-word post at 10:00 hit a server restart and got «fetch failed»; it was held for a manual check.
// A connection that was never made cannot have reached Telegram, so such a post is retried by itself.
const failing = (code: string) => (async () => { throw Object.assign(new TypeError('fetch failed'), { cause: Object.assign(new Error('connect'), { code }) }); }) as unknown as typeof fetch;

describe('Telegram publication network failures', () => {
  afterEach(() => { vi.unstubAllEnvs(); });

  it('finds the code inside «fetch failed»', () => {
    expect(networkErrorCode(Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } }))).toBe('ECONNREFUSED');
    expect(networkErrorCode(Object.assign(new TypeError('fetch failed'), { cause: { cause: { code: 'ENOTFOUND' } } }))).toBe('ENOTFOUND');
    expect(networkErrorCode(new Error('x'))).toBeNull();
  });

  it('no connection → retried in 30 s; no answer after sending → retried in 15 minutes; other errors → held', async () => {
    vi.stubEnv('TELEGRAM_BOT_TOKEN', 'test-token');
    const db = createDatabaseConnection(':memory:');
    try {
      const request = { method: 'sendMessage', fields: { chat_id: '-1', text: 'Слово дня' } } as any;
      for (const code of ['ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'UND_ERR_CONNECT_TIMEOUT']) {
        expect(await sendPublicTelegram(db, request, failing(code))).toMatchObject({ ok: false, certainty: 'rejected', temporary: true });
      }
      // No answer after sending (2026-11-19, ETIMEDOUT): sent again in 15 minutes (owner: «каждые 15 минут… по всем постам»).
      for (const code of ['ETIMEDOUT', 'ECONNRESET', 'UND_ERR_SOCKET']) {
        expect(await sendPublicTelegram(db, request, failing(code))).toMatchObject({ ok: false, certainty: 'rejected', temporary: true, retryAfter: 900 });
      }
      expect(await sendPublicTelegram(db, request, (async () => { throw new TypeError('fetch failed'); }) as unknown as typeof fetch)).toMatchObject({ certainty: 'rejected', temporary: true, retryAfter: 900 });
      // A bug in our own code is not a network failure: still held for a check.
      expect(await sendPublicTelegram(db, request, (async () => { throw new Error('boom'); }) as unknown as typeof fetch)).toMatchObject({ certainty: 'uncertain' });
    } finally { db.sqlite.close(); }
  });
});
