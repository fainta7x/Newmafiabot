import type { DatabaseWrapper } from './index.ts';

export async function ensurePlayerBettingSchema(db: DatabaseWrapper): Promise<void> {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS betting_pools (
      id TEXT PRIMARY KEY,
      game_id INTEGER NOT NULL UNIQUE,
      game_number INTEGER,
      game_date TEXT,
      judge_player_id TEXT,
      status TEXT NOT NULL DEFAULT 'open',
      opens_at TEXT NOT NULL,
      closes_at TEXT NOT NULL,
      role_snapshot_json TEXT NOT NULL,
      house_rate_bps INTEGER NOT NULL DEFAULT 1000,
      max_coefficient REAL NOT NULL DEFAULT 10.0,
      red_pool INTEGER NOT NULL DEFAULT 0,
      black_pool INTEGER NOT NULL DEFAULT 0,
      settlement_seq INTEGER NOT NULL DEFAULT 0,
      settled_winner TEXT,
      reserve_amount INTEGER NOT NULL DEFAULT 0,
      settled_at TEXT,
      notified_at TEXT,
      notification_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS betting_bets (
      id TEXT PRIMARY KEY,
      pool_id TEXT NOT NULL REFERENCES betting_pools(id) ON DELETE CASCADE,
      game_id INTEGER NOT NULL,
      player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      team TEXT NOT NULL,
      amount INTEGER NOT NULL,
      request_id TEXT NOT NULL,
      stake_ledger_entry_id TEXT,
      status TEXT NOT NULL DEFAULT 'placed',
      payout_amount INTEGER NOT NULL DEFAULT 0,
      payout_ledger_entry_id TEXT,
      final_coefficient REAL,
      placed_at TEXT NOT NULL,
      settled_at TEXT,
      UNIQUE(game_id, player_id),
      UNIQUE(player_id, request_id)
    );

    CREATE INDEX IF NOT EXISTS idx_betting_pools_status_close
      ON betting_pools(status, closes_at DESC);
    CREATE INDEX IF NOT EXISTS idx_betting_bets_player_date
      ON betting_bets(player_id, placed_at DESC);
    CREATE INDEX IF NOT EXISTS idx_betting_bets_pool_team
      ON betting_bets(pool_id, team, placed_at ASC);
  `);
}
