import { Router } from 'express';
import { getPlayerSessionId } from '../auth.ts';
import { validateBirthday, validatePhone } from '../services/playerProfileIntegrityService.ts';
import { ensurePlayerProfileVisibilitySchema, parsePlayerProfileVisibility } from '../services/playerProfileVisibilityService.ts';

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

const PROFILE_SELECT = `id, nickname, full_name, phone, telegram_user_id, telegram_username, game_level, club_role,
  preferred_format, birth_day, birth_month, birth_year, birthday_visibility, profile_visibility_json, profile_field_status_json,
  profile_checked_at, profile_updated_at, elo, tokens, updated_at`;

router.get('/profile-settings', async (req, res) => {
  const playerId = requirePlayerId(req, res);
  if (!playerId) return;
  try {
    const db = req.db;
    await ensurePlayerProfileVisibilitySchema(db);
    const player = await db.get(`SELECT ${PROFILE_SELECT} FROM players WHERE id = ? LIMIT 1`, [playerId]);
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
    const db = req.db;
    await ensurePlayerProfileVisibilitySchema(db);
    const existing = await db.get<any>(`SELECT ${PROFILE_SELECT} FROM players WHERE id = ? LIMIT 1`, [playerId]);
    if (!existing) return res.status(404).json({ error: 'Игрок не найден' });

    const has = (key: string) => Object.prototype.hasOwnProperty.call(req.body || {}, key);
    const fields: string[] = [];
    const values: any[] = [];

    if (has('nickname')) {
      const nickname = String(req.body?.nickname ?? '').trim().slice(0, 60);
      if (!nickname) return res.status(400).json({ error: 'Ник не может быть пустым' });
      const duplicate = await db.get(
        `SELECT id FROM players WHERE LOWER(TRIM(nickname)) = LOWER(TRIM(?)) AND id <> ? LIMIT 1`,
        [nickname, playerId],
      );
      if (duplicate) return res.status(409).json({ error: 'Игрок с таким ником уже существует' });
      fields.push('nickname = ?'); values.push(nickname);
    }
    if (has('full_name')) { fields.push('full_name = ?'); values.push(cleanNullable(req.body?.full_name, 120)); }
    if (has('phone')) { fields.push('phone = ?'); values.push(validatePhone(req.body?.phone)); }
    if (has('preferred_format')) { fields.push('preferred_format = ?'); values.push(cleanNullable(req.body?.preferred_format, 80)); }

    const birthdayTouched = has('birth_day') || has('birth_month') || has('birth_year');
    if (birthdayTouched) {
      const birthday = validateBirthday(
        has('birth_day') ? req.body?.birth_day : existing.birth_day,
        has('birth_month') ? req.body?.birth_month : existing.birth_month,
        has('birth_year') ? req.body?.birth_year : existing.birth_year,
      );
      fields.push('birth_day = ?', 'birth_month = ?', 'birth_year = ?');
      values.push(birthday.day, birthday.month, birthday.year);
    }
    if (has('birthday_visibility')) {
      const visibility = String(req.body?.birthday_visibility || 'private');
      if (!['private', 'day_month', 'full'].includes(visibility)) return res.status(400).json({ error: 'Некорректная настройка видимости дня рождения' });
      const canonicalVisibility = parsePlayerProfileVisibility(existing.profile_visibility_json, existing.birthday_visibility);
      canonicalVisibility.birthday_day_month = visibility !== 'private';
      canonicalVisibility.birth_year = visibility === 'full';
      fields.push('birthday_visibility = ?', 'profile_visibility_json = ?');
      values.push(visibility, JSON.stringify(canonicalVisibility));
    }

    if (has('sensitive_field_choice')) {
      const choice = req.body?.sensitive_field_choice;
      const field = String(choice?.field || '');
      const state = String(choice?.state || '');
      if (!['phone', 'birthday'].includes(field) || !['missing', 'declined'].includes(state)) {
        return res.status(400).json({ error: 'Некорректный выбор приватного поля' });
      }
      let statuses: Record<string, string> = {};
      try { statuses = JSON.parse(String(existing.profile_field_status_json || '{}')); } catch { statuses = {}; }
      statuses[field] = state;
      fields.push('profile_field_status_json = ?'); values.push(JSON.stringify(statuses));
    }

    if (!fields.length) return res.json({ success: true, player: existing });
    const now = new Date().toISOString();
    fields.push('profile_updated_at = ?', 'updated_at = ?'); values.push(now, now, playerId);
    await db.run(`UPDATE players SET ${fields.join(', ')} WHERE id = ?`, values);
    const player = await db.get(`SELECT ${PROFILE_SELECT} FROM players WHERE id = ? LIMIT 1`, [playerId]);
    return res.json({ success: true, player });
  } catch (error: any) {
    return res.status(400).json({ error: error?.message || 'Не удалось сохранить профиль' });
  }
});

router.put('/me/avatar', async (req, res) => {
  const playerId = requirePlayerId(req, res);
  if (!playerId) return;
  try {
    const db = req.db;
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
    await db.transaction(async (tx: any) => {
      await tx.run(
        `INSERT OR REPLACE INTO player_avatars (player_id, mime_type, image_data, byte_size, width, height, updated_at)
         VALUES (?, 'image/jpeg', ?, ?, ?, ?, ?)`,
        [playerId, buffer, buffer.length, w, h, now],
      );
      await tx.run('DELETE FROM player_avatar_repository_suppression WHERE player_id = ?', [playerId]);
      await tx.run('UPDATE players SET profile_updated_at = ?, updated_at = ? WHERE id = ?', [now, now, playerId]);
    });
    return res.json({ success: true, updated_at: now });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Не удалось сохранить аватар' });
  }
});

router.delete('/me/avatar', async (req, res) => {
  const playerId = requirePlayerId(req, res);
  if (!playerId) return;
  try {
    const db = req.db;
    const now = new Date().toISOString();
    await db.transaction(async (tx: any) => {
      await tx.run('DELETE FROM player_avatars WHERE player_id = ?', [playerId]);
      await tx.run('INSERT OR IGNORE INTO player_avatar_repository_suppression (player_id, created_at) VALUES (?, ?)', [playerId, now]);
      await tx.run('UPDATE players SET profile_updated_at = ?, updated_at = ? WHERE id = ?', [now, now, playerId]);
    });
    return res.json({ success: true });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Не удалось удалить аватар' });
  }
});

export default router;
