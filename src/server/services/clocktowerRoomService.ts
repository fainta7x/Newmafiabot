import crypto from 'node:crypto';
import type { DatabaseWrapper } from '../../db/index.ts';
import { ensureClocktowerSchema } from '../../db/ensureClocktowerSchema.ts';

/** A stub: rooms only gather people for the board game «Кровь на часовой башне»; the game itself is played at a real table. */
export const CLOCKTOWER_MAX_PLAYERS = 20;
export const CLOCKTOWER_ROOM_TTL_MS = 24 * 60 * 60 * 1000;

export class ClocktowerRoomError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

const clean = (value: unknown, max: number) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

export async function listClocktowerRooms(db: DatabaseWrapper, viewerId: string, now = Date.now()) {
  await ensureClocktowerSchema(db);
  // A room nobody closed disappears from the list a day after it was meant to start (or was created).
  const cutoff = new Date(now - CLOCKTOWER_ROOM_TTL_MS).toISOString();
  const rooms = await db.all<any>(
    `SELECT r.id, r.host_player_id, r.title, r.note, r.starts_at, r.created_at, p.nickname AS host_nickname
       FROM clocktower_rooms r JOIN players p ON p.id = r.host_player_id
      WHERE r.closed_at IS NULL AND COALESCE(r.starts_at, r.created_at) > ?
      ORDER BY COALESCE(r.starts_at, r.created_at) ASC LIMIT 50`,
    [cutoff],
  );
  if (!rooms.length) return [];
  const marks = rooms.map(() => '?').join(',');
  const members = await db.all<any>(
    `SELECT m.room_id, m.player_id, m.is_storyteller, p.nickname
       FROM clocktower_room_members m JOIN players p ON p.id = m.player_id
      WHERE m.room_id IN (${marks}) ORDER BY m.joined_at ASC`,
    rooms.map((room: any) => room.id),
  );
  return rooms.map((room: any) => {
    const people = members.filter((member: any) => member.room_id === room.id);
    return {
      id: String(room.id),
      title: String(room.title),
      note: String(room.note || ''),
      starts_at: room.starts_at ? String(room.starts_at) : null,
      host_player_id: String(room.host_player_id),
      host_nickname: String(room.host_nickname || 'Игрок'),
      members: people.map((member: any) => ({ player_id: String(member.player_id), nickname: String(member.nickname || 'Игрок'), is_storyteller: Number(member.is_storyteller) === 1 })),
      joined: people.some((member: any) => String(member.player_id) === viewerId),
      is_host: String(room.host_player_id) === viewerId,
      i_am_storyteller: people.some((member: any) => Number(member.is_storyteller) === 1 && String(member.player_id) === viewerId),
      has_storyteller: people.some((member: any) => Number(member.is_storyteller) === 1),
    };
  });
}

export async function createClocktowerRoom(db: DatabaseWrapper, hostId: string, input: { title?: unknown; note?: unknown; startsAt?: unknown }, now = Date.now()) {
  await ensureClocktowerSchema(db);
  const title = clean(input.title, 80) || 'Кровь на часовой башне';
  const note = clean(input.note, 400);
  let startsAt: string | null = null;
  const rawStart = clean(input.startsAt, 40);
  if (rawStart) {
    const parsed = new Date(rawStart);
    if (Number.isNaN(parsed.getTime())) throw new ClocktowerRoomError(400, 'Не понимаю время начала.');
    startsAt = parsed.toISOString();
  }
  const open = await db.get<any>('SELECT COUNT(*) AS n FROM clocktower_rooms WHERE host_player_id=? AND closed_at IS NULL', [hostId]);
  if (Number(open?.n || 0) >= 3) throw new ClocktowerRoomError(409, 'Уже есть три ваши открытые комнаты. Закройте лишнюю.');
  const id = crypto.randomUUID();
  const createdAt = new Date(now).toISOString();
  await db.run('INSERT INTO clocktower_rooms (id,host_player_id,title,note,starts_at,created_at) VALUES (?,?,?,?,?,?)', [id, hostId, title, note, startsAt, createdAt]);
  await db.run('INSERT INTO clocktower_room_members (room_id,player_id,is_storyteller,joined_at) VALUES (?,?,0,?)', [id, hostId, createdAt]);
  return id;
}

const openRoom = async (db: DatabaseWrapper, roomId: string) => {
  await ensureClocktowerSchema(db);
  const room = await db.get<any>('SELECT id, host_player_id, title, closed_at FROM clocktower_rooms WHERE id=? LIMIT 1', [roomId]);
  if (!room || room.closed_at) throw new ClocktowerRoomError(404, 'Комната закрыта или не найдена.');
  return room;
};

export async function joinClocktowerRoom(db: DatabaseWrapper, roomId: string, playerId: string, now = Date.now()) {
  await openRoom(db, roomId);
  const count = await db.get<any>('SELECT COUNT(*) AS n FROM clocktower_room_members WHERE room_id=?', [roomId]);
  const already = await db.get<any>('SELECT 1 AS x FROM clocktower_room_members WHERE room_id=? AND player_id=?', [roomId, playerId]);
  if (!already && Number(count?.n || 0) >= CLOCKTOWER_MAX_PLAYERS) throw new ClocktowerRoomError(409, 'В комнате уже нет мест.');
  await db.run('INSERT OR IGNORE INTO clocktower_room_members (room_id,player_id,is_storyteller,joined_at) VALUES (?,?,0,?)', [roomId, playerId, new Date(now).toISOString()]);
}

export async function leaveClocktowerRoom(db: DatabaseWrapper, roomId: string, playerId: string) {
  const room = await openRoom(db, roomId);
  await db.run('DELETE FROM clocktower_room_members WHERE room_id=? AND player_id=?', [roomId, playerId]);
  // The host going away closes the room unless somebody else is still in it: then the next person gets it.
  if (String(room.host_player_id) === playerId) {
    const next = await db.get<any>('SELECT player_id FROM clocktower_room_members WHERE room_id=? ORDER BY joined_at ASC LIMIT 1', [roomId]);
    if (next) await db.run('UPDATE clocktower_rooms SET host_player_id=? WHERE id=?', [String(next.player_id), roomId]);
    else await db.run('UPDATE clocktower_rooms SET closed_at=? WHERE id=?', [new Date().toISOString(), roomId]);
  }
}

export async function setClocktowerStoryteller(db: DatabaseWrapper, roomId: string, playerId: string, value: boolean) {
  await openRoom(db, roomId);
  const member = await db.get<any>('SELECT 1 AS x FROM clocktower_room_members WHERE room_id=? AND player_id=?', [roomId, playerId]);
  if (!member) throw new ClocktowerRoomError(409, 'Сначала войдите в комнату.');
  // One Storyteller per room.
  if (value) await db.run('UPDATE clocktower_room_members SET is_storyteller=0 WHERE room_id=?', [roomId]);
  await db.run('UPDATE clocktower_room_members SET is_storyteller=? WHERE room_id=? AND player_id=?', [value ? 1 : 0, roomId, playerId]);
}

export async function closeClocktowerRoom(db: DatabaseWrapper, roomId: string, playerId: string) {
  const room = await openRoom(db, roomId);
  if (String(room.host_player_id) !== playerId) throw new ClocktowerRoomError(403, 'Закрыть комнату может только тот, кто её создал.');
  await db.run('UPDATE clocktower_rooms SET closed_at=? WHERE id=?', [new Date().toISOString(), roomId]);
}

export async function requireClocktowerMember(db: DatabaseWrapper, roomId: string, playerId: string) {
  const room = await openRoom(db, roomId);
  const member = await db.get<any>('SELECT 1 AS x FROM clocktower_room_members WHERE room_id=? AND player_id=?', [roomId, playerId]);
  if (!member) throw new ClocktowerRoomError(403, 'Сначала войдите в комнату.');
  const count = await db.get<any>('SELECT COUNT(*) AS n FROM clocktower_room_members WHERE room_id=?', [roomId]);
  return { title: String(room.title), full: Number(count?.n || 0) >= CLOCKTOWER_MAX_PLAYERS };
}
