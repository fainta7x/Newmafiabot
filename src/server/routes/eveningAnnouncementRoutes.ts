import { Router } from 'express';
import { requireOrganizerAuth } from '../auth.ts';
import {
  beginReminderCampaign,
  getReminderCampaignGeneration,
  loadAnnouncementOverview,
  loadReminderRecipients,
} from '../services/eveningAnnouncementTrackingService.ts';
import {
  drainTelegramSyncOutbox,
  enqueueTelegramAnnouncement,
  enqueueTelegramEveningSync,
  enqueueTelegramReminder,
  getTelegramDispatchJob,
} from '../services/telegramSyncOutboxService.ts';

const router = Router();

// This router is mounted before the evening CRUD router. Database triggers record the
// sync intent transactionally; this middleware only nudges the durable outbox immediately
// after a successful response so normal updates still feel instant.
router.use((req: any, res: any, next) => {
  const oneId = req.path.match(/^\/([^/]+)$/);
  const settle = req.path.match(/^\/([^/]+)\/settle$/);
  const creationPath = req.method === 'POST' && ['/', '/create-next-friday', '/duplicate-last'].includes(req.path);
  const isPatch = req.method === 'PATCH' && Boolean(oneId);
  const isDelete = req.method === 'DELETE' && Boolean(oneId);
  const isSettle = req.method === 'POST' && Boolean(settle);

  if (!creationPath && !isPatch && !isDelete && !isSettle) return next();

  res.on('finish', () => {
    if (res.statusCode < 200 || res.statusCode >= 300) return;
    void drainTelegramSyncOutbox(req.db, { limit: 8 }).catch((error) => {
      console.warn('[TELEGRAM] Immediate outbox drain failed:', error);
    });
  });

  next();
});

async function loadActionableEvening(db: any, eveningId: string) {
  const evening = await db.get(
    'SELECT id, status, settled_at FROM game_evenings WHERE id = ?',
    [eveningId],
  );
  if (!evening) return { error: 'Игровой вечер не найден', status: 404 as const, evening: null };
  if (!['published', 'active'].includes(String(evening.status)) || evening.settled_at) {
    return {
      error: 'Действие доступно только для опубликованного или активного вечера',
      status: 409 as const,
      evening: null,
    };
  }
  return { error: null, status: 200 as const, evening };
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
  try {
    const db = (req as any).db;
    const evening = await db.get('SELECT id FROM game_evenings WHERE id = ?', [req.params.id]);
    if (!evening) return res.status(404).json({ error: 'Игровой вечер не найден' });
    await enqueueTelegramEveningSync(db, req.params.id);
    const drain = await drainTelegramSyncOutbox(db, { limit: 50 });
    const queued = Boolean(await db.get(
      'SELECT sync_key FROM telegram_sync_outbox WHERE sync_key = ?',
      [`evening:${req.params.id}`],
    ));
    return res.json({ success: true, queued, drain });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Не удалось поставить Telegram-синхронизацию в очередь' });
  }
});

router.post('/:id/announce', requireOrganizerAuth, async (req, res) => {
  try {
    const db = (req as any).db;
    const availability = await loadActionableEvening(db, req.params.id);
    if (!availability.evening) return res.status(availability.status).json({ error: availability.error });

    const before = await loadAnnouncementOverview(db, req.params.id);
    await enqueueTelegramAnnouncement(db, req.params.id);
    const drain = await drainTelegramSyncOutbox(db, { limit: 50 });
    const queued = Boolean(await getTelegramDispatchJob(db, 'announcement', req.params.id));
    const after = await loadAnnouncementOverview(db, req.params.id);
    const sentBefore = Number(before?.summary?.sent || 0);
    const sentAfter = Number(after?.summary?.sent || 0);

    return res.json({
      success: true,
      queued,
      drain,
      dm: {
        sent: Math.max(0, sentAfter - sentBefore),
        failed: Number(after?.summary?.failed || 0),
      },
    });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Не удалось поставить личную рассылку в очередь' });
  }
});

router.post('/:id/announce-group', requireOrganizerAuth, async (req, res) => {
  try {
    const db = (req as any).db;
    const availability = await loadActionableEvening(db, req.params.id);
    if (!availability.evening) return res.status(availability.status).json({ error: availability.error });

    await enqueueTelegramEveningSync(db, req.params.id);
    const drain = await drainTelegramSyncOutbox(db, { limit: 50 });
    const queued = Boolean(await db.get(
      'SELECT sync_key FROM telegram_sync_outbox WHERE sync_key = ?',
      [`evening:${req.params.id}`],
    ));
    return res.json({ success: true, queued, drain });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Не удалось поставить групповую публикацию в очередь' });
  }
});

router.post('/:id/remind-unanswered', requireOrganizerAuth, async (req, res) => {
  try {
    const db = (req as any).db;
    const availability = await loadActionableEvening(db, req.params.id);
    if (!availability.evening) return res.status(availability.status).json({ error: availability.error });

    const existing = await getTelegramDispatchJob(db, 'reminder', req.params.id);
    const campaignGeneration = existing
      ? await getReminderCampaignGeneration(db, req.params.id)
      : await beginReminderCampaign(db, req.params.id);

    await enqueueTelegramReminder(db, req.params.id);
    const drain = await drainTelegramSyncOutbox(db, { limit: 50 });
    const queued = Boolean(await getTelegramDispatchJob(db, 'reminder', req.params.id));
    const remaining = await loadReminderRecipients(db, req.params.id);
    const sentInCampaign = campaignGeneration > 0
      ? await db.get<any>(
          `SELECT COUNT(*) AS count
             FROM evening_announcement_dm_tracking
            WHERE evening_id = ? AND last_reminder_campaign = ?`,
          [req.params.id, campaignGeneration],
        )
      : null;

    return res.json({
      success: true,
      queued,
      drain,
      campaign_generation: campaignGeneration,
      sent: Number(sentInCampaign?.count || 0),
      failed: queued ? Number(remaining?.recipients?.length || 0) : 0,
    });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Не удалось поставить напоминания в очередь' });
  }
});

export default router;
