import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.ts';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { generateOrganizerToken } from '../server/auth.ts';
import { PRIMARY_ORGANIZER_PLAYER_ID } from '../db/ensureOrganizerPlayerAccessSchema.ts';
import { calculateExtensionShares, splitExtensionAmount } from '../server/services/eveningExtensionService.ts';
import { reconcileRegularEveningPayments } from '../server/services/eveningPaymentPricingService.ts';

const cookie = () => `organizer_token=${generateOrganizerToken()}`;
const ids = (...values: string[]) => new Set(values);

describe('evening extension: the split', () => {
  it('rounds the share down to a whole ruble and pays nothing without payers', () => {
    expect(splitExtensionAmount(250, 10)).toBe(25);
    expect(splitExtensionAmount(250, 9)).toBe(27);
    expect(splitExtensionAmount(1, 7)).toBe(0);
    expect(splitExtensionAmount(250, 0)).toBe(0);
    expect(splitExtensionAmount(0, 5)).toBe(0);
  });

  it('splits between the players of the last games only, without the excluded ones', () => {
    const games = [ids('a', 'b'), ids('a', 'c', 'org'), ids('c', 'd', 'org', 'judge')];
    const excluded = ids('org', 'judge');
    // The last 2 games: a, c, org / c, d, org, judge → the payers are a, c, d.
    const shares = calculateExtensionShares([{ id: 'x', games_count: 2, amount: 300 }], games, excluded);
    expect(Object.fromEntries(shares)).toEqual({ a: 100, c: 100, d: 100 });
    expect(shares.has('b')).toBe(false);
  });

  it('takes several extensions from the end and counts a player once per extension', () => {
    const games = [ids('a', 'b'), ids('a', 'c'), ids('c', 'd')];
    const shares = calculateExtensionShares([{ id: '1', games_count: 1, amount: 60 }, { id: '2', games_count: 1, amount: 100 }], games, new Set());
    // The newest extension (2) covers the last game (c, d: 50 each), the older one (1) the game before it (a, c: 30 each).
    expect(Object.fromEntries(shares)).toEqual({ c: 80, d: 50, a: 30 });
  });

  it('asks for more games than were played: it covers all the games there are', () => {
    const shares = calculateExtensionShares([{ id: '1', games_count: 5, amount: 100 }], [ids('a', 'b')], new Set());
    expect(Object.fromEntries(shares)).toEqual({ a: 50, b: 50 });
  });
});

describe('evening extension: the charge and the API', () => {
  let db: DatabaseWrapper;
  let app: any;
  const now = '2026-10-09T23:30:00.000Z';

  beforeEach(async () => { db = createDatabaseConnection(':memory:'); app = await createApp(db); });
  afterEach(() => { try { db.sqlite.close(); } catch {} });

  const seed = async (format = 'CASUAL', closed = true) => {
    await db.run(`INSERT INTO game_evenings (id,title,starts_at,timezone,format,status,capacity,default_price,settled_at,created_at,updated_at)
      VALUES ('ev','Вечер','2026-10-09T20:00:00+03:00','Europe/Moscow',?,?,20,100,?,?,?)`, [format, closed ? 'completed' : 'active', closed ? now : null, now, now]);
    for (const [id, nick] of [['org', 'Организатор'], ['judge', 'Судья'], ['a', 'Аня'], ['b', 'Боря'], ['c', 'Вера'], ['d', 'Гена']]) {
      await db.run('INSERT INTO players (id,nickname,created_at,updated_at) VALUES (?,?,?,?)', [id, nick, now, now]);
      await db.run(`INSERT INTO evening_participants (id,evening_id,player_id,response_status,registration_status,attendance_status,arrival_status,payment_status,amount_due,amount_paid,created_at,updated_at)
        VALUES (?,?,?,'going','going','attended','on_time','unpaid',0,0,?,?)`, [`ep-${id}`, 'ev', id, now, now]);
    }
    await db.run('INSERT INTO evening_staff_assignments (evening_id, organizer_player_id, judge_player_id, assigned_at, updated_at) VALUES (?,?,?,?,?)', ['ev', 'org', 'judge', now, now]);
    const game = async (n: number, players: string[]) => db.run(
      `INSERT INTO games (evening_id,global_game_number,game_date,winner_team,winner_label,protocol_text,slots_json,created_at) VALUES ('ev',?,'2026-10-09','red','Красные',?,'[]',?)`,
      [n, JSON.stringify({ version: 1, kind: 'club_evening_protocol', protocol: { status: 'completed' }, player_results: players.map((p) => ({ participant_id: `ep-${p}` })) }), now],
    );
    await game(1, ['org', 'a', 'b', 'c']);
    await game(2, ['org', 'a', 'b', 'c']);
    await game(3, ['org', 'a', 'c', 'd']);
  };
  const due = async (id: string) => (await db.get<any>('SELECT amount_due, extension_due, payment_status FROM evening_participants WHERE id=?', [`ep-${id}`]));

  it('charges the players of the last games after the evening is closed, as a separate line inside one payment', async () => {
    await seed();
    const response = await request(app).post('/api/evenings/ev/extensions').set('Cookie', cookie()).send({ games_count: 1, amount: 250 });
    expect(response.status).toBe(201);
    // The last game: org (free), a, c, d → three payers, 83 ₽ each (250 / 3 rounded down).
    expect(await due('a')).toMatchObject({ extension_due: 83, amount_due: 300 + 83 });
    expect(await due('c')).toMatchObject({ extension_due: 83, amount_due: 300 + 83 });
    expect(await due('d')).toMatchObject({ extension_due: 83, amount_due: 100 + 83 });
    expect(await due('b')).toMatchObject({ extension_due: 0, amount_due: 200 });
    expect(await due('org')).toMatchObject({ extension_due: 0, amount_due: 0 });
    expect(await due('judge')).toMatchObject({ extension_due: 0 });
    const payments = response.body.participants.find((p: any) => p.id === 'ep-a');
    expect(payments).toMatchObject({ extension_due: 83, amount_due: 383 });
    expect(response.body.extensions).toHaveLength(1);
  });

  it('adds nothing before the evening is closed, then charges when it is closed', async () => {
    await seed('CASUAL', false);
    await request(app).post('/api/evenings/ev/extensions').set('Cookie', cookie()).send({ games_count: 1, amount: 250 });
    expect(await due('a')).toMatchObject({ extension_due: 0 });
    await db.run("UPDATE game_evenings SET status='completed', settled_at=? WHERE id='ev'", [now]);
    await reconcileRegularEveningPayments(db, 'ev');
    expect(await due('a')).toMatchObject({ extension_due: 83 });
  });

  it('does not charge a gifted player and keeps a player who already paid as a debtor for the extension', async () => {
    await seed();
    await db.run("INSERT INTO evening_fee_waivers (participant_id, evening_id, reason, waived_at, updated_at) VALUES ('ep-d','ev','Подарочный вечер',?,?)", [now, now]);
    await db.run("UPDATE evening_participants SET amount_paid=300, payment_status='paid' WHERE id='ep-a'");
    await request(app).post('/api/evenings/ev/extensions').set('Cookie', cookie()).send({ games_count: 1, amount: 250 });
    expect(await due('d')).toMatchObject({ extension_due: 0, amount_due: 0 });
    expect(await due('a')).toMatchObject({ extension_due: 83, amount_due: 383, payment_status: 'partial' });
  });

  it('never charges the club owner and removes the charge when the extension is deleted', async () => {
    await seed();
    await db.run('INSERT INTO players (id,nickname,created_at,updated_at) VALUES (?,?,?,?)', [PRIMARY_ORGANIZER_PLAYER_ID, 'Владелец', now, now]);
    await db.run(`INSERT INTO evening_participants (id,evening_id,player_id,response_status,registration_status,attendance_status,arrival_status,payment_status,amount_due,amount_paid,created_at,updated_at)
      VALUES ('ep-owner','ev',?,'going','going','attended','on_time','unpaid',0,0,?,?)`, [PRIMARY_ORGANIZER_PLAYER_ID, now, now]);
    await db.run("UPDATE games SET protocol_text = ? WHERE global_game_number = 3", [JSON.stringify({ version: 1, kind: 'club_evening_protocol', protocol: { status: 'completed' }, player_results: ['org', 'a', 'c', 'd', 'owner'].map((p) => ({ participant_id: `ep-${p}` })) })]);
    const created = await request(app).post('/api/evenings/ev/extensions').set('Cookie', cookie()).send({ games_count: 1, amount: 250 });
    expect(created.status).toBe(201);
    expect((await db.get<any>('SELECT extension_due FROM evening_participants WHERE id=?', ['ep-owner'])).extension_due).toBe(0);
    expect(await due('a')).toMatchObject({ extension_due: 83 });
    const removed = await request(app).delete(`/api/evenings/ev/extensions/${created.body.extensions[0].id}`).set('Cookie', cookie());
    expect(removed.status).toBe(200);
    expect(await due('a')).toMatchObject({ extension_due: 0, amount_due: 300 });
  });

  it('refuses nonsense input and needs the organizer', async () => {
    await seed();
    const post = (body: any) => request(app).post('/api/evenings/ev/extensions').set('Cookie', cookie()).send(body);
    expect((await post({ games_count: 0, amount: 250 })).status).toBe(400);
    expect((await post({ games_count: 2, amount: -5 })).status).toBe(400);
    expect((await post({ games_count: 2, amount: 12.5 })).status).toBe(400);
    expect((await request(app).post('/api/evenings/ev/extensions').send({ games_count: 1, amount: 250 })).status).toBe(401);
    expect((await request(app).post('/api/evenings/nope/extensions').set('Cookie', cookie()).send({ games_count: 1, amount: 250 })).status).toBe(404);
  });

  describe('other evening formats (rating, novice, tournament evening)', () => {
    const base = async (id: string) => (await db.get<any>('SELECT amount_due, extension_due, extension_total_due, payment_status FROM evening_participants WHERE id=?', [`ep-${id}`]));
    const setBase = (id: string, amount: number) => db.run("UPDATE evening_participants SET amount_due=?, extension_due=0, extension_total_due=0, payment_status='unpaid', amount_paid=0 WHERE id=?", [amount, `ep-${id}`]);

    it('adds the share on top of the price of a rating evening after it is closed, and takes it away again', async () => {
      await seed('RATING');
      for (const id of ['a', 'b', 'c', 'd']) await setBase(id, 600);
      const created = await request(app).post('/api/evenings/ev/extensions').set('Cookie', cookie()).send({ games_count: 1, amount: 250 });
      expect(created.status).toBe(201);
      // The last game: org (free), a, c, d → 83 ₽ each on top of the 600 ₽ prepayment.
      expect(await base('a')).toMatchObject({ amount_due: 683, extension_due: 83, payment_status: 'unpaid' });
      expect(await base('d')).toMatchObject({ amount_due: 683, extension_due: 83 });
      expect(await base('b')).toMatchObject({ amount_due: 600, extension_due: 0 });
      expect(await base('org')).toMatchObject({ extension_due: 0 });
      expect(await base('judge')).toMatchObject({ extension_due: 0 });
      const payments = await request(app).get('/api/evenings/ev/payments').set('Cookie', cookie());
      expect(payments.body.participants.find((p: any) => p.id === 'ep-a')).toMatchObject({ amount_due: 683, extension_due: 83 });
      // Asking again changes nothing (idempotent).
      expect(await base('a')).toMatchObject({ amount_due: 683 });
      await request(app).delete(`/api/evenings/ev/extensions/${created.body.extensions[0].id}`).set('Cookie', cookie());
      expect(await base('a')).toMatchObject({ amount_due: 600, extension_due: 0, extension_total_due: 0 });
      const ledger = await db.get<any>("SELECT COALESCE(SUM(amount),0) AS total FROM financial_transactions WHERE source_id='ep-a' AND type='debt_created'");
      expect(Number(ledger.total)).toBe(0);
    });

    it('survives another service rewriting the price, and a player who paid the price becomes a debtor for the extension', async () => {
      await seed('RATING');
      await setBase('a', 600);
      await db.run("UPDATE evening_participants SET amount_paid=600, payment_status='paid' WHERE id='ep-a'");
      await request(app).post('/api/evenings/ev/extensions').set('Cookie', cookie()).send({ games_count: 1, amount: 250 });
      expect(await base('a')).toMatchObject({ amount_due: 683, extension_due: 83, payment_status: 'partial' });
      // Another service recalculates the price of the evening and writes the bare 600 again.
      await db.run("UPDATE evening_participants SET amount_due=600 WHERE id='ep-a'");
      await request(app).get('/api/evenings/ev/payments').set('Cookie', cookie());
      expect(await base('a')).toMatchObject({ amount_due: 683, extension_due: 83 });
      const ledger = await db.get<any>("SELECT COALESCE(SUM(amount),0) AS total FROM financial_transactions WHERE source_id='ep-a' AND type='debt_created'");
      expect(Number(ledger.total)).toBe(83);
    });

    it('charges nothing before the evening is closed, and nobody who got a gifted evening', async () => {
      await seed('NOVICE', false);
      await setBase('a', 300);
      await request(app).post('/api/evenings/ev/extensions').set('Cookie', cookie()).send({ games_count: 1, amount: 250 });
      expect(await base('a')).toMatchObject({ amount_due: 300, extension_due: 0 });
      await db.run("INSERT INTO evening_fee_waivers (participant_id, evening_id, reason, waived_at, updated_at) VALUES ('ep-d','ev','Подарочный вечер',?,?)", [now, now]);
      await setBase('d', 0);
      await db.run("UPDATE game_evenings SET status='completed', settled_at=? WHERE id='ev'", [now]);
      await request(app).get('/api/evenings/ev/payments').set('Cookie', cookie());
      expect(await base('a')).toMatchObject({ amount_due: 383, extension_due: 83 });
      expect(await base('d')).toMatchObject({ extension_due: 0 });
    });
  });
});
