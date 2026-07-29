import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.ts';
import { createDatabaseConnection, DatabaseWrapper } from '../db/index.ts';
import { generateOrganizerToken } from '../server/auth.ts';
import { runCrmAutomations } from '../server/services/crmAutomationService.ts';
import { formatEveningDateTime, getSortedFutureEvenings } from '../lib/dateUtils.ts';

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
          lifecycle_status: 'normal',
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

  describe('P2 Tables Management Integration Tests', () => {
    let activeEveningId: string;
    let completedEveningId: string;
    let table1Id: string;
    let table2Id: string;
    let testPlayerId1: string;
    let testPlayerId2: string;

    beforeAll(async () => {
      // Create a fresh active evening for testing
      const evRes1 = await request(app)
        .post('/api/evenings')
        .set('Cookie', organizerCookie)
        .send({
          title: 'Активный вечер',
          starts_at: '2026-08-10T19:00:00.000Z',
          format: 'STANDARD',
          capacity: 20,
          default_price: 500,
        });
      activeEveningId = evRes1.body.id;

      // Create a completed evening for completed evening protection testing
      const evRes2 = await request(app)
        .post('/api/evenings')
        .set('Cookie', organizerCookie)
        .send({
          title: 'Завершенный вечер',
          starts_at: '2026-08-05T19:00:00.000Z',
          format: 'STANDARD',
          capacity: 20,
          default_price: 500,
          status: 'completed',
        });
      completedEveningId = evRes2.body.id;

      // Get some player IDs from previous setups
      testPlayerId1 = testPlayer10[0];
      testPlayerId2 = testPlayer10[1];
    });

    it('1. should create a table successfully', async () => {
      const res = await request(app)
        .post(`/api/evenings/${activeEveningId}/tables`)
        .set('Cookie', organizerCookie)
        .send({
          name: 'Основной стол 1',
          format: 'STANDARD',
          capacity: 10,
          host_name: 'Ведущий 1',
          default_price: 500,
        });

      expect(res.status).toBe(201);
      expect(res.body.id).toBeDefined();
      expect(res.body.name).toBe('Основной стол 1');
      table1Id = res.body.id;
    });

    it('2. should edit a table successfully', async () => {
      const res = await request(app)
        .put(`/api/evenings/tables/${table1Id}`)
        .set('Cookie', organizerCookie)
        .send({
          name: 'Обновленный стол 1',
          format: 'STANDARD',
          capacity: 12,
          host_name: 'Обновленный Ведущий',
          default_price: 600,
        });

      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Обновленный стол 1');
      expect(res.body.capacity).toBe(12);
    });

    it('3. should bulk add and preserve table_id', async () => {
      // Register test player 1 and 2 directly to table 1
      const res = await request(app)
        .post(`/api/evenings/${activeEveningId}/participants/bulk`)
        .set('Cookie', organizerCookie)
        .send({
          player_ids: [testPlayerId1, testPlayerId2],
          table_id: table1Id,
          registration_status: 'confirmed',
          amount_due: 500,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      
      // Load participant and verify they have the table_id set
      const partsRes = await request(app)
        .get(`/api/evenings/${activeEveningId}/participants`)
        .set('Cookie', organizerCookie);

      const p1 = partsRes.body.find((p: any) => p.player_id === testPlayerId1);
      expect(p1).toBeDefined();
      expect(p1.table_id).toBe(table1Id);
    });

    it('4. should block cross-evening table assignment', async () => {
      // Create another active evening
      const otherEvRes = await request(app)
        .post('/api/evenings')
        .set('Cookie', organizerCookie)
        .send({
          title: 'Другой вечер',
          starts_at: '2026-08-15T19:00:00.000Z',
          format: 'STANDARD',
          capacity: 20,
          default_price: 500,
        });
      const otherEveningId = otherEvRes.body.id;

      // Create a table on that other evening
      const tblRes = await request(app)
        .post(`/api/evenings/${otherEveningId}/tables`)
        .set('Cookie', organizerCookie)
        .send({
          name: 'Второй вечер стол',
          format: 'STANDARD',
          capacity: 10,
        });
      const otherTableId = tblRes.body.id;

      // Try assigning table of otherEveningId to participant on activeEveningId
      const partsRes = await request(app)
        .get(`/api/evenings/${activeEveningId}/participants`)
        .set('Cookie', organizerCookie);
      const activePart1 = partsRes.body.find((p: any) => p.player_id === testPlayerId1);

      const moveRes = await request(app)
        .patch(`/api/evenings/participants/${activePart1.id}/move-table`)
        .set('Cookie', organizerCookie)
        .send({ table_id: otherTableId });

      expect(moveRes.status).toBe(400);
      expect(moveRes.body.error).toContain('принадлежит другому вечеру');
    });

    it('5. & 6. should enforce capacity limits and move overflow to waitlist', async () => {
      // Create table with capacity of 1
      const resTbl = await request(app)
        .post(`/api/evenings/${activeEveningId}/tables`)
        .set('Cookie', organizerCookie)
        .send({
          name: 'Крошечный стол',
          format: 'STANDARD',
          capacity: 1,
        });
      const tinyTableId = resTbl.body.id;

      // Find participants
      const partsRes = await request(app)
        .get(`/api/evenings/${activeEveningId}/participants`)
        .set('Cookie', organizerCookie);
      const activePart1 = partsRes.body.find((p: any) => p.player_id === testPlayerId1);
      const activePart2 = partsRes.body.find((p: any) => p.player_id === testPlayerId2);

      // Move player 1 to tiny table (capacity 1). This should succeed.
      const move1 = await request(app)
        .patch(`/api/evenings/participants/${activePart1.id}/move-table`)
        .set('Cookie', organizerCookie)
        .send({ table_id: tinyTableId });
      expect(move1.status).toBe(200);
      expect(move1.body.registration_status).toBe('confirmed'); // stays confirmed because capacity has space

      // Move player 2 to tiny table (already occupied). This should move player 2 to waitlist.
      const move2 = await request(app)
        .patch(`/api/evenings/participants/${activePart2.id}/move-table`)
        .set('Cookie', organizerCookie)
        .send({ table_id: tinyTableId });
      expect(move2.status).toBe(200);
      expect(move2.body.registration_status).toBe('waitlist'); // moved to waitlist due to capacity overflow
    });

    it('7. & 8. should bulk move players via single bulk PATCH endpoint', async () => {
      // Create a new target table
      const resTbl = await request(app)
        .post(`/api/evenings/${activeEveningId}/tables`)
        .set('Cookie', organizerCookie)
        .send({
          name: 'Новый стол для перемещения',
          format: 'STANDARD',
          capacity: 10,
        });
      table2Id = resTbl.body.id;

      const partsRes = await request(app)
        .get(`/api/evenings/${activeEveningId}/participants`)
        .set('Cookie', organizerCookie);
      const activePart1 = partsRes.body.find((p: any) => p.player_id === testPlayerId1);
      const activePart2 = partsRes.body.find((p: any) => p.player_id === testPlayerId2);

      // Bulk move both participants to table2Id
      const bulkRes = await request(app)
        .patch(`/api/evenings/${activeEveningId}/participants/bulk`)
        .set('Cookie', organizerCookie)
        .send({
          updates: [
            { id: activePart1.id, table_id: table2Id },
            { id: activePart2.id, table_id: table2Id }
          ]
        });

      expect(bulkRes.status).toBe(200);
      expect(bulkRes.body.success).toBe(true);

      const verifyRes = await request(app)
        .get(`/api/evenings/${activeEveningId}/participants`)
        .set('Cookie', organizerCookie);
      const p1 = verifyRes.body.find((p: any) => p.player_id === testPlayerId1);
      const p2 = verifyRes.body.find((p: any) => p.player_id === testPlayerId2);
      expect(p1.table_id).toBe(table2Id);
      expect(p2.table_id).toBe(table2Id);
    });

    it('9. should protect completed evening from edits', async () => {
      // Attempting to create table on completed evening
      const resCreate = await request(app)
        .post(`/api/evenings/${completedEveningId}/tables`)
        .set('Cookie', organizerCookie)
        .send({ name: 'Попытка создания', capacity: 10 });
      expect(resCreate.status).toBe(400);

      // Attempting to bulk add to completed evening
      const resAdd = await request(app)
        .post(`/api/evenings/${completedEveningId}/participants/bulk`)
        .set('Cookie', organizerCookie)
        .send({ player_ids: [testPlayerId1], registration_status: 'confirmed' });
      expect(resAdd.status).toBe(400);
    });

    it('10. should clear table_id on delete table and keep participants', async () => {
      // Delete table2Id
      const deleteRes = await request(app)
        .delete(`/api/evenings/tables/${table2Id}`)
        .set('Cookie', organizerCookie);
      expect(deleteRes.status).toBe(200);

      // Verify players table_id is set to null
      const verifyRes = await request(app)
        .get(`/api/evenings/${activeEveningId}/participants`)
        .set('Cookie', organizerCookie);
      const p1 = verifyRes.body.find((p: any) => p.player_id === testPlayerId1);
      expect(p1.table_id).toBeNull();
    });
  });

  describe('P3 Final Patch Status & Capacity Rules', () => {
    let testEveningId: string;
    let testTableId: string;
    let pIds: string[] = [];

    beforeAll(async () => {
      // Create 5 extra players
      for (let i = 101; i <= 105; i++) {
        const res = await request(app)
          .post('/api/players')
          .set('Cookie', organizerCookie)
          .send({ nickname: `ПатчИгрок_${i}`, phone: `+799911122${i}` });
        pIds.push(res.body.id);
      }

      // Create an evening
      const evRes = await request(app)
        .post('/api/evenings')
        .set('Cookie', organizerCookie)
        .send({
          title: 'Тестовый вечер P3',
          starts_at: '2026-09-01T19:00:00.000Z',
          format: 'STANDARD',
          capacity: 10,
          default_price: 500,
        });
      testEveningId = evRes.body.id;

      // Create a table with capacity 2
      const tblRes = await request(app)
        .post(`/api/evenings/${testEveningId}/tables`)
        .set('Cookie', organizerCookie)
        .send({
          name: 'Стол P3',
          capacity: 2,
        });
      testTableId = tblRes.body.id;
    });

    it('1. invited does not occupy seat', async () => {
      await request(app)
        .post(`/api/evenings/${testEveningId}/participants/bulk`)
        .set('Cookie', organizerCookie)
        .send({
          player_ids: [pIds[0]],
          table_id: testTableId,
          registration_status: 'invited',
        });

      const partsRes = await request(app)
        .get(`/api/evenings/${testEveningId}/participants`)
        .set('Cookie', organizerCookie);
      const part0 = partsRes.body.find((p: any) => p.player_id === pIds[0]);
      expect(part0.registration_status).toBe('invited');
      expect(part0.table_id).toBe(testTableId);
    });

    it('2. confirming invited on full table sets status to waitlist', async () => {
      // Fill table with 2 confirmed players
      await request(app)
        .post(`/api/evenings/${testEveningId}/participants/bulk`)
        .set('Cookie', organizerCookie)
        .send({
          player_ids: [pIds[1], pIds[2]],
          table_id: testTableId,
          registration_status: 'confirmed',
        });

      const partsRes = await request(app)
        .get(`/api/evenings/${testEveningId}/participants`)
        .set('Cookie', organizerCookie);
      const part0 = partsRes.body.find((p: any) => p.player_id === pIds[0]);

      // Try confirming invited player part0
      const patchRes = await request(app)
        .patch(`/api/evening-participants/${part0.id}`)
        .set('Cookie', organizerCookie)
        .send({ registration_status: 'confirmed' });

      expect(patchRes.status).toBe(200);
      expect(patchRes.body.registration_status).toBe('waitlist');
    });

    it('3. bulk registration overflow: 2 capacity, 5 registered -> 2 occupied, 3 waitlist', async () => {
      const freshEv = await request(app)
        .post('/api/evenings')
        .set('Cookie', organizerCookie)
        .send({ title: 'Вечер оверфлоу', starts_at: '2026-09-02T19:00:00.000Z' });
      const freshTable = await request(app)
        .post(`/api/evenings/${freshEv.body.id}/tables`)
        .set('Cookie', organizerCookie)
        .send({ name: 'Стол 2 места', capacity: 2 });

      const bulkRes = await request(app)
        .post(`/api/evenings/${freshEv.body.id}/participants/bulk`)
        .set('Cookie', organizerCookie)
        .send({
          player_ids: pIds,
          table_id: freshTable.body.id,
          registration_status: 'registered',
        });

      expect(bulkRes.body.addedCount).toBe(5);
      expect(bulkRes.body.waitlistCount).toBe(3);

      const parts = await request(app)
        .get(`/api/evenings/${freshEv.body.id}/participants`)
        .set('Cookie', organizerCookie);
      const registered = parts.body.filter((p: any) => p.registration_status === 'registered');
      const waitlist = parts.body.filter((p: any) => p.registration_status === 'waitlist');
      expect(registered.length).toBe(2);
      expect(waitlist.length).toBe(3);
    });

    it('4. bulk invited does NOT fill table capacity', async () => {
      const freshEv = await request(app)
        .post('/api/evenings')
        .set('Cookie', organizerCookie)
        .send({ title: 'Вечер invited', starts_at: '2026-09-03T19:00:00.000Z' });
      const freshTable = await request(app)
        .post(`/api/evenings/${freshEv.body.id}/tables`)
        .set('Cookie', organizerCookie)
        .send({ name: 'Стол 1 место', capacity: 1 });

      await request(app)
        .post(`/api/evenings/${freshEv.body.id}/participants/bulk`)
        .set('Cookie', organizerCookie)
        .send({
          player_ids: [pIds[0], pIds[1], pIds[2]],
          table_id: freshTable.body.id,
          registration_status: 'invited',
        });

      const addConf = await request(app)
        .post(`/api/evenings/${freshEv.body.id}/participants/bulk`)
        .set('Cookie', organizerCookie)
        .send({
          player_ids: [pIds[3]],
          table_id: freshTable.body.id,
          registration_status: 'confirmed',
        });

      expect(addConf.body.waitlistCount).toBe(0);
      const parts = await request(app)
        .get(`/api/evenings/${freshEv.body.id}/participants`)
        .set('Cookie', organizerCookie);
      const conf = parts.body.find((p: any) => p.player_id === pIds[3]);
      expect(conf.registration_status).toBe('confirmed');
    });

    it('5. PATCH capacity check enforcement', async () => {
      const freshEv = await request(app)
        .post('/api/evenings')
        .set('Cookie', organizerCookie)
        .send({ title: 'Вечер PATCH check', starts_at: '2026-09-04T19:00:00.000Z' });
      const freshTable = await request(app)
        .post(`/api/evenings/${freshEv.body.id}/tables`)
        .set('Cookie', organizerCookie)
        .send({ name: 'Стол 1 место', capacity: 1 });

      await request(app)
        .post(`/api/evenings/${freshEv.body.id}/participants/bulk`)
        .set('Cookie', organizerCookie)
        .send({
          player_ids: [pIds[0]],
          table_id: freshTable.body.id,
          registration_status: 'confirmed',
        });
      await request(app)
        .post(`/api/evenings/${freshEv.body.id}/participants/bulk`)
        .set('Cookie', organizerCookie)
        .send({
          player_ids: [pIds[1]],
          table_id: freshTable.body.id,
          registration_status: 'invited',
        });

      const parts = await request(app)
        .get(`/api/evenings/${freshEv.body.id}/participants`)
        .set('Cookie', organizerCookie);
      const part2 = parts.body.find((p: any) => p.player_id === pIds[1]);

      const patchRes = await request(app)
        .patch(`/api/evening-participants/${part2.id}`)
        .set('Cookie', organizerCookie)
        .send({ registration_status: 'confirmed' });

      expect(patchRes.body.registration_status).toBe('waitlist');
    });

    it('6. price 0 preservation', async () => {
      const res = await request(app)
        .post(`/api/evenings/${testEveningId}/tables`)
        .set('Cookie', organizerCookie)
        .send({
          name: 'Бесплатный стол',
          capacity: 10,
          default_price: 0,
        });

      expect(res.status).toBe(201);
      expect(res.body.default_price).toBe(0);
    });

    it('7. settled_at blocks changes', async () => {
      const freshEv = await request(app)
        .post('/api/evenings')
        .set('Cookie', organizerCookie)
        .send({ title: 'Расчитанный вечер', starts_at: '2026-09-05T19:00:00.000Z' });

      await db.run('UPDATE game_evenings SET settled_at = ? WHERE id = ?', [new Date().toISOString(), freshEv.body.id]);

      const tblRes = await request(app)
        .post(`/api/evenings/${freshEv.body.id}/tables`)
        .set('Cookie', organizerCookie)
        .send({ name: 'Стол', capacity: 10 });
      expect(tblRes.status).toBe(400);

      const bulkRes = await request(app)
        .post(`/api/evenings/${freshEv.body.id}/participants/bulk`)
        .set('Cookie', organizerCookie)
        .send({ player_ids: [pIds[0]], registration_status: 'confirmed' });
      expect(bulkRes.status).toBe(400);
    });
  });

  describe('P4 CRM Overview & Final Patch Tests', () => {
    let pastEveningId: string;
    let futureEveningId: string;
    let overviewTableId: string;
    let testPIds: string[] = [];

    beforeAll(async () => {
      // Create players
      for (let i = 201; i <= 205; i++) {
        const res = await request(app)
          .post('/api/players')
          .set('Cookie', organizerCookie)
          .send({ nickname: `P4_Игрок_${i}`, phone: `+799922233${i}` });
        testPIds.push(res.body.id);
      }

      // 1. Create a published evening in the past (e.g., 2 days ago)
      const pastDate = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
      const pastEvRes = await request(app)
        .post('/api/evenings')
        .set('Cookie', organizerCookie)
        .send({
          title: 'Прошедший вечер P4',
          starts_at: pastDate,
          status: 'published',
          capacity: 10,
        });
      pastEveningId = pastEvRes.body.id;

      // 2. Create a future evening (e.g., tomorrow)
      const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      const futureEvRes = await request(app)
        .post('/api/evenings')
        .set('Cookie', organizerCookie)
        .send({
          title: 'Будущий вечер P4',
          starts_at: futureDate,
          status: 'published',
          capacity: 10,
        });
      futureEveningId = futureEvRes.body.id;

      // Create a table on future evening with capacity 3
      const tblRes = await request(app)
        .post(`/api/evenings/${futureEveningId}/tables`)
        .set('Cookie', organizerCookie)
        .send({
          name: 'Стол Overview',
          capacity: 3,
        });
      overviewTableId = tblRes.body.id;
    });

    it('1. Past published evening is NOT selected as nextEvening', async () => {
      const res = await request(app)
        .get('/api/crm/overview')
        .set('Cookie', organizerCookie);

      expect(res.status).toBe(200);
      expect(res.body.nextEvening).toBeDefined();
      expect(res.body.nextEvening.id).toBe(futureEveningId);
      expect(res.body.nextEvening.id).not.toBe(pastEveningId);
    });

    it('2. & 3. Invited players do not occupy seats, table returns correct occupied, free_spots, and waitlist', async () => {
      // Add 1 invited, 2 confirmed, 1 waitlist player to future evening table (capacity 3)
      await request(app)
        .post(`/api/evenings/${futureEveningId}/participants/bulk`)
        .set('Cookie', organizerCookie)
        .send({
          player_ids: [testPIds[0]],
          table_id: overviewTableId,
          registration_status: 'invited',
        });

      await request(app)
        .post(`/api/evenings/${futureEveningId}/participants/bulk`)
        .set('Cookie', organizerCookie)
        .send({
          player_ids: [testPIds[1], testPIds[2]],
          table_id: overviewTableId,
          registration_status: 'confirmed',
        });

      await request(app)
        .post(`/api/evenings/${futureEveningId}/participants/bulk`)
        .set('Cookie', organizerCookie)
        .send({
          player_ids: [testPIds[3]],
          table_id: overviewTableId,
          registration_status: 'waitlist',
        });

      const res = await request(app)
        .get('/api/crm/overview')
        .set('Cookie', organizerCookie);

      expect(res.status).toBe(200);
      const nextEv = res.body.nextEvening;
      expect(nextEv.id).toBe(futureEveningId);
      expect(nextEv.tables).toBeDefined();

      const table = nextEv.tables.find((t: any) => t.id === overviewTableId);
      expect(table).toBeDefined();
      // Occupied should count ONLY confirmed and registered (2), NOT invited (1) or waitlist (1)
      expect(table.occupied).toBe(2);
      expect(table.free_spots).toBe(1); // 3 capacity - 2 occupied = 1
      expect(table.invited_count).toBe(1);
      expect(table.waitlist_count).toBe(1);
    });

    it('4. Overdue, today, and no-deadline tasks are correctly separated', async () => {
      const todayStr = new Date().toISOString().substring(0, 10);
      const yesterdayStr = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().substring(0, 10);

      // Create an overdue task
      await request(app)
        .post('/api/tasks')
        .set('Cookie', organizerCookie)
        .send({
          title: 'Просроченная задача P4',
          due_at: `${yesterdayStr}T12:00:00.000Z`,
          status: 'todo',
        });

      // Create a task for today
      await request(app)
        .post('/api/tasks')
        .set('Cookie', organizerCookie)
        .send({
          title: 'Задача на сегодня P4',
          due_at: `${todayStr}T15:00:00.000Z`,
          status: 'todo',
        });

      // Create a task without deadline
      await request(app)
        .post('/api/tasks')
        .set('Cookie', organizerCookie)
        .send({
          title: 'Задача без срока P4',
          due_at: null,
          status: 'todo',
        });

      const res = await request(app)
        .get('/api/crm/overview')
        .set('Cookie', organizerCookie);

      expect(res.status).toBe(200);
      const { overdueTasks, todayTasks, noDeadlineTasks } = res.body.actionLists;

      expect(overdueTasks.some((t: any) => t.title === 'Просроченная задача P4')).toBe(true);
      expect(todayTasks.some((t: any) => t.title === 'Задача на сегодня P4')).toBe(true);
      expect(noDeadlineTasks.some((t: any) => t.title === 'Задача без срока P4')).toBe(true);

      // Cross checks: ensure no overlap
      expect(overdueTasks.some((t: any) => t.title === 'Задача на сегодня P4')).toBe(false);
      expect(todayTasks.some((t: any) => t.title === 'Просроченная задача P4')).toBe(false);
    });

    it('5. Free participation (amount_due=0) results in waived payment_status', async () => {
      const freeEvRes = await request(app)
        .post('/api/evenings')
        .set('Cookie', organizerCookie)
        .send({
          title: 'Бесплатный вечер P4',
          starts_at: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
          default_price: 0,
        });

      const addRes = await request(app)
        .post(`/api/evenings/${freeEvRes.body.id}/participants`)
        .set('Cookie', organizerCookie)
        .send({
          player_id: testPIds[4],
          registration_status: 'registered',
          amount_due: 0,
        });

      expect(addRes.status).toBe(201);
      expect(addRes.body.payment_status).toBe('waived');
    });

    it('6. Updating registration_status does not overwrite waived to unpaid', async () => {
      const freeEvRes = await request(app)
        .post('/api/evenings')
        .set('Cookie', organizerCookie)
        .send({
          title: 'Бесплатный вечер P4 для апдейта',
          starts_at: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(),
          default_price: 0,
        });

      const addRes = await request(app)
        .post(`/api/evenings/${freeEvRes.body.id}/participants`)
        .set('Cookie', organizerCookie)
        .send({
          player_id: testPIds[0],
          registration_status: 'registered',
          amount_due: 0,
        });

      const participantId = addRes.body.id;
      expect(addRes.body.payment_status).toBe('waived');

      // Update registration_status to confirmed without passing payment_status or amount_due
      const patchRes = await request(app)
        .patch(`/api/evening-participants/${participantId}`)
        .set('Cookie', organizerCookie)
        .send({
          registration_status: 'confirmed',
        });

      expect(patchRes.status).toBe(200);
      expect(patchRes.body.registration_status).toBe('confirmed');
      expect(patchRes.body.payment_status).toBe('waived');
    });
  });

  describe('P5 Read-Only Overview & Debt Filter Tests', () => {
    let p5Player1: string;
    let p5Player2: string;
    let p5Player3: string;
    let p5Player4: string;

    beforeAll(async () => {
      // Create test players for P5
      const p1 = await request(app).post('/api/players').set('Cookie', organizerCookie).send({ nickname: 'P5_Reservist', phone: '+79995550001' });
      const p2 = await request(app).post('/api/players').set('Cookie', organizerCookie).send({ nickname: 'P5_FutureUnpaid', phone: '+79995550002' });
      const p3 = await request(app).post('/api/players').set('Cookie', organizerCookie).send({ nickname: 'P5_CompletedDebtor', phone: '+79995550003' });
      const p4 = await request(app).post('/api/players').set('Cookie', organizerCookie).send({ nickname: 'P5_CancelledPlayer', phone: '+79995550004' });
      p5Player1 = p1.body.id;
      p5Player2 = p2.body.id;
      p5Player3 = p3.body.id;
      p5Player4 = p4.body.id;
    });

    it('1. waitlistParticipants returns waitlisted participants', async () => {
      // Find or create next evening
      let overview = await request(app).get('/api/crm/overview').set('Cookie', organizerCookie);
      let targetEveningId = overview.body.nextEvening?.id;

      if (!targetEveningId) {
        const futureDate = new Date(Date.now() + 10 * 3600 * 1000).toISOString();
        const evRes = await request(app)
          .post('/api/evenings')
          .set('Cookie', organizerCookie)
          .send({ title: 'Next Evening For P5 Waitlist', starts_at: futureDate, status: 'published' });
        targetEveningId = evRes.body.id;
      }

      await request(app)
        .post(`/api/evenings/${targetEveningId}/participants`)
        .set('Cookie', organizerCookie)
        .send({ player_id: p5Player1, registration_status: 'waitlist' });

      const res = await request(app).get('/api/crm/overview').set('Cookie', organizerCookie);
      expect(res.status).toBe(200);
      const waitlist = res.body.actionLists.waitlistParticipants;
      expect(waitlist.some((p: any) => p.player_id === p5Player1)).toBe(true);
    });

    it('2. Future unpaid participant is NOT counted as debtor in unpaidParticipants', async () => {
      const futureDate = new Date(Date.now() + 200 * 3600 * 1000).toISOString();
      const evRes = await request(app)
        .post('/api/evenings')
        .set('Cookie', organizerCookie)
        .send({ title: 'Future Unpaid Evening P5', starts_at: futureDate, status: 'published', default_price: 1500 });

      await request(app)
        .post(`/api/evenings/${evRes.body.id}/participants`)
        .set('Cookie', organizerCookie)
        .send({ player_id: p5Player2, registration_status: 'confirmed', amount_due: 1500, amount_paid: 0 });

      const res = await request(app).get('/api/crm/overview').set('Cookie', organizerCookie);
      expect(res.status).toBe(200);
      const debtors = res.body.actionLists.unpaidParticipants;
      expect(debtors.some((p: any) => p.player_id === p5Player2)).toBe(false);
    });

    it('3. Waitlisted and cancelled participants of completed evening are NOT counted as debtors', async () => {
      const pastDate = new Date(Date.now() - 50 * 3600 * 1000).toISOString();
      const compEvRes = await request(app)
        .post('/api/evenings')
        .set('Cookie', organizerCookie)
        .send({ title: 'Draft Evening for Wait/Cancel P5', starts_at: pastDate, status: 'draft', default_price: 1000 });

      await request(app)
        .post(`/api/evenings/${compEvRes.body.id}/participants`)
        .set('Cookie', organizerCookie)
        .send({ player_id: p5Player1, registration_status: 'waitlist', amount_due: 1000, amount_paid: 0 });

      await request(app)
        .post(`/api/evenings/${compEvRes.body.id}/participants`)
        .set('Cookie', organizerCookie)
        .send({ player_id: p5Player4, registration_status: 'cancelled', amount_due: 1000, amount_paid: 0 });

      await request(app)
        .patch(`/api/evenings/${compEvRes.body.id}`)
        .set('Cookie', organizerCookie)
        .send({ status: 'completed' });

      const res = await request(app).get('/api/crm/overview').set('Cookie', organizerCookie);
      expect(res.status).toBe(200);
      const debtors = res.body.actionLists.unpaidParticipants;
      expect(debtors.some((p: any) => p.player_id === p5Player1)).toBe(false);
      expect(debtors.some((p: any) => p.player_id === p5Player4)).toBe(false);
    });

    it('4. Debt from completed evening is displayed', async () => {
      const pastDate = new Date(Date.now() - 40 * 3600 * 1000).toISOString();
      const compEvRes = await request(app)
        .post('/api/evenings')
        .set('Cookie', organizerCookie)
        .send({ title: 'Draft Evening for Debt P5', starts_at: pastDate, status: 'draft', default_price: 2000 });

      await request(app)
        .post(`/api/evenings/${compEvRes.body.id}/participants`)
        .set('Cookie', organizerCookie)
        .send({ player_id: p5Player3, registration_status: 'registered', amount_due: 2000, amount_paid: 0 });

      await request(app)
        .patch(`/api/evenings/${compEvRes.body.id}`)
        .set('Cookie', organizerCookie)
        .send({ status: 'completed' });

      const res = await request(app).get('/api/crm/overview').set('Cookie', organizerCookie);
      expect(res.status).toBe(200);
      const debtors = res.body.actionLists.unpaidParticipants;
      expect(debtors.some((p: any) => p.player_id === p5Player3)).toBe(true);
    });

    it('5. Cancelled task does not appear in overview', async () => {
      const taskRes = await request(app)
        .post('/api/tasks')
        .set('Cookie', organizerCookie)
        .send({ title: 'Отмененная задача P5', status: 'cancelled' });

      const res = await request(app).get('/api/crm/overview').set('Cookie', organizerCookie);
      expect(res.status).toBe(200);
      const { overdueTasks, todayTasks, noDeadlineTasks } = res.body.actionLists;
      expect(overdueTasks.some((t: any) => t.id === taskRes.body.id)).toBe(false);
      expect(todayTasks.some((t: any) => t.id === taskRes.body.id)).toBe(false);
      expect(noDeadlineTasks.some((t: any) => t.id === taskRes.body.id)).toBe(false);
    });

    it('6. Two consecutive GET /api/crm/overview calls do NOT change table/task/participant counts', async () => {
      const res1 = await request(app).get('/api/crm/overview').set('Cookie', organizerCookie);
      expect(res1.status).toBe(200);

      const tasksBefore = (await request(app).get('/api/tasks').set('Cookie', organizerCookie)).body.length;

      const res2 = await request(app).get('/api/crm/overview').set('Cookie', organizerCookie);
      expect(res2.status).toBe(200);

      const tasksAfter = (await request(app).get('/api/tasks').set('Cookie', organizerCookie)).body.length;
      expect(tasksAfter).toBe(tasksBefore);
      expect(res2.body).toEqual(res1.body);
    });
  });

  describe('Player Invitation Endpoint POST /api/players/:id/invite', () => {
    let testPlayerId: string;
    let testEveningId: string;
    let testTableId: string;
    let otherEveningId: string;
    let otherTableId: string;

    beforeEach(async () => {
      // Create player with unique nickname
      const uniqueNick = `InvitePlayer_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const pRes = await request(app)
        .post('/api/players')
        .set('Cookie', organizerCookie)
        .send({ nickname: uniqueNick, phone: '+79001112233' });
      testPlayerId = pRes.body.id;

      // Create main future evening
      const futureDate = new Date(Date.now() + 48 * 3600 * 1000).toISOString();
      const eRes = await request(app)
        .post('/api/evenings')
        .set('Cookie', organizerCookie)
        .send({ title: 'Future Evening for Invite Test', starts_at: futureDate, status: 'published', default_price: 1000 });
      testEveningId = eRes.body.id;

      // Create table for main evening
      const tRes = await request(app)
        .post(`/api/evenings/${testEveningId}/tables`)
        .set('Cookie', organizerCookie)
        .send({ name: 'VIP Table', default_price: 1500, capacity: 10 });
      testTableId = tRes.body.id;

      // Create secondary future evening and its table
      const eRes2 = await request(app)
        .post('/api/evenings')
        .set('Cookie', organizerCookie)
        .send({ title: 'Other Evening', starts_at: futureDate, status: 'published', default_price: 1000 });
      otherEveningId = eRes2.body.id;

      const tRes2 = await request(app)
        .post(`/api/evenings/${otherEveningId}/tables`)
        .set('Cookie', organizerCookie)
        .send({ name: 'Other Table', default_price: 1200, capacity: 10 });
      otherTableId = tRes2.body.id;
    });

    it('1. Invitation saves evening_id and table_id', async () => {
      const res = await request(app)
        .post(`/api/players/${testPlayerId}/invite`)
        .set('Cookie', organizerCookie)
        .send({ evening_id: testEveningId, table_id: testTableId, create_followup_task: true });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.participant.evening_id).toBe(testEveningId);
      expect(res.body.participant.table_id).toBe(testTableId);
      expect(res.body.participant.registration_status).toBe('invited');
      expect(res.body.participant.amount_due).toBe(1500);
    });

    it('2. Table from another evening is rejected', async () => {
      const res = await request(app)
        .post(`/api/players/${testPlayerId}/invite`)
        .set('Cookie', organizerCookie)
        .send({ evening_id: testEveningId, table_id: otherTableId });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/не принадлежит/);
    });

    it('3. Duplicate invitation does not create a second participant', async () => {
      const res1 = await request(app)
        .post(`/api/players/${testPlayerId}/invite`)
        .set('Cookie', organizerCookie)
        .send({ evening_id: testEveningId, table_id: testTableId });

      expect(res1.status).toBe(200);

      const res2 = await request(app)
        .post(`/api/players/${testPlayerId}/invite`)
        .set('Cookie', organizerCookie)
        .send({ evening_id: testEveningId, table_id: testTableId });

      expect(res2.status).toBe(200);

      const evRes = await request(app)
        .get(`/api/evenings/${testEveningId}`)
        .set('Cookie', organizerCookie);

      const count = evRes.body.participants.filter((p: any) => p.player_id === testPlayerId).length;
      expect(count).toBe(1);
    });

    it('4. Duplicate invitation does not create a second task or activity', async () => {
      await request(app)
        .post(`/api/players/${testPlayerId}/invite`)
        .set('Cookie', organizerCookie)
        .send({ evening_id: testEveningId, create_followup_task: true });

      await request(app)
        .post(`/api/players/${testPlayerId}/invite`)
        .set('Cookie', organizerCookie)
        .send({ evening_id: testEveningId, create_followup_task: true });

      const playerRes = await request(app)
        .get(`/api/players/${testPlayerId}`)
        .set('Cookie', organizerCookie);

      const tasks = playerRes.body.tasks.filter((t: any) => t.automation_key === `invite-followup:${testEveningId}:${testPlayerId}`);
      expect(tasks.length).toBe(1);

      const activitiesRes = await request(app)
        .get(`/api/players/${testPlayerId}/activities`)
        .set('Cookie', organizerCookie);

      const inviteActivities = activitiesRes.body.filter((a: any) => a.evening_id === testEveningId && a.type === 'invite');
      expect(inviteActivities.length).toBe(1);
    });

    it('5. Table price 0 saves as waived', async () => {
      const freeTableRes = await request(app)
        .post(`/api/evenings/${testEveningId}/tables`)
        .set('Cookie', organizerCookie)
        .send({ name: 'Free Table', default_price: 0, capacity: 10 });

      const res = await request(app)
        .post(`/api/players/${testPlayerId}/invite`)
        .set('Cookie', organizerCookie)
        .send({ evening_id: testEveningId, table_id: freeTableRes.body.id });

      expect(res.status).toBe(200);
      expect(res.body.participant.amount_due).toBe(0);
      expect(res.body.participant.payment_status).toBe('waived');
    });

    it('6. Blocked player or player with do_not_invite_until in future cannot be invited', async () => {
      // 6a. Blocked player
      const blockedP = await request(app)
        .post('/api/players')
        .set('Cookie', organizerCookie)
        .send({ nickname: 'BlockedPlayer', lifecycle_status: 'blocked' });

      const resBlocked = await request(app)
        .post(`/api/players/${blockedP.body.id}/invite`)
        .set('Cookie', organizerCookie)
        .send({ evening_id: testEveningId });

      expect(resBlocked.status).toBe(400);

      // 6b. Player with do_not_invite_until in future
      const futurePause = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
      const pausedP = await request(app)
        .post('/api/players')
        .set('Cookie', organizerCookie)
        .send({ nickname: 'PausedPlayer' });

      await request(app)
        .patch(`/api/players/${pausedP.body.id}`)
        .set('Cookie', organizerCookie)
        .send({ do_not_invite_until: futurePause });

      const resPaused = await request(app)
        .post(`/api/players/${pausedP.body.id}/invite`)
        .set('Cookie', organizerCookie)
        .send({ evening_id: testEveningId });

      expect(resPaused.status).toBe(400);

      // 6c. Player with do_not_invite_until in past can be invited
      const pastPause = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
      await request(app)
        .patch(`/api/players/${pausedP.body.id}`)
        .set('Cookie', organizerCookie)
        .send({ do_not_invite_until: pastPause });

      const resUnpaused = await request(app)
        .post(`/api/players/${pausedP.body.id}/invite`)
        .set('Cookie', organizerCookie)
        .send({ evening_id: testEveningId });

      expect(resUnpaused.status).toBe(200);
    });
  });

  describe('Final Invite Patch Requirements', () => {
    let testPlayerId: string;
    let testEveningId: string;

    beforeEach(async () => {
      const pRes = await request(app)
        .post('/api/players')
        .set('Cookie', organizerCookie)
        .send({ nickname: `PatchPlayer_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`, phone: '+79009998877' });
      testPlayerId = pRes.body.id;

      const futureDate = new Date(Date.now() + 72 * 3600 * 1000).toISOString();
      const eRes = await request(app)
        .post('/api/evenings')
        .set('Cookie', organizerCookie)
        .send({ title: 'Patch Test Evening', starts_at: futureDate, status: 'published' });
      testEveningId = eRes.body.id;
    });

    it('1. & 2. Existing participant does not get new activity or task, response contains alreadyParticipant and status', async () => {
      // First invitation creates participant, activity, task
      const firstRes = await request(app)
        .post(`/api/players/${testPlayerId}/invite`)
        .set('Cookie', organizerCookie)
        .send({ evening_id: testEveningId, create_followup_task: true });

      expect(firstRes.status).toBe(200);
      expect(firstRes.body.alreadyParticipant).toBeUndefined();

      // Second invitation for same evening
      const secondRes = await request(app)
        .post(`/api/players/${testPlayerId}/invite`)
        .set('Cookie', organizerCookie)
        .send({ evening_id: testEveningId, create_followup_task: true });

      expect(secondRes.status).toBe(200);
      expect(secondRes.body.alreadyParticipant).toBe(true);
      expect(secondRes.body.registration_status).toBe('invited');
      expect(secondRes.body.participant).toBeDefined();
      expect(secondRes.body.participant.evening_id).toBe(testEveningId);
      expect(secondRes.body.message).toBe('Игрок уже добавлен на этот вечер');

      // Check activities count remains 1
      const actRes = await request(app)
        .get(`/api/players/${testPlayerId}/activities`)
        .set('Cookie', organizerCookie);
      const inviteActivities = actRes.body.filter((a: any) => a.evening_id === testEveningId && a.type === 'invite');
      expect(inviteActivities.length).toBe(1);

      // Check tasks count remains 1
      const playerRes = await request(app)
        .get(`/api/players/${testPlayerId}`)
        .set('Cookie', organizerCookie);
      const inviteTasks = playerRes.body.tasks.filter((t: any) => t.automation_key === `invite-followup:${testEveningId}:${testPlayerId}`);
      expect(inviteTasks.length).toBe(1);
    });

    it('3. Open invite-followup task is not duplicated by automation', async () => {
      // 1. Invite player to evening (creates invite-followup task and participant)
      await request(app)
        .post(`/api/players/${testPlayerId}/invite`)
        .set('Cookie', organizerCookie)
        .send({ evening_id: testEveningId, create_followup_task: true });

      // 2. Set participant created_at to 3 days ago so diffDays >= 2
      const threeDaysAgo = new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString();
      await db.run(
        'UPDATE evening_participants SET created_at = ? WHERE evening_id = ? AND player_id = ?',
        [threeDaysAgo, testEveningId, testPlayerId]
      );

      // 3. Run CRM automations
      await runCrmAutomations(db);

      // 4. Verify no clarify-participation task was created because open invite-followup already exists
      const tasks = await db.all(
        'SELECT * FROM organizer_tasks WHERE player_id = ? AND evening_id = ?',
        [testPlayerId, testEveningId]
      );
      
      const clarifyTasks = tasks.filter((t: any) => t.automation_key === `clarify-participation:${testEveningId}:${testPlayerId}`);
      expect(clarifyTasks.length).toBe(0);
      expect(tasks.length).toBe(1);
    });

    it('4. Nearest evening is selected first in UI-helper', () => {
      const nowMs = Date.now();
      const mockEvenings: any[] = [
        { id: '1', title: 'Far Evening', starts_at: new Date(nowMs + 10 * 24 * 3600 * 1000).toISOString(), status: 'published' },
        { id: '2', title: 'Nearest Evening', starts_at: new Date(nowMs + 1 * 24 * 3600 * 1000).toISOString(), status: 'published' },
        { id: '3', title: 'Middle Evening', starts_at: new Date(nowMs + 5 * 24 * 3600 * 1000).toISOString(), status: 'published' },
        { id: '4', title: 'Past Evening', starts_at: new Date(nowMs - 1 * 24 * 3600 * 1000).toISOString(), status: 'published' },
        { id: '5', title: 'Completed Evening', starts_at: new Date(nowMs + 2 * 24 * 3600 * 1000).toISOString(), status: 'completed' },
      ];

      const sorted = getSortedFutureEvenings(mockEvenings, nowMs);
      expect(sorted.length).toBe(3);
      expect(sorted[0].id).toBe('2');
      expect(sorted[0].title).toBe('Nearest Evening');
      expect(sorted[1].id).toBe('3');
      expect(sorted[2].id).toBe('1');
    });

    it('5. Time formatting uses Europe/Moscow', () => {
      // 2026-08-01T12:00:00.000Z in Europe/Moscow (UTC+3) is 15:00
      const isoDate = '2026-08-01T12:00:00.000Z';
      
      // Fallback/Default timezone is Europe/Moscow
      const formattedDefault = formatEveningDateTime(isoDate);
      expect(formattedDefault).toContain('15:00');

      // Explicit Europe/Moscow timezone
      const formattedMoscow = formatEveningDateTime(isoDate, 'Europe/Moscow');
      expect(formattedMoscow).toContain('15:00');
    });
  });
});
