import crypto from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import Database from 'better-sqlite3';
import type { DatabaseWrapper } from '../db/index.ts';

import { generatePlayerSessionToken, testEnvironmentPlayerId } from '../server/auth.ts';
import { createRobokassaTestRoutes } from '../server/routes/robokassaTestRoutes.ts';

let sqlite: Database.Database;
let production: Database.Database;
let db: DatabaseWrapper;
let app: express.Express;
let queue = Promise.resolve();
const config = { login: 'fixture-shop', password1: 'fixture-one', password2: 'fixture-two' };
const callback = (id: string, sum = '250.000000', secret = config.password2) => ({
  InvId: id, OutSum: sum, Shp_mode: 'test',
  SignatureValue: crypto.createHash('sha256').update(`${sum}:${id}:${secret}:Shp_mode=test`).digest('hex'),
});
const checkout = (player = 'p1', participant = 'ep1', sandbox = 'true') => request(app)
  .post(`/api/payments/robokassa/test/checkout/${participant}`)
  .set('Cookie', session(player, sandbox === 'true')).send({ amount_rub: 1 });
const session = (player = 'p1', sandbox = true) => `player_token=${generatePlayerSessionToken(sandbox ? testEnvironmentPlayerId(player) : player)}`;
const result = (fields: Record<string, unknown>) => request(app).post('/api/payments/robokassa/result').type('form').send(fields);

beforeEach(() => {
  vi.stubEnv('ROBOKASSA_TEST_ENABLED', 'true');
  vi.stubEnv('ROBOKASSA_MERCHANT_LOGIN', config.login);
  vi.stubEnv('ROBOKASSA_TEST_PASSWORD1', config.password1);
  vi.stubEnv('ROBOKASSA_TEST_PASSWORD2', config.password2);
  vi.stubEnv('ROBOKASSA_HASH_ALGORITHM', 'sha256');
  queue = Promise.resolve();
  sqlite = new Database(':memory:');
  production = new Database(':memory:');
  production.exec(`CREATE TABLE evening_participants (id TEXT PRIMARY KEY, amount_due INTEGER, amount_paid INTEGER);
    INSERT INTO evening_participants VALUES ('ep1', 400, 150);`);
  sqlite.exec(`CREATE TABLE game_evenings (id TEXT PRIMARY KEY, title TEXT, status TEXT, format TEXT, settled_at TEXT);
    CREATE TABLE evening_participants (id TEXT PRIMARY KEY, player_id TEXT, evening_id TEXT, response_status TEXT,
      registration_status TEXT, attendance_status TEXT, payment_status TEXT, amount_due INTEGER, amount_paid INTEGER);
    CREATE TABLE token_ledger (id TEXT PRIMARY KEY);
    INSERT INTO game_evenings VALUES ('e1','Вечер','completed','CASUAL','2026-10-09');
    INSERT INTO evening_participants VALUES ('ep1','p1','e1','going','going','attended','partial',400,150);`);
  db = {
    sqlite, dbPath: ':memory:',
    async get(sql: string, params: any[] = []) { return sqlite.prepare(sql).get(...params) || null; },
    async all(sql: string, params: any[] = []) { return sqlite.prepare(sql).all(...params); },
    async run(sql: string, params: any[] = []) { const info = sqlite.prepare(sql).run(...params); return { changes: info.changes, lastID: info.lastInsertRowid }; },
    async exec(sql: string) { sqlite.exec(sql); },
    async transaction<T>(cb: (tx: DatabaseWrapper) => Promise<T>): Promise<T> {
      const prior = queue;
      let release = () => {};
      queue = new Promise<void>(resolve => { release = resolve; });
      await prior;
      sqlite.exec('BEGIN');
      try { const value = await cb(db); sqlite.exec('COMMIT'); return value; }
      catch (error) { sqlite.exec('ROLLBACK'); throw error; }
      finally { release(); }
    },
  } as DatabaseWrapper;
  app = express();
  app.use(cookieParser());
  app.use(express.json());
  // Simulate a production-default request DB. The provider route must ignore it.
  app.use((req, _res, next) => {
    req.db = { sqlite: production, dbPath: 'fixture-production',
      async get(sql: string, params: any[] = []) { return production.prepare(sql).get(...params) || null; },
      async transaction() { throw new Error('Production writes forbidden in fixture'); },
    } as unknown as DatabaseWrapper;
    next();
  });
  app.use('/api/payments/robokassa', createRobokassaTestRoutes(async () => db));
  app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => res.status(err.status || 500).json({ error: err.message }));
});
afterEach(() => { sqlite.close(); production.close(); vi.unstubAllEnvs(); });

describe('isolated Robokassa test payment HTTP flow', () => {
  it('requires an authenticated sandbox player and uses only their server-owned obligation', async () => {
    expect((await request(app).post('/api/payments/robokassa/test/checkout/ep1')).status).toBe(401);
    expect((await checkout('p1', 'ep1', 'false')).status).toBe(403);
    expect((await checkout('p2')).status).toBe(404);
    const response = await checkout();
    expect(response.status).toBe(200);
    expect(response.body.fields).toMatchObject({ OutSum: '250.00', MerchantLogin: config.login, IsTest: '1', Shp_mode: 'test' });
    expect(JSON.stringify(response.body)).not.toContain(config.password1);
    expect(JSON.stringify(response.body)).not.toContain(config.password2);
  });

  it('reuses one durable invoice for simultaneous checkout requests', async () => {
    const responses = await Promise.all([checkout(), checkout(), checkout()]);
    expect(responses.every(r => r.status === 200)).toBe(true);
    expect(new Set(responses.map(r => r.body.invoice_id)).size).toBe(1);
    expect(sqlite.prepare('SELECT COUNT(*) AS n FROM robokassa_test_invoices').get()).toEqual({ n: 1 });
  });

  it('confirms once without cookies, debts, tokens or receipt claims, including concurrent retries', async () => {
    const id = (await checkout()).body.invoice_id;
    const responses = await Promise.all([result(callback(id)), result(callback(id)), result(callback(id))]);
    expect(responses.map(r => r.text)).toEqual([`OK${id}`, `OK${id}`, `OK${id}`]);
    expect((await result(callback(id)).set('Cookie', session('p1', false))).text).toBe(`OK${id}`);
    expect((await result(callback(id)).set('Cookie', session())).text).toBe(`OK${id}`);
    const invoice = sqlite.prepare('SELECT status, confirmed_at FROM robokassa_test_invoices WHERE id = ?').get(id) as any;
    expect(invoice.status).toBe('confirmed'); expect(invoice.confirmed_at).toBeTruthy();
    expect(sqlite.prepare('SELECT amount_due, amount_paid FROM evening_participants').get()).toEqual({ amount_due: 400, amount_paid: 150 });
    expect(sqlite.prepare('SELECT COUNT(*) AS n FROM token_ledger').get()).toEqual({ n: 0 });
    expect(production.prepare('SELECT amount_due, amount_paid FROM evening_participants').get()).toEqual({ amount_due: 400, amount_paid: 150 });
    expect(production.prepare("SELECT name FROM sqlite_master WHERE name = 'robokassa_test_invoices'").get()).toBeUndefined();
    const status = await request(app).get(`/api/payments/robokassa/test/invoices/${id}`).set('Cookie', session());
    expect(status.body).toMatchObject({ status: 'confirmed', test: true });
    expect((await request(app).get(`/api/payments/robokassa/test/invoices/${id}`).set('Cookie', session('p2'))).status).toBe(404);
  });

  it('rejects forged amounts, ids, signatures, modes, extra or duplicate custom parameters', async () => {
    const id = (await checkout()).body.invoice_id;
    for (const fields of [callback(id, '1.00'), callback(id, '250.00', 'wrong'), callback('123'),
      { ...callback(id), Shp_mode: 'live' }, { ...callback(id), Shp_extra: 'ignored' }]) {
      expect((await result(fields)).status).toBe(400);
    }
    const encoded = new URLSearchParams(callback(id)).toString();
    for (const duplicate of ['InvId', 'OutSum', 'Shp_mode', 'SignatureValue']) {
      expect((await request(app).post('/api/payments/robokassa/result').type('form').send(`${encoded}&${duplicate}=bad`)).status).toBe(400);
    }
    expect((await request(app).post('/api/payments/robokassa/result').send(callback(id))).status).toBe(415);
    expect(sqlite.prepare('SELECT status, confirmed_at FROM robokassa_test_invoices').get()).toEqual({ status: 'pending', confirmed_at: null });
  });

  it('never treats success/fail redirects as evidence of payment', async () => {
    const id = (await checkout()).body.invoice_id;
    for (const outcome of ['success', 'fail']) {
      const response = await request(app).get(`/api/payments/robokassa/${outcome}?InvId=${id}&OutSum=250&SignatureValue=forged`);
      expect(response.status).toBe(303);
      expect(response.headers.location).toBe(`/player/wallet?robokassa_test_return=${outcome}&robokassa_test_invoice=${id}`);
    }
    expect(sqlite.prepare('SELECT status FROM robokassa_test_invoices').get()).toEqual({ status: 'pending' });
  });

  it.each(["UPDATE evening_participants SET amount_due = 300", "UPDATE evening_participants SET amount_paid = 400",
    "UPDATE evening_participants SET payment_status = 'waived'", "UPDATE game_evenings SET status = 'cancelled'"])(
    'keeps changed obligations in explicit reconciliation: %s', async sql => {
      const id = (await checkout()).body.invoice_id;
      sqlite.exec(sql);
      const response = await result(callback(id));
      expect(response.text).toBe(`OK${id}`);
      expect(sqlite.prepare('SELECT status FROM robokassa_test_invoices').get()).toEqual({ status: 'needs_review' });
  });

  it('replaces a stale invoice and marks its later signed confirmation for review', async () => {
    const old = (await checkout()).body.invoice_id;
    sqlite.exec('UPDATE evening_participants SET amount_due = 500');
    const current = (await checkout()).body.invoice_id;
    expect(current).not.toBe(old);
    expect((await result(callback(old))).text).toBe(`OK${old}`);
    expect(sqlite.prepare('SELECT status FROM robokassa_test_invoices WHERE id = ?').get(old)).toEqual({ status: 'needs_review' });
  });

  it('fails closed when test activation or test secrets are missing', async () => {
    vi.stubEnv('ROBOKASSA_TEST_ENABLED', 'false');
    expect((await checkout()).status).toBe(503);
    expect((await result(callback('123'))).status).toBe(503);
    vi.stubEnv('ROBOKASSA_TEST_ENABLED', 'true'); vi.stubEnv('ROBOKASSA_TEST_PASSWORD2', '');
    expect((await checkout()).status).toBe(503);
  });

  it('does not expose an acknowledgement when durable persistence fails', async () => {
    const id = (await checkout()).body.invoice_id;
    sqlite.exec("CREATE TRIGGER refuse_test_confirmation BEFORE UPDATE ON robokassa_test_invoices BEGIN SELECT RAISE(ABORT, 'fixture storage failure'); END;");
    expect((await result(callback(id))).status).toBe(500);
    expect(sqlite.prepare('SELECT status, confirmed_at FROM robokassa_test_invoices').get()).toEqual({ status: 'pending', confirmed_at: null });
  });
});
