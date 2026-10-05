import { Router } from 'express';
import { getDb, type DatabaseWrapper } from '../../db/index.ts';
import { isClubOwner, requireOrganizerAuth, type AuthenticatedRequest } from '../auth.ts';
import { loadStatGames } from '../services/gameStatisticsService.ts';
import { buildClubGameStatistics } from '../../lib/gameStatistics.ts';
import { parseAnalyticsPeriod, ANALYTICS_ALL_SINCE, ANALYTICS_ALL_UNTIL } from '../../lib/analyticsPeriod.ts';
import { loadClubOverview, loadClubFinance, loadClubNow, loadClubStaff, resolveAnalyticsRange } from '../services/clubAnalyticsService.ts';
const router = Router();

export async function staffReportRange(db: DatabaseWrapper, period: string, tables: Set<string>, now = Date.now()) {
  const range = period === 'season' && !tables.has('rating_periods')
    ? parseAnalyticsPeriod(period, now) : await resolveAnalyticsRange(db, period, now);
  return { ...range, period: range.id };
}
for (const tab of ['overview', 'finance', 'now', 'staff'] as const) {
  router.get('/' + tab, requireOrganizerAuth, async (req, res) => {
    const owner = isClubOwner(req as AuthenticatedRequest);
    if (tab === 'finance' && !owner) return res.status(403).json({ error: 'Деньги клуба видит только владелец' });
    try {
      const db = req.db || await getDb();
      if (tab === 'now') return res.json(await loadClubNow(db, owner));
      const range = await resolveAnalyticsRange(db, String(req.query.period || 'all'));
      if (tab === 'finance') return res.json(await loadClubFinance(db, range));
      if (tab === 'staff') {
        const data = await loadClubStaff(db, range);
        return res.json({ ...data, since: range.since === ANALYTICS_ALL_SINCE ? null : range.since, until: range.until === ANALYTICS_ALL_UNTIL ? null : range.until });
      }
      return res.json(await loadClubOverview(db, range));
    } catch (error) {
      console.error('[ANALYTICS]', tab, error);
      return res.status(500).json({ error: 'Не удалось собрать аналитику. Попробуйте ещё раз.' });
    }
  });
}
router.get('/game-stats', requireOrganizerAuth, async (req, res) => {
  try {
    const db = req.db || await getDb();
    const range = await resolveAnalyticsRange(db, String(req.query.period || 'all'));
    const games = await loadStatGames(db, { sinceMs: Date.parse(range.since), untilMs: Date.parse(range.until), limit: 2000 });
    return res.json({ period: range.id, range, ...buildClubGameStatistics(games), capped: games.length === 2000, limit: 2000 });
  } catch (error) {
    console.error('[ANALYTICS] games', error);
    return res.status(500).json({ error: 'Не удалось собрать статистику игр' });
  }
});
// Compatibility for one release; no competing member, visit or money definitions.
router.get('/', requireOrganizerAuth, async (req, res) => {
  try {
    const db = req.db || await getDb();
    let range = await resolveAnalyticsRange(db, String(req.query.period || 'all'));
    if (req.query.start_date) {
      const since = Date.parse(String(req.query.start_date));
      const until = req.query.end_date ? Date.parse(String(req.query.end_date)) + 1 : Date.now() + 1;
      if (!Number.isFinite(since) || !Number.isFinite(until) || since >= until) return res.status(400).json({ error: 'Неверный период' });
      range = { id: 'custom', label: 'Выбранный период', since: new Date(since).toISOString(), until: new Date(until).toISOString() };
    }
    const overview = await loadClubOverview(db, range);
    const financials = isClubOwner(req as AuthenticatedRequest) ? await loadClubFinance(db, range) : null;
    const share = (part: number, whole: number) => whole>0 ? Math.round(part/whole*1000)/10 : 0;
    const funnel = overview.communicationFunnel;
    return res.json({ ...overview, period: range.id, financials,
      cancellationRate:share(overview.totalCancelled,overview.registrationBase), noShowRate:share(overview.totalNoShow,overview.totalRegistrations),
      communicationFunnel:{...funnel,answerRate:share(funnel.answered,funnel.delivered),positiveRate:share(funnel.positive,funnel.answered),attendanceRate:share(funnel.attended,funnel.positive)}, playerJourney: {
      neverPlayed: overview.neverPlayed, playedOnce: overview.playedOnce, playedTwoOrThree: overview.playedTwoOrThree,
      playedFourPlus: overview.playedFourPlus, noviceLevel: overview.noviceLevel, clubApproved: overview.clubApproved,
      tournamentApproved: overview.tournamentApproved, readyForClubReview: overview.readyForClubReview,
    } });
  } catch (error) {
    console.error('[ANALYTICS] compatibility', error);
    return res.status(500).json({ error: 'Не удалось собрать аналитику клуба' });
  }
});
export default router;
