import { Router } from 'express';
import { getPlayerSessionId } from '../auth.ts';

const router = Router();

const requirePlayerId = (req: any, res: any): string | null => {
  const playerId = getPlayerSessionId(req);
  if (!playerId) {
    res.status(401).json({ error: 'Player authentication required.' });
    return null;
  }
  return playerId;
};

const cleanNullable = (value: unknown, maxLength: number) => {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text ? text.slice(0, maxLength) : null;
};

router.get('/profile-settings', async (req, res) => {
  const playerId = requirePlayerId(req, res);
  if (!playerId) return;
  try {
    const db = (req as any).db;
    const player = await db.get(
      `SELECT id, nickname, full_name, phone, telegram_username, game_level, club_role, elo, tokens
         FROM players WHERE id = ? LIMIT 1`,
      [playerId],
    );
    if (!player) return res.status(404).json({ error: 'Игрок не найден' });
    return res.json({ player });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Не удалось загрузить настройки профиля' });
  }
});

router.patch('/me', async (req, res) => {
  const playerId = requirePlayerId(req, res);
  if (!playerId) return;
  try {
    const db = (req as any).db;
    const nickname = String(req.body?.nickname ?? '').trim().slice(0, 60);
    if (!nickname) return res.status(400).json({ error: 'Ник не может быть пустым' });

    const duplicate = await db.get(
      `SELECT id FROM players
        WHERE LOWER(TRIM(nickname)) = LOWER(TRIM(?)) AND id <> ?
        LIMIT 1`,
      [nickname, playerId],
    );
    if (duplicate) return res.status(409).json({ error: 'Игрок с таким ником уже существует' });

    const fullName = cleanNullable(req.body?.full_name, 120);
    const phone = cleanNullable(req.body?.phone, 40);
    const now = new Date().toISOString();
    await db.run(
      `UPDATE players
          SET nickname = ?, full_name = ?, phone = ?, updated_at = ?
        WHERE id = ?`,
      [nickname, fullName, phone, now, playerId],
    );
    const player = await db.get(
      `SELECT id, nickname, full_name, phone, telegram_username, game_level, club_role, elo, tokens
         FROM players WHERE id = ? LIMIT 1`,
      [playerId],
    );
    return res.json({ success: true, player });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Не удалось сохранить профиль' });
  }
});

router.put('/me/avatar', async (req, res) => {
  const playerId = requirePlayerId(req, res);
  if (!playerId) return;
  try {
    const db = (req as any).db;
    const player = await db.get('SELECT id FROM players WHERE id = ? LIMIT 1', [playerId]);
    if (!player) return res.status(404).json({ error: 'Игрок не найден' });

    const { data_url, width, height } = req.body || {};
    if (typeof data_url !== 'string' || !data_url.startsWith('data:image/jpeg;base64,')) {
      return res.status(400).json({ error: 'Разрешён только подготовленный JPEG' });
    }
    const base64Data = data_url.substring('data:image/jpeg;base64,'.length).replace(/\s/g, '');
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(base64Data)) return res.status(400).json({ error: 'Некорректный Base64' });
    const buffer = Buffer.from(base64Data, 'base64');
    if (!buffer.length || buffer.length > 700 * 1024) return res.status(400).json({ error: 'Размер аватара должен быть не больше 700 КБ' });

    const w = Number(width);
    const h = Number(height);
    if (!Number.isInteger(w) || !Number.isInteger(h) || w < 1 || w > 1024 || h < 1 || h > 1024) {
      return res.status(400).json({ error: 'Некорректные размеры изображения' });
    }
    if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8 || buffer[2] !== 0xff || buffer[buffer.length - 2] !== 0xff || buffer[buffer.length - 1] !== 0xd9) {
      return res.status(400).json({ error: 'Изображение не является валидным JPEG' });
    }

    const now = new Date().toISOString();
    await db.run(
      `INSERT OR REPLACE INTO player_avatars
         (player_id, mime_type, image_data, byte_size, width, height, updated_at)
       VALUES (?, 'image/jpeg', ?, ?, ?, ?, ?)`,
      [playerId, buffer, buffer.length, w, h, now],
    );
    await db.run('DELETE FROM player_avatar_repository_suppression WHERE player_id = ?', [playerId]);
    return res.json({ success: true, updated_at: now });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Не удалось сохранить аватар' });
  }
});

router.delete('/me/avatar', async (req, res) => {
  const playerId = requirePlayerId(req, res);
  if (!playerId) return;
  try {
    const db = (req as any).db;
    const now = new Date().toISOString();
    await db.transaction(async (tx: any) => {
      await tx.run('DELETE FROM player_avatars WHERE player_id = ?', [playerId]);
      await tx.run(
        'INSERT OR IGNORE INTO player_avatar_repository_suppression (player_id, created_at) VALUES (?, ?)',
        [playerId, now],
      );
    });
    return res.json({ success: true });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Не удалось удалить аватар' });
  }
});

export default router;