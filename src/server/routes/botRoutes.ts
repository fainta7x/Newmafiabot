import { Router } from 'express';
import { botServiceAuth } from '../botServiceAuth.ts';

const router = Router();

// Protect all bot endpoints with service authorization
router.use(botServiceAuth);

router.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'mafia-webapp',
    api_version: '1'
  });
});

export default router;
