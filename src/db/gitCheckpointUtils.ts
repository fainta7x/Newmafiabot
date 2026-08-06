import fs from 'fs';
import zlib from 'zlib';
import Database from 'better-sqlite3';

export interface TournamentStat {
  id: string;
  title: string;
  gamesCount: number;
  completedGamesCount: number;
  totalResultsCount: number;
}

export interface GitCheckpointStats {
  totalTournaments: number;
  bogdanaStats: {
    id: string;
    title: string;
    totalGames: number;
    completedGames: number;
    game7: { id: string; status: string; resultsCount: number };
    game8: { id: string; status: string; resultsCount: number };
  };
  tournaments: TournamentStat[];
}

/**
 * Readonly verifies SQLite database file integrity, size math,
 * and tournament game #7 / #8 completeness.
 */
export function verifyDatabaseIntegrityAndStats(dbPath: string): GitCheckpointStats {
  if (!fs.existsSync(dbPath)) {
    throw new Error(`Database file does not exist at: ${dbPath}`);
  }

  const stat = fs.statSync(dbPath);
  if (stat.size === 0) {
    throw new Error(`Database file at ${dbPath} is empty (0 bytes).`);
  }

  const db = new Database(dbPath, { readonly: true });

  try {
    const integrity = db.pragma('integrity_check', { simple: true });
    if (integrity !== 'ok') {
      throw new Error(`SQLite PRAGMA integrity_check failed: ${integrity}`);
    }

    const pageSize = db.pragma('page_size', { simple: true }) as number;
    const pageCount = db.pragma('page_count', { simple: true }) as number;
    const expectedSize = pageSize * pageCount;

    if (stat.size !== expectedSize) {
      throw new Error(
        `SQLite file size mismatch: file size is ${stat.size} bytes, but page_size * page_count = ${expectedSize}`
      );
    }

    const tournaments = db.prepare('SELECT id, title FROM tournaments').all() as { id: string; title: string }[];
    const tournamentStats: TournamentStat[] = [];

    for (const t of tournaments) {
      const gCount = (db.prepare('SELECT count(*) as c FROM tournament_games WHERE tournament_id = ?').get(t.id) as any).c;
      const cCount = (db.prepare("SELECT count(*) as c FROM tournament_games WHERE tournament_id = ? AND status = 'completed'").get(t.id) as any).c;
      const rCount = (
        db.prepare(
          'SELECT count(*) as c FROM tournament_game_player_results pr JOIN tournament_games g ON g.id = pr.game_id WHERE g.tournament_id = ?'
        ).get(t.id) as any
      ).c;

      tournamentStats.push({
        id: t.id,
        title: t.title,
        gamesCount: gCount,
        completedGamesCount: cCount,
        totalResultsCount: rCount,
      });
    }

    const bogdanaTourney = tournaments.find((t) => t.title === 'Турнир Богдана 1.08');
    if (!bogdanaTourney) {
      throw new Error('Required tournament "Турнир Богдана 1.08" was not found in database!');
    }

    const g7s = db.prepare('SELECT id, status FROM tournament_games WHERE tournament_id = ? AND game_number = 7').all(bogdanaTourney.id) as any[];
    const g8s = db.prepare('SELECT id, status FROM tournament_games WHERE tournament_id = ? AND game_number = 8').all(bogdanaTourney.id) as any[];

    if (g7s.length !== 1) {
      throw new Error(`Game #7 in "Турнир Богдана 1.08" must exist exactly once, found ${g7s.length}`);
    }
    if (g8s.length !== 1) {
      throw new Error(`Game #8 in "Турнир Богдана 1.08" must exist exactly once, found ${g8s.length}`);
    }

    const g7 = g7s[0];
    const g8 = g8s[0];

    if (g7.status !== 'completed') {
      throw new Error(`Game #7 in "Турнир Богдана 1.08" status is "${g7.status}", expected "completed"`);
    }
    if (g8.status !== 'completed') {
      throw new Error(`Game #8 in "Турнир Богдана 1.08" status is "${g8.status}", expected "completed"`);
    }

    const res7Count = (db.prepare('SELECT count(*) as c FROM tournament_game_player_results WHERE game_id = ?').get(g7.id) as any).c;
    const res8Count = (db.prepare('SELECT count(*) as c FROM tournament_game_player_results WHERE game_id = ?').get(g8.id) as any).c;

    if (res7Count !== 10) {
      throw new Error(`Game #7 in "Турнир Богдана 1.08" player results count is ${res7Count}, expected 10`);
    }
    if (res8Count !== 10) {
      throw new Error(`Game #8 in "Турнир Богдана 1.08" player results count is ${res8Count}, expected 10`);
    }

    const bStats = tournamentStats.find((s) => s.id === bogdanaTourney.id)!;

    return {
      totalTournaments: tournaments.length,
      bogdanaStats: {
        id: bogdanaTourney.id,
        title: bogdanaTourney.title,
        totalGames: bStats.gamesCount,
        completedGames: bStats.completedGamesCount,
        game7: { id: g7.id, status: g7.status, resultsCount: res7Count },
        game8: { id: g8.id, status: g8.status, resultsCount: res8Count },
      },
      tournaments: tournamentStats,
    };
  } finally {
    db.close();
  }
}

/**
 * Compress SQLite bytes with gzip, encode as base64 and write atomically to target path.
 */
export function compressAndSaveGitCheckpoint(sourceSqlitePath: string, targetB64Path: string): void {
  const sqliteBytes = fs.readFileSync(sourceSqlitePath);
  const gzBuffer = zlib.gzipSync(sqliteBytes);
  const b64String = gzBuffer.toString('base64');

  const tmpPath = `${targetB64Path}.tmp_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  fs.writeFileSync(tmpPath, b64String, 'utf-8');
  fs.renameSync(tmpPath, targetB64Path);
}

/**
 * Decode gzip+base64 checkpoint file into SQLite database file.
 */
export function restoreGitCheckpointToSqlite(b64Path: string, targetSqlitePath: string): void {
  const encoded = fs.readFileSync(b64Path, 'utf-8').trim();
  const decodedBytes = zlib.gunzipSync(Buffer.from(encoded, 'base64'));

  const tmpPath = `${targetSqlitePath}.tmp_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  fs.writeFileSync(tmpPath, decodedBytes);
  fs.renameSync(tmpPath, targetSqlitePath);
}
