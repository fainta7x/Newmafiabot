import { randomUUID } from 'node:crypto';
import type { DatabaseWrapper } from '../../db/index.ts';
import { CURSE_NAME } from '../../shared/playerCurse.ts';
import { queuePersonalNotification } from './personalNotificationRouterService.ts';
import { claim, ensureClubResultPostSchema, finish, sendText } from './clubResultPostService.ts';
import { isEveningPublishingPaused } from './eveningPublishingPause.ts';

/**
 * «Проклятье на понос» (owner, 2026-11-19): the organizer marks a player who ignored the bot's invitation to an evening
 * completely (no answer at all; somebody who wrote him in private is not marked — the organizer decides, so it is a
 * button, never automatic). Each mark is one week of the curse, added one after another. The player gets a personal
 * message, the curse shows in his profile and in the lists of players, and the marks of an evening go out in one
 * «Новости» post after the evening. Only the organizer lifts it earlier, in the CRM player card.
 */
export const CURSE_WEEK_MS = 7 * 24 * 3_600_000;
/** The post of an evening waits until no new mark came for this long, so the organizer can mark everybody first. */
const POST_QUIET_MS = 30 * 60_000;
const NEWS_DESTINATION = 'club_mvp';

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
  `Ты так и не ответил боту про вечер «${evening.title}», ${dayMonth(evening.starts_at)}. За каждый такой вечер — неделя проклятья. Снять его раньше может только организатор.`,
  '',
  'В следующий раз ответь на приглашение — подойдёт любой ответ: «Иду», «Не смогу» или «Думаю».',
].join('\n');

/** The organizer's button «Проигнорировал бота» (on) or taking the mark back (off). */
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

export const cursePostText = (evening: { title: string; starts_at: string }, rows: Array<{ nickname: string; until: string }>) => [
  `🤢 «${CURSE_NAME}»`,
  '',
  `За вечер «${evening.title}», ${dayMonth(evening.starts_at)}, бота проигнорировали:`,
  ...rows.map((row) => `• ${row.nickname} — до ${dayMonth(row.until)}`),
  '',
  'За каждый проигнорированный вечер — неделя проклятья. Отвечайте боту — подойдёт любой ответ.',
].join('\n');

/** The minute scan: one «Новости» post per evening after it started, once no new mark came for 30 minutes. */
export async function runCursePosts(db: DatabaseWrapper, fetchImpl: typeof fetch = fetch, now = new Date()) {
  if (isEveningPublishingPaused()) return 0;
  await ensurePlayerCurseSchema(db);
  const evenings = await db.all<{ evening_id: string; last: string; title: string; starts_at: string }>(`
    SELECT c.evening_id, MAX(c.created_at) AS last, e.title, e.starts_at FROM player_curses c JOIN game_evenings e ON e.id = c.evening_id
     WHERE c.posted = 0 AND c.removed_at IS NULL GROUP BY c.evening_id, e.title, e.starts_at`);
  let sent = 0;
  const until = await curseUntilByPlayer(db, now);
  for (const evening of evenings) {
    if (new Date(evening.starts_at).getTime() > now.getTime() || now.getTime() - new Date(evening.last).getTime() < POST_QUIET_MS) continue;
    const marks = await db.all<{ id: string; player_id: string; nickname: string }>(`
      SELECT c.id, c.player_id, p.nickname FROM player_curses c JOIN players p ON p.id = c.player_id
       WHERE c.evening_id = ? AND c.posted = 0 AND c.removed_at IS NULL ORDER BY p.nickname COLLATE NOCASE`, [evening.evening_id]);
    const rows = marks.map((mark) => ({ nickname: String(mark.nickname), until: until.get(String(mark.player_id)) || '' })).filter((row) => row.until);
    if (!rows.length) { for (const mark of marks) await db.run('UPDATE player_curses SET posted = 1 WHERE id = ?', [mark.id]); continue; }
    await ensureClubResultPostSchema(db);
    // A later batch of the same evening gets its own key, so marks added after the first post go out too.
    const key = `curse:${evening.evening_id}:${marks.map((mark) => mark.id).sort().join(',').slice(0, 120)}`;
    if (!(await claim(db, key, 'player-curse', String(evening.evening_id), null))) continue;
    try {
      const result = await sendText(db, NEWS_DESTINATION, cursePostText({ title: String(evening.title || 'Игровой вечер'), starts_at: String(evening.starts_at) }, rows), fetchImpl, undefined, undefined, { key: `club:${key}`, kind: 'club-result' });
      await finish(db, key, result);
      if (result.ok) { for (const mark of marks) await db.run('UPDATE player_curses SET posted = 1 WHERE id = ?', [mark.id]); sent += 1; }
    } catch (error: any) {
      await finish(db, key, { ok: false, temporary: true, error: error?.message || String(error) });
    }
  }
  return sent;
}
