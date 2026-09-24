import { afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.ts';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { queueEveningRsvpNudges, rsvpFollowupAt } from '../server/services/eveningRsvpNudgeService.ts';

const opened: DatabaseWrapper[] = [];
afterEach(() => { while (opened.length) opened.pop()?.sqlite.close(); delete process.env.BOT_API_SECRET; });

const HOUR = 3600_000;
async function setup(hoursToStart: number) {
  const db = createDatabaseConnection(':memory:'); opened.push(db);
  const app = await createApp(db);
  const now = new Date().toISOString();
  const startsAt = new Date(Date.now() + hoursToStart * HOUR).toISOString();
  await db.run(`INSERT INTO game_evenings (id,title,starts_at,timezone,format,status,capacity,default_price,created_at,updated_at)
    VALUES ('e1','Пятница',?, 'Europe/Moscow','CASUAL','published',20,100,?,?)`, [startsAt, now, now]);
  const statuses = ['unanswered', 'going', 'declined', 'thinking', 'late'];
  for (const [index, status] of statuses.entries()) {
    await db.run(`INSERT INTO players (id,nickname,telegram_user_id,contact_status,lifecycle_status,judge_level,elo,tokens,created_at,updated_at)
      VALUES (?,?,?,'normal','normal','none',1000,0,?,?)`, [`p-${status}`, `Игрок ${status}`, String(7000 + index), now, now]);
    await db.run(`INSERT INTO evening_participants (id,evening_id,player_id,registration_status,response_status,attendance_status,payment_status,created_at,updated_at)
      VALUES (?,?,?,?,?,'pending','unpaid',?,?)`, [`ep-${status}`, 'e1', `p-${status}`, status, status, now, now]);
  }
  const byPlayer = async () => {
    const rows = await db.all<any>('SELECT player_id, event_type FROM personal_notification_deliveries ORDER BY player_id, event_type');
    const map: Record<string, string[]> = {};
    for (const row of rows) (map[row.player_id] ||= []).push(row.event_type);
    return map;
  };
  return { db, app, byPlayer };
}

describe('evening RSVP nudges', () => {
  it('a week ahead: invites only the silent player and asks a «late» player to pick games', async () => {
    const { db, byPlayer } = await setup(5 * 24);
    await queueEveningRsvpNudges(db);
    expect(await byPlayer()).toEqual({ 'p-unanswered': ['invitation'], 'p-late': ['evening_pick_games'] });
  });

  it('within 24 h: reminds «иду», nudges the silent, asks «думаю», stays quiet for «не иду»', async () => {
    const { db, byPlayer } = await setup(20);
    await queueEveningRsvpNudges(db);
    await queueEveningRsvpNudges(db);
    const map = await byPlayer();
    expect(map['p-going']).toEqual(['evening_reminder']);
    expect(map['p-declined']).toBeUndefined();
    expect(map['p-unanswered']).toEqual(['invitation', 'invitation_nudge']);
    expect(map['p-thinking']).toEqual(['thinking_followup']);
    expect(map['p-late']).toEqual(['evening_pick_games', 'evening_reminder']);
    const outbox = await db.get<any>("SELECT reply_markup_json FROM telegram_message_outbox WHERE player_id = 'p-thinking'");
    expect(outbox.reply_markup_json).toContain('evq:e1:3h');
    expect(outbox.reply_markup_json).toContain('evr:e1:going');
  });

  it('a «думаю» player can ask to be asked again 3 h before, and is asked then', async () => {
    const { db, app, byPlayer } = await setup(20);
    process.env.BOT_API_SECRET = 'bot-secret-test';
    const response = await request(app).post('/api/bot/evenings/e1/followup')
      .set('X-Bot-Token', 'bot-secret-test')
      .send({ telegram_user_id: 7003, when: '3h' });
    expect(response.status).toBe(200);
    const row = await db.get<any>("SELECT rsvp_followup_at FROM evening_participants WHERE id = 'ep-thinking'");
    expect(new Date(row.rsvp_followup_at).getTime()).toBeGreaterThan(Date.now());
    await queueEveningRsvpNudges(db, new Date(row.rsvp_followup_at).getTime() + 1000);
    expect((await byPlayer())['p-thinking']).toEqual(['thinking_followup', 'thinking_followup']);
  });

  it('picks 10:00 Moscow on game day for «утром», or 3 h before when the morning is gone', () => {
    const start = '2026-10-02T16:00:00.000Z'; // 19:00 MSK
    expect(rsvpFollowupAt(start, 'morning', Date.parse('2026-10-01T12:00:00Z'))).toBe('2026-10-02T07:00:00.000Z');
    expect(rsvpFollowupAt(start, '3h', Date.parse('2026-10-01T12:00:00Z'))).toBe('2026-10-02T13:00:00.000Z');
    expect(rsvpFollowupAt(start, 'morning', Date.parse('2026-10-02T09:00:00Z'))).toBe('2026-10-02T13:00:00.000Z');
    // Less than 3 h before the start the choice is rejected instead of firing at once.
    expect(rsvpFollowupAt(start, '3h', Date.parse('2026-10-02T14:00:00Z'))).toBeNull();
  });
});
