import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { ensureDailyWordSchema } from '../db/ensureDailyWordSchema.ts';
import { ensureDailySudokuSchema } from '../db/ensureDailySudokuSchema.ts';
import { ensureClubResultPostSchema } from '../server/services/clubResultPostService.ts';
import { runBotChangesDigest, runDailyWordInvitation, dailyWordInviteText, runSudokuLaunchPost, SUDOKU_LAUNCH_TEXT, runTelephoneLaunchPost, TELEPHONE_LAUNCH_TEXT } from '../server/services/botNewsPostService.ts';
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

  it('one morning post for both daily games: two buttons and yesterday\'s fastest sudoku (owner, 2026-11-16)', async () => {
    const db = await setup();
    await db.run("INSERT INTO players (id,nickname,tokens,created_at,updated_at) VALUES ('a','Аня',0,'x','x'),('b','Борис',0,'x','x'),('c','Вера',0,'x','x')");
    await ensureDailySudokuSchema(db);
    await db.run("INSERT INTO daily_sudoku_puzzles (day,level,puzzle,solution,reward,created_at) VALUES ('2026-11-11','easy','0','1',200,'x')");
    await db.run(`INSERT INTO daily_sudoku_sessions (day,player_id,board,status,started_at,finished_at,updated_at) VALUES
      ('2026-11-11','a','1','won','2026-11-11T10:00:00Z','2026-11-11T10:09:30Z','x'),('2026-11-11','b','1','won','2026-11-11T11:00:00Z','2026-11-11T11:05:07Z','x'),('2026-11-11','c','0','lost','2026-11-11T12:00:00Z','2026-11-11T12:03:00Z','x')`);
    vi.stubEnv('PUBLIC_APP_URL', 'https://club.example');
    const { calls, fetchImpl } = recorder();
    expect(await runDailyWordInvitation(db, fetchImpl, at('2026-11-12T08:00:00Z'))).toBe(1);
    expect(calls[0].text).toContain('судоку дня');
    expect(calls[0].text).toContain('Судоку вчера решили 2 из 3, быстрее всех — Борис (5:07).');
    expect(calls[0].reply_markup.inline_keyboard[0].map((b: any) => b.text)).toEqual(['🔤 Слово дня', '🔢 Судоку']);
    expect(calls[0].reply_markup.inline_keyboard[0][1].url).toContain('/player/sudoku');
  });

  it('one-off sudoku post: once, only on 16.11 from 10:00 to 22:00 Moscow, and the digest does not repeat it', async () => {
    const db = await setup();
    vi.stubEnv('PUBLIC_APP_URL', 'https://club.example');
    const { calls, fetchImpl } = recorder();
    expect(await runSudokuLaunchPost(db, fetchImpl, at('2026-11-16T06:30:00Z'))).toBe(0); // 09:30 Moscow
    expect(await runSudokuLaunchPost(db, fetchImpl, at('2026-11-16T19:30:00Z'))).toBe(0); // 22:30 Moscow
    expect(await runSudokuLaunchPost(db, fetchImpl, at('2026-11-17T08:00:00Z'))).toBe(0); // the next day
    expect(await runSudokuLaunchPost(db, fetchImpl, at('2026-11-16T12:00:00Z'))).toBe(1);
    expect(await runSudokuLaunchPost(db, fetchImpl, at('2026-11-16T13:00:00Z'))).toBe(0);
    expect(calls).toHaveLength(1);
    expect(calls[0].text).toBe(SUDOKU_LAUNCH_TEXT);
    expect(calls[0].message_thread_id).toBe(5925);
    expect(calls[0].reply_markup.inline_keyboard[0][0].url).toBe('https://club.example/player/sudoku');
    await runBotChangesDigest(db, fetchImpl, at('2026-11-16T15:30:00Z'));
    expect(calls.slice(1).map((c) => c.text).join('\n')).not.toContain('судоку');
  });

  it('one-off «Испорченный телефон» post: once, 16–17.11 from 10:00 to 22:00 Moscow, the digest does not repeat it', async () => {
    const db = await setup();
    vi.stubEnv('PUBLIC_APP_URL', 'https://club.example');
    const { calls, fetchImpl } = recorder();
    expect(await runTelephoneLaunchPost(db, fetchImpl, at('2026-11-16T19:30:00Z'))).toBe(0); // 22:30 Moscow
    expect(await runTelephoneLaunchPost(db, fetchImpl, at('2026-11-18T08:00:00Z'))).toBe(0); // too late
    expect(await runTelephoneLaunchPost(db, fetchImpl, at('2026-11-16T15:00:00Z'))).toBe(1);
    expect(await runTelephoneLaunchPost(db, fetchImpl, at('2026-11-17T08:00:00Z'))).toBe(0);
    expect(calls).toHaveLength(1);
    expect(calls[0].text).toBe(TELEPHONE_LAUNCH_TEXT);
    expect(calls[0].message_thread_id).toBe(5925);
    expect(calls[0].reply_markup.inline_keyboard[0][0].url).toBe('https://club.example/player/telephone');
    await runBotChangesDigest(db, fetchImpl, at('2026-11-16T15:30:00Z'));
    expect(calls.slice(1).map((c) => c.text).join('\n')).not.toContain('Испорченный');
  });

  it('no «Испорченный телефон» post when the digest already told about the game', async () => {
    const db = await setup();
    const { calls, fetchImpl } = recorder();
    await db.run("INSERT INTO club_result_posts (post_key, kind, status, attempts, sent_at, created_at, updated_at) VALUES ('bot-digest-entry:2026-11-drawing-telephone','bot-digest-entry','sent',1,'x','x','x')");
    expect(await runTelephoneLaunchPost(db, fetchImpl, at('2026-11-16T15:00:00Z'))).toBe(0);
    expect(calls).toHaveLength(0);
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
