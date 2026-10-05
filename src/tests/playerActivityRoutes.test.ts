import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../app';
import { createDatabaseConnection } from '../db/index';
import { generateOrganizerToken, generatePlayerSessionToken } from '../server/auth';

describe('per-player app activity', () => {
  let app: any;
  beforeAll(async () => { app = await createApp(createDatabaseConnection(':memory:')); });

  it('attaches the signed-in player to his events and shows them to the organizer only', async () => {
    const player = `player_token=${generatePlayerSessionToken('p-activity')}`;
    await request(app).post('/api/ui-events').set('Cookie', player).send({
      session: 'tab-dddd-4444', surface: 'player',
      events: [{ kind: 'screen', name: '/player/games' }, { kind: 'action', name: 'player-nav-games' }],
    }).expect(204);

    expect((await request(app).get('/api/ui-events/players/p-activity')).status).toBe(401);
    expect((await request(app).get('/api/ui-events/players/p-activity').set('Cookie', player)).status).toBeGreaterThanOrEqual(401);

    const organizer = `organizer_token=${generateOrganizerToken()}`;
    const response = await request(app).get('/api/ui-events/players/p-activity').set('Cookie', organizer);
    expect(response.status).toBe(200);
    expect(response.body.visits.total).toBe(1);
    expect(response.body.top_screens[0]).toMatchObject({ name: '/player/games', opens: 1 });
    expect(response.body.top_actions[0]).toMatchObject({ name: 'player-nav-games', count: 1 });
  });
});
