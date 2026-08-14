import express, { Router, type NextFunction, type Response } from 'express';
import { getPlayerSessionId, type AuthenticatedRequest } from '../auth.ts';

const router = Router();
const MAX_CLIP_BYTES = 5 * 1024 * 1024;
const audioBody = express.raw({ type: () => true, limit: MAX_CLIP_BYTES });

const cleanText = (value: unknown, fallback: string, max = 120) => {
  const text = String(value || '').trim().replace(/[\u0000-\u001f\u007f]/g, '').slice(0, max);
  return text || fallback;
};

const toNumber = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const getAuthorizedClubGame = async (req: AuthenticatedRequest, res: Response) => {
  const gameId = Number(req.params.gameId);
  if (!Number.isInteger(gameId) || gameId <= 0) {
    res.status(400).json({ error: 'Некорректный идентификатор игры.' });
    return null;
  }

  const db = (req as any).db;
  const game = await db.get(
    `SELECT g.id, g.judge_player_id, g.archived_at, e.id AS evening_id
       FROM games g
       LEFT JOIN game_evenings e ON e.id = g.evening_id
      WHERE g.id = ?
      LIMIT 1`,
    [gameId],
  );
  if (!game || !game.evening_id || game.archived_at) {
    res.status(404).json({ error: 'Клубная игра не найдена.' });
    return null;
  }

  const playerId = getPlayerSessionId(req);
  const organizer = req.userRole === 'ORGANIZER';
  const assignedJudge = Boolean(playerId && String(game.judge_player_id || '') === playerId);
  if (!organizer && !assignedJudge) {
    res.status(403).json({ error: 'Записывать речи может организатор или назначенный ведущий этой игры.' });
    return null;
  }

  return { id: gameId, playerId };
};

const clipDto = (row: any) => ({
  id: String(row.id),
  game_id: Number(row.game_id),
  session_id: String(row.session_id || ''),
  seat_number: Number(row.seat_number || 0),
  speaker_nickname: String(row.speaker_nickname || ''),
  round_number: Number(row.round_number || 1),
  speech_type: String(row.speech_type || 'Речь'),
  started_at: String(row.started_at || ''),
  duration_seconds: Number(row.duration_seconds || 0),
  mime_type: String(row.mime_type || 'audio/webm'),
  byte_size: Number(row.byte_size || 0),
  audio_url: `/api/speech-recordings/club-games/${encodeURIComponent(String(row.game_id))}/clips/${encodeURIComponent(String(row.id))}/audio`,
});

router.post('/club-games/:gameId/clips', audioBody, async (req: AuthenticatedRequest, res) => {
  try {
    const game = await getAuthorizedClubGame(req, res);
    if (!game) return;

    const body = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body || []);
    if (!body.length) return res.status(400).json({ error: 'Аудиозапись пустая.' });
    if (body.length > MAX_CLIP_BYTES) return res.status(413).json({ error: 'Одна речь должна быть не больше 5 МБ.' });

    const contentType = String(req.headers['content-type'] || 'application/octet-stream').split(';')[0].trim().toLowerCase();
    if (!contentType.startsWith('audio/') && contentType !== 'application/octet-stream') {
      return res.status(415).json({ error: 'Ожидается аудиофайл.' });
    }

    const id = cleanText(req.query.clip_id, '', 180);
    const sessionId = cleanText(req.query.session_id, '', 180);
    const seatNumber = Math.trunc(toNumber(req.query.seat_number));
    const roundNumber = Math.max(1, Math.trunc(toNumber(req.query.round_number, 1)));
    const durationSeconds = Math.max(0, toNumber(req.query.duration_seconds));
    const speakerNickname = cleanText(req.query.speaker_nickname, seatNumber ? `Игрок ${seatNumber}` : 'Игрок');
    const speechType = cleanText(req.query.speech_type, 'Речь');
    const startedAtRaw = cleanText(req.query.started_at, '', 80);
    const startedAtDate = new Date(startedAtRaw);

    if (!id || !sessionId) return res.status(400).json({ error: 'Не хватает идентификаторов записи.' });
    if (seatNumber < 1 || seatNumber > 10) return res.status(400).json({ error: 'Некорректный номер места.' });
    if (!Number.isFinite(startedAtDate.getTime())) return res.status(400).json({ error: 'Некорректное время начала речи.' });

    const db = (req as any).db;
    const existing = await db.get(
      `SELECT id, game_id, session_id, seat_number, speaker_nickname, round_number, speech_type,
              started_at, duration_seconds, mime_type, byte_size
         FROM game_speech_recordings
        WHERE id = ?
        LIMIT 1`,
      [id],
    );
    if (existing) {
      if (Number(existing.game_id) !== game.id) return res.status(409).json({ error: 'Идентификатор записи уже используется другой игрой.' });
      return res.json({ clip: clipDto(existing), duplicate: true });
    }

    const now = new Date().toISOString();
    const mimeType = contentType === 'application/octet-stream' ? 'audio/webm' : contentType;
    await db.run(
      `INSERT INTO game_speech_recordings (
        id, game_id, session_id, seat_number, speaker_nickname, round_number, speech_type,
        started_at, duration_seconds, mime_type, audio_data, byte_size, uploaded_by_player_id, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        game.id,
        sessionId,
        seatNumber,
        speakerNickname,
        roundNumber,
        speechType,
        startedAtDate.toISOString(),
        durationSeconds,
        mimeType,
        body,
        body.length,
        game.playerId,
        now,
      ],
    );

    const created = await db.get(
      `SELECT id, game_id, session_id, seat_number, speaker_nickname, round_number, speech_type,
              started_at, duration_seconds, mime_type, byte_size
         FROM game_speech_recordings
        WHERE id = ?
        LIMIT 1`,
      [id],
    );
    return res.status(201).json({ clip: clipDto(created) });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Не удалось сохранить речь.' });
  }
});

router.get('/club-games/:gameId/clips', async (req: AuthenticatedRequest, res) => {
  try {
    const game = await getAuthorizedClubGame(req, res);
    if (!game) return;
    const db = (req as any).db;
    const rows = await db.all(
      `SELECT id, game_id, session_id, seat_number, speaker_nickname, round_number, speech_type,
              started_at, duration_seconds, mime_type, byte_size
         FROM game_speech_recordings
        WHERE game_id = ?
        ORDER BY started_at ASC, created_at ASC`,
      [game.id],
    );
    return res.json({ clips: rows.map(clipDto), max_clip_bytes: MAX_CLIP_BYTES });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Не удалось загрузить речи.' });
  }
});

router.get('/club-games/:gameId/clips/:clipId/audio', async (req: AuthenticatedRequest, res) => {
  try {
    const game = await getAuthorizedClubGame(req, res);
    if (!game) return;
    const db = (req as any).db;
    const row = await db.get(
      'SELECT mime_type, audio_data FROM game_speech_recordings WHERE id = ? AND game_id = ? LIMIT 1',
      [String(req.params.clipId), game.id],
    );
    if (!row) return res.status(404).end();

    const bytes = Buffer.isBuffer(row.audio_data)
      ? row.audio_data
      : row.audio_data instanceof Uint8Array
        ? Buffer.from(row.audio_data)
        : Buffer.from(String(row.audio_data || ''), 'base64');
    const total = bytes.length;
    const range = String(req.headers.range || '');
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.type(String(row.mime_type || 'audio/webm'));

    if (range.startsWith('bytes=')) {
      const [startRaw, endRaw] = range.slice(6).split('-', 2);
      const start = Math.max(0, Number.parseInt(startRaw || '0', 10) || 0);
      const requestedEnd = endRaw ? Number.parseInt(endRaw, 10) : total - 1;
      const end = Math.min(total - 1, Number.isFinite(requestedEnd) ? requestedEnd : total - 1);
      if (start >= total || start > end) {
        res.status(416).setHeader('Content-Range', `bytes */${total}`);
        return res.end();
      }
      res.status(206);
      res.setHeader('Content-Range', `bytes ${start}-${end}/${total}`);
      res.setHeader('Content-Length', String(end - start + 1));
      return res.send(bytes.subarray(start, end + 1));
    }

    res.setHeader('Content-Length', String(total));
    return res.send(bytes);
  } catch {
    return res.status(404).end();
  }
});

router.use((error: any, _req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  if (error?.status === 413 || error?.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Одна речь должна быть не больше 5 МБ.' });
  }
  next(error);
});

export default router;
