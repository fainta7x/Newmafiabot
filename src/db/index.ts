import Database from 'better-sqlite3';
import { drizzle, BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import path from 'path';
import fs from 'fs';
import * as schema from './schema.ts';

export interface DatabaseWrapper {
  sqlite: Database.Database;
  drizzle: BetterSQLite3Database<typeof schema>;
  all<T = any>(sql: string, params?: any[]): Promise<T[]>;
  get<T = any>(sql: string, params?: any[]): Promise<T | null>;
  run(sql: string, params?: any[]): Promise<{ lastID: number | bigint | null; changes: number }>;
  exec(sql: string): Promise<void>;
  transaction<T>(cb: (tx: DatabaseWrapper) => Promise<T>): Promise<T>;
}

let defaultDbInstance: DatabaseWrapper | null = null;

export function createDatabaseConnection(dbPathOrMemory?: string): DatabaseWrapper {
  const dbPath = dbPathOrMemory || process.env.DATABASE_PATH || path.join(process.cwd(), 'mafia_crm.sqlite');

  // If path is not :memory: and parent dir doesn't exist, create it
  if (dbPath !== ':memory:' && !dbPath.startsWith('file:')) {
    const dir = path.dirname(path.resolve(dbPath));
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  const sqlite = new Database(dbPath);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');

  const drizzleDb = drizzle(sqlite, { schema });

  const wrapper: DatabaseWrapper = {
    sqlite,
    drizzle: drizzleDb,

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
      // Ignore if table or column issue
    }
  };

  addColumnIfNotExists('evening_participants', 'table_id', 'TEXT REFERENCES evening_tables(id) ON DELETE SET NULL');
  addColumnIfNotExists('games', 'evening_table_id', 'TEXT REFERENCES evening_tables(id) ON DELETE SET NULL');
  addColumnIfNotExists('organizer_tasks', 'automation_key', 'TEXT UNIQUE');
  addColumnIfNotExists('players', 'preferred_format', 'TEXT');
  addColumnIfNotExists('players', 'referred_by', 'TEXT');
  addColumnIfNotExists('players', 'do_not_invite_until', 'TEXT');
  addColumnIfNotExists('players', 'pause_reason', 'TEXT');
}
