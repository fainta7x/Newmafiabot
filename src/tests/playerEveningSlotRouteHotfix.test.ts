import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../app';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index';
import { generatePlayerSessionToken } from '../server/auth';

const now = '2026-09-09T15:00:00.000Z';

describe('player evening slot route hotfix', () => {
  let db: DatabaseWrapper;
  let app: Awaited<ReturnType<typeof createApp>>;

  beforeEach(async () => {
    db = createDatabaseConnection(':memory:');
    app = await createApp(db);

    await db.run(
      `INSERT INTO players
       (id,nickname,lifecycle_status,source,elo,tokens,game_level,created_at,updated_at)
       VALUES ('slot-player','Slot Player','normal','test',1000,0,'club',?,?)`,
      [now, now],
    );
    await db.run(
      `INSERT INTO game_evenings
       (id,title,starts_at,timezone,format,status,capacity,default_price,created_at,updated_at)
       VALUES ('slot-evening','Slot evening','2026-09-11T20:00:00+03:00','Europe/Moscow','CASUAL','published',20,100,?,?)`,
      [now, now],
    );
  });

  afterEach(() => {
    try { db.sqlite.close(); } catch {}
  });

  const auth = () => ({ Cookie: `player_token=${generatePlayerSessionToken('slot-player')}` });

  it('mounts the exact player GET/PUT endpoint used by PlayerEventSlotDetail and persists a selection', async () => {
    const loaded = await request(app)
      .get('/api/player/evenings/slot-evening/slots')
      .set(auth());

    expect(loaded.status, JSON.stringify(loaded.body)).toBe(200);
    expect(loaded.body.event).toMatchObject({ id: 'slot-evening', format: 'CASUAL' });
    expect(loaded.body.slots.length).toBeGreaterThan(0);
    expect(loaded.body.selection.slot_ids).toEqual([]);

    const selectedId = loaded.body.slots[0].id;
    const saved = await request(app)
      .put('/api/player/evenings/slot-evening/slots')
      .set(auth())
      .send({ slot_ids: [selectedId] });

    expect(saved.status, JSON.stringify(saved.body)).toBe(200);
    expect(saved.body.selection.slot_ids).toEqual([selectedId]);
    expect(saved.body.selection.games).toBe(1);
    expect(saved.body.selection.total).toBe(100);

    const participant = await db.get<any>(
      `SELECT response_status, amount_due
         FROM evening_participants
        WHERE evening_id = 'slot-evening' AND player_id = 'slot-player'`,
    );
    expect(participant?.response_status).toBe('going');
    expect(Number(participant?.amount_due || 0)).toBe(0);
  });

  it('returns player-auth errors from the mounted route instead of the API catch-all 404', async () => {
    const response = await request(app).get('/api/player/evenings/slot-evening/slots');
    expect(response.status).toBe(401);
    expect(response.body.error).toBe('Player authentication required.');
    expect(response.body.error).not.toBe('API endpoint not found');
  });
});
