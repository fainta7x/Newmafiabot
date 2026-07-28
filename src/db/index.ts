import initSqlJs, { Database as SqlJsDatabase } from 'sql.js';
import fs from 'fs';
import path from 'path';

const DB_PATH = path.join(process.cwd(), 'mafia_crm.sqlite');

let dbWrapperInstance: any = null;
let rawSqlDb: SqlJsDatabase | null = null;
let inTransaction = false;

function saveToDisk() {
  if (rawSqlDb && !inTransaction) {
    try {
      const data = rawSqlDb.export();
      const buffer = Buffer.from(data);
      fs.writeFileSync(DB_PATH, buffer);
    } catch (e) {
      console.error('Error saving SQLite DB to disk:', e);
    }
  }
}

export async function getDb() {
  if (dbWrapperInstance) {
    return dbWrapperInstance;
  }

  const SQL = await initSqlJs();

  if (fs.existsSync(DB_PATH)) {
    const filebuffer = fs.readFileSync(DB_PATH);
    rawSqlDb = new SQL.Database(filebuffer);
  } else {
    rawSqlDb = new SQL.Database();
  }

  rawSqlDb.run('PRAGMA foreign_keys = ON;');

  dbWrapperInstance = {
    async all(sql: string, params: any[] = []) {
      if (!rawSqlDb) throw new Error('Database not initialized');
      const stmt = rawSqlDb.prepare(sql);
      if (params && params.length > 0) {
        stmt.bind(params);
      }
      const results: any[] = [];
      while (stmt.step()) {
        results.push(stmt.getAsObject());
      }
      stmt.free();
      return results;
    },

    async get(sql: string, params: any[] = []) {
      const rows = await this.all(sql, params);
      return rows[0] || null;
    },

    async run(sql: string, params: any[] = []) {
      if (!rawSqlDb) throw new Error('Database not initialized');
      const trimmed = sql.trim().toUpperCase();
      if (trimmed.startsWith('BEGIN')) {
        inTransaction = true;
      }

      rawSqlDb.run(sql, params);
      const changes = rawSqlDb.getRowsModified();

      if (trimmed.startsWith('COMMIT') || trimmed.startsWith('ROLLBACK')) {
        inTransaction = false;
      }

      saveToDisk();
      return { lastID: null, changes };
    },

    async exec(sql: string) {
      if (!rawSqlDb) throw new Error('Database not initialized');
      const trimmed = sql.trim().toUpperCase();
      if (trimmed.startsWith('BEGIN')) {
        inTransaction = true;
      }

      rawSqlDb.exec(sql);

      if (trimmed.startsWith('COMMIT') || trimmed.startsWith('ROLLBACK')) {
        inTransaction = false;
      }

      saveToDisk();
    },
  };

  return dbWrapperInstance;
}

export async function initializeDatabase() {
  const db = await getDb();
  if (!rawSqlDb) return;

  rawSqlDb.run(`
    CREATE TABLE IF NOT EXISTS players (
      id TEXT PRIMARY KEY,
      telegram_user_id TEXT UNIQUE,
      nickname TEXT NOT NULL UNIQUE,
      full_name TEXT,
      telegram_username TEXT,
      phone TEXT,
      lifecycle_status TEXT DEFAULT 'newcomer',
      source TEXT,
      notes TEXT,
      elo INTEGER DEFAULT 1000,
      tokens INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS game_evenings (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      starts_at TEXT NOT NULL,
      ends_at TEXT,
      timezone TEXT DEFAULT 'Europe/Moscow',
      venue TEXT,
      format TEXT DEFAULT 'STANDARD',
      status TEXT DEFAULT 'published',
      capacity INTEGER DEFAULT 20,
      default_price INTEGER DEFAULT 400,
      notes TEXT,
      settled_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS evening_participants (
      id TEXT PRIMARY KEY,
      evening_id TEXT NOT NULL,
      player_id TEXT NOT NULL,
      registration_status TEXT DEFAULT 'registered',
      attendance_status TEXT DEFAULT 'pending',
      arrival_status TEXT DEFAULT 'unknown',
      payment_status TEXT DEFAULT 'unpaid',
      amount_due INTEGER DEFAULT 400,
      amount_paid INTEGER DEFAULT 0,
      notes TEXT,
      registered_at TEXT,
      confirmed_at TEXT,
      checked_in_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (evening_id) REFERENCES game_evenings(id) ON DELETE CASCADE,
      FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE,
      UNIQUE(evening_id, player_id)
    );

    CREATE TABLE IF NOT EXISTS organizer_tasks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      type TEXT DEFAULT 'other',
      status TEXT DEFAULT 'todo',
      priority TEXT DEFAULT 'medium',
      due_at TEXT,
      completed_at TEXT,
      player_id TEXT,
      evening_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE SET NULL,
      FOREIGN KEY (evening_id) REFERENCES game_evenings(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS financial_transactions (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      amount INTEGER NOT NULL,
      category TEXT,
      description TEXT,
      player_id TEXT,
      evening_id TEXT,
      source_type TEXT,
      source_id TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE SET NULL,
      FOREIGN KEY (evening_id) REFERENCES game_evenings(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS games (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      evening_id TEXT,
      global_game_number INTEGER NOT NULL,
      game_date TEXT NOT NULL,
      winner_team TEXT NOT NULL,
      winner_label TEXT NOT NULL,
      judge_name TEXT NOT NULL,
      protocol_text TEXT,
      slots_json TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (evening_id) REFERENCES game_evenings(id) ON DELETE SET NULL
    );
  `);

  saveToDisk();
}
