import type { DatabaseWrapper } from './index.ts';

export async function ensureWeeklyEveningAutomationSchema(db: DatabaseWrapper): Promise<void> {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS club_weekly_automation_runs (
      automation_key TEXT PRIMARY KEY,
      evening_id TEXT REFERENCES game_evenings(id) ON DELETE CASCADE,
      kind TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      first_due_at TEXT,
      completed_at TEXT,
      last_error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_club_weekly_automation_status
      ON club_weekly_automation_runs(status, updated_at);
  `);
}
