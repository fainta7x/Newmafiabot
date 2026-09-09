import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../app';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index';
import { generateOrganizerToken } from '../server/auth';

describe('CRM-PAY-003-R2 canonical regular evening writes', () => {
  let db: DatabaseWrapper;
  let app: Awaited<ReturnType<typeof createApp>>;
  const auth = () => ({ Cookie: `organizer_token=${generateOrganizerToken()}` });
  const now = '2026-09-09T12:00:00.000Z';

  beforeEach(async () => {
    db = createDatabaseConnection(':memory:');
    app = await createApp(db);
  });

  afterEach(() => {
    try { db.sqlite.close(); } catch {}
  });

  it('creates CASUAL and legacy STANDARD evenings with canonical 100 ₽ persisted before response', async () => {
    for (const format of ['CASUAL', 'STANDARD'] as const) {
      const response = await request(app)
        .post('/api/evenings')
        .set(auth())
        .send({
          title: `Regular ${format}`,
          starts_at: '2026-09-11T20:00:00+03:00',
          format,
          status: 'draft',
          capacity: 20,
          default_price: 600,
        });
      expect(response.status, JSON.stringify(response.body)).toBe(201);
      expect(response.body.default_price).toBe(100);
      expect(response.body.price_per_game).toBe(100);
      expect(response.body.format).toBe('CASUAL');

      const stored = await db.get<any>(
        `SELECT e.default_price, s.price_per_game
           FROM game_evenings e
           JOIN evening_slot_settings s ON s.evening_id = e.id
          WHERE e.id = ?`,
        [response.body.id],
      );
      expect(stored).toMatchObject({ default_price: 100, price_per_game: 100 });
    }
  });

  it('creates next Friday with 100 ₽ without inheriting a prior 600 ₽ evening', async () => {
    await db.run(
      `INSERT INTO game_evenings
       (id,title,starts_at,timezone,format,status,capacity,default_price,created_at,updated_at)
       VALUES ('expensive-source','Other format','2026-09-10T20:00:00+03:00','Europe/Moscow','TOURNAMENT','draft',20,600,?,?)`,
      [now, now],
    );

    const response = await request(app)
      .post('/api/evenings/create-next-friday')
      .set(auth())
      .send({});
    expect(response.status, JSON.stringify(response.body)).toBe(201);
    expect(response.body.default_price).toBe(100);
    expect(response.body.price_per_game).toBe(100);

    const stored = await db.get<any>(
      `SELECT e.default_price, s.price_per_game
         FROM game_evenings e
         JOIN evening_slot_settings s ON s.evening_id = e.id
        WHERE e.id = ?`,
      [response.body.id],
    );
    expect(stored).toMatchObject({ default_price: 100, price_per_game: 100 });
  });

  it('duplicates a regular evening without copying legacy evening or table prices', async () => {
    await db.run(
      `INSERT INTO game_evenings
       (id,title,starts_at,timezone,format,status,capacity,default_price,created_at,updated_at)
       VALUES ('legacy-regular','Legacy regular','2026-09-20T20:00:00+03:00','Europe/Moscow','STANDARD','draft',20,600,?,?)`,
      [now, now],
    );
    await db.run(
      `INSERT INTO evening_tables
       (id,evening_id,name,format,capacity,default_price,sort_order,created_at,updated_at)
       VALUES ('legacy-table','legacy-regular','Стол 1','STANDARD',10,600,1,?,?)`,
      [now, now],
    );

    const response = await request(app)
      .post('/api/evenings/duplicate-last')
      .set(auth())
      .send({});
    expect(response.status, JSON.stringify(response.body)).toBe(201);
    expect(response.body.default_price).toBe(100);
    expect(response.body.price_per_game).toBe(100);
    expect(response.body.tables).toEqual(expect.arrayContaining([
      expect.objectContaining({ default_price: 100 }),
    ]));

    const stored = await db.get<any>(
      `SELECT e.default_price, s.price_per_game
         FROM game_evenings e
         JOIN evening_slot_settings s ON s.evening_id = e.id
        WHERE e.id = ?`,
      [response.body.id],
    );
    expect(stored).toMatchObject({ default_price: 100, price_per_game: 100 });
    const table = await db.get<any>('SELECT default_price FROM evening_tables WHERE evening_id = ? LIMIT 1', [response.body.id]);
    expect(Number(table?.default_price)).toBe(100);
  });

  it('normalizes every update of an existing CASUAL evening before the database write', async () => {
    await db.run(
      `INSERT INTO game_evenings
       (id,title,starts_at,timezone,format,status,capacity,default_price,created_at,updated_at)
       VALUES ('bad-casual','Bad casual','2026-09-21T20:00:00+03:00','Europe/Moscow','CASUAL','draft',20,600,?,?)`,
      [now, now],
    );

    const response = await request(app)
      .patch('/api/evenings/bad-casual')
      .set(auth())
      .send({ notes: 'normalized now', default_price: 500 });
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(response.body.default_price).toBe(100);
    expect(response.body.price_per_game).toBe(100);

    const stored = await db.get<any>(
      `SELECT e.default_price, s.price_per_game
         FROM game_evenings e
         JOIN evening_slot_settings s ON s.evening_id = e.id
        WHERE e.id = 'bad-casual'`,
    );
    expect(stored).toMatchObject({ default_price: 100, price_per_game: 100 });
  });

  it('does not rewrite NOVICE, RATING or TOURNAMENT pricing', async () => {
    for (const format of ['NOVICE', 'RATING', 'TOURNAMENT'] as const) {
      const response = await request(app)
        .post('/api/evenings')
        .set(auth())
        .send({
          title: `Non regular ${format}`,
          starts_at: '2026-09-25T20:00:00+03:00',
          format,
          status: 'draft',
          capacity: 20,
          default_price: 600,
        });
      expect(response.status, JSON.stringify(response.body)).toBe(201);
      expect(response.body.default_price).toBe(600);
      const stored = await db.get<any>('SELECT default_price FROM game_evenings WHERE id = ?', [response.body.id]);
      expect(Number(stored?.default_price)).toBe(600);
    }
  });
});