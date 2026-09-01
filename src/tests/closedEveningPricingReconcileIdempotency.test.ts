import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index';
import { reconcileRegularEveningPayments } from '../server/services/eveningPaymentPricingService';

describe('closed evening pricing reconciliation idempotency', () => {
  let db: DatabaseWrapper;
  const now = '2026-08-28T20:00:00.000Z';

  beforeEach(async () => {
    db = createDatabaseConnection(':memory:');
    await createApp(db);
  });

  afterEach(() => {
    try { db.sqlite.close(); } catch {}
  });

  it('accumulates an existing pricing adjustment instead of violating the unique ledger source constraint', async () => {
    await db.run(
      `INSERT INTO game_evenings
       (id,title,starts_at,timezone,format,status,capacity,default_price,settled_at,created_at,updated_at)
       VALUES ('pricing-evening','28 августа',?,'Europe/Moscow','CASUAL','completed',20,100,?,?,?)`,
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
       VALUES ('pricing-participant','pricing-evening','pricing-player','going','going','attended','on_time','unpaid',400,0,?,?)`,
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
       VALUES ('existing-pricing-adjustment','debt_created',-100,'Корректировка долга за вечер','existing','pricing-player','pricing-evening','evening_pricing_reconcile','pricing-participant',?)`,
      [now],
    );

    await expect(reconcileRegularEveningPayments(db, 'pricing-evening')).resolves.toMatchObject({ applied: true });
    await expect(reconcileRegularEveningPayments(db, 'pricing-evening')).resolves.toMatchObject({ applied: true });

    const adjustment = await db.get<any>(`
      SELECT COUNT(*) AS count, COALESCE(SUM(amount), 0) AS amount
        FROM financial_transactions
       WHERE source_type = 'evening_pricing_reconcile'
         AND source_id = 'pricing-participant'
         AND type = 'debt_created'
    `);
    expect(Number(adjustment?.count || 0)).toBe(1);

    const participant = await db.get<any>(
      'SELECT amount_due, payment_status FROM evening_participants WHERE id = ?',
      ['pricing-participant'],
    );
    expect(Number(participant?.amount_due || 0)).toBe(100);
    expect(participant?.payment_status).toBe('unpaid');
  });
});
