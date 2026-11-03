import type { DatabaseWrapper } from '../../db/index.ts';
import { oncePerDatabase } from '../../db/oncePerDatabase.ts';

/**
 * «Продолжить игру» (owner, 2026-11-03; AR04 step 2): the server copy of a club game's live engine session, so a game
 * can be continued on another device when the judge's device lost its own copy. The device stays the owner of the
 * session: the server only keeps the latest copy it was sent and gives it back. A finished game has no copy.
 */
export type LiveGameCheckpoint = {
  /** The device keys of the session, as the club recorder keeps them (session, protocol evidence, death protocols, notes). */
  session: string;
  evidence?: string | null;
  death_protocols?: string | null;
  notes?: string | null;
};

export const MAX_CHECKPOINT_CHARS = 1_500_000;

export const ensureLiveGameCheckpointSchema = oncePerDatabase(async (db: DatabaseWrapper): Promise<void> => {
  await db.exec(`CREATE TABLE IF NOT EXISTS live_game_checkpoints (
    game_id INTEGER PRIMARY KEY,
    payload TEXT NOT NULL,
    saved_at TEXT NOT NULL
  )`);
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

const gameIsFinished = async (db: DatabaseWrapper, gameId: number) => {
  const row = await db.get<any>(`SELECT archived_at,
      CASE WHEN json_valid(protocol_text) THEN json_extract(protocol_text, '$.protocol.status') END AS status
    FROM games WHERE id = ?`, [gameId]);
  if (!row) return null;
  return Boolean(row.archived_at) || row.status === 'completed';
};

export async function saveLiveGameCheckpoint(db: DatabaseWrapper, gameId: number, checkpoint: LiveGameCheckpoint): Promise<'saved' | 'missing' | 'finished'> {
  await ensureLiveGameCheckpointSchema(db);
  const finished = await gameIsFinished(db, gameId);
  if (finished === null) return 'missing';
  if (finished) return 'finished';
  await db.run(`INSERT INTO live_game_checkpoints (game_id, payload, saved_at) VALUES (?, ?, ?)
    ON CONFLICT(game_id) DO UPDATE SET payload = excluded.payload, saved_at = excluded.saved_at`,
  [gameId, JSON.stringify(checkpoint), new Date().toISOString()]);
  return 'saved';
}

export async function loadLiveGameCheckpoint(db: DatabaseWrapper, gameId: number): Promise<(LiveGameCheckpoint & { saved_at: string }) | null> {
  await ensureLiveGameCheckpointSchema(db);
  if ((await gameIsFinished(db, gameId)) !== false) return null;
  const row = await db.get<any>('SELECT payload, saved_at FROM live_game_checkpoints WHERE game_id = ?', [gameId]);
  if (!row) return null;
  try {
    const checkpoint = normalizeCheckpoint(JSON.parse(String(row.payload)));
    return checkpoint ? { ...checkpoint, saved_at: String(row.saved_at) } : null;
  } catch {
    return null;
  }
}

export async function clearLiveGameCheckpoint(db: DatabaseWrapper, gameId: number): Promise<void> {
  await ensureLiveGameCheckpointSchema(db);
  await db.run('DELETE FROM live_game_checkpoints WHERE game_id = ?', [gameId]);
}
