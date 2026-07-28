import { describe, it, expect, beforeAll } from 'vitest';
import express from 'express';
import request from 'supertest';
import cookieParser from 'cookie-parser';

import authRoutes from '../server/routes/authRoutes.ts';
import eveningsRoutes from '../server/routes/eveningsRoutes.ts';
import participantRoutes from '../server/routes/participantRoutes.ts';
import playersRoutes from '../server/routes/playersRoutes.ts';
import tasksRoutes from '../server/routes/tasksRoutes.ts';
import analyticsRoutes from '../server/routes/analyticsRoutes.ts';
import { parseUserSession, generateOrganizerToken } from '../server/auth.ts';
import { getDb, initializeDatabase } from '../db/index.ts';

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use(parseUserSession);

app.use('/api/auth', authRoutes);
app.use('/api/evenings', eveningsRoutes);
app.use('/api/evening-participants', participantRoutes);
app.use('/api/players', playersRoutes);
app.use('/api/tasks', tasksRoutes);
app.use('/api/analytics', analyticsRoutes);

describe('Newmafia CRM Integration Tests', () => {
  let organizerToken: string;
  let createdEveningId: string;
  let testPlayerIds: string[] = [];

  beforeAll(async () => {
    organizerToken = generateOrganizerToken();

    await initializeDatabase();

    const timestamp = Date.now();

    // Create 3 test players via API with unique nicknames
    const p1 = await request(app)
      .post('/api/players')
      .set('Authorization', `Bearer ${organizerToken}`)
      .send({ nickname: `TestPlayer_${timestamp}_1`, phone: '+79991112233' });

    const p2 = await request(app)
      .post('/api/players')
      .set('Authorization', `Bearer ${organizerToken}`)
      .send({ nickname: `TestPlayer_${timestamp}_2`, phone: '+79991112234' });

    const p3 = await request(app)
      .post('/api/players')
      .set('Authorization', `Bearer ${organizerToken}`)
      .send({ nickname: `TestPlayer_${timestamp}_3`, phone: '+79991112235' });

    testPlayerIds = [p1.body.id, p2.body.id, p3.body.id];
  });

  it('1. POST /api/evenings - should create a new game evening', async () => {
    const res = await request(app)
      .post('/api/evenings')
      .set('Authorization', `Bearer ${organizerToken}`)
      .send({
        title: 'Тестовый вечер Пятница',
        starts_at: '2026-08-01T19:00:00.000Z',
        format: 'STANDARD',
        capacity: 20,
        default_price: 500,
      });

    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.title).toBe('Тестовый вечер Пятница');
    createdEveningId = res.body.id;
  });

  it('2. POST /api/evenings/:id/participants/bulk - should bulk add players to evening', async () => {
    const res = await request(app)
      .post(`/api/evenings/${createdEveningId}/participants/bulk`)
      .set('Authorization', `Bearer ${organizerToken}`)
      .send({
        player_ids: testPlayerIds,
        registration_status: 'confirmed',
        amount_due: 500,
      });

    if (res.status !== 200) {
      console.log('BULK ADD ERROR:', res.body);
    }

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.addedCount).toBe(3);
  });

  it('3. PATCH /api/evening-participants/:id - should update participant attendance and payment', async () => {
    const eveningRes = await request(app).get(`/api/evenings/${createdEveningId}/participants`);
    const participants = eveningRes.body;
    expect(participants.length).toBe(3);

    const part1 = participants[0];

    const patchRes = await request(app)
      .patch(`/api/evening-participants/${part1.id}`)
      .set('Authorization', `Bearer ${organizerToken}`)
      .send({
        attendance_status: 'attended',
        amount_paid: 500,
      });

    expect(patchRes.status).toBe(200);
    expect(patchRes.body.attendance_status).toBe('attended');
    expect(patchRes.body.payment_status).toBe('paid');
  });

  it('4. POST /api/evenings/:id/settle - should idempotently settle evening without duplicating transactions', async () => {
    // First settlement call
    const res1 = await request(app)
      .post(`/api/evenings/${createdEveningId}/settle`)
      .set('Authorization', `Bearer ${organizerToken}`);

    expect(res1.status).toBe(200);
    expect(res1.body.success).toBe(true);
    expect(res1.body.alreadySettled).toBe(false);

    // Second settlement call (idempotency check)
    const res2 = await request(app)
      .post(`/api/evenings/${createdEveningId}/settle`)
      .set('Authorization', `Bearer ${organizerToken}`);

    expect(res2.status).toBe(200);
    expect(res2.body.alreadySettled).toBe(true);
  });

  it('5. GET /api/analytics - should return calculated club metrics', async () => {
    const res = await request(app).get('/api/analytics');
    expect(res.status).toBe(200);
    expect(res.body.totalPlayers).toBeGreaterThanOrEqual(3);
    expect(res.body.totalEvenings).toBeGreaterThanOrEqual(1);
  });
});
