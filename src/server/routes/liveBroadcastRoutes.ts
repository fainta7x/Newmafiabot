import { Router, type Request } from 'express';
import { isSupportedTableSize } from '../../lib/tableComposition.ts';
import { getDb } from '../../db/index.ts';
import { requireOrganizerAuth, type AuthenticatedRequest } from '../auth.ts';
import { getRepositoryPlayerAvatarAsset } from '../../lib/playerAvatarManifest.ts';
import {
  getLiveBroadcastToken,
  isValidLiveBroadcastToken,
  normalizeLiveBroadcastState,
  publishLiveBroadcastState,
  readLiveBroadcastEnvelope,
  readLiveBroadcastLayout,
  saveLiveBroadcastLayout,
  type CanonicalBroadcastGame,
} from '../services/liveBroadcastService.ts';
import { broadcastLobbyPlayerIds, loadBroadcastLobby } from '../services/broadcastLobbyService.ts';

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
  if (
    protocol?.kind !== 'club_evening_protocol'
    || protocol?.protocol?.status === 'completed'
    // 10 seats, or 8–9 at a novice table.
    || !isSupportedTableSize(results.length)
  ) return null;

  const players = results
    .map((player: any) => ({
      seat: Number(player.seat_number),
      playerId: player.player_id ? String(player.player_id) : null,
      nickname: String(player.display_name || `Игрок ${player.seat_number}`),
    }))
    .sort((left: any, right: any) => left.seat - right.seat);

  if (players.some((player: any, index: number) => player.seat !== index + 1)) return null;
  // Red and black wins in the evening's other finished games (the score shown on stream).
  const eveningGames = await db.all<any>('SELECT id, protocol_text FROM games WHERE evening_id = ? AND archived_at IS NULL AND id <> ?', [row.evening_id, row.id]);
  const eveningScore = { red: 0, black: 0 };
  for (const other of eveningGames) {
    const finished = parseProtocol(other.protocol_text);
    if (finished?.protocol?.status !== 'completed') continue;
    if (finished.protocol.winner_team === 'red') eveningScore.red += 1;
    if (finished.protocol.winner_team === 'black') eveningScore.black += 1;
  }
  return {
    gameId: Number(row.id),
    globalGameNumber: Number(row.global_game_number),
    eveningGameNumber: Math.max(1, Number(row.evening_game_number || 1)),
    tableName: row.table_name ? String(row.table_name) : null,
    eveningScore,
    players,
  };
};

const loadCanonicalTournamentBroadcastGame = async (
  req: AuthenticatedRequest,
  tournamentId: string,
  gameId: string,
): Promise<CanonicalBroadcastGame | null> => {
  const db = req.db || (await getDb());
  const game = await db.get<any>(`
    SELECT id, game_number
      FROM tournament_games
     WHERE id = ? AND tournament_id = ?
     LIMIT 1
  `, [gameId, tournamentId]);
  if (!game) return null;

  const rows = await db.all<any>(`
    SELECT tgs.seat_number,
           tp.player_id,
           tp.display_name,
           p.nickname AS club_nickname
      FROM tournament_game_seats tgs
      JOIN tournament_participants tp ON tp.id = tgs.participant_id
 LEFT JOIN players p ON p.id = tp.player_id
     WHERE tgs.game_id = ?
     ORDER BY tgs.seat_number ASC
  `, [gameId]);

  const players = rows.map((player: any) => ({
    seat: Number(player.seat_number),
    playerId: player.player_id ? String(player.player_id) : null,
    nickname: String(player.display_name || player.club_nickname || `Игрок ${player.seat_number}`),
  }));

  if (!isSupportedTableSize(players.length)) return null;
  if (players.some((player: any, index: number) => player.seat !== index + 1)) return null;

  // Red and black wins in the tournament's other finished games (the score shown on stream)
  const finishedGames = await db.all<any>(
    "SELECT winner_team FROM tournament_games WHERE tournament_id = ? AND status = 'completed' AND id <> ?",
    [tournamentId, gameId],
  );
  const eveningScore = {
    red: finishedGames.filter((finished: any) => finished.winner_team === 'red').length,
    black: finishedGames.filter((finished: any) => finished.winner_team === 'black').length,
  };

  const gameNumber = Math.max(1, Number(game.game_number || 1));
  return {
    gameId: gameNumber,
    globalGameNumber: gameNumber,
    eveningGameNumber: gameNumber,
    tableName: 'Турнир',
    eveningScore,
    players,
  };
};

const publicOrigin = (req: Request): string => {
  const configured = String(process.env.PLAYER_APP_URL || '').trim().replace(/\/+$/, '');
  if (configured) return configured;
  return `${req.protocol}://${req.get('host')}`;
};

// Avatar image requests arrive in a burst when OBS opens a scene. Cache the allowed IDs briefly so
// twenty images do not recalculate the whole tournament table twenty times at once.
let avatarAccessCache: { db: unknown; expiresAt: number; promise: Promise<Set<string>> } | null = null;
const getIntermissionAvatarPlayerIds = async (db: any) => {
  const now = Date.now();
  if (avatarAccessCache && avatarAccessCache.db === db && avatarAccessCache.expiresAt > now) {
    return avatarAccessCache.promise;
  }
  const promise = loadBroadcastLobby(db, now).then(broadcastLobbyPlayerIds);
  avatarAccessCache = { db, expiresAt: now + 5_000, promise };
  try {
    return await promise;
  } catch (error) {
    if (avatarAccessCache?.promise === promise) avatarAccessCache = null;
    throw error;
  }
};

// Overlay sizes and visibility, changed live from «OBS и трансляция» (owner, 2026-10-01).
gameRouter.get('/broadcast-overlay-layout', requireOrganizerAuth, async (req: AuthenticatedRequest, res) => {
  const db = req.db || (await getDb());
  return res.json({ layout: await readLiveBroadcastLayout(db) });
});

gameRouter.put('/broadcast-overlay-layout', requireOrganizerAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const db = req.db || (await getDb());
    return res.json({ layout: await saveLiveBroadcastLayout(db, req.body?.layout) });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Не удалось сохранить размеры графики' });
  }
});

gameRouter.put('/tournament/:tournamentId/:gameId/broadcast-state', requireOrganizerAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const tournamentId = String(req.params.tournamentId || '');
    const gameId = String(req.params.gameId || '');
    if (!tournamentId || !gameId) return res.status(400).json({ error: 'Турнирная игра не найдена' });
    const game = await loadCanonicalTournamentBroadcastGame(req, tournamentId, gameId);
    if (!game) return res.status(404).json({ error: 'Активная турнирная игра для трансляции не найдена' });

    const receivedAt = new Date();
    const state = normalizeLiveBroadcastState(req.body?.state, game, receivedAt);
    if (!state) return res.status(400).json({ error: 'Некорректное состояние Live Game для трансляции' });
    publishLiveBroadcastState(state, receivedAt.getTime());
    return res.status(202).json({ ok: true, received_at: receivedAt.toISOString() });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Не удалось обновить турнирную OBS-трансляцию' });
  }
});

gameRouter.get('/tournament/:tournamentId/:gameId/broadcast-config', requireOrganizerAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const tournamentId = String(req.params.tournamentId || '');
    const gameId = String(req.params.gameId || '');
    const game = await loadCanonicalTournamentBroadcastGame(req, tournamentId, gameId);
    if (!game) return res.status(404).json({ error: 'Активная турнирная игра для трансляции не найдена' });
    const overlayPath = `/broadcast/${encodeURIComponent(getLiveBroadcastToken())}`;
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

gameRouter.get('/:gameId/broadcast-config', requireOrganizerAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const gameId = Number(req.params.gameId);
    if (!Number.isInteger(gameId) || gameId <= 0) return res.status(400).json({ error: 'Игра не найдена' });
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
    if (!Number.isInteger(gameId) || gameId <= 0) return res.status(400).json({ error: 'Игра не найдена' });
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

publicRouter.get('/broadcast/:token', async (req: AuthenticatedRequest, res) => {
  if (!isValidLiveBroadcastToken(String(req.params.token || ''))) {
    return res.status(404).json({ error: 'Трансляция не найдена' });
  }
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  const db = req.db || (await getDb());
  return res.json({ ...readLiveBroadcastEnvelope(), layout: await readLiveBroadcastLayout(db) });
});

// «Заставка» / «Итоги» scenes: the next game's seating and the tournament table, by the same secret link.
publicRouter.get('/broadcast/:token/lobby', async (req: AuthenticatedRequest, res) => {
  if (!isValidLiveBroadcastToken(String(req.params.token || ''))) {
    return res.status(404).json({ error: 'Трансляция не найдена' });
  }
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  const db = req.db || (await getDb());
  return res.json(await loadBroadcastLobby(db));
});

publicRouter.get('/broadcast/:token/avatar/:playerId', async (req: AuthenticatedRequest, res) => {
  if (!isValidLiveBroadcastToken(String(req.params.token || ''))) {
    return res.status(404).end();
  }
  try {
    const db = req.db || (await getDb());
    const playerId = String(req.params.playerId || '');
    const livePlayer = readLiveBroadcastEnvelope().state?.players
      .some((player) => player.playerId === playerId) === true;
    const intermissionPlayers = livePlayer ? null : await getIntermissionAvatarPlayerIds(db);
    if (!livePlayer && !intermissionPlayers?.has(playerId)) return res.status(404).end();

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
