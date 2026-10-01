import { afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.ts';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { generateOrganizerToken, generatePlayerSessionToken } from '../server/auth.ts';

const opened: DatabaseWrapper[] = [];
afterEach(() => { while (opened.length) opened.pop()?.sqlite.close(); });

async function setup() {
  const db = createDatabaseConnection(':memory:'); opened.push(db);
  const app = await createApp(db);
  const now = new Date().toISOString();
  const addPlayer = (id: string, judge = 'none') => db.run(
    `INSERT INTO players (id,nickname,judge_level,lifecycle_status,source,created_at,updated_at) VALUES (?,?,?,'normal','telegram',?,?)`,
    [id, id, judge, now, now],
  );
  for (const id of ['judge', 'seat1', 'seat2', 'away']) await addPlayer(id, id === 'judge' ? 'judge' : 'none');
  await db.run(`INSERT INTO game_evenings (id,title,starts_at,timezone,format,status,capacity,default_price,created_at,updated_at)
    VALUES ('ev','Вечер',?,'Europe/Moscow','CASUAL','active',20,100,?,?)`, [now, now, now]);
  // «away» came to the evening but does not sit at this table.
  await db.run(`INSERT INTO evening_participants (id,evening_id,player_id,response_status,registration_status,attendance_status,arrival_status,payment_status,amount_due,amount_paid,created_at,updated_at)
    VALUES ('p-away','ev','away','going','going','attended','on_time','paid',0,0,?,?)`, [now, now]);
  let n = 0;
  const addSlot = (owner: string, slot: number) => db.run(
    `INSERT INTO music_link_entries (id, owner_player_id, scope, slot_index, title, source_kind, source_url, normalized_url, embed_url, sort_order, created_at, updated_at)
     VALUES (?, ?, 'player', ?, ?, 'yandex_track', ?, ?, NULL, ?, ?, ?)`,
    [`m${++n}`, owner, slot, `${owner}-${slot}`, `https://music.yandex.ru/track/${n}`, `https://music.yandex.ru/track/${n}`, slot - 1, now, now],
  );
  for (const owner of ['seat1', 'seat2', 'away']) { await addSlot(owner, 1); await addSlot(owner, 2); }
  const pool = (table?: string[]) => request(app)
    .get(`/api/player/music-library/evenings/ev/pool${table ? `?table=${table.join(',')}` : ''}`)
    .set('Cookie', `player_token=${generatePlayerSessionToken('judge')}`);
  return { pool, db, app };
}

describe('game music from the players at the table', () => {
  it('draws deal and night from two different people at the table, never from someone elsewhere', async () => {
    const { pool } = await setup();
    for (let round = 0; round < 25; round += 1) {
      const response = await pool(['seat1', 'seat2', 'judge']);
      expect(response.status, JSON.stringify(response.body)).toBe(200);
      const { deal, night } = response.body.preselected;
      expect(['seat1', 'seat2']).toContain(deal.source_player_id);
      expect(['seat1', 'seat2']).toContain(night.source_player_id);
      expect(deal.source_player_id).not.toBe(night.source_player_id);
      expect(deal.entry.title).toBe(`${deal.source_player_id}-1`);
      expect(night.entry.title).toBe(`${night.source_player_id}-2`);
    }
  });

  it('does not repeat the same person for the night when nobody else at the table has music', async () => {
    const { pool } = await setup();
    const response = await pool(['seat1', 'judge']);
    const { deal, night } = response.body.preselected;
    expect(deal?.source_player_id).toBe('seat1');
    // The judge has no tracks here, so the night has nobody else to draw from.
    expect(night).toBeNull();
  });

  it('keeps the judge library out of the draw while people at the table have music', async () => {
    const { pool, db } = await setup();
    const now = new Date().toISOString();
    await db.run(`INSERT INTO music_link_entries (id, owner_player_id, scope, slot_index, title, source_kind, source_url, normalized_url, embed_url, sort_order, created_at, updated_at)
      VALUES ('lib', 'judge', 'organizer', NULL, 'judge-library', 'yandex_track', 'https://music.yandex.ru/track/900', 'https://music.yandex.ru/track/900', NULL, 0, ?, ?)`, [now, now]);
    for (let round = 0; round < 25; round += 1) {
      const { deal, night } = (await pool(['seat1', 'seat2', 'judge'])).body.preselected;
      expect(deal.entry.title).not.toBe('judge-library');
      expect(night.entry.title).not.toBe('judge-library');
    }
    // Nobody at the table has music: the judge's library plays.
    expect((await pool(['judge'])).body.preselected.deal.entry.title).toBe('judge-library');
  });
});

describe('owner repairs a player\'s locked music slot', () => {
  it('only the owner reads, fixes and frees the slot; the player still cannot change it', async () => {
    const { app } = await setup();
    const owner = `organizer_token=${generateOrganizerToken()}`;
    const url = '/api/player/music-library/admin/player-slots/seat1';

    expect((await request(app).get(url).set('Cookie', `organizer_token=${generateOrganizerToken('not-owner')}`)).status).toBeGreaterThanOrEqual(401);
    const before = await request(app).get(url).set('Cookie', owner);
    expect(before.status, JSON.stringify(before.body)).toBe(200);
    expect(before.body.slots.map((slot: any) => slot.entry?.title)).toEqual(['seat1-1', 'seat1-2']);

    const fixed = await request(app).put(`${url}/1`).set('Cookie', owner).send({ url: 'https://music.yandex.ru/album/5/track/777' });
    expect(fixed.status, JSON.stringify(fixed.body)).toBe(200);
    expect(fixed.body.entry.source_url).toContain('777');

    const player = `player_token=${generatePlayerSessionToken('seat1')}`;
    expect((await request(app).put('/api/player/music-library/player-slots/1').set('Cookie', player).send({ url: 'https://music.yandex.ru/album/5/track/1' })).status).toBe(409);

    expect((await request(app).delete(`${url}/2`).set('Cookie', owner)).status).toBe(200);
    const after = await request(app).get(url).set('Cookie', owner);
    expect(after.body.slots[1].entry).toBeNull();
    // A freed slot is the player's to fill again.
    expect((await request(app).put('/api/player/music-library/player-slots/2').set('Cookie', player).send({ url: 'https://music.yandex.ru/album/5/track/888' })).status).toBe(200);
  });
});
