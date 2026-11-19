import { randomUUID } from 'node:crypto';
import type { DatabaseWrapper } from '../../db/index.ts';
import { CURSE_NAME } from '../../shared/playerCurse.ts';
import { queuePersonalNotification } from './personalNotificationRouterService.ts';
import { claim, ensureClubResultPostSchema, finish, sendText } from './clubResultPostService.ts';
import { isEveningPublishingPaused } from './eveningPublishingPause.ts';

/**
 * «Проклятье на понос» (owner, 2026-11-19): on Friday at 10:00 Moscow time the bot marks everybody who got the personal
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
export const CURSE_HOUR = 10;

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
  `);
}

const dayMonth = (iso: string) => new Date(iso).toLocaleDateString('ru-RU', { timeZone: 'Europe/Moscow', day: 'numeric', month: 'long' });

/** Until when each player is cursed now: every mark adds a week after the previous one (or after the mark itself). */
export async function curseUntilByPlayer(db: DatabaseWrapper, now = new Date()): Promise<Map<string, string>> {
  await ensurePlayerCurseSchema(db);
  const rows = await db.all<{ player_id: string; created_at: string }>('SELECT player_id, created_at FROM player_curses WHERE removed_at IS NULL ORDER BY created_at');
  const until = new Map<string, number>();
  for (const row of rows) {
    const id = String(row.player_id);
    const start = Math.max(until.get(id) || 0, new Date(row.created_at).getTime());
    until.set(id, start + CURSE_WEEK_MS);
  }
  const active = new Map<string, string>();
  for (const [id, end] of until) if (end > now.getTime()) active.set(id, new Date(end).toISOString());
  return active;
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
  `Ты так и не ответил боту на приглашение на вечер «${evening.title}», ${dayMonth(evening.starts_at)}. За каждое проигнорированное приглашение — неделя проклятья. Снять его раньше может только организатор.`,
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

/** One post for the day: every player once, with the date his curse lasts until (all his weeks counted). */
export const cursePostText = (day: string, rows: Array<{ nickname: string; until: string }>) => [
  `🤢 «${CURSE_NAME}»`,
  '',
  `Приглашения бота на ${dayMonth(day)} проигнорировали:`,
  ...rows.map((row) => `• ${row.nickname} — до ${dayMonth(row.until)}`),
  '',
  'За каждое проигнорированное приглашение — неделя проклятья. Отвечайте боту — подойдёт любой ответ.',
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

/**
 * The minute scan: on Friday from 10:00 Moscow time until the evening starts, every published evening of that day is
 * checked once; the marks go out at once in one «Новости» post. Nobody marked — no post.
 */
export async function runCursePosts(db: DatabaseWrapper, fetchImpl: typeof fetch = fetch, now = new Date()) {
  if (isEveningPublishingPaused()) return 0;
  await ensurePlayerCurseSchema(db);
  const local = moscow(now);
  if (local.getUTCDay() === CURSE_WEEKDAY && local.getUTCHours() >= CURSE_HOUR) {
    const today = await db.all<{ id: string; starts_at: string }>(`
      SELECT e.id, e.starts_at FROM game_evenings e LEFT JOIN player_curse_checks c ON c.evening_id = e.id
       WHERE c.evening_id IS NULL AND e.status IN ('published', 'active') AND e.starts_at > ?`, [now.toISOString()]);
    for (const evening of today.filter((row) => moscowDay(new Date(row.starts_at)) === moscowDay(now))) {
      // Recorded first: a failure in the middle must not mark (and message) the same people twice.
      const fresh = await db.run('INSERT OR IGNORE INTO player_curse_checks (evening_id, checked_at) VALUES (?, ?)', [evening.id, now.toISOString()]);
      if (!fresh.changes) continue;
      const marked = await markIgnoredInvitations(db, String(evening.id), now);
      await db.run('UPDATE player_curse_checks SET marked = ? WHERE evening_id = ?', [marked.length, evening.id]);
    }
  }
  // One «Новости» post per day of the evenings (owner, 2026-11-19: «отдельный пост», both Friday evenings in it).
  const marks = await db.all<{ id: string; player_id: string; evening_id: string; nickname: string; starts_at: string }>(`
    SELECT c.id, c.player_id, c.evening_id, p.nickname, e.starts_at FROM player_curses c JOIN players p ON p.id = c.player_id JOIN game_evenings e ON e.id = c.evening_id
     WHERE c.posted = 0 AND c.removed_at IS NULL ORDER BY p.nickname COLLATE NOCASE`);
  const byDay = new Map<string, typeof marks>();
  for (const mark of marks) {
    const day = moscowDay(new Date(mark.starts_at));
    byDay.set(day, [...(byDay.get(day) || []), mark]);
  }
  let sent = 0;
  const until = await curseUntilByPlayer(db, now);
  for (const [day, dayMarks] of byDay) {
    const seen = new Set<string>();
    const rows = dayMarks.filter((mark) => !seen.has(String(mark.player_id)) && seen.add(String(mark.player_id)))
      .map((mark) => ({ nickname: String(mark.nickname), until: until.get(String(mark.player_id)) || '' })).filter((row) => row.until);
    if (!rows.length) { for (const mark of dayMarks) await db.run('UPDATE player_curses SET posted = 1 WHERE id = ?', [mark.id]); continue; }
    await ensureClubResultPostSchema(db);
    // A later mark of the same day gets its own key, so it goes out too.
    const key = `curse:${day}:${dayMarks.map((mark) => mark.id).sort().join(',').slice(0, 120)}`;
    if (!(await claim(db, key, 'player-curse', String(dayMarks[0].evening_id), null))) continue;
    try {
      const result = await sendText(db, NEWS_DESTINATION, cursePostText(`${day}T12:00:00Z`, rows), fetchImpl, undefined, undefined, { key: `club:${key}`, kind: 'club-result' });
      await finish(db, key, result);
      if (result.ok) { for (const mark of dayMarks) await db.run('UPDATE player_curses SET posted = 1 WHERE id = ?', [mark.id]); sent += 1; }
    } catch (error: any) {
      await finish(db, key, { ok: false, temporary: true, error: error?.message || String(error) });
    }
  }
  return sent;
}
