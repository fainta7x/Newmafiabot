import { Router } from 'express';
import { getDb } from '../../db/index.ts';
import { requireOrganizerAuth } from '../auth.ts';

const router = Router();

// GET /api/analytics - High-precision CRM Analytics (Auth required)
router.get('/', requireOrganizerAuth, async (req, res) => {
  try {
    const { period, start_date, end_date } = req.query;
    const db = (req as any).db || (await getDb());
    const nowMs = Date.now();

    // Determine date range for period filtering
    let rangeStart: Date | null = null;
    let rangeEnd: Date = new Date();

    if (period === '7d') {
      rangeStart = new Date(nowMs - 7 * 24 * 60 * 60 * 1000);
    } else if (period === '30d') {
      rangeStart = new Date(nowMs - 30 * 24 * 60 * 60 * 1000);
    } else if (period === '90d') {
      rangeStart = new Date(nowMs - 90 * 24 * 60 * 60 * 1000);
    } else if (start_date) {
      rangeStart = new Date(String(start_date));
      if (end_date) rangeEnd = new Date(String(end_date));
    }

    const rangeStartIso = rangeStart ? rangeStart.toISOString() : '1970-01-01T00:00:00.000Z';
    const rangeEndIso = rangeEnd.toISOString();

    // 1. Players & Inactivity (Cumulative: 30+, 60+, 90+)
    const players = await db.all(`
      SELECT p.*,
        (SELECT COUNT(*) FROM evening_participants ep JOIN game_evenings e ON ep.evening_id = e.id WHERE ep.player_id = p.id AND ep.attendance_status = 'attended' AND e.status = 'completed') as total_attended,
        (SELECT MIN(e.starts_at) FROM evening_participants ep JOIN game_evenings e ON ep.evening_id = e.id WHERE ep.player_id = p.id AND ep.attendance_status = 'attended' AND e.status = 'completed') as first_visit,
        (SELECT MAX(e.starts_at) FROM evening_participants ep JOIN game_evenings e ON ep.evening_id = e.id WHERE ep.player_id = p.id AND ep.attendance_status = 'attended' AND e.status = 'completed') as last_visit
      FROM players p
    `);

    const totalPlayers = players.length;
    let inactive30 = 0; // >= 30 days
    let inactive60 = 0; // >= 60 days
    let inactive90 = 0; // >= 90 days

    players.forEach((p: any) => {
      if (p.last_visit) {
        const lastMs = new Date(p.last_visit).getTime();
        const days = (nowMs - lastMs) / (1000 * 60 * 60 * 24);
        if (days >= 30) inactive30++;
        if (days >= 60) inactive60++;
        if (days >= 90) inactive90++;
      }
    });

    // 2. Cohort Retention (First visit in period -> 2nd visit within 30 days)
    let cohortFirstVisits = 0;
    let cohortReturnedIn30Days = 0;

    for (const p of players) {
      if (p.first_visit && p.first_visit >= rangeStartIso && p.first_visit <= rangeEndIso) {
        cohortFirstVisits++;
        const firstMs = new Date(p.first_visit).getTime();
        const secondVisit = await db.get(`
          SELECT MIN(e.starts_at) as second_visit
          FROM evening_participants ep
          JOIN game_evenings e ON ep.evening_id = e.id
          WHERE ep.player_id = ? AND ep.attendance_status = 'attended' AND e.status = 'completed' AND e.starts_at > ?
        `, [p.id, p.first_visit]);

        if (secondVisit && secondVisit.second_visit) {
          const secondMs = new Date(secondVisit.second_visit).getTime();
          if ((secondMs - firstMs) <= 30 * 24 * 60 * 60 * 1000) {
            cohortReturnedIn30Days++;
          }
        }
      }
    }

    const cohortRetention30dRate = cohortFirstVisits > 0
      ? Math.round((cohortReturnedIn30Days / cohortFirstVisits) * 100)
      : 0;

    // 3. Registration & Attendance stats ONLY for COMPLETED past evenings
    const participantStats = await db.get(`
      SELECT 
        SUM(CASE WHEN ep.response_status IN ('going','late') THEN 1 ELSE 0 END) as total_registrations,
        SUM(CASE WHEN ep.response_status = 'declined' THEN 1 ELSE 0 END) as total_cancelled,
        SUM(CASE WHEN ep.attendance_status = 'attended' THEN 1 ELSE 0 END) as total_attended,
        SUM(CASE WHEN ep.attendance_status = 'no_show' THEN 1 ELSE 0 END) as total_no_show
      FROM evening_participants ep
      JOIN game_evenings e ON ep.evening_id = e.id
      WHERE e.status = 'completed' AND e.starts_at >= ? AND e.starts_at <= ?
    `, [rangeStartIso, rangeEndIso]);

    const totalRegs = participantStats?.total_registrations || 0;
    const totalCancelled = participantStats?.total_cancelled || 0;
    const totalAttended = participantStats?.total_attended || 0;
    const totalNoShow = participantStats?.total_no_show || 0;

    const cancellationRate = totalRegs > 0 ? Math.round((totalCancelled / totalRegs) * 100) : 0;
    const noShowRate = totalRegs > 0 ? Math.round((totalNoShow / totalRegs) * 100) : 0;

    // 4. Financials strictly from financial_transactions
    const txStats = await db.all(`
      SELECT type, COALESCE(SUM(amount), 0) as total
      FROM financial_transactions
      WHERE created_at >= ? AND created_at <= ?
      GROUP BY type
    `, [rangeStartIso, rangeEndIso]);

    const txMap: Record<string, number> = {};
    txStats.forEach((t: any) => {
      txMap[t.type] = Number(t.total) || 0;
    });

    const incomePaid = (txMap['income'] || 0) + (txMap['debt_paid'] || 0);
    const debtCreated = txMap['debt_created'] || 0;
    const debtPaid = txMap['debt_paid'] || 0;
    const accrued = (txMap['income'] || 0) + debtCreated; // total billings
    const outstandingDebt = Math.max(0, debtCreated - debtPaid);
    const refunds = txMap['refund'] || 0;
    const expenses = txMap['expense'] || 0;

    // Evenings count in range
    const eveningsCountRow = await db.get(`
      SELECT COUNT(*) as count FROM game_evenings
      WHERE status = 'completed' AND starts_at >= ? AND starts_at <= ?
    `, [rangeStartIso, rangeEndIso]);

    const completedEvenings = eveningsCountRow?.count || 0;
    const avgAttendance = completedEvenings > 0 ? (totalAttended / completedEvenings).toFixed(1) : 0;
    const avgRevenue = completedEvenings > 0 ? Math.round(incomePaid / completedEvenings) : 0;

    // Source Breakdown
    const sourceBreakdown: Record<string, number> = {};
    players.forEach((p: any) => {
      const src = p.source || 'Не указан';
      sourceBreakdown[src] = (sourceBreakdown[src] || 0) + 1;
    });

    res.json({
      period: period || 'all',
      totalPlayers,
      inactive30,
      inactive60,
      inactive90,
      cohortFirstVisits,
      cohortReturnedIn30Days,
      cohortRetention30dRate,
      completedEvenings,
      totalRegistrations: totalRegs,
      totalAttended,
      totalCancelled,
      totalNoShow,
      cancellationRate,
      noShowRate,
      avgAttendance,
      financials: {
        accrued,
        incomePaid,
        outstandingDebt,
        refunds,
        expenses,
        avgRevenuePerEvening: avgRevenue,
      },
      sourceBreakdown,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Database error', message: err.message });
  }
});

export default router;
