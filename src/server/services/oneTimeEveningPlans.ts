import { randomUUID } from 'node:crypto';
import type { DatabaseWrapper } from '../../db/index.ts';
import { ensureWeeklyEveningAutomationSchema } from '../../db/ensureWeeklyEveningAutomationSchema.ts';
import { ensureSlotsForEvening, updateEveningSlotSettings } from './eveningSlotPlanningService.ts';

/**
 * One-time evening plans the owner asked to run automatically (2026-09-28): on 2 October the novice
 * evening comes first (rules at 18:30, games 19:00–21:00) and the club evening starts at 21:00.
 * Each plan runs once after deploy, is recorded in `club_weekly_automation_runs`, and never runs
 * after its evening has begun. What the organizer already did by hand is left as it is.
 */
const PLAN_KEY = 'one-time:2026-10-02-novice-friday';
const DATE = '2026-10-02';
const LAST_RUN_AT = Date.parse('2026-10-02T15:00:00Z'); // 18:00 Moscow

const moscowClock = (value: string) => new Date(value).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' });

export async function runOneTimeEveningPlans(db: DatabaseWrapper, now: Date = new Date(), options: { inTests?: boolean } = {}) {
  // Test databases run the weekly automation with the real clock; the plan is for the club's own data.
  if (process.env.NODE_ENV === 'test' && !options.inTests) return { ran: false, reason: 'test_run' as const };
  if (now.getTime() >= LAST_RUN_AT) return { ran: false, reason: 'too_late' as const };
  await ensureWeeklyEveningAutomationSchema(db);
  const done = await db.get('SELECT 1 FROM club_weekly_automation_runs WHERE automation_key = ?', [PLAN_KEY]);
  if (done) return { ran: false, reason: 'already_done' as const };

  const onDate = await db.all<any>(
    `SELECT e.*, (SELECT COUNT(*) FROM games g WHERE g.evening_id = e.id) AS games
       FROM game_evenings e
      WHERE substr(e.starts_at, 1, 10) = ? AND e.status <> 'cancelled'
      ORDER BY e.created_at ASC`,
    [DATE],
  );
  const format = (row: any) => String(row.format || '').toUpperCase();
  const club = onDate.find((row) => ['CASUAL', 'STANDARD'].includes(format(row)));
  const novice = onDate.find((row) => format(row) === 'NOVICE');
  const actions: string[] = [];

  // 1. The club evening moves from 20:00 to 21:00 with all its games.
  if (club && ['draft', 'published'].includes(String(club.status)) && !Number(club.games) && moscowClock(club.starts_at) === '20:00') {
    const plan = await ensureSlotsForEvening(db, String(club.id));
    await updateEveningSlotSettings(db, String(club.id), {
      planned_slots: plan.slots.length || Number(plan.settings.planned_slots || 6),
      slot_duration_minutes: Number(plan.settings.slot_duration_minutes || 60),
      price_per_game: Number(plan.settings.price_per_game || 100),
      starts_at: `${DATE}T21:00:00+03:00`,
    });
    actions.push('club_moved_to_21');
  }

  // 2. The novice evening: rules at 18:30, two games 19:00–21:00, registration open.
  if (!novice) {
    const id = randomUUID();
    const stamp = new Date().toISOString();
    await db.run(
      `INSERT INTO game_evenings (id, title, starts_at, ends_at, timezone, venue, format, status, capacity, default_price, notes, created_at, updated_at)
       VALUES (?, 'Вечер для новичков', ?, ?, 'Europe/Moscow', 'Суп с Котом', 'NOVICE', 'published', 20, 200, NULL, ?, ?)`,
      [id, `${DATE}T19:00:00+03:00`, `${DATE}T21:00:00+03:00`, stamp, stamp],
    );
    await updateEveningSlotSettings(db, id, {
      planned_slots: 2, slot_duration_minutes: 60, price_per_game: 200, starts_at: `${DATE}T19:00:00+03:00`,
    });
    actions.push('novice_created');
  } else if (String(novice.status) === 'draft') {
    await db.run("UPDATE game_evenings SET status = 'published', updated_at = ? WHERE id = ? AND status = 'draft'", [new Date().toISOString(), novice.id]);
    actions.push('novice_opened');
  }

  const stamp = new Date().toISOString();
  await db.run(
    `INSERT OR IGNORE INTO club_weekly_automation_runs (automation_key, evening_id, kind, status, completed_at, last_error, created_at, updated_at)
     VALUES (?, NULL, 'one_time_plan', 'done', ?, NULL, ?, ?)`,
    [PLAN_KEY, stamp, stamp, stamp],
  );
  console.log(`[ONE-TIME PLAN] ${PLAN_KEY}: ${actions.join(', ') || 'nothing to do'}`);
  return { ran: true, actions };
}
