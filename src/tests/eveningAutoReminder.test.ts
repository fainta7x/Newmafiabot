import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.ts';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { beginReminderCampaign, recordInitialAnnouncementAttempt } from '../server/services/eveningAnnouncementTrackingService.ts';
import { runAutomaticUnansweredReminders } from '../server/services/eveningAutoReminderService.ts';
import { getTelegramDispatchJob } from '../server/services/telegramSyncOutboxService.ts';

const opened: DatabaseWrapper[] = [];
afterEach(() => { while (opened.length) opened.pop()?.sqlite.close(); });

const HOUR = 3_600_000;
// Wednesday noon in Moscow (09:00 UTC).
const NOON = Date.parse('2030-01-02T09:00:00.000Z');

async function setup(startsInHours: number, answered = false) {
  const db = createDatabaseConnection(':memory:'); opened.push(db);
  await createApp(db);
  const stamp = new Date(NOON).toISOString();
  await db.run(`INSERT INTO game_evenings (id,title,starts_at,timezone,venue,format,status,capacity,default_price,created_at,updated_at)
    VALUES ('fri','Пятница',?,'Europe/Moscow','Клуб','CASUAL','published',20,100,?,?)`, [new Date(NOON + startsInHours * HOUR).toISOString(), stamp, stamp]);
  await db.run(`INSERT INTO players (id,nickname,telegram_user_id,game_level,contact_status,created_at,updated_at)
    VALUES ('silent','Молчун','5551','club','normal',?,?)`, [stamp, stamp]);
  await recordInitialAnnouncementAttempt(db, { eveningId: 'fri', playerId: 'silent', telegramUserId: '5551', success: true, telegramMessageId: 7 });
  if (answered) {
    await db.run(`INSERT INTO evening_participants (id,evening_id,player_id,response_status,attendance_status,payment_status,amount_due,amount_paid,created_at,updated_at)
      VALUES ('p1','fri','silent','going','pending','pending',0,0,?,?)`, [stamp, stamp]);
  }
  return db;
}

const outcome = async (db: DatabaseWrapper) => (await db.get<any>("SELECT outcome FROM evening_auto_reminders WHERE evening_id = 'fri'"))?.outcome ?? null;

describe('automatic «Напомнить неответившим» two days before', () => {
  it('reminds the silent ones once, in the daytime, 24–48 hours before', async () => {
    const db = await setup(40);
    expect(await runAutomaticUnansweredReminders(db, NOON - 4 * HOUR)).toBe(0); // 08:00 Moscow — waits for the day
    expect(await outcome(db)).toBeNull();
    expect(await runAutomaticUnansweredReminders(db, NOON)).toBe(1);
    expect(await outcome(db)).toBe('sent_to_1');
    expect(await getTelegramDispatchJob(db, 'reminder', 'fri')).toBeTruthy();
    expect(await runAutomaticUnansweredReminders(db, NOON + HOUR)).toBe(0); // only once
  });

  it('waits while the evening is more than two days away, and leaves the last day to the 24-hour nudge', async () => {
    expect(await runAutomaticUnansweredReminders(await setup(60), NOON)).toBe(0);
    expect(await runAutomaticUnansweredReminders(await setup(20), NOON)).toBe(0);
  });

  it('does nothing when everyone answered or the organizer reminded by hand today', async () => {
    const answered = await setup(40, true);
    expect(await runAutomaticUnansweredReminders(answered, NOON)).toBe(0);
    expect(await outcome(answered)).toBe('nobody_to_remind');

    const byHand = await setup(40);
    await beginReminderCampaign(byHand, 'fri');
    await byHand.run("UPDATE evening_reminder_campaign_state SET updated_at = ? WHERE evening_id = 'fri'", [new Date(NOON - 2 * HOUR).toISOString()]);
    expect(await runAutomaticUnansweredReminders(byHand, NOON)).toBe(0);
    expect(await outcome(byHand)).toBe('reminded_by_hand');
  });
});
