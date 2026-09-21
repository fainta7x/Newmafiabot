import type { DatabaseWrapper } from './index.ts';
import { ensureAdminDataSchema } from './ensureAdminDataSchema.ts';
import { ensureCanonicalEveningParticipantState } from './ensureCanonicalEveningParticipantState.ts';
import { ensureClubOperationsSchema } from './ensureClubOperationsSchema.ts';
import { ensureCommerceSchema } from './ensureCommerceSchema.ts';
import { ensureEloSeedSchema } from './ensureEloSeedSchema.ts';
import { ensureEveningSlotsSchema } from './ensureEveningSlotsSchema.ts';
import { ensureInviteAudienceSchema } from './ensureInviteAudienceSchema.ts';
import { ensureJudgeAuthoritySchema } from './ensureJudgeAuthoritySchema.ts';
import { ensureJudgeMusicSchema } from './ensureJudgeMusicSchema.ts';
import { ensureLegacyRegularWaiverProtection } from './ensureLegacyRegularWaiverProtection.ts';
import { ensureNoviceSystemSchema } from './ensureNoviceSystemSchema.ts';
import { ensurePlayerBettingSchema } from './ensurePlayerBettingSchema.ts';
import { ensurePlayerConnectionsSchema } from './ensurePlayerConnectionsSchema.ts';
import { ensurePlayerShopSchema } from './ensurePlayerShopSchema.ts';
import { ensureRatingPeriodsSchema } from './ensureRatingPeriodsSchema.ts';
import { ensureTelegramDirectMessageSchema } from './ensureTelegramDirectMessageSchema.ts';
import { ensureTelegramPublishingSchema } from './ensureTelegramPublishingSchema.ts';
import { ensureTournamentDistanceSchema } from './ensureTournamentDistanceSchema.ts';
import { ensureTournamentGameTokenSchema } from './ensureTournamentGameTokenSchema.ts';
import { ensureVkIntegrationSchema } from './ensureVkIntegrationSchema.ts';
import { ensureVkJoinSchema } from './ensureVkJoinSchema.ts';
import { ensureVkPersonalMessageSchema } from './ensureVkPersonalMessageSchema.ts';

/**
 * Keep the in-app sandbox structurally equivalent to the live application.
 * Workers and real-identity migrations deliberately stay outside this helper.
 */
export async function ensureIsolatedTestRuntimeSchema(db: DatabaseWrapper): Promise<void> {
  await ensureInviteAudienceSchema(db);
  await ensureJudgeAuthoritySchema(db);
  await ensureEveningSlotsSchema(db);
  await ensureLegacyRegularWaiverProtection(db);
  await ensureClubOperationsSchema(db);
  await ensureCanonicalEveningParticipantState(db);
  await ensureJudgeMusicSchema(db);
  await ensureEloSeedSchema(db);
  await ensurePlayerShopSchema(db);
  await ensureCommerceSchema(db);
  await ensurePlayerBettingSchema(db);
  await ensurePlayerConnectionsSchema(db);
  await ensureRatingPeriodsSchema(db);
  await ensureTournamentDistanceSchema(db);
  await ensureTournamentGameTokenSchema(db);
  await ensureAdminDataSchema(db);
  await ensureTelegramPublishingSchema(db);
  await ensureTelegramDirectMessageSchema(db);
  await ensureVkIntegrationSchema(db);
  await ensureVkJoinSchema(db);
  await ensureVkPersonalMessageSchema(db);
  await ensureNoviceSystemSchema(db);
}
