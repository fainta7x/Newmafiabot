import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.ts';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { generateOrganizerToken } from '../server/auth.ts';
import { loadParticipantResponseHistory, setParticipantResponse } from '../server/services/eveningParticipantState.ts';

const stamp = '2026-10-12T10:00:00.000Z';

describe('history of a player’s answer to an evening', () => {
  let db: DatabaseWrapper;
  let app: any;
  beforeEach(async () => {
    db = createDatabaseConnection(':memory:');
    app = await createApp(db);
    await db.run(`INSERT INTO players (id,nickname,contact_status,lifecycle_status,game_level,created_at,updated_at) VALUES ('p1','Денди','normal','normal','club',?,?)`, [stamp, stamp]);
    await db.run(`INSERT INTO game_evenings(id,title,starts_at,status,format,created_at,updated_at) VALUES ('ev1','Вечер',?,'published','CASUAL',?,?)`, [stamp, stamp, stamp]);
    await db.run(`INSERT INTO evening_participants (id,evening_id,player_id,response_status,registration_status,attendance_status,arrival_status,payment_status,amount_due,amount_paid,registered_at,created_at,updated_at)
      VALUES ('ep1','ev1','p1','unanswered','unanswered','pending','unknown','waived',0,0,?,?,?)`, [stamp, stamp, stamp]);
  });
  afterEach(() => { try { db.sqlite.close(); } catch {} });

  it('writes every change with its source, newest first, and the organizer can read it', async () => {
    await setParticipantResponse(db, 'ep1', 'going', { byPlayer: true, source: 'telegram_quick_rsvp' });
    await setParticipantResponse(db, 'ep1', 'declined', { byPlayer: true, source: 'slot_selection_cleared' });
    await setParticipantResponse(db, 'ep1', 'thinking');
    const history = await loadParticipantResponseHistory(db, 'ep1');
    expect(history.map((row) => [row.previous_status, row.new_status, row.source, row.by_player])).toEqual([
      ['declined', 'thinking', 'organizer_or_system', 0],
      ['going', 'declined', 'slot_selection_cleared', 1],
      ['unanswered', 'going', 'telegram_quick_rsvp', 1],
    ]);
    expect((await request(app).get('/api/evenings/participants/ep1/response-history')).status).toBe(401);
    const response = await request(app).get('/api/evenings/participants/ep1/response-history').set('Cookie', `organizer_token=${generateOrganizerToken()}`);
    expect(response.status).toBe(200);
    expect(response.body.history).toHaveLength(3);
  });
});
