import { afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.ts';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { generatePlayerSessionToken } from '../server/auth.ts';
import { registerNewPlayer } from '../server/services/playerRegistrationService.ts';

const opened: DatabaseWrapper[] = [];
afterEach(() => { while (opened.length) opened.pop()?.sqlite.close(); });

describe('GUEST-PLAYER-001 directory and profile isolation', () => {
  it('hides archived migrated guest rows from the player directory and profile routes', async () => {
    const db = createDatabaseConnection(':memory:');
    opened.push(db);
    const app = await createApp(db);
    const viewer = (await registerNewPlayer(db, { telegramUserId: '801', nickname: 'Зритель' })).player;
    const guest = (await registerNewPlayer(db, { telegramUserId: '802', nickname: 'Старый гость' })).player;
    await db.run("UPDATE players SET source = 'legacy_guest_migrated', telegram_user_id = NULL WHERE id = ?", [guest.id]);
    const cookie = `player_token=${generatePlayerSessionToken(viewer.id)}`;

    const directory = await request(app).get('/api/player/players').set('Cookie', cookie);
    expect(directory.status).toBe(200);
    expect(directory.body.players.map((row: any) => row.id)).toEqual([viewer.id]);

    expect((await request(app).get(`/api/player/players/${guest.id}`).set('Cookie', cookie)).status).toBe(404);
    expect((await request(app).get(`/api/public/players/${guest.id}/profile`)).status).toBe(404);
    for (const section of ['summary', 'games', 'roles', 'elo', 'showcase', 'connections', 'birthday']) {
      const response = await request(app).get(`/api/player/profiles/${guest.id}/${section}`).set('Cookie', cookie);
      expect([section, response.status]).toEqual([section, 404]);
    }
    expect((await request(app).get(`/api/player/profiles/${viewer.id}/summary`).set('Cookie', cookie)).status).toBe(200);
    expect((await request(app).get(`/api/public/players/${viewer.id}/profile`)).status).toBe(200);
  });
});
