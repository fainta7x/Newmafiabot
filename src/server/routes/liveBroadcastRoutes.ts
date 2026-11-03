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
import { getGame, listEventGames } from '../services/gameService.ts';

const gameRouter = Router();
const publicRouter = Router();

const loadCanonicalBroadcastGame = async (
  req: AuthenticatedRequest,
  gameId: number,
): Promise<CanonicalBroadcastGame | null> => {
  const db = req.db || (await getDb());
  // The game, its seats and the evening's other games through the one «Игра» layer.
  const game = await getGame(db, `club:${gameId}`);
  if (!game || game.eventKind !== 'evening' || !game.eventId || game.status === 'archived' || game.status === 'completed') return null;
  // 10 seats, or 8–9 at a novice table.
  if (!isSupportedTableSize(game.seats.length)) return null;
  const players = game.seats.map((seat) => ({ seat: seat.seat, playerId: seat.playerId, nickname: seat.nickname || `Игрок ${seat.seat}` }));
  if (players.some((player, index) => player.seat !== index + 1)) return null;
  const eveningGames = (await listEventGames(db, 'evening', game.eventId)).filter((other) => other.status !== 'archived');
  // Red and black wins in the evening's other finished games (the score shown on stream).
  const eveningScore = { red: 0, black: 0 };
  for (const other of eveningGames) {
    if (other.key === game.key || other.status !== 'completed' || !other.winner) continue;
    eveningScore[other.winner] += 1;
  }
  return {
    gameId: Number(game.id),
    globalGameNumber: Number(game.number),
    eveningGameNumber: Math.max(1, eveningGames.filter((other) => Number(other.number) <= Number(game.number)).length),
    tableName: game.tableName,
    eveningScore,
    players,
  };
};

const loadCanonicalTournamentBroadcastGame = async (
  req: AuthenticatedRequest,
  tournamentId: string,
  gameId: string,
  options: { forPublish?: boolean } = {},
): Promise<CanonicalBroadcastGame | null> => {
  const db = req.db || (await getDb());
  // Publishing follows the club path: only a game still to be played of a running tournament can go on air, so a
  // controller left open on a finished game or a cancelled / draft tournament cannot overwrite the live picture.
  // The overlay link itself (the config) is available before the tournament starts, to set OBS up in advance.
  const game = await getGame(db, `tournament:${gameId}`);
  if (!game || game.eventId !== tournamentId) return null;
  if (options.forPublish && (game.eventStatus !== 'active' || game.status === 'completed')) return null;
  // Owner, 2026-10-23: the club nickname everywhere in tournaments; the tournament name only for a guest without a profile
  // (the «Игра» layer's seat nickname).
  const players = game.seats.map((seat) => ({ seat: seat.seat, playerId: seat.playerId, nickname: seat.nickname || `Игрок ${seat.seat}` }));
  if (!isSupportedTableSize(players.length)) return null;
  if (players.some((player, index) => player.seat !== index + 1)) return null;
  // Red and black wins in the tournament's other finished games (the score shown on stream)
  const eveningScore = { red: 0, black: 0 };
  for (const other of await listEventGames(db, 'tournament', tournamentId)) {
    if (other.key === game.key || other.status !== 'completed' || !other.winner) continue;
    eveningScore[other.winner] += 1;
  }

  const gameNumber = Math.max(1, Number(game.number || 1));
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
    const game = await loadCanonicalTournamentBroadcastGame(req, tournamentId, gameId, { forPublish: true });
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
