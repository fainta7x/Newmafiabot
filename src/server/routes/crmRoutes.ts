import { Router, Response } from 'express';
import { getDb } from '../../db/index.ts';
import { requireOrganizerAuth, AuthenticatedRequest } from '../auth.ts';
import { runCrmAutomations } from '../services/crmAutomationService.ts';

const router = Router();

// GET /api/crm/overview - Aggregated pulse endpoint for organizer home screen
router.get('/overview', requireOrganizerAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const db = (req as any).db || (await getDb());

    // Run automations before returning the overview
    await runCrmAutomations(db);

    const nowIso = new Date().toISOString();
    const todayStr = nowIso.substring(0, 10);
    const todayStartIso = `${todayStr}T00:00:00.000Z`;

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
    let newcomersOnEvening: any[] = [];

    if (nextEvening) {
      // Fetch participants on next evening first
      eveningParticipants = await db.all(
        `SELECT ep.*, p.nickname, p.telegram_username, p.phone, p.lifecycle_status,
          (SELECT COUNT(*) FROM evening_participants p2 WHERE p2.player_id = ep.player_id AND p2.attendance_status = 'attended') as total_attended
         FROM evening_participants ep
         JOIN players p ON p.id = ep.player_id
         WHERE ep.evening_id = ?`,
        [nextEvening.id]
      );

      // Fetch tables
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

      // Auto-create default table if none exist
      if (tables.length === 0) {
        const tableId = `tbl_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        await db.run(
          `INSERT INTO evening_tables (id, evening_id, name, format, capacity, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [tableId, nextEvening.id, 'Основной стол', nextEvening.format || 'STANDARD', nextEvening.capacity || 10, nowIso, nowIso]
        );
        const occupiedCount = eveningParticipants.filter(
          (p: any) => p.registration_status === 'registered' || p.registration_status === 'confirmed'
        ).length;
        const invitedCount = eveningParticipants.filter((p: any) => p.registration_status === 'invited').length;
        const waitlistCount = eveningParticipants.filter((p: any) => p.registration_status === 'waitlist').length;
        tables = [
          {
            id: tableId,
            evening_id: nextEvening.id,
            name: 'Основной стол',
            format: nextEvening.format || 'STANDARD',
            capacity: nextEvening.capacity || 10,
            occupied: occupiedCount,
            participant_count: occupiedCount,
            invited_count: invitedCount,
            waitlist_count: waitlistCount,
            free_spots: Math.max(0, (nextEvening.capacity || 10) - occupiedCount),
          },
        ];
      } else {
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
      }

      unansweredInvites = eveningParticipants.filter((p: any) => p.registration_status === 'invited');
      unconfirmedRegistered = eveningParticipants.filter((p: any) => p.registration_status === 'registered');
      newcomersOnEvening = eveningParticipants.filter((p: any) => p.total_attended <= 1);
    }

    // 2. Overdue tasks (status != done, due_at strictly before todayStartIso)
    const overdueTasks = await db.all(
      `SELECT t.*, p.nickname as player_nickname, p.telegram_username, p.phone
       FROM organizer_tasks t
       LEFT JOIN players p ON p.id = t.player_id
       WHERE t.status != 'done' AND t.due_at IS NOT NULL AND t.due_at != '' AND t.due_at < ?
       ORDER BY t.due_at ASC`,
      [todayStartIso]
    );

    // 3. Today's tasks (due_at starts with todayStr)
    const todayTasks = await db.all(
      `SELECT t.*, p.nickname as player_nickname, p.telegram_username, p.phone
       FROM organizer_tasks t
       LEFT JOIN players p ON p.id = t.player_id
       WHERE t.status != 'done' AND t.due_at IS NOT NULL AND t.due_at LIKE ?
       ORDER BY t.due_at ASC`,
      [`${todayStr}%`]
    );

    // 4. Tasks without deadline
    const noDeadlineTasks = await db.all(
      `SELECT t.*, p.nickname as player_nickname, p.telegram_username, p.phone
       FROM organizer_tasks t
       LEFT JOIN players p ON p.id = t.player_id
       WHERE t.status != 'done' AND (t.due_at IS NULL OR t.due_at = '')
       ORDER BY t.created_at DESC`
    );

    // 5. Newcomers after 1st visit with no open follow-up feedback task
    const newcomersAfterFirst = await db.all(
      `SELECT p.*,
        (SELECT COUNT(*) FROM evening_participants ep WHERE ep.player_id = p.id AND ep.attendance_status = 'attended') as attendance_count,
        (SELECT MAX(ge.starts_at) FROM evening_participants ep JOIN game_evenings ge ON ge.id = ep.evening_id WHERE ep.player_id = p.id AND ep.attendance_status = 'attended') as last_visit
       FROM players p
       WHERE (SELECT COUNT(*) FROM evening_participants ep WHERE ep.player_id = p.id AND ep.attendance_status = 'attended') = 1
         AND NOT EXISTS (
           SELECT 1 FROM organizer_tasks ot WHERE ot.player_id = p.id AND ot.status != 'done' AND (ot.type = 'feedback' OR ot.title LIKE '%первой игры%')
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
           SELECT 1 FROM organizer_tasks ot WHERE ot.player_id = p.id AND ot.status != 'done'
         )
       ORDER BY last_visit ASC
       LIMIT 10`,
      [thirtyDaysAgoIso]
    );

    // 7. Unpaid participants / debtors
    const unpaidParticipants = await db.all(
      `SELECT ep.*, p.nickname, p.phone, p.telegram_username, ge.title as evening_title, ge.starts_at as evening_date
       FROM evening_participants ep
       JOIN players p ON p.id = ep.player_id
       JOIN game_evenings ge ON ge.id = ep.evening_id
       WHERE ep.payment_status IN ('unpaid', 'partial') AND ep.amount_due > ep.amount_paid
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
            waitlistCount: eveningParticipants.filter((p: any) => p.registration_status === 'waitlist').length,
            newcomersCount: newcomersOnEvening.length,
          }
        : null,
      actionLists: {
        unansweredInvites,
        unconfirmedRegistered,
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
