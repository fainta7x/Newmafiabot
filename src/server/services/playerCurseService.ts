import { randomUUID } from 'node:crypto';
import type { DatabaseWrapper } from '../../db/index.ts';
import { CURSE_NAME } from '../../shared/playerCurse.ts';
import { queuePersonalNotification } from './personalNotificationRouterService.ts';
import { claim, ensureClubResultPostSchema, finish, sendText } from './clubResultPostService.ts';
import { isEveningPublishingPaused } from './eveningPublishingPause.ts';
import { isOpenEvening, openEveningSql } from '../../lib/eveningStatus.ts';
import { normalizeEveningFormat } from '../../lib/eveningFormat.ts';

/**
 * «Проклятье на понос» (owner, 2026-11-19; 2026-11-20: 11:00, novice evenings off, an answer before the evening lifts it,
 * the number of curses in the post, the sent post is corrected): on Friday at 11:00 Moscow time the bot marks everybody who got the personal
 * invitation to that day's evening and gave no answer at all («Иду», «Не смогу», «Думаю» — any answer is fine). Somebody
 * who wrote the organizer in private gets his answer set in «Ответы и игры» before that. Each mark is one week of the
 * curse, added one after another. The player gets a personal message, the curse shows in his profile and in the lists
 * of players, and the marks of the day go out in one separate «Новости» post right away (both Friday evenings in it). The organizer takes a wrong mark back in
 * «Ответы и игры» or lifts the whole curse in the CRM player card.
 */
export const CURSE_WEEK_MS = 7 * 24 * 3_600_000;
const NEWS_DESTINATION = 'club_mvp';
const MOSCOW_OFFSET_MS = 3 * 3_600_000;
export const CURSE_WEEKDAY = 5; // Friday
/** 11:00, not 10:00 (owner, 2026-11-20: at 10:00 the post pushed the morning games post out of sight). */
export const CURSE_HOUR = 11;
/** Novice evenings are off for now (owner, 2026-11-20: «уберем вечер новичков пока… сделай неактивным»). */
export const CURSE_NOVICE_EVENINGS = false;
const cursedFormat = (format: unknown) => CURSE_NOVICE_EVENINGS || normalizeEveningFormat(format) !== 'NOVICE';

export async function ensurePlayerCurseSchema(db: DatabaseWrapper) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS player_curses (
      id TEXT PRIMARY KEY,
      player_id TEXT NOT NULL REFERENCES players(id),
      evening_id TEXT NOT NULL REFERENCES game_evenings(id),
      created_at TEXT NOT NULL,
      created_by TEXT,
      removed_at TEXT,
      posted INTEGER NOT NULL DEFAULT 0,
      UNIQUE(player_id, evening_id)
    );
    CREATE TABLE IF NOT EXISTS player_curse_checks (
      evening_id TEXT PRIMARY KEY REFERENCES game_evenings(id),
      checked_at TEXT NOT NULL,
      marked INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS player_curse_day_posts (
      day TEXT PRIMARY KEY,
      delivery_key TEXT NOT NULL,
      text TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
}

const dayMonth = (iso: string) => new Date(iso).toLocaleDateString('ru-RU', { timeZone: 'Europe/Moscow', day: 'numeric', month: 'long' });

/** Until when each player is cursed now and by how many marks: every mark adds a week after the previous one. */
export async function curseStateByPlayer(db: DatabaseWrapper, now = new Date()): Promise<Map<string, { until: string; count: number }>> {
  await ensurePlayerCurseSchema(db);
  const rows = await db.all<{ player_id: string; created_at: string }>('SELECT player_id, created_at FROM player_curses WHERE removed_at IS NULL ORDER BY created_at');
  const state = new Map<string, { end: number; count: number }>();
  for (const row of rows) {
    const id = String(row.player_id);
    const at = new Date(row.created_at).getTime();
    const previous = state.get(id);
    // A mark after the last week ran out starts a new curse; one inside it adds a week and counts.
    const running = previous && previous.end > at ? previous : null;
    state.set(id, { end: Math.max(running?.end || 0, at) + CURSE_WEEK_MS, count: (running?.count || 0) + 1 });
  }
  const active = new Map<string, { until: string; count: number }>();
  for (const [id, value] of state) if (value.end > now.getTime()) active.set(id, { until: new Date(value.end).toISOString(), count: value.count });
  return active;
}

export async function curseUntilByPlayer(db: DatabaseWrapper, now = new Date()): Promise<Map<string, string>> {
  return new Map([...(await curseStateByPlayer(db, now))].map(([id, value]) => [id, value.until]));
}

export async function curseUntil(db: DatabaseWrapper, playerId: string, now = new Date()) {
  return (await curseUntilByPlayer(db, now)).get(playerId) || null;
}

/** The players marked for an evening (the CRM shows the button pressed). */
export async function eveningCurses(db: DatabaseWrapper, eveningId: string, now = new Date()) {
  await ensurePlayerCurseSchema(db);
  const rows = await db.all<{ player_id: string }>('SELECT player_id FROM player_curses WHERE evening_id = ? AND removed_at IS NULL', [eveningId]);
  const until = await curseUntilByPlayer(db, now);
  return rows.map((row) => ({ player_id: String(row.player_id), until: until.get(String(row.player_id)) || null }));
}

const personalText = (until: string, evening: { title: string; starts_at: string }) => [
  `🤢 На тебя наложено «${CURSE_NAME}» до ${dayMonth(until)}.`,
  '',
  `Ты так и не ответил боту на приглашение на вечер «${evening.title}», ${dayMonth(evening.starts_at)}. За каждое проигнорированное приглашение — неделя проклятья.`,
  '',
  'Проклятье можно избежать, если ответить боту до начала вечера или его отмены.',
  '',
  'В следующий раз ответь на приглашение — подойдёт любой ответ: «Иду», «Не смогу» или «Думаю».',
].join('\n');

/** A mark (on; the bot's Friday check, or the API) or taking it back (off; the organizer in «Ответы и игры»). */
export async function setEveningCurse(db: DatabaseWrapper, input: { evening_id?: unknown; player_id?: unknown; on?: unknown }, actor: string | null, now = new Date()) {
  await ensurePlayerCurseSchema(db);
  const eveningId = typeof input.evening_id === 'string' ? input.evening_id : '';
  const playerId = typeof input.player_id === 'string' ? input.player_id : '';
  const evening = await db.get<{ id: string; title: string; starts_at: string }>('SELECT id, title, starts_at FROM game_evenings WHERE id = ?', [eveningId]);
  const player = await db.get<{ id: string }>('SELECT id FROM players WHERE id = ?', [playerId]);
  if (!evening || !player) throw Object.assign(new Error('Вечер или игрок не найден'), { statusCode: 404 });
  if (input.on === false) {
    await db.run('DELETE FROM player_curses WHERE evening_id = ? AND player_id = ?', [eveningId, playerId]);
    return eveningCurses(db, eveningId, now);
  }
  const inserted = await db.run('INSERT OR IGNORE INTO player_curses (id, player_id, evening_id, created_at, created_by) VALUES (?,?,?,?,?)', [randomUUID(), playerId, eveningId, now.toISOString(), actor]);
  if (inserted.changes) {
    const until = await curseUntil(db, playerId, now);
    if (until) {
      try {
        await queuePersonalNotification(db, {
          notificationKey: `curse:${eveningId}:${playerId}`, playerId, eventType: 'player_curse', entityId: eveningId,
          text: personalText(until, { title: String(evening.title || 'Игровой вечер'), starts_at: String(evening.starts_at) }), actionPath: '/player',
        });
      } catch (error) { console.error('[CURSE] personal message failed:', error); }
    }
  }
  return eveningCurses(db, eveningId, now);
}

/** «Снять проклятье» in the CRM player card: every mark of the player stops counting. */
export async function liftCurse(db: DatabaseWrapper, playerId: string, now = new Date()) {
  await ensurePlayerCurseSchema(db);
  await db.run('UPDATE player_curses SET removed_at = ? WHERE player_id = ? AND removed_at IS NULL', [now.toISOString(), playerId]);
  return { until: await curseUntil(db, playerId, now) };
}

const curseWord = (count: number) => {
  const tens = count % 100;
  const ones = count % 10;
  if (tens >= 11 && tens <= 14) return 'проклятий';
  if (ones === 1) return 'проклятье';
  if (ones >= 2 && ones <= 4) return 'проклятья';
  return 'проклятий';
};

/** One post for the day: every player once, with the date his curse lasts until and how many curses he has. */
export const cursePostText = (day: string, rows: Array<{ nickname: string; until: string; count: number }>) => [
  `🤢 «${CURSE_NAME}»`,
  '',
  ...(rows.length
    ? [`Приглашения бота на ${dayMonth(day)} проигнорировали:`, ...rows.map((row) => `• ${row.nickname} — до ${dayMonth(row.until)} (${row.count} ${curseWord(row.count)})`)]
    : [`На приглашения бота на ${dayMonth(day)} все ответили — проклятий нет.`]),
  '',
  'За каждое проигнорированное приглашение — неделя проклятья. Проклятье можно избежать, если ответить боту до начала вечера или его отмены.',
].join('\n');

/** The Friday check of one evening: everybody invited and still without an answer gets a mark. Returns the marked ids. */
export async function markIgnoredInvitations(db: DatabaseWrapper, eveningId: string, now = new Date()) {
  const { loadAnnouncementOverview } = await import('./eveningAnnouncementTrackingService.ts');
  const overview = await loadAnnouncementOverview(db, eveningId);
  const ignored = (overview?.players || []).filter((player: any) => player.attention_status === 'unanswered').map((player: any) => String(player.id));
  for (const playerId of ignored) await setEveningCurse(db, { evening_id: eveningId, player_id: playerId }, 'bot', now);
  return ignored;
}

const moscow = (at: Date) => new Date(at.getTime() + MOSCOW_OFFSET_MS);
const moscowDay = (at: Date) => moscow(at).toISOString().slice(0, 10);

/** The chat and message of a sent post, as saved at delivery (for editing it). */
const sentMessage = async (db: DatabaseWrapper, deliveryKey: string) => {
  const delivery = await db.get<{ payload: string; result: string }>('SELECT payload, result FROM publication_deliveries WHERE delivery_key = ? AND status = ?', [deliveryKey, 'accepted']).catch(() => null);
  try {
    const chatId = JSON.parse(delivery?.payload || '{}').fields?.chat_id;
    const messageId = Number(JSON.parse(delivery?.result || '{}').ids?.[0]);
    return chatId && Number.isSafeInteger(messageId) && messageId > 0 ? { chatId, messageId } : null;
  } catch { return null; }
};

/**
 * An answer before the evening lifts its week (owner, 2026-11-20: «проклятье можно избежать, если ответить боту до начала
 * вечера или отмены»): while the evening is open and has not started, a marked player who now has any answer loses the
 * mark. Marks of novice evenings are taken back while those are off. Returns how many marks went.
 */
async function liftAnsweredMarks(db: DatabaseWrapper, now: Date) {
  const marks = await db.all<{ id: string; player_id: string; evening_id: string; status: string; settled_at: string | null; starts_at: string; format: string }>(`
    SELECT c.id, c.player_id, c.evening_id, e.status, e.settled_at, e.starts_at, e.format FROM player_curses c JOIN game_evenings e ON e.id = c.evening_id
     WHERE c.removed_at IS NULL`);
  let lifted = 0;
  const overviews = new Map<string, Map<string, string>>();
  const { loadAnnouncementOverview } = await import('./eveningAnnouncementTrackingService.ts');
  for (const mark of marks) {
    let lift = !cursedFormat(mark.format);
    if (!lift && isOpenEvening(mark) && new Date(mark.starts_at).getTime() > now.getTime()) {
      if (!overviews.has(mark.evening_id)) {
        const overview = await loadAnnouncementOverview(db, String(mark.evening_id));
        overviews.set(mark.evening_id, new Map((overview?.players || []).map((player: any) => [String(player.id), String(player.response_status || 'unanswered')])));
      }
      const answer = overviews.get(mark.evening_id)!.get(String(mark.player_id));
      lift = Boolean(answer && answer !== 'unanswered');
    }
    if (lift) { await db.run('DELETE FROM player_curses WHERE id = ?', [mark.id]); lifted += 1; }
  }
  return lifted;
}

/**
 * The minute scan: on Friday from 11:00 Moscow time until the evening starts, every published evening of that day (not
 * novice ones while they are off) is checked once and the marks go out in one «Новости» post. When the marks of that day
 * change later (an answer before the evening, the organizer took one back), the sent post is edited.
 */
export async function runCursePosts(db: DatabaseWrapper, fetchImpl: typeof fetch = fetch, now = new Date()) {
  if (isEveningPublishingPaused()) return 0;
  await ensurePlayerCurseSchema(db);
  const local = moscow(now);
  if (local.getUTCDay() === CURSE_WEEKDAY && local.getUTCHours() >= CURSE_HOUR) {
    const today = await db.all<{ id: string; starts_at: string; format: string }>(`
      SELECT e.id, e.starts_at, e.format FROM game_evenings e LEFT JOIN player_curse_checks c ON c.evening_id = e.id
       WHERE c.evening_id IS NULL AND ${openEveningSql('e')} AND e.starts_at > ?`, [now.toISOString()]);
    for (const evening of today.filter((row) => moscowDay(new Date(row.starts_at)) === moscowDay(now) && cursedFormat(row.format))) {
      // Recorded first: a failure in the middle must not mark (and message) the same people twice.
      const fresh = await db.run('INSERT OR IGNORE INTO player_curse_checks (evening_id, checked_at) VALUES (?, ?)', [evening.id, now.toISOString()]);
      if (!fresh.changes) continue;
      const marked = await markIgnoredInvitations(db, String(evening.id), now);
      await db.run('UPDATE player_curse_checks SET marked = ? WHERE evening_id = ?', [marked.length, evening.id]);
    }
  }
  await liftAnsweredMarks(db, now);

  // The days that have something to post or a post to keep right: unposted marks, and days with a post already.
  const unposted = await db.all<{ starts_at: string }>(`
    SELECT e.starts_at FROM player_curses c JOIN game_evenings e ON e.id = c.evening_id WHERE c.posted = 0 AND c.removed_at IS NULL`);
  // A post sent before the day posts were recorded (20.11) is taken over by its delivery.
  for (const row of await db.all<{ delivery_key: string; payload: string }>(`
    SELECT delivery_key, payload FROM publication_deliveries WHERE delivery_key LIKE 'club:curse:%' AND status = 'accepted'`).catch(() => [])) {
    const day = String(row.delivery_key).split(':')[2] || '';
    let text = '';
    try { text = String(JSON.parse(row.payload || '{}').fields?.text || ''); } catch { /* no text */ }
    if (/^\d{4}-\d{2}-\d{2}$/.test(day)) await db.run('INSERT OR IGNORE INTO player_curse_day_posts (day, delivery_key, text, updated_at) VALUES (?,?,?,?)', [day, row.delivery_key, text, now.toISOString()]);
  }
  const posts = new Map((await db.all<{ day: string; delivery_key: string; text: string }>('SELECT day, delivery_key, text FROM player_curse_day_posts')).map((row) => [row.day, row]));
  const days = new Set([...unposted.map((row) => moscowDay(new Date(row.starts_at))), ...posts.keys()]);
  const state = await curseStateByPlayer(db, now);
  let sent = 0;
  for (const day of days) {
    const marks = await db.all<{ id: string; player_id: string; evening_id: string; nickname: string; starts_at: string }>(`
      SELECT c.id, c.player_id, c.evening_id, p.nickname, e.starts_at FROM player_curses c JOIN players p ON p.id = c.player_id JOIN game_evenings e ON e.id = c.evening_id
       WHERE c.removed_at IS NULL ORDER BY p.nickname COLLATE NOCASE`);
    const dayMarks = marks.filter((mark) => moscowDay(new Date(mark.starts_at)) === day);
    const seen = new Set<string>();
    const rows = dayMarks.filter((mark) => !seen.has(String(mark.player_id)) && seen.add(String(mark.player_id)))
      .map((mark) => ({ nickname: String(mark.nickname), ...(state.get(String(mark.player_id)) || { until: '', count: 0 }) })).filter((row) => row.until);
    const text = cursePostText(`${day}T12:00:00Z`, rows);
    const post = posts.get(day);
    if (post) {
      // Already out: keep it right (a post from a day long gone is left alone).
      if (post.text === text || now.getTime() - new Date(`${day}T00:00:00Z`).getTime() > 8 * 24 * 3_600_000) continue;
      const message = await sentMessage(db, post.delivery_key);
      const token = String(process.env.TELEGRAM_BOT_TOKEN || '').trim();
      if (!message || !token) continue;
      const response = await fetchImpl(`https://api.telegram.org/bot${token}/editMessageText`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: message.chatId, message_id: message.messageId, text, disable_web_page_preview: true }) }).catch(() => null);
      const body: any = response ? await response.json().catch(() => null) : null;
      if (response?.ok || String(body?.description || '').includes('message is not modified')) {
        await db.run('UPDATE player_curse_day_posts SET text = ?, updated_at = ? WHERE day = ?', [text, now.toISOString(), day]);
        for (const mark of dayMarks) await db.run('UPDATE player_curses SET posted = 1 WHERE id = ?', [mark.id]);
      } else console.error('[CURSE] post edit failed:', body?.description || response?.status);
      continue;
    }
    if (!rows.length) { for (const mark of dayMarks) await db.run('UPDATE player_curses SET posted = 1 WHERE id = ?', [mark.id]); continue; }
    await ensureClubResultPostSchema(db);
    const key = `curse:${day}:${dayMarks.map((mark) => mark.id).sort().join(',').slice(0, 120)}`;
    if (!(await claim(db, key, 'player-curse', String(dayMarks[0].evening_id), null))) continue;
    try {
      const result = await sendText(db, NEWS_DESTINATION, text, fetchImpl, undefined, undefined, { key: `club:${key}`, kind: 'club-result' });
      await finish(db, key, result);
      if (result.ok) {
        await db.run('INSERT OR REPLACE INTO player_curse_day_posts (day, delivery_key, text, updated_at) VALUES (?,?,?,?)', [day, `club:${key}`, text, now.toISOString()]);
        for (const mark of dayMarks) await db.run('UPDATE player_curses SET posted = 1 WHERE id = ?', [mark.id]);
        sent += 1;
      }
    } catch (error: any) {
      await finish(db, key, { ok: false, temporary: true, error: error?.message || String(error) });
    }
  }
  return sent;
}
