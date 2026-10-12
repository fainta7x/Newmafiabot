import type { DatabaseWrapper } from '../../db/index.ts';
import { ensureGoMafiaSchema } from '../../db/ensureGoMafiaSchema.ts';
import { parseGoMafiaPlayerReference, type GoMafiaPublicSnapshot } from '../../lib/gomafiaExternalProfile.ts';
import { fetchPublicGoMafiaStats } from './goMafiaPublicStatsService.ts';

const HOUR_MS = 60 * 60 * 1000;
const REFRESH_INTERVAL_MS = 24 * HOUR_MS;
const FAILURE_COOLDOWN_MS = 6 * HOUR_MS;

/**
 * Periodic federation snapshot refresh. Only confirmed identity links are fetched.
 * Maximum four requests per run; failed URLs cool down for six hours.
 * All writes go to federation-only tables (never club Elo or games).
 */
export async function refreshVerifiedGoMafiaProfiles(
  db: DatabaseWrapper,
  options: { now?: Date; limit?: number; fetchSnapshot?: typeof fetchPublicGoMafiaStats } = {},
): Promise<{ attempted: number; updated: number; failed: number }> {
  const now = options.now ?? new Date();
  const nowIso = now.toISOString();
  const staleBefore = new Date(now.getTime() - REFRESH_INTERVAL_MS).toISOString();
  const retryBefore = new Date(now.getTime() - FAILURE_COOLDOWN_MS).toISOString();
  const limit = Math.min(4, Math.max(1, Math.trunc(options.limit ?? 4)));
  const fetchSnapshot = options.fetchSnapshot ?? fetchPublicGoMafiaStats;
  await ensureGoMafiaSchema(db);
  const rows = await db.all<{ external_player_id: string; profile_url: string }>(
    'SELECT l.external_player_id, l.profile_url FROM gomafia_player_links l ' +
    'LEFT JOIN gomafia_player_snapshots s ON s.external_player_id=l.external_player_id AND s.scope=? ' +
    'LEFT JOIN gomafia_refresh_attempts a ON a.external_player_id=l.external_player_id ' +
    'WHERE l.status=? AND (s.retrieved_at IS NULL OR s.retrieved_at < ?) ' +
    'AND (a.last_attempt_at IS NULL OR a.last_attempt_at < ?) ' +
    'ORDER BY COALESCE(a.last_attempt_at, \'\') ASC, l.external_player_id ASC LIMIT ?',
    ['default-period', 'verified', staleBefore, retryBefore, limit],
  );
  let updated = 0;
  let failed = 0;
  for (const row of rows) {
    const ref = parseGoMafiaPlayerReference(row.profile_url);
    if (!ref || ref.externalPlayerId !== row.external_player_id) {
      failed++;
      continue;
    }
    await db.run(
      'INSERT INTO gomafia_refresh_attempts (external_player_id, last_attempt_at, last_error) ' +
      'VALUES (?, ?, NULL) ON CONFLICT(external_player_id) DO UPDATE SET ' +
      'last_attempt_at=excluded.last_attempt_at, last_error=NULL',
      [row.external_player_id, nowIso],
    );
    try {
      const snapshot: GoMafiaPublicSnapshot = await fetchSnapshot(ref);
      if (snapshot.externalPlayerId !== row.external_player_id)
        throw new Error('GoMafia returned a snapshot for another player');
      await db.run(
        'INSERT INTO gomafia_player_snapshots ' +
        '(external_player_id, scope, snapshot_json, retrieved_at, source_url) ' +
        'VALUES (?, ?, ?, ?, ?) ON CONFLICT(external_player_id, scope) DO UPDATE SET ' +
        'snapshot_json=excluded.snapshot_json, retrieved_at=excluded.retrieved_at, source_url=excluded.source_url',
        [row.external_player_id, 'default-period', JSON.stringify(snapshot), snapshot.retrievedAt, ref.profileUrl],
      );
      updated++;
    } catch {
      await db.run('UPDATE gomafia_refresh_attempts SET last_error=? WHERE external_player_id=?',
        ['Не удалось загрузить публичную статистику', row.external_player_id]);
      failed++;
    }
  }
  return { attempted: rows.length, updated, failed };
}

let inProgress = false;

export function startGoMafiaFederationSync(db: DatabaseWrapper): void {
  if (process.env.NODE_ENV !== 'production' || process.env.GOMAFIA_AUTO_SYNC_ENABLED === 'false') return;
  const tick = async () => {
    if (inProgress) return;
    inProgress = true;
    try {
      const result = await refreshVerifiedGoMafiaProfiles(db);
      if (result.attempted) console.info('[GOMAFIA] federation snapshot sync', result);
    } catch (error) {
      console.warn('[GOMAFIA] public snapshot refresh failed', String(error));
    } finally {
      inProgress = false;
    }
  };
  // External federation requests must never delay health checks or server startup.
  const first = setTimeout(() => { void tick(); }, 60_000);
  first.unref();
  const timer = setInterval(() => { void tick(); }, HOUR_MS);
  timer.unref();
}
