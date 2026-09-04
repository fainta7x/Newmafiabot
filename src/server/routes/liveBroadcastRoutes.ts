import { Router, type Request } from 'express';
import { getDb } from '../../db/index.ts';
import { requireOrganizerAuth, type AuthenticatedRequest } from '../auth.ts';
import { getRepositoryPlayerAvatarAsset } from '../../lib/playerAvatarManifest.ts';
import {
  getLiveBroadcastToken,
  isValidLiveBroadcastToken,
  normalizeLiveBroadcastState,
  publishLiveBroadcastState,
  readLiveBroadcastEnvelope,
  type CanonicalBroadcastGame,
} from '../services/liveBroadcastService.ts';

const gameRouter = Router();
const publicRouter = Router();

const parseProtocol = (value: unknown): Record<string, any> | null => {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

const loadCanonicalBroadcastGame = async (
  req: AuthenticatedRequest,
  gameId: number,
): Promise<CanonicalBroadcastGame | null> => {
  const db = req.db || (await getDb());
  const row = await db.get<any>(`
    SELECT g.id, g.evening_id, g.global_game_number, g.protocol_text, g.archived_at,
           et.name AS table_name,
           (SELECT COUNT(*)
              FROM games prior
             WHERE prior.evening_id = g.evening_id
               AND prior.archived_at IS NULL
               AND prior.global_game_number <= g.global_game_number) AS evening_game_number
      FROM games g
 LEFT JOIN evening_tables et ON et.id = g.evening_table_id
     WHERE g.id = ?
     LIMIT 1
  `, [gameId]);
  if (!row || !row.evening_id || row.archived_at) return null;

  const protocol = parseProtocol(row.protocol_text);
  const results = Array.isArray(protocol?.player_results) ? protocol.player_results : [];
  if (protocol?.kind !== 'club_evening_protocol' || results.length !== 10) return null;

  const players = results
    .map((player: any) => ({
      seat: Number(player.seat_number),
      playerId: player.player_id ? String(player.player_id) : null,
      nickname: String(player.display_name || `Игрок ${player.seat_number}`),
    }))
    .sort((left: any, right: any) => left.seat - right.seat);

  if (players.some((player: any, index: number) => player.seat !== index + 1)) return null;
  return {
    gameId: Number(row.id),
    globalGameNumber: Number(row.global_game_number),
    eveningGameNumber: Math.max(1, Number(row.evening_game_number || 1)),
    tableName: row.table_name ? String(row.table_name) : null,
    players,
  };
};

const publicOrigin = (req: Request): string => {
  const configured = String(process.env.PLAYER_APP_URL || '').trim().replace(/\/+$/, '');
  if (configured) return configured;
  return `${req.protocol}://${req.get('host')}`;
};

gameRouter.get('/:gameId/broadcast-config', requireOrganizerAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const gameId = Number(req.params.gameId);
    if (!Number.isInteger(gameId) || gameId <= 0) return res.status(400).json({ error: 'Некорректный ID игры' });
    const game = await loadCanonicalBroadcastGame(req, gameId);
    if (!game) return res.status(404).json({ error: 'Активная клубная игра для трансляции не найдена' });

    const token = getLiveBroadcastToken();
    const overlayPath = `/broadcast/${encodeURIComponent(token)}`;
    return res.json({
      overlay_url: `${publicOrigin(req)}${overlayPath}`,
      overlay_path: overlayPath,
      width: 1920,
      height: 1080,
      game_id: game.gameId,
    });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Не удалось подготовить OBS-ссылку' });
  }
});

gameRouter.put('/:gameId/broadcast-state', requireOrganizerAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const gameId = Number(req.params.gameId);
    if (!Number.isInteger(gameId) || gameId <= 0) return res.status(400).json({ error: 'Некорректный ID игры' });
    const game = await loadCanonicalBroadcastGame(req, gameId);
    if (!game) return res.status(404).json({ error: 'Активная клубная игра для трансляции не найдена' });

    const receivedAt = new Date();
    const state = normalizeLiveBroadcastState(req.body?.state, game, receivedAt);
    if (!state) return res.status(400).json({ error: 'Некорректное состояние Live Game для трансляции' });
    publishLiveBroadcastState(state, receivedAt.getTime());
    return res.status(202).json({ ok: true, received_at: receivedAt.toISOString() });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Не удалось обновить OBS-трансляцию' });
  }
});

publicRouter.get('/broadcast/:token', (req, res) => {
  if (!isValidLiveBroadcastToken(String(req.params.token || ''))) {
    return res.status(404).json({ error: 'Трансляция не найдена' });
  }
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  return res.json(readLiveBroadcastEnvelope());
});

publicRouter.get('/broadcast/:token/avatar/:playerId', async (req: AuthenticatedRequest, res) => {
  if (!isValidLiveBroadcastToken(String(req.params.token || ''))) {
    return res.status(404).end();
  }
  try {
    const db = req.db || (await getDb());
    const playerId = String(req.params.playerId || '');
    const broadcastPlayer = readLiveBroadcastEnvelope().state?.players
      .some((player) => player.playerId === playerId);
    if (!broadcastPlayer) return res.status(404).end();
    const avatar = await db.get<any>(
      'SELECT mime_type, image_data FROM player_avatars WHERE player_id = ? LIMIT 1',
      [playerId],
    );
    if (avatar?.image_data != null) {
      const bytes = Buffer.isBuffer(avatar.image_data)
        ? avatar.image_data
        : avatar.image_data instanceof Uint8Array
          ? Buffer.from(avatar.image_data)
          : Buffer.from(String(avatar.image_data), 'base64');
      res.setHeader('Cache-Control', 'private, max-age=3600');
      res.type(String(avatar.mime_type || 'image/jpeg'));
      return res.send(bytes);
    }

    const suppressed = await db.get(
      'SELECT 1 AS suppressed FROM player_avatar_repository_suppression WHERE player_id = ? LIMIT 1',
      [playerId],
    );
    const asset = suppressed ? null : getRepositoryPlayerAvatarAsset(playerId);
    if (!asset) return res.status(404).end();
    res.setHeader('Cache-Control', 'private, max-age=3600');
    return res.redirect(302, `/player-avatars/${encodeURIComponent(asset.file)}`);
  } catch {
    return res.status(404).end();
  }
});

export { gameRouter as liveBroadcastGameRoutes, publicRouter as liveBroadcastPublicRoutes };
