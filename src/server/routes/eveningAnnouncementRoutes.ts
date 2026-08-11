import { Router } from 'express';
import { requireOrganizerAuth } from '../auth.ts';
import {
  requestBotEveningTelegramSync,
  requestBotPublicRouterSync,
} from '../services/botTelegramSyncService.ts';

const router = Router();
const DEFAULT_BOT_SERVICE_URL = 'https://mafiabot-0vcb.onrender.com';

const logBestEffortSync = async (eveningId: string | null, publicOnly = false) => {
  try {
    const result = publicOnly || !eveningId
      ? await requestBotPublicRouterSync()
      : await requestBotEveningTelegramSync(eveningId);
    if (!result.success) {
      console.warn('[TELEGRAM] Background sync failed:', eveningId || 'public-router', result.error);
    }
  } catch (error) {
    console.warn('[TELEGRAM] Background sync threw:', eveningId || 'public-router', error);
  }
};

// This router is mounted before the evening CRUD router. Observe successful event mutations
// and synchronize Telegram afterwards without making a Telegram outage fail the CRM write.
router.use((req: any, res: any, next) => {
  const oneId = req.path.match(/^\/([^/]+)$/);
  const settle = req.path.match(/^\/([^/]+)\/settle$/);
  const isCreate = req.method === 'POST' && req.path === '/';
  const isPatch = req.method === 'PATCH' && Boolean(oneId);
  const isDelete = req.method === 'DELETE' && Boolean(oneId);
  const isSettle = req.method === 'POST' && Boolean(settle);

  if (!isCreate && !isPatch && !isDelete && !isSettle) return next();

  let responseBody: any = null;
  const originalJson = res.json.bind(res);
  res.json = (body: any) => {
    responseBody = body;
    return originalJson(body);
  };

  res.on('finish', () => {
    if (res.statusCode < 200 || res.statusCode >= 300) return;
    if (isDelete) {
      void logBestEffortSync(null, true);
      return;
    }
    const eveningId = String(
      responseBody?.id || responseBody?.evening?.id || settle?.[1] || oneId?.[1] || '',
    ).trim();
    if (eveningId) void logBestEffortSync(eveningId);
  });

  next();
});

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

router.post('/:id/sync-telegram', requireOrganizerAuth, async (req, res) => {
  const db = (req as any).db;
  const evening = await db.get('SELECT id FROM game_evenings WHERE id = ?', [req.params.id]);
  if (!evening) return res.status(404).json({ error: 'Игровой вечер не найден' });
  const result = await requestBotEveningTelegramSync(req.params.id);
  return res.status(result.success ? 200 : result.status || 502).json(
    result.success ? result.data : { error: result.error, bot: result.data || null },
  );
});

router.post('/:id/announce', requireOrganizerAuth, (req, res) => proxyAnnouncement(req, res, 'announce'));
router.post('/:id/announce-group', requireOrganizerAuth, (req, res) => proxyAnnouncement(req, res, 'announce-group'));

export default router;
