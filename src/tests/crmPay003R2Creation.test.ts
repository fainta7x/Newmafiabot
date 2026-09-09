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

  it('initializes slot planning before immediate CRM evening reads on a legacy database', async () => {
    const freshDb = createDatabaseConnection(':memory:');
    try {
      // Simulate a legacy database that predates slot planning. createApp must make
      // the mounted evening routes safe before the CRM performs its first getEvenings.
      await freshDb.run('DROP TABLE IF EXISTS evening_slot_settings');
      await freshDb.run(
        `INSERT INTO game_evenings
         (id,title,starts_at,timezone,format,status,capacity,default_price,created_at,updated_at)
         VALUES ('legacy-no-slots','Legacy no slots','2026-09-12T20:00:00+03:00','Europe/Moscow','NOVICE','published',20,550,?,?)`,
        [now, now],
      );

      const freshApp = await createApp(freshDb);
      const list = await request(freshApp).get('/api/evenings').set(auth());
      expect(list.status, JSON.stringify(list.body)).toBe(200);
      expect(list.body).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: 'legacy-no-slots', default_price: 550 }),
      ]));

      const single = await request(freshApp).get('/api/evenings/legacy-no-slots').set(auth());
      expect(single.status, JSON.stringify(single.body)).toBe(200);
      expect(single.body).toMatchObject({ id: 'legacy-no-slots', default_price: 550 });

      // A non-regular PATCH also reads price_per_game for its response. It must not
      // mutate successfully and then fail because the slot table was absent.
      const patch = await request(freshApp)
        .patch('/api/evenings/legacy-no-slots')
        .set(auth())
        .send({ notes: 'safe after startup' });
      expect(patch.status, JSON.stringify(patch.body)).toBe(200);
      const stored = await freshDb.get<any>('SELECT notes FROM game_evenings WHERE id = ?', ['legacy-no-slots']);
      expect(stored?.notes).toBe('safe after startup');

      const slotTable = await freshDb.get<any>(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='evening_slot_settings'",
      );
      expect(slotTable?.name).toBe('evening_slot_settings');
    } finally {
      try { freshDb.sqlite.close(); } catch {}
    }
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

  it('forces mounted regular table create/update writes to 100 ₽', async () => {
    const eveningResponse = await request(app)
      .post('/api/evenings')
      .set(auth())
      .send({
        title: 'Regular table pricing',
        starts_at: '2026-09-22T20:00:00+03:00',
        format: 'STANDARD',
        status: 'draft',
        capacity: 20,
        default_price: 600,
      });
    expect(eveningResponse.status).toBe(201);

    const created = await request(app)
      .post(`/api/evenings/${eveningResponse.body.id}/tables`)
      .set(auth())
      .send({ name: 'Стол 1', format: 'STANDARD', capacity: 10, default_price: 600 });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    expect(Number(created.body.default_price)).toBe(100);

    const updated = await request(app)
      .put(`/api/evenings/tables/${created.body.id}`)
      .set(auth())
      .send({ default_price: 500, name: 'Стол 1 обновлён' });
    expect(updated.status, JSON.stringify(updated.body)).toBe(200);
    expect(Number(updated.body.default_price)).toBe(100);

    const stored = await db.get<any>('SELECT default_price FROM evening_tables WHERE id = ?', [created.body.id]);
    expect(Number(stored?.default_price)).toBe(100);
  });

  it('normalizes all existing table prices when an evening becomes CASUAL/STANDARD', async () => {
    const nonRegular = await request(app)
      .post('/api/evenings')
      .set(auth())
      .send({
        title: 'Convert me',
        starts_at: '2026-09-23T20:00:00+03:00',
        format: 'NOVICE',
        status: 'published',
        capacity: 20,
        default_price: 600,
      });
    expect(nonRegular.status).toBe(201);

    const table = await request(app)
      .post(`/api/evenings/${nonRegular.body.id}/tables`)
      .set(auth())
      .send({ name: 'Legacy priced table', format: 'NOVICE', capacity: 10, default_price: 600 });
    expect(table.status, JSON.stringify(table.body)).toBe(201);
    expect(Number(table.body.default_price)).toBe(600);

    const converted = await request(app)
      .patch(`/api/evenings/${nonRegular.body.id}`)
      .set(auth())
      .send({ format: 'STANDARD', default_price: 600 });
    expect(converted.status, JSON.stringify(converted.body)).toBe(200);
    expect(converted.body.format).toBe('CASUAL');
    expect(Number(converted.body.default_price)).toBe(100);

    const storedTable = await db.get<any>('SELECT default_price FROM evening_tables WHERE id = ?', [table.body.id]);
    expect(Number(storedTable?.default_price)).toBe(100);

    const organizerRead = await request(app)
      .get(`/api/evenings/${nonRegular.body.id}`)
      .set(auth());
    expect(organizerRead.status, JSON.stringify(organizerRead.body)).toBe(200);
    expect(organizerRead.body.tables).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: table.body.id, default_price: 100 }),
    ]));

    const publicRead = await request(app).get(`/api/evenings/${nonRegular.body.id}`);
    expect(publicRead.status, JSON.stringify(publicRead.body)).toBe(200);
    expect(Number(publicRead.body.default_price)).toBe(100);
    expect(JSON.stringify(publicRead.body)).not.toContain('"default_price":600');
  });

  it('does not rewrite NOVICE, RATING or TOURNAMENT pricing, including table routes', async () => {
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

      const table = await request(app)
        .post(`/api/evenings/${response.body.id}/tables`)
        .set(auth())
        .send({ name: `${format} table`, format, capacity: 10, default_price: 600 });
      expect(table.status, JSON.stringify(table.body)).toBe(201);
      expect(Number(table.body.default_price)).toBe(600);

      const changed = await request(app)
        .put(`/api/evenings/tables/${table.body.id}`)
        .set(auth())
        .send({ default_price: 500 });
      expect(changed.status, JSON.stringify(changed.body)).toBe(200);
      expect(Number(changed.body.default_price)).toBe(500);
    }
  });
});