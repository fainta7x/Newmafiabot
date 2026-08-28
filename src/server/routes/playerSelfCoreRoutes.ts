import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { getPlayerSessionId } from '../auth.ts';
import { getRepositoryPlayerAvatarAsset } from '../../lib/playerAvatarManifest.ts';
import { playerLevelAllowsEveningFormat } from '../../db/ensureInviteAudienceSchema.ts';
import { loadPlayerAchievementProfile } from '../services/playerAchievementsService.ts';
import { loadPlayerGameProfile } from '../services/playerProfileService.ts';
import { setParticipantResponse } from '../services/eveningParticipantState.ts';
import { getEveningResponse } from '../../lib/eveningResponse.ts';

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

const repositoryAvatarAvailable = (playerId: string, suppressed: unknown) =>
  !Number(suppressed || 0) && Boolean(getRepositoryPlayerAvatarAsset(playerId));

const playerAvatarUrl = (playerId: string, hasDbAvatar: unknown, suppressed: unknown) =>
  Number(hasDbAvatar || 0) || repositoryAvatarAvailable(playerId, suppressed)
    ? `/api/player/players/${encodeURIComponent(playerId)}/avatar`
    : null;

const safeJsonParse = (value: unknown): any => {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

const normalizeWinner = (value: unknown): 'red' | 'black' | null => {
  const normalized = String(value || '').trim().toLocaleLowerCase('ru-RU').replace(/ё/g, 'е');
  if (['red', 'красные', 'красная', 'город'].includes(normalized)) return 'red';
  if (['black', 'черные', 'черная', 'мафия'].includes(normalized)) return 'black';
  return null;
};

router.get('/me', async (req, res) => {
  const playerId = requirePlayerId(req, res);
  if (!playerId) return;

  try {
    const db = req.db;
    const player = await db.get(
      `SELECT id, nickname, full_name, phone, telegram_username, elo, tokens, game_level, club_role, judge_level,
              EXISTS(SELECT 1 FROM player_avatars pa WHERE pa.player_id = players.id) AS has_db_avatar,
              EXISTS(SELECT 1 FROM player_avatar_repository_suppression s WHERE s.player_id = players.id) AS avatar_suppressed
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
        phone: player.phone ?? null,
        telegram_username: player.telegram_username ?? null,
        elo: Number(player.elo || 0),
        tokens: Number(player.tokens || 0),
        game_level: String(player.game_level || 'club'),
        club_role: String(player.club_role || 'member'),
        judge_level: String(player.judge_level || 'none'),
        avatar_url: playerAvatarUrl(String(player.id), player.has_db_avatar, player.avatar_suppressed),
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

router.get('/players', async (req, res) => {
  const playerId = requirePlayerId(req, res);
  if (!playerId) return;

  try {
    const db = req.db;
    const rows = await db.all(`
      SELECT p.id, p.nickname, p.elo, p.game_level,
             EXISTS(SELECT 1 FROM player_avatars pa WHERE pa.player_id = p.id) AS has_db_avatar,
             EXISTS(SELECT 1 FROM player_avatar_repository_suppression s WHERE s.player_id = p.id) AS avatar_suppressed
        FROM players p
       WHERE TRIM(COALESCE(p.nickname, '')) <> ''
       ORDER BY p.nickname COLLATE NOCASE ASC
    `);

    return res.json({
      players: rows.map((row: any) => ({
        id: String(row.id),
        nickname: String(row.nickname),
        elo: Number(row.elo || 0),
        game_level: String(row.game_level || 'club'),
        avatar_url: playerAvatarUrl(String(row.id), row.has_db_avatar, row.avatar_suppressed),
      })),
    });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Не удалось загрузить список игроков' });
  }
});

router.get('/players/:playerId/avatar', async (req, res) => {
  const viewerId = requirePlayerId(req, res);
  if (!viewerId) return;

  try {
    const db = req.db;
    const targetId = String(req.params.playerId);
    const avatar = await db.get(
      'SELECT mime_type, image_data FROM player_avatars WHERE player_id = ? LIMIT 1',
      [targetId],
    );

    if (avatar?.image_data != null) {
      let bytes: Buffer;
      if (Buffer.isBuffer(avatar.image_data)) bytes = avatar.image_data;
      else if (avatar.image_data instanceof Uint8Array) bytes = Buffer.from(avatar.image_data);
      else bytes = Buffer.from(String(avatar.image_data), 'base64');
      res.setHeader('Cache-Control', 'private, max-age=3600');
      res.type(String(avatar.mime_type || 'image/jpeg'));
      return res.send(bytes);
    }

    const suppressed = await db.get(
      'SELECT 1 AS suppressed FROM player_avatar_repository_suppression WHERE player_id = ? LIMIT 1',
      [targetId],
    );
    const asset = suppressed ? null : getRepositoryPlayerAvatarAsset(targetId);
    if (!asset) return res.status(404).end();
    return res.redirect(302, `/player-avatars/${encodeURIComponent(asset.file)}`);
  } catch {
    return res.status(404).end();
  }
});

router.get('/players/:playerId', async (req, res) => {
  const viewerId = requirePlayerId(req, res);
  if (!viewerId) return;

  try {
    const db = req.db;
    const targetId = String(req.params.playerId);
    const player = await db.get(
      `SELECT p.id, p.nickname, p.elo, p.game_level,
              EXISTS(SELECT 1 FROM player_avatars pa WHERE pa.player_id = p.id) AS has_db_avatar,
              EXISTS(SELECT 1 FROM player_avatar_repository_suppression s WHERE s.player_id = p.id) AS avatar_suppressed
         FROM players p
        WHERE p.id = ?
        LIMIT 1`,
      [targetId],
    );
    if (!player) return res.status(404).json({ error: 'Игрок не найден' });

    const gameProfile = await loadPlayerGameProfile(db, targetId);
    return res.json({
      player: {
        id: String(player.id),
        nickname: String(player.nickname),
        elo: Number(player.elo || 0),
        game_level: String(player.game_level || 'club'),
        avatar_url: playerAvatarUrl(String(player.id), player.has_db_avatar, player.avatar_suppressed),
      },
      stats: gameProfile.gameStats,
      tournament_awards: gameProfile.awardStats,
    });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Не удалось загрузить профиль игрока' });
  }
});

router.get('/games/all', async (req, res) => {
  const playerId = requirePlayerId(req, res);
  if (!playerId) return;

  try {
    const db = req.db;
    const [clubRows, tournamentRows] = await Promise.all([
      db.all(`
        SELECT g.id, g.global_game_number, g.game_date, g.winner_team, g.judge_name, g.protocol_text,
               e.title AS evening_title, e.starts_at AS evening_date, e.format AS evening_format
          FROM games g
     LEFT JOIN game_evenings e ON e.id = g.evening_id
         WHERE g.evening_id IS NOT NULL
           AND g.archived_at IS NULL
           AND g.protocol_text IS NOT NULL
         ORDER BY COALESCE(e.starts_at, g.game_date) DESC, g.global_game_number DESC, g.id DESC
         LIMIT 250
      `),
      db.all(`
        SELECT tg.id, tg.game_number, tg.winner_team, tg.judge_name, tg.completed_at,
               t.id AS tournament_id, t.title AS tournament_title, t.date AS tournament_date
          FROM tournament_games tg
          JOIN tournaments t ON t.id = tg.tournament_id
         WHERE tg.status = 'completed'
         ORDER BY COALESCE(tg.completed_at, t.date) DESC, tg.game_number DESC
         LIMIT 250
      `),
    ]);

    const clubGames = clubRows.flatMap((row: any) => {
      const payload = safeJsonParse(row.protocol_text);
      if (!payload || payload.kind !== 'club_evening_protocol' || payload.protocol?.status !== 'completed') return [];
      return [{
        id: `club:${row.id}`,
        source: 'club',
        title: row.evening_title || 'Клубный вечер',
        date: row.evening_date || row.game_date || null,
        game_number: Number(row.global_game_number || 0),
        format: String(row.evening_format || 'CASUAL'),
        winner_team: normalizeWinner(payload.protocol?.winner_team || row.winner_team),
        judge_name: row.judge_name || null,
      }];
    });

    const tournamentGames = tournamentRows.map((row: any) => ({
      id: `tournament:${row.id}`,
      source: 'tournament',
      title: row.tournament_title || 'Турнир',
      date: row.completed_at || row.tournament_date || null,
      game_number: Number(row.game_number || 0),
      format: 'TOURNAMENT',
      winner_team: normalizeWinner(row.winner_team),
      judge_name: row.judge_name || null,
    }));

    const games = [...clubGames, ...tournamentGames]
      .sort((a: any, b: any) => {
        const aTime = a.date ? new Date(a.date).getTime() : 0;
        const bTime = b.date ? new Date(b.date).getTime() : 0;
        return bTime - aTime;
      })
      .slice(0, 300);

    return res.json({ games });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Не удалось загрузить общий архив игр' });
  }
});

router.get('/evenings', async (req, res) => {
  const playerId = requirePlayerId(req, res);
  if (!playerId) return;

  try {
    const db = req.db;
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
      .map((evening: any) => {
        const responseStatus = getEveningResponse(evening);
        return {
          ...evening,
          response_status: responseStatus,
          registration_status: responseStatus,
          attending_count: Number(evening.attending_count || 0),
          thinking_count: Number(evening.thinking_count || 0),
        };
      });

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
    const db = req.db;
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
      return res.status(409).json({ error: 'Ответы на этот вечер уже недоступны', code: 'closed' });
    }
    if (!playerLevelAllowsEveningFormat(player.game_level, evening.format)) {
      return res.status(403).json({ error: 'Этот формат вечера недоступен для вашего игрового уровня' });
    }

    const existingParticipant = await db.get(
      'SELECT id, attendance_status FROM evening_participants WHERE evening_id = ? AND player_id = ?',
      [evening.id, player.id],
    );
    if (existingParticipant && String(existingParticipant.attendance_status || 'pending') !== 'pending') {
      return res.status(409).json({
        error: 'Явка уже отмечена. Изменить ответ после этого может только организатор.',
        code: 'attendance_locked',
      });
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

    const participant = existingParticipant || await db.get(
      'SELECT id, attendance_status FROM evening_participants WHERE evening_id = ? AND player_id = ?',
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
