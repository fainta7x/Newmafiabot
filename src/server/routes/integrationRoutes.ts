import { Router } from 'express';
import { requireOrganizerAuth } from '../auth.ts';
import { getVkPublishingStatus } from '../services/vkPublishingService.ts';

const router = Router();

router.get('/vk/status', requireOrganizerAuth, (_req, res) => {
  const status = getVkPublishingStatus();
  res.json({
    provider: 'vk',
    configured: status.configured,
    group_id: status.group_id,
    api_version: status.api_version,
    missing: status.missing,
  });
});

export default router;
