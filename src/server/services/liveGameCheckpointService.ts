import type { DatabaseWrapper } from '../../db/index.ts';
import { oncePerDatabase } from '../../db/oncePerDatabase.ts';
import { isFinishedGameStatus, parseGameKey, type GameKey } from '../../shared/game.ts';
import { getGame } from './gameService.ts';
import { randomUUID } from 'node:crypto';

/**
 * «Продолжить игру» (owner, 2026-11-03; AR04 step 2) for EVERY game through the one «Игра» layer: the server copy of a
 * running game's live engine session, keyed by the game key (`club:<id>`, `tournament:<id>`) — the same key the engine
 * uses for its own session. The device stays the owner of the session; the server keeps the latest copy it was sent.
 * A finished game (completed, cancelled, archived — `isFinishedGameStatus`) has no copy.
 */
export type LiveGameCheckpoint = {
  session: string;
  evidence?: string | null;
  death_protocols?: string | null;
  notes?: string | null;
};

export const MAX_CHECKPOINT_CHARS = 1_500_000;

export const ensureLiveGameCheckpointSchema = oncePerDatabase(async (db: DatabaseWrapper): Promise<void> => {
  const columns = await db.all<any>('PRAGMA table_info(live_game_checkpoints)');
  if (columns.some((column: any) => column.name === 'game_id')) {
    // The first version (club games only) keyed by games.id: move its copies to the game key once.
    await db.exec(`CREATE TABLE live_game_checkpoints_by_key (game_key TEXT PRIMARY KEY, payload TEXT NOT NULL, saved_at TEXT NOT NULL);
      INSERT OR IGNORE INTO live_game_checkpoints_by_key (game_key, payload, saved_at) SELECT 'club:' || game_id, payload, saved_at FROM live_game_checkpoints;
      DROP TABLE live_game_checkpoints;
      ALTER TABLE live_game_checkpoints_by_key RENAME TO live_game_checkpoints;`);
  }
  await db.exec(`CREATE TABLE IF NOT EXISTS live_game_checkpoints (
    game_key TEXT PRIMARY KEY,
    payload TEXT NOT NULL,
    saved_at TEXT NOT NULL
  )`);
  const currentColumns = await db.all<any>('PRAGMA table_info(live_game_checkpoints)');
  if (!currentColumns.some(column => column.name === 'revision')) {
    await db.exec("ALTER TABLE live_game_checkpoints ADD COLUMN revision TEXT NOT NULL DEFAULT ''");
  }
  await db.run("UPDATE live_game_checkpoints SET revision = lower(hex(randomblob(16))) WHERE revision = ''");
});

const asText = (value: unknown): string | null => (typeof value === 'string' ? value : null);

export function normalizeCheckpoint(input: unknown): LiveGameCheckpoint | null {
  if (!input || typeof input !== 'object') return null;
  const body = input as Record<string, unknown>;
  const session = asText(body.session);
  if (!session) return null;
  try {
    const parsed = JSON.parse(session);
    if (!parsed || typeof parsed !== 'object' || !parsed.phase || parsed.phase === 'setup' || !Array.isArray(parsed.activePlayers)) return null;
  } catch {
    return null;
  }
  const checkpoint = { session, evidence: asText(body.evidence), death_protocols: asText(body.death_protocols), notes: asText(body.notes) };
  return JSON.stringify(checkpoint).length > MAX_CHECKPOINT_CHARS ? null : checkpoint;
}

export async function saveLiveGameCheckpoint(db: DatabaseWrapper, key: string, checkpoint: LiveGameCheckpoint, expectedRevision: string | null = null): Promise<{ status: 'saved'; revision: string } | { status: 'missing' } | { status: 'finished' } | { status: 'conflict' }> {
  await ensureLiveGameCheckpointSchema(db);
  return db.transaction(async tx => {
    const game = parseGameKey(key) ? await getGame(tx, key) : null;
    if (!game) return { status: 'missing' };
    if (isFinishedGameStatus(game.status)) return { status: 'finished' };
    const revision = randomUUID();
    const values = [JSON.stringify(checkpoint), new Date().toISOString(), revision];
    const written = expectedRevision === null
      ? await tx.run('INSERT OR IGNORE INTO live_game_checkpoints (payload,saved_at,revision,game_key) VALUES (?,?,?,?)', [...values, game.key])
      : await tx.run('UPDATE live_game_checkpoints SET payload=?,saved_at=?,revision=? WHERE game_key=? AND revision=?', [...values, game.key, expectedRevision]);
    return written.changes ? { status: 'saved', revision } : { status: 'conflict' };
  });
}

export async function loadLiveGameCheckpoint(db: DatabaseWrapper, key: string): Promise<(LiveGameCheckpoint & { saved_at: string; revision: string }) | null> {
  await ensureLiveGameCheckpointSchema(db);
  const game = parseGameKey(key) ? await getGame(db, key) : null;
  if (!game || isFinishedGameStatus(game.status)) return null;
  const row = await db.get<any>('SELECT payload, saved_at, revision FROM live_game_checkpoints WHERE game_key = ?', [game.key]);
  if (!row) return null;
  try {
    const checkpoint = normalizeCheckpoint(JSON.parse(String(row.payload)));
    return checkpoint ? { ...checkpoint, saved_at: String(row.saved_at), revision: String(row.revision) } : null;
  } catch {
    return null;
  }
}

/** Called when a game's protocol is saved as completed (both save paths). */
export async function clearLiveGameCheckpoint(db: DatabaseWrapper, key: GameKey | string): Promise<void> {
  await ensureLiveGameCheckpointSchema(db);
  await db.run('DELETE FROM live_game_checkpoints WHERE game_key = ?', [key]);
}
