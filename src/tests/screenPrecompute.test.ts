import { afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.ts';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { generateOrganizerToken } from '../server/auth.ts';
import { cachedScreen, invalidateScreens, SCREEN_MAX_AGE_MS, warmScreens } from '../server/services/screenPrecomputeService.ts';

const opened: DatabaseWrapper[] = [];
afterEach(() => { while (opened.length) opened.pop()?.sqlite.close(); });
const fresh = () => { const db = createDatabaseConnection(':memory:'); opened.push(db); return db; };

describe('«Экраны без подгрузки»: ready organizer screens', () => {
  it('serves the ready answer, recomputes it when it is old or after a change', async () => {
    const db = fresh();
    let runs = 0;
    const compute = async () => ({ run: ++runs });
    expect(await cachedScreen(db, 'x', compute)).toEqual({ run: 1 });
    expect(await cachedScreen(db, 'x', compute)).toEqual({ run: 1 });
    expect(await cachedScreen(db, 'x', compute, Date.now() + SCREEN_MAX_AGE_MS + 1)).toEqual({ run: 2 });
    invalidateScreens(db, { recompute: false });
    expect(await cachedScreen(db, 'x', compute)).toEqual({ run: 3 });
  });

  it('does not keep an answer computed while a change was happening', async () => {
    const db = fresh();
    let runs = 0;
    let release!: () => void;
    const slow = () => new Promise<number>((resolve) => { release = () => resolve(++runs); });
    const pending = cachedScreen(db, 'y', slow);
    invalidateScreens(db, { recompute: false });
    release();
    expect(await pending).toBe(1);
    const next = cachedScreen(db, 'y', slow);
    release();
    expect(await next).toBe(2);
  });

  it('two requests at once share one computation', async () => {
    const db = fresh();
    let runs = 0;
    const compute = async () => { runs += 1; await new Promise((r) => { setTimeout(r, 5); }); return runs; };
    await Promise.all([cachedScreen(db, 'z', compute), cachedScreen(db, 'z', compute)]);
    expect(runs).toBe(1);
  });

  it('a change through the API makes «Сегодня» current again', async () => {
    const db = fresh();
    const app = await createApp(db);
    const now = new Date().toISOString();
    const cookie = `organizer_token=${generateOrganizerToken()}`;
    await warmScreens(db);
    const before = await request(app).get('/api/crm/command-center').set('Cookie', cookie);
    expect(before.status).toBe(200);
    expect(before.body.snapshot).toBeNull();
    await db.run(`INSERT INTO game_evenings (id,title,starts_at,timezone,format,status,capacity,default_price,created_at,updated_at)
      VALUES ('ev','Вечер',?,'Europe/Moscow','CASUAL','active',20,0,?,?)`, [now, now, now]);
    // Written past the API: the ready answer stays until it is old or the API changes something.
    expect((await request(app).get('/api/crm/command-center').set('Cookie', cookie)).body.snapshot).toBeNull();
    await request(app).post('/api/crm/nothing-here').set('Cookie', cookie);
    const after = await request(app).get('/api/crm/command-center').set('Cookie', cookie);
    expect(after.body.snapshot?.evening?.id).toBe('ev');
    expect(after.body.snapshot?.payment_context?.scope).toBe('current_or_upcoming_evening');
  });
});
