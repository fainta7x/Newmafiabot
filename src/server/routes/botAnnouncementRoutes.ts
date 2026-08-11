import { Router } from 'express';
import { botServiceAuth } from '../botServiceAuth.ts';
import {
  loadInitialAnnouncementRecipients,
  loadReminderRecipients,
  recordInitialAnnouncementAttempt,
  recordReminderAttempt,
} from '../services/eveningAnnouncementTrackingService.ts';

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

    res.json({ evening_id: req.params.eveningId, state: state || null });
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

type OpenEveningResult = { error?: 'not_found' | 'closed'; evening?: any };

const requireOpenEvening = async (db: any, eveningId: string): Promise<OpenEveningResult> => {
  const evening = await db.get(
    'SELECT id, status, settled_at FROM game_evenings WHERE id = ?',
    [eveningId],
  );
  if (!evening) return { error: 'not_found' };
  if (!['published', 'active'].includes(String(evening.status)) || evening.settled_at) {
    return { error: 'closed' };
  }
  return { evening };
};

router.get('/evenings/:eveningId/announcement-recipients', async (req, res) => {
  try {
    const db = (req as any).db;
    const open = await requireOpenEvening(db, req.params.eveningId);
    if (open.error === 'not_found') return res.status(404).json({ error: 'Вечер не найден' });
    if (open.error === 'closed') return res.status(409).json({ error: 'Рассылка доступна только для опубликованного или активного вечера' });

    const result = await loadInitialAnnouncementRecipients(db, req.params.eveningId);
    if (!result) return res.status(404).json({ error: 'Вечер не найден' });
    res.json(result);
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

    const player = await db.get('SELECT id, telegram_user_id FROM players WHERE id = ?', [playerId]);
    const evening = await db.get('SELECT id FROM game_evenings WHERE id = ?', [req.params.eveningId]);
    if (!evening || !player || String(player.telegram_user_id || '') !== telegramUserId) {
      return res.status(404).json({ error: 'Вечер, игрок или Telegram-привязка не найдены' });
    }

    const result = await recordInitialAnnouncementAttempt(db, {
      eveningId: req.params.eveningId,
      playerId,
      telegramUserId,
      telegramMessageId,
      success: true,
    });
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'Не удалось сохранить доставку анонса' });
  }
});

router.post('/evenings/:eveningId/announcement-delivery-failure', async (req, res) => {
  try {
    const db = (req as any).db;
    const playerId = String(req.body?.player_id || '').trim();
    const telegramUserId = String(req.body?.telegram_user_id || '').trim();
    const errorText = String(req.body?.error || '').trim();
    if (!playerId || !telegramUserId) return res.status(400).json({ error: 'Некорректные данные попытки доставки' });

    const result = await recordInitialAnnouncementAttempt(db, {
      eveningId: req.params.eveningId,
      playerId,
      telegramUserId,
      success: false,
      error: errorText || 'Telegram delivery failed',
    });
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'Не удалось сохранить ошибку доставки' });
  }
});

router.get('/evenings/:eveningId/reminder-recipients', async (req, res) => {
  try {
    const db = (req as any).db;
    const open = await requireOpenEvening(db, req.params.eveningId);
    if (open.error === 'not_found') return res.status(404).json({ error: 'Вечер не найден' });
    if (open.error === 'closed') return res.status(409).json({ error: 'Напоминания доступны только для опубликованного или активного вечера' });

    const result = await loadReminderRecipients(db, req.params.eveningId);
    if (!result) return res.status(404).json({ error: 'Вечер не найден' });
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'Не удалось сформировать список напоминаний' });
  }
});

router.post('/evenings/:eveningId/reminder-attempt', async (req, res) => {
  try {
    const db = (req as any).db;
    const playerId = String(req.body?.player_id || '').trim();
    const telegramUserId = String(req.body?.telegram_user_id || '').trim();
    const success = Boolean(req.body?.success);
    const telegramMessageId = req.body?.telegram_message_id == null ? null : Number(req.body.telegram_message_id);
    const parsedMessageId = Number(telegramMessageId || 0);
    if (!playerId || !telegramUserId || (success && (!Number.isInteger(parsedMessageId) || parsedMessageId <= 0))) {
      return res.status(400).json({ error: 'Некорректные данные напоминания' });
    }

    const result = await recordReminderAttempt(db, {
      eveningId: req.params.eveningId,
      playerId,
      telegramUserId,
      success,
      telegramMessageId: success ? parsedMessageId : null,
      error: success ? null : String(req.body?.error || 'Telegram reminder failed'),
    });
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'Не удалось сохранить попытку напоминания' });
  }
});

export default router;
