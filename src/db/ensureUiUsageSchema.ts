import type { DatabaseWrapper } from './index.ts';

const ensured = new WeakSet<object>();

// Table of UI usage events (see uiUsageService.ts for what is stored and why).
export async function ensureUiUsageSchema(db: DatabaseWrapper) {
  if (ensured.has(db)) return;
  await db.run(`
    CREATE TABLE IF NOT EXISTS ui_usage_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at TEXT NOT NULL,
      session_key TEXT NOT NULL,
      surface TEXT NOT NULL,
      role TEXT NOT NULL,
      kind TEXT NOT NULL,
      name TEXT NOT NULL
    )
  `);
  await db.run('CREATE INDEX IF NOT EXISTS idx_ui_usage_events_created ON ui_usage_events(created_at)');
  const columns = await db.all<{ name: string }>('PRAGMA table_info(ui_usage_events)');
  if (!columns.some((column) => column.name === 'player_id')) await db.run('ALTER TABLE ui_usage_events ADD COLUMN player_id TEXT');
  await db.run('CREATE INDEX IF NOT EXISTS idx_ui_usage_events_player ON ui_usage_events(player_id, created_at)');
  ensured.add(db);
}
