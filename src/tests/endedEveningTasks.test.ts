import { afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.ts';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { generateOrganizerToken } from '../server/auth.ts';
import { closeTasksOfEndedEvenings, ensureEveningCloseoutTask } from '../server/services/eveningCloseoutService.ts';

const opened: DatabaseWrapper[] = [];
afterEach(() => { while (opened.length) opened.pop()?.sqlite.close(); });

async function setup() {
  const db = createDatabaseConnection(':memory:'); opened.push(db);
  const app = await createApp(db);
  const stamp = new Date().toISOString();
  const evening = (id: string, status: string, settled: string | null = null) => db.run(
    `INSERT INTO game_evenings (id,title,starts_at,timezone,format,status,capacity,default_price,settled_at,created_at,updated_at)
     VALUES (?,?,?,'Europe/Moscow','CASUAL',?,20,100,?,?,?)`, [id, `Вечер ${id}`, '2026-09-25T18:00:00.000Z', status, settled, stamp, stamp]);
  const task = (id: string, eveningId: string | null, key: string | null = null) => db.run(
    `INSERT INTO organizer_tasks (id,title,type,status,priority,automation_key,evening_id,created_at,updated_at)
     VALUES (?,?,'reminder','todo','high',?,?,?,?)`, [id, `Задача ${id}`, key, eveningId, stamp, stamp]);
  const status = async (id: string) => (await db.get<any>('SELECT status FROM organizer_tasks WHERE id = ?', [id]))?.status;
  return { db, app, evening, task, status };
}

describe('tasks of evenings that no longer happen', () => {
  it('cancels tasks of cancelled and deleted evenings and marks a closed evening\'s closeout done', async () => {
    const { db, evening, task, status } = await setup();
    await evening('copy', 'cancelled');
    await evening('live', 'published');
    await evening('closed', 'completed', new Date().toISOString());
    await task('copy-close', 'copy', 'evening-close:copy');
    await task('copy-manual', 'copy');
    await task('gone-close', null, 'evening-close:gone');
    await task('live-close', 'live', 'evening-close:live');
    await task('closed-close', 'closed', 'evening-close:closed');
    await task('free', null);

    await closeTasksOfEndedEvenings(db);

    expect(await status('copy-close')).toBe('cancelled');
    expect(await status('copy-manual')).toBe('cancelled');
    expect(await status('gone-close')).toBe('cancelled');
    expect(await status('closed-close')).toBe('done');
    expect(await status('live-close')).toBe('todo');
    expect(await status('free')).toBe('todo');
  });

  it('a cancelled evening does not keep or get back its closeout task', async () => {
    const { db } = await setup();
    const stamp = new Date().toISOString();
    await db.run(`INSERT INTO game_evenings (id,title,starts_at,timezone,format,status,capacity,default_price,created_at,updated_at)
      VALUES ('e1','Вечер e1',?,'Europe/Moscow','CASUAL','published',20,100,?,?)`, [new Date(Date.now() - 3_600_000).toISOString(), stamp, stamp]);
    await ensureEveningCloseoutTask(db, 'e1');
    await db.run("UPDATE game_evenings SET status = 'cancelled' WHERE id = 'e1'");
    await ensureEveningCloseoutTask(db, 'e1');
    const row = await db.get<any>("SELECT status FROM organizer_tasks WHERE automation_key = 'evening-close:e1'");
    expect(row.status).toBe('cancelled');
  });

  it('the task list no longer shows cancelled copies', async () => {
    const { app, evening, task } = await setup();
    await evening('copy', 'cancelled');
    await evening('live', 'published');
    await task('copy-close', 'copy', 'evening-close:copy');
    await task('live-close', 'live', 'evening-close:live');
    const response = await request(app).get('/api/tasks?active=true').set('Authorization', `Bearer ${generateOrganizerToken()}`);
    expect(response.status).toBe(200);
    expect(response.body.map((item: any) => item.id)).toEqual(['live-close']);
  });

  it('«Закрыть вечер» appears only once the evening has started', async () => {
    const { db } = await setup();
    const stamp = new Date().toISOString();
    const at = (hours: number) => new Date(Date.now() + hours * 3_600_000).toISOString();
    const evening = (id: string, startsAt: string) => db.run(
      `INSERT INTO game_evenings (id,title,starts_at,timezone,format,status,capacity,default_price,created_at,updated_at)
       VALUES (?,?,?,'Europe/Moscow','CASUAL','published',20,100,?,?)`, [id, `Вечер ${id}`, startsAt, stamp, stamp]);
    await evening('future', at(24 * 20));
    await evening('past', at(-3));
    await evening('early', at(2));
    await db.run("UPDATE game_evenings SET status = 'active' WHERE id = 'early'");
    // A task left from before: a far-away Friday with an open «Закрыть вечер».
    await db.run(`INSERT INTO organizer_tasks (id,title,type,status,priority,automation_key,evening_id,created_at,updated_at)
      VALUES ('old','Закрыть вечер · Вечер future','reminder','todo','high','evening-close:future','future',?,?)`, [stamp, stamp]);
    expect(await ensureEveningCloseoutTask(db, 'future')).toBeNull();

    await closeTasksOfEndedEvenings(db);

    const status = async (key: string) => (await db.get<any>('SELECT status FROM organizer_tasks WHERE automation_key = ?', [key]))?.status;
    expect(await status('evening-close:future')).toBe('cancelled');
    expect(await status('evening-close:past')).toBe('todo');
    // Started before its time: the task is there at once.
    expect(await status('evening-close:early')).toBe('todo');
  });
});
