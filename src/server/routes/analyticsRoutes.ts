import { Router } from 'express';
import { getDb } from '../../db/index.ts';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const db = await getDb();
    const nowMs = Date.now();

    // All players with their visit history
    const players = await db.all(`
      SELECT p.*,
        (SELECT COUNT(*) FROM evening_participants ep WHERE ep.player_id = p.id AND ep.attendance_status = 'attended') as attended_count,
        (SELECT MAX(e.starts_at) FROM evening_participants ep JOIN game_evenings e ON ep.evening_id = e.id WHERE ep.player_id = p.id AND ep.attendance_status = 'attended') as last_visit,
        (SELECT MIN(e.starts_at) FROM evening_participants ep JOIN game_evenings e ON ep.evening_id = e.id WHERE ep.player_id = p.id AND ep.attendance_status = 'attended') as first_visit
      FROM players p
    `);

    const totalPlayers = players.length;
    const newPlayersCount = players.filter((p: any) => p.lifecycle_status === 'newcomer' || p.attended_count === 1).length;
    const oneVisitPlayers = players.filter((p: any) => p.attended_count === 1).length;
    const multiVisitPlayers = players.filter((p: any) => p.attended_count >= 2).length;
    
    // First visit to second visit conversion
    const conversion1to2 = oneVisitPlayers + multiVisitPlayers > 0
      ? Math.round((multiVisitPlayers / (oneVisitPlayers + multiVisitPlayers)) * 100)
      : 0;

    // Inactive breakdown
    let inactive30 = 0;
    let inactive60 = 0;
    let inactive90 = 0;

    players.forEach((p: any) => {
      if (p.last_visit) {
        const lastMs = new Date(p.last_visit).getTime();
        const days = (nowMs - lastMs) / (1000 * 60 * 60 * 24);
        if (days >= 90) inactive90++;
        else if (days >= 60) inactive60++;
        else if (days >= 30) inactive30++;
      }
    });

    // Participant Registration & Attendance Conversion
    const participantStats = await db.get(`
      SELECT 
        COUNT(*) as total_registrations,
        SUM(CASE WHEN registration_status = 'cancelled' THEN 1 ELSE 0 END) as total_cancelled,
        SUM(CASE WHEN attendance_status = 'attended' THEN 1 ELSE 0 END) as total_attended,
        SUM(CASE WHEN attendance_status = 'no_show' THEN 1 ELSE 0 END) as total_no_show,
        SUM(amount_due) as total_due,
        SUM(amount_paid) as total_paid
      FROM evening_participants
    `);

    const totalRegs = participantStats?.total_registrations || 0;
    const totalCancelled = participantStats?.total_cancelled || 0;
    const totalAttended = participantStats?.total_attended || 0;
    const totalNoShow = participantStats?.total_no_show || 0;

    const cancellationRate = totalRegs > 0 ? Math.round((totalCancelled / totalRegs) * 100) : 0;
    const noShowRate = totalRegs > 0 ? Math.round((totalNoShow / totalRegs) * 100) : 0;

    // Evening capacity & revenue stats
    const evenings = await db.all(`
      SELECT e.*,
        (SELECT COUNT(*) FROM evening_participants ep WHERE ep.evening_id = e.id AND ep.attendance_status = 'attended') as attended_count,
        (SELECT COALESCE(SUM(amount_paid), 0) FROM evening_participants ep WHERE ep.evening_id = e.id) as revenue
      FROM game_evenings e
    `);

    const totalEvenings = evenings.length;
    const totalRevenue = participantStats?.total_paid || 0;
    const totalOutstandingDebt = (participantStats?.total_due || 0) - (participantStats?.total_paid || 0);

    const avgAttendance = totalEvenings > 0 ? (totalAttended / totalEvenings).toFixed(1) : 0;
    const avgRevenue = totalEvenings > 0 ? Math.round(totalRevenue / totalEvenings) : 0;

    // Source breakdown
    const sourceBreakdown: Record<string, number> = {};
    players.forEach((p: any) => {
      const src = p.source || 'Не указан';
      sourceBreakdown[src] = (sourceBreakdown[src] || 0) + 1;
    });

    res.json({
      totalPlayers,
      newPlayersCount,
      conversion1to2,
      oneVisitPlayers,
      multiVisitPlayers,
      inactive30,
      inactive60,
      inactive90,
      totalRegistrations: totalRegs,
      totalAttended,
      totalCancelled,
      totalNoShow,
      cancellationRate,
      noShowRate,
      totalEvenings,
      avgAttendance,
      totalRevenue,
      avgRevenue,
      totalOutstandingDebt,
      sourceBreakdown,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Database error', message: err.message });
  }
});

export default router;
