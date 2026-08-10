import { Router } from 'express';
import { requireOrganizerAuth } from '../auth.ts';

const router = Router();
const DEFAULT_BOT_SERVICE_URL = 'https://mafiabot-0vcb.onrender.com';

async function proxyAnnouncement(req: any, res: any, mode: 'announce' | 'announce-group') {
  try {
    const db = req.db;
    const evening = await db.get(
      'SELECT id, status, settled_at FROM game_evenings WHERE id = ?',
      [req.params.id],
    );
    if (!evening) return res.status(404).json({ error: 'Игровой вечер не найден' });
    if (!['published', 'active'].includes(String(evening.status)) || evening.settled_at) {
      return res.status(409).json({ error: 'Анонс можно отправить только для опубликованного или активного вечера' });
    }

    const botServiceUrl = String(process.env.BOT_SERVICE_URL || DEFAULT_BOT_SERVICE_URL).trim().replace(/\/+$/, '');
    const botApiSecret = String(process.env.BOT_API_SECRET || '').trim();
    if (!botServiceUrl || !botApiSecret) {
      return res.status(503).json({ error: 'Связь web → bot ещё не настроена' });
    }

    const response = await fetch(
      `${botServiceUrl}/crm/evenings/${encodeURIComponent(req.params.id)}/${mode}`,
      {
        method: 'POST',
        headers: {
          'X-Bot-Token': botApiSecret,
          'Content-Type': 'application/json',
        },
      },
    );

    let payload: any = null;
    try {
      payload = await response.json();
    } catch {
      payload = { error: 'Бот вернул некорректный ответ' };
    }

    return res.status(response.status).json(payload);
  } catch (error: any) {
    return res.status(502).json({ error: error?.message || 'Не удалось связаться с Telegram-ботом' });
  }
}

router.post('/:id/announce', requireOrganizerAuth, (req, res) => proxyAnnouncement(req, res, 'announce'));
router.post('/:id/announce-group', requireOrganizerAuth, (req, res) => proxyAnnouncement(req, res, 'announce-group'));

export default router;
