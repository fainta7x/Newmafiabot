import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.ts';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { RATING_ENTRY_FEE, ratingEveningSplit } from '../lib/ratingEveningMoney.ts';
import { calculateEveningSelectionTotal, reconcileNoviceEveningCharges } from '../server/services/eveningSlotPlanningService.ts';
import { announcementPriceLine } from '../server/services/vkDirectJoinPublishingService.ts';

const opened: DatabaseWrapper[] = [];
afterEach(() => { while (opened.length) opened.pop()?.sqlite.close(); });

describe('rating evening money', () => {
  it('splits a full table 2500 / 2000 / 500 and never loses a rouble to rounding', () => {
    expect(ratingEveningSplit(10 * RATING_ENTRY_FEE)).toEqual({ total: 5000, winner: 2500, judge: 2000, fund: 500 });
    const odd = ratingEveningSplit(4999);
    expect(odd.winner + odd.judge + odd.fund).toBe(4999);
  });

  it('charges one entry fee per evening, whatever the number of picked games', () => {
    expect(calculateEveningSelectionTotal('RATING', [100, 100, 100])).toBe(500);
    expect(calculateEveningSelectionTotal('RATING', [])).toBe(0);
    expect(announcementPriceLine('RATING', 100)).toBe('💳 Взнос 500 ₽ за вечер — до начала игр');
  });

  it('brings everyone who comes to the 500 ₽ fee and keeps recorded payments', async () => {
    const db = createDatabaseConnection(':memory:'); opened.push(db);
    await createApp(db);
    const now = new Date().toISOString();
    await db.run(`INSERT INTO game_evenings (id,title,starts_at,timezone,format,status,capacity,default_price,created_at,updated_at)
      VALUES ('r','Рейтинг',?,'Europe/Moscow','RATING','published',20,400,?,?)`, [new Date(Date.now() + 86400000).toISOString(), now, now]);
    const rows: Array<[string, string, string, number]> = [['going', 'pending', 'unpaid', 0], ['late', 'pending', 'paid', 500], ['declined', 'pending', 'unpaid', 0], ['unanswered', 'attended', 'unpaid', 0]];
    for (const [index, [response, attendance, status, paid]] of rows.entries()) {
      await db.run('INSERT INTO players (id,nickname,tokens,created_at,updated_at) VALUES (?,?,0,?,?)', [`p${index}`, `P${index}`, now, now]);
      await db.run(`INSERT INTO evening_participants (id,evening_id,player_id,response_status,registration_status,attendance_status,arrival_status,payment_status,amount_due,amount_paid,created_at,updated_at)
        VALUES (?,?,?,?,?,?,'unknown',?,400,?,?,?)`, [`e${index}`, 'r', `p${index}`, response, response, attendance, status, paid, now, now]);
    }
    await reconcileNoviceEveningCharges(db, 'r');
    const due = await db.all<any>("SELECT id, amount_due, payment_status FROM evening_participants WHERE evening_id = 'r' ORDER BY id");
    expect(due).toEqual([
      { id: 'e0', amount_due: 500, payment_status: 'unpaid' },
      { id: 'e1', amount_due: 500, payment_status: 'paid' },
      { id: 'e2', amount_due: 0, payment_status: 'waived' },
      { id: 'e3', amount_due: 500, payment_status: 'unpaid' },
    ]);
    // Every player at a rating table pays, the organizer included (a full table is 5000 ₽).
    await db.run("INSERT INTO evening_staff_assignments (evening_id, organizer_player_id, assigned_at, updated_at) VALUES ('r', 'p0', ?, ?)", [now, now]);
    await reconcileNoviceEveningCharges(db, 'r');
    expect(await db.get<any>("SELECT amount_due FROM evening_participants WHERE id = 'e0'")).toEqual({ amount_due: 500 });
    // A player seated at a new game without ever answering owes the fee before the prepayment check.
    expect(await db.get<any>("SELECT amount_due FROM evening_participants WHERE id = 'e2'")).toEqual({ amount_due: 0 });
    await reconcileNoviceEveningCharges(db, 'r', ['e2']);
    expect(await db.get<any>("SELECT amount_due, payment_status FROM evening_participants WHERE id = 'e2'")).toEqual({ amount_due: 500, payment_status: 'unpaid' });
  });
});
