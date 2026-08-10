import express from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { DatabaseWrapper, getDb } from './db/index.ts';
import { ensureInviteAudienceSchema } from './db/ensureInviteAudienceSchema.ts';
import { ensureRatingPeriodsSchema } from './db/ensureRatingPeriodsSchema.ts';
import { ensureTournamentDistanceSchema } from './db/ensureTournamentDistanceSchema.ts';
import { parseUserSession, requireOrganizerAuth } from './server/auth.ts';

import authRoutes from './server/routes/authRoutes.ts';
import playerSelfRoutes from './server/routes/playerSelfRoutes.ts';
import eveningsRoutes from './server/routes/eveningsRoutes.ts';
import eveningAnnouncementRoutes from './server/routes/eveningAnnouncementRoutes.ts';
import participantRoutes from './server/routes/participantRoutes.ts';
import playersRoutes from './server/routes/playersRoutes.ts';
import playerTokensRoutes from './server/routes/playerTokensRoutes.ts';
import ratingRoutes from './server/routes/ratingRoutes.ts';
import ratingPeriodRoutes from './server/routes/ratingPeriodRoutes.ts';
import tasksRoutes from './server/routes/tasksRoutes.ts';
import analyticsRoutes from './server/routes/analyticsRoutes.ts';
import gamesRoutes from './server/routes/gamesRoutes.ts';
import crmRoutes from './server/routes/crmRoutes.ts';
import publicRoutes from './server/routes/publicRoutes.ts';
import tournamentsRoutes from './server/routes/tournamentsRoutes.ts';
import protocolImportsRoutes from './server/routes/protocolImportsRoutes.ts';
import tournamentProtocolRoutes from './server/routes/tournamentProtocolRoutes.ts';
import tournamentAwardsRoutes from './server/routes/tournamentAwardsRoutes.ts';
import botRoutes from './server/routes/botRoutes.ts';
import botAnnouncementRoutes from './server/routes/botAnnouncementRoutes.ts';
import { reconcileAllPlayerAchievements } from './server/services/playerAchievementsService.ts';
import { reconcileTokenOpeningBalances } from './server/services/tokenLedgerService.ts';

export async function createApp(customDb?: DatabaseWrapper) {
  const app = express();
  app.set('trust proxy', 1);

  app.use(
    helmet({
      contentSecurityPolicy: false,
    })
  );

  app.use(express.json({ limit: '2mb' }));
  app.use((err: any, _req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (err && (err.status === 413 || err.type === 'entity.too.large' || err.code === 'LIMIT_FILE_SIZE')) {
      return res.status(413).json({ error: 'Размер резервной копии превышает допустимый лимит (2 MB)' });
    }
    next(err);
  });
  app.use(cookieParser());

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  const db = customDb || (await getDb());
  await ensureInviteAudienceSchema(db);
  await ensureRatingPeriodsSchema(db);
  await ensureTournamentDistanceSchema(db);
  try {
    await reconcileTokenOpeningBalances(db);
  } catch (error) {
    console.error('[TOKENS] Opening-balance reconciliation failed:', error);
  }
  try {
    await reconcileAllPlayerAchievements(db);
  } catch (error) {
    console.error('[ACHIEVEMENTS] Backfill reconciliation failed:', error);
  }
  app.use((req, _res, next) => {
    (req as any).db = db;
    next();
  });

  app.use(parseUserSession);

  app.use('/api/auth', authRoutes);
  app.use('/api/player', playerSelfRoutes);
  app.use('/api/rating', ratingRoutes);
  app.use('/api/rating-periods', ratingPeriodRoutes);
  app.use('/api/crm', crmRoutes);
  app.use('/api/public', publicRoutes);
  app.use('/api/evenings', eveningAnnouncementRoutes);
  app.use('/api/evenings', eveningsRoutes);
  app.use('/api/participant', participantRoutes);
  app.use('/api/evening-participants', participantRoutes);
  app.use('/api/players', playerTokensRoutes);
  app.use('/api/players', playersRoutes);
  app.use('/api/tasks', tasksRoutes);
  app.use('/api/analytics', analyticsRoutes);
  app.post('/api/games', requireOrganizerAuth, (_req, res) => {
    res.status(410).json({ error: 'Legacy game creation route retired; use the evening/tournament protocol workflow' });
  });
  app.use('/api/games', gamesRoutes);
  app.use('/api/tournaments', tournamentsRoutes);
  app.use('/api/tournaments', protocolImportsRoutes);
  app.use('/api/tournaments', tournamentProtocolRoutes);
  app.use('/api/tournaments', tournamentAwardsRoutes);
  app.use('/api/bot', botRoutes);
  app.use('/api/bot', botAnnouncementRoutes);

  app.use('/api/*', (_req, res) => {
    res.status(404).json({ error: 'API endpoint not found' });
  });

  app.use('/api/*', (err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('API Error:', err);
    res.status(err.status || 500).json({ error: err.message || 'Внутренняя ошибка сервера' });
  });

  if (process.env.NODE_ENV !== 'production' && !process.env.VITEST) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else if (process.env.NODE_ENV === 'production') {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  return app;
}
