import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.ts';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { generateOrganizerToken } from '../server/auth.ts';

describe('club evening game creation', () => {
  let app: any;
  let db: DatabaseWrapper;
  let cookie: string;
  const playerIds: string[] = [];

  beforeAll(async () => {
    db = createDatabaseConnection(':memory:');
    app = await createApp(db);
    cookie = `organizer_token=${generateOrganizerToken()}`;

    for (let index = 1; index <= 10; index += 1) {
      const response = await request(app)
        .post('/api/players')
        .set('Cookie', cookie)
        .send({ nickname: `GameDay_${index}`, lifecycle_status: 'normal' });
      expect(response.status).toBe(201);
      playerIds.push(String(response.body.id));
    }
  });

  const createEveningWithRoster = async (title: string) => {
    const eveningResponse = await request(app)
      .post('/api/evenings')
      .set('Cookie', cookie)
      .send({
        title,
        starts_at: '2026-08-14T20:00:00+03:00',
        timezone: 'Europe/Moscow',
        format: 'CASUAL',
        status: 'published',
        capacity: 20,
        default_price: 100,
      });
    expect(eveningResponse.status).toBe(201);
    const eveningId = String(eveningResponse.body.id);

    const rosterResponse = await request(app)
      .post(`/api/evenings/${eveningId}/participants/bulk`)
      .set('Cookie', cookie)
      .send({ player_ids: playerIds, response_status: 'going', amount_due: 100 });
    expect(rosterResponse.status).toBe(200);

    const participantsResponse = await request(app)
      .get(`/api/evenings/${eveningId}/participants`)
      .set('Cookie', cookie);
    expect(participantsResponse.status).toBe(200);
    expect(participantsResponse.body).toHaveLength(10);

    return { eveningId, participants: participantsResponse.body as any[] };
  };

  it('creates an exact ten-seat draft and atomically activates a published evening', async () => {
    const { eveningId, participants } = await createEveningWithRoster('Game day success');

    for (const participant of participants) {
      const response = await request(app)
        .patch(`/api/evening-participants/${participant.id}`)
        .set('Cookie', cookie)
        .send({ attendance_fact: 'attended_on_time' });
      expect(response.status).toBe(200);
    }

    const gameResponse = await request(app)
      .post(`/api/games/evening/${eveningId}`)
      .set('Cookie', cookie)
      .send({
        judge_name: 'Ведущий',
        seats: participants.map((participant, index) => ({
          participant_id: participant.id,
          seat_number: index + 1,
        })),
      });

    expect(gameResponse.status).toBe(201);
    expect(gameResponse.body.status).toBe('draft');
    expect(gameResponse.body.club_protocol?.player_results).toHaveLength(10);
    expect(gameResponse.body.club_protocol?.player_results.map((row: any) => row.seat_number)).toEqual([1,2,3,4,5,6,7,8,9,10]);

    const evening = await db.get<any>('SELECT status FROM game_evenings WHERE id = ?', [eveningId]);
    expect(evening?.status).toBe('active');
    const games = await db.all<any>('SELECT id FROM games WHERE evening_id = ?', [eveningId]);
    expect(games).toHaveLength(1);
  });

  it('does not activate or create a partial game when one selected player is not marked present', async () => {
    const { eveningId, participants } = await createEveningWithRoster('Game day rejected lineup');

    for (const participant of participants.slice(0, 9)) {
      const response = await request(app)
        .patch(`/api/evening-participants/${participant.id}`)
        .set('Cookie', cookie)
        .send({ attendance_fact: 'attended_on_time' });
      expect(response.status).toBe(200);
    }

    const gameResponse = await request(app)
      .post(`/api/games/evening/${eveningId}`)
      .set('Cookie', cookie)
      .send({
        judge_name: 'Ведущий',
        seats: participants.map((participant, index) => ({
          participant_id: participant.id,
          seat_number: index + 1,
        })),
      });

    expect(gameResponse.status).toBe(400);
    expect(gameResponse.body.error).toContain('фактически пришедших');
    const evening = await db.get<any>('SELECT status FROM game_evenings WHERE id = ?', [eveningId]);
    expect(evening?.status).toBe('published');
    const games = await db.all<any>('SELECT id FROM games WHERE evening_id = ?', [eveningId]);
    expect(games).toHaveLength(0);
  });

  it('rejects game creation before publication', async () => {
    const eveningResponse = await request(app)
      .post('/api/evenings')
      .set('Cookie', cookie)
      .send({
        title: 'Draft evening',
        starts_at: '2026-08-14T20:00:00+03:00',
        format: 'CASUAL',
        status: 'draft',
        capacity: 20,
        default_price: 100,
      });
    expect(eveningResponse.status).toBe(201);

    const response = await request(app)
      .post(`/api/games/evening/${eveningResponse.body.id}`)
      .set('Cookie', cookie)
      .send({ seats: [] });

    expect(response.status).toBe(409);
    expect(response.body.error).toContain('опубликуйте вечер');
  });
});
