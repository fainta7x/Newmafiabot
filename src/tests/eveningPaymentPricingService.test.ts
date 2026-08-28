import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index';
import { reconcileRegularEveningPayments } from '../server/services/eveningPaymentPricingService';

describe('evening payment pricing reconciliation', () => {
  let db: DatabaseWrapper;
  const now = '2026-08-21T20:00:00.000Z';

  beforeEach(async () => {
    db = createDatabaseConnection(':memory:');
    await createApp(db);
  });

  afterEach(() => {
    try { db.sqlite.close(); } catch {}
  });

  it('replaces a legacy 600-ruble closed-evening debt with the actual played-game amount and is idempotent', async () => {
    await db.run(
      `INSERT INTO game_evenings
       (id,title,starts_at,timezone,format,status,capacity,default_price,settled_at,created_at,updated_at)
       VALUES ('pricing-evening','21 августа',?,'Europe/Moscow','CASUAL','completed',20,600,?,?,?)`,
      [now, now, now, now],
    );
    await db.run(
      `INSERT INTO players (id,nickname,lifecycle_status,source,elo,tokens,created_at,updated_at)
       VALUES ('pricing-player','Игрок','normal','test',1000,0,?,?)`,
      [now, now],
    );
    await db.run(
      `INSERT INTO evening_participants
       (id,evening_id,player_id,response_status,registration_status,attendance_status,arrival_status,payment_status,amount_due,amount_paid,created_at,updated_at)
       VALUES ('pricing-participant','pricing-evening','pricing-player','going','going','attended','on_time','unpaid',600,0,?,?)`,
      [now, now],
    );

    const protocol = {
      version: 1,
      kind: 'club_evening_protocol',
      protocol: { game_id: '1', status: 'completed', winner_team: 'red' },
      player_results: [{ participant_id: 'pricing-participant', player_id: 'pricing-player', seat_number: 1 }],
    };
    await db.run(
      `INSERT INTO games
       (evening_id,global_game_number,game_date,winner_team,winner_label,protocol_text,slots_json,created_at)
       VALUES ('pricing-evening',1,?,'red','Победа красных',?,?,?)`,
      [now, JSON.stringify(protocol), JSON.stringify([{ participant_id: 'pricing-participant', player_id: 'pricing-player' }]), now],
    );
    await db.run(
      `INSERT INTO financial_transactions
       (id,type,amount,category,description,player_id,evening_id,source_type,source_id,created_at)
       VALUES ('legacy-debt','debt_created',600,'Неоплата за вечер','legacy','pricing-player','pricing-evening','evening_settle','pricing-participant',?)`,
      [now],
    );

    await reconcileRegularEveningPayments(db, 'pricing-evening');

    const participant = await db.get<any>(
      'SELECT amount_due,amount_paid,payment_status FROM evening_participants WHERE id=?',
      ['pricing-participant'],
    );
    expect(participant).toMatchObject({ amount_due: 100, amount_paid: 0, payment_status: 'unpaid' });

    const totals = await db.get<any>(`
      SELECT
        SUM(CASE WHEN type='income' THEN amount ELSE 0 END) AS income,
        SUM(CASE WHEN type='debt_created' THEN amount ELSE 0 END) AS debt_created,
        SUM(CASE WHEN type='debt_paid' THEN amount ELSE 0 END) AS debt_paid,
        COUNT(*) AS count
        FROM financial_transactions
       WHERE evening_id='pricing-evening' AND source_id='pricing-participant'
    `);
    expect(Number(totals?.income || 0) + Number(totals?.debt_created || 0)).toBe(100);
    expect(Number(totals?.debt_created || 0) - Number(totals?.debt_paid || 0)).toBe(100);
    const countAfterFirstPass = Number(totals?.count || 0);

    await reconcileRegularEveningPayments(db, 'pricing-evening');
    const countAfterSecondPass = Number((await db.get<any>(
      "SELECT COUNT(*) AS count FROM financial_transactions WHERE evening_id='pricing-evening' AND source_id='pricing-participant'",
    ))?.count || 0);
    expect(countAfterSecondPass).toBe(countAfterFirstPass);
  });
});
