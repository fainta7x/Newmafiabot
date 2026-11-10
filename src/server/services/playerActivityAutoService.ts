import type { DatabaseWrapper } from '../../db/index.ts';
import { ensureJudgeAuthoritySchema } from '../../db/ensureJudgeAuthoritySchema.ts';
import { PLAYER_VISITS_SQL } from './playerVisitsService.ts';
import { STOPPED_REASON, clubRoleFrom, membershipOfPlayer, normalizeClubRole, organizationOf } from '../../lib/playerAccess.ts';

/**
 * «Как часто ходит» from the real visits (owner, 2026-11-10). A visit is the one of `playerVisitsService` («пришёл» or a seat at a table).
 *  - more than 2 visits (3 or more) in the last 30 days → «Ходит постоянно»;
 *  - otherwise at least 1 visit in the last 21 days → «Ходит иногда»;
 *  - had visits, none for more than 60 days → «Перестал ходить»;
 *  - in between (the last visit 22–60 days ago, not regular) and never came → left as it is.
 * Automatic is the default for every player. «Из другого города» stays manual, and a status the organizer sets by hand stays until «Считать само» is chosen for the player.
 */
export type AutoActivity = 'regular' | 'sometimes' | 'stopped';
export const AUTO_REGULAR_VISITS = 3;
export const AUTO_REGULAR_DAYS = 30;
export const AUTO_SOMETIMES_DAYS = 21;
export const AUTO_STOPPED_DAYS = 60;
const DAY_MS = 86_400_000;

export async function ensurePlayerActivityAutoSchema(db: DatabaseWrapper) {
  await ensureJudgeAuthoritySchema(db);
  const columns = await db.all<{ name: string }>('PRAGMA table_info(players)');
  if (columns.some((column) => column.name === 'activity_auto')) return;
  // Automatic for everybody by default (owner, 2026-11-10: «по умолчанию, чтобы ручные теги стали автоматическими»);
  // a status the organizer sets by hand afterwards switches the player to manual.
  await db.exec('ALTER TABLE players ADD COLUMN activity_auto INTEGER NOT NULL DEFAULT 1');
}

export const autoActivityOf = (visits: { recent: number; short: number; within: number; total: number }): AutoActivity | null => (
  visits.recent >= AUTO_REGULAR_VISITS ? 'regular' : visits.short >= 1 ? 'sometimes' : visits.total >= 1 && visits.within === 0 ? 'stopped' : null
);

/** Target status per player id (only where the rules decide). */
export async function computeAutoActivities(db: DatabaseWrapper, now = new Date(), playerIds?: string[]): Promise<Map<string, AutoActivity>> {
  const from = (days: number) => new Date(now.getTime() - days * DAY_MS).toISOString();
  const rows = await db.all<{ player_id: string; recent: number; short: number; within: number; total: number }>(
    `SELECT player_id,
            SUM(CASE WHEN datetime(starts_at) >= datetime(?) THEN 1 ELSE 0 END) AS recent,
            SUM(CASE WHEN datetime(starts_at) >= datetime(?) THEN 1 ELSE 0 END) AS short,
            SUM(CASE WHEN datetime(starts_at) >= datetime(?) THEN 1 ELSE 0 END) AS within, COUNT(*) AS total
       FROM (${PLAYER_VISITS_SQL}) GROUP BY player_id`,
    [from(AUTO_REGULAR_DAYS), from(AUTO_SOMETIMES_DAYS), from(AUTO_STOPPED_DAYS)],
  );
  const wanted = playerIds ? new Set(playerIds.map(String)) : null;
  const result = new Map<string, AutoActivity>();
  for (const row of rows) {
    if (wanted && !wanted.has(String(row.player_id))) continue;
    const activity = autoActivityOf({ recent: Number(row.recent || 0), short: Number(row.short || 0), within: Number(row.within || 0), total: Number(row.total || 0) });
    if (activity) result.set(String(row.player_id), activity);
  }
  return result;
}

const currentActivity = (row: any): AutoActivity => (Number(row.stopped_attending || 0) === 1 ? 'stopped' : membershipOfPlayer(row) === 'member' ? 'regular' : 'sometimes');

/** Writes the same fields the organizer's own choice writes (membership, mailing pause, «перестал ходить»). */
export async function writeActivity(tx: DatabaseWrapper, playerId: string, current: any, activity: AutoActivity, now = new Date().toISOString()) {
  const membership = activity === 'regular' ? 'member' : 'guest';
  const clubRole = clubRoleFrom(membership, organizationOf(normalizeClubRole(current.club_role)));
  const contact = String(current.contact_status || current.lifecycle_status || 'normal');
  let contactStatus = contact;
  let pauseReason = current.pause_reason ?? null;
  if (activity === 'stopped' && contact === 'normal') { contactStatus = 'paused'; pauseReason = STOPPED_REASON; }
  else if (activity !== 'stopped' && contact === 'paused' && pauseReason === STOPPED_REASON) { contactStatus = 'normal'; pauseReason = null; }
  const statusChanged = contactStatus !== contact;
  await tx.run(
    `UPDATE players SET club_role = ?, stopped_attending = ?, attends_sometimes = ?${statusChanged ? ', contact_status = ?, lifecycle_status = ?, pause_reason = ?' : ''}, updated_at = ? WHERE id = ?`,
    [clubRole, activity === 'stopped' ? 1 : 0, membership === 'guest' ? 1 : 0, ...(statusChanged ? [contactStatus, contactStatus, pauseReason] : []), now, playerId],
  );
}

const moscowDay = (now: Date) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Moscow' }).format(now);

/** Once a day: players with the automatic status get what their visits say. Returns the changes made. */
export async function runAutoPlayerActivity(db: DatabaseWrapper, now = new Date()): Promise<Array<{ id: string; nickname: string; from: AutoActivity; to: AutoActivity }>> {
  await ensurePlayerActivityAutoSchema(db);
  await db.exec('CREATE TABLE IF NOT EXISTS app_data_migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL)');
  const key = `player-activity-auto:${moscowDay(now)}`;
  if ((await db.run('INSERT OR IGNORE INTO app_data_migrations (id, applied_at) VALUES (?, ?)', [key, now.toISOString()])).changes === 0) return [];
  const targets = await computeAutoActivities(db, now);
  const changes: Array<{ id: string; nickname: string; from: AutoActivity; to: AutoActivity }> = [];
  await db.transaction(async (tx) => {
    const players = await tx.all<any>(
      `SELECT id, nickname, club_role, contact_status, lifecycle_status, pause_reason, stopped_attending, from_other_city, attends_sometimes
         FROM players WHERE activity_auto = 1 AND COALESCE(from_other_city, 0) = 0
          AND COALESCE(lifecycle_status, '') NOT IN ('merged', 'archived') AND COALESCE(contact_status, '') NOT IN ('archived', 'blocked')
          AND COALESCE(source, '') <> 'legacy_guest_migrated'`,
    );
    for (const player of players) {
      const target = targets.get(String(player.id));
      if (!target) continue;
      const from = currentActivity(player);
      if (from === target) continue;
      await writeActivity(tx, String(player.id), player, target, now.toISOString());
      changes.push({ id: String(player.id), nickname: String(player.nickname), from, to: target });
    }
  });
  return changes;
}
