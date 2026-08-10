import type { DatabaseWrapper } from './index.ts';

export async function ensureRatingPeriodsSchema(db: DatabaseWrapper): Promise<void> {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS rating_periods (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      type TEXT NOT NULL,
      starts_at TEXT NOT NULL,
      ends_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      auto_include INTEGER NOT NULL DEFAULT 1,
      notes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS rating_period_evening_overrides (
      period_id TEXT NOT NULL REFERENCES rating_periods(id) ON DELETE CASCADE,
      evening_id TEXT NOT NULL REFERENCES game_evenings(id) ON DELETE CASCADE,
      included INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (period_id, evening_id)
    );

    CREATE TABLE IF NOT EXISTS rating_period_game_overrides (
      period_id TEXT NOT NULL REFERENCES rating_periods(id) ON DELETE CASCADE,
      game_id INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
      included INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (period_id, game_id)
    );

    CREATE INDEX IF NOT EXISTS idx_rating_periods_dates
      ON rating_periods(starts_at, ends_at);
    CREATE INDEX IF NOT EXISTS idx_rating_period_evening_overrides_evening
      ON rating_period_evening_overrides(evening_id);
    CREATE INDEX IF NOT EXISTS idx_rating_period_game_overrides_game
      ON rating_period_game_overrides(game_id);
  `);
}
