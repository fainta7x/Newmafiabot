import Database from 'better-sqlite3';
import { drizzle, BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import path from 'path';
import fs from 'fs';
import os from 'os';
import * as schema from './schema.ts';
import { seedDemoData } from './seed.ts';
import { restoreGzB64FileAtomically, verifySqliteFile } from './previewRecovery.ts';
import { initializePreviewRuntimeFromCanonical, initializeProductionRuntimeFromCanonical } from './canonicalSnapshot.ts';
import { applyConfirmedTelegramPlayerLinksMigration } from './confirmedTelegramPlayerLinksMigration.ts';
import { applyImportLegacyPlayerIdentitiesMigration } from './importLegacyPlayerIdentitiesMigration.ts';
import { applyApprovedEloBaselineMigration } from './applyApprovedEloBaselineMigration.ts';
import { applyMillourtDuplicateMergeMigration } from './mergeMillourtDuplicateMigration.ts';
import { applyFandorinAug28GameIdentityMigration } from './fixFandorinAug28GameIdentityMigration.ts';
import { ensureJudgeAuthoritySchema } from './ensureJudgeAuthoritySchema.ts';
import { ensureClubOperationsSchema } from './ensureClubOperationsSchema.ts';
import { createTursoHttpDatabase } from './tursoHttpDatabase.ts';

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

export function verifySqliteIntegrity(file: string): boolean { return verifySqliteFile(file); }

export function restoreCheckpointFromGzB64(targetPath: string): boolean {
  const cwd = process.cwd();
  const candidate1 = path.join(cwd, 'mafia_crm.checkpoint.sqlite.gz.b64');
  const candidate2 = path.join(cwd, 'mafia_crm.checkpoint.gz.b64');
  const gzB64Path = fs.existsSync(candidate1) ? candidate1 : fs.existsSync(candidate2) ? candidate2 : null;
  if (!gzB64Path) return false;
  return restoreGzB64FileAtomically(gzB64Path, targetPath);
}

export function ensureValidCheckpoint(targetPath: string): boolean {
  if (verifySqliteIntegrity(targetPath)) return true;
  console.warn('Checkpoint file is missing or corrupted. Attempting fallback from .gz.b64...');
  return restoreCheckpointFromGzB64(targetPath);
}

export function createDatabaseConnection(dbPathOrMemory?: string): DatabaseWrapper {
  const configuredDatabasePath = process.env.DATABASE_PATH;
  let dbPath = dbPathOrMemory || configuredDatabasePath;
  if (!dbPath || dbPath === './mafia_crm.sqlite' || dbPath === 'mafia_crm.sqlite') {
    if (process.env.NODE_ENV === 'production') dbPath = path.join(process.cwd(), 'mafia_crm.sqlite');
    else {
      dbPath = path.join(process.cwd(), 'mafia_crm.runtime.sqlite');
      if (!fs.existsSync(dbPath) || fs.statSync(dbPath).size === 0) {
        const bootstrap = initializePreviewRuntimeFromCanonical(dbPath, process.cwd(), { allowLegacyWithoutCanonical: !process.env.VITEST });
        if (bootstrap.source === 'preview-checkpoint') console.log('Restored runtime database from a compatible versioned preview checkpoint.');
        else if (bootstrap.source === 'canonical') console.log('Initialized runtime database from the canonical repository snapshot.');
      }
    }
  }

  const resolvedDbPath = (dbPath === ':memory:' || dbPath.startsWith('file:')) ? dbPath : path.resolve(dbPath);
  const isProductionConfiguredRuntime = process.env.NODE_ENV === 'production' && !dbPathOrMemory && Boolean(configuredDatabasePath);
  if (isProductionConfiguredRuntime && resolvedDbPath !== ':memory:' && !resolvedDbPath.startsWith('file:')) {
    const runtimeMissingOrEmpty = !fs.existsSync(resolvedDbPath) || fs.statSync(resolvedDbPath).size === 0;
    if (runtimeMissingOrEmpty) {
      if (process.env.DATABASE_BOOTSTRAP_FROM_CHECKPOINT !== 'true') {
        throw new Error('Production database is missing or empty. Set DATABASE_BOOTSTRAP_FROM_CHECKPOINT=true for the first canonical bootstrap.');
      }
      const bootstrap = initializeProductionRuntimeFromCanonical(resolvedDbPath, process.cwd());
      if (!bootstrap.initialized) {
        throw new Error('Production database bootstrap did not initialize the target database.');
      }
      console.log('Initialized production database from the canonical repository checkpoint.');
    }
  }

  if (resolvedDbPath !== ':memory:' && !resolvedDbPath.startsWith('file:')) {
    const dir = path.dirname(resolvedDbPath); if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }
  const sqlite = new Database(resolvedDbPath);
  const isPreviewTournamentDB = path.basename(resolvedDbPath) === 'mafia_crm.runtime.sqlite' && process.env.NODE_ENV !== 'production';
  if (isPreviewTournamentDB) sqlite.pragma('journal_mode = DELETE'); else sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  const drizzleDb = drizzle(sqlite, { schema });
  const wrapper: DatabaseWrapper = {
    sqlite, drizzle: drizzleDb, dbPath: resolvedDbPath,
    async all<T = any>(sql: string, params: any[] = []): Promise<T[]> { return sqlite.prepare(sql).all(...params) as T[]; },
    async get<T = any>(sql: string, params: any[] = []): Promise<T | null> { const res = sqlite.prepare(sql).get(...params); return (res as T) || null; },
    async run(sql: string, params: any[] = []) { const info = sqlite.prepare(sql).run(...params); return { lastID: info.lastInsertRowid ?? null, changes: info.changes }; },
    async exec(sql: string) { sqlite.exec(sql); },
    async transaction<T>(cb: (tx: DatabaseWrapper) => Promise<T>): Promise<T> {
      sqlite.exec('BEGIN TRANSACTION'); try { const result = await cb(wrapper); sqlite.exec('COMMIT'); return result; }
      catch (err) { try { sqlite.exec('ROLLBACK'); } catch (_) {} throw err; }
    },
  };
  initializeDatabase(wrapper);
  return wrapper;
}

async function createTursoProductionConnection(databaseUrl: string, authToken: string): Promise<DatabaseWrapper> {
  const turso = createTursoHttpDatabase(databaseUrl, authToken);
  if (await turso.isEmpty()) {
    if (process.env.DATABASE_BOOTSTRAP_FROM_CHECKPOINT !== 'true') {
      throw new Error('Turso database is empty. Set DATABASE_BOOTSTRAP_FROM_CHECKPOINT=true for the first canonical bootstrap.');
    }

    const tempPath = path.join(os.tmpdir(), `2la-noire-turso-bootstrap-${process.pid}-${Date.now()}.sqlite`);
    let source: DatabaseWrapper | null = null;
    try {
      const bootstrap = initializeProductionRuntimeFromCanonical(tempPath, process.cwd());
      if (!bootstrap.initialized) throw new Error('Canonical Turso bootstrap did not initialize the temporary database.');
      // Reuse the existing local initializer so every current SQL/manual migration is applied before upload.
      source = createDatabaseConnection(tempPath);
      await turso.importFromSqlite(source.sqlite);
      console.log('[TURSO] Empty remote database initialized from the fully migrated canonical checkpoint.');
    } finally {
      if (source) {
        try { source.sqlite.close(); } catch (_) {}
      }
      for (const suffix of ['', '-wal', '-shm']) {
        try { fs.unlinkSync(`${tempPath}${suffix}`); } catch (_) {}
      }
    }
  } else {
    console.log('[TURSO] Existing remote database detected; canonical bootstrap skipped.');
  }
  return turso.wrapper as unknown as DatabaseWrapper;
}

export async function getDb(): Promise<DatabaseWrapper> {
  if (!defaultDbInstance) {
    const tursoUrl = String(process.env.TURSO_DATABASE_URL || '').trim();
    const tursoToken = String(process.env.TURSO_AUTH_TOKEN || '').trim();
    if (Boolean(tursoUrl) !== Boolean(tursoToken)) {
      throw new Error('TURSO_DATABASE_URL and TURSO_AUTH_TOKEN must either both be set or both be absent.');
    }
    defaultDbInstance = tursoUrl && tursoToken
      ? await createTursoProductionConnection(tursoUrl, tursoToken)
      : createDatabaseConnection();
    await seedDemoData(defaultDbInstance);
    try {
      await applyMillourtDuplicateMergeMigration(defaultDbInstance);
    } catch (error) {
      // This is a one-off data hygiene repair. Never make the whole application unavailable
      // if an unexpected historical reference prevents the merge; leave a clear server log instead.
      console.error('[DATA] Millourt duplicate cleanup failed:', error);
    }
    // The historical game repair depends on both judge_level and club_role because it
    // re-runs canonical evening pricing after swapping the player identity. Ensure the
    // same operational schema that createApp uses exists before the one-off migration.
    await ensureJudgeAuthoritySchema(defaultDbInstance);
    await ensureClubOperationsSchema(defaultDbInstance);
    try {
      await applyFandorinAug28GameIdentityMigration(defaultDbInstance);
    } catch (error) {
      // This repair is deliberately narrow and fail-closed. A data mismatch must never
      // reset/replace the database or prevent the application from starting.
      console.error('[DATA] Fandorin 2026-08-28 game identity repair failed:', error);
    }
  }
  return defaultDbInstance;
}

export function resetDbInstanceForTesting() {
  if (defaultDbInstance) {
    try { (defaultDbInstance.sqlite as any)?.close?.(); } catch (_) {}
    defaultDbInstance = null;
  }
}

export function initializeDatabase(dbWrapper: DatabaseWrapper) {
  const migrationSqlPath = path.join(process.cwd(), 'drizzle', '0000_initial.sql');
  if (fs.existsSync(migrationSqlPath)) dbWrapper.sqlite.exec(fs.readFileSync(migrationSqlPath, 'utf8'));
  const addColumnIfNotExists = (tableName: string, columnName: string, colDef: string) => {
    try { const columns = dbWrapper.sqlite.pragma(`table_info(${tableName})`) as any[]; if (!columns.some((c) => c.name === columnName)) dbWrapper.sqlite.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${colDef}`); }
    catch (e) { console.error(`Failed to add column ${columnName} to table ${tableName}:`, e); }
  };

  addColumnIfNotExists('evening_participants', 'table_id', 'TEXT REFERENCES evening_tables(id) ON DELETE SET NULL');
  addColumnIfNotExists('evening_participants', 'response_status', "TEXT NOT NULL DEFAULT 'unanswered'");
  addColumnIfNotExists('games', 'evening_table_id', 'TEXT REFERENCES evening_tables(id) ON DELETE SET NULL');
  addColumnIfNotExists('games', 'archived_at', 'TEXT');
  addColumnIfNotExists('games', 'judge_player_id', 'TEXT REFERENCES players(id) ON DELETE SET NULL');
  addColumnIfNotExists('organizer_tasks', 'automation_key', 'TEXT');
  addColumnIfNotExists('players', 'preferred_format', 'TEXT');
  addColumnIfNotExists('players', 'referred_by', 'TEXT');
  addColumnIfNotExists('players', 'do_not_invite_until', 'TEXT');
  addColumnIfNotExists('players', 'pause_reason', 'TEXT');
  addColumnIfNotExists('players', 'contact_status', "TEXT NOT NULL DEFAULT 'normal'");
  addColumnIfNotExists('players', 'elo_seed', 'INTEGER NOT NULL DEFAULT 1000');
  addColumnIfNotExists('players', 'elo_seed_reason', 'TEXT');
  addColumnIfNotExists('players', 'elo_seed_set_at', 'TEXT');

  try { dbWrapper.sqlite.exec(`CREATE TABLE IF NOT EXISTS player_achievements (id TEXT PRIMARY KEY,player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,achievement_id TEXT NOT NULL,earned_at TEXT NOT NULL,source TEXT NOT NULL DEFAULT 'evaluator',legacy_user_id TEXT,created_at TEXT NOT NULL,UNIQUE(player_id,achievement_id));CREATE INDEX IF NOT EXISTS idx_player_achievements_player ON player_achievements(player_id);`); }
  catch (e) { console.error('Failed to initialize player_achievements:', e); }
  // Migration 0008 builds canonical nomination objects that depend on this table.
  // Create the empty table first for new/in-memory databases; existing databases are untouched.
  try { dbWrapper.sqlite.exec(`CREATE TABLE IF NOT EXISTS tournament_final_resolutions (id TEXT PRIMARY KEY,tournament_id TEXT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,type TEXT NOT NULL,category TEXT,participant_ids_json TEXT NOT NULL,ordered_participant_ids_json TEXT,winner_participant_id TEXT,resolution_method TEXT NOT NULL,comment TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);`); }
  catch (e) { console.error('Failed to create tournament_final_resolutions table:', e); }

  const migrations = [
    '0001_complete_club_workflow.sql','0002_tournaments.sql','0003_protocol_imports.sql','0004_tournament_game_protocols.sql','0005_tournament_game_best_moves.sql','0006_tournament_award_overrides.sql','0007_player_historical_awards.sql','0008_canonical_nomination_resolution.sql','0009_token_ledger.sql','0010_club_game_token_settlements.sql','0011_canonical_evening_attendance.sql',
  ];
  for (const file of migrations) { const migrationPath = path.join(process.cwd(), 'drizzle', file); if (fs.existsSync(migrationPath)) dbWrapper.sqlite.exec(fs.readFileSync(migrationPath, 'utf8')); }

  // These three steps migrate specific real 2LA Noire player identities/links/baselines.
  // Generic Vitest databases (including temporary SQLite files) must contain only test fixtures.
  if (!process.env.VITEST) {
    applyConfirmedTelegramPlayerLinksMigration(dbWrapper);
    applyImportLegacyPlayerIdentitiesMigration(dbWrapper);
    applyApprovedEloBaselineMigration(dbWrapper);
  }

  addColumnIfNotExists('tournament_games', 'judge_player_id', 'TEXT REFERENCES players(id) ON DELETE SET NULL');
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
  try { dbWrapper.sqlite.exec(`UPDATE tournament_game_player_results SET judge_bonus=-penalty_points,penalty_points=0 WHERE penalty_points>0 AND (judge_bonus=0 OR judge_bonus IS NULL);`); }
  catch (e) { console.error('Failed to migrate legacy penalty_points to judge_bonus:', e); }
  try { dbWrapper.sqlite.exec(`CREATE TABLE IF NOT EXISTS player_avatars (player_id TEXT PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,mime_type TEXT NOT NULL,image_data BLOB NOT NULL,byte_size INTEGER NOT NULL,width INTEGER NOT NULL,height INTEGER NOT NULL,updated_at TEXT NOT NULL);CREATE INDEX IF NOT EXISTS idx_player_avatars_updated_at ON player_avatars(updated_at);`); }
  catch (e) { console.error('Failed to create player_avatars table:', e); }
}
