import Database from 'better-sqlite3';
import { drizzle, BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import path from 'path';
import fs from 'fs';
import * as schema from './schema.ts';
import { seedDemoData } from './seed.ts';

export interface DatabaseWrapper {
  sqlite: Database.Database;
  drizzle: BetterSQLite3Database<typeof schema>;
  all<T = any>(sql: string, params?: any[]): Promise<T[]>;
  get<T = any>(sql: string, params?: any[]): Promise<T | null>;
  run(sql: string, params?: any[]): Promise<{ lastID: number | bigint | null; changes: number }>;
  exec(sql: string): Promise<void>;
  transaction<T>(cb: (tx: DatabaseWrapper) => Promise<T>): Promise<T>;
  dbPath: string;
}

let defaultDbInstance: DatabaseWrapper | null = null;

export function createDatabaseConnection(dbPathOrMemory?: string): DatabaseWrapper {
  let dbPath = dbPathOrMemory || process.env.DATABASE_PATH;
  
  if (!dbPath) {
    if (process.env.NODE_ENV === 'production') {
      dbPath = path.join(process.cwd(), 'mafia_crm.sqlite');
    } else {
      dbPath = path.join(process.cwd(), 'mafia_crm.runtime.sqlite');
      
      if (!fs.existsSync(dbPath)) {
        const checkpointPath = path.join(process.cwd(), 'mafia_crm.checkpoint.sqlite');
        if (fs.existsSync(checkpointPath)) {
          // Verify checkpoint before copying
          let tempDb: Database.Database | null = null;
          try {
            tempDb = new Database(checkpointPath, { readonly: true });
            const integrityCheck = tempDb.pragma('integrity_check', { simple: false }) as any[];
            if (Array.isArray(integrityCheck) && integrityCheck[0]?.integrity_check === 'ok') {
               fs.copyFileSync(checkpointPath, dbPath);
               console.log('Restored runtime database from valid checkpoint.');
            } else {
               throw new Error(`Checkpoint is corrupted. Integrity check: ${JSON.stringify(integrityCheck)}`);
            }
          } catch (err: any) {
             throw new Error(`Checkpoint is corrupted. ${err.message}`);
          } finally {
            if (tempDb) tempDb.close();
          }
        }
      }
    }
  }

  const resolvedDbPath = (dbPath === ':memory:' || dbPath.startsWith('file:'))
    ? dbPath
    : path.resolve(dbPath);

  // If path is not :memory: and parent dir doesn't exist, create it
  if (resolvedDbPath !== ':memory:' && !resolvedDbPath.startsWith('file:')) {
    const dir = path.dirname(resolvedDbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  const sqlite = new Database(resolvedDbPath);

  const isPreviewTournamentDB = path.basename(resolvedDbPath) === 'mafia_crm.runtime.sqlite' && process.env.NODE_ENV !== 'production';
  if (isPreviewTournamentDB) {
    // Временно используем DELETE для безопасного Git-checkpoint турнирной Preview-базы
    sqlite.pragma('journal_mode = DELETE');
  } else {
    sqlite.pragma('journal_mode = WAL');
  }

  sqlite.pragma('foreign_keys = ON');

  const drizzleDb = drizzle(sqlite, { schema });

  const wrapper: DatabaseWrapper = {
    sqlite,
    drizzle: drizzleDb,
    dbPath: resolvedDbPath,

    async all<T = any>(sql: string, params: any[] = []): Promise<T[]> {
      const stmt = sqlite.prepare(sql);
      return stmt.all(...params) as T[];
    },

    async get<T = any>(sql: string, params: any[] = []): Promise<T | null> {
      const stmt = sqlite.prepare(sql);
      const res = stmt.get(...params);
      return (res as T) || null;
    },

    async run(sql: string, params: any[] = []) {
      const stmt = sqlite.prepare(sql);
      const info = stmt.run(...params);
      return {
        lastID: info.lastInsertRowid ?? null,
        changes: info.changes,
      };
    },

    async exec(sql: string) {
      sqlite.exec(sql);
    },

    async transaction<T>(cb: (tx: DatabaseWrapper) => Promise<T>): Promise<T> {
      // Execute in a transaction
      let result: T;
      sqlite.exec('BEGIN TRANSACTION');
      try {
        result = await cb(wrapper);
        sqlite.exec('COMMIT');
        return result;
      } catch (err) {
        try {
          sqlite.exec('ROLLBACK');
        } catch (_) {}
        throw err;
      }
    },
  };

  initializeDatabase(wrapper);
  return wrapper;
}

export async function getDb(): Promise<DatabaseWrapper> {
  if (!defaultDbInstance) {
    defaultDbInstance = createDatabaseConnection();
    await seedDemoData(defaultDbInstance);
  }
  return defaultDbInstance;
}

export function resetDbInstanceForTesting() {
  if (defaultDbInstance) {
    try {
      defaultDbInstance.sqlite.close();
    } catch (_) {}
    defaultDbInstance = null;
  }
}

export function initializeDatabase(dbWrapper: DatabaseWrapper) {
  // Ensure tables exist from migration/schema definition
  const migrationSqlPath = path.join(process.cwd(), 'drizzle', '0000_initial.sql');
  if (fs.existsSync(migrationSqlPath)) {
    const migrationSql = fs.readFileSync(migrationSqlPath, 'utf8');
    dbWrapper.sqlite.exec(migrationSql);
  }

  // Ensure new columns exist on existing tables (SQLite alter table column additions)
  const addColumnIfNotExists = (tableName: string, columnName: string, colDef: string) => {
    try {
      const columns = dbWrapper.sqlite.pragma(`table_info(${tableName})`) as any[];
      const exists = columns.some((c) => c.name === columnName);
      if (!exists) {
        dbWrapper.sqlite.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${colDef}`);
      }
    } catch (e) {
      console.error(`Failed to add column ${columnName} to table ${tableName}:`, e);
    }
  };

  addColumnIfNotExists('evening_participants', 'table_id', 'TEXT REFERENCES evening_tables(id) ON DELETE SET NULL');
  addColumnIfNotExists('games', 'evening_table_id', 'TEXT REFERENCES evening_tables(id) ON DELETE SET NULL');
  addColumnIfNotExists('organizer_tasks', 'automation_key', 'TEXT');
  addColumnIfNotExists('players', 'preferred_format', 'TEXT');
  addColumnIfNotExists('players', 'referred_by', 'TEXT');
  addColumnIfNotExists('players', 'do_not_invite_until', 'TEXT');
  addColumnIfNotExists('players', 'pause_reason', 'TEXT');
  addColumnIfNotExists('players', 'contact_status', "TEXT NOT NULL DEFAULT 'normal'");

  // Migrate legacy lifecycle_status values to contact_status without losing players
  try {
    dbWrapper.sqlite.exec(`
      UPDATE players SET contact_status = CASE
        WHEN lifecycle_status = 'blocked' THEN 'blocked'
        WHEN lifecycle_status = 'paused' THEN 'paused'
        ELSE 'normal'
      END
      WHERE contact_status IS NULL OR contact_status = '' OR contact_status = 'normal';
    `);
  } catch (e) {
    console.error('Failed to migrate contact_status:', e);
  }

  const migration1SqlPath = path.join(process.cwd(), 'drizzle', '0001_complete_club_workflow.sql');
  if (fs.existsSync(migration1SqlPath)) {
    const migration1Sql = fs.readFileSync(migration1SqlPath, 'utf8');
    dbWrapper.sqlite.exec(migration1Sql);
  }

  const migration2SqlPath = path.join(process.cwd(), 'drizzle', '0002_tournaments.sql');
  if (fs.existsSync(migration2SqlPath)) {
    const migration2Sql = fs.readFileSync(migration2SqlPath, 'utf8');
    dbWrapper.sqlite.exec(migration2Sql);
  }

  const migration3SqlPath = path.join(process.cwd(), 'drizzle', '0003_protocol_imports.sql');
  if (fs.existsSync(migration3SqlPath)) {
    const migration3Sql = fs.readFileSync(migration3SqlPath, 'utf8');
    dbWrapper.sqlite.exec(migration3Sql);
  }

  const migration4SqlPath = path.join(process.cwd(), 'drizzle', '0004_tournament_game_protocols.sql');
  if (fs.existsSync(migration4SqlPath)) {
    const migration4Sql = fs.readFileSync(migration4SqlPath, 'utf8');
    dbWrapper.sqlite.exec(migration4Sql);
  }

  const migration5SqlPath = path.join(process.cwd(), 'drizzle', '0005_tournament_game_best_moves.sql');
  if (fs.existsSync(migration5SqlPath)) {
    const migration5Sql = fs.readFileSync(migration5SqlPath, 'utf8');
    dbWrapper.sqlite.exec(migration5Sql);
  }

  addColumnIfNotExists('tournament_games', 'draft_protocol_json', 'TEXT');
  addColumnIfNotExists('tournament_games', 'protocol_import_id', 'TEXT');
  addColumnIfNotExists('tournament_game_player_results', 'ci_points', 'REAL NOT NULL DEFAULT 0');
  addColumnIfNotExists('tournaments', 'public_token', 'TEXT');
  addColumnIfNotExists('tournaments', 'results_published_at', 'TEXT');
  
  addColumnIfNotExists('tournament_game_protocols', 'end_reason', "TEXT NOT NULL DEFAULT 'normal'");
  addColumnIfNotExists('tournament_game_protocols', 'ppk_culprit_participant_id', 'TEXT');
  addColumnIfNotExists('tournament_game_player_results', 'minor_technical_fouls', 'INTEGER NOT NULL DEFAULT 0');
  addColumnIfNotExists('tournament_game_player_results', 'major_technical_fouls', 'INTEGER NOT NULL DEFAULT 0');
  addColumnIfNotExists('tournament_game_player_results', 'disciplinary_penalty_points', 'REAL NOT NULL DEFAULT 0');
  addColumnIfNotExists('tournament_game_player_results', 'removal_reason', 'TEXT');

  try {
    dbWrapper.sqlite.exec(`
      CREATE TABLE IF NOT EXISTS tournament_final_resolutions (
        id TEXT PRIMARY KEY,
        tournament_id TEXT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
        type TEXT NOT NULL,
        category TEXT,
        participant_ids_json TEXT NOT NULL,
        ordered_participant_ids_json TEXT,
        winner_participant_id TEXT,
        resolution_method TEXT NOT NULL,
        comment TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
  } catch (e) {
    console.error('Failed to create tournament_final_resolutions table:', e);
  }
}
