import { Router } from 'express';
import { playerLevelAllowsEveningFormat } from '../../db/ensureInviteAudienceSchema.ts';
import { botServiceAuth } from '../botServiceAuth.ts';

const router = Router();
router.use(botServiceAuth);

async function ensureAnnouncementStateTable(db: any): Promise<void> {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS evening_announcement_state (
      evening_id TEXT PRIMARY KEY REFERENCES game_evenings(id) ON DELETE CASCADE,
      group_chat_id TEXT,
      group_announcement_message_id INTEGER,
      group_stats_message_id INTEGER,
      group_sent_at TEXT,
      dm_sent_at TEXT,
      updated_at TEXT NOT NULL
    );
  `);
}

async function ensureDmDeliveryTable(db: any): Promise<void> {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS evening_announcement_dm_delivery (
      evening_id TEXT NOT NULL REFERENCES game_evenings(id) ON DELETE CASCADE,
      player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      telegram_user_id TEXT NOT NULL,
      telegram_message_id INTEGER,
      sent_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (evening_id, player_id)
    );
  `);
}

router.get('/evenings/:eveningId/announcement-state', async (req, res) => {
  try {
    const db = (req as any).db;
    const evening = await db.get('SELECT id FROM game_evenings WHERE id = ?', [req.params.eveningId]);
    if (!evening) return res.status(404).json({ error: 'Вечер не найден' });

    await ensureAnnouncementStateTable(db);
    const state = await db.get(
      `SELECT evening_id, group_chat_id, group_announcement_message_id,
              group_stats_message_id, group_sent_at, dm_sent_at, updated_at
       FROM evening_announcement_state
       WHERE evening_id = ?`,
      [req.params.eveningId],
    );

    res.json({
      evening_id: req.params.eveningId,
      state: state || null,
    });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'Не удалось загрузить состояние анонса' });
  }
});

router.patch('/evenings/:eveningId/announcement-state', async (req, res) => {
  try {
    const db = (req as any).db;
    const evening = await db.get('SELECT id FROM game_evenings WHERE id = ?', [req.params.eveningId]);
    if (!evening) return res.status(404).json({ error: 'Вечер не найден' });

    await ensureAnnouncementStateTable(db);

    const allowed = [
      'group_chat_id',
      'group_announcement_message_id',
      'group_stats_message_id',
      'group_sent_at',
      'dm_sent_at',
    ] as const;

    const updates: string[] = [];
    const params: any[] = [];
    for (const key of allowed) {
      if (!Object.prototype.hasOwnProperty.call(req.body || {}, key)) continue;
      const raw = req.body[key];
      if ((key === 'group_announcement_message_id' || key === 'group_stats_message_id') && raw !== null) {
        const parsed = Number(raw);
        if (!Number.isInteger(parsed) || parsed <= 0) {
          return res.status(400).json({ error: `${key} должен быть положительным целым числом или null` });
        }
        updates.push(`${key} = ?`);
        params.push(parsed);
      } else if (raw === null) {
        updates.push(`${key} = ?`);
        params.push(null);
      } else {
        updates.push(`${key} = ?`);
        params.push(String(raw));
      }
    }

    if (!updates.length) return res.status(400).json({ error: 'Нет допустимых полей для обновления' });

    const now = new Date().toISOString();
    await db.run(
      `INSERT OR IGNORE INTO evening_announcement_state (evening_id, updated_at) VALUES (?, ?)`,
      [req.params.eveningId, now],
    );
    params.push(now, req.params.eveningId);
    await db.run(
      `UPDATE evening_announcement_state
       SET ${updates.join(', ')}, updated_at = ?
       WHERE evening_id = ?`,
      params,
    );

    const state = await db.get(
      `SELECT evening_id, group_chat_id, group_announcement_message_id,
              group_stats_message_id, group_sent_at, dm_sent_at, updated_at
       FROM evening_announcement_state
       WHERE evening_id = ?`,
      [req.params.eveningId],
    );
    res.json({ success: true, state });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'Не удалось сохранить состояние анонса' });
  }
});

router.get('/evenings/:eveningId/announcement-recipients', async (req, res) => {
  try {
    const db = (req as any).db;
    const evening = await db.get(
      'SELECT id, title, starts_at, venue, format, status, settled_at FROM game_evenings WHERE id = ?',
      [req.params.eveningId],
    );
    if (!evening) return res.status(404).json({ error: 'Вечер не найден' });
    if (!['published', 'active'].includes(String(evening.status)) || evening.settled_at) {
      return res.status(409).json({ error: 'Рассылка доступна только для опубликованного или активного вечера' });
    }

    await ensureDmDeliveryTable(db);
    const players = await db.all(
      `SELECT p.id, p.nickname, p.telegram_user_id, p.contact_status, p.lifecycle_status,
              p.do_not_invite_until, p.game_level,
              d.sent_at AS announcement_sent_at
       FROM players p
       LEFT JOIN evening_announcement_dm_delivery d
         ON d.evening_id = ? AND d.player_id = p.id
       WHERE p.telegram_user_id IS NOT NULL AND TRIM(p.telegram_user_id) != ''
       ORDER BY p.nickname COLLATE NOCASE ASC`,
      [req.params.eveningId],
    );

    const now = Date.now();
    const recipients = players.filter((player: any) => {
      if (player.announcement_sent_at) return false;
      const contactStatus = String(
        player.contact_status || (player.lifecycle_status === 'blocked' ? 'blocked' : player.lifecycle_status === 'paused' ? 'paused' : 'normal'),
      );
      if (contactStatus !== 'normal') return false;
      if (player.do_not_invite_until) {
        const until = new Date(String(player.do_not_invite_until)).getTime();
        if (Number.isFinite(until) && until > now) return false;
      }
      return playerLevelAllowsEveningFormat(player.game_level, evening.format);
    }).map((player: any) => ({
      id: String(player.id),
      nickname: String(player.nickname || 'Игрок'),
      telegram_user_id: String(player.telegram_user_id),
      game_level: String(player.game_level || 'club'),
    }));

    res.json({ evening, recipients });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'Не удалось сформировать список адресатов' });
  }
});

router.post('/evenings/:eveningId/announcement-delivery', async (req, res) => {
  try {
    const db = (req as any).db;
    const playerId = String(req.body?.player_id || '').trim();
    const telegramUserId = String(req.body?.telegram_user_id || '').trim();
    const telegramMessageId = Number(req.body?.telegram_message_id || 0);
    if (!playerId || !telegramUserId || !Number.isInteger(telegramMessageId) || telegramMessageId <= 0) {
      return res.status(400).json({ error: 'Некорректные данные доставки' });
    }

    const evening = await db.get('SELECT id FROM game_evenings WHERE id = ?', [req.params.eveningId]);
    if (!evening) return res.status(404).json({ error: 'Вечер не найден' });
    const player = await db.get('SELECT id, telegram_user_id FROM players WHERE id = ?', [playerId]);
    if (!player || String(player.telegram_user_id || '') !== telegramUserId) {
      return res.status(404).json({ error: 'Игрок или Telegram-привязка не найдены' });
    }

    await ensureDmDeliveryTable(db);
    const now = new Date().toISOString();
    await db.run(
      `INSERT OR REPLACE INTO evening_announcement_dm_delivery
         (evening_id, player_id, telegram_user_id, telegram_message_id, sent_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [req.params.eveningId, playerId, telegramUserId, telegramMessageId, now, now],
    );
    res.json({ success: true, sent_at: now });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'Не удалось сохранить доставку анонса' });
  }
});

export default router;
