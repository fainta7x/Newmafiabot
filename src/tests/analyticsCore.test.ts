import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { parseAnalyticsPeriod } from '../lib/analyticsPeriod.ts';
import { formatShare } from '../lib/analyticsFormat.ts';
import { loadClubOverview, loadClubFinance } from '../server/services/clubAnalyticsService.ts';

const opened: DatabaseWrapper[] = [];
afterEach(() => { while (opened.length) opened.pop()?.sqlite.close(); });
async function fixture() {
  const db = createDatabaseConnection(':memory:'); opened.push(db);
  db.sqlite.pragma('foreign_keys = OFF');
  await db.exec(`
    DROP TABLE IF EXISTS players;
    DROP TABLE IF EXISTS game_evenings;
    DROP TABLE IF EXISTS evening_participants;
    DROP TABLE IF EXISTS games;
    DROP TABLE IF EXISTS financial_transactions;
    CREATE TABLE players(id TEXT, lifecycle_status TEXT, source TEXT);
    CREATE TABLE game_evenings(id TEXT, title TEXT, starts_at TEXT, status TEXT, settled_at TEXT);
    CREATE TABLE evening_participants(id TEXT, evening_id TEXT, player_id TEXT, attendance_status TEXT, payment_status TEXT, amount_due INTEGER, amount_paid INTEGER);
    CREATE TABLE games(evening_id TEXT, slots_json TEXT, archived_at TEXT);
    CREATE TABLE financial_transactions(type TEXT, amount INTEGER, created_at TEXT);
    INSERT INTO players VALUES ('member','normal','telegram'),('guest','guest_placeholder',''),('archive','archived',''),('recent','normal','');
    INSERT INTO game_evenings VALUES ('old','Old','2026-07-01T12:00:00Z','completed',NULL),('second','Second','2026-07-10T12:00:00Z','completed',NULL),('recent','Recent','2026-10-01T12:00:00Z','active',NULL);
    INSERT INTO evening_participants VALUES ('a','old','member','attended','partial',400,100),('b','old','guest','attended','unpaid',0,0),('c','second','member','attended','paid',100,100);
    INSERT INTO games VALUES ('old','[{"player_id":"member"}]',NULL),('recent','[{"player_id":"recent"}]',NULL);
    INSERT INTO financial_transactions VALUES ('debt_paid',300,'2026-10-02T12:00:00Z');
  `);
  return db;
}
describe('canonical analytics foundation', () => {
  it('uses Moscow calendar months and date-only season ends', () => {
    const now = Date.parse('2026-09-30T22:00:00Z');
    expect(parseAnalyticsPeriod('month', now).since).toBe('2026-09-30T21:00:00.000Z');
    expect(parseAnalyticsPeriod('prev_month', now).until).toBe('2026-09-30T21:00:00.000Z');
    expect(parseAnalyticsPeriod('season', now, { starts_at: '2026-09-01', ends_at: '2026-12-31' }).until).toBe('2026-12-31T21:00:00.000Z');
    expect(parseAnalyticsPeriod('season', now).label).toContain('не задан');
    for (const id of ['7d','30d','90d']) expect(parseAnalyticsPeriod(id, now).id).toBe(id);
    expect(parseAnalyticsPeriod('invalid', now).id).toBe('all');
  });
  it('formats shares without non-finite values', () => {
    expect(formatShare(0,0)).toBe('—');
    expect(formatShare(1,20)).toBe('5,0%');
    expect(formatShare(1,3)).toBe('33%');
    expect(formatShare(Infinity,3)).toBe('—');
    expect(formatShare(Number.MAX_VALUE, Number.MIN_VALUE)).toBe('—');
  });
  it('deduplicates seated and attended visits, excludes guests, and censors new cohorts', async () => {
    const db = await fixture();
    const now = Date.parse('2026-10-05T12:00:00Z');
    const result = await loadClubOverview(db, parseAnalyticsPeriod('all', now), now);
    expect(result).toMatchObject({ totalPlayers: 2, totalAttended: 3, activePlayers: 2, newPlayers: 2, inactive30: 0, inactive60: 1, inactive90: 0, cohortFirstVisits: 1, cohortReturnedIn30Days: 1, cohortPending: 1, cohortRetention30dRate: null });
  });
  it('keeps payments of old evenings separate from receipts inside the period', async () => {
    const db = await fixture();
    const result = await loadClubFinance(db, parseAnalyticsPeriod('30d', Date.parse('2026-10-05T12:00:00Z')));
    expect(result).toMatchObject({ accrued: 0, incomePaid: 0, outstandingDebt: 0, receivedInPeriod: 300 });
    expect(await loadClubFinance(db, parseAnalyticsPeriod('all'))).toMatchObject({ accrued: 500, incomePaid: 200, outstandingDebt: 300 });
  });
  it('uses bounded queries for 2000 players and 5000 participant rows', async () => {
    const db = await fixture();
    await db.exec(`WITH RECURSIVE n(x) AS (VALUES(1) UNION ALL SELECT x+1 FROM n WHERE x<2000) INSERT INTO players SELECT 'p'||x,'normal','' FROM n;
      WITH RECURSIVE n(x) AS (VALUES(1) UNION ALL SELECT x+1 FROM n WHERE x<5000) INSERT INTO evening_participants SELECT 'ep'||x,'old','p'||((x%2000)+1),'attended','paid',0,0 FROM n;`);
    const get = vi.spyOn(db, 'get');
    const all = vi.spyOn(db, 'all');
    const result = await loadClubOverview(db, parseAnalyticsPeriod('all'));
    expect(result.totalPlayers).toBe(2002);
    expect(result.totalAttended).toBe(2003);
    expect(get.mock.calls.length + all.mock.calls.length).toBe(2);
  });
  it('caps finance details without truncating totals and ignores absent participants', async () => {
    const db = await fixture();
    await db.exec(`INSERT INTO evening_participants VALUES ('absent','old','recent','no_show','unpaid',999,0);
      WITH RECURSIVE n(x) AS (VALUES(1) UNION ALL SELECT x+1 FROM n WHERE x<201) INSERT INTO game_evenings SELECT 'e'||x,'Evening','2026-07-20T12:00:00Z','completed',NULL FROM n;`);
    const result = await loadClubFinance(db, parseAnalyticsPeriod('all'));
    expect(result).toMatchObject({ accrued:500, incomePaid:200, outstandingDebt:300, eveningCount:203, eveningsTruncated:true });
    expect(result.evenings).toHaveLength(200);
  });
});
