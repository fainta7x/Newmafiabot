import { Router, Response } from 'express';
import { getDb } from '../../db/index.ts';
import { requireOrganizerAuth, AuthenticatedRequest } from '../auth.ts';

const router = Router();

function getMoscowDateStr(isoOrDateStr: string | null | undefined): string | null {
  if (!isoOrDateStr || isoOrDateStr.trim() === '') return null;
  const d = new Date(isoOrDateStr);
  if (isNaN(d.getTime())) {
    if (/^\d{4}-\d{2}-\d{2}/.test(isoOrDateStr)) {
      return isoOrDateStr.substring(0, 10);
    }
    return null;
  }
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Moscow',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d);
  const year = parts.find((p) => p.type === 'year')?.value;
  const month = parts.find((p) => p.type === 'month')?.value;
  const day = parts.find((p) => p.type === 'day')?.value;
  return `${year}-${month}-${day}`;
}

// GET /api/crm/overview - Aggregated pulse endpoint for organizer home screen
router.get('/overview', requireOrganizerAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const db = (req as any).db || (await getDb());

    const nowIso = new Date().toISOString();

    // 1. Closest future evening (starts_at >= nowIso AND not cancelled or completed)
    const nextEvening = await db.get(
      `SELECT e.*,
        (SELECT COUNT(*) FROM evening_participants p WHERE p.evening_id = e.id AND p.registration_status IN ('registered', 'confirmed')) as registered_count,
        (SELECT COUNT(*) FROM evening_participants p WHERE p.evening_id = e.id AND p.registration_status = 'confirmed') as confirmed_count,
        (SELECT COUNT(*) FROM evening_participants p WHERE p.evening_id = e.id AND p.registration_status = 'waitlist') as waitlist_count,
        (SELECT COUNT(*) FROM evening_participants p WHERE p.evening_id = e.id AND p.registration_status = 'invited') as invited_count
       FROM game_evenings e
       WHERE e.status NOT IN ('cancelled', 'completed') AND e.starts_at >= ?
       ORDER BY e.starts_at ASC
       LIMIT 1`,
      [nowIso]
    );

    let tables: any[] = [];
    let eveningParticipants: any[] = [];
    let unansweredInvites: any[] = [];
    let unconfirmedRegistered: any[] = [];
    let waitlistParticipants: any[] = [];
    let newcomersOnEvening: any[] = [];
    let expectedToPayAmount = 0;
    let expectedToPayCount = 0;

    if (nextEvening) {
      // Fetch participants on next evening
      eveningParticipants = await db.all(
        `SELECT ep.*, p.nickname, p.telegram_username, p.phone, p.lifecycle_status,
          t.name as table_name,
          (SELECT COUNT(*) FROM evening_participants p2 WHERE p2.player_id = ep.player_id AND p2.attendance_status = 'attended') as total_attended
         FROM evening_participants ep
         JOIN players p ON p.id = ep.player_id
         LEFT JOIN evening_tables t ON t.id = ep.table_id
         WHERE ep.evening_id = ?`,
        [nextEvening.id]
      );

      // Fetch tables (READ ONLY, DO NOT CREATE TABLES)
      tables = await db.all(
        `SELECT t.*,
          (SELECT COUNT(*) FROM evening_participants p WHERE p.table_id = t.id AND p.registration_status IN ('registered', 'confirmed')) as occupied,
          (SELECT COUNT(*) FROM evening_participants p WHERE p.table_id = t.id AND p.registration_status = 'invited') as invited_count,
          (SELECT COUNT(*) FROM evening_participants p WHERE p.table_id = t.id AND p.registration_status = 'waitlist') as waitlist_count
         FROM evening_tables t
         WHERE t.evening_id = ?
         ORDER BY t.sort_order ASC, t.created_at ASC`,
        [nextEvening.id]
      );

      tables = tables.map((t: any) => {
        const occupied = t.occupied || 0;
        return {
          ...t,
          occupied,
          participant_count: occupied,
          invited_count: t.invited_count || 0,
          waitlist_count: t.waitlist_count || 0,
          free_spots: Math.max(0, t.capacity - occupied),
        };
      });

      unansweredInvites = eveningParticipants.filter((p: any) => p.registration_status === 'invited');
      unconfirmedRegistered = eveningParticipants.filter((p: any) => p.registration_status === 'registered');
      waitlistParticipants = eveningParticipants.filter((p: any) => p.registration_status === 'waitlist');
      newcomersOnEvening = eveningParticipants.filter((p: any) => p.total_attended <= 1);

      // Expected payment for nearest evening (registered & confirmed only, amount_due > amount_paid)
      const expectedPayItems = eveningParticipants.filter(
        (p: any) =>
          (p.registration_status === 'registered' || p.registration_status === 'confirmed') &&
          p.payment_status !== 'waived' &&
          p.amount_due > p.amount_paid
      );
      expectedToPayAmount = expectedPayItems.reduce(
        (sum: number, p: any) => sum + (p.amount_due - p.amount_paid),
        0
      );
      expectedToPayCount = expectedPayItems.length;
    }

    // 2. Tasks filtering by Europe/Moscow timezone & excluding done / cancelled
    const activeTasks = await db.all(
      `SELECT t.*, p.nickname as player_nickname, p.telegram_username, p.phone
       FROM organizer_tasks t
       LEFT JOIN players p ON p.id = t.player_id
       WHERE t.status NOT IN ('done', 'cancelled')
       ORDER BY t.due_at ASC, t.created_at DESC`
    );

    const todayMoscowStr = getMoscowDateStr(nowIso)!;

    const overdueTasks: any[] = [];
    const todayTasks: any[] = [];
    const noDeadlineTasks: any[] = [];

    for (const task of activeTasks) {
      const taskDateStr = getMoscowDateStr(task.due_at);
      if (!taskDateStr) {
        noDeadlineTasks.push(task);
      } else if (taskDateStr < todayMoscowStr) {
        overdueTasks.push(task);
      } else if (taskDateStr === todayMoscowStr) {
        todayTasks.push(task);
      }
    }

    // 5. Newcomers after 1st visit with no open follow-up feedback task
    const newcomersAfterFirst = await db.all(
      `SELECT p.*,
        (SELECT COUNT(*) FROM evening_participants ep WHERE ep.player_id = p.id AND ep.attendance_status = 'attended') as attendance_count,
        (SELECT MAX(ge.starts_at) FROM evening_participants ep JOIN game_evenings ge ON ge.id = ep.evening_id WHERE ep.player_id = p.id AND ep.attendance_status = 'attended') as last_visit
       FROM players p
       WHERE (SELECT COUNT(*) FROM evening_participants ep WHERE ep.player_id = p.id AND ep.attendance_status = 'attended') = 1
         AND NOT EXISTS (
           SELECT 1 FROM organizer_tasks ot WHERE ot.player_id = p.id AND ot.status NOT IN ('done', 'cancelled') AND (ot.type = 'feedback' OR ot.title LIKE '%первой игры%')
         )
       LIMIT 10`
    );

    // 6. Inactive/Lapsed players (no visit in 30+ days and no open task)
    const thirtyDaysAgoIso = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const lapsedPlayers = await db.all(
      `SELECT p.*,
        MAX(ge.starts_at) as last_visit,
        COUNT(CASE WHEN ep.attendance_status = 'attended' THEN 1 END) as attendance_count
       FROM players p
       JOIN evening_participants ep ON ep.player_id = p.id AND ep.attendance_status = 'attended'
       JOIN game_evenings ge ON ge.id = ep.evening_id
       WHERE p.lifecycle_status != 'blocked'
       GROUP BY p.id
       HAVING MAX(ge.starts_at) < ?
         AND NOT EXISTS (
           SELECT 1 FROM organizer_tasks ot WHERE ot.player_id = p.id AND ot.status NOT IN ('done', 'cancelled')
         )
       ORDER BY last_visit ASC
       LIMIT 10`,
      [thirtyDaysAgoIso]
    );

    // 7. Real Unpaid participants / debtors (ONLY completed evenings OR evenings with settled_at)
    const unpaidParticipants = await db.all(
      `SELECT ep.*, p.nickname, p.phone, p.telegram_username, ge.title as evening_title, ge.starts_at as evening_date
       FROM evening_participants ep
       JOIN players p ON p.id = ep.player_id
       JOIN game_evenings ge ON ge.id = ep.evening_id
       WHERE (ge.status = 'completed' OR ge.settled_at IS NOT NULL)
         AND ep.registration_status NOT IN ('cancelled', 'waitlist')
         AND ep.payment_status != 'waived'
         AND ep.amount_due > ep.amount_paid
       ORDER BY ge.starts_at DESC`
    );

    const totalUnpaidAmount = unpaidParticipants.reduce(
      (sum: number, p: any) => sum + (p.amount_due - p.amount_paid),
      0
    );

    res.json({
      nextEvening: nextEvening
        ? {
            ...nextEvening,
            tables,
            invitedCount: unansweredInvites.length,
            registeredCount: eveningParticipants.filter((p: any) => p.registration_status === 'registered').length,
            confirmedCount: eveningParticipants.filter((p: any) => p.registration_status === 'confirmed').length,
            waitlistCount: waitlistParticipants.length,
            newcomersCount: newcomersOnEvening.length,
            expectedToPayAmount,
            expectedToPayCount,
          }
        : null,
      actionLists: {
        unansweredInvites,
        unconfirmedRegistered,
        waitlistParticipants,
        newcomersAfterFirst,
        lapsedPlayers,
        overdueTasks,
        todayTasks,
        noDeadlineTasks,
        unpaidParticipants,
      },
      summary: {
        overdueTasksCount: overdueTasks.length,
        todayTasksCount: todayTasks.length,
        noDeadlineTasksCount: noDeadlineTasks.length,
        newcomersWithoutFollowupCount: newcomersAfterFirst.length,
        lapsedPlayersCount: lapsedPlayers.length,
        unpaidParticipantsCount: unpaidParticipants.length,
        totalUnpaidAmount,
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Database error', message: err.message });
  }
});

export default router;
