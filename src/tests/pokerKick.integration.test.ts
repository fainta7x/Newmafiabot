import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { PRIMARY_ORGANIZER_PLAYER_ID } from '../db/ensureOrganizerPlayerAccessSchema.ts';
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

describe('only the club owner takes people off a poker table', () => {
  let db: DatabaseWrapper;
  beforeEach(async () => {
    resetPokerRuntimeCacheForTesting();
    db = createDatabaseConnection(':memory:');
    const now = new Date().toISOString();
    await db.run(
      `INSERT OR IGNORE INTO players (id,nickname,created_at,updated_at) VALUES (?,?,?,?),('bob','Боб',?,?)`,
      [PRIMARY_ORGANIZER_PLAYER_ID, 'Владелец', now, now, now, now],
    );
  });

  it('refuses everybody else and lets the owner kick a person', async () => {
    const app = testApp(db);
    const join = (who: string) => request(app).post('/api/player/poker/lobbies/main/join').set('x-test-player', who);
    expect((await join(PRIMARY_ORGANIZER_PLAYER_ID)).status).toBe(200);
    expect((await join('bob')).status).toBe(200);

    const asBob = await request(app).get('/api/player/poker/lobbies/main').set('x-test-player', 'bob');
    expect(asBob.body.lobby.can_kick).toBe(false);
    const asOwner = await request(app).get('/api/player/poker/lobbies/main').set('x-test-player', PRIMARY_ORGANIZER_PLAYER_ID);
    expect(asOwner.body.lobby.can_kick).toBe(true);

    const refused = await request(app).post('/api/player/poker/lobbies/main/kick').set('x-test-player', 'bob').send({ playerId: PRIMARY_ORGANIZER_PLAYER_ID });
    expect(refused.status).toBe(403);

    const kicked = await request(app).post('/api/player/poker/lobbies/main/kick').set('x-test-player', PRIMARY_ORGANIZER_PLAYER_ID).send({ playerId: 'bob' });
    expect(kicked.status).toBe(200);
    expect(kicked.body.lobby.players.map((player: any) => player.id)).not.toContain('bob');
    expect(kicked.body.lobby.players.map((player: any) => player.id)).toContain(PRIMARY_ORGANIZER_PLAYER_ID);

    const again = await request(app).post('/api/player/poker/lobbies/main/kick').set('x-test-player', PRIMARY_ORGANIZER_PLAYER_ID).send({ playerId: 'bob' });
    expect(again.status).toBe(409);
  });
});
