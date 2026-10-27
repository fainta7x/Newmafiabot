import type { DatabaseWrapper } from '../../db/index.ts';
import { sanitizeBroadcastReplayFrames } from '../../lib/liveBroadcast.ts';
import { ensureGameReplayFramesSchema } from '../services/gameReplayFramesStore.ts';

const MIGRATION_NAME = '2026-10-replay-frames-table-v1';

/**
 * One-time move of every club game's `protocol.replay_frames` into `game_replay_frames` (owner «да», 2026-10-27). Each game
 * is moved in the same transaction as its protocol is rewritten, so a frame list is never in neither place; a game whose
 * table row already exists keeps that row (it is the newer one). Everything else in the protocol stays as it was.
 */
export async function moveReplayFramesOutOfProtocols(db: DatabaseWrapper): Promise<{ applied: boolean; moved: number }> {
  const existing = await db.get<{ status?: string }>('SELECT status FROM migration_history WHERE migration_name = ? LIMIT 1', [MIGRATION_NAME]);
  if (existing?.status === 'completed') return { applied: false, moved: 0 };
  await ensureGameReplayFramesSchema(db);
  const rows = await db.all<{ id: number }>(
    `SELECT id FROM games WHERE json_valid(protocol_text) AND json_type(protocol_text, '$.protocol.replay_frames') IS NOT NULL`,
  );
  let moved = 0;
  let frames = 0;
  await db.transaction(async (tx) => {
    for (const { id } of rows) {
      const row = await tx.get<{ protocol_text: string }>('SELECT protocol_text FROM games WHERE id = ? LIMIT 1', [id]);
      let payload: any = null;
      try { payload = row?.protocol_text ? JSON.parse(row.protocol_text) : null; } catch { payload = null; }
      if (!payload?.protocol || !Object.prototype.hasOwnProperty.call(payload.protocol, 'replay_frames')) continue;
      const list = sanitizeBroadcastReplayFrames(payload.protocol.replay_frames);
      if (list.length) {
        await tx.run(
          `INSERT INTO game_replay_frames (game_id, frames_json, updated_at) VALUES (?, ?, ?) ON CONFLICT(game_id) DO NOTHING`,
          [id, JSON.stringify(list), new Date().toISOString()],
        );
        frames += list.length;
      }
      delete payload.protocol.replay_frames;
      await tx.run('UPDATE games SET protocol_text = ? WHERE id = ?', [JSON.stringify(payload), id]);
      moved += 1;
    }
    await tx.run(
      'INSERT INTO migration_history (id, migration_name, status, details_json, executed_at) VALUES (?, ?, ?, ?, ?)',
      [MIGRATION_NAME, MIGRATION_NAME, 'completed', JSON.stringify({ games: moved, frames }), new Date().toISOString()],
    );
  });
  return { applied: true, moved };
}
