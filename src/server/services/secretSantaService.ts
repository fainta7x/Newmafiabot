import { randomInt, randomUUID } from 'node:crypto';
import type { DatabaseWrapper } from '../../db/index.ts';
import {
  SANTA_GIFT_LIMIT_RUB, SANTA_MIN_PARTICIPANTS, santaAnnouncementText, santaCircle, santaResultText,
  type SantaEvening, type SantaOrganizerState, type SantaPlayerState, type SantaStatus,
} from '../../shared/secretSanta.ts';
import { loadBotBlockedPlayers } from './botBlockedService.ts';
import { queuePersonalNotification } from './personalNotificationRouterService.ts';
import { appUrl } from './gameResultCardService.ts';
import { claim, ensureClubResultPostSchema, finish, sendText } from './clubResultPostService.ts';
import { isEveningPublishingPaused } from './eveningPublishingPause.ts';

/** «Тайный Санта» (owner, 2026-11-17); rules in docs/BUSINESS_RULES.md. */
export class SantaError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

const NEWS_DESTINATION = 'club_mvp';
/** After the exchange evening the event stays visible for one more day, then it is over. */
const VISIBLE_AFTER_EVENING_MS = 24 * 3_600_000;

type EventRow = { id: string; evening_id: string; status: SantaStatus; gift_limit: number; posted: number; created_at: string; drawn_at: string | null; title: string; starts_at: string };

export async function ensureSecretSantaSchema(db: DatabaseWrapper) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS santa_events (
      id TEXT PRIMARY KEY,
      evening_id TEXT NOT NULL REFERENCES game_evenings(id),
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
      PRIMARY KEY(event_id, giver_id)
    );
  `);
}

const eveningOf = (row: EventRow): SantaEvening => ({ id: String(row.evening_id), title: String(row.title || 'Игровой вечер'), starts_at: String(row.starts_at) });

/** The current event: the newest one not cancelled whose exchange evening is not more than a day behind. */
async function currentEvent(db: DatabaseWrapper, now: Date): Promise<EventRow | null> {
  await ensureSecretSantaSchema(db);
  const row = await db.get<EventRow>(`
    SELECT s.*, e.title, e.starts_at FROM santa_events s JOIN game_evenings e ON e.id = s.evening_id
     WHERE s.status != 'cancelled' ORDER BY s.created_at DESC LIMIT 1`);
  if (!row) return null;
  if (new Date(row.starts_at).getTime() + VISIBLE_AFTER_EVENING_MS < now.getTime()) return null;
  return row;
}

const participantsOf = (db: DatabaseWrapper, eventId: string) => db.all<{ id: string; nickname: string; joined_at: string }>(`
  SELECT p.id, p.nickname, sp.joined_at FROM santa_participants sp JOIN players p ON p.id = sp.player_id
   WHERE sp.event_id = ? ORDER BY p.nickname COLLATE NOCASE`, [eventId]);

export async function loadSantaForPlayer(db: DatabaseWrapper, playerId: string, now = new Date()): Promise<SantaPlayerState> {
  const row = await currentEvent(db, now);
  if (!row) return { event: null };
  const participants = await participantsOf(db, row.id);
  const pair = row.status === 'drawn'
    ? await db.get<{ id: string; nickname: string }>('SELECT p.id, p.nickname FROM santa_pairs sp JOIN players p ON p.id = sp.receiver_id WHERE sp.event_id = ? AND sp.giver_id = ?', [row.id, playerId])
    : null;
  return {
    event: {
      id: row.id, status: row.status, evening: eveningOf(row), gift_limit: Number(row.gift_limit), drawn_at: row.drawn_at,
      participants: participants.map(({ id, nickname }) => ({ id: String(id), nickname: String(nickname) })),
      joined: participants.some((player) => String(player.id) === playerId),
      recipient: pair ? { id: String(pair.id), nickname: String(pair.nickname) } : null,
    },
  };
}

export async function loadSantaForOrganizer(db: DatabaseWrapper, now = new Date()): Promise<SantaOrganizerState> {
  const row = await currentEvent(db, now);
  if (!row) return { event: null };
  const [participants, blocked, messages] = await Promise.all([
    participantsOf(db, row.id),
    loadBotBlockedPlayers(db).catch(() => new Map<string, string>()),
    row.status === 'drawn'
      ? db.all<{ player_id: string; status: string }>(`SELECT player_id, status FROM personal_notification_deliveries WHERE notification_key LIKE ?`, [`santa:${row.id}:%`]).catch(() => [])
      : Promise.resolve([] as Array<{ player_id: string; status: string }>),
  ]);
  const messageOf = new Map(messages.map((item) => [String(item.player_id), item.status]));
  return {
    event: {
      id: row.id, status: row.status, evening: eveningOf(row), gift_limit: Number(row.gift_limit), created_at: row.created_at, drawn_at: row.drawn_at,
      posted: Boolean(row.posted),
      participants: participants.map((player) => {
        const status = messageOf.get(String(player.id));
        return {
          id: String(player.id), nickname: String(player.nickname), joined_at: String(player.joined_at), bot_blocked: blocked.has(String(player.id)),
          message: status == null ? null : status === 'queued' ? 'queued' as const : 'unreachable' as const,
        };
      }),
    },
  };
}

/** Upcoming evenings the organizer can choose for the exchange. */
export async function santaEveningChoices(db: DatabaseWrapper, now = new Date()): Promise<SantaEvening[]> {
  const rows = await db.all<SantaEvening>(`SELECT id, title, starts_at FROM game_evenings WHERE status NOT IN ('cancelled','completed') AND settled_at IS NULL AND starts_at >= ? ORDER BY starts_at ASC LIMIT 30`, [now.toISOString()]);
  return rows.map((row) => ({ id: String(row.id), title: String(row.title || 'Игровой вечер'), starts_at: String(row.starts_at) }));
}

/** The organizer opens the registration for an exchange evening; the «Новости» post goes out with the next minute scan. */
export async function createSantaEvent(db: DatabaseWrapper, input: { evening_id?: unknown }, now = new Date()) {
  const eveningId = typeof input.evening_id === 'string' ? input.evening_id : '';
  const evening = (await santaEveningChoices(db, now)).find((item) => item.id === eveningId);
  if (!evening) throw new SantaError(400, 'Выберите будущий вечер, на котором будет обмен подарками');
  if (await currentEvent(db, now)) throw new SantaError(409, 'Тайный Санта уже идёт. Новый можно начать, когда закончится этот.');
  const id = randomUUID();
  const stamp = now.toISOString();
  await db.run(`INSERT INTO santa_events (id, evening_id, status, gift_limit, posted, created_at, updated_at) VALUES (?,?,?,?,0,?,?)`, [id, evening.id, 'open', SANTA_GIFT_LIMIT_RUB, stamp, stamp]);
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

/** The organizer's button: one circle through the participants only, and each giver gets a personal message. */
export async function drawSanta(db: DatabaseWrapper, eventId: string, now = new Date(), random: (n: number) => number = randomInt) {
  const stamp = now.toISOString();
  let row: EventRow | null = null;
  let pairs: Array<{ giver: string; receiver: string }> = [];
  await db.transaction(async (tx) => {
    row = await currentEvent(tx, now);
    if (!row || row.id !== eventId) throw new SantaError(404, 'Тайный Санта не найден');
    if (row.status !== 'open') throw new SantaError(409, 'Жеребьёвка уже проведена');
    const ids = (await participantsOf(tx, row.id)).map((player) => String(player.id));
    if (ids.length < SANTA_MIN_PARTICIPANTS) throw new SantaError(400, `Для жеребьёвки нужно хотя бы ${SANTA_MIN_PARTICIPANTS} участника`);
    pairs = santaCircle(ids, random);
    for (const pair of pairs) await tx.run('INSERT INTO santa_pairs (event_id, giver_id, receiver_id) VALUES (?,?,?)', [row.id, pair.giver, pair.receiver]);
    await tx.run(`UPDATE santa_events SET status = 'drawn', drawn_at = ?, updated_at = ? WHERE id = ?`, [stamp, stamp, row.id]);
  });
  const event = row as unknown as EventRow;
  const evening = eveningOf(event);
  const nickname = new Map((await participantsOf(db, event.id)).map((player) => [String(player.id), String(player.nickname)]));
  const path = '/player/santa';
  const link = appUrl(path);
  for (const pair of pairs) {
    try {
      await queuePersonalNotification(db, {
        notificationKey: `santa:${event.id}:${pair.giver}`, playerId: pair.giver, eventType: 'secret_santa', entityId: event.id,
        text: santaResultText(nickname.get(pair.receiver) || 'Игрок', evening), actionPath: path,
        telegramReplyMarkup: link ? { inline_keyboard: [[{ text: '🎅 Открыть', url: link }]] } : null,
      });
    } catch (error) { console.error('[SANTA] result message failed:', error); }
  }
  return loadSantaForOrganizer(db, now);
}

/** The minute scan: the «Новости» post of a newly opened registration, once. */
export async function runSecretSantaPosts(db: DatabaseWrapper, fetchImpl: typeof fetch = fetch, now = new Date()) {
  if (isEveningPublishingPaused()) return 0;
  const row = await currentEvent(db, now);
  if (!row || row.posted || row.status !== 'open') return 0;
  await ensureClubResultPostSchema(db);
  const key = `secret-santa:${row.id}`;
  if (!(await claim(db, key, 'secret-santa', String(row.evening_id), null))) {
    await db.run('UPDATE santa_events SET posted = 1 WHERE id = ?', [row.id]);
    return 0;
  }
  try {
    const link = appUrl('/player/santa');
    const result = await sendText(db, NEWS_DESTINATION, santaAnnouncementText(eveningOf(row)), fetchImpl, undefined,
      link ? { inline_keyboard: [[{ text: '🎅 Участвовать', url: link }]] } : undefined, { key: `club:${key}`, kind: 'club-result' });
    await finish(db, key, result);
    if (result.ok) await db.run('UPDATE santa_events SET posted = 1 WHERE id = ?', [row.id]);
    return result.ok ? 1 : 0;
  } catch (error: any) {
    await finish(db, key, { ok: false, temporary: true, error: error?.message || String(error) });
    return 0;
  }
}
