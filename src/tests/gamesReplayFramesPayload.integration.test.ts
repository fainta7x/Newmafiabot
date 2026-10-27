import { afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { LIVE_BROADCAST_VERSION } from '../lib/liveBroadcast.ts';
import { createApp } from '../app.ts';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { generateOrganizerToken } from '../server/auth.ts';
import { skipGatheredPost } from '../server/services/eveningGatheredPostService.ts';
import { loadGameReplayFrames } from '../server/services/gameReplayFramesStore.ts';
import { moveReplayFramesOutOfProtocols } from '../server/dataMigrations/moveReplayFramesOutOfProtocols.ts';

const opened: DatabaseWrapper[] = [];
afterEach(() => { while (opened.length) opened.pop()?.sqlite.close(); });
const cookie = () => `organizer_token=${generateOrganizerToken()}`;

async function setup(format: 'NOVICE' | 'CASUAL') {
  const db = createDatabaseConnection(':memory:'); opened.push(db);
  const app = await createApp(db);
  const now = new Date().toISOString();
  await db.run(`INSERT INTO game_evenings (id,title,starts_at,timezone,format,status,capacity,default_price,created_at,updated_at)
    VALUES ('ev','Вечер',?,'Europe/Moscow',?,'active',20,0,?,?)`, [now, format, now, now]);
  await db.run("INSERT INTO players (id,nickname,club_role,judge_level,tokens,created_at,updated_at) VALUES ('org','Судья','organizer','judge',0,?,?)", [now, now]);
  await db.run("INSERT INTO evening_staff_assignments (evening_id,organizer_player_id,assigned_at,updated_at) VALUES ('ev','org',?,?)", [now, now]);
  await skipGatheredPost(db, 'ev', 'test');
  for (let seat = 1; seat <= 10; seat += 1) {
    await db.run("INSERT INTO players (id,nickname,game_level,tokens,created_at,updated_at) VALUES (?,?,'novice',0,?,?)", [`p${seat}`, `Игрок ${seat}`, now, now]);
    await db.run(`INSERT INTO evening_participants (id,evening_id,player_id,response_status,registration_status,attendance_status,arrival_status,payment_status,amount_due,amount_paid,created_at,updated_at)
      VALUES (?,?,?,'going','going','attended','on_time','paid',200,200,?,?)`, [`ep${seat}`, 'ev', `p${seat}`, now, now]);
  }
  const create = async (count: number) => Object.assign(await request(app).post('/api/games/evening/ev').set('Cookie', cookie()).send({
    judge_player_id: 'org', judge_name: 'Судья',
    seats: Array.from({ length: count }, (_, index) => ({ participant_id: `ep${index + 1}`, seat_number: index + 1 })),
  }), { app });
  const save = (game: any, protocol: any) => request(app).put(`/api/games/${game.id}/evening-protocol`).set('Cookie', cookie()).send({
    protocol, player_results: game.club_protocol.player_results,
  });
  return { db, app, create, save };
}

const frame = (at: string) => ({ at, state: { version: LIVE_BROADCAST_VERSION, players: [], nominations: [] } });
const storedProtocol = async (db: DatabaseWrapper, id: number) => JSON.parse((await db.get<any>('SELECT protocol_text FROM games WHERE id = ?', [id])).protocol_text);
const putFramesInProtocol = async (db: DatabaseWrapper, id: number, frames: unknown[]) => {
  const stored = await storedProtocol(db, id);
  stored.protocol.replay_frames = frames;
  await db.run('UPDATE games SET protocol_text = ? WHERE id = ?', [JSON.stringify(stored), id]);
};

// 2026-10-26: the protocol window hung on a phone — every autosave answered ~3 MB and the games list ~23 MB, because the
// recorded broadcast frames (only the replay needs them) travelled with every response. 2026-10-27 (owner «да»): the frames
// left `protocol_text` for their own table, so no reader of a protocol carries them any more.
describe('replay frames live outside the protocol', () => {
  it('lists and saves without the frames; a save with frames keeps them in the table, a save without keeps the stored ones', async () => {
    const { db, app, create, save } = await setup('CASUAL');
    const created = await create(10);
    const list = await request(app).get('/api/games?archived=0').set('Cookie', cookie());
    const listed = list.body.find((game: any) => game.id === created.body.id);
    expect(listed.club_protocol.protocol.replay_frames).toBeUndefined();
    expect(listed.protocol_text).toBeUndefined();

    const withFrames = await save(listed, { ...listed.club_protocol.protocol, replay_frames: [frame('2026-10-26T12:00:00Z'), { junk: true }] });
    expect(withFrames.status).toBe(200);
    expect(withFrames.body.club_protocol.protocol.replay_frames).toBeUndefined();
    expect((await storedProtocol(db, created.body.id)).protocol.replay_frames).toBeUndefined();
    expect(await loadGameReplayFrames(db, created.body.id)).toHaveLength(1);

    const saved = await save(listed, { ...listed.club_protocol.protocol, judge_notes: 'заметка' });
    expect(saved.status).toBe(200);
    expect((await storedProtocol(db, created.body.id)).protocol.judge_notes).toBe('заметка');
    expect(await loadGameReplayFrames(db, created.body.id)).toHaveLength(1);
    // a repeated live save from a device that already forgot its frames does not erase the recorded replay
    expect((await save(listed, { ...listed.club_protocol.protocol, replay_frames: [] })).status).toBe(200);
    expect(await loadGameReplayFrames(db, created.body.id)).toHaveLength(1);
  });

  it('a game saved before the move is read from its protocol, and the startup move takes the frames out once', async () => {
    const { db, create } = await setup('CASUAL');
    const created = await create(10);
    await putFramesInProtocol(db, created.body.id, [frame('2026-10-26T12:00:00Z'), frame('2026-10-26T12:00:10Z')]);
    const before = await storedProtocol(db, created.body.id);
    expect(await loadGameReplayFrames(db, created.body.id, before.protocol.replay_frames)).toHaveLength(2);

    expect(await moveReplayFramesOutOfProtocols(db)).toEqual({ applied: true, moved: 1 });
    const after = await storedProtocol(db, created.body.id);
    expect(after.protocol.replay_frames).toBeUndefined();
    expect({ ...after.protocol }).toEqual(Object.fromEntries(Object.entries(before.protocol).filter(([key]) => key !== 'replay_frames')));
    expect(after.player_results).toEqual(before.player_results);
    expect(await loadGameReplayFrames(db, created.body.id, after.protocol.replay_frames)).toHaveLength(2);
    expect(await moveReplayFramesOutOfProtocols(db)).toEqual({ applied: false, moved: 0 });
  });
});
