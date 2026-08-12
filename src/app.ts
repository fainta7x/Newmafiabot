import express from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { DatabaseWrapper, getDb } from './db/index.ts';
import { ensureAdminDataSchema } from './db/ensureAdminDataSchema.ts';
import { ensureEloSeedSchema } from './db/ensureEloSeedSchema.ts';
import { ensureInviteAudienceSchema } from './db/ensureInviteAudienceSchema.ts';
import { ensureJudgeAuthoritySchema } from './db/ensureJudgeAuthoritySchema.ts';
import { ensurePlayerBettingSchema } from './db/ensurePlayerBettingSchema.ts';
import { ensurePlayerShopSchema } from './db/ensurePlayerShopSchema.ts';
import { ensureRatingPeriodsSchema } from './db/ensureRatingPeriodsSchema.ts';
import { ensureTelegramPublishingSchema } from './db/ensureTelegramPublishingSchema.ts';
import { ensureTournamentDistanceSchema } from './db/ensureTournamentDistanceSchema.ts';
import { ensureTournamentGameTokenSchema } from './db/ensureTournamentGameTokenSchema.ts';
import { parseUserSession, requireOrganizerAuth } from './server/auth.ts';

import authRoutes from './server/routes/authRoutes.ts';
import playerJudgingRoutes from './server/routes/playerJudgingRoutes.ts';
import playerSelfRoutes from './server/routes/playerSelfRoutes.ts';
import playerLiveRoutes from './server/routes/playerLiveRoutes.ts';
import playerPulseRoutes from './server/routes/playerPulseRoutes.ts';
import playerStoriesRoutes from './server/routes/playerStoriesRoutes.ts';
import playerEveningVotingRoutes from './server/routes/playerEveningVotingRoutes.ts';
import playerProgressionRoutes from './server/routes/playerProgressionRoutes.ts';
import playerProfileSettingsRoutes from './server/routes/playerProfileSettingsRoutes.ts';
import playerGameDetailRoutes from './server/routes/playerGameDetailRoutes.ts';
import playerRatingPeriodRoutes from './server/routes/playerRatingPeriodRoutes.ts';
import playerEconomyRoutes from './server/routes/playerEconomyRoutes.ts';
import playerBettingRoutes from './server/routes/playerBettingRoutes.ts';
import playerPaymentRoutes from './server/routes/playerPaymentRoutes.ts';
import adminDataRoutes from './server/routes/adminDataRoutes.ts';
import organizerBettingRoutes from './server/routes/organizerBettingRoutes.ts';
import eveningsRoutes from './server/routes/eveningsRoutes.ts';
import eveningAnnouncementRoutes from './server/routes/eveningAnnouncementRoutes.ts';
import participantRoutes from './server/routes/participantRoutes.ts';
import eloSeedAdminRoutes from './server/routes/eloSeedAdminRoutes.ts';
import playersRoutes from './server/routes/playersRoutes.ts';
import playerTokensRoutes from './server/routes/playerTokensRoutes.ts';
import ratingRoutes from './server/routes/ratingRoutes.ts';
import ratingPeriodRoutes from './server/routes/ratingPeriodRoutes.ts';
import ratingPeriodStandingsRoutes from './server/routes/ratingPeriodStandingsRoutes.ts';
import tasksRoutes from './server/routes/tasksRoutes.ts';
import analyticsRoutes from './server/routes/analyticsRoutes.ts';
import gamesRoutes from './server/routes/gamesRoutes.ts';
import crmRoutes from './server/routes/crmRoutes.ts';
import publicRoutes from './server/routes/publicRoutes.ts';
import flexibleTournamentResultsRoutes from './server/routes/flexibleTournamentResultsRoutes.ts';
import judgeAuthorityAdminRoutes from './server/routes/judgeAuthorityAdminRoutes.ts';
import tournamentTelegramRoutes from './server/routes/tournamentTelegramRoutes.ts';
import tournamentsRoutes from './server/routes/tournamentsRoutes.ts';
import protocolImportsRoutes from './server/routes/protocolImportsRoutes.ts';
import tournamentProtocolRoutes from './server/routes/tournamentProtocolRoutes.ts';
import tournamentTokenSettlementRoutes from './server/routes/tournamentTokenSettlementRoutes.ts';
import tournamentAwardsRoutes from './server/routes/tournamentAwardsRoutes.ts';
import botRoutes from './server/routes/botRoutes.ts';
import botAnnouncementRoutes from './server/routes/botAnnouncementRoutes.ts';
import botTelegramRoutes from './server/routes/botTelegramRoutes.ts';
import telegramSettingsRoutes from './server/routes/telegramSettingsRoutes.ts';
import systemStatusRoutes from './server/routes/systemStatusRoutes.ts';
import { reconcileAllPlayerAchievements } from './server/services/playerAchievementsService.ts';
import { reconcileAllBettingPools } from './server/services/bettingPoolService.ts';
import { reconcileTokenOpeningBalances } from './server/services/tokenLedgerService.ts';
import { reconcileAllTournamentGameTokenSettlements } from './server/services/tournamentGameTokenSettlementService.ts';
import { startTelegramSyncOutboxWorker } from './server/services/telegramSyncOutboxService.ts';

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
  await ensureJudgeAuthoritySchema(db);
  await ensureEloSeedSchema(db);
  await ensurePlayerShopSchema(db);
  await ensurePlayerBettingSchema(db);
  await ensureRatingPeriodsSchema(db);
  await ensureTournamentDistanceSchema(db);
  await ensureTournamentGameTokenSchema(db);
  await ensureAdminDataSchema(db);
  await ensureTelegramPublishingSchema(db);
  if (!process.env.VITEST && process.env.NODE_ENV !== 'test') {
    startTelegramSyncOutboxWorker(db);
  }
  try {
    await reconcileTokenOpeningBalances(db);
  } catch (error) {
    console.error('[TOKENS] Opening-balance reconciliation failed:', error);
  }
  try {
    await reconcileAllTournamentGameTokenSettlements(db);
  } catch (error) {
    console.error('[TOKENS] Tournament settlement backfill failed:', error);
  }
  try {
    await reconcileAllBettingPools(db);
  } catch (error) {
    console.error('[BETS] Betting reconciliation failed:', error);
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
  app.use('/api/player', playerJudgingRoutes);
  app.use('/api/player', playerSelfRoutes);
  app.use('/api/player', playerLiveRoutes);
  app.use('/api/player', playerPulseRoutes);
  app.use('/api/player', playerStoriesRoutes);
  app.use('/api/player', playerEveningVotingRoutes);
  app.use('/api/player', playerProgressionRoutes);
  app.use('/api/player', playerProfileSettingsRoutes);
  app.use('/api/player', playerGameDetailRoutes);
  app.use('/api/player', playerRatingPeriodRoutes);
  app.use('/api/player', playerEconomyRoutes);
  app.use('/api/player', playerBettingRoutes);
  app.use('/api/player', playerPaymentRoutes);
  app.use('/api/admin-data', adminDataRoutes);
  app.use('/api/telegram-settings', telegramSettingsRoutes);
  app.use('/api/system-status', systemStatusRoutes);
  app.use('/api/rating', ratingRoutes);
  app.use('/api/rating-periods', ratingPeriodStandingsRoutes);
  app.use('/api/rating-periods', ratingPeriodRoutes);
  app.use('/api/crm', crmRoutes);
  app.use('/api/public', publicRoutes);
  app.use('/api/evenings', eveningAnnouncementRoutes);
  app.use('/api/evenings', eveningsRoutes);
  app.use('/api/participant', participantRoutes);
  app.use('/api/evening-participants', participantRoutes);
  app.use('/api/players', eloSeedAdminRoutes);
  app.use('/api/players', playerTokensRoutes);
  app.use('/api/players', playersRoutes);
  app.use('/api/tasks', tasksRoutes);
  app.use('/api/analytics', analyticsRoutes);
  app.post('/api/games', requireOrganizerAuth, (_req, res) => {
    res.status(410).json({ error: 'Legacy game creation route retired; use the evening/tournament protocol workflow' });
  });
  app.use('/api/games', organizerBettingRoutes);
  app.use('/api/games', gamesRoutes);
  app.use('/api/tournaments', tournamentTelegramRoutes);
  app.use('/api/tournaments', judgeAuthorityAdminRoutes);
  app.use('/api/tournaments', flexibleTournamentResultsRoutes);
  app.use('/api/tournaments', tournamentsRoutes);
  app.use('/api/tournaments', protocolImportsRoutes);
  app.use('/api/tournaments', tournamentTokenSettlementRoutes);
  app.use('/api/tournaments', tournamentProtocolRoutes);
  app.use('/api/tournaments', tournamentAwardsRoutes);
  app.use('/api/bot', botRoutes);
  app.use('/api/bot', botAnnouncementRoutes);
  app.use('/api/bot', botTelegramRoutes);

  app.use('/api/*', (_req, res) => {
    res.status(404).json({ error: 'API endpoint not found' });
  });

  app.use('/api/*', (err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('[API] Unhandled error:', err);
    if (res.headersSent) return;
    res.status(err?.status || 500).json({ error: err?.message || 'Internal server error' });
  });

  const isProduction = process.env.NODE_ENV === 'production';
  const distPath = path.resolve(process.cwd(), 'dist');

  if (isProduction) {
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  return app;
}