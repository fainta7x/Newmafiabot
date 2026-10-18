import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ensureInviteAudienceSchema } from '../db/ensureInviteAudienceSchema.ts';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import {
  closeClocktowerRoom, createClocktowerRoom, joinClocktowerRoom, leaveClocktowerRoom, listClocktowerRooms, setClocktowerStoryteller,
} from '../server/services/clocktowerRoomService.ts';
import { saveInvitePreferences } from '../server/services/playerInvitePreferencesService.ts';
import { loadPokerInviteCandidates } from '../server/services/pokerInviteService.ts';

let db: DatabaseWrapper;
beforeEach(async () => {
  db = createDatabaseConnection(':memory:');
  await ensureInviteAudienceSchema(db);
  const now = new Date().toISOString();
  await db.run(`INSERT INTO players (id,nickname,telegram_user_id,game_level,tokens,created_at,updated_at)
    VALUES ('a','Алиса','1','club',0,?,?),('b','Боб','2','club',0,?,?),('c','Вера','3','club',0,?,?)`, [now, now, now, now, now, now]);
});
afterEach(() => { try { db.sqlite.close(); } catch {} });

describe('«Кровь на часовой башне» rooms', () => {
  it('creator is in the room, others join and leave, one Storyteller at a time', async () => {
    const id = await createClocktowerRoom(db, 'a', { title: 'Вечер', note: '  привет  ' });
    await joinClocktowerRoom(db, id, 'b');
    await joinClocktowerRoom(db, id, 'b');
    await setClocktowerStoryteller(db, id, 'a', true);
    await setClocktowerStoryteller(db, id, 'b', true);
    let [room] = await listClocktowerRooms(db, 'b');
    expect(room.members.map((m) => m.nickname)).toEqual(['Алиса', 'Боб']);
    expect(room).toMatchObject({ note: 'привет', joined: true, is_host: false, i_am_storyteller: true });
    expect(room.members.filter((m) => m.is_storyteller)).toHaveLength(1);
    await leaveClocktowerRoom(db, id, 'b');
    [room] = await listClocktowerRooms(db, 'b');
    expect(room.joined).toBe(false);
  });

  it('only the creator closes it; when the creator leaves the room passes on, and an empty one closes', async () => {
    const id = await createClocktowerRoom(db, 'a', {});
    await joinClocktowerRoom(db, id, 'b');
    await expect(closeClocktowerRoom(db, id, 'b')).rejects.toMatchObject({ status: 403 });
    await leaveClocktowerRoom(db, id, 'a');
    expect((await listClocktowerRooms(db, 'b'))[0]).toMatchObject({ host_nickname: 'Боб', is_host: true });
    await leaveClocktowerRoom(db, id, 'b');
    expect(await listClocktowerRooms(db, 'b')).toEqual([]);
    await expect(joinClocktowerRoom(db, id, 'c')).rejects.toMatchObject({ status: 404 });
  });

  it('limits one person to three open rooms and rejects a broken start time', async () => {
    for (let i = 0; i < 3; i += 1) await createClocktowerRoom(db, 'a', {});
    await expect(createClocktowerRoom(db, 'a', {})).rejects.toMatchObject({ status: 409 });
    await expect(createClocktowerRoom(db, 'b', { startsAt: 'завтра' })).rejects.toMatchObject({ status: 400 });
  });

  it('a player who switched «Кровь на часовой башне» invitations off is not offered', async () => {
    await saveInvitePreferences(db, 'c', { blockedKinds: ['CLOCKTOWER'] });
    const names = (await loadPokerInviteCandidates(db, 'a', { kind: 'CLOCKTOWER' })).map((c) => c.nickname);
    expect(names).toEqual(['Боб']);
    const poker = (await loadPokerInviteCandidates(db, 'a')).map((c) => c.nickname);
    expect(poker).toEqual(['Боб', 'Вера']);
  });
});
