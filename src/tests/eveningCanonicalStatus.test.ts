import fs from 'node:fs';
import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { countEveningResponses, getActualAttendanceFact, isEveningParticipantEligibleForGame, normalizeLegacyEveningResponseInput, resolveAttendanceWrite } from '../lib/eveningResponse.ts';

describe('04B0 canonical evening status domain', () => {
  it('maps legacy response aliases without using arrival as a planned response', () => {
    expect(normalizeLegacyEveningResponseInput('invited')).toBe('unanswered');
    expect(normalizeLegacyEveningResponseInput('cancelled')).toBe('declined');
    for (const value of ['registered','confirmed','waitlist']) expect(normalizeLegacyEveningResponseInput(value)).toBe('going');
    for (const value of ['unanswered','going','late','thinking','declined']) expect(normalizeLegacyEveningResponseInput(value)).toBe(value);
  });

  it('counts only going + late as expected', () => {
    const rows = ['going','late','thinking','declined','unanswered'].map(response_status => ({ response_status }));
    const c = countEveningResponses(rows);
    expect(c.going + c.late).toBe(2); expect(c.audience).toBe(5);
  });

  it('converts only valid attendance physical pairs and rejects conflicts', () => {
    expect(getActualAttendanceFact('pending','unknown')).toBe('pending');
    expect(getActualAttendanceFact('attended','on_time')).toBe('on_time');
    expect(getActualAttendanceFact('attended','late')).toBe('late');
    expect(getActualAttendanceFact('attended','unknown')).toBe('attended_unknown');
    expect(getActualAttendanceFact('no_show','unknown')).toBe('no_show');
    expect(getActualAttendanceFact('pending','late')).toBeNull();
    const current = { attendance_status:'pending' as const, arrival_status:'unknown' as const, checked_in_at:null };
    expect(resolveAttendanceWrite(current,{attendance_fact:'on_time'},'2026-08-10T00:00:00Z')).toEqual({attendance_status:'attended',arrival_status:'on_time',checked_in_at:'2026-08-10T00:00:00Z'});
    expect(() => resolveAttendanceWrite(current,{attendance_fact:'on_time',attendance_status:'no_show'})).toThrow();
  });

  it('enforces canonical game eligibility', () => {
    const pending=(response_status:string)=>({response_status,registration_status:response_status,attendance_status:'pending',arrival_status:'unknown'});
    expect(isEveningParticipantEligibleForGame(pending('going'))).toBe(true);
    expect(isEveningParticipantEligibleForGame(pending('late'))).toBe(true);
    for(const value of ['thinking','declined','unanswered']) expect(isEveningParticipantEligibleForGame(pending(value))).toBe(false);
    expect(isEveningParticipantEligibleForGame({response_status:'declined',attendance_status:'attended',arrival_status:'late'})).toBe(true);
    expect(isEveningParticipantEligibleForGame({response_status:'going',attendance_status:'no_show',arrival_status:'unknown'})).toBe(false);
  });
});

describe('0011 migration matrix', () => {
  it('separates legacy planned-late from actual-late and is a rerun no-op', () => {
    const db=new Database(':memory:');
    db.exec(`CREATE TABLE migration_history(id TEXT PRIMARY KEY,migration_name TEXT UNIQUE,status TEXT,details_json TEXT,executed_at TEXT);
      CREATE TABLE evening_participants(id TEXT PRIMARY KEY,evening_id TEXT NOT NULL DEFAULT 'e1',response_status TEXT NOT NULL DEFAULT 'unanswered',registration_status TEXT,attendance_status TEXT,arrival_status TEXT);
    `);
    const rows=[
      ['invited','pending','unknown'],['registered','pending','unknown'],['confirmed','pending','unknown'],['waitlist','pending','unknown'],['cancelled','pending','unknown'],
      ['registered','pending','late'],['registered','attended','late'],['registered','attended','on_time'],['registered','attended','unknown'],['registered','no_show','unknown'],
      ['thinking','pending','unknown'],['declined','pending','unknown'],['late','pending','unknown'],['going','pending','unknown'],[null,'pending','unknown'],['mystery','pending','unknown'],
    ];
    const ins=db.prepare('INSERT INTO evening_participants(id,registration_status,attendance_status,arrival_status) VALUES(?,?,?,?)');
    rows.forEach((r,i)=>ins.run(String(i),...r));
    const migration=fs.readFileSync('drizzle/0011_canonical_evening_response_attendance.sql','utf8');
    db.exec(migration);
    const out=db.prepare('SELECT * FROM evening_participants ORDER BY CAST(id AS INTEGER)').all() as any[];
    expect(out.map(r=>r.response_status)).toEqual(['unanswered','going','going','going','declined','late','going','going','going','going','thinking','declined','late','going','unanswered','unanswered']);
    expect(out[5].arrival_status).toBe('unknown'); expect(out[6].arrival_status).toBe('late'); expect(out[8].arrival_status).toBe('unknown');
    expect(out.every(r=>r.registration_status===r.response_status)).toBe(true);
    db.prepare("UPDATE evening_participants SET response_status='unanswered',registration_status='going' WHERE id='1'").run();
    db.exec(migration);
    expect((db.prepare("SELECT response_status FROM evening_participants WHERE id='1'").get() as any).response_status).toBe('unanswered');
    db.close();
  });
});
