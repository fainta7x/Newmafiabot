import { Router, Response } from 'express';
import { getDb, type DatabaseWrapper } from '../../db/index.ts';
import { requireOrganizerAuth, AuthenticatedRequest } from '../auth.ts';
import { countEveningResponses, getEveningResponse } from '../../lib/eveningResponse.ts';
import { loadAnnouncementOverview } from '../services/eveningAnnouncementTrackingService.ts';

const router = Router();
function getMoscowDateStr(value: string | null | undefined): string | null {
  if (!value || value.trim() === '') return null;
  const date = new Date(value);
  if (isNaN(date.getTime())) return /^\d{4}-\d{2}-\d{2}/.test(value) ? value.substring(0, 10) : null;
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  return `${parts.find((p) => p.type === 'year')?.value}-${parts.find((p) => p.type === 'month')?.value}-${parts.find((p) => p.type === 'day')?.value}`;
}

router.get('/overview', requireOrganizerAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const db: DatabaseWrapper = (req as any).db || (await getDb());
    const nowIso = new Date().toISOString();
    const nextEvening = await db.get<any>(`SELECT e.* FROM game_evenings e WHERE e.status NOT IN ('cancelled','completed') AND e.starts_at >= ? ORDER BY e.starts_at ASC LIMIT 1`, [nowIso]);
    let tables: any[] = []; let participants: any[] = [];
    let counts = { going: 0, late: 0, thinking: 0, declined: 0, unanswered: 0, responded: 0, audience: 0 };
    let newcomersOnEvening: any[] = []; let expectedToPayAmount = 0; let expectedToPayCount = 0;
    let expectedPlayersCount = 0; let seatedExpectedCount = 0; let unseatedExpectedCount = 0;
    let gamesCount = 0; let completedGamesCount = 0;
    let announcementSummary = { audience: 0, sent: 0, answered: 0, unanswered: 0, failed: 0, not_sent: 0, reminded: 0 };
    if (nextEvening) {
      participants = await db.all<any>(`SELECT ep.*,p.nickname,p.telegram_username,p.phone,p.lifecycle_status,(SELECT COUNT(*) FROM evening_participants p2 WHERE p2.player_id=ep.player_id AND p2.attendance_status='attended') AS total_attended FROM evening_participants ep JOIN players p ON p.id=ep.player_id WHERE ep.evening_id=?`, [nextEvening.id]);
      tables = await db.all<any>('SELECT * FROM evening_tables WHERE evening_id=? ORDER BY sort_order ASC,created_at ASC', [nextEvening.id]);
      counts = countEveningResponses(participants);
      newcomersOnEvening = participants.filter((p: any) => p.total_attended <= 1);
      const expectedPlayers = participants.filter((p: any) => ['going', 'late'].includes(getEveningResponse(p)));
      expectedPlayersCount = expectedPlayers.length;
      seatedExpectedCount = expectedPlayers.filter((p: any) => Boolean(p.table_id)).length;
      unseatedExpectedCount = Math.max(0, expectedPlayersCount - seatedExpectedCount);
      const gameSummary = await db.get<any>(`
        SELECT COUNT(*) AS total,
               SUM(CASE WHEN winner_team IS NOT NULL THEN 1 ELSE 0 END) AS completed
          FROM games
         WHERE evening_id=?
      `, [nextEvening.id]);
      gamesCount = Number(gameSummary?.total || 0);
      completedGamesCount = Number(gameSummary?.completed || 0);
      try {
        const announcement = await loadAnnouncementOverview(db, String(nextEvening.id));
        if (announcement?.summary) announcementSummary = { ...announcementSummary, ...announcement.summary };
      } catch (error) {
        console.warn('[CRM] Could not load announcement readiness:', error);
      }
      const unpaidNow = participants.filter((p: any) => p.attendance_status === 'attended' && p.payment_status !== 'waived' && Number(p.amount_due || 0) > Number(p.amount_paid || 0));
      expectedToPayAmount = unpaidNow.reduce((sum: number, p: any) => sum + Number(p.amount_due || 0) - Number(p.amount_paid || 0), 0);
      expectedToPayCount = unpaidNow.length;
    }
    const activeTasks = await db.all<any>(`SELECT t.*,p.nickname AS player_nickname,p.telegram_username,p.phone FROM organizer_tasks t LEFT JOIN players p ON p.id=t.player_id WHERE t.status NOT IN ('done','cancelled') AND (t.automation_key IS NULL OR (t.automation_key NOT LIKE 'clarify-participation:%' AND t.automation_key NOT LIKE 'invite-followup:%' AND t.automation_key NOT LIKE 'reminder-confirmed:%' AND t.automation_key NOT LIKE 'reinvite-second-visit:%')) ORDER BY t.due_at ASC,t.created_at DESC`);
    const today = getMoscowDateStr(nowIso)!; const overdueTasks: any[] = []; const todayTasks: any[] = []; const noDeadlineTasks: any[] = [];
    for (const task of activeTasks) { const day = getMoscowDateStr(task.due_at); if (!day) noDeadlineTasks.push(task); else if (day < today) overdueTasks.push(task); else if (day === today) todayTasks.push(task); }
    const newcomersAfterFirst = await db.all<any>(`SELECT p.*,(SELECT COUNT(*) FROM evening_participants ep WHERE ep.player_id=p.id AND ep.attendance_status='attended') AS attendance_count,(SELECT MAX(ge.starts_at) FROM evening_participants ep JOIN game_evenings ge ON ge.id=ep.evening_id WHERE ep.player_id=p.id AND ep.attendance_status='attended') AS last_visit FROM players p WHERE (SELECT COUNT(*) FROM evening_participants ep WHERE ep.player_id=p.id AND ep.attendance_status='attended')=1 AND NOT EXISTS (SELECT 1 FROM organizer_tasks ot WHERE ot.player_id=p.id AND ot.status NOT IN ('done','cancelled') AND (ot.type='feedback' OR ot.title LIKE '%первой игры%')) LIMIT 10`);
    const clubAccessReview = await db.all<any>(`
      SELECT p.*,
        (SELECT COUNT(*) FROM evening_participants ep JOIN game_evenings ge ON ge.id=ep.evening_id WHERE ep.player_id=p.id AND ep.attendance_status='attended' AND ge.status='completed') AS attendance_count,
        (SELECT MAX(ge.starts_at) FROM evening_participants ep JOIN game_evenings ge ON ge.id=ep.evening_id WHERE ep.player_id=p.id AND ep.attendance_status='attended' AND ge.status='completed') AS last_visit
      FROM players p
      WHERE COALESCE(p.game_level,'club')='novice'
        AND COALESCE(p.contact_status,'normal')='normal'
        AND (SELECT COUNT(*) FROM evening_participants ep JOIN game_evenings ge ON ge.id=ep.evening_id WHERE ep.player_id=p.id AND ep.attendance_status='attended' AND ge.status='completed')>=2
      ORDER BY attendance_count DESC,last_visit DESC
      LIMIT 10
    `);
    const thirtyDaysAgoIso = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const lapsedPlayers = await db.all<any>(`SELECT p.*,MAX(ge.starts_at) AS last_visit,COUNT(CASE WHEN ep.attendance_status='attended' THEN 1 END) AS attendance_count FROM players p JOIN evening_participants ep ON ep.player_id=p.id AND ep.attendance_status='attended' JOIN game_evenings ge ON ge.id=ep.evening_id WHERE p.lifecycle_status!='blocked' GROUP BY p.id HAVING MAX(ge.starts_at) < ? AND NOT EXISTS (SELECT 1 FROM organizer_tasks ot WHERE ot.player_id=p.id AND ot.status NOT IN ('done','cancelled')) ORDER BY last_visit ASC LIMIT 10`, [thirtyDaysAgoIso]);
    const unpaidParticipants = await db.all<any>(`SELECT ep.*,p.nickname,p.phone,p.telegram_username,ge.title AS evening_title,ge.starts_at AS evening_date FROM evening_participants ep JOIN players p ON p.id=ep.player_id JOIN game_evenings ge ON ge.id=ep.evening_id WHERE (ge.status='completed' OR ge.settled_at IS NOT NULL) AND ep.attendance_status='attended' AND ep.payment_status!='waived' AND ep.amount_due>ep.amount_paid ORDER BY ge.starts_at DESC`);
    const totalUnpaidAmount = unpaidParticipants.reduce((sum: number, p: any) => sum + Number(p.amount_due || 0) - Number(p.amount_paid || 0), 0);
    return res.json({
      nextEvening: nextEvening ? {
        ...nextEvening,
        tables,
        invitedCount: counts.unanswered,
        registeredCount: counts.going + counts.late,
        confirmedCount: 0,
        waitlistCount: 0,
        newcomersCount: newcomersOnEvening.length,
        expectedToPayAmount,
        expectedToPayCount,
        goingCount: counts.going,
        laterCount: counts.late,
        thinkingCount: counts.thinking,
        declinedCount: counts.declined,
        unansweredCount: counts.unanswered,
        respondedCount: counts.responded,
        audienceCount: counts.audience,
        announcementSummary,
        expectedPlayersCount,
        seatedExpectedCount,
        unseatedExpectedCount,
        gamesCount,
        completedGamesCount,
      } : null,
      actionLists: { unansweredInvites: [], unconfirmedRegistered: [], waitlistParticipants: [], newcomersAfterFirst, clubAccessReview, lapsedPlayers, overdueTasks, todayTasks, noDeadlineTasks, unpaidParticipants },
      summary: { overdueTasksCount: overdueTasks.length, todayTasksCount: todayTasks.length, noDeadlineTasksCount: noDeadlineTasks.length, newcomersWithoutFollowupCount: newcomersAfterFirst.length, clubAccessReviewCount: clubAccessReview.length, lapsedPlayersCount: lapsedPlayers.length, unpaidParticipantsCount: unpaidParticipants.length, totalUnpaidAmount },
    });
  } catch (err: any) {
    console.error('[CRM] Overview database error:', err);
    return res.status(500).json({ error: 'Database error', message: err.message });
  }
});
export default router;
