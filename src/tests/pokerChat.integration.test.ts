import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { generatePlayerSessionToken } from '../server/auth.ts';
import pokerRoutes from '../server/routes/pokerRoutes.ts';
import { cleanPokerChatText, listPokerChat, postPokerChat, POKER_CHAT_MIN_GAP_MS } from '../server/services/pokerChatService.ts';
import { resetPokerRuntimeCacheForTesting } from '../server/services/pokerPersistenceService.ts';
import { POKER_EMOTES } from '../shared/pokerEmotes.ts';

const testApp = (db: DatabaseWrapper) => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    const playerId = String(req.header('x-test-player') || '');
    req.cookies = playerId ? { player_token: generatePlayerSessionToken(playerId) } : {};
    req.db = db;
    next();
  });
  app.use('/api/player', pokerRoutes);
  return app;
};

describe('poker emotes catalog', () => {
  it('has unique ids and phrases, a few friendly ones and mostly teasing ones, none that address a person as «ты»/«вы»', () => {
    expect(new Set(POKER_EMOTES.map((emote) => emote.id)).size).toBe(POKER_EMOTES.length);
    expect(new Set(POKER_EMOTES.map((emote) => emote.label)).size).toBe(POKER_EMOTES.length);
    const friendly = POKER_EMOTES.filter((emote) => emote.tone === 'friendly');
    expect(friendly.map((emote) => emote.id)).toEqual(expect.arrayContaining(['hello', 'bye']));
    expect(POKER_EMOTES.length - friendly.length).toBeGreaterThan(friendly.length);
    for (const emote of POKER_EMOTES) expect(emote.label).not.toMatch(/(^|\s)(ты|вы|твой|ваш)(\s|$|[,.!?])/i);
  });
});

describe('poker table chat', () => {
  let db: DatabaseWrapper;
  beforeEach(async () => {
    resetPokerRuntimeCacheForTesting();
    db = createDatabaseConnection(':memory:');
    const now = new Date().toISOString();
    await db.run(`INSERT INTO players (id,nickname,tokens,created_at,updated_at) VALUES ('ann','Аня',5000,?,?),('bob','Боб',5000,?,?),('eve','Ева',5000,?,?)`, [now, now, now, now, now, now]);
  });

  it('cleans a text to one plain line without links and keeps it short', () => {
    expect(cleanPokerChatText('  привет\n\n  всем\t ')).toBe('привет всем');
    expect(cleanPokerChatText('заходи https://example.com/x и www.spam.ru')).toBe('заходи … и …');
    expect(cleanPokerChatText('а'.repeat(500))).toHaveLength(140);
    expect(cleanPokerChatText('   ')).toBe('');
  });

  it('stores text and emotes, refuses an unknown emote and an empty text, and limits how often one person writes', async () => {
    const send = (extra: Record<string, unknown>, at: number) => postPokerChat(db, { lobbyId: 'main', playerId: 'ann', nickname: 'Аня', ...extra }, at);
    await send({ text: 'всем привет' }, 1_000_000);
    await expect(send({ text: 'ещё' }, 1_000_000 + POKER_CHAT_MIN_GAP_MS - 1)).rejects.toThrow('Слишком часто');
    await send({ emote: 'bluff' }, 1_000_000 + POKER_CHAT_MIN_GAP_MS);
    await expect(send({ emote: 'no-such' }, 1_010_000)).rejects.toThrow('Такой эмоции нет');
    await expect(send({ text: '   ' }, 1_020_000)).rejects.toThrow('Напишите сообщение');
    const list = await listPokerChat(db, 'main', 1_000_000 + POKER_CHAT_MIN_GAP_MS + 500);
    expect(list.map((message) => [message.kind, message.body])).toEqual([['text', 'всем привет'], ['emote', 'bluff']]);
    expect(list[1].age_ms).toBe(500);
  });

  it('lets only people at the table write, and serves the chat with the table', async () => {
    const app = testApp(db);
    const join = (who: string) => request(app).post('/api/player/poker/lobbies/main/join').set('x-test-player', who);
    expect((await join('ann')).status).toBe(200);
    expect((await join('bob')).status).toBe(200);

    const outsider = await request(app).post('/api/player/poker/lobbies/main/chat').set('x-test-player', 'eve').send({ text: 'можно?' });
    expect(outsider.status).toBe(403);

    const sent = await request(app).post('/api/player/poker/lobbies/main/chat').set('x-test-player', 'ann').send({ emote: 'hello' });
    expect(sent.status, JSON.stringify(sent.body)).toBe(200);
    expect(sent.body.chat.map((message: any) => [message.player_id, message.kind, message.body])).toEqual([['ann', 'emote', 'hello']]);

    const flood = await request(app).post('/api/player/poker/lobbies/main/chat').set('x-test-player', 'ann').send({ text: 'ещё' });
    expect(flood.status).toBe(429);

    const read = await request(app).get('/api/player/poker/lobbies/main').set('x-test-player', 'eve');
    expect(read.status).toBe(200);
    expect(read.body.chat).toHaveLength(1);
    expect(read.body.chat[0]).toMatchObject({ nickname: 'Аня', body: 'hello' });
  });
});
