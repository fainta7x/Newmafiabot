import { randomUUID } from 'node:crypto';
import express, { Router, type Request, type Response } from 'express';
import { getPlayerSessionId } from '../auth.ts';
import { normalizeJudgeLevel } from '../../db/ensureJudgeAuthoritySchema.ts';

const router = Router();
const MAX_TRACKS = 10;
const MAX_TRACK_BYTES = 15 * 1024 * 1024;
const AUDIO_TYPES = new Set([
  'audio/mpeg',
  'audio/mp3',
  'audio/mp4',
  'audio/x-m4a',
  'audio/ogg',
  'audio/webm',
  'audio/wav',
  'audio/x-wav',
  'application/octet-stream',
]);

const audioBody = express.raw({ type: () => true, limit: MAX_TRACK_BYTES });

const safeTitle = (value: unknown) => {
  const title = String(value || '').trim().replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 120);
  return title || 'Трек';
};

const getMusicOwner = async (req: Request, res: Response) => {
  const playerId = getPlayerSessionId(req);
  if (!playerId) {
    res.status(401).json({ error: 'Player authentication required.' });
    return null;
  }
  const db = req.db;
  const player = await db.get('SELECT id, nickname, judge_level FROM players WHERE id = ? LIMIT 1', [playerId]);
  if (!player) {
    res.status(404).json({ error: 'Игрок не найден' });
    return null;
  }
  const level = normalizeJudgeLevel(player.judge_level);
  if (level !== 'host' && level !== 'judge') {
    res.status(403).json({ error: 'Личные игровые плейлисты доступны только ведущим и судьям.' });
    return null;
  }
  return { id: String(player.id), nickname: String(player.nickname), judge_level: level };
};

const trackDto = (row: any) => ({
  id: String(row.id),
  title: String(row.title || 'Трек'),
  mime_type: String(row.mime_type || 'audio/mpeg'),
  byte_size: Number(row.byte_size || 0),
  sort_order: Number(row.sort_order || 0),
  created_at: row.created_at || null,
  audio_url: `/api/player/judge-music/tracks/${encodeURIComponent(String(row.id))}/audio`,
});

router.get('/judge-music', async (req, res) => {
  try {
    const owner = await getMusicOwner(req, res);
    if (!owner) return;
    const db = req.db;
    const tracks = await db.all(
      `SELECT id, title, mime_type, byte_size, sort_order, created_at
         FROM judge_music_tracks
        WHERE owner_player_id = ?
        ORDER BY sort_order ASC, created_at ASC`,
      [owner.id],
    );
    return res.json({ owner, limit: MAX_TRACKS, max_track_bytes: MAX_TRACK_BYTES, tracks: tracks.map(trackDto) });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Не удалось загрузить плейлист' });
  }
});

router.post('/judge-music/tracks', audioBody, async (req, res) => {
  try {
    const owner = await getMusicOwner(req, res);
    if (!owner) return;
    const db = req.db;
    const body = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body || []);
    if (!body.length) return res.status(400).json({ error: 'Аудиофайл пуст.' });
    if (body.length > MAX_TRACK_BYTES) return res.status(413).json({ error: 'Один трек должен быть не больше 15 МБ.' });

    const contentType = String(req.headers['content-type'] || 'application/octet-stream').split(';')[0].trim().toLowerCase();
    if (!AUDIO_TYPES.has(contentType) && !contentType.startsWith('audio/')) {
      return res.status(415).json({ error: 'Поддерживаются только аудиофайлы.' });
    }

    const countRow = await db.get('SELECT COUNT(*) AS total FROM judge_music_tracks WHERE owner_player_id = ?', [owner.id]);
    if (Number(countRow?.total || 0) >= MAX_TRACKS) {
      return res.status(409).json({ error: `В личном плейлисте может быть не больше ${MAX_TRACKS} треков.` });
    }

    const orderRow = await db.get('SELECT COALESCE(MAX(sort_order), -1) AS max_order FROM judge_music_tracks WHERE owner_player_id = ?', [owner.id]);
    const now = new Date().toISOString();
    const id = randomUUID();
    const title = safeTitle(req.query.title);
    await db.run(
      `INSERT INTO judge_music_tracks (id, owner_player_id, title, mime_type, audio_data, byte_size, sort_order, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, owner.id, title, contentType === 'application/octet-stream' ? 'audio/mpeg' : contentType, body, body.length, Number(orderRow?.max_order ?? -1) + 1, now, now],
    );

    const created = await db.get(
      'SELECT id, title, mime_type, byte_size, sort_order, created_at FROM judge_music_tracks WHERE id = ? AND owner_player_id = ?',
      [id, owner.id],
    );
    return res.status(201).json({ track: trackDto(created) });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Не удалось загрузить трек' });
  }
});

router.put('/judge-music/order', async (req, res) => {
  try {
    const owner = await getMusicOwner(req, res);
    if (!owner) return;
    const ids = Array.isArray(req.body?.track_ids) ? req.body.track_ids.map(String) : [];
    const db = req.db;
    const existing = await db.all('SELECT id FROM judge_music_tracks WHERE owner_player_id = ? ORDER BY sort_order ASC, created_at ASC', [owner.id]);
    const existingIds = existing.map((row: any) => String(row.id));
    if (ids.length !== existingIds.length || new Set(ids).size !== ids.length || ids.some((id: string) => !existingIds.includes(id))) {
      return res.status(400).json({ error: 'Передайте все треки плейлиста ровно по одному разу.' });
    }
    const now = new Date().toISOString();
    await db.transaction(async (tx: any) => {
      for (let index = 0; index < ids.length; index += 1) {
        await tx.run('UPDATE judge_music_tracks SET sort_order = ?, updated_at = ? WHERE id = ? AND owner_player_id = ?', [index, now, ids[index], owner.id]);
      }
    });
    return res.json({ ok: true });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Не удалось изменить порядок треков' });
  }
});

router.delete('/judge-music/tracks/:trackId', async (req, res) => {
  try {
    const owner = await getMusicOwner(req, res);
    if (!owner) return;
    const db = req.db;
    const result = await db.run('DELETE FROM judge_music_tracks WHERE id = ? AND owner_player_id = ?', [String(req.params.trackId), owner.id]);
    if (!result.changes) return res.status(404).json({ error: 'Трек не найден.' });
    const remaining = await db.all('SELECT id FROM judge_music_tracks WHERE owner_player_id = ? ORDER BY sort_order ASC, created_at ASC', [owner.id]);
    const now = new Date().toISOString();
    await db.transaction(async (tx: any) => {
      for (let index = 0; index < remaining.length; index += 1) {
        await tx.run('UPDATE judge_music_tracks SET sort_order = ?, updated_at = ? WHERE id = ? AND owner_player_id = ?', [index, now, remaining[index].id, owner.id]);
      }
    });
    return res.json({ ok: true });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Не удалось удалить трек' });
  }
});

router.get('/judge-music/tracks/:trackId/audio', async (req, res) => {
  try {
    const owner = await getMusicOwner(req, res);
    if (!owner) return;
    const db = req.db;
    const row = await db.get(
      'SELECT mime_type, audio_data, byte_size FROM judge_music_tracks WHERE id = ? AND owner_player_id = ? LIMIT 1',
      [String(req.params.trackId), owner.id],
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
    res.type(String(row.mime_type || 'audio/mpeg'));

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

router.use((error: any, _req: Request, res: Response, next: (error?: any) => void) => {
  if (error?.status === 413 || error?.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Один трек должен быть не больше 15 МБ.' });
  }
  next(error);
});

export default router;
