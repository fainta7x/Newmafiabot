import type { DatabaseWrapper } from './index.ts';
import { ACHIEVEMENTS } from '../lib/achievementCatalog.ts';
import { ensureEveningSlotsSchema } from './ensureEveningSlotsSchema.ts';

export async function ensureAdminDataSchema(db: DatabaseWrapper): Promise<void> {
  await ensureEveningSlotsSchema(db);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS achievement_definitions (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      icon TEXT NOT NULL,
      category TEXT NOT NULL,
      metric TEXT NOT NULL,
      threshold REAL NOT NULL,
      role TEXT,
      rarity TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS player_achievement_overrides (
      player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      achievement_id TEXT NOT NULL REFERENCES achievement_definitions(id) ON DELETE CASCADE,
      state TEXT NOT NULL CHECK(state IN ('grant', 'revoke')),
      note TEXT,
      updated_at TEXT NOT NULL,
      PRIMARY KEY(player_id, achievement_id)
    );

    CREATE TABLE IF NOT EXISTS admin_change_log (
      id TEXT PRIMARY KEY,
      entity_type TEXT NOT NULL,
      entity_id TEXT,
      action TEXT NOT NULL,
      field_name TEXT,
      before_json TEXT,
      after_json TEXT,
      note TEXT,
      actor_type TEXT NOT NULL DEFAULT 'organizer',
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_achievement_definitions_active_order
      ON achievement_definitions(active, sort_order, id);
    CREATE INDEX IF NOT EXISTS idx_achievement_overrides_player
      ON player_achievement_overrides(player_id, achievement_id);
    CREATE INDEX IF NOT EXISTS idx_admin_change_log_created
      ON admin_change_log(created_at DESC, id DESC);
  `);

  const now = new Date().toISOString();
  for (const achievement of ACHIEVEMENTS) {
    await db.run(
      `INSERT INTO achievement_definitions (
         id, name, description, icon, category, metric, threshold, role,
         rarity, sort_order, active, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
       ON CONFLICT(id) DO NOTHING`,
      [
        achievement.id,
        achievement.name,
        achievement.description,
        achievement.icon,
        achievement.category,
        achievement.metric,
        achievement.threshold,
        achievement.role || null,
        achievement.rarity,
        achievement.order,
        now,
        now,
      ],
    );
  }
}
