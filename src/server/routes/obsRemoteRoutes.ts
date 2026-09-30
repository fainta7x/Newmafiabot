import express from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import type { AuthenticatedRequest } from '../auth.ts';
import { requireOrganizerAuth } from '../auth.ts';
import {
  authenticateObsBridge,
  createObsPairingCode,
  getObsRemoteStatus,
  pairObsBridge,
  queueObsCommand,
  revokeObsBridge,
  takeObsCommands,
  updateObsBridgeHeartbeat,
} from '../services/obsRemoteService.ts';

const organizerRouter = express.Router();
const bridgeRouter = express.Router();

// express-rate-limit keeps its counters in memory; the laptop page sends a heartbeat every ~3 s.
const limiter = (max: number, windowMs: number, message: string) => rateLimit({
  windowMs, limit: max, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: message },
});
const pairLimiter = limiter(20, 10 * 60 * 1000, 'Слишком много попыток подключения. Попробуйте позже.');
const heartbeatLimiter = limiter(120, 60 * 1000, 'Слишком много запросов от OBS-моста. Попробуйте позже.');
const organizerLimiter = limiter(240, 60 * 1000, 'Слишком много запросов. Подождите немного.');

/** Tests create many apps in one process; the counters are shared, so they are reset between tests. */
export const resetObsRemoteRateLimitsForTests = () => {
  for (const item of [pairLimiter, heartbeatLimiter, organizerLimiter]) void item.resetKey('::ffff:127.0.0.1');
  for (const item of [pairLimiter, heartbeatLimiter, organizerLimiter]) void item.resetKey('127.0.0.1');
  for (const item of [pairLimiter, heartbeatLimiter, organizerLimiter]) void item.resetKey('::1');
};

const bearerToken = (req: express.Request) => {
  const value = req.headers.authorization;
  return value?.startsWith('Bearer ') ? value.slice(7).trim() : null;
};

organizerRouter.use(organizerLimiter);

organizerRouter.get('/status', requireOrganizerAuth, async (req: AuthenticatedRequest, res) => {
  res.setHeader('Cache-Control', 'no-store');
  return res.json(await getObsRemoteStatus(req.db));
});

organizerRouter.post('/pairing-code', requireOrganizerAuth, async (req: AuthenticatedRequest, res) => {
  res.setHeader('Cache-Control', 'no-store');
  return res.json(await createObsPairingCode(req.db));
});

organizerRouter.post('/revoke', requireOrganizerAuth, async (req: AuthenticatedRequest, res) => {
  await revokeObsBridge(req.db);
  return res.status(204).end();
});

const commandSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('scene'), scene: z.string().trim().min(1).max(160) }),
  z.object({ type: z.literal('stream'), action: z.enum(['start', 'stop']) }),
  z.object({ type: z.literal('record'), action: z.enum(['start', 'stop']) }),
  z.object({ type: z.literal('mute'), input: z.string().trim().min(1).max(160), muted: z.boolean() }),
]);

// A button on the phone: switch the scene, start/stop the stream or recording, mute a sound.
organizerRouter.post('/command', requireOrganizerAuth, async (req: AuthenticatedRequest, res) => {
  const parsed = commandSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Неизвестная команда' });
  const queued = queueObsCommand(req.db, parsed.data);
  if ('error' in queued) return res.status(409).json(queued);
  return res.status(202).json(queued);
});

bridgeRouter.post('/pair', pairLimiter, async (req: AuthenticatedRequest, res) => {
  const paired = await pairObsBridge(req.db, req.body?.code);
  if (!paired) return res.status(400).json({ error: 'Код неверный или уже истёк' });
  res.setHeader('Cache-Control', 'no-store');
  return res.json(paired);
});

bridgeRouter.post('/heartbeat', heartbeatLimiter, async (req: AuthenticatedRequest, res) => {
  const token = bearerToken(req);
  if (!await authenticateObsBridge(req.db, token)) {
    return res.status(401).json({ error: 'Ноутбук больше не привязан. Получите новый код в приложении.' });
  }
  await updateObsBridgeHeartbeat(req.db, {
    obs_connected: req.body?.obs_connected === true,
    obs_version: req.body?.obs_version,
    websocket_version: req.body?.websocket_version,
    current_scene: req.body?.current_scene,
    stream_active: req.body?.stream_active === true,
    recording_active: req.body?.recording_active === true,
    last_error: req.body?.last_error,
    scenes: Array.isArray(req.body?.scenes) ? req.body.scenes : [],
    audio_inputs: Array.isArray(req.body?.audio_inputs) ? req.body.audio_inputs : [],
  });
  res.setHeader('Cache-Control', 'no-store');
  // Commands from the phone ride back on the heartbeat answer.
  return res.json({ commands: req.body?.obs_connected === true ? takeObsCommands(req.db) : [] });
});

export { organizerRouter as obsRemoteOrganizerRoutes, bridgeRouter as obsRemoteBridgeRoutes };
