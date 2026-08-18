import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import Database from 'better-sqlite3';
import {
  verifyDatabaseIntegrityAndStats,
  compressAndSaveGitCheckpoint,
  restoreGitCheckpointToSqlite,
} from '../db/gitCheckpointUtils.ts';

function createTestDb(
  dbPath: string,
  options: {
    tournamentTitle?: string;
    customGameNumbers?: number[];
    gameCount?: number;
    game7Status?: string;
    protocol7Status?: string;
    results7Count?: number;
    game8Status?: string;
    protocol8Status?: string;
    results8Count?: number;
  } = {}
) {
  const db = new Database(dbPath);
  db.exec(`
    CREATE TABLE tournaments (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active'
    );
    CREATE TABLE tournament_games (
      id TEXT PRIMARY KEY,
      tournament_id TEXT NOT NULL,
      game_number INTEGER NOT NULL,
      status TEXT NOT NULL
    );
    CREATE TABLE tournament_game_protocols (
      id TEXT PRIMARY KEY,
      game_id TEXT NOT NULL,
      status TEXT NOT NULL
    );
    CREATE TABLE tournament_game_player_results (
      id TEXT PRIMARY KEY,
      game_id TEXT NOT NULL,
      participant_id TEXT NOT NULL
    );
  `);

  const title = options.tournamentTitle ?? 'Турнир Богдана 1.08';
  db.prepare('INSERT INTO tournaments (id, title) VALUES (?, ?)').run('t1', title);

  let gameNumbers: number[] = [];
  if (options.customGameNumbers) {
    gameNumbers = options.customGameNumbers;
  } else {
    const totalGames = options.gameCount ?? 10;
    for (let i = 1; i <= totalGames; i++) {
      gameNumbers.push(i);
    }
  }

  gameNumbers.forEach((gNum, idx) => {
    const gameId = `g_${gNum}_${idx}`;
    let gStatus = 'completed';
    let pStatus = 'completed';
    let resCount = 10;

    if (gNum === 7) {
      if (options.game7Status) gStatus = options.game7Status;
      if (options.protocol7Status) pStatus = options.protocol7Status;
      if (options.results7Count !== undefined) resCount = options.results7Count;
    } else if (gNum === 8) {
      if (options.game8Status) gStatus = options.game8Status;
      if (options.protocol8Status) pStatus = options.protocol8Status;
      if (options.results8Count !== undefined) resCount = options.results8Count;
    }

    db.prepare('INSERT INTO tournament_games (id, tournament_id, game_number, status) VALUES (?, ?, ?, ?)').run(
      gameId,
      't1',
      gNum,
      gStatus
    );
    db.prepare('INSERT INTO tournament_game_protocols (id, game_id, status) VALUES (?, ?, ?)').run(
      `p_${gameId}`,
      gameId,
      pStatus
    );

    for (let r = 1; r <= resCount; r++) {
      db.prepare('INSERT INTO tournament_game_player_results (id, game_id, participant_id) VALUES (?, ?, ?)').run(
        `r_${gameId}_${r}`,
        gameId,
        `p${r}`
      );
    }
  });

  db.close();
}

describe('gitCheckpointUtils', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'git_checkpoint_test_'));
  });

  afterEach(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('1. Valid DB: tournament with 10 games, completed protocols #7 & #8 and 10 results each', () => {
    const validDbPath = path.join(tmpDir, 'valid.sqlite');
    createTestDb(validDbPath);

    const stats = verifyDatabaseIntegrityAndStats(validDbPath);
    expect(stats.totalTournaments).toBe(1);
    expect(stats.bogdanaStats.title).toBe('Турнир Богдана 1.08');
    expect(stats.bogdanaStats.totalGames).toBe(10);
    expect(stats.bogdanaStats.game7.gameStatus).toBe('completed');
    expect(stats.bogdanaStats.game7.protocolStatus).toBe('completed');
    expect(stats.bogdanaStats.game7.resultsCount).toBe(10);
    expect(stats.bogdanaStats.game8.gameStatus).toBe('completed');
    expect(stats.bogdanaStats.game8.protocolStatus).toBe('completed');
    expect(stats.bogdanaStats.game8.resultsCount).toBe(10);
  });

  it('2. Error if tournament does not contain 10 games', () => {
    const dbPath = path.join(tmpDir, 'invalid_game_count.sqlite');
    createTestDb(dbPath, { gameCount: 9 });

    expect(() => verifyDatabaseIntegrityAndStats(dbPath)).toThrow(/must have exactly 10 games/);
  });

  it('3. Error if Game #7 is missing', () => {
    const dbPath = path.join(tmpDir, 'missing_game7.sqlite');
    // 10 games, but game numbers are 1, 2, 3, 4, 5, 6, 8, 9, 10, 11 (no game #7)
    createTestDb(dbPath, { customGameNumbers: [1, 2, 3, 4, 5, 6, 8, 9, 10, 11] });

    expect(() => verifyDatabaseIntegrityAndStats(dbPath)).toThrow(/Game #7 in "Турнир Богдана 1.08" must exist/);
  });

  it('4. Error if Game #8 is duplicated', () => {
    const dbPath = path.join(tmpDir, 'duplicate_game8.sqlite');
    // 10 games total, but game 8 is listed twice: [1, 2, 3, 4, 5, 6, 7, 8, 8, 9]
    createTestDb(dbPath, { customGameNumbers: [1, 2, 3, 4, 5, 6, 7, 8, 8, 9] });

    expect(() => verifyDatabaseIntegrityAndStats(dbPath)).toThrow(/must exist exactly once/);
  });

  it('5. Error if game status = completed, but protocol status = draft', () => {
    const dbPath = path.join(tmpDir, 'draft_protocol7.sqlite');
    createTestDb(dbPath, { protocol7Status: 'draft' });

    expect(() => verifyDatabaseIntegrityAndStats(dbPath)).toThrow(/protocol status is "draft"/);
  });

  it('6. Error if Game #7 or #8 has resultsCount != 10', () => {
    const dbPath = path.join(tmpDir, 'invalid_results_count.sqlite');
    createTestDb(dbPath, { results7Count: 9 });

    expect(() => verifyDatabaseIntegrityAndStats(dbPath)).toThrow(/player results count is 9, expected 10/);
  });

  it('7. Error for corrupted SQLite file', () => {
    const dbPath = path.join(tmpDir, 'corrupt.sqlite');
    fs.writeFileSync(dbPath, 'NOT A SQLITE DATABASE');

    expect(() => verifyDatabaseIntegrityAndStats(dbPath)).toThrow();
  });

  it('8. Successful gzip+base64 roundtrip', () => {
    const sourceSqlitePath = path.join(tmpDir, 'source.sqlite');
    const b64Path = path.join(tmpDir, 'checkpoint.gz.b64');
    const restoredSqlitePath = path.join(tmpDir, 'restored.sqlite');

    createTestDb(sourceSqlitePath);

    compressAndSaveGitCheckpoint(sourceSqlitePath, b64Path);
    expect(fs.existsSync(b64Path)).toBe(true);

    restoreGitCheckpointToSqlite(b64Path, restoredSqlitePath);
    expect(fs.existsSync(restoredSqlitePath)).toBe(true);

    const stats = verifyDatabaseIntegrityAndStats(restoredSqlitePath);
    expect(stats.bogdanaStats.totalGames).toBe(10);
  });
});
