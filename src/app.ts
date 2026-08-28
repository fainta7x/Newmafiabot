import express from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import path from 'path';
import { DatabaseWrapper, getDb } from './db/index.ts';
import { ensureAdminDataSchema } from './db/ensureAdminDataSchema.ts';
import { ensureClubOperationsSchema } from './db/ensureClubOperationsSchema.ts';
import { ensureCanonicalEveningParticipantState } from './db/ensureCanonicalEveningParticipantState.ts';
import { ensureCommerceSchema } from './db/ensureCommerceSchema.ts';
import { ensureEloSeedSchema } from './db/ensureEloSeedSchema.ts';
import { ensureInviteAudienceSchema } from './db/ensureInviteAudienceSchema.ts';
import { ensureJudgeAuthoritySchema } from './db/ensureJudgeAuthoritySchema.ts';
import { ensureJudgeMusicSchema } from './db/ensureJudgeMusicSchema.ts';
import { ensurePlayerBettingSchema } from './db/ensurePlayerBettingSchema.ts';
import { ensurePlayerShopSchema } from './db/ensurePlayerShopSchema.ts';
import { ensureRatingPeriodsSchema } from './db/ensureRatingPeriodsSchema.ts';
import { ensureTelegramPublishingSchema } from './db/ensureTelegramPublishingSchema.ts';
import { ensureTournamentDistanceSchema } from './db/ensureTournamentDistanceSchema.ts';
import { ensureTournamentGameTokenSchema } from './db/ensureTournamentGameTokenSchema.ts';
import { ensureVkIntegrationSchema } from './db/ensureVkIntegrationSchema.ts';
import { ensureVkJoinSchema } from './db/ensureVkJoinSchema.ts';
import { applyBogdanaFinalCorrection } from './db/applyBogdanaFinalCorrection.ts';
import { parseUserSession, requireOrganizerAuth } from './server/auth.ts';

import authRoutes from './server/routes/authRoutes.ts';
import playerJudgingRoutes from './server/routes/playerJudgingRoutes.ts';
import playerJudgeMusicRoutes from './server/routes/playerJudgeMusicRoutes.ts';
import musicLibraryRoutes from './server/routes/musicLibraryRoutes.ts';
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
import playerExperienceRoutes from './server/routes/playerExperienceRoutes.ts';
import playerInsightsRoutes from './server/routes/playerInsightsRoutes.ts';
import playerReplayRoutes from './server/routes/playerReplayRoutes.ts';
import playerSpeechRecordingRoutes from './server/routes/playerSpeechRecordingRoutes.ts';
import playerEveningJourneyRoutes from './server/routes/playerEveningJourneyRoutes.ts';
import adminDataRoutes from './server/routes/adminDataRoutes.ts';
import commerceAdminRoutes from './server/routes/commerceAdminRoutes.ts';
import organizerBettingRoutes from './server/routes/organizerBettingRoutes.ts';
import eveningsRoutes from './server/routes/eveningsRoutes.ts';
import eveningAnnouncementRoutes from './server/routes/eveningAnnouncementRoutes.ts';
import eveningStaffRoutes from './server/routes/eveningStaffRoutes.ts';
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
import developerTestModeRoutes from './server/routes/developerTestModeRoutes.ts';
import tableScoutingRoutes from './server/routes/tableScoutingRoutes.ts';
import publicRoutes from './server/routes/publicRoutes.ts';
import publicLiveRoutes from './server/routes/publicLiveRoutes.ts';
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
import runtimeHealthRoutes from './server/routes/runtimeHealthRoutes.ts';
import integrationRoutes from './server/routes/integrationRoutes.ts';
import vkJoinStartRouter from './server/services/vkJoinStartRouter.ts';
import vkJoinRegistrationCallbackRouter from './server/services/vkJoinRegistrationCallbackRouter.ts';
import vkJoinRespondRouter from './server/services/vkJoinRespondRouter.ts';
import vkJoinStateRouter from './server/services/vkJoinStateRouter.ts';
import vkDirectIntegrationRouter from './server/services/vkDirectIntegrationRouter.ts';
import { reconcileAllPlayerAchievements } from './server/services/playerAchievementsService.ts';
import { reconcileAllBettingPools } from './server/services/bettingPoolService.ts';
import { reconcileTokenOpeningBalances } from './server/services/tokenLedgerService.ts';
import { reconcileAllTournamentGameTokenSettlements } from './server/services/tournamentGameTokenSettlementService.ts';
import { startTelegramSyncOutboxWorker } from './server/services/telegramSyncOutboxService.ts';

export async function createApp(customDb?: DatabaseWrapper) {
  const app = express();
  app.set('trust proxy', 1);

  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(express.json({ limit: '2mb' }));
  app.use((err: any, _req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (err && (err.status === 413 || err.type === 'entity.too.large' || err.code === 'LIMIT_FILE_SIZE')) {
      return res.status(413).json({ error: 'Размер резервной копии превышает допустимый лимит (2 MB)' });
    }
    next(err);
  });
  app.use(cookieParser());

  app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

  const db = customDb || (await getDb());
  await ensureInviteAudienceSchema(db);
  await ensureJudgeAuthoritySchema(db);
  await ensureClubOperationsSchema(db);
  await ensureCanonicalEveningParticipantState(db);
  await ensureJudgeMusicSchema(db);
  await ensureEloSeedSchema(db);
  await ensurePlayerShopSchema(db);
  await ensureCommerceSchema(db);
  await ensurePlayerBettingSchema(db);
  await ensureRatingPeriodsSchema(db);
  await ensureTournamentDistanceSchema(db);
  await ensureTournamentGameTokenSchema(db);
  await ensureAdminDataSchema(db);
  await ensureTelegramPublishingSchema(db);
  await ensureVkIntegrationSchema(db);
  await ensureVkJoinSchema(db);
  try { await applyBogdanaFinalCorrection(db); } catch (error) { console.error('[DATA CORRECTION] Bogdana final result correction failed:', error); }
  const isTest = Boolean(process.env.VITEST) || process.env.NODE_ENV === 'test';
  const isBrowserE2E = process.env.PLAYWRIGHT_E2E === '1';
  if (!isTest) startTelegramSyncOutboxWorker(db);
  try { await reconcileTokenOpeningBalances(db); } catch (error) { console.error('[TOKENS] Opening-balance reconciliation failed:', error); }
  try { await reconcileAllTournamentGameTokenSettlements(db); } catch (error) { console.error('[TOKENS] Tournament settlement backfill failed:', error); }
  try { await reconcileAllBettingPools(db); } catch (error) { console.error('[BETS] Betting reconciliation failed:', error); }
  try { await reconcileAllPlayerAchievements(db); } catch (error) { console.error('[ACHIEVEMENTS] Backfill reconciliation failed:', error); }
  app.use((req, _res, next) => { req.db = db; next(); });

  app.use('/api/health', runtimeHealthRoutes);

  app.use(parseUserSession);

  app.use('/api/auth', authRoutes);
  app.use('/api/player', playerJudgingRoutes);
  app.use('/api/player', playerJudgeMusicRoutes);
  app.use('/api/player', musicLibraryRoutes);
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
  app.use('/api/player', playerExperienceRoutes);
  app.use('/api/player', playerInsightsRoutes);
  app.use('/api/player', playerReplayRoutes);
  app.use('/api/player/speech-recordings', playerSpeechRecordingRoutes);
  app.use('/api/player', playerEveningJourneyRoutes);
  app.use('/api/admin-data', adminDataRoutes);
  app.use('/api/commerce', commerceAdminRoutes);
  app.use('/api/telegram-settings', telegramSettingsRoutes);
  app.use('/api/system-status', systemStatusRoutes);
  app.use('/api/integrations', vkJoinRegistrationCallbackRouter);
  app.use('/api/integrations', vkDirectIntegrationRouter);
  app.use('/api/integrations', integrationRoutes);
  app.use('/api/rating', ratingRoutes);
  app.use('/api/rating-periods', ratingPeriodStandingsRoutes);
  app.use('/api/rating-periods', ratingPeriodRoutes);
  app.use('/api/crm/test-mode', developerTestModeRoutes);
  app.use('/api/crm', crmRoutes);
  app.use('/api/crm', tableScoutingRoutes);
  app.use('/api/public', vkJoinStartRouter);
  app.use('/api/public', vkJoinRespondRouter);
  app.use('/api/public', vkJoinStateRouter);
  app.use('/api/public', publicLiveRoutes);
  app.use('/api/public', publicRoutes);
  app.use('/api/evenings', eveningAnnouncementRoutes);
  app.use('/api/evenings', eveningStaffRoutes);
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

  app.use('/api/{*splat}', (_req, res) => res.status(404).json({ error: 'API endpoint not found' }));
  app.use('/api/{*splat}', (err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('[API] Unhandled error:', err);
    if (res.headersSent) return;
    res.status(err?.status || 500).json({ error: err?.message || 'Internal server error' });
  });

  const isProduction = process.env.NODE_ENV === 'production';
  const distPath = path.resolve(process.cwd(), 'dist');
  if (isProduction) {
    app.use(express.static(distPath));
    app.get('/{*splat}', (_req, res) => res.sendFile(path.join(distPath, 'index.html')));
  } else if (!isTest || isBrowserE2E) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: 'spa' });
    app.use(vite.middlewares);
  }
  return app;
}
