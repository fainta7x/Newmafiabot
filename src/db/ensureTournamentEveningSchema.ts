import type { DatabaseWrapper } from './index.ts';

const tableColumns = async (db: DatabaseWrapper, table: string) =>
  new Set((await db.all<{ name: string }>(`PRAGMA table_info(${table})`)).map((column) => String(column.name)));

async function ensureColumn(db: DatabaseWrapper, table: string, column: string, definition: string): Promise<void> {
  const columns = await tableColumns(db, table);
  if (columns.size === 0 || columns.has(column)) return;
  await db.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

export async function ensureTournamentEveningSchema(db: DatabaseWrapper): Promise<void> {
  await ensureColumn(db, 'tournaments', 'judge_player_id', 'TEXT');
  await ensureColumn(db, 'tournaments', 'player_capacity', 'INTEGER NOT NULL DEFAULT 10');
  await ensureColumn(db, 'tournaments', 'entry_fee_rub', 'INTEGER NOT NULL DEFAULT 0');
  await ensureColumn(db, 'tournaments', 'prize_fund_rub', 'INTEGER NOT NULL DEFAULT 0');
  await ensureColumn(db, 'tournaments', 'prize_allocations_json', "TEXT NOT NULL DEFAULT '[]'");
  await ensureColumn(db, 'tournaments', 'registration_token', 'TEXT');
  await ensureColumn(db, 'tournaments', 'published_at', 'TEXT');
  await ensureColumn(db, 'tournaments', 'registration_closed_at', 'TEXT');

  await db.run(`
    CREATE TABLE IF NOT EXISTS tournament_registrations (
      id TEXT PRIMARY KEY,
      tournament_id TEXT NOT NULL,
      player_id TEXT NOT NULL,
      status TEXT NOT NULL,
      slot_number INTEGER CHECK(slot_number IS NULL OR slot_number BETWEEN 1 AND 10),
      registered_at TEXT NOT NULL,
      queue_order INTEGER,
      cancelled_at TEXT,
      updated_at TEXT NOT NULL,
      organizer_reason TEXT,
      UNIQUE(tournament_id, player_id)
    )
  `);
  await ensureColumn(db, 'tournament_registrations', 'slot_number', 'INTEGER CHECK(slot_number IS NULL OR slot_number BETWEEN 1 AND 10)');
  await db.run('CREATE INDEX IF NOT EXISTS idx_tournament_registrations_queue ON tournament_registrations(tournament_id, status, queue_order, registered_at, id)');
  await db.run("CREATE UNIQUE INDEX IF NOT EXISTS idx_tournament_registrations_confirmed_slot ON tournament_registrations(tournament_id, slot_number) WHERE status='confirmed' AND slot_number IS NOT NULL");

  await db.run(`
    CREATE TABLE IF NOT EXISTS tournament_payment_claims (
      id TEXT PRIMARY KEY,
      tournament_id TEXT NOT NULL,
      player_id TEXT NOT NULL,
      state TEXT NOT NULL DEFAULT 'unpaid',
      player_note TEXT,
      reported_at TEXT,
      reviewed_at TEXT,
      reviewed_by TEXT,
      organizer_note TEXT,
      updated_at TEXT NOT NULL,
      UNIQUE(tournament_id, player_id)
    )
  `);

  await db.run(`
    CREATE TABLE IF NOT EXISTS tournament_evening_audit (
      id TEXT PRIMARY KEY,
      tournament_id TEXT NOT NULL,
      player_id TEXT,
      action TEXT NOT NULL,
      actor_type TEXT NOT NULL,
      actor_id TEXT,
      reason TEXT,
      payload_json TEXT,
      created_at TEXT NOT NULL
    )
  `);

  // Additive only: no UPDATE touches legacy tournament participants, games, protocols,
  // standings, awards or Bogdan's historical tournament rows.
}
