import { Router } from 'express';
import { requireOrganizerAuth } from '../auth.ts';
import { loadAnnouncementOverview } from '../services/eveningAnnouncementTrackingService.ts';
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
  const creationPath = req.method === 'POST' && ['/', '/create-next-friday', '/duplicate-last'].includes(req.path);
  const isPatch = req.method === 'PATCH' && Boolean(oneId);
  const isDelete = req.method === 'DELETE' && Boolean(oneId);
  const isSettle = req.method === 'POST' && Boolean(settle);

  if (!creationPath && !isPatch && !isDelete && !isSettle) return next();

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

const botConnection = () => ({
  url: String(process.env.BOT_SERVICE_URL || DEFAULT_BOT_SERVICE_URL).trim().replace(/\/+$/, ''),
  secret: String(process.env.BOT_API_SECRET || '').trim(),
});

async function proxyBotAction(req: any, res: any, action: 'announce' | 'announce-group' | 'remind-unanswered') {
  try {
    const db = req.db;
    const evening = await db.get(
      'SELECT id, status, settled_at FROM game_evenings WHERE id = ?',
      [req.params.id],
    );
    if (!evening) return res.status(404).json({ error: 'Игровой вечер не найден' });
    if (!['published', 'active'].includes(String(evening.status)) || evening.settled_at) {
      return res.status(409).json({ error: 'Действие доступно только для опубликованного или активного вечера' });
    }

    const connection = botConnection();
    if (!connection.url || !connection.secret) {
      return res.status(503).json({ error: 'Связь web → bot ещё не настроена' });
    }

    const response = await fetch(
      `${connection.url}/crm/evenings/${encodeURIComponent(req.params.id)}/${action}`,
      {
        method: 'POST',
        headers: {
          'X-Bot-Token': connection.secret,
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

router.get('/:id/announcement-overview', requireOrganizerAuth, async (req, res) => {
  try {
    const overview = await loadAnnouncementOverview((req as any).db, req.params.id);
    if (!overview) return res.status(404).json({ error: 'Игровой вечер не найден' });
    return res.json(overview);
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Не удалось загрузить состояние рассылки' });
  }
});

router.post('/:id/sync-telegram', requireOrganizerAuth, async (req, res) => {
  const db = (req as any).db;
  const evening = await db.get('SELECT id FROM game_evenings WHERE id = ?', [req.params.id]);
  if (!evening) return res.status(404).json({ error: 'Игровой вечер не найден' });
  const result = await requestBotEveningTelegramSync(req.params.id);
  return res.status(result.success ? 200 : result.status || 502).json(
    result.success ? result.data : { error: result.error, bot: result.data || null },
  );
});

router.post('/:id/announce', requireOrganizerAuth, (req, res) => proxyBotAction(req, res, 'announce'));
router.post('/:id/announce-group', requireOrganizerAuth, (req, res) => proxyBotAction(req, res, 'announce-group'));
router.post('/:id/remind-unanswered', requireOrganizerAuth, (req, res) => proxyBotAction(req, res, 'remind-unanswered'));

export default router;
