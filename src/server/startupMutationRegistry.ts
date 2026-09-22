export type StartupMutationKind =
  | 'schema'
  | 'compatibility'
  | 'data_migration'
  | 'historical_correction'
  | 'continuous_reconciliation'
  | 'worker';

export type StartupMutationEntry = {
  order: number;
  name: string;
  kind: StartupMutationKind;
  idempotency: string;
  notes?: string;
};

export const STARTUP_MUTATION_REGISTRY: StartupMutationEntry[] = [
  { order: 10, name: 'ensureInviteAudienceSchema', kind: 'schema', idempotency: 'CREATE/ALTER IF needed' },
  { order: 20, name: 'ensureJudgeAuthoritySchema', kind: 'schema', idempotency: 'CREATE/ALTER IF needed' },
  { order: 30, name: 'ensureEveningSlotsSchema', kind: 'schema', idempotency: 'CREATE/ALTER IF needed' },
  { order: 40, name: 'ensureLegacyRegularWaiverProtection', kind: 'compatibility', idempotency: 'guarded compatibility repair', notes: 'must precede club operations migration' },
  { order: 50, name: 'ensureClubOperationsSchema', kind: 'data_migration', idempotency: 'application migration markers + schema guards' },
  { order: 60, name: 'ensureCanonicalEveningParticipantState', kind: 'compatibility', idempotency: 'state reconciliation' },
  { order: 70, name: 'ensureJudgeMusicSchema', kind: 'schema', idempotency: 'CREATE/ALTER IF needed' },
  { order: 80, name: 'ensureEloSeedSchema', kind: 'schema', idempotency: 'CREATE/ALTER IF needed' },
  { order: 90, name: 'ensurePlayerShopSchema', kind: 'schema', idempotency: 'CREATE/ALTER IF needed' },
  { order: 100, name: 'ensureCommerceSchema', kind: 'schema', idempotency: 'CREATE/ALTER IF needed' },
  { order: 110, name: 'ensurePlayerBettingSchema', kind: 'schema', idempotency: 'CREATE/ALTER IF needed' },
  { order: 120, name: 'ensurePlayerConnectionsSchema', kind: 'schema', idempotency: 'CREATE/ALTER IF needed' },
  { order: 130, name: 'ensureRatingPeriodsSchema', kind: 'schema', idempotency: 'CREATE/ALTER IF needed' },
  { order: 140, name: 'ensureTournamentDistanceSchema', kind: 'schema', idempotency: 'CREATE/ALTER IF needed' },
  { order: 150, name: 'ensureTournamentGameTokenSchema', kind: 'schema', idempotency: 'CREATE/ALTER IF needed' },
  { order: 160, name: 'ensureAdminDataSchema', kind: 'schema', idempotency: 'CREATE/ALTER IF needed' },
  { order: 170, name: 'ensureTelegramPublishingSchema', kind: 'schema', idempotency: 'CREATE/ALTER + trigger guards' },
  { order: 180, name: 'ensureTelegramDirectMessageSchema', kind: 'schema', idempotency: 'CREATE/ALTER IF needed' },
  { order: 190, name: 'ensureVkIntegrationSchema', kind: 'schema', idempotency: 'CREATE/ALTER IF needed' },
  { order: 200, name: 'ensureVkJoinSchema', kind: 'schema', idempotency: 'CREATE/ALTER IF needed' },
  { order: 210, name: 'ensureVkPersonalMessageSchema', kind: 'schema', idempotency: 'CREATE/ALTER IF needed' },
  { order: 215, name: 'ensureNoviceSystemSchema', kind: 'data_migration', idempotency: 'additive schema + one-time established-roster club-stage backfill' },
  { order: 220, name: 'applyBogdanaFinalCorrection', kind: 'historical_correction', idempotency: 'migration_history durable completion marker + exact target lookup', notes: 'eligible for later removal after production marker verification' },
  { order: 230, name: 'startTelegramSyncOutboxWorker', kind: 'worker', idempotency: 'singleton in-process timer' },
  { order: 240, name: 'startWeeklyEveningAutomationWorker', kind: 'worker', idempotency: 'singleton in-process timer' },
  { order: 250, name: 'startTelegramMessageOutboxWorker', kind: 'worker', idempotency: 'singleton in-process timer' },
  { order: 260, name: 'startPersonalTelegramNotificationWorker', kind: 'worker', idempotency: 'singleton in-process timer' },
  { order: 265, name: 'startVkMessageOutboxWorker', kind: 'worker', idempotency: 'singleton in-process timer' },
  { order: 270, name: 'reconcileTokenOpeningBalances', kind: 'continuous_reconciliation', idempotency: 'ledger uniqueness / source markers' },
  { order: 280, name: 'reconcileAllTournamentGameTokenSettlements', kind: 'continuous_reconciliation', idempotency: 'settlement uniqueness' },
  { order: 290, name: 'reconcileAllBettingPools', kind: 'continuous_reconciliation', idempotency: 'pool/settlement state guards' },
  { order: 300, name: 'reconcileAllPlayerAchievements', kind: 'continuous_reconciliation', idempotency: 'achievement uniqueness/state guards' },
];

export function startupMutationSummary() {
  return STARTUP_MUTATION_REGISTRY.map(({ order, name, kind, idempotency, notes }) => ({
    order,
    name,
    kind,
    idempotency,
    ...(notes ? { notes } : {}),
  }));
}

export function logStartupMutationRegistry() {
  const summary = startupMutationSummary();
  console.info('[STARTUP MUTATIONS]', JSON.stringify({
    count: summary.length,
    operations: summary,
  }));
}
