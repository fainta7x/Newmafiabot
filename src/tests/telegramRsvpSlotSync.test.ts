import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.ts';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

describe('Telegram evening RSVP contracts', () => {
  it('maps Буду to all game slots and keeps non-going quick answers without slot commitments', () => {
    const source = read('src/server/routes/botRoutes.ts');

    expect(source).toContain("import { loadEveningSlotPlan, replacePlayerSlotSelection } from '../services/eveningSlotPlanningService.ts';");
    expect(source).toContain("if (responseStatus === 'going')");
    expect(source).toContain('plan.slots.map((slot) => slot.id)');
    expect(source).toContain("await replacePlayerSlotSelection(db, String(evening.id), String(player.id), [], { notifyOrganizer: false });");
    expect(source).toContain('await setParticipantResponse(db, String(participant.id), responseStatus as any);');
  });

  it('uses the actual player slot PUT endpoint when saving exact games', () => {
    const source = read('src/components/player/PlayerEventSlotDetail.tsx');

    expect(source).toContain("method: 'PUT'");
    expect(source).not.toContain("method: 'POST'");
  });

  it('finalizes routed Telegram event posts when an evening leaves an active destination', () => {
    const source = read('handlers/crm_telegram_publishing.py');

    expect(source).toContain('closed_event_text(evening, cancelled=cancelled)');
    expect(source).toContain('"action": "finalized"');
    expect(source).toContain('None,');
    expect(source).not.toContain('"action": "archived"');
  });
});

const databases: DatabaseWrapper[] = [];
afterEach(() => {
  while (databases.length) databases.pop()?.sqlite.close();
  delete process.env.BOT_API_SECRET;
});

describe('Telegram late RSVP end-to-end API', () => {
  it('requires a first game, books that game onward, and supports changing to the full evening', async () => {
    const db = createDatabaseConnection(':memory:');
    databases.push(db);
    const app = await createApp(db);
    const now = new Date().toISOString();
    await db.run(
      "INSERT INTO players (id, nickname, telegram_user_id, created_at, updated_at) VALUES ('p-late-test','Поздний игрок','711771',?,?)",
      [now, now],
    );
    await db.run(
      `INSERT INTO game_evenings (id,title,starts_at,timezone,format,status,capacity,default_price,created_at,updated_at)
       VALUES ('ev-late-test','Вечер',?,'Europe/Moscow','CASUAL','published',20,100,?,?)`,
      [new Date(Date.now() + 2 * 86400000).toISOString(), now, now],
    );
    process.env.BOT_API_SECRET = 'bot-secret-test';
    const auth = { 'X-Bot-Token': 'bot-secret-test' };
    const slotsResult = await request(app).get('/api/bot/evenings/ev-late-test/slots').set(auth);
    expect(slotsResult.status, JSON.stringify(slotsResult.body)).toBe(200);
    const slots = slotsResult.body.slots;
    expect(slots.length).toBeGreaterThanOrEqual(3);
    expect(slots.map((slot: any) => slot.slot_number)).toEqual([...slots.map((slot: any) => slot.slot_number)].sort((a: number, b: number) => a - b));
    const missing = await request(app).post('/api/bot/evenings/ev-late-test/respond').set(auth)
      .send({ telegram_user_id: '711771', response_status: 'late' });
    expect(missing.status).toBe(400);
    expect(missing.body.code).toBe('starting_slot_required');
    const invalid = await request(app).post('/api/bot/evenings/ev-late-test/respond').set(auth)
      .send({ telegram_user_id: '711771', response_status: 'late', starting_slot_id: 'nonexistent' });
    expect(invalid.status).toBe(400);
    const late = await request(app).post('/api/bot/evenings/ev-late-test/respond').set(auth)
      .send({ telegram_user_id: '711771', response_status: 'late', starting_slot_id: slots[2].id });
    expect(late.status, JSON.stringify(late.body)).toBe(200);
    const query = async () => db.all<any>(
      `SELECT s.id, s.slot_number FROM evening_slot_registrations r
       JOIN evening_game_slots s ON s.id = r.slot_id
       JOIN evening_participants ep ON ep.id = r.participant_id
       WHERE ep.evening_id = 'ev-late-test' AND ep.player_id = 'p-late-test'
       ORDER BY s.slot_number`,
    );
    expect((await query()).map((row: any) => row.id)).toEqual(slots.slice(2).map((slot: any) => slot.id));
    expect((await db.get<any>("SELECT response_status FROM evening_participants WHERE player_id='p-late-test' AND evening_id='ev-late-test'"))?.response_status).toBe('late');
    const updated = await request(app).post('/api/bot/evenings/ev-late-test/respond').set(auth)
      .send({ telegram_user_id: '711771', response_status: 'late', starting_slot_id: slots[1].id });
    expect(updated.status).toBe(200);
    expect((await query()).map((row: any) => row.id)).toEqual(slots.slice(1).map((slot: any) => slot.id));
    const going = await request(app).post('/api/bot/evenings/ev-late-test/respond').set(auth)
      .send({ telegram_user_id: '711771', response_status: 'going' });
    expect(going.status).toBe(200);
    expect((await query()).map((row: any) => row.id)).toEqual(slots.map((slot: any) => slot.id));
  });
});
