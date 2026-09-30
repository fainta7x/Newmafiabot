import express from 'express';
import type { AuthenticatedRequest } from '../auth.ts';
import { requireOrganizerAuth } from '../auth.ts';
import {
  authenticateObsBridge,
  createObsPairingCode,
  getObsRemoteStatus,
  pairObsBridge,
  revokeObsBridge,
  updateObsBridgeHeartbeat,
} from '../services/obsRemoteService.ts';

const organizerRouter = express.Router();
const bridgeRouter = express.Router();

const bearerToken = (req: express.Request) => {
  const value = req.headers.authorization;
  return value?.startsWith('Bearer ') ? value.slice(7).trim() : null;
};

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

bridgeRouter.post('/pair', async (req: AuthenticatedRequest, res) => {
  const paired = await pairObsBridge(req.db, req.body?.code);
  if (!paired) return res.status(400).json({ error: 'Код неверный или уже истёк' });
  res.setHeader('Cache-Control', 'no-store');
  return res.json(paired);
});

bridgeRouter.post('/heartbeat', async (req: AuthenticatedRequest, res) => {
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
  });
  return res.status(204).end();
});

export { organizerRouter as obsRemoteOrganizerRoutes, bridgeRouter as obsRemoteBridgeRoutes };
