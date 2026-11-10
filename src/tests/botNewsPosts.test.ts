import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { ensureDailyWordSchema } from '../db/ensureDailyWordSchema.ts';
import { ensureClubResultPostSchema } from '../server/services/clubResultPostService.ts';
import { runBotChangesDigest, runDailyWordInvitation, dailyWordInviteText } from '../server/services/botNewsPostService.ts';
import { ensureTelegramPublishingSchema } from '../db/ensureTelegramPublishingSchema.ts';

const opened: DatabaseWrapper[] = [];
afterEach(() => { while (opened.length) opened.pop()?.sqlite.close(); vi.unstubAllEnvs(); });

async function setup() {
  const db = createDatabaseConnection(':memory:'); opened.push(db);
  await ensureTelegramPublishingSchema(db); await ensureClubResultPostSchema(db); await ensureDailyWordSchema(db);
  vi.stubEnv('TELEGRAM_BOT_TOKEN', 'test-token');
  return db;
}
const recorder = () => {
  const calls: any[] = [];
  const fetchImpl = (async (_url: string, init: any) => { calls.push(JSON.parse(String(init.body))); return new Response(JSON.stringify({ ok: true, result: { message_id: 1 } }), { status: 200 }); }) as any;
  return { calls, fetchImpl };
};
const at = (iso: string) => new Date(iso).getTime();

describe('«Новости»: daily word invitation and bot changes digest', () => {
  it('invites once a day from 10:00 Moscow into the «Новости» topic and names yesterday\'s word with the club result', async () => {
    const db = await setup();
    const now = (await db.run("INSERT INTO players (id,nickname,tokens,created_at,updated_at) VALUES ('a','А',0,'x','x'),('b','Б',0,'x','x')"), at('2026-11-12T08:00:00Z'));
    await db.run("INSERT INTO daily_word_puzzles (day,answer,reward,created_at) VALUES ('2026-11-11','камень',200,'x')");
    await db.run("INSERT INTO daily_word_sessions (day,player_id,status,updated_at) VALUES ('2026-11-11','a','won','x'),('2026-11-11','b','lost','x')");
    const { calls, fetchImpl } = recorder();
    expect(await runDailyWordInvitation(db, fetchImpl, at('2026-11-12T06:30:00Z'))).toBe(0); // 09:30 Moscow
    expect(await runDailyWordInvitation(db, fetchImpl, now)).toBe(1);
    expect(await runDailyWordInvitation(db, fetchImpl, now + 3_600_000)).toBe(0);
    expect(calls).toHaveLength(1);
    expect(calls[0].chat_id).toBe('-1001628595679');
    expect(calls[0].message_thread_id).toBe(5925);
    expect(calls[0].text).toContain('Вчера слово было «камень»: отгадали 1 из 2.');
  });

  it('text without a puzzle yesterday has no result line', async () => {
    const db = await setup();
    expect(await dailyWordInviteText(db, '2026-11-12')).not.toContain('Вчера');
  });

  it('publishes the digest from 18:00 Moscow, at most once in 3 days, each entry once', async () => {
    const db = await setup();
    const { calls, fetchImpl } = recorder();
    expect(await runBotChangesDigest(db, fetchImpl, at('2026-11-12T10:00:00Z'))).toBe(0); // 13:00 Moscow
    expect(await runBotChangesDigest(db, fetchImpl, at('2026-11-12T15:30:00Z'))).toBe(1);
    expect(calls[0].text).toContain('Что нового в боте клуба');
    expect(calls[0].message_thread_id).toBe(5925);
    expect(await runBotChangesDigest(db, fetchImpl, at('2026-11-13T15:30:00Z'))).toBe(0);
    expect(await runBotChangesDigest(db, fetchImpl, at('2026-11-16T15:30:00Z'))).toBe(0); // nothing new
    expect(calls).toHaveLength(1);
  });
});
