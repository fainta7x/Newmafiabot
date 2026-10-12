import { afterEach, describe, expect, it } from 'vitest';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { getEveningResponse } from '../lib/eveningResponse.ts';
import {
  isInOrganizerWorkingRoster,
  needsEveningCloseoutAttendance,
} from '../lib/eveningParticipantView.ts';
import { isEveningGameRosterEligible } from '../lib/eveningDomain.ts';

/**
 * Architecture audit only: these SQL expressions mirror existing server reads,
 * NOT the desired future rule. Snapshotting their divergence lets a later
 * migration review its effects before touching reminders/cancellation/money.
 *
 * The tested paths are:
 * organizerAgendaService.absenceItems, botRoutes./evenings/open,
 * eveningShortfallService post-start reconciliation,
 * clubAnalyticsService participantStats.
 */
const currentReadSql = {
  agenda: "(response_status IN ('going', 'late') OR registration_status IN ('going', 'late', 'registered', 'confirmed'))",
  bot: "response_status IN ('going', 'late')",
  shortfallPending: "response_status IN ('going', 'late') AND attendance_status = 'pending'",
  analyticsRegistration: "COALESCE(response_status,'')<>'declined' AND (response_status IN ('going','late') OR registration_status IN ('going','confirmed','registered') OR attendance_status IN ('attended','no_show'))",
} as const;

const dbs: DatabaseWrapper[] = [];
const newDatabase = () => {
  const db = createDatabaseConnection(':memory:');
  dbs.push(db);
  return db;
};
afterEach(() => {
  while (dbs.length) {
    try { dbs.pop()?.sqlite.close(); } catch { /* already closed */ }
  }
});

const rows = [
  { id: 'positive-now', response: 'going', legacy: 'going', attendance: 'pending', arrival: 'unknown', canonical: 'going' },
  { id: 'late-now', response: 'late', legacy: 'late', attendance: 'pending', arrival: 'unknown', canonical: 'late' },
  { id: 'stale-unanswered', response: 'unanswered', legacy: 'registered', attendance: 'pending', arrival: 'unknown', canonical: 'unanswered' },
  { id: 'stale-declined', response: 'declined', legacy: 'registered', attendance: 'pending', arrival: 'unknown', canonical: 'declined' },
  { id: 'legacy-confirmed', response: null, legacy: 'confirmed', attendance: 'pending', arrival: 'unknown', canonical: 'going' },
  { id: 'legacy-late', response: null, legacy: 'waitlist', attendance: 'pending', arrival: 'late', canonical: 'late' },
  { id: 'walk-in', response: 'unanswered', legacy: 'invited', attendance: 'attended', arrival: 'unknown', canonical: 'unanswered' },
  { id: 'no-show', response: 'going', legacy: 'going', attendance: 'no_show', arrival: 'unknown', canonical: 'going' },
  { id: 'thinking', response: 'thinking', legacy: 'thinking', attendance: 'pending', arrival: 'unknown', canonical: 'thinking' },
] as const;

async function seedAuditEvening(db: DatabaseWrapper) {
  const now = '2026-10-10T00:00:00.000Z';
  await db.run(
    `INSERT INTO game_evenings (id,title,starts_at,ends_at,timezone,venue,format,status,capacity,default_price,created_at,updated_at)
     VALUES ('rsvp-audit','RSVP audit','2026-10-16T21:00:00+03:00','2026-10-17T01:00:00+03:00',
       'Europe/Moscow','Test venue','CASUAL','active',20,400,?,?)`,
    [now, now],
  );
  for (const row of rows) {
    await db.run(
      'INSERT INTO players (id,nickname,contact_status,lifecycle_status,elo,tokens,created_at,updated_at) VALUES (?,? ,\'normal\',\'normal\',1000,0,?,?)',
      [row.id, row.id, now, now],
    );
    await db.run(
      `INSERT INTO evening_participants (
        id,evening_id,player_id,response_status,registration_status,attendance_status,arrival_status,
        payment_status,amount_due,amount_paid,registered_at,created_at,updated_at
      ) VALUES (?, 'rsvp-audit', ?, ?, ?, ?, ?, 'unpaid',0,0,?,?,?)`,
      [row.id, row.id, row.response, row.legacy, row.attendance, row.arrival, now, now, now],
    );
  }
}

async function readSqlIds(db: DatabaseWrapper, predicate: string): Promise<string[]> {
  const result = await db.all<{ id: string }>(
    `SELECT id FROM evening_participants WHERE evening_id = ? AND (${predicate}) ORDER BY id`,
    ['rsvp-audit'],
  );
  return result.map((row) => row.id);
}

describe('RSVP contracts across server reads (diagnostic, no production changes)', () => {
  it('pins the canonical meaning of stored current/legacy responses', async () => {
    const db = newDatabase();
    await seedAuditEvening(db);
    const persisted = await db.all<any>('SELECT * FROM evening_participants WHERE evening_id = ?', ['rsvp-audit']);
    const byId = new Map(persisted.map((p) => [p.id, p]));
    for (const expected of rows) {
      const row = byId.get(expected.id);
      expect(getEveningResponse(row), expected.id).toBe(expected.canonical);
      expect(isInOrganizerWorkingRoster(row), expected.id).toBe(
        expected.attendance === 'attended'
          || (expected.attendance !== 'no_show' && ['going', 'late', 'unanswered'].includes(expected.canonical)),
      );
      expect(needsEveningCloseoutAttendance(row), expected.id).toBe(
        expected.attendance === 'pending' && ['going', 'late'].includes(expected.canonical),
      );
    }
  });

  it('makes each current SQL surface interpretation inspectable as a named snapshot', async () => {
    const db = newDatabase();
    await seedAuditEvening(db);
    const agenda = await readSqlIds(db, currentReadSql.agenda);
    const bot = await readSqlIds(db, currentReadSql.bot);
    const shortfallPending = await readSqlIds(db, currentReadSql.shortfallPending);
    const analytics = await readSqlIds(db, currentReadSql.analyticsRegistration);
    expect(agenda).toEqual([
      'late-now', 'legacy-confirmed', 'no-show', 'positive-now', 'stale-declined', 'stale-unanswered',
    ]);
    expect(bot).toEqual(['late-now', 'no-show', 'positive-now']);
    expect(shortfallPending).toEqual(['late-now', 'positive-now']);
    expect(analytics).toEqual([
      'late-now', 'legacy-confirmed', 'no-show', 'positive-now', 'stale-unanswered', 'walk-in',
    ]);
    // This is a documented mismatch, NOT permission to change these production SQL queries.
    expect(agenda).toContain('stale-declined');
    expect(bot).not.toContain('stale-declined');
  });

  it('preserves a difference between manual working roster and game seating', async () => {
    const db = newDatabase();
    await seedAuditEvening(db);
    const walkIn = await db.get<any>('SELECT * FROM evening_participants WHERE id = ?', ['walk-in']);
    const invited = await db.get<any>('SELECT * FROM evening_participants WHERE id = ?', ['stale-unanswered']);
    expect(getEveningResponse(invited)).toBe('unanswered');
    expect(isInOrganizerWorkingRoster(invited)).toBe(true);
    expect(isEveningGameRosterEligible('unanswered', 'pending')).toBe(false);
    expect(getEveningResponse(walkIn)).toBe('unanswered');
    expect(isEveningGameRosterEligible('unanswered', 'attended_unknown')).toBe(true);
  });
});
