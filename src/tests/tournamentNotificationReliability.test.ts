import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.ts';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { ensurePersonalNotificationRoutingSchema } from '../db/ensurePersonalNotificationRoutingSchema.ts';
import {
  answerTournament,
  enforceTournamentPaymentDeadlines,
  notifyTournamentDetailsChanged,
  registerTournamentPlayer,
  cancelTournamentRegistration,
} from '../server/services/tournamentEveningService.ts';

const opened: DatabaseWrapper[] = [];
afterEach(() => { while (opened.length) opened.pop()?.sqlite.close(); });
const HOUR = 60 * 60 * 1000;

async function setup(startsInHours: number, players = 12) {
  const db = createDatabaseConnection(':memory:'); opened.push(db);
  await createApp(db);
  await ensurePersonalNotificationRoutingSchema(db);
  const stamp = new Date().toISOString();
  const date = new Date(Date.now() + startsInHours * HOUR).toISOString();
  await db.run(
    `INSERT INTO tournaments (id,title,date,venue,status,tournament_evening_flow,entry_fee_rub,published_at,created_at,updated_at) VALUES ('t','Кубок',?,'Клуб','draft',1,500,?,?,?)`,
    [date, stamp, stamp, stamp],
  );
  for (let i = 1; i <= players; i += 1) {
    await db.run("INSERT INTO players (id,nickname,game_level,telegram_user_id,created_at,updated_at) VALUES (?,?,'tournament',?,?,?)", [`p${i}`, `Игрок ${i}`, String(1000 + i), stamp, stamp]);
    const confirmed = i <= 10;
    await db.run(
      `INSERT INTO tournament_registrations (id,tournament_id,player_id,status,slot_number,queue_order,response,registered_at,updated_at) VALUES (?,?,?,?,?,?,'play',?,?)`,
      [`r${i}`, 't', `p${i}`, confirmed ? 'confirmed' : 'reserve', confirmed ? i : null, confirmed ? null : i - 10, stamp, stamp],
    );
  }
  return db;
}

describe('payment deadline notifications are atomic with the deadline', () => {
  it('queues the release and promotion notices together with the demotion', async () => {
    const db = await setup(60);
    await enforceTournamentPaymentDeadlines(db);
    expect((await db.get<any>("SELECT payment_deadline_72_done_at AS done FROM tournaments WHERE id='t'"))?.done).toBeTruthy();
    const released = await db.all<any>("SELECT player_id FROM personal_notification_deliveries WHERE event_type='tournament_place_released'");
    expect(released).toHaveLength(10);
    const promoted = await db.all<any>("SELECT player_id FROM personal_notification_deliveries WHERE event_type='tournament_reserve_promoted'");
    // The two waiting «Играю» players get the freed places first; with nobody else around the demoted substitutes refill the rest.
    expect(promoted.map((row) => row.player_id)).toEqual(expect.arrayContaining(['p11', 'p12']));
  });

  it('rolls the whole run back when one message cannot be queued, and the next scan repeats it', async () => {
    const db = await setup(60);
    await db.run("INSERT INTO personal_notification_deliveries (notification_key,player_id,category,event_type,selected_channel,status,text,created_at,updated_at) VALUES ('seed','p1','personal','x',NULL,'unroutable','x',?,?)", [new Date().toISOString(), new Date().toISOString()]);
    await db.run(`CREATE TRIGGER fail_one BEFORE INSERT ON personal_notification_deliveries
      WHEN NEW.notification_key LIKE '%:released:72:p3' BEGIN SELECT RAISE(ABORT, 'boom'); END`);
    await expect(enforceTournamentPaymentDeadlines(db)).rejects.toThrow('boom');
    expect((await db.get<any>("SELECT payment_deadline_72_done_at AS done FROM tournaments WHERE id='t'"))?.done).toBeNull();
    expect(Number((await db.get<any>("SELECT COUNT(*) AS c FROM tournament_registrations WHERE status='confirmed'"))?.c)).toBe(10);

    await db.run('DROP TRIGGER fail_one');
    await enforceTournamentPaymentDeadlines(db);
    expect((await db.get<any>("SELECT payment_deadline_72_done_at AS done FROM tournaments WHERE id='t'"))?.done).toBeTruthy();
    expect(await db.all<any>("SELECT 1 FROM personal_notification_deliveries WHERE event_type='tournament_place_released'")).toHaveLength(10);
  });
});

describe('a promotion is announced in the same transaction as the cancellation', () => {
  it('queues the promoted player a message when a place is freed', async () => {
    const db = await setup(200);
    await cancelTournamentRegistration(db, 't', 'p1', 'player', 'p1');
    expect(await db.get<any>("SELECT status FROM personal_notification_deliveries WHERE player_id='p11' AND event_type='tournament_reserve_promoted'")).toBeTruthy();
    expect(await db.get<any>("SELECT status FROM tournament_registrations WHERE player_id='p11'")).toMatchObject({ status: 'confirmed' });
  });
});

describe('coming back after a refund', () => {
  it('starts the payment story again so the player can report a payment', async () => {
    const db = await setup(200, 3);
    await db.run("INSERT INTO tournament_payment_claims (id,tournament_id,player_id,state,reported_amount_rub,updated_at) VALUES ('c1','t','p1','refunded',500,?)", [new Date().toISOString()]);
    await cancelTournamentRegistration(db, 't', 'p1', 'player', 'p1');
    await registerTournamentPlayer(db, 't', 'p1');
    expect(await db.get<any>("SELECT state, reported_amount_rub FROM tournament_payment_claims WHERE player_id='p1'")).toMatchObject({ state: 'unpaid', reported_amount_rub: null });
  });

  it('also when the player answers «Играю» again', async () => {
    const db = await setup(200, 3);
    await db.run("INSERT INTO tournament_payment_claims (id,tournament_id,player_id,state,updated_at) VALUES ('c1','t','p2','refunded',?)", [new Date().toISOString()]);
    await answerTournament(db, 't', 'p2', 'decline' as any).catch(() => undefined);
    await db.run("UPDATE tournament_registrations SET status='cancelled', slot_number=NULL WHERE player_id='p2'");
    await answerTournament(db, 't', 'p2', 'play');
    expect((await db.get<any>("SELECT state FROM tournament_payment_claims WHERE player_id='p2'"))?.state).toBe('unpaid');
  });
});

describe('a player who gets a place after the first payment deadline', () => {
  it('is reminded at once, because the last deadline can still release the place', async () => {
    const db = await setup(48, 3);
    await db.run("DELETE FROM tournament_registrations WHERE player_id='p3'");
    await registerTournamentPlayer(db, 't', 'p3');
    const reminder = await db.get<any>("SELECT text FROM personal_notification_deliveries WHERE player_id='p3' AND event_type='tournament_payment_reminder'");
    expect(reminder?.text).toContain('500');
  });

  it('is not reminded when the tournament is further away than the first deadline', async () => {
    const db = await setup(200, 3);
    await db.run("DELETE FROM tournament_registrations WHERE player_id='p3'");
    await registerTournamentPlayer(db, 't', 'p3');
    expect(await db.get<any>("SELECT 1 FROM personal_notification_deliveries WHERE player_id='p3' AND event_type='tournament_payment_reminder'")).toBeNull();
  });
});

describe('details-changed notices', () => {
  it('tell a player again when a value comes back (B → C → B), but not twice in a row', async () => {
    const db = await setup(200, 2);
    const b = new Date(Date.now() + 300 * HOUR);
    const c = new Date(Date.now() + 400 * HOUR);
    expect(await notifyTournamentDetailsChanged(db, 't', 'Кубок', b, 'Клуб')).toBe(2);
    expect(await notifyTournamentDetailsChanged(db, 't', 'Кубок', b, 'Клуб')).toBe(0);
    expect(await notifyTournamentDetailsChanged(db, 't', 'Кубок', c, 'Клуб')).toBe(2);
    expect(await notifyTournamentDetailsChanged(db, 't', 'Кубок', b, 'Клуб')).toBe(2);
    expect(await notifyTournamentDetailsChanged(db, 't', 'Кубок', b, 'Клуб')).toBe(0);
  });
});
