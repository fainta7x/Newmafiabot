import { Router } from 'express';
import { getDb } from '../../db/index.ts';
import { requireOrganizerAuth } from '../auth.ts';

const router = Router();

router.get('/', requireOrganizerAuth, async (req, res) => {
  try {
    const { period, start_date, end_date } = req.query;
    const db = (req as any).db || (await getDb());
    const nowMs = Date.now();
    let rangeStart: Date | null = null;
    let rangeEnd: Date = new Date();
    if (period === '7d') rangeStart = new Date(nowMs - 7 * 24 * 60 * 60 * 1000);
    else if (period === '30d') rangeStart = new Date(nowMs - 30 * 24 * 60 * 60 * 1000);
    else if (period === '90d') rangeStart = new Date(nowMs - 90 * 24 * 60 * 60 * 1000);
    else if (start_date) { rangeStart = new Date(String(start_date)); if (end_date) rangeEnd = new Date(String(end_date)); }
    const rangeStartIso = rangeStart ? rangeStart.toISOString() : '1970-01-01T00:00:00.000Z';
    const rangeEndIso = rangeEnd.toISOString();

    const players = await db.all<any>(`
      SELECT p.*,
        (SELECT COUNT(*) FROM evening_participants ep JOIN game_evenings e ON ep.evening_id=e.id WHERE ep.player_id=p.id AND ep.attendance_status='attended' AND e.status='completed') AS total_attended,
        (SELECT MIN(e.starts_at) FROM evening_participants ep JOIN game_evenings e ON ep.evening_id=e.id WHERE ep.player_id=p.id AND ep.attendance_status='attended' AND e.status='completed') AS first_visit,
        (SELECT MAX(e.starts_at) FROM evening_participants ep JOIN game_evenings e ON ep.evening_id=e.id WHERE ep.player_id=p.id AND ep.attendance_status='attended' AND e.status='completed') AS last_visit
      FROM players p
    `);
    const totalPlayers = players.length; let inactive30=0,inactive60=0,inactive90=0;
    players.forEach((p:any)=>{if(!p.last_visit)return;const days=(nowMs-new Date(p.last_visit).getTime())/(1000*60*60*24);if(days>=30)inactive30++;if(days>=60)inactive60++;if(days>=90)inactive90++;});

    let cohortFirstVisits=0,cohortReturnedIn30Days=0;
    for(const p of players){if(p.first_visit&&p.first_visit>=rangeStartIso&&p.first_visit<=rangeEndIso){cohortFirstVisits++;const firstMs=new Date(p.first_visit).getTime();const secondVisit=await db.get<any>(`SELECT MIN(e.starts_at) AS second_visit FROM evening_participants ep JOIN game_evenings e ON ep.evening_id=e.id WHERE ep.player_id=? AND ep.attendance_status='attended' AND e.status='completed' AND e.starts_at>?`,[p.id,p.first_visit]);if(secondVisit?.second_visit&&new Date(secondVisit.second_visit).getTime()-firstMs<=30*24*60*60*1000)cohortReturnedIn30Days++;}}
    const cohortRetention30dRate=cohortFirstVisits>0?Math.round((cohortReturnedIn30Days/cohortFirstVisits)*100):0;

    const participantStats=await db.get<any>(`
      SELECT COUNT(*) AS total_registrations,
        SUM(CASE WHEN ep.response_status='declined' THEN 1 ELSE 0 END) AS total_cancelled,
        SUM(CASE WHEN ep.attendance_status='attended' THEN 1 ELSE 0 END) AS total_attended,
        SUM(CASE WHEN ep.attendance_status='no_show' THEN 1 ELSE 0 END) AS total_no_show
      FROM evening_participants ep JOIN game_evenings e ON ep.evening_id=e.id
      WHERE e.status='completed' AND e.starts_at>=? AND e.starts_at<=?
    `,[rangeStartIso,rangeEndIso]);
    const totalRegs=Number(participantStats?.total_registrations||0),totalCancelled=Number(participantStats?.total_cancelled||0),totalAttended=Number(participantStats?.total_attended||0),totalNoShow=Number(participantStats?.total_no_show||0);
    const cancellationRate=totalRegs>0?Math.round((totalCancelled/totalRegs)*100):0;const noShowRate=totalRegs>0?Math.round((totalNoShow/totalRegs)*100):0;

    const txStats=await db.all<any>(`SELECT type,COALESCE(SUM(amount),0) AS total FROM financial_transactions WHERE created_at>=? AND created_at<=? GROUP BY type`,[rangeStartIso,rangeEndIso]);const txMap:Record<string,number>={};txStats.forEach((t:any)=>{txMap[t.type]=Number(t.total)||0;});
    const incomePaid=(txMap.income||0)+(txMap.debt_paid||0),debtCreated=txMap.debt_created||0,debtPaid=txMap.debt_paid||0,accrued=(txMap.income||0)+debtCreated,outstandingDebt=Math.max(0,debtCreated-debtPaid),refunds=txMap.refund||0,expenses=txMap.expense||0;
    const eveningsCountRow=await db.get<any>(`SELECT COUNT(*) AS count FROM game_evenings WHERE status='completed' AND starts_at>=? AND starts_at<=?`,[rangeStartIso,rangeEndIso]);const completedEvenings=Number(eveningsCountRow?.count||0);const avgAttendance=completedEvenings>0?(totalAttended/completedEvenings).toFixed(1):0;const avgRevenue=completedEvenings>0?Math.round(incomePaid/completedEvenings):0;
    const sourceBreakdown:Record<string,number>={};players.forEach((p:any)=>{const src=p.source||'Не указан';sourceBreakdown[src]=(sourceBreakdown[src]||0)+1;});
    return res.json({period:period||'all',totalPlayers,inactive30,inactive60,inactive90,cohortFirstVisits,cohortReturnedIn30Days,cohortRetention30dRate,completedEvenings,totalRegistrations:totalRegs,totalAttended,totalCancelled,totalNoShow,cancellationRate,noShowRate,avgAttendance,financials:{accrued,incomePaid,outstandingDebt,refunds,expenses,avgRevenuePerEvening:avgRevenue},sourceBreakdown});
  } catch (err:any) { return res.status(500).json({error:'Database error',message:err.message}); }
});

export default router;
