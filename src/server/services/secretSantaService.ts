import { randomInt, randomUUID } from 'node:crypto';
import type { DatabaseWrapper } from '../../db/index.ts';
import {
  SANTA_GIFT_LIMIT_RUB, SANTA_MIN_PARTICIPANTS, SANTA_MONDAY_HOUR_MSK, santaAnnouncementText, santaCircle, santaDayBeforeText, santaMondayText,
  santaResultText, shmurdyakFor, type SantaEvening, type SantaOrganizerState, type SantaPlayer, type SantaPlayerState, type SantaStatus,
} from '../../shared/secretSanta.ts';
import { getEveningResponse } from '../../lib/eveningResponse.ts';
import { loadBotBlockedPlayers } from './botBlockedService.ts';
import { queuePersonalNotification } from './personalNotificationRouterService.ts';
import { appUrl } from './gameResultCardService.ts';
import { claim, ensureClubResultPostSchema, finish, sendText } from './clubResultPostService.ts';
import { isEveningPublishingPaused } from './eveningPublishingPause.ts';

/** «Тайный Санта» and «Подарок шмурдяку» (owner, 2026-11-17); rules in docs/BUSINESS_RULES.md. */
export class SantaError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

const NEWS_DESTINATION = 'club_mvp';
/** After the exchange evening the event stays visible for one more day, then it is over. */
const VISIBLE_AFTER_EVENING_MS = 24 * 3_600_000;
const DAY_BEFORE_MS = 24 * 3_600_000;
const MSK_OFFSET_MS = 3 * 3_600_000;
const PATH = '/player/santa';

type EventRow = {
  id: string; evening_id: string | null; status: SantaStatus; gift_limit: number; posted: number; created_at: string; drawn_at: string | null;
  title: string | null; starts_at: string | null;
};

export async function ensureSecretSantaSchema(db: DatabaseWrapper) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS santa_events (
      id TEXT PRIMARY KEY,
      evening_id TEXT REFERENCES game_evenings(id),
      status TEXT NOT NULL DEFAULT 'open',
      gift_limit INTEGER NOT NULL,
      posted INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL, drawn_at TEXT, updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS santa_participants (
      event_id TEXT NOT NULL REFERENCES santa_events(id),
      player_id TEXT NOT NULL REFERENCES players(id),
      joined_at TEXT NOT NULL,
      PRIMARY KEY(event_id, player_id)
    );
    CREATE TABLE IF NOT EXISTS santa_pairs (
      event_id TEXT NOT NULL REFERENCES santa_events(id),
      giver_id TEXT NOT NULL REFERENCES players(id),
      receiver_id TEXT NOT NULL REFERENCES players(id),
      shmurdyak_id TEXT REFERENCES players(id),
      PRIMARY KEY(event_id, giver_id)
    );
  `);
}

const eveningOf = (row: EventRow): SantaEvening | null => (row.evening_id && row.starts_at
  ? { id: String(row.evening_id), title: String(row.title || 'Игровой вечер'), starts_at: String(row.starts_at) } : null);

/** The current event: the newest one not cancelled, until a day after its exchange evening. */
async function currentEvent(db: DatabaseWrapper, now: Date): Promise<EventRow | null> {
  await ensureSecretSantaSchema(db);
  const row = await db.get<EventRow>(`
    SELECT s.*, e.title, e.starts_at FROM santa_events s LEFT JOIN game_evenings e ON e.id = s.evening_id
     WHERE s.status != 'cancelled' ORDER BY s.created_at DESC LIMIT 1`);
  if (!row) return null;
  if (row.starts_at && new Date(row.starts_at).getTime() + VISIBLE_AFTER_EVENING_MS < now.getTime()) return null;
  return row;
}

const participantsOf = (db: DatabaseWrapper, eventId: string) => db.all<{ id: string; nickname: string; joined_at: string }>(`
  SELECT p.id, p.nickname, sp.joined_at FROM santa_participants sp JOIN players p ON p.id = sp.player_id
   WHERE sp.event_id = ? ORDER BY p.nickname COLLATE NOCASE`, [eventId]);
const player = (row: { id: unknown; nickname: unknown }): SantaPlayer => ({ id: String(row.id), nickname: String(row.nickname) });

/** «Шмурдяки»: who answered «Иду» or «Опоздаю» to the exchange evening and is not in Santa (owner: «кто Иду»). */
async function shmurdyakPool(db: DatabaseWrapper, eventId: string, eveningId: string): Promise<SantaPlayer[]> {
  const rows = await db.all<any>(`
    SELECT ep.*, p.nickname FROM evening_participants ep JOIN players p ON p.id = ep.player_id
     WHERE ep.evening_id = ? AND ep.player_id NOT IN (SELECT player_id FROM santa_participants WHERE event_id = ?)
     ORDER BY p.nickname COLLATE NOCASE`, [eveningId, eventId]);
  return rows.filter((row) => ['going', 'late'].includes(getEveningResponse(row))).map((row) => player({ id: row.player_id, nickname: row.nickname }));
}

export async function loadSantaForPlayer(db: DatabaseWrapper, playerId: string, now = new Date()): Promise<SantaPlayerState> {
  const row = await currentEvent(db, now);
  if (!row) return { event: null };
  const participants = await participantsOf(db, row.id);
  const pair = row.status === 'drawn'
    ? await db.get<{ r_id: string; r_nick: string; z_id: string | null; z_nick: string | null }>(`
        SELECT r.id AS r_id, r.nickname AS r_nick, z.id AS z_id, z.nickname AS z_nick FROM santa_pairs sp
          JOIN players r ON r.id = sp.receiver_id LEFT JOIN players z ON z.id = sp.shmurdyak_id
         WHERE sp.event_id = ? AND sp.giver_id = ?`, [row.id, playerId])
    : null;
  return {
    event: {
      id: row.id, status: row.status, evening: eveningOf(row), gift_limit: Number(row.gift_limit), drawn_at: row.drawn_at,
      participants: participants.map(player),
      joined: participants.some((item) => String(item.id) === playerId),
      recipient: pair ? player({ id: pair.r_id, nickname: pair.r_nick }) : null,
      shmurdyak: pair?.z_id ? player({ id: pair.z_id, nickname: pair.z_nick }) : null,
    },
  };
}

export async function loadSantaForOrganizer(db: DatabaseWrapper, now = new Date()): Promise<SantaOrganizerState> {
  const row = await currentEvent(db, now);
  if (!row) return { event: null };
  const [participants, blocked, messages, pool] = await Promise.all([
    participantsOf(db, row.id),
    loadBotBlockedPlayers(db).catch(() => new Map<string, string>()),
    row.status === 'drawn'
      ? db.all<{ player_id: string; status: string }>(`SELECT player_id, status FROM personal_notification_deliveries WHERE notification_key LIKE ?`, [`santa:${row.id}:result:%`]).catch(() => [])
      : Promise.resolve([] as Array<{ player_id: string; status: string }>),
    row.evening_id && row.status === 'open' ? shmurdyakPool(db, row.id, row.evening_id) : Promise.resolve([] as SantaPlayer[]),
  ]);
  const messageOf = new Map(messages.map((item) => [String(item.player_id), item.status]));
  return {
    event: {
      id: row.id, status: row.status, evening: eveningOf(row), gift_limit: Number(row.gift_limit), created_at: row.created_at, drawn_at: row.drawn_at,
      posted: Boolean(row.posted), shmurdyak_pool: pool,
      participants: participants.map((item) => {
        const status = messageOf.get(String(item.id));
        return {
          ...player(item), joined_at: String(item.joined_at), bot_blocked: blocked.has(String(item.id)),
          message: status == null ? null : status === 'queued' ? 'queued' as const : 'unreachable' as const,
        };
      }),
    },
  };
}

/** Upcoming evenings the organizer can bind for the exchange. */
export async function santaEveningChoices(db: DatabaseWrapper, now = new Date()): Promise<SantaEvening[]> {
  const rows = await db.all<SantaEvening>(`SELECT id, title, starts_at FROM game_evenings WHERE status NOT IN ('cancelled','completed') AND settled_at IS NULL AND starts_at >= ? ORDER BY starts_at ASC LIMIT 30`, [now.toISOString()]);
  return rows.map((row) => ({ id: String(row.id), title: String(row.title || 'Игровой вечер'), starts_at: String(row.starts_at) }));
}

/** The organizer opens the registration, without an evening; the «Новости» post goes out with the next minute scan. */
export async function createSantaEvent(db: DatabaseWrapper, now = new Date()) {
  if (await currentEvent(db, now)) throw new SantaError(409, 'Тайный Санта уже идёт. Новый можно начать, когда закончится этот.');
  const stamp = now.toISOString();
  await db.run(`INSERT INTO santa_events (id, evening_id, status, gift_limit, posted, created_at, updated_at) VALUES (?,NULL,'open',?,0,?,?)`, [randomUUID(), SANTA_GIFT_LIMIT_RUB, stamp, stamp]);
  return loadSantaForOrganizer(db, now);
}

/** In the event's settings the organizer binds (or changes, before the draw) the exchange evening. */
export async function bindSantaEvening(db: DatabaseWrapper, eventId: string, input: { evening_id?: unknown }, now = new Date()) {
  const row = await currentEvent(db, now);
  if (!row || row.id !== eventId) throw new SantaError(404, 'Тайный Санта не найден');
  if (row.status !== 'open') throw new SantaError(409, 'После жеребьёвки вечер не меняется');
  const eveningId = typeof input.evening_id === 'string' ? input.evening_id : '';
  const evening = (await santaEveningChoices(db, now)).find((item) => item.id === eveningId);
  if (!evening) throw new SantaError(400, 'Выберите будущий вечер, на котором будет обмен подарками');
  await db.run('UPDATE santa_events SET evening_id = ?, updated_at = ? WHERE id = ?', [evening.id, now.toISOString(), row.id]);
  return loadSantaForOrganizer(db, now);
}

/** Cancelling is possible only before the draw. */
export async function cancelSantaEvent(db: DatabaseWrapper, eventId: string, now = new Date()) {
  const row = await currentEvent(db, now);
  if (!row || row.id !== eventId) throw new SantaError(404, 'Тайный Санта не найден');
  if (row.status !== 'open') throw new SantaError(409, 'Жеребьёвка уже проведена, отменить нельзя');
  await db.run(`UPDATE santa_events SET status = 'cancelled', updated_at = ? WHERE id = ?`, [now.toISOString(), row.id]);
  return loadSantaForOrganizer(db, now);
}

/** The player confirms himself (owner, 2026-11-17): the promise to bring a gift must be ticked. */
export async function joinSanta(db: DatabaseWrapper, playerId: string, input: { confirm?: unknown }, now = new Date()) {
  const row = await currentEvent(db, now);
  if (!row) throw new SantaError(404, 'Сейчас Тайного Санты нет');
  if (row.status !== 'open') throw new SantaError(409, 'Запись закрыта: жеребьёвка уже проведена');
  if (input.confirm !== true) throw new SantaError(400, 'Подтвердите, что подготовите подарок и придёте на вечер обмена');
  await db.run('INSERT OR IGNORE INTO santa_participants (event_id, player_id, joined_at) VALUES (?,?,?)', [row.id, playerId, now.toISOString()]);
  return loadSantaForPlayer(db, playerId, now);
}

export async function leaveSanta(db: DatabaseWrapper, playerId: string, now = new Date()) {
  const row = await currentEvent(db, now);
  if (!row) throw new SantaError(404, 'Сейчас Тайного Санты нет');
  if (row.status !== 'open') throw new SantaError(409, 'После жеребьёвки выйти нельзя: тебе уже выпал человек. Напиши организатору.');
  await db.run('DELETE FROM santa_participants WHERE event_id = ? AND player_id = ?', [row.id, playerId]);
  return loadSantaForPlayer(db, playerId, now);
}

type Assignment = { giver: string; receiver: string; receiver_nick: string; shmurdyak: string | null; shmurdyak_nick: string | null };
const assignmentsOf = (db: DatabaseWrapper, eventId: string) => db.all<Assignment>(`
  SELECT sp.giver_id AS giver, sp.receiver_id AS receiver, r.nickname AS receiver_nick, sp.shmurdyak_id AS shmurdyak, z.nickname AS shmurdyak_nick
    FROM santa_pairs sp JOIN players r ON r.id = sp.receiver_id LEFT JOIN players z ON z.id = sp.shmurdyak_id WHERE sp.event_id = ?`, [eventId]);

const queue = async (db: DatabaseWrapper, key: string, playerId: string, eventId: string, text: string) => {
  const link = appUrl(PATH);
  try {
    await queuePersonalNotification(db, {
      notificationKey: key, playerId, eventType: 'secret_santa', entityId: eventId, text, actionPath: PATH,
      telegramReplyMarkup: link ? { inline_keyboard: [[{ text: '🎅 Открыть', url: link }]] } : null,
    });
    return 1;
  } catch (error) { console.error('[SANTA] message failed:', error); return 0; }
};

/**
 * The organizer's button, after the evening is bound: one circle through the participants only, each santa also gets a
 * «шмурдяк» from those with «Иду» who are not in Santa, and a personal message (the first reminder: «как получаешь цель»).
 */
export async function drawSanta(db: DatabaseWrapper, eventId: string, now = new Date(), random: (n: number) => number = randomInt) {
  const stamp = now.toISOString();
  let event: EventRow | null = null;
  await db.transaction(async (tx) => {
    const row = await currentEvent(tx, now);
    if (!row || row.id !== eventId) throw new SantaError(404, 'Тайный Санта не найден');
    if (row.status !== 'open') throw new SantaError(409, 'Жеребьёвка уже проведена');
    if (!row.evening_id) throw new SantaError(400, 'Сначала привяжите вечер обмена подарками');
    const ids = (await participantsOf(tx, row.id)).map((item) => String(item.id));
    if (ids.length < SANTA_MIN_PARTICIPANTS) throw new SantaError(400, `Для жеребьёвки нужно хотя бы ${SANTA_MIN_PARTICIPANTS} участника`);
    const shmurdyak = shmurdyakFor(ids, (await shmurdyakPool(tx, row.id, row.evening_id)).map((item) => item.id), random);
    for (const pair of santaCircle(ids, random)) {
      await tx.run('INSERT INTO santa_pairs (event_id, giver_id, receiver_id, shmurdyak_id) VALUES (?,?,?,?)', [row.id, pair.giver, pair.receiver, shmurdyak.get(pair.giver) ?? null]);
    }
    await tx.run(`UPDATE santa_events SET status = 'drawn', drawn_at = ?, updated_at = ? WHERE id = ?`, [stamp, stamp, row.id]);
    event = row;
  });
  const row = event as unknown as EventRow;
  const evening = eveningOf(row)!;
  for (const item of await assignmentsOf(db, row.id)) {
    await queue(db, `santa:${row.id}:result:${item.giver}`, item.giver, row.id, santaResultText(item.receiver_nick, item.shmurdyak_nick, evening));
  }
  return loadSantaForOrganizer(db, now);
}

const moscow = (at: Date) => new Date(at.getTime() + MSK_OFFSET_MS);
const moscowDay = (at: Date) => moscow(at).toISOString().slice(0, 10);

/**
 * Reminders after the draw (owner, 2026-11-17): every Monday from 12:00 Moscow, and 24 hours before the exchange evening.
 * No Monday reminder on the day of the draw (the result has just come) or within the last 24 hours (the day-before one comes).
 */
export async function queueSantaReminders(db: DatabaseWrapper, now = new Date()) {
  const row = await currentEvent(db, now);
  const evening = row ? eveningOf(row) : null;
  if (!row || row.status !== 'drawn' || !evening) return 0;
  const startsAt = new Date(evening.starts_at).getTime();
  if (now.getTime() >= startsAt) return 0;
  let kind: string | null = null;
  let text: ((a: Assignment) => string) | null = null;
  if (now.getTime() >= startsAt - DAY_BEFORE_MS) {
    kind = 'day-before';
    text = (a) => santaDayBeforeText(a.receiver_nick, a.shmurdyak_nick, evening);
  } else if (moscow(now).getUTCDay() === 1 && moscow(now).getUTCHours() >= SANTA_MONDAY_HOUR_MSK && (!row.drawn_at || moscowDay(new Date(row.drawn_at)) !== moscowDay(now))) {
    kind = `monday:${moscowDay(now)}`;
    text = (a) => santaMondayText(a.receiver_nick, a.shmurdyak_nick, evening);
  }
  if (!kind || !text) return 0;
  const sentKeys = new Set((await db.all<{ notification_key: string }>(`SELECT notification_key FROM personal_notification_deliveries WHERE notification_key LIKE ?`, [`santa:${row.id}:${kind}:%`]).catch(() => [])).map((item) => item.notification_key));
  let queued = 0;
  for (const item of await assignmentsOf(db, row.id)) {
    const key = `santa:${row.id}:${kind}:${item.giver}`;
    if (sentKeys.has(key)) continue;
    queued += await queue(db, key, item.giver, row.id, text(item));
  }
  return queued;
}

/** The «Новости» post of a newly opened registration, once. */
async function postAnnouncement(db: DatabaseWrapper, row: EventRow, fetchImpl: typeof fetch) {
  if (row.posted || row.status !== 'open' || isEveningPublishingPaused()) return 0;
  await ensureClubResultPostSchema(db);
  const key = `secret-santa:${row.id}`;
  if (!(await claim(db, key, 'secret-santa', '', null))) {
    await db.run('UPDATE santa_events SET posted = 1 WHERE id = ?', [row.id]);
    return 0;
  }
  try {
    const link = appUrl(PATH);
    const result = await sendText(db, NEWS_DESTINATION, santaAnnouncementText(), fetchImpl, undefined,
      link ? { inline_keyboard: [[{ text: '🎅 Участвовать', url: link }]] } : undefined, { key: `club:${key}`, kind: 'club-result' });
    await finish(db, key, result);
    if (result.ok) await db.run('UPDATE santa_events SET posted = 1 WHERE id = ?', [row.id]);
    return result.ok ? 1 : 0;
  } catch (error: any) {
    await finish(db, key, { ok: false, temporary: true, error: error?.message || String(error) });
    return 0;
  }
}

/** The minute scan: the «Новости» post and the reminders. */
export async function runSecretSanta(db: DatabaseWrapper, fetchImpl: typeof fetch = fetch, now = new Date()) {
  const row = await currentEvent(db, now);
  if (!row) return 0;
  return (await postAnnouncement(db, row, fetchImpl)) + (await queueSantaReminders(db, now));
}
