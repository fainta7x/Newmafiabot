import type { DatabaseWrapper } from '../../db/index.ts';

/**
 * Who has blocked the club bot in Telegram (owner, 2026-11-16: «чтобы я видел тех, кто бота в ЧС добавили»).
 * Telegram answers «Forbidden: bot was blocked by the user» to a message; the app keeps that answer in its delivery
 * journals (the personal message outbox and the evening invitation tracking). A player counts as blocking the bot while
 * his latest such answer is newer than the latest message that did reach him. Returns player id → time of the block.
 */
const BLOCKED = "%blocked by the user%";
const latest = (current: Map<string, string>, id: unknown, at: unknown) => {
  const key = String(id || ''), time = String(at || '');
  if (!key || !time) return;
  if (!current.has(key) || current.get(key)! < time) current.set(key, time);
};
const rows = <T,>(db: DatabaseWrapper, sql: string, params: unknown[] = []) => db.all<T>(sql, params).catch(() => [] as T[]);

export async function loadBotBlockedPlayers(db: DatabaseWrapper): Promise<Map<string, string>> {
  const blocked = new Map<string, string>(), reached = new Map<string, string>();
  for (const row of await rows<any>(db, `SELECT player_id, last_attempt_at FROM telegram_message_outbox WHERE player_id IS NOT NULL AND status = 'failed' AND last_error LIKE ?`, [BLOCKED])) latest(blocked, row.player_id, row.last_attempt_at);
  for (const row of await rows<any>(db, `SELECT player_id, MAX(sent_at) AS sent_at FROM telegram_message_outbox WHERE player_id IS NOT NULL AND status = 'sent' GROUP BY player_id`)) latest(reached, row.player_id, row.sent_at);
  for (const row of await rows<any>(db, `SELECT player_id, last_attempt_at, last_error, last_reminder_attempt_at, last_reminder_error, first_sent_at, last_reminded_at FROM evening_announcement_dm_tracking`)) {
    if (String(row.last_error || '').includes('blocked by the user')) latest(blocked, row.player_id, row.last_attempt_at);
    if (String(row.last_reminder_error || '').includes('blocked by the user')) latest(blocked, row.player_id, row.last_reminder_attempt_at);
    latest(reached, row.player_id, row.first_sent_at);
    latest(reached, row.player_id, row.last_reminded_at);
  }
  const result = new Map<string, string>();
  for (const [id, at] of blocked) if (!reached.has(id) || reached.get(id)! < at) result.set(id, at);
  return result;
}
