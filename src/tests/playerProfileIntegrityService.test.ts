import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.ts';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import {
  calculateProfileCompleteness,
  listUpcomingBirthdays,
  nextBirthdayOccurrence,
  reconcileProfileIntegrityTasks,
  validateBirthday,
  validatePhone,
} from '../server/services/playerProfileIntegrityService.ts';

describe('player profile completeness', () => {
  it('uses weighted important fields and detects exact missing fields', () => {
    const result = calculateProfileCompleteness({ nickname: 'Long Nickname', full_name: 'Real Name', telegram_user_id: '123', phone: null, birth_day: null, birth_month: null, preferred_format: null, has_db_avatar: 1, profile_field_status_json: '{}' });
    expect(result.percentage).toBe(65);
    expect(result.missing_fields).toEqual(['birthday', 'phone', 'preferred_format']);
    expect(result.important_missing_fields).toEqual(['birthday']);
    expect(result.next_missing_field).toBe('birthday');
  });

  it('respects a sensitive-field declined choice without forcing disclosure', () => {
    const result = calculateProfileCompleteness({ nickname: 'N', full_name: 'Name', telegram_username: 'nick', has_db_avatar: 1, birth_day: 1, birth_month: 5, phone: null, preferred_format: 'RATING', profile_field_status_json: JSON.stringify({ phone: 'declined' }) });
    expect(result.percentage).toBe(100);
    expect(result.complete).toBe(true);
    expect(result.fields.phone.state).toBe('declined');
  });

  it('validates phone and day/month birthday with optional year', () => {
    expect(validatePhone('+7 (999) 123-45-67')).toBe('+7 (999) 123-45-67');
    expect(() => validatePhone('abc')).toThrow('Некорректный номер');
    expect(validateBirthday(29, 2, null)).toEqual({ day: 29, month: 2, year: null });
    expect(() => validateBirthday(31, 2, null)).toThrow('Некорректная дата');
  });

  it('handles leap day consistently in Europe/Moscow', () => {
    const nonLeap = nextBirthdayOccurrence(29, 2, new Date('2027-02-27T12:00:00Z'));
    expect(nonLeap.date).toBe('2027-02-28');
    expect(nonLeap.days_until).toBe(1);
    const leap = nextBirthdayOccurrence(29, 2, new Date('2028-02-28T12:00:00Z'));
    expect(leap.date).toBe('2028-02-29');
  });
});

describe('profile organizer tasks and birthdays', () => {
  let db: DatabaseWrapper;
  const stamp = '2026-09-08T10:00:00.000Z';
  beforeEach(async () => {
    db = createDatabaseConnection(':memory:');
    await createApp(db);
    await db.run(`INSERT INTO players (id,nickname,full_name,telegram_user_id,phone,contact_status,lifecycle_status,birth_day,birth_month,profile_checked_at,elo,tokens,created_at,updated_at)
      VALUES ('active','Active Player',NULL,NULL,NULL,'normal','normal',13,9,?,1000,0,?,?)`, [new Date('2025-01-01').toISOString(), stamp, stamp]);
  });
  afterEach(() => { try { db.sqlite.close(); } catch {} });

  it('creates actionable tasks once and does not duplicate on reconciliation', async () => {
    const now = new Date('2026-09-08T10:00:00.000Z');
    const first = await reconcileProfileIntegrityTasks(db, now);
    const second = await reconcileProfileIntegrityTasks(db, now);
    expect(first.created).toBeGreaterThan(0);
    expect(second.created).toBe(0);
    const tasks = await db.all<any>("SELECT automation_key,player_id FROM organizer_tasks WHERE player_id='active' AND automation_key LIKE 'profile-%'");
    expect(new Set(tasks.map((row) => row.automation_key)).size).toBe(tasks.length);
    expect(tasks.every((row) => row.player_id === 'active')).toBe(true);
  });

  it('filters upcoming birthdays and excludes inactive/blocked profiles', async () => {
    await db.run(`INSERT INTO players (id,nickname,contact_status,lifecycle_status,birth_day,birth_month,elo,tokens,created_at,updated_at) VALUES ('blocked','Blocked','blocked','blocked',9,9,1000,0,?,?)`, [stamp, stamp]);
    const birthdays = await listUpcomingBirthdays(db, 7, new Date('2026-09-08T10:00:00.000Z'));
    expect(birthdays.map((row: any) => row.id)).toEqual(['active']);
    expect(birthdays[0].days_until).toBe(5);
  });
});
