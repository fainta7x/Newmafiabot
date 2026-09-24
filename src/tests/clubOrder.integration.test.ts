import { afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.ts';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { generateOrganizerToken } from '../server/auth.ts';
import { loadClubOrder } from '../server/services/clubOrderService.ts';

const opened: DatabaseWrapper[] = [];
afterEach(() => { while (opened.length) opened.pop()?.sqlite.close(); });

const NOW = Date.parse('2026-09-24T12:00:00+03:00');
const at = (hours: number) => new Date(NOW + hours * 3_600_000).toISOString();

async function setup() {
  const db = createDatabaseConnection(':memory:'); opened.push(db);
  const app = await createApp(db);
  const stamp = new Date().toISOString();
  const evening = (id: string, startsAt: string, status: string, settled: string | null = null) => db.run(
    `INSERT INTO game_evenings (id,title,starts_at,timezone,format,status,capacity,default_price,settled_at,created_at,updated_at)
     VALUES (?,?,?,'Europe/Moscow','CASUAL',?,20,100,?,?,?)`, [id, `Вечер ${id}`, startsAt, status, settled, stamp, stamp]);
  const player = (id: string, nickname: string, extra: Record<string, unknown> = {}) => db.run(
    `INSERT INTO players (id,nickname,telegram_user_id,game_level,tokens,created_at,updated_at) VALUES (?,?,?,?,0,?,?)`,
    [id, nickname, extra.telegram ?? `tg-${id}`, extra.level ?? 'club', stamp, stamp]);
  const attend = (eveningId: string, playerId: string, due = 0, paid = 0) => db.run(
    `INSERT INTO evening_participants (id,evening_id,player_id,response_status,attendance_status,payment_status,amount_due,amount_paid,created_at,updated_at)
     VALUES (?,?,?,'going','attended',?,?,?,?,?)`, [`${eveningId}:${playerId}`, eveningId, playerId, paid >= due ? 'paid' : 'unpaid', due, paid, stamp, stamp]);
  return { db, app, evening, player, attend };
}

describe('«Порядок в клубе»', () => {
  it('lists evenings, statuses, profiles and money that need the organizer', async () => {
    const { db, evening, player, attend } = await setup();
    await evening('old', at(-48), 'published');
    await evening('soon', at(30), 'draft');
    await evening('paid', at(-24 * 5), 'completed', at(-24 * 5 + 5));
    await player('a', 'Аня');
    await player('b', 'аня ');
    await player('c', 'Ваня', { telegram: '', level: 'unrated' });
    await attend('paid', 'a', 300, 100);
    await attend('paid', 'c');
    await db.run(`INSERT INTO games (id,evening_id,global_game_number,game_date,winner_team,winner_label,judge_name,protocol_text,slots_json,created_at) VALUES (1,'paid',1,?,'draft','','Судья','','[]',?)`, [at(-24 * 5), at(-24 * 5)]);

    const ids = (await loadClubOrder(db, NOW)).items.map((item) => item.id);
    expect(ids).toEqual(expect.arrayContaining([
      'unclosed:old', 'draft:soon', 'organizer:soon', 'level-missing', 'duplicates:a,b', 'no-contact', 'protocols:paid', 'debts:paid',
    ]));
    expect(ids).not.toContain('no-evening');
    expect(ids).not.toContain('inactive');
  });

  it('drops an item once it is fixed', async () => {
    const { db, evening, player, attend } = await setup();
    await evening('paid', at(-24 * 5), 'completed', at(-24 * 5 + 5));
    await evening('next', at(24 * 3), 'published');
    await player('a', 'Аня');
    await attend('paid', 'a', 300, 100);
    expect((await loadClubOrder(db, NOW)).items.map((item) => item.id)).toEqual(['debts:paid']);
    await db.run("UPDATE evening_participants SET amount_paid = 300, payment_status = 'paid'");
    expect((await loadClubOrder(db, NOW)).items).toEqual([]);
  });

  it('asks for an evening when the week is empty and flags players who stopped coming', async () => {
    const { db, evening, player, attend } = await setup();
    await evening('long-ago', at(-24 * 120), 'completed', at(-24 * 120 + 5));
    await player('a', 'Аня');
    await attend('long-ago', 'a');
    const ids = (await loadClubOrder(db, NOW)).items.map((item) => item.id);
    expect(ids).toEqual(['no-evening', 'inactive']);
  });

  it('lets the organizer confirm namesakes are different people until a new namesake appears', async () => {
    const { db, app, player } = await setup();
    await player('a', 'Аня');
    await player('b', 'аня');
    const cookie = `organizer_token=${generateOrganizerToken()}`;
    const ids = async () => (await loadClubOrder(db, NOW)).items.map((item) => item.id).filter((id) => id.startsWith('duplicates'));
    expect(await ids()).toEqual(['duplicates:a,b']);
    expect((await request(app).post('/api/crm/club-order/dismiss').set('Cookie', cookie).send({ id: 'debts:x' })).status).toBe(400);
    expect((await request(app).post('/api/crm/club-order/dismiss').set('Cookie', cookie).send({ id: 'duplicates:a,b' })).status).toBe(200);
    expect(await ids()).toEqual([]);
    await player('c', 'АНЯ');
    expect(await ids()).toEqual(['duplicates:a,b,c']);
  });

  it('is served to organizers on the home screen endpoint', async () => {
    const { app } = await setup();
    const response = await request(app).get('/api/crm/club-order').set('Cookie', `organizer_token=${generateOrganizerToken()}`);
    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toContain('no-store');
    expect(response.body.categories.money).toBe('Игры и деньги');
    expect((await request(app).get('/api/crm/club-order')).status).toBe(401);
  });
});
