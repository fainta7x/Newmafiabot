import { Router } from 'express';
import { getPlayerSessionId } from '../auth.ts';
import {
  loadPersonalNotificationPreference,
  queuePersonalNotification,
  resolvePersonalNotificationRouting,
  savePersonalNotificationPreference,
} from '../services/personalNotificationRouterService.ts';
import { getVkPersonalDeliveryStatus } from '../services/vkMessageOutboxService.ts';

const router = Router();
const requirePlayerId = (req: any, res: any): string | null => {
  const playerId = getPlayerSessionId(req);
  if (!playerId) { res.status(401).json({ error: 'Player authentication required.' }); return null; }
  return playerId;
};

const payloadFor = async (db: any, playerId: string) => {
  const [preference, routing, vk] = await Promise.all([
    loadPersonalNotificationPreference(db, playerId),
    resolvePersonalNotificationRouting(db, playerId),
    getVkPersonalDeliveryStatus(db, playerId),
  ]);
  return {
    ...preference,
    available_channels: routing.available_channels,
    effective_channel: routing.selected_channel,
    channel_status: {
      telegram: { linked: routing.available_channels.includes('telegram'), available: routing.available_channels.includes('telegram') },
      vk: { linked: routing.available_channels.includes('vk'), available: routing.available_channels.includes('vk') && vk.permission_granted, problem: vk.permission_problem },
    },
  };
};

router.get('/notification-preferences', async (req, res) => {
  const playerId = requirePlayerId(req, res); if (!playerId) return;
  try { return res.json(await payloadFor(req.db, playerId)); }
  catch (error: any) { return res.status(500).json({ error: error?.message || 'Не удалось загрузить настройки уведомлений' }); }
});

router.put('/notification-preferences', async (req, res) => {
  const playerId = requirePlayerId(req, res); if (!playerId) return;
  const requestedChannel = req.body?.preferred_channel;
  if (requestedChannel !== undefined && !['auto', 'telegram', 'vk'].includes(String(requestedChannel))) return res.status(400).json({ error: 'preferred_channel must be auto, telegram or vk' });
  if (req.body?.personal_enabled !== undefined && typeof req.body.personal_enabled !== 'boolean') return res.status(400).json({ error: 'personal_enabled must be boolean' });
  try {
    const routingBefore = await resolvePersonalNotificationRouting(req.db, playerId);
    if (requestedChannel && requestedChannel !== 'auto' && !routingBefore.available_channels.includes(requestedChannel)) {
      return res.status(409).json({ error: 'Этот канал не привязан к профилю' });
    }
    await savePersonalNotificationPreference(req.db, playerId, { preferredChannel: requestedChannel, personalEnabled: req.body?.personal_enabled });
    return res.json(await payloadFor(req.db, playerId));
  } catch (error: any) { return res.status(500).json({ error: error?.message || 'Не удалось сохранить настройки уведомлений' }); }
});

router.post('/notification-preferences/test', async (req, res) => {
  const playerId = requirePlayerId(req, res); if (!playerId) return;
  try {
    const recent = await req.db.get<any>(`SELECT notification_key FROM personal_notification_deliveries WHERE player_id=? AND event_type='test_notification' AND datetime(created_at) >= datetime('now','-30 seconds') LIMIT 1`, [playerId]);
    if (recent) return res.status(429).json({ error: 'Тестовое уведомление уже отправлялось. Подождите немного.' });
    const key = `test:${playerId}:${Math.floor(Date.now() / 30_000)}`;
    const result = await queuePersonalNotification(req.db, {
      notificationKey: key,
      playerId,
      eventType: 'test_notification',
      text: '✅ Тест уведомлений 2LA Noire. Если вы видите это сообщение, личный канал работает.',
      actionPath: '/player/profile',
    });
    return res.json({ success: true, channel: result.delivery?.selected_channel || null, status: result.delivery?.status || null });
  } catch (error: any) { return res.status(500).json({ error: error?.message || 'Не удалось отправить тестовое уведомление' }); }
});

export default router;
