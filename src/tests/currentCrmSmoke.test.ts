import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../app';
import { createDatabaseConnection } from '../db/index';
import { generateOrganizerToken } from '../server/auth';

describe('current CRM smoke flow', () => {
  it('creates a manual novice profile and can add it to an organizer evening', async () => {
    const db = createDatabaseConnection(':memory:');
    const app = await createApp(db);
    const cookie = `organizer_token=${generateOrganizerToken()}`;

    const player = await request(app)
      .post('/api/players')
      .set('Cookie', cookie)
      .send({ nickname: 'Smoke_Player' });
    expect(player.status, JSON.stringify(player.body)).toBe(201);
    expect(player.body.game_level).toBe('novice');

    const evening = await request(app)
      .post('/api/evenings')
      .set('Cookie', cookie)
      .send({
        title: 'Smoke evening',
        starts_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        format: 'STANDARD',
        default_price: 500,
      });
    expect(evening.status, JSON.stringify(evening.body)).toBe(201);

    const bulk = await request(app)
      .post(`/api/evenings/${evening.body.id}/participants/bulk`)
      .set('Cookie', cookie)
      .send({
        player_ids: [player.body.id],
        registration_status: 'confirmed',
        amount_due: 500,
      });
    expect(bulk.status, JSON.stringify(bulk.body)).toBe(200);
    expect(bulk.body.addedCount).toBe(1);
  });
});
