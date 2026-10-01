import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import Database from 'better-sqlite3';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../app.ts';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';

const opened: DatabaseWrapper[] = [];
afterEach(() => { while (opened.length) opened.pop()?.sqlite.close(); vi.unstubAllEnvs(); });

const binary = (res: any, done: (error: Error | null, body: Buffer) => void) => {
  const chunks: Buffer[] = [];
  res.on('data', (chunk: Buffer) => chunks.push(chunk));
  res.on('end', () => done(null, Buffer.concat(chunks)));
};

describe('weekly anonymized snapshot', () => {
  it('needs the dedicated key and leaves no personal data or secrets in the copy', async () => {
    vi.stubEnv('DEVELOPER_READ_KEY', 'dev-key-for-tests-0000000000');
    vi.stubEnv('BOT_API_SECRET', 'bot-secret-for-tests-000000000');
    const db = createDatabaseConnection(':memory:'); opened.push(db);
    const app = await createApp(db);
    const now = new Date().toISOString();
    await db.run(`INSERT INTO players (id,nickname,full_name,phone,telegram_user_id,telegram_username,notes,tokens,lifecycle_status,source,created_at,updated_at)
      VALUES ('p1','Денди','Елизавета Настоящая','+79990001122','555000111','dendi_real','позвонить маме',42,'normal','telegram',?,?)`, [now, now]);
    await db.run(`CREATE TABLE test_login_sessions (id TEXT PRIMARY KEY, session_hash TEXT)`);
    await db.run(`INSERT INTO test_login_sessions (id, session_hash) VALUES ('s1', 'secret-session')`);

    expect((await request(app).post('/__developer-read/snapshot')).status).toBe(401);
    expect((await request(app).post('/__developer-read/snapshot').set('X-Bot-Token', 'bot-secret-for-tests-000000000')).status).toBe(401);

    const response = await request(app).post('/__developer-read/snapshot')
      .set('X-Developer-Read-Key', 'dev-key-for-tests-0000000000').buffer(true).parse(binary);
    expect(response.status, String(response.body)).toBe(200);
    expect(JSON.parse(String(response.headers['x-snapshot-stats'])).wiped_tables).toBeGreaterThan(0);

    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'snapshot-test-')), 'copy.sqlite');
    const raw = zlib.gunzipSync(response.body as Buffer);
    fs.writeFileSync(file, raw);
    const copy = new Database(file, { readonly: true });
    try {
      expect(copy.prepare("SELECT nickname, full_name, phone, telegram_username, notes, tokens, telegram_user_id FROM players WHERE id = 'p1'").get())
        .toMatchObject({ nickname: 'Денди', full_name: null, phone: null, telegram_username: null, notes: null, tokens: 42 });
      expect(String((copy.prepare("SELECT telegram_user_id FROM players WHERE id = 'p1'").get() as any).telegram_user_id)).toMatch(/^anon-/);
      expect(copy.prepare('SELECT COUNT(*) AS count FROM test_login_sessions').get()).toEqual({ count: 0 });
      for (const secret of ['+79990001122', 'Елизавета Настоящая', '555000111', 'dendi_real', 'secret-session', 'позвонить маме']) {
        expect(raw.includes(Buffer.from(secret))).toBe(false);
      }
    } finally { copy.close(); }
    // The live database is untouched.
    expect(await db.get<any>("SELECT phone FROM players WHERE id = 'p1'")).toEqual({ phone: '+79990001122' });
  });
});
