import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { getPlayerSessionId } from '../auth.ts';
import { getRepositoryPlayerAvatarAsset } from '../../lib/playerAvatarManifest.ts';
import { playerLevelAllowsEveningFormat } from '../../db/ensureInviteAudienceSchema.ts';
import { loadPlayerAchievementProfile } from '../services/playerAchievementsService.ts';
import { loadPlayerGameProfile } from '../services/playerProfileService.ts';
import { setParticipantResponse } from '../services/eveningParticipantState.ts';

const router = Router();
const EVENING_RESPONSE_STATUSES = new Set(['going', 'late', 'thinking', 'declined']);

const requirePlayerId = (req: any, res: any): string | null => {
  const playerId = getPlayerSessionId(req);
  if (!playerId) {
    res.status(401).json({ error: 'Player authentication required.' });
    return null;
  }
  return playerId;
};

router.get('/me', async (req, res) => {
  const playerId = requirePlayerId(req, res);
  if (!playerId) return;

  try {
    const db = (req as any).db;
    const player = await db.get(
      `SELECT id, nickname, full_name, telegram_username, elo, tokens, game_level
         FROM players
        WHERE id = ?
        LIMIT 1`,
      [playerId],
    );

    if (!player) {
      return res.status(404).json({ error: 'Player not found.' });
    }

    const [gameProfile, achievements] = await Promise.all([
      loadPlayerGameProfile(db, playerId),
      loadPlayerAchievementProfile(db, playerId, false),
    ]);

    const repositoryAvatar = getRepositoryPlayerAvatarAsset(playerId);
    const allGames = [...gameProfile.clubGames, ...gameProfile.tournamentGames].sort((a, b) => {
      const aTime = a.date ? new Date(a.date).getTime() : 0;
      const bTime = b.date ? new Date(b.date).getTime() : 0;
      return bTime - aTime;
    });

    return res.json({
      player: {
        id: String(player.id),
        nickname: player.nickname,
        full_name: player.full_name ?? null,
        telegram_username: player.telegram_username ?? null,
        elo: Number(player.elo || 0),
        tokens: Number(player.tokens || 0),
        game_level: String(player.game_level || 'club'),
        avatar_url: repositoryAvatar ? `/player-avatars/${encodeURIComponent(repositoryAvatar.file)}` : null,
      },
      achievements,
      games: {
        all: allGames,
        stats: gameProfile.gameStats,
      },
      tournaments: {
        games: gameProfile.tournamentGames,
        awards: gameProfile.tournamentAwards,
        award_stats: gameProfile.awardStats,
        completed_participations: gameProfile.awardTournaments,
      },
    });
  } catch (error: any) {
    return res.status(500).json({ error: 'Database error', message: error?.message || String(error) });
  }
});

router.get('/evenings', async (req, res) => {
  const playerId = requirePlayerId(req, res);
  if (!playerId) return;

  try {
    const db = (req as any).db;
    const player = await db.get(
      'SELECT id, game_level FROM players WHERE id = ? LIMIT 1',
      [playerId],
    );
    if (!player) return res.status(404).json({ error: 'Player not found.' });

    const rows = await db.all(
      `SELECT
         e.id, e.title, e.starts_at, e.ends_at, e.timezone, e.venue,
         e.format, e.status, e.capacity, e.default_price, e.notes,
         ep.response_status, ep.registration_status,
         (SELECT COUNT(*) FROM evening_participants attending
           WHERE attending.evening_id = e.id AND attending.response_status IN ('going', 'late')) AS attending_count,
         (SELECT COUNT(*) FROM evening_participants thinking
           WHERE thinking.evening_id = e.id AND thinking.response_status = 'thinking') AS thinking_count
       FROM game_evenings e
       LEFT JOIN evening_participants ep
         ON ep.evening_id = e.id AND ep.player_id = ?
       WHERE e.status IN ('published', 'active') AND e.settled_at IS NULL
       ORDER BY e.starts_at ASC`,
      [playerId],
    );

    const evenings = rows
      .filter((evening: any) => playerLevelAllowsEveningFormat(player.game_level, evening.format))
      .map((evening: any) => ({
        ...evening,
        response_status: evening.response_status || 'unanswered',
        registration_status: evening.registration_status || 'unanswered',
        attending_count: Number(evening.attending_count || 0),
        thinking_count: Number(evening.thinking_count || 0),
      }));

    return res.json({
      player_id: String(player.id),
      game_level: String(player.game_level || 'club'),
      evenings,
    });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Не удалось загрузить доступные вечера' });
  }
});

router.post('/evenings/:eveningId/respond', async (req, res) => {
  const playerId = requirePlayerId(req, res);
  if (!playerId) return;

  try {
    const db = (req as any).db;
    const responseStatus = String(req.body?.response_status || '').trim();
    if (!EVENING_RESPONSE_STATUSES.has(responseStatus)) {
      return res.status(400).json({ error: 'Недопустимый response_status' });
    }

    const player = await db.get(
      'SELECT id, nickname, game_level FROM players WHERE id = ? LIMIT 1',
      [playerId],
    );
    if (!player) return res.status(404).json({ error: 'Player not found.' });

    const evening = await db.get(
      `SELECT id, title, format, status, settled_at, default_price
         FROM game_evenings
        WHERE id = ?`,
      [req.params.eveningId],
    );
    if (!evening) return res.status(404).json({ error: 'Вечер не найден' });
    if (!['published', 'active'].includes(String(evening.status)) || evening.settled_at) {
      return res.status(409).json({ error: 'Ответы на этот вечер уже недоступны' });
    }
    if (!playerLevelAllowsEveningFormat(player.game_level, evening.format)) {
      return res.status(403).json({ error: 'Этот формат вечера недоступен для вашего игрового уровня' });
    }

    const now = new Date().toISOString();
    const defaultPrice = Math.max(0, Number(evening.default_price || 0));
    await db.run(
      `INSERT OR IGNORE INTO evening_participants (
        id, evening_id, player_id, response_status, registration_status,
        attendance_status, arrival_status, payment_status, amount_due, amount_paid,
        registered_at, created_at, updated_at
      ) VALUES (?, ?, ?, 'unanswered', 'unanswered', 'pending', 'unknown', ?, ?, 0, ?, ?, ?)`,
      [
        randomUUID(),
        evening.id,
        player.id,
        defaultPrice === 0 ? 'waived' : 'unpaid',
        defaultPrice,
        now,
        now,
        now,
      ],
    );

    const participant = await db.get(
      'SELECT id FROM evening_participants WHERE evening_id = ? AND player_id = ?',
      [evening.id, player.id],
    );
    if (!participant) return res.status(500).json({ error: 'Не удалось создать участника вечера' });

    await setParticipantResponse(db, String(participant.id), responseStatus as any);

    return res.json({
      success: true,
      evening_id: String(evening.id),
      response_status: responseStatus,
      registration_status: responseStatus,
    });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Не удалось сохранить ответ на вечер' });
  }
});

export default router;
