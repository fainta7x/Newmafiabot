import Database from 'better-sqlite3';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { auditEveningRsvpDrift, inspectEveningRsvpFile } from '../scripts/auditEveningRsvpDrift.ts';

const databases: Database.Database[] = [];

const setup = () => {
  const db = new Database(':memory:');
  databases.push(db);
  db.exec(`
    CREATE TABLE game_evenings (id TEXT PRIMARY KEY, status TEXT, settled_at TEXT);
    CREATE TABLE evening_participants (
      id TEXT PRIMARY KEY,
      evening_id TEXT,
      response_status TEXT NOT NULL,
      registration_status TEXT NOT NULL,
      attendance_status TEXT NOT NULL,
      arrival_status TEXT NOT NULL
    );
    INSERT INTO game_evenings (id,status,settled_at) VALUES
      ('open','active',NULL),
      ('finished','completed','2026-10-11T00:00:00Z');
  `);
  const insert = db.prepare(`
    INSERT INTO evening_participants
      (id,evening_id,response_status,registration_status,attendance_status,arrival_status)
    VALUES (?,?,?,?,?,?)
  `);
  insert.run('current','open','going','going','pending','unknown');
  insert.run('stale-declined','open','declined','registered','pending','unknown');
  insert.run('stale-unanswered','open','unanswered','registered','pending','unknown');
  insert.run('legacy-confirmed','open','unanswered','confirmed','pending','unknown');
  insert.run('legacy-late','open','unanswered','waitlist','pending','late');
  insert.run('walkin','open','unanswered','invited','attended','unknown');
  insert.run('noshow','open','going','going','no_show','unknown');
  insert.run('finished-person','finished','unanswered','invited','no_show','unknown');
  return db;
};

afterEach(() => {
  while (databases.length) {
    try { databases.pop()?.close(); } catch { /* closed */ }
  }
});

describe('opt-in aggregated RSVP diagnostic', () => {
  it('reports distinct source-policy counts without participant identifiers', () => {
    const db = setup();
    const report = auditEveningRsvpDrift(db);
    expect(report.by_scope.open).toEqual({
      participants: 7,
      canonical_positive: 4,
      bot_raw_positive: 2,
      agenda_legacy_or_positive: 5,
      analytics_registration: 5,
      pending_canonical_expected: 3,
      pending_shortfall_raw: 1,
      agenda_positive_without_canonical: 2,
      agenda_missing_canonical_positive: 1,
      bot_missing_canonical_positive: 2,
      shortfall_missing_pending_canonical: 2,
      declined_with_old_positive_registration: 1,
      unanswered_with_old_registered: 1,
    });
    expect(report.by_scope.completed.participants).toBe(1);
    expect(report.by_scope.completed.analytics_registration).toBe(1);
    expect(report.by_scope.other.participants).toBe(0);
    const publicOutput = JSON.stringify(report);
    for (const id of ['stale-declined', 'stale-unanswered', 'walkin', 'finished-person']) {
      expect(publicOutput).not.toContain(id);
    }
  });

  it('opens an explicitly chosen existing SQLite file as read-only and does not modify it', () => {
    const folder = mkdtempSync(path.join(tmpdir(), '2la-rsvp-audit-'));
    const file = path.join(folder, 'audit.sqlite');
    try {
      const disk = new Database(file);
      disk.exec(`
        CREATE TABLE game_evenings (id TEXT PRIMARY KEY, status TEXT, settled_at TEXT);
        CREATE TABLE evening_participants (
          evening_id TEXT, response_status TEXT, registration_status TEXT,
          arrival_status TEXT, attendance_status TEXT
        );
        INSERT INTO game_evenings VALUES ('event','active',NULL);
        INSERT INTO evening_participants VALUES ('event','declined','registered','unknown','pending');
      `);
      disk.close();

      const before = readFileSync(file);
      const report = inspectEveningRsvpFile(file);
      const after = readFileSync(file);
      expect(report.by_scope.open.declined_with_old_positive_registration).toBe(1);
      expect(report.by_scope.open.agenda_positive_without_canonical).toBe(1);
      expect(after).toEqual(before);

      const nonexistent = path.join(folder, 'missing.sqlite');
      expect(() => inspectEveningRsvpFile(nonexistent)).toThrow();
      expect(() => readFileSync(nonexistent)).toThrow();
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });

  it('returns only zeros for an empty database', () => {
    const db = setup();
    db.exec('DELETE FROM evening_participants;');
    const report = auditEveningRsvpDrift(db);
    expect(report.by_scope.open.participants).toBe(0);
    expect(report.by_scope.open.agenda_positive_without_canonical).toBe(0);
  });
});
