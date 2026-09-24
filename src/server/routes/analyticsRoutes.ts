import { Router } from 'express';
import { getDb, type DatabaseWrapper } from '../../db/index.ts';
import { requireOrganizerAuth } from '../auth.ts';
import { ensureEveningAnnouncementTrackingSchema } from '../services/eveningAnnouncementTrackingService.ts';

const router = Router();

const pct = (part: number, total: number) => total > 0 ? Math.round((part / total) * 100) : 0;

const ALL_SINCE = '1970-01-01T00:00:00.000Z';
const ALL_UNTIL = '9999-12-31T00:00:00.000Z';

const moscowMonthStart = (year: number, monthIndex: number) => {
  const normalized = new Date(Date.UTC(year, monthIndex, 1));
  const month = String(normalized.getUTCMonth() + 1).padStart(2, '0');
  return new Date(`${normalized.getUTCFullYear()}-${month}-01T00:00:00+03:00`).toISOString();
};

/**
 * Report boundaries for the staff report: rolling 7/30/90 days, the current or previous calendar
 * month (Moscow time), the current rating season, or all time.
 */
export async function staffReportRange(db: DatabaseWrapper, period: string, tables: Set<string>, now = Date.now()) {
  const days = ({ '7d': 7, '30d': 30, '90d': 90 } as Record<string, number>)[period];
  if (days) return { period, label: `${days} дней`, since: new Date(now - days * 86_400_000).toISOString(), until: ALL_UNTIL };
  if (period === 'month' || period === 'prev_month') {
    const [year, month] = new Date(now).toLocaleDateString('sv-SE', { timeZone: 'Europe/Moscow' }).split('-').map(Number);
    const offset = period === 'month' ? 0 : -1;
    const since = moscowMonthStart(year, month - 1 + offset);
    const label = new Date(since).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric', timeZone: 'Europe/Moscow' });
    return { period, label, since, until: moscowMonthStart(year, month + offset) };
  }
  if (period === 'season' && tables.has('rating_periods')) {
    const nowIso = new Date(now).toISOString();
    // The season is the active RATING period covering today, otherwise the latest active one.
    const season = await db.get<any>(
      `SELECT title, starts_at, ends_at FROM rating_periods
        WHERE type = 'RATING' AND status = 'active'
        ORDER BY CASE WHEN starts_at <= ? AND ends_at >= ? THEN 0 ELSE 1 END, starts_at DESC LIMIT 1`,
      [nowIso, nowIso],
    );
    if (season) {
      const end = new Date(String(season.ends_at));
      // A date-only end («2026-12-31») covers the whole last day.
      const until = /^\d{4}-\d{2}-\d{2}$/.test(String(season.ends_at))
        ? new Date(`${season.ends_at}T00:00:00+03:00`).getTime() + 86_400_000
        : end.getTime() + 1;
      const startRaw = String(season.starts_at);
      const since = /^\d{4}-\d{2}-\d{2}$/.test(startRaw) ? new Date(`${startRaw}T00:00:00+03:00`).toISOString() : new Date(startRaw).toISOString();
      return { period, label: String(season.title || 'Сезон'), since, until: new Date(until).toISOString() };
    }
  }
  if (period === 'season') return { period, label: 'Сезон не задан — показано всё время', since: ALL_SINCE, until: ALL_UNTIL };
  return { period: 'all', label: 'Всё время', since: ALL_SINCE, until: ALL_UNTIL };
}

// Organizers and judges for a period: closed evenings run as the assigned organizer and completed
// games judged by a club player (user-approved staff accounting, 2026-09-24).
router.get('/staff', requireOrganizerAuth, async (req, res) => {
  try {
    const db: DatabaseWrapper = req.db || (await getDb());
    const tables = new Set((await db.all<any>("SELECT name FROM sqlite_master WHERE type = 'table'")).map((row: any) => String(row.name)));
    const range = await staffReportRange(db, String(req.query.period || 'all'), tables);
    const { since, until } = range;
    const rows = new Map<string, { player_id: string; nickname: string; evenings: number; games: number }>();
    const bump = (id: string, nickname: string, field: 'evenings' | 'games', count: number) => {
      const row = rows.get(id) || { player_id: id, nickname, evenings: 0, games: 0 };
      row[field] += count;
      rows.set(id, row);
    };
    if (tables.has('evening_staff_assignments')) {
      for (const row of await db.all<any>(`
        SELECT s.organizer_player_id AS id, p.nickname, COUNT(*) AS count
          FROM evening_staff_assignments s
          JOIN game_evenings e ON e.id = s.evening_id
          JOIN players p ON p.id = s.organizer_player_id
         WHERE (e.status = 'completed' OR e.settled_at IS NOT NULL) AND datetime(e.starts_at) >= datetime(?) AND datetime(e.starts_at) < datetime(?)
         GROUP BY s.organizer_player_id, p.nickname`, [since, until])) bump(String(row.id), String(row.nickname), 'evenings', Number(row.count));
    }
    const clubGames = await db.all<any>(`
      SELECT g.judge_player_id AS id, p.nickname, g.protocol_text
        FROM games g JOIN players p ON p.id = g.judge_player_id
        LEFT JOIN game_evenings e ON e.id = g.evening_id
       WHERE g.archived_at IS NULL AND datetime(COALESCE(e.starts_at, g.created_at)) >= datetime(?) AND datetime(COALESCE(e.starts_at, g.created_at)) < datetime(?)`, [since, until]);
    for (const game of clubGames) {
      let completed = false;
      try { const payload = JSON.parse(String(game.protocol_text || '')); completed = payload?.kind === 'club_evening_protocol' && payload.protocol?.status === 'completed'; } catch { completed = false; }
      if (completed) bump(String(game.id), String(game.nickname), 'games', 1);
    }
    if (tables.has('tournament_games')) {
      const judge = (await db.all<any>('PRAGMA table_info(tournaments)')).some((column: any) => column.name === 'judge_player_id')
        ? 'COALESCE(tg.judge_player_id, t.judge_player_id)' : 'tg.judge_player_id';
      for (const row of await db.all<any>(`
        SELECT ${judge} AS id, p.nickname, COUNT(*) AS count
          FROM tournament_games tg
          JOIN tournaments t ON t.id = tg.tournament_id
          JOIN players p ON p.id = ${judge}
         WHERE tg.status = 'completed' AND datetime(tg.completed_at) >= datetime(?) AND datetime(tg.completed_at) < datetime(?)
         GROUP BY ${judge}, p.nickname`, [since, until])) bump(String(row.id), String(row.nickname), 'games', Number(row.count));
    }
    const staff = [...rows.values()].sort((a, b) => (b.evenings + b.games) - (a.evenings + a.games) || a.nickname.localeCompare(b.nickname, 'ru'));
    return res.json({ period: range.period, label: range.label, since: range.since === ALL_SINCE ? null : range.since, until: range.until === ALL_UNTIL ? null : range.until, staff });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Не удалось собрать отчёт по организаторам и судьям' });
  }
});

router.get('/', requireOrganizerAuth, async (req, res) => {
  try {
    const { period, start_date, end_date } = req.query;
    const db: DatabaseWrapper = req.db || (await getDb());
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
        (SELECT COUNT(*) FROM evening_participants ep JOIN game_evenings e ON ep.evening_id=e.id WHERE ep.player_id=p.id AND ep.attendance_status='attended' AND e.status IN ('completed','active')) AS total_attended,
        (SELECT MIN(e.starts_at) FROM evening_participants ep JOIN game_evenings e ON ep.evening_id=e.id WHERE ep.player_id=p.id AND ep.attendance_status='attended' AND e.status IN ('completed','active')) AS first_visit,
        (SELECT MAX(e.starts_at) FROM evening_participants ep JOIN game_evenings e ON ep.evening_id=e.id WHERE ep.player_id=p.id AND ep.attendance_status='attended' AND e.status IN ('completed','active')) AS last_visit
      FROM players p
    `);
    const totalPlayers = players.length; let inactive30=0,inactive60=0,inactive90=0;
    players.forEach((p:any)=>{if(!p.last_visit)return;const days=(nowMs-new Date(p.last_visit).getTime())/(1000*60*60*24);if(days>=30)inactive30++;if(days>=60)inactive60++;if(days>=90)inactive90++;});

    let cohortFirstVisits=0,cohortReturnedIn30Days=0;
    for(const p of players){if(p.first_visit&&p.first_visit>=rangeStartIso&&p.first_visit<=rangeEndIso){cohortFirstVisits++;const firstMs=new Date(p.first_visit).getTime();const secondVisit=await db.get<any>(`SELECT MIN(e.starts_at) AS second_visit FROM evening_participants ep JOIN game_evenings e ON ep.evening_id=e.id WHERE ep.player_id=? AND ep.attendance_status='attended' AND e.status IN ('completed','active') AND e.starts_at>?`,[p.id,p.first_visit]);if(secondVisit?.second_visit&&new Date(secondVisit.second_visit).getTime()-firstMs<=30*24*60*60*1000)cohortReturnedIn30Days++;}}
    const cohortRetention30dRate=pct(cohortReturnedIn30Days,cohortFirstVisits);

    const participantStats=await db.get<any>(`
      SELECT COUNT(*) AS total_registrations,
        SUM(CASE WHEN ep.response_status='declined' THEN 1 ELSE 0 END) AS total_cancelled,
        SUM(CASE WHEN ep.attendance_status='attended' THEN 1 ELSE 0 END) AS total_attended,
        SUM(CASE WHEN ep.attendance_status='no_show' THEN 1 ELSE 0 END) AS total_no_show
      FROM evening_participants ep JOIN game_evenings e ON ep.evening_id=e.id
      WHERE e.status='completed' AND e.starts_at>=? AND e.starts_at<=?
    `,[rangeStartIso,rangeEndIso]);
    const totalRegs=Number(participantStats?.total_registrations||0),totalCancelled=Number(participantStats?.total_cancelled||0),totalAttended=Number(participantStats?.total_attended||0),totalNoShow=Number(participantStats?.total_no_show||0);
    const cancellationRate=pct(totalCancelled,totalRegs);const noShowRate=pct(totalNoShow,totalRegs);

    const txStats=await db.all<any>(`SELECT type,COALESCE(SUM(amount),0) AS total FROM financial_transactions WHERE created_at>=? AND created_at<=? GROUP BY type`,[rangeStartIso,rangeEndIso]);const txMap:Record<string,number>={};txStats.forEach((t:any)=>{txMap[t.type]=Number(t.total)||0;});
    const incomePaid=(txMap.income||0)+(txMap.debt_paid||0),debtCreated=txMap.debt_created||0,debtPaid=txMap.debt_paid||0,accrued=(txMap.income||0)+debtCreated,outstandingDebt=Math.max(0,debtCreated-debtPaid),refunds=txMap.refund||0,expenses=txMap.expense||0;
    const eveningsCountRow=await db.get<any>(`SELECT COUNT(*) AS count FROM game_evenings WHERE status='completed' AND starts_at>=? AND starts_at<=?`,[rangeStartIso,rangeEndIso]);const completedEvenings=Number(eveningsCountRow?.count||0);const avgAttendance=completedEvenings>0?(totalAttended/completedEvenings).toFixed(1):0;const avgRevenue=completedEvenings>0?Math.round(incomePaid/completedEvenings):0;
    const sourceBreakdown:Record<string,number>={};players.forEach((p:any)=>{const src=p.source||'Не указан';sourceBreakdown[src]=(sourceBreakdown[src]||0)+1;});

    const neverPlayed = players.filter((p:any)=>Number(p.total_attended||0)===0).length;
    const playedOnce = players.filter((p:any)=>Number(p.total_attended||0)===1).length;
    const playedTwoOrThree = players.filter((p:any)=>Number(p.total_attended||0)>=2&&Number(p.total_attended||0)<=3).length;
    const playedFourPlus = players.filter((p:any)=>Number(p.total_attended||0)>=4).length;
    const noviceLevel = players.filter((p:any)=>String(p.game_level||'club')==='novice').length;
    const clubApproved = players.filter((p:any)=>['club','tournament'].includes(String(p.game_level||'club'))).length;
    const tournamentApproved = players.filter((p:any)=>String(p.game_level||'club')==='tournament').length;
    const readyForClubReview = players.filter((p:any)=>String(p.game_level||'club')==='novice'&&Number(p.total_attended||0)>=2).length;

    await ensureEveningAnnouncementTrackingSchema(db);
    const communicationRow = await db.get<any>(`
      SELECT
        SUM(CASE WHEN t.first_sent_at IS NOT NULL THEN 1 ELSE 0 END) AS delivered,
        SUM(CASE WHEN t.first_sent_at IS NULL AND t.delivery_status='failed' THEN 1 ELSE 0 END) AS failed,
        SUM(CASE WHEN t.first_sent_at IS NOT NULL AND ep.response_status IN ('going','late','thinking','declined') THEN 1 ELSE 0 END) AS answered,
        SUM(CASE WHEN t.first_sent_at IS NOT NULL AND ep.response_status IN ('going','late') THEN 1 ELSE 0 END) AS positive,
        SUM(CASE WHEN t.first_sent_at IS NOT NULL AND ep.attendance_status='attended' AND e.status='completed' THEN 1 ELSE 0 END) AS attended,
        SUM(CASE WHEN t.reminder_count>0 THEN 1 ELSE 0 END) AS reminded
      FROM evening_announcement_dm_tracking t
      JOIN game_evenings e ON e.id=t.evening_id
      LEFT JOIN evening_participants ep ON ep.evening_id=t.evening_id AND ep.player_id=t.player_id
      WHERE e.starts_at>=? AND e.starts_at<=?
    `,[rangeStartIso,rangeEndIso]);
    const delivered=Number(communicationRow?.delivered||0),answered=Number(communicationRow?.answered||0),positive=Number(communicationRow?.positive||0),attendedFromDm=Number(communicationRow?.attended||0),failedDm=Number(communicationRow?.failed||0),reminded=Number(communicationRow?.reminded||0);

    return res.json({
      period:period||'all',totalPlayers,inactive30,inactive60,inactive90,cohortFirstVisits,cohortReturnedIn30Days,cohortRetention30dRate,completedEvenings,totalRegistrations:totalRegs,totalAttended,totalCancelled,totalNoShow,cancellationRate,noShowRate,avgAttendance,
      financials:{accrued,incomePaid,outstandingDebt,refunds,expenses,avgRevenuePerEvening:avgRevenue},sourceBreakdown,
      playerJourney:{neverPlayed,playedOnce,playedTwoOrThree,playedFourPlus,noviceLevel,clubApproved,tournamentApproved,readyForClubReview},
      communicationFunnel:{delivered,failed:failedDm,answered,positive,attended:attendedFromDm,reminded,answerRate:pct(answered,delivered),positiveRate:pct(positive,delivered),attendanceRate:pct(attendedFromDm,delivered)},
    });
  } catch (err:any) { return res.status(500).json({error:'Database error',message:err.message}); }
});

export default router;
