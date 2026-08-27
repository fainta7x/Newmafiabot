import { describe, expect, it } from 'vitest';
import { createApp } from '../app.ts';
import { createTestDatabase } from './helpers/createTestDatabase.ts';

const organizerCookie = 'organizer_session=test';

describe('evening payment tracking', () => {
  it('keeps payment correction available after an evening is closed', async () => {
    const db = await createTestDatabase();
    const app = await createApp(db);
    const request = (await import('supertest')).default;
    const now = new Date().toISOString();

    await db.run("INSERT INTO players (id, nickname, created_at, updated_at) VALUES ('payment-player', 'Плательщик', ?, ?)", [now, now]);
    await db.run("INSERT INTO game_evenings (id, title, starts_at, status, default_price, created_at, updated_at) VALUES ('payment-evening', 'Вечер оплаты', ?, 'completed', 400, ?, ?)", [now, now, now]);
    await db.run("UPDATE game_evenings SET settled_at = ? WHERE id = 'payment-evening'", [now]);
    await db.run(`
      INSERT INTO evening_participants (
        id, evening_id, player_id, response_status, registration_status,
        attendance_status, arrival_status, payment_status, amount_due, amount_paid,
        created_at, updated_at
      ) VALUES ('payment-participant', 'payment-evening', 'payment-player', 'going', 'going',
        'attended', 'on_time', 'unpaid', 400, 0, ?, ?)
    `, [now, now]);
    await db.run(`
      INSERT INTO financial_transactions (
        id, type, amount, category, description, player_id, evening_id,
        source_type, source_id, created_at
      ) VALUES ('payment-debt', 'debt_created', 400, 'Неоплата за вечер', 'Долг',
        'payment-player', 'payment-evening', 'evening_settle', 'payment-participant', ?)
    `, [now]);

    const paidResponse = await request(app)
      .patch('/api/evenings/payment-evening/payments/payment-participant')
      .set('Cookie', organizerCookie)
      .send({ paid: true });

    expect(paidResponse.status).toBe(200);
    expect(paidResponse.body.participants[0]).toMatchObject({ payment_status: 'paid', amount_paid: 400 });

    const debtPaid = await db.get<any>("SELECT COALESCE(SUM(amount), 0) AS total FROM financial_transactions WHERE source_id = 'payment-participant' AND type = 'debt_paid'");
    expect(Number(debtPaid?.total || 0)).toBe(400);

    const unpaidResponse = await request(app)
      .patch('/api/evenings/payment-evening/payments/payment-participant')
      .set('Cookie', organizerCookie)
      .send({ paid: false });

    expect(unpaidResponse.status).toBe(200);
    expect(unpaidResponse.body.participants[0]).toMatchObject({ payment_status: 'unpaid', amount_paid: 0 });

    const financials = await db.get<any>(`
      SELECT
        COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) AS income,
        COALESCE(SUM(CASE WHEN type = 'debt_created' THEN amount ELSE 0 END), 0) AS debt_created,
        COALESCE(SUM(CASE WHEN type = 'debt_paid' THEN amount ELSE 0 END), 0) AS debt_paid
      FROM financial_transactions
      WHERE source_id = 'payment-participant'
    `);
    expect(Number(financials.debt_created) - Number(financials.debt_paid)).toBe(400);
    expect(Number(financials.income) + Number(financials.debt_paid)).toBe(0);
  });
});
