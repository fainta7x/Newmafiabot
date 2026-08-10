import { Router } from 'express';
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

export default router;
