import type { DatabaseWrapper } from '../../db/index.ts';
import {
  checkTelegramRuntimeHealth,
  type RuntimeFetch,
  type TelegramRuntimeHealth,
} from './telegramRuntimeHealthService.ts';

type CheckStatus = 'ok' | 'fail';

export type RuntimeReadiness = {
  status: 'ok' | 'degraded';
  checked_at: string;
  checks: {
    database: CheckStatus;
    bot: CheckStatus;
    telegram: CheckStatus;
  };
};

const statusFor = (ok: boolean): CheckStatus => ok ? 'ok' : 'fail';

const telegramIsHealthy = (health: TelegramRuntimeHealth | null) => Boolean(
  health?.telegram.configured
  && health.telegram.reachable
  && health.telegram.webhook_configured
  && health.telegram.webhook_matches_bot_service
  && health.telegram.webhook_delivery_healthy,
);

const resolveWithin = (operation: Promise<boolean>, timeoutMs: number): Promise<boolean> => new Promise((resolve) => {
  const timeout = setTimeout(() => resolve(false), timeoutMs);
  operation.then(
    (result) => {
      clearTimeout(timeout);
      resolve(result);
    },
    () => {
      clearTimeout(timeout);
      resolve(false);
    },
  );
});

const databaseProbes = new WeakMap<object, Promise<boolean>>();

const probeDatabase = (db: Pick<DatabaseWrapper, 'get'>) => {
  const key = db as object;
  const existing = databaseProbes.get(key);
  if (existing) return existing;

  const operation = Promise.resolve()
    .then(() => db.get<{ ok: number }>('SELECT 1 AS ok'))
    .then((row) => Number(row?.ok) === 1)
    .catch(() => false);
  databaseProbes.set(key, operation);
  void operation.finally(() => {
    if (databaseProbes.get(key) === operation) databaseProbes.delete(key);
  });
  return operation;
};

export async function checkRuntimeReadiness(
  db: Pick<DatabaseWrapper, 'get'>,
  fetcher: RuntimeFetch = fetch,
): Promise<RuntimeReadiness> {
  const [databaseOk, telegramHealth] = await Promise.all([
    resolveWithin(probeDatabase(db), 5_000),
    checkTelegramRuntimeHealth(fetcher).catch(() => null),
  ]);

  const botOk = Boolean(telegramHealth?.bot_service.reachable);
  const telegramOk = telegramIsHealthy(telegramHealth);
  const overallOk = databaseOk && botOk && telegramOk;

  return {
    status: overallOk ? 'ok' : 'degraded',
    checked_at: new Date().toISOString(),
    checks: {
      database: statusFor(databaseOk),
      bot: statusFor(botOk),
      telegram: statusFor(telegramOk),
    },
  };
}
