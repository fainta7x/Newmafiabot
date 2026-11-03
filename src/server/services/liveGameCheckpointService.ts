import type { DatabaseWrapper } from '../../db/index.ts';
import { oncePerDatabase } from '../../db/oncePerDatabase.ts';

/**
 * «Продолжить игру» (owner, 2026-11-03; AR04 step 2): the server copy of a running game's live engine session, so a game
 * can be continued on another device when the judge's device lost its own copy. ONE mechanism for every game: the key is
 * the engine's own session key — `club:<id>` for a game of an evening (club, novice, rating) and `tournament:<id>`.
 * The device stays the owner of the session; the server keeps the latest copy it was sent. A finished game has none.
 */
export type LiveGameKind = 'club' | 'tournament';
export type LiveGameCheckpoint = {
  session: string;
  evidence?: string | null;
  death_protocols?: string | null;
  notes?: string | null;
};

export const MAX_CHECKPOINT_CHARS = 1_500_000;
export const liveGameKey = (kind: LiveGameKind, id: string | number) => `${kind}:${String(id)}`;
export const parseLiveGameKind = (value: unknown): LiveGameKind | null => (value === 'club' || value === 'tournament' ? value : null);

export const ensureLiveGameCheckpointSchema = oncePerDatabase(async (db: DatabaseWrapper): Promise<void> => {
  await db.exec(`CREATE TABLE IF NOT EXISTS live_game_checkpoints (
    game_key TEXT PRIMARY KEY,
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

/** null = no such game; true = finished (or archived); false = running or not started. */
const gameIsFinished = async (db: DatabaseWrapper, kind: LiveGameKind, id: string): Promise<boolean | null> => {
  if (kind === 'tournament') {
    const row = await db.get<any>('SELECT status FROM tournament_games WHERE id = ?', [id]);
    return row ? row.status === 'completed' : null;
  }
  const row = await db.get<any>(`SELECT archived_at,
      CASE WHEN json_valid(protocol_text) THEN json_extract(protocol_text, '$.protocol.status') END AS status
    FROM games WHERE id = ?`, [Number(id)]);
  if (!row) return null;
  return Boolean(row.archived_at) || row.status === 'completed';
};

export async function saveLiveGameCheckpoint(db: DatabaseWrapper, kind: LiveGameKind, id: string | number, checkpoint: LiveGameCheckpoint): Promise<'saved' | 'missing' | 'finished'> {
  await ensureLiveGameCheckpointSchema(db);
  const finished = await gameIsFinished(db, kind, String(id));
  if (finished === null) return 'missing';
  if (finished) return 'finished';
  await db.run(`INSERT INTO live_game_checkpoints (game_key, payload, saved_at) VALUES (?, ?, ?)
    ON CONFLICT(game_key) DO UPDATE SET payload = excluded.payload, saved_at = excluded.saved_at`,
  [liveGameKey(kind, id), JSON.stringify(checkpoint), new Date().toISOString()]);
  return 'saved';
}

export async function loadLiveGameCheckpoint(db: DatabaseWrapper, kind: LiveGameKind, id: string | number): Promise<(LiveGameCheckpoint & { saved_at: string }) | null> {
  await ensureLiveGameCheckpointSchema(db);
  if ((await gameIsFinished(db, kind, String(id))) !== false) return null;
  const row = await db.get<any>('SELECT payload, saved_at FROM live_game_checkpoints WHERE game_key = ?', [liveGameKey(kind, id)]);
  if (!row) return null;
  try {
    const checkpoint = normalizeCheckpoint(JSON.parse(String(row.payload)));
    return checkpoint ? { ...checkpoint, saved_at: String(row.saved_at) } : null;
  } catch {
    return null;
  }
}

export async function clearLiveGameCheckpoint(db: DatabaseWrapper, kind: LiveGameKind, id: string | number): Promise<void> {
  await ensureLiveGameCheckpointSchema(db);
  await db.run('DELETE FROM live_game_checkpoints WHERE game_key = ?', [liveGameKey(kind, id)]);
}
