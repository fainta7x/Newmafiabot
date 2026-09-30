import { afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.ts';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { generateOrganizerToken, generatePlayerSessionToken } from '../server/auth.ts';
import { loadAgenda } from '../server/services/organizerAgendaService.ts';

const opened: DatabaseWrapper[] = [];
afterEach(() => { while (opened.length) opened.pop()?.sqlite.close(); });

async function setup() {
  const db = createDatabaseConnection(':memory:'); opened.push(db);
  const app = await createApp(db);
  const stamp = new Date().toISOString();
  await db.run(`INSERT INTO players (id,nickname,telegram_user_id,curator_areas,created_at,updated_at) VALUES
    ('smm','Смм','11','SMM',?,?), ('two','Двое','12','NOVICES,EVENTS',?,?), ('plain','Игрок','13',NULL,?,?)`, [stamp, stamp, stamp, stamp, stamp, stamp]);
  return { db, app, organizer: `organizer_token=${generateOrganizerToken()}`, as: (id: string) => `player_token=${generatePlayerSessionToken(id)}` };
}

describe('curator tasks', () => {
  it('the organizer gives a task, the curator sees it at home and marks it done', async () => {
    const { db, app, organizer, as } = await setup();
    expect((await request(app).post('/api/curator-tasks').set('Cookie', organizer).send({ curator_player_id: 'plain', title: 'Что-то' })).status).toBe(400);
    expect((await request(app).post('/api/curator-tasks').set('Cookie', organizer).send({ curator_player_id: 'two', area: 'SMM', title: 'Пост' })).status).toBe(400);
    expect((await request(app).post('/api/curator-tasks').set('Cookie', as('smm')).send({ curator_player_id: 'smm', title: 'Сам себе' })).status).toBe(401);
    const created = await request(app).post('/api/curator-tasks').set('Cookie', organizer).send({ curator_player_id: 'smm', title: 'Выложить фото с пятницы', due_at: '2030-01-05T21:00:00+03:00' });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    expect(created.body).toMatchObject({ area: 'SMM', status: 'todo', curator_nickname: 'Смм' });
    // The curator is told in the bot.
    expect(await db.get<any>("SELECT event_type FROM personal_notification_deliveries WHERE notification_key = ?", [`curator-task:${created.body.id}`])).toMatchObject({ event_type: 'curator_task' });

    expect((await request(app).get('/api/player/curator-tasks').set('Cookie', as('two'))).body.tasks).toEqual([]);
    expect((await request(app).post(`/api/player/curator-tasks/${created.body.id}/done`).set('Cookie', as('two')).send({})).status).toBe(404);
    const own = await request(app).get('/api/player/curator-tasks').set('Cookie', as('smm'));
    expect(own.body.tasks.map((task: any) => task.title)).toEqual(['Выложить фото с пятницы']);
    expect((await request(app).post(`/api/player/curator-tasks/${created.body.id}/done`).set('Cookie', as('smm')).send({ note: 'Выложил 12 фото' })).status).toBe(200);

    const list = await request(app).get('/api/curator-tasks').set('Cookie', organizer);
    expect(list.body.open).toEqual([]);
    expect(list.body.closed[0]).toMatchObject({ status: 'done', done_note: 'Выложил 12 фото' });
    expect(list.body.curators.map((item: any) => item.nickname)).toEqual(['Двое', 'Смм']);
  });

  it('a done task keeps the curator out of «Кураторы: узнать, как дела»; cancelling works', async () => {
    const { app, db, organizer, as } = await setup();
    const peopleOf = async () => ((await loadAgenda(db)).items.find((item) => item.id === 'people:curators')?.people || []).map((person) => person.player_id);
    expect(await peopleOf()).toEqual(['two', 'smm']);
    const task = await request(app).post('/api/curator-tasks').set('Cookie', organizer).send({ curator_player_id: 'smm', title: 'Сторис' });
    await request(app).post(`/api/player/curator-tasks/${task.body.id}/done`).set('Cookie', as('smm')).send({});
    expect(await peopleOf()).toEqual(['two']);
    const other = await request(app).post('/api/curator-tasks').set('Cookie', organizer).send({ curator_player_id: 'two', area: 'EVENTS', title: 'Квиз' });
    expect((await request(app).post(`/api/curator-tasks/${other.body.id}/cancel`).set('Cookie', organizer)).status).toBe(200);
    expect((await request(app).post(`/api/curator-tasks/${other.body.id}/cancel`).set('Cookie', organizer)).status).toBe(404);
  });
});
