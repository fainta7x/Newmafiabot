import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.ts';
import { createDatabaseConnection, DatabaseWrapper } from '../db/index.ts';
import { generateOrganizerToken } from '../server/auth.ts';

describe('Newmafia CRM In-Memory Integration Tests', () => {
  let app: any;
  let db: DatabaseWrapper;
  let organizerCookie: string;
  let testPlayer1Id: string;
  let testPlayer10: string[] = [];
  let eveningId: string;

  beforeAll(async () => {
    // 1. Isolated in-memory database for testing
    db = createDatabaseConnection(':memory:');
    app = await createApp(db);

    const token = generateOrganizerToken();
    organizerCookie = `organizer_token=${token}`;

    // Create 10 test players for full mafia game protocol testing
    for (let i = 1; i <= 10; i++) {
      const pRes = await request(app)
        .post('/api/players')
        .set('Cookie', organizerCookie)
        .send({
          nickname: `Игрок_${i}`,
          phone: `+7999000000${i}`,
          lifecycle_status: 'newcomer',
        });
      testPlayer10.push(pRes.body.id);
    }
    testPlayer1Id = testPlayer10[0];
  });

  describe('P0 Security & Access Control', () => {
    it('should reject unauthorized access to protected routes without cookie', async () => {
      const res = await request(app).post('/api/evenings').send({
        title: 'Неавторизованный вечер',
        starts_at: '2026-08-01T19:00:00Z',
      });
      expect(res.status).toBe(401);
      expect(res.body.error).toContain('Доступ запрещён');
    });

    it('should allow authorized organizer with HttpOnly cookie', async () => {
      const res = await request(app)
        .post('/api/evenings')
        .set('Cookie', organizerCookie)
        .send({
          title: 'Официальный вечер Пятница',
          starts_at: '2026-07-01T19:00:00.000Z',
          format: 'STANDARD',
          capacity: 12,
          default_price: 500,
        });

      expect(res.status).toBe(201);
      expect(res.body.id).toBeDefined();
      eveningId = res.body.id;
    });
  });

  describe('P0 Evening Capacity & Bulk Registration', () => {
    it('should register participants up to capacity', async () => {
      const res = await request(app)
        .post(`/api/evenings/${eveningId}/participants/bulk`)
        .set('Cookie', organizerCookie)
        .send({
          player_ids: testPlayer10,
          registration_status: 'confirmed',
          amount_due: 500,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.addedCount).toBe(10);
    });

    it('should calculate debt and update payment status', async () => {
      const participantsRes = await request(app)
        .get(`/api/evenings/${eveningId}/participants`)
        .set('Cookie', organizerCookie);
      const participant1 = participantsRes.body[0];

      const patchRes = await request(app)
        .patch(`/api/evening-participants/${participant1.id}`)
        .set('Cookie', organizerCookie)
        .send({
          attendance_status: 'attended',
          amount_paid: 500,
        });

      expect(patchRes.status).toBe(200);
      expect(patchRes.body.payment_status).toBe('paid');
      expect(patchRes.body.amount_due).toBe(500);
      expect(patchRes.body.amount_paid).toBe(500);
    });
  });

  describe('P0 Game Protocol & ELO/Tokens Recalculation', () => {
    it('should save game protocol and update players ELO & tokens', async () => {
      const initialP1 = await request(app)
        .get(`/api/players/${testPlayer1Id}`)
        .set('Cookie', organizerCookie);
      const initialElo1 = initialP1.body.elo || 1000;

      const slots = testPlayer10.map((pId, idx) => ({
        slot: idx + 1,
        player_id: pId,
        nickname: `Игрок_${idx + 1}`,
        role: idx === 0 ? 'Мафия' : idx === 1 ? 'Дон' : idx === 2 ? 'Шериф' : 'Мирный',
        fouls: 0,
      }));

      const gameRes = await request(app)
        .post('/api/games')
        .set('Cookie', organizerCookie)
        .send({
          evening_id: eveningId,
          global_game_number: 1,
          game_date: '2026-08-01',
          winner_team: 'RED',
          winner_label: 'Красные',
          judge_name: 'Судья_Алекс',
          slots,
        });

      expect(gameRes.status).toBe(201);
      expect(gameRes.body.id).toBeDefined();

      // Check player 1 (Red win, but player 1 was Mafia -> Loss)
      const updatedP1 = await request(app)
        .get(`/api/players/${testPlayer1Id}`)
        .set('Cookie', organizerCookie);
      expect(updatedP1.body.elo).toBe(initialElo1 - 10);

      // Check player 3 (Sheriff -> Red win -> Win -> ELO +15, tokens +1)
      const updatedP3 = await request(app)
        .get(`/api/players/${testPlayer10[2]}`)
        .set('Cookie', organizerCookie);
      expect(updatedP3.body.elo).toBe(1015);
      expect(updatedP3.body.tokens).toBe(1);
    });
  });

  describe('P0 Idempotent Evening Settlement', () => {
    it('should settle evening finances and create ledger transactions', async () => {
      // Set all participants to attended before closing evening
      const participantsRes = await request(app)
        .get(`/api/evenings/${eveningId}/participants`)
        .set('Cookie', organizerCookie);

      const bulkUpdates = (participantsRes.body || []).map((p: any) => ({
        id: p.id,
        attendance_status: 'attended',
        amount_paid: 500,
      }));

      await request(app)
        .patch(`/api/evenings/${eveningId}/participants/bulk`)
        .set('Cookie', organizerCookie)
        .send({ updates: bulkUpdates });

      const res1 = await request(app)
        .post(`/api/evenings/${eveningId}/settle`)
        .set('Cookie', organizerCookie);

      expect(res1.status).toBe(200);
      expect(res1.body.success).toBe(true);
      expect(res1.body.alreadySettled).toBe(false);

      // Verify second call does not duplicate
      const res2 = await request(app)
        .post(`/api/evenings/${eveningId}/settle`)
        .set('Cookie', organizerCookie);

      expect(res2.status).toBe(200);
      expect(res2.body.alreadySettled).toBe(true);
    });
  });

  describe('P1 Analytics & Cohort Retention', () => {
    it('should return analytics metrics based on real transactions', async () => {
      const res = await request(app)
        .get('/api/analytics?period=all')
        .set('Cookie', organizerCookie);
      expect(res.status).toBe(200);
      expect(res.body.totalPlayers).toBe(10);
      expect(res.body.completedEvenings).toBe(1);
      expect(res.body.financials).toBeDefined();
    });
  });
});
