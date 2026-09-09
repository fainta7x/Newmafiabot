import { Router } from 'express';
import { getPlayerSessionId } from '../auth.ts';
import {
  loadPersonalNotificationPreference,
  resolvePersonalNotificationRouting,
  savePersonalNotificationPreference,
} from '../services/personalNotificationRouterService.ts';

const router = Router();

const requirePlayerId = (req: any, res: any): string | null => {
  const playerId = getPlayerSessionId(req);
  if (!playerId) {
    res.status(401).json({ error: 'Player authentication required.' });
    return null;
  }
  return playerId;
};

router.get('/notification-preferences', async (req, res) => {
  const playerId = requirePlayerId(req, res);
  if (!playerId) return;
  try {
    const [preference, routing] = await Promise.all([
      loadPersonalNotificationPreference(req.db, playerId),
      resolvePersonalNotificationRouting(req.db, playerId),
    ]);
    return res.json({
      ...preference,
      available_channels: routing.available_channels,
      effective_channel: routing.selected_channel,
    });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Не удалось загрузить настройки уведомлений' });
  }
});

router.put('/notification-preferences', async (req, res) => {
  const playerId = requirePlayerId(req, res);
  if (!playerId) return;
  const requestedChannel = req.body?.preferred_channel;
  if (requestedChannel !== undefined && !['auto', 'telegram', 'vk'].includes(String(requestedChannel))) {
    return res.status(400).json({ error: 'preferred_channel must be auto, telegram or vk' });
  }
  if (req.body?.personal_enabled !== undefined && typeof req.body.personal_enabled !== 'boolean') {
    return res.status(400).json({ error: 'personal_enabled must be boolean' });
  }
  try {
    const preference = await savePersonalNotificationPreference(req.db, playerId, {
      preferredChannel: requestedChannel,
      personalEnabled: req.body?.personal_enabled,
    });
    const routing = await resolvePersonalNotificationRouting(req.db, playerId);
    return res.json({
      ...preference,
      available_channels: routing.available_channels,
      effective_channel: routing.selected_channel,
    });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Не удалось сохранить настройки уведомлений' });
  }
});

export default router;
