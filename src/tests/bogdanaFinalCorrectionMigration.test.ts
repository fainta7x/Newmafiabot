import { describe, expect, it } from 'vitest';

import { createDatabaseConnection } from '../db/index.ts';
import {
  applyBogdanaFinalCorrection,
  BOGDANA_FINAL_CORRECTION_MIGRATION,
} from '../db/applyBogdanaFinalCorrection.ts';

describe('Bogdana historical correction migration', () => {
  it('applies once and records a durable completion marker', async () => {
    const db = createDatabaseConnection(':memory:');
    await db.exec(`
      CREATE TABLE migration_history (
        id TEXT PRIMARY KEY,
        migration_name TEXT NOT NULL,
        status TEXT NOT NULL,
        details_json TEXT,
        executed_at TEXT NOT NULL
      );
      CREATE TABLE tournaments (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        date TEXT,
        created_at TEXT
      );
      CREATE TABLE tournament_games (
        id TEXT PRIMARY KEY,
        tournament_id TEXT NOT NULL,
        game_number INTEGER NOT NULL
      );
      CREATE TABLE players (
        id TEXT PRIMARY KEY,
        nickname TEXT
      );
      CREATE TABLE tournament_participants (
        id TEXT PRIMARY KEY,
        tournament_id TEXT NOT NULL,
        player_id TEXT,
        display_name TEXT
      );
      CREATE TABLE tournament_game_player_results (
        id TEXT PRIMARY KEY,
        game_id TEXT NOT NULL,
        participant_id TEXT NOT NULL,
        judge_bonus REAL
      );
    `);
    await db.run(`INSERT INTO tournaments (id,title,date,created_at) VALUES ('t1','Турнир Богдана 1.08','2026-08-01','2026-08-01T00:00:00.000Z')`);
    await db.run(`INSERT INTO tournament_games (id,tournament_id,game_number) VALUES ('g10','t1',10)`);
    await db.run(`INSERT INTO players (id,nickname) VALUES ('p1','Богданчик')`);
    await db.run(`INSERT INTO tournament_participants (id,tournament_id,player_id,display_name) VALUES ('tp1','t1','p1','Богданчик')`);
    await db.run(`INSERT INTO tournament_game_player_results (id,game_id,participant_id,judge_bonus) VALUES ('r1','g10','tp1',0.4)`);

    await applyBogdanaFinalCorrection(db);
    await applyBogdanaFinalCorrection(db);

    const result = await db.get<any>(`SELECT judge_bonus FROM tournament_game_player_results WHERE id='r1'`);
    expect(Number(result?.judge_bonus)).toBeCloseTo(0.7);

    const markers = await db.all<any>(
      `SELECT migration_name,status,details_json FROM migration_history WHERE migration_name=?`,
      [BOGDANA_FINAL_CORRECTION_MIGRATION],
    );
    expect(markers).toHaveLength(1);
    expect(markers[0].status).toBe('completed');
    expect(JSON.parse(markers[0].details_json)).toMatchObject({
      game_number: 10,
      target_judge_bonus: 0.7,
      previous_judge_bonus: 0.4,
      already_correct: false,
    });
  });
});
