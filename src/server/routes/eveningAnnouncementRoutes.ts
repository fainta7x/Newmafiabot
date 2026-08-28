import { Router } from 'express';
import { requireOrganizerAuth } from '../auth.ts';
import { eveningSlotRoutes } from './eveningSlotRoutes.ts';
import eveningCloseoutRoutes from './eveningCloseoutRoutes.ts';
import {
  beginReminderCampaign,
  getReminderCampaignGeneration,
  loadAnnouncementOverview,
  loadReminderRecipients,
} from '../services/eveningAnnouncementTrackingService.ts';
import { loadEveningRecruitmentState } from '../services/eveningRecruitmentService.ts';
import { requestBotEveningRecruitment } from '../services/botTelegramSyncService.ts';
import {
  drainTelegramSyncOutbox,
  enqueueTelegramAnnouncement,
  enqueueTelegramEveningSync,
  enqueueTelegramReminder,
  getTelegramDispatchJob,
} from '../services/telegramSyncOutboxService.ts';

const router = Router();
router.use(eveningSlotRoutes);
router.use(eveningCloseoutRoutes);

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
    const overview = await loadAnnouncementOverview(req.db, String(req.params.id));
    if (!overview) return res.status(404).json({ error: 'Игровой вечер не найден' });
    return res.json(overview);
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Не удалось загрузить состояние рассылки' });
  }
});

router.get('/:id/recruitment-state', requireOrganizerAuth, async (req, res) => {
  try {
    const state = await loadEveningRecruitmentState(req.db, String(req.params.id));
    if (!state) return res.status(404).json({ error: 'Игровой вечер не найден' });
    return res.json(state);
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Не удалось посчитать недобор по играм' });
  }
});

router.post('/:id/sync-telegram', requireOrganizerAuth, async (req, res) => {
  try {
    const db = req.db;
    const evening = await db.get('SELECT id FROM game_evenings WHERE id = ?', [String(req.params.id)]);
    if (!evening) return res.status(404).json({ error: 'Игровой вечер не найден' });
    await enqueueTelegramEveningSync(db, String(req.params.id));
    const drain = await drainTelegramSyncOutbox(db, { limit: 50 });
    const queued = Boolean(await db.get(
      'SELECT sync_key FROM telegram_sync_outbox WHERE sync_key = ?',
      [`evening:${String(req.params.id)}`],
    ));
    return res.json({ success: true, queued, drain });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Не удалось поставить Telegram-синхронизацию в очередь' });
  }
});

router.post('/:id/announce', requireOrganizerAuth, async (req, res) => {
  try {
    const db = req.db;
    const availability = await loadActionableEvening(db, String(req.params.id));
    if (!availability.evening) return res.status(availability.status).json({ error: availability.error });

    const before = await loadAnnouncementOverview(db, String(req.params.id));
    await enqueueTelegramAnnouncement(db, String(req.params.id));
    const drain = await drainTelegramSyncOutbox(db, { limit: 50 });
    const queued = Boolean(await getTelegramDispatchJob(db, 'announcement', String(req.params.id)));
    const after = await loadAnnouncementOverview(db, String(req.params.id));
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
    const db = req.db;
    const eveningId = String(req.params.id);
    const availability = await loadActionableEvening(db, eveningId);
    if (!availability.evening) return res.status(availability.status).json({ error: availability.error });

    const state = await loadEveningRecruitmentState(db, eveningId);
    if (!state) return res.status(404).json({ error: 'Игровой вечер не найден' });
    if (!state.underfilled_slots.length) {
      return res.status(409).json({ error: 'Все игры уже набраны — добор не нужен' });
    }

    const delivery = await requestBotEveningRecruitment(eveningId);
    if (!delivery.success) {
      return res.status(delivery.status || 502).json({
        error: delivery.error || 'Не удалось отправить добирающий анонс в Telegram',
      });
    }

    return res.json({
      success: true,
      underfilled_slots: state.underfilled_slots,
      sent: Number(delivery.data?.sent || 0),
      results: delivery.data?.results || [],
    });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Не удалось отправить добирающий анонс' });
  }
});

router.post('/:id/remind-unanswered', requireOrganizerAuth, async (req, res) => {
  try {
    const db = req.db;
    const availability = await loadActionableEvening(db, String(req.params.id));
    if (!availability.evening) return res.status(availability.status).json({ error: availability.error });

    const existing = await getTelegramDispatchJob(db, 'reminder', String(req.params.id));
    const campaignGeneration = existing
      ? await getReminderCampaignGeneration(db, String(req.params.id))
      : await beginReminderCampaign(db, String(req.params.id));

    await enqueueTelegramReminder(db, String(req.params.id));
    const drain = await drainTelegramSyncOutbox(db, { limit: 50 });
    const queued = Boolean(await getTelegramDispatchJob(db, 'reminder', String(req.params.id)));
    const remaining = await loadReminderRecipients(db, String(req.params.id));
    const sentInCampaign = campaignGeneration > 0
      ? await db.get<any>(
          `SELECT COUNT(*) AS count
             FROM evening_announcement_dm_tracking
            WHERE evening_id = ? AND last_reminder_campaign = ?`,
          [String(req.params.id), campaignGeneration],
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
