import { randomUUID } from 'node:crypto';
import { Router, type Request, type Response } from 'express';
import { getPlayerSessionId } from '../auth.ts';
import { normalizeJudgeLevel } from '../../db/ensureJudgeAuthoritySchema.ts';
import { musicEntryKey, normalizeYandexMusicUrl } from '../../lib/musicSource.ts';

const router = Router();

type Actor = { id: string; nickname: string; canManageOrganizerLibrary: boolean };

const safeTitle = (value: unknown, fallback: string) => {
  const title = String(value || '').trim().replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 120);
  return title || fallback;
};

const getActor = async (req: Request, res: Response): Promise<Actor | null> => {
  const playerId = getPlayerSessionId(req);
  if (!playerId) {
    res.status(401).json({ error: 'Player authentication required.' });
    return null;
  }
  const player = await req.db.get('SELECT id, nickname, judge_level FROM players WHERE id = ? LIMIT 1', [playerId]);
  if (!player) {
    res.status(404).json({ error: 'Игрок не найден.' });
    return null;
  }
  const level = normalizeJudgeLevel(player.judge_level);
  const isOrganizer = (req as any).userRole === 'ORGANIZER';
  return {
    id: String(player.id),
    nickname: String(player.nickname || 'Игрок'),
    canManageOrganizerLibrary: isOrganizer || level === 'host' || level === 'judge',
  };
};

const requireLibraryManager = async (req: Request, res: Response) => {
  const actor = await getActor(req, res);
  if (!actor) return null;
  if (!actor.canManageOrganizerLibrary) {
    res.status(403).json({ error: 'Музыкальная база ведущего доступна ведущим, судьям и организатору.' });
    return null;
  }
  return actor;
};

const linkDto = (row: any) => ({
  id: String(row.id),
  title: String(row.title || 'Яндекс Музыка'),
  source_type: 'yandex' as const,
  source_kind: row.source_kind,
  source_url: row.normalized_url,
  embed_url: row.embed_url || null,
  normalized_url: row.normalized_url,
  sort_order: Number(row.sort_order || 0),
  slot_index: row.slot_index == null ? null : Number(row.slot_index),
  created_at: row.created_at || null,
});

router.get('/music-library/player-slots', async (req, res) => {
  try {
    const actor = await getActor(req, res);
    if (!actor) return;
    const rows = await req.db.all(
      `SELECT * FROM music_link_entries
        WHERE owner_player_id = ? AND scope = 'player'
        ORDER BY slot_index ASC`,
      [actor.id],
    );
    const bySlot = new Map(rows.map((row: any) => [Number(row.slot_index), linkDto(row)]));
    return res.json({ slots: [1, 2].map((slot) => ({ slot, entry: bySlot.get(slot) || null })) });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Не удалось загрузить музыку игрока.' });
  }
});

router.put('/music-library/player-slots/:slot', async (req, res) => {
  try {
    const actor = await getActor(req, res);
    if (!actor) return;
    const slot = Number(req.params.slot);
    if (slot !== 1 && slot !== 2) return res.status(400).json({ error: 'Доступны только два музыкальных слота.' });
    const source = normalizeYandexMusicUrl(String(req.body?.url || ''));
    const title = safeTitle(req.body?.title, source.kind === 'yandex_playlist' ? 'Мой плейлист' : 'Мой трек');
    const now = new Date().toISOString();
    const existing = await req.db.get(
      `SELECT id FROM music_link_entries WHERE owner_player_id = ? AND scope = 'player' AND slot_index = ?`,
      [actor.id, slot],
    );
    const id = existing?.id ? String(existing.id) : randomUUID();
    if (existing) {
      await req.db.run(
        `UPDATE music_link_entries
            SET title = ?, source_kind = ?, source_url = ?, normalized_url = ?, embed_url = ?, updated_at = ?
          WHERE id = ? AND owner_player_id = ?`,
        [title, source.kind, source.sourceUrl, source.normalizedUrl, source.embedUrl, now, id, actor.id],
      );
    } else {
      await req.db.run(
        `INSERT INTO music_link_entries
          (id, owner_player_id, scope, slot_index, title, source_kind, source_url, normalized_url, embed_url, sort_order, created_at, updated_at)
         VALUES (?, ?, 'player', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, actor.id, slot, title, source.kind, source.sourceUrl, source.normalizedUrl, source.embedUrl, slot - 1, now, now],
      );
    }
    const row = await req.db.get('SELECT * FROM music_link_entries WHERE id = ?', [id]);
    return res.json({ slot, entry: linkDto(row) });
  } catch (error: any) {
    return res.status(400).json({ error: error?.message || 'Не удалось сохранить ссылку.' });
  }
});

router.delete('/music-library/player-slots/:slot', async (req, res) => {
  try {
    const actor = await getActor(req, res);
    if (!actor) return;
    const slot = Number(req.params.slot);
    if (slot !== 1 && slot !== 2) return res.status(400).json({ error: 'Доступны только два музыкальных слота.' });
    await req.db.run(
      `DELETE FROM music_link_entries WHERE owner_player_id = ? AND scope = 'player' AND slot_index = ?`,
      [actor.id, slot],
    );
    return res.json({ ok: true });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Не удалось удалить ссылку.' });
  }
});

router.get('/music-library/organizer', async (req, res) => {
  try {
    const actor = await requireLibraryManager(req, res);
    if (!actor) return;
    const [links, uploads] = await Promise.all([
      req.db.all(
        `SELECT * FROM music_link_entries WHERE owner_player_id = ? AND scope = 'organizer' ORDER BY sort_order ASC, created_at ASC`,
        [actor.id],
      ),
      req.db.all(
        `SELECT id, title, mime_type, byte_size, sort_order, created_at
           FROM judge_music_tracks WHERE owner_player_id = ? ORDER BY sort_order ASC, created_at ASC`,
        [actor.id],
      ),
    ]);
    return res.json({
      links: links.map(linkDto),
      uploads: uploads.map((row: any) => ({
        id: String(row.id),
        title: String(row.title || 'Трек'),
        source_type: 'upload',
        mime_type: row.mime_type,
        byte_size: Number(row.byte_size || 0),
        sort_order: Number(row.sort_order || 0),
        created_at: row.created_at || null,
        audio_url: `/api/player/judge-music/tracks/${encodeURIComponent(String(row.id))}/audio`,
      })),
    });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Не удалось загрузить музыкальную базу.' });
  }
});

router.post('/music-library/organizer/links', async (req, res) => {
  try {
    const actor = await requireLibraryManager(req, res);
    if (!actor) return;
    const source = normalizeYandexMusicUrl(String(req.body?.url || ''));
    const duplicate = await req.db.get(
      `SELECT id FROM music_link_entries WHERE owner_player_id = ? AND scope = 'organizer' AND normalized_url = ? LIMIT 1`,
      [actor.id, source.normalizedUrl],
    );
    if (duplicate) return res.status(409).json({ error: 'Эта ссылка уже есть в музыкальной базе.' });
    const order = await req.db.get(
      `SELECT COALESCE(MAX(sort_order), -1) AS max_order FROM music_link_entries WHERE owner_player_id = ? AND scope = 'organizer'`,
      [actor.id],
    );
    const now = new Date().toISOString();
    const id = randomUUID();
    const title = safeTitle(req.body?.title, source.kind === 'yandex_playlist' ? 'Яндекс-плейлист' : 'Яндекс-трек');
    await req.db.run(
      `INSERT INTO music_link_entries
        (id, owner_player_id, scope, slot_index, title, source_kind, source_url, normalized_url, embed_url, sort_order, created_at, updated_at)
       VALUES (?, ?, 'organizer', NULL, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, actor.id, title, source.kind, source.sourceUrl, source.normalizedUrl, source.embedUrl, Number(order?.max_order ?? -1) + 1, now, now],
    );
    const row = await req.db.get('SELECT * FROM music_link_entries WHERE id = ?', [id]);
    return res.status(201).json({ entry: linkDto(row) });
  } catch (error: any) {
    return res.status(400).json({ error: error?.message || 'Не удалось добавить ссылку.' });
  }
});

router.delete('/music-library/organizer/links/:id', async (req, res) => {
  try {
    const actor = await requireLibraryManager(req, res);
    if (!actor) return;
    const result = await req.db.run(
      `DELETE FROM music_link_entries WHERE id = ? AND owner_player_id = ? AND scope = 'organizer'`,
      [String(req.params.id), actor.id],
    );
    if (!result.changes) return res.status(404).json({ error: 'Ссылка не найдена.' });
    return res.json({ ok: true });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Не удалось удалить ссылку.' });
  }
});

router.get('/music-library/evenings/:eveningId/pool', async (req, res) => {
  try {
    const actor = await requireLibraryManager(req, res);
    if (!actor) return;
    const eveningId = String(req.params.eveningId);
    const evening = await req.db.get('SELECT id, title FROM game_evenings WHERE id = ? LIMIT 1', [eveningId]);
    if (!evening) return res.status(404).json({ error: 'Игровой вечер не найден.' });

    const [uploads, organizerLinks, playerLinks, exclusionRows] = await Promise.all([
      req.db.all(
        `SELECT id, title, mime_type, byte_size, sort_order FROM judge_music_tracks WHERE owner_player_id = ? ORDER BY sort_order ASC, created_at ASC`,
        [actor.id],
      ),
      req.db.all(
        `SELECT ml.*, p.nickname FROM music_link_entries ml JOIN players p ON p.id = ml.owner_player_id
          WHERE ml.owner_player_id = ? AND ml.scope = 'organizer' ORDER BY ml.sort_order ASC, ml.created_at ASC`,
        [actor.id],
      ),
      req.db.all(
        `SELECT ml.*, p.nickname
           FROM music_link_entries ml
           JOIN players p ON p.id = ml.owner_player_id
           JOIN evening_participants ep ON ep.player_id = ml.owner_player_id AND ep.evening_id = ?
          WHERE ml.scope = 'player' AND ep.attendance_status = 'attended'
          ORDER BY ep.checked_in_at ASC, ml.slot_index ASC`,
        [eveningId],
      ),
      req.db.all('SELECT entry_key FROM evening_music_exclusions WHERE evening_id = ?', [eveningId]),
    ]);

    const excluded = new Set(exclusionRows.map((row: any) => String(row.entry_key)));
    const pool: any[] = uploads.map((row: any) => ({
      key: `upload:${String(row.id)}`,
      id: String(row.id),
      title: String(row.title || 'Трек'),
      source_type: 'upload',
      audio_url: `/api/player/judge-music/tracks/${encodeURIComponent(String(row.id))}/audio`,
      source_url: null,
      embed_url: null,
      contributors: [{ player_id: actor.id, nickname: actor.nickname, kind: 'organizer' }],
    }));

    const links = [...organizerLinks.map((row: any) => ({ row, kind: 'organizer' })), ...playerLinks.map((row: any) => ({ row, kind: 'player' }))];
    const dedup = new Map<string, any>();
    for (const item of links) {
      const row: any = item.row;
      const key = musicEntryKey(String(row.normalized_url));
      const contributor = { player_id: String(row.owner_player_id), nickname: String(row.nickname || 'Игрок'), kind: item.kind };
      const current = dedup.get(key);
      if (current) {
        if (!current.contributors.some((value: any) => value.player_id === contributor.player_id)) current.contributors.push(contributor);
        continue;
      }
      dedup.set(key, {
        key,
        id: String(row.id),
        title: String(row.title || 'Яндекс Музыка'),
        source_type: 'yandex',
        source_kind: row.source_kind,
        audio_url: null,
        source_url: row.normalized_url,
        embed_url: row.embed_url || null,
        contributors: [contributor],
      });
    }
    pool.push(...dedup.values());

    return res.json({
      evening: { id: String(evening.id), title: String(evening.title || '') },
      pool: pool.map((entry) => ({ ...entry, excluded: excluded.has(entry.key) })),
    });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Не удалось собрать плейлист вечера.' });
  }
});

router.put('/music-library/evenings/:eveningId/exclusion', async (req, res) => {
  try {
    const actor = await requireLibraryManager(req, res);
    if (!actor) return;
    const eveningId = String(req.params.eveningId);
    const entryKey = String(req.body?.entry_key || '').trim().slice(0, 800);
    if (!entryKey) return res.status(400).json({ error: 'Не указан трек.' });
    const excluded = req.body?.excluded !== false;
    if (excluded) {
      await req.db.run(
        `INSERT OR REPLACE INTO evening_music_exclusions (evening_id, entry_key, excluded_by_player_id, created_at) VALUES (?, ?, ?, ?)`,
        [eveningId, entryKey, actor.id, new Date().toISOString()],
      );
    } else {
      await req.db.run('DELETE FROM evening_music_exclusions WHERE evening_id = ? AND entry_key = ?', [eveningId, entryKey]);
    }
    return res.json({ ok: true, excluded });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Не удалось изменить плейлист вечера.' });
  }
});

export default router;
