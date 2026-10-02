import cookieParser from 'cookie-parser';
import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { generatePlayerSessionToken } from '../server/auth.ts';
import pokerRoutes from '../server/routes/pokerRoutes.ts';
import { resetPokerRuntimeCacheForTesting } from '../server/services/pokerPersistenceService.ts';

const cookie = (playerId: string) => `player_token=${generatePlayerSessionToken(playerId)}`;
const testApp = (db: DatabaseWrapper) => {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use((req, _res, next) => { req.db = db; next(); });
  app.use('/api/player', pokerRoutes);
  return app;
};

describe('durable poker chips and table state', () => {
  let db: DatabaseWrapper;

  beforeEach(async () => {
    resetPokerRuntimeCacheForTesting();
    db = createDatabaseConnection(':memory:');
    const now = new Date().toISOString();
    await db.run(
      `INSERT INTO players (id,nickname,created_at,updated_at) VALUES ('alice','Алиса',?,?),('bob','Боб',?,?)`,
      [now, now, now, now],
    );
  });

  it('restores an in-progress hand from SQLite after a fresh server runtime', async () => {
    let app = testApp(db);
    expect((await request(app).post('/api/player/poker/lobbies/main/join').set('Cookie', cookie('alice'))).status).toBe(200);
    const started = await request(app).post('/api/player/poker/lobbies/main/join').set('Cookie', cookie('bob'));
    expect(started.status).toBe(200);
    const hand = started.body.lobby.hand;
    const current = hand.players.find((player: any) => player.seat === hand.current_seat);
    const action = hand.current_bet > current.committed ? { type: 'call' } : { type: 'check' };
    const acted = await request(app).post('/api/player/poker/lobbies/main/action').set('Cookie', cookie(current.id)).send(action);
    expect(acted.status).toBe(200);
    const beforeRestart = acted.body.lobby.hand;
    expect((await db.get(`SELECT id FROM poker_runtime_state WHERE id='main'`))).toEqual({ id: 'main' });

    // A new Node process has no Map state and must reconstruct the exact hand from SQLite.
    resetPokerRuntimeCacheForTesting(db);
    app = testApp(db);
    const restored = await request(app).get('/api/player/poker/lobbies/main').set('Cookie', cookie('alice'));
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

  it('returns a human player with the same stack after leaving and after another restart', async () => {
    let app = testApp(db);
    await request(app).post('/api/player/poker/lobbies/main/join').set('Cookie', cookie('alice'));
    const started = await request(app).post('/api/player/poker/lobbies/main/join').set('Cookie', cookie('bob'));
    const aliceBefore = started.body.lobby.hand.players.find((player: any) => player.id === 'alice').chips;

    expect((await request(app).post('/api/player/poker/lobbies/main/leave').set('Cookie', cookie('alice'))).status).toBe(200);
    resetPokerRuntimeCacheForTesting(db);
    app = testApp(db);
    const returned = await request(app).post('/api/player/poker/lobbies/main/join').set('Cookie', cookie('alice'));
    expect(returned.status).toBe(200);
    expect(returned.body.lobby.players.find((player: any) => player.id === 'alice').chips).toBe(aliceBefore);

    resetPokerRuntimeCacheForTesting(db);
    const afterSecondRestart = await request(testApp(db)).get('/api/player/poker/lobbies/main').set('Cookie', cookie('alice'));
    expect(afterSecondRestart.body.lobby.players.find((player: any) => player.id === 'alice').chips).toBe(aliceBefore);
  });

  it('does not let one account duplicate its saved stack at two tables', async () => {
    const app = testApp(db);
    expect((await request(app).post('/api/player/poker/lobbies/main/join').set('Cookie', cookie('alice'))).status).toBe(200);
    const duplicate = await request(app).post('/api/player/poker/lobbies').set('Cookie', cookie('alice')).send({ title: 'Второй стол' });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error).toContain('уже сидите за другим столом');
  });
});
