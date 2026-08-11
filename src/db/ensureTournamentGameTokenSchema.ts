import type { DatabaseWrapper } from './index.ts';

export async function ensureTournamentGameTokenSchema(db: DatabaseWrapper): Promise<void> {
  await db.run(`
    CREATE TABLE IF NOT EXISTS tournament_game_token_settlements (
      game_id TEXT NOT NULL,
      subject_type TEXT NOT NULL,
      player_id TEXT NOT NULL,
      target_amount INTEGER NOT NULL DEFAULT 0,
      revision INTEGER NOT NULL DEFAULT 0,
      breakdown_json TEXT,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (game_id, subject_type, player_id)
    )
  `);
  await db.run('CREATE INDEX IF NOT EXISTS idx_tournament_game_token_player ON tournament_game_token_settlements(player_id)');
}
