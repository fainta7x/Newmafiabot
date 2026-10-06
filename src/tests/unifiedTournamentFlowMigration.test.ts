import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { ensureTournamentEveningSchema } from '../db/ensureTournamentEveningSchema.ts';
import {
  applyBogdanaTournamentStaff,
  applyUnifiedTournamentFlowMigration,
  BOGDANA_TOURNAMENT_STAFF_MIGRATION,
  revertBogdanaTournamentStaff,
  revertUnifiedTournamentFlowMigration,
  UNIFIED_TOURNAMENT_FLOW_MIGRATION,
} from '../db/applyUnifiedTournamentFlowMigration.ts';

const T = '2026-08-01T00:00:00.000Z';
const opened: DatabaseWrapper[] = [];
const dirs: string[] = [];
afterEach(() => {
  while (opened.length) { try { opened.pop()?.sqlite.close(); } catch { /* already closed */ } }
  while (dirs.length) fs.rmSync(dirs.pop()!, { recursive: true, force: true });
});

const open = async (file?: string) => {
  const db = createDatabaseConnection(file || ':memory:');
  opened.push(db);
  await ensureTournamentEveningSchema(db);
  return db;
};
const player = (db: DatabaseWrapper, id: string, nickname: string) => db.run('INSERT INTO players (id,nickname,created_at,updated_at) VALUES (?,?,?,?)', [id, nickname, T, T]);
const tournament = (db: DatabaseWrapper, id: string, title: string, flow = 0) => db.run(
  "INSERT INTO tournaments (id,title,date,status,created_at,updated_at,tournament_evening_flow) VALUES (?,?,'2026-08-01','completed',?,?,?)", [id, title, T, T, flow],
);
const participant = (db: DatabaseWrapper, id: string, tournamentId: string, playerId: string, number: number) => db.run(
  'INSERT INTO tournament_participants (id,tournament_id,player_id,display_name,participant_number) VALUES (?,?,?,?,?)', [id, tournamentId, playerId, playerId, number],
);

describe('one tournament format for everybody (owner, 2026-10-06)', () => {
  it('moves an old-format tournament to the unified format without touching games, once', async () => {
    const db = await open();
    await player(db, 'p1', 'Аня'); await player(db, 'p2', 'Боря');
    await tournament(db, 'old', 'Турнир Богдана 1.08'); await tournament(db, 'new', 'Второй', 1);
    await participant(db, 'tp1', 'old', 'p1', 1); await participant(db, 'tp2', 'old', 'p2', 2);
    await db.run("INSERT INTO tournament_games (id,tournament_id,game_number,status,judge_name) VALUES ('g1','old',1,'completed','Старый судья')");

    const first = await applyUnifiedTournamentFlowMigration(db);
    const second = await applyUnifiedTournamentFlowMigration(db);

    expect(first.migrated).toBe(1);
    expect(second.migrated).toBe(0);
    expect(await db.get<any>("SELECT tournament_evening_flow AS flow, registration_closed_at AS closed FROM tournaments WHERE id='old'")).toMatchObject({ flow: 1 });
    const registrations = await db.all<any>("SELECT player_id, status, slot_number FROM tournament_registrations WHERE tournament_id='old' ORDER BY slot_number");
    expect(registrations).toEqual([{ player_id: 'p1', status: 'confirmed', slot_number: 1 }, { player_id: 'p2', status: 'confirmed', slot_number: 2 }]);
    expect((await db.get<any>("SELECT COUNT(*) AS n FROM tournament_registrations WHERE tournament_id='new'")).n).toBe(0);
    expect(await db.get<any>("SELECT judge_name FROM tournament_games WHERE id='g1'")).toEqual({ judge_name: 'Старый судья' });
    expect((await db.get<any>('SELECT COUNT(*) AS n FROM tournament_participants')).n).toBe(2);
    expect((await db.all<any>('SELECT status FROM migration_history WHERE migration_name=?', [UNIFIED_TOURNAMENT_FLOW_MIGRATION]))).toEqual([{ status: 'completed' }]);
  });

  it('takes a verified file snapshot first and can put everything back', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tournament-unify-')); dirs.push(dir);
    const db = await open(path.join(dir, 'main.sqlite'));
    await player(db, 'p1', 'Аня');
    await tournament(db, 'old', 'Старый');
    await participant(db, 'tp1', 'old', 'p1', 1);

    const result = await applyUnifiedTournamentFlowMigration(db, { backupDir: path.join(dir, 'backups') });
    expect(result.snapshot).toBeTruthy();
    expect(fs.existsSync(String(result.snapshot))).toBe(true);
    expect(fs.statSync(String(result.snapshot)).size).toBeGreaterThan(0);

    expect(await revertUnifiedTournamentFlowMigration(db)).toBe(1);
    expect(await db.get<any>("SELECT tournament_evening_flow AS flow, registration_closed_at AS closed FROM tournaments WHERE id='old'")).toEqual({ flow: 0, closed: null });
    expect((await db.get<any>("SELECT COUNT(*) AS n FROM tournament_registrations WHERE tournament_id='old'")).n).toBe(0);
    expect((await db.get<any>("SELECT status FROM migration_history WHERE migration_name=?", [UNIFIED_TOURNAMENT_FLOW_MIGRATION])).status).toBe('reverted');
  });
});

describe('forced judge and organizer in the tournaments of Bogdan (owner, 2026-10-06)', () => {
  const seed = async (db: DatabaseWrapper) => {
    await player(db, 'chagin', 'Чагин'); await player(db, 'bogdan', 'Богданчик'); await player(db, 'old-judge', 'Другой');
    await tournament(db, 't1', 'Турнир Богдана 1.08'); await tournament(db, 't2', 'второй турнир богдана', 1); await tournament(db, 't3', 'Чужой турнир');
    await db.run("UPDATE tournaments SET judge_player_id='old-judge', chief_judge_name='Другой' WHERE id IN ('t1','t2','t3')");
    await db.run("INSERT INTO tournament_games (id,tournament_id,game_number,status,judge_player_id,judge_name) VALUES ('g1','t1',1,'completed','old-judge','Другой'),('g2','t2',1,'completed',NULL,NULL),('g3','t3',1,'completed','old-judge','Другой')");
  };

  it('sets them on every tournament of Bogdan and on its games, leaves others alone, and can be reverted', async () => {
    const db = await open(); await seed(db);

    expect(await applyBogdanaTournamentStaff(db)).toBe(2);
    expect(await applyBogdanaTournamentStaff(db)).toBe(0);

    const rows = await db.all<any>('SELECT id, judge_player_id, organizer_player_id, chief_judge_name FROM tournaments ORDER BY id');
    expect(rows[0]).toEqual({ id: 't1', judge_player_id: 'chagin', organizer_player_id: 'bogdan', chief_judge_name: 'Чагин' });
    expect(rows[1]).toEqual({ id: 't2', judge_player_id: 'chagin', organizer_player_id: 'bogdan', chief_judge_name: 'Чагин' });
    expect(rows[2]).toMatchObject({ id: 't3', judge_player_id: 'old-judge', organizer_player_id: null, chief_judge_name: 'Другой' });
    expect(await db.all<any>('SELECT id, judge_player_id, judge_name FROM tournament_games ORDER BY id')).toEqual([
      { id: 'g1', judge_player_id: 'chagin', judge_name: 'Чагин' },
      { id: 'g2', judge_player_id: 'chagin', judge_name: 'Чагин' },
      { id: 'g3', judge_player_id: 'old-judge', judge_name: 'Другой' },
    ]);

    expect(await revertBogdanaTournamentStaff(db)).toBe(2);
    expect(await db.all<any>('SELECT id, judge_player_id, judge_name FROM tournament_games ORDER BY id')).toEqual([
      { id: 'g1', judge_player_id: 'old-judge', judge_name: 'Другой' },
      { id: 'g2', judge_player_id: null, judge_name: null },
      { id: 'g3', judge_player_id: 'old-judge', judge_name: 'Другой' },
    ]);
    expect((await db.get<any>('SELECT judge_player_id, organizer_player_id FROM tournaments WHERE id=?', ['t1']))).toEqual({ judge_player_id: 'old-judge', organizer_player_id: null });
  });

  it('changes nothing when a nickname is not unique, and records no marker so it is tried again', async () => {
    const db = await open(); await seed(db);
    await player(db, 'chagin-2', 'чагин');

    expect(await applyBogdanaTournamentStaff(db)).toBe(0);

    expect(await db.get<any>("SELECT judge_player_id FROM tournaments WHERE id='t1'")).toEqual({ judge_player_id: 'old-judge' });
    expect(await db.get<any>('SELECT 1 AS found FROM migration_history WHERE migration_name=?', [BOGDANA_TOURNAMENT_STAFF_MIGRATION])).toBeFalsy();
  });
});
