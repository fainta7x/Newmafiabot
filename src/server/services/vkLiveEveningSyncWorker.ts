import type { DatabaseWrapper } from '../../db/index.ts';
import { ensureVkIntegrationSchema } from '../../db/ensureVkIntegrationSchema.ts';
import { getPublicAppBaseUrl } from '../runtimeConfig.ts';
import { syncDirectVkEveningPublications } from './vkDirectJoinPublishingService.ts';
import { hydrateVkOAuthAccessToken } from './vkOAuthService.ts';

const DEFAULT_INTERVAL_MS = 60 * 1000;
const DEFAULT_INITIAL_DELAY_MS = 15 * 1000;
let workerTimer: ReturnType<typeof setInterval> | null = null;
let initialTimer: ReturnType<typeof setTimeout> | null = null;
let refreshInFlight = false;

export async function refreshExistingVkEveningPosts(
  db: DatabaseWrapper,
  options: { now?: Date; baseUrl?: string } = {},
) {
  const now = options.now || new Date();
  const baseUrl = String(options.baseUrl || getPublicAppBaseUrl()).replace(/\/+$/, '');
  await ensureVkIntegrationSchema(db);
  await hydrateVkOAuthAccessToken(db);

  const rows = await db.all<{ id: string }>(`
    SELECT DISTINCT e.id
      FROM game_evenings e
      LEFT JOIN vk_evening_publications p ON p.evening_id = e.id
     WHERE e.status IN ('published', 'active')
       AND e.settled_at IS NULL
       AND datetime(e.starts_at) > datetime(?)
       AND datetime(e.starts_at) <= datetime(?, '+4 days', '+1 hour')
     ORDER BY datetime(e.starts_at) ASC
  `, [now.toISOString(), now.toISOString()]);

  const results: Array<{ evening_id: string; success: boolean; error?: string }> = [];
  for (const row of rows) {
    try {
      const sync = await syncDirectVkEveningPublications(db, String(row.id), baseUrl);
      const failures = sync.results.filter((item) => !item.success && !item.skipped);
      if (failures.length) {
        results.push({
          evening_id: String(row.id),
          success: false,
          error: failures.map((item) => item.error || item.destination).join('; '),
        });
      } else {
        results.push({ evening_id: String(row.id), success: true });
      }
    } catch (error) {
      results.push({
        evening_id: String(row.id),
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return results;
}

export function kickVkLiveEveningSync(db: DatabaseWrapper) {
  if (refreshInFlight) return;
  refreshInFlight = true;
  void refreshExistingVkEveningPosts(db)
    .then((results) => {
      const failed = results.filter((item) => !item.success);
      if (failed.length) console.error('[VK LIVE SYNC] Some evening posts failed to refresh:', failed);
    })
    .catch((error) => console.error('[VK LIVE SYNC] Refresh failed:', error instanceof Error ? error.message : String(error)))
    .finally(() => { refreshInFlight = false; });
}

export function startVkLiveEveningSyncWorker(
  db: DatabaseWrapper,
  options: { intervalMs?: number; initialDelayMs?: number } = {},
) {
  if (workerTimer || initialTimer) return;
  const intervalMs = Math.max(60_000, Number(options.intervalMs || DEFAULT_INTERVAL_MS));
  const initialDelayMs = Math.max(0, Number(options.initialDelayMs ?? DEFAULT_INITIAL_DELAY_MS));

  initialTimer = setTimeout(() => {
    initialTimer = null;
    kickVkLiveEveningSync(db);
  }, initialDelayMs);
  initialTimer.unref?.();

  workerTimer = setInterval(() => kickVkLiveEveningSync(db), intervalMs);
  workerTimer.unref?.();
}
