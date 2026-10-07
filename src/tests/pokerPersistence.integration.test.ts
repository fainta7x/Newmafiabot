import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { generatePlayerSessionToken } from '../server/auth.ts';
import pokerRoutes from '../server/routes/pokerRoutes.ts';
import { resetPokerRuntimeCacheForTesting } from '../server/services/pokerPersistenceService.ts';

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

describe('durable poker club-token table state', () => {
  let db: DatabaseWrapper;

  beforeEach(async () => {
    resetPokerRuntimeCacheForTesting();
    db = createDatabaseConnection(':memory:');
    const now = new Date().toISOString();
    await db.run(
      `INSERT INTO players (id,nickname,telegram_user_id,tokens,created_at,updated_at)
       VALUES ('alice','Алиса','1001',5000,?,?),('bob','Боб','1002',5000,?,?)`,
      [now, now, now, now],
    );
  });
  afterEach(() => vi.useRealTimers());

  it('restores an in-progress hand from SQLite after a fresh server runtime', async () => {
    let app = testApp(db);
    expect((await request(app).post('/api/player/poker/lobbies/main/join').set('x-test-player', 'alice')).status).toBe(200);
    const started = await request(app).post('/api/player/poker/lobbies/main/join').set('x-test-player', 'bob');
    expect(started.status).toBe(200);
    expect((await db.get<{ tokens: number }>("SELECT tokens FROM players WHERE id='alice'"))?.tokens).toBe(4000);
    expect((await db.get<{ tokens: number }>("SELECT tokens FROM players WHERE id='bob'"))?.tokens).toBe(4000);
    vi.useFakeTimers(); vi.setSystemTime(Number(started.body.lobby.hand.animation_next_at) + 1);
    const ready = await request(app).get('/api/player/poker/lobbies/main').set('x-test-player', 'alice');
    const hand = ready.body.lobby.hand;
    const current = hand.players.find((player: any) => player.seat === hand.current_seat);
    const action = hand.current_bet > current.committed ? { type: 'call' } : { type: 'check' };
    const acted = await request(app).post('/api/player/poker/lobbies/main/action').set('x-test-player', current.id).send(action);
    expect(acted.status).toBe(200);
    const beforeRestart = acted.body.lobby.hand;
    expect((await db.get(`SELECT id FROM poker_runtime_state WHERE id='main'`))).toEqual({ id: 'main' });

    // A new Node process has no Map state and must reconstruct the exact hand from SQLite.
    resetPokerRuntimeCacheForTesting(db);
    app = testApp(db);
    const restored = await request(app).get('/api/player/poker/lobbies/main').set('x-test-player', 'alice');
    expect(restored.status).toBe(200);
    expect(restored.body.lobby.hand).toMatchObject({
      id: beforeRestart.id,
      street: beforeRestart.street,
      pot: beforeRestart.pot,
      current_seat: beforeRestart.current_seat,
      deck_remaining: beforeRestart.deck_remaining,
    });
    expect(restored.body.lobby.hand.action_log).toHaveLength(beforeRestart.action_log.length);
  });

  it('restores the synchronized deal timeline and resumes it after restart', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-02T15:00:00Z'));
    let app = testApp(db);
    await request(app).post('/api/player/poker/lobbies/main/join').set('x-test-player', 'alice');
    const started = await request(app).post('/api/player/poker/lobbies/main/join').set('x-test-player', 'bob');
    expect(started.body.lobby.hand).toMatchObject({ animation_phase: 'dealing', current_seat: null });
    const deadline = Number(started.body.lobby.hand.animation_next_at);

    resetPokerRuntimeCacheForTesting(db);
    app = testApp(db);
    const during = await request(app).get('/api/player/poker/lobbies/main').set('x-test-player', 'alice');
    expect(during.body.lobby.hand).toMatchObject({ animation_phase: 'dealing', animation_next_at: deadline, current_seat: null });
    expect((await request(app).post('/api/player/poker/lobbies/main/action').set('x-test-player', 'alice').send({ type: 'call' })).status).toBe(409);

    vi.setSystemTime(deadline + 1);
    const resumed = await request(app).get('/api/player/poker/lobbies/main').set('x-test-player', 'alice');
    expect(resumed.body.lobby.hand.animation_phase).toBe('playing');
    expect(resumed.body.lobby.hand.current_seat).not.toBeNull();
  });

  it('moves a 1000-token buy-in to the table and returns the remaining stack on exit', async () => {
    let app = testApp(db);
    const joined = await request(app).post('/api/player/poker/lobbies/main/join').set('x-test-player', 'alice');
    expect(joined.status).toBe(200);
    expect(joined.body.lobby.money_mode).toBe('club_tokens');
    expect(joined.body.lobby.players.find((player: any) => player.id === 'alice').chips).toBe(1000);
    expect((await db.get<{ tokens: number }>("SELECT tokens FROM players WHERE id='alice'"))?.tokens).toBe(4000);

    expect((await request(app).post('/api/player/poker/lobbies/main/leave').set('x-test-player', 'alice')).status).toBe(200);
    expect((await db.get<{ tokens: number }>("SELECT tokens FROM players WHERE id='alice'"))?.tokens).toBe(5000);

    resetPokerRuntimeCacheForTesting(db);
    app = testApp(db);
    const returned = await request(app).post('/api/player/poker/lobbies/main/join').set('x-test-player', 'alice');
    expect(returned.status).toBe(200);
    expect(returned.body.lobby.players.find((player: any) => player.id === 'alice').chips).toBe(1000);
    expect((await db.get<{ tokens: number }>("SELECT tokens FROM players WHERE id='alice'"))?.tokens).toBe(4000);
  });

  it('keeps bot training private and never touches another human wallet', async () => {
    const app = testApp(db);
    const training = await request(app).post('/api/player/poker/lobbies').set('x-test-player', 'alice').send({ training: true });
    expect(training.status).toBe(201);
    expect(training.body.lobby.money_mode).toBe('training');
    expect(training.body.lobby.players.some((player: any) => player.is_bot)).toBe(true);
    expect((await db.get<{ tokens: number }>("SELECT tokens FROM players WHERE id='alice'"))?.tokens).toBe(5000);

    const tableId = training.body.lobby.id;
    const bobJoin = await request(app).post(`/api/player/poker/lobbies/${tableId}/join`).set('x-test-player', 'bob');
    expect(bobJoin.status).toBe(409);
    expect(bobJoin.body.error).toContain('Тренировка приватная');
    expect((await db.get<{ tokens: number }>("SELECT tokens FROM players WHERE id='bob'"))?.tokens).toBe(5000);

    const bobList = await request(app).get('/api/player/poker/lobbies').set('x-test-player', 'bob');
    expect(bobList.body.lobbies.some((lobby: any) => lobby.id === tableId)).toBe(false);
    const aliceList = await request(app).get('/api/player/poker/lobbies').set('x-test-player', 'alice');
    expect(aliceList.body.lobbies.some((lobby: any) => lobby.id === tableId)).toBe(true);
  });

  it('never adds bots to a live token table, even when only one human is waiting', async () => {
    const app = testApp(db);
    const created = await request(app).post('/api/player/poker/lobbies').set('x-test-player', 'alice').send({ title: 'Живой стол' });
    expect(created.status).toBe(201);
    const tableId = created.body.lobby.id;
    expect((await db.get<{ tokens: number }>("SELECT tokens FROM players WHERE id='alice'"))?.tokens).toBe(4000);

    const bot = await request(app).post(`/api/player/poker/lobbies/${tableId}/bot`).set('x-test-player', 'alice');
    expect(bot.status).toBe(409);
    expect(bot.body.error).toContain('Боты доступны только в тренировке');
    expect((await db.get<{ tokens: number }>("SELECT tokens FROM players WHERE id='alice'"))?.tokens).toBe(4000);
  });

  it('allows a 10 BB buy-in and rejects anything below 200 tokens', async () => {
    await db.run("UPDATE players SET tokens = 500 WHERE id = 'alice'");
    const app = testApp(db);

    const joined = await request(app).post('/api/player/poker/lobbies/main/join').set('x-test-player', 'alice').send({ buy_in_tokens: 200 });
    expect(joined.status).toBe(200);
    expect(joined.body.lobby.players.find((player: any) => player.id === 'alice').chips).toBe(200);
    expect((await db.get<{ tokens: number }>("SELECT tokens FROM players WHERE id='alice'"))?.tokens).toBe(300);

    expect((await request(app).post('/api/player/poker/lobbies/main/leave').set('x-test-player', 'alice')).status).toBe(200);
    expect((await db.get<{ tokens: number }>("SELECT tokens FROM players WHERE id='alice'"))?.tokens).toBe(500);

    const tooSmall = await request(app).post('/api/player/poker/lobbies/main/join').set('x-test-player', 'alice').send({ buy_in_tokens: 199 });
    expect(tooSmall.status).toBe(400);
    expect(tooSmall.body.error).toContain('200');
    expect(tooSmall.body.error).toContain('10 ББ');
    expect((await db.get<{ tokens: number }>("SELECT tokens FROM players WHERE id='alice'"))?.tokens).toBe(500);
    resetPokerRuntimeCacheForTesting(db);
    const table = await request(testApp(db)).get('/api/player/poker/lobbies/main').set('x-test-player', 'alice');
    expect(table.body.lobby.players).toHaveLength(0);
  });

  it('does not reveal a clubmate private training session in invite availability', async () => {
    const app = testApp(db);
    const live = await request(app).post('/api/player/poker/lobbies').set('x-test-player', 'alice').send({ title: 'Живой стол' });
    expect(live.status).toBe(201);

    const training = await request(app).post('/api/player/poker/lobbies').set('x-test-player', 'bob').send({ training: true });
    expect(training.status).toBe(201);
    expect(training.body.lobby.money_mode).toBe('training');

    const candidates = await request(app).get('/api/player/poker/invite-candidates').set('x-test-player', 'alice');
    expect(candidates.status).toBe(200);
    expect(candidates.body.candidates).toEqual(expect.arrayContaining([
      expect.objectContaining({ player_id: 'bob', at_table: false, at_table_title: null, can_invite: true }),
    ]));
    expect(JSON.stringify(candidates.body)).not.toContain('Тренировка');

    const invited = await request(app).post(`/api/player/poker/lobbies/${live.body.lobby.id}/invite`).set('x-test-player', 'alice').send({ playerId: 'bob' });
    expect(invited.status).toBe(200);
    expect(invited.body.invite.target_player_id).toBe('bob');
  });

  it('invites a clubmate to the exact live lobby with a two-minute cooldown', async () => {
    const app = testApp(db);
    const created = await request(app).post('/api/player/poker/lobbies').set('x-test-player', 'alice').send({ title: 'Позови друзей' });
    expect(created.status).toBe(201);
    const tableId = created.body.lobby.id;

    const candidates = await request(app).get('/api/player/poker/invite-candidates').set('x-test-player', 'alice');
    expect(candidates.status).toBe(200);
    expect(candidates.body.candidates).toEqual(expect.arrayContaining([
      expect.objectContaining({ player_id: 'bob', telegram_linked: true, can_invite: true }),
    ]));

    const invited = await request(app).post(`/api/player/poker/lobbies/${tableId}/invite`).set('x-test-player', 'alice').send({ playerId: 'bob' });
    expect(invited.status).toBe(200);
    expect(invited.body.invite.cooldown_seconds).toBe(120);
    expect((await db.get<{ tokens: number }>("SELECT tokens FROM players WHERE id='bob'"))?.tokens).toBe(5000);

    const queued = await db.get<any>("SELECT event_type,player_id,text FROM telegram_message_outbox WHERE player_id='bob' LIMIT 1");
    expect(queued).toMatchObject({ event_type: 'poker_invite', player_id: 'bob' });
    expect(queued.text).toContain('Позови друзей');

    const again = await request(app).post(`/api/player/poker/lobbies/${tableId}/invite`).set('x-test-player', 'alice').send({ playerId: 'bob' });
    expect(again.status).toBe(429);
    expect(again.body.code).toBe('cooldown');
    expect(again.body.retry_after_seconds).toBeGreaterThan(0);
    expect(again.body.retry_after_seconds).toBeLessThanOrEqual(120);
  });

  it('returns a live table stack to the wallet when an AFK seat is removed', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-07T12:00:00Z'));
    const app = testApp(db);
    expect((await request(app).post('/api/player/poker/lobbies/main/join').set('x-test-player', 'alice')).status).toBe(200);
    expect((await db.get<{ tokens: number }>("SELECT tokens FROM players WHERE id='alice'"))?.tokens).toBe(4000);

    vi.advanceTimersByTime(6 * 60 * 1000);
    expect((await request(app).get('/api/player/poker/lobbies').set('x-test-player', 'bob')).status).toBe(200);
    expect((await db.get<{ tokens: number }>("SELECT tokens FROM players WHERE id='alice'"))?.tokens).toBe(5000);
    const ledger = await db.all<{ reason_type: string; amount: number }>(
      "SELECT reason_type, amount FROM token_ledger WHERE player_id='alice' ORDER BY rowid ASC",
    );
    expect(ledger.map((entry) => [entry.reason_type, entry.amount])).toEqual([
      ['poker_buy_in', -1000],
      ['poker_cash_out', 1000],
    ]);
  });

  it('does not let one account duplicate its saved stack at two tables', async () => {
    const app = testApp(db);
    expect((await request(app).post('/api/player/poker/lobbies/main/join').set('x-test-player', 'alice')).status).toBe(200);
    const duplicate = await request(app).post('/api/player/poker/lobbies').set('x-test-player', 'alice').send({ title: 'Второй стол' });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error).toContain('уже сидите за другим столом');
  });
});
