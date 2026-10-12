import type { DatabaseWrapper } from '../../db/index.ts';
import { ensureGoMafiaSchema } from '../../db/ensureGoMafiaSchema.ts';
import { parseGoMafiaPlayerReference, type GoMafiaPublicSnapshot } from '../../lib/gomafiaExternalProfile.ts';
import { fetchPublicGoMafiaCareer } from './goMafiaCareerSource.ts';

const HOUR_MS = 60 * 60 * 1000;
const REFRESH_INTERVAL_MS = 6 * HOUR_MS;
const FAILURE_COOLDOWN_MS = 6 * HOUR_MS;

/**
 * Periodic federation career refresh. Only confirmed identity links are fetched.
 * Maximum four profiles per run (each paginated public career is bounded); failed URLs cool down for six hours.
 * All writes go to federation-only tables (never club Elo or games).
 */
export async function refreshVerifiedGoMafiaProfiles(
  db: DatabaseWrapper,
  options: { now?: Date; limit?: number; externalPlayerId?: string; fetchSnapshot?: typeof fetchPublicGoMafiaCareer } = {},
): Promise<{ attempted: number; updated: number; failed: number }> {
  const now = options.now ?? new Date();
  const nowIso = now.toISOString();
  const staleBefore = new Date(now.getTime() - REFRESH_INTERVAL_MS).toISOString();
  const retryBefore = new Date(now.getTime() - FAILURE_COOLDOWN_MS).toISOString();
  const limit = Math.min(4, Math.max(1, Math.trunc(options.limit ?? 4)));
  const fetchSnapshot = options.fetchSnapshot ?? fetchPublicGoMafiaCareer;
  await ensureGoMafiaSchema(db);
  const rows = await db.all<{ external_player_id: string; profile_url: string }>(
    'SELECT l.external_player_id, l.profile_url FROM gomafia_player_links l ' +
    'LEFT JOIN gomafia_player_snapshots s ON s.external_player_id=l.external_player_id AND s.scope=? ' +
    'LEFT JOIN gomafia_refresh_attempts a ON a.external_player_id=l.external_player_id ' +
    'WHERE l.status=? AND (s.retrieved_at IS NULL OR s.retrieved_at < ?) ' +
    'AND (a.last_attempt_at IS NULL OR a.last_attempt_at < ?) ' +
    (options.externalPlayerId ? 'AND l.external_player_id=? ' : '') +
    'ORDER BY COALESCE(a.last_attempt_at, \'\') ASC, l.external_player_id ASC LIMIT ?',
    ['career-v1', 'verified', staleBefore, retryBefore, ...(options.externalPlayerId ? [options.externalPlayerId] : []), limit],
  );
  let updated = 0;
  let failed = 0;
  for (const row of rows) {
    if (activeProfiles(db).has(row.external_player_id) || activeProfiles(db).size >= 4) continue;
    activeProfiles(db).add(row.external_player_id);
    const ref = parseGoMafiaPlayerReference(row.profile_url);
    if (!ref || ref.externalPlayerId !== row.external_player_id) {
      failed++;
      activeProfiles(db).delete(row.external_player_id);
      continue;
    }
    try {
      await db.run(
      'INSERT INTO gomafia_refresh_attempts (external_player_id, last_attempt_at, last_error) ' +
      'VALUES (?, ?, NULL) ON CONFLICT(external_player_id) DO UPDATE SET ' +
      'last_attempt_at=excluded.last_attempt_at, last_error=NULL',
      [row.external_player_id, nowIso],
    );
      const previous = await db.get<{ snapshot_json: string }>('SELECT snapshot_json FROM gomafia_player_snapshots WHERE external_player_id=? AND scope=?', [row.external_player_id, 'career-v1']);
      const previousSnapshot = previous ? JSON.parse(previous.snapshot_json) as GoMafiaPublicSnapshot : undefined;
      const snapshot: GoMafiaPublicSnapshot = await fetchSnapshot(ref, undefined, previousSnapshot);
      // Retain previously confirmed scores during temporary enrichment failures.
      if (snapshot.career) {
        const old = previousSnapshot?.career;
        for (const item of old?.yearlyStats ?? []) {
          if (!snapshot.career.yearlyStats.some(s => s.year === item.year)) snapshot.career.yearlyStats.push(item);
        }
        snapshot.career.yearlyStats.sort((a,b) => (b.year ?? 0) - (a.year ?? 0));
        for (const item of snapshot.career.tournaments) {
          const prior = old?.tournaments?.find((t: any) => t.tournamentId === item.tournamentId);
          if (item.scoreStatus === 'refresh_failed') {
            for (const game of item.games) {
              const oldGame = prior?.games?.find((g: any) => g.externalGameId === game.externalGameId && g.role === game.role && g.seat === game.seat);
              if (oldGame?.score != null) {
                game.score = oldGame.score; game.externalTableId = oldGame.externalTableId ?? null;
                game.scoreRetrievedAt = oldGame.scoreRetrievedAt ?? previousSnapshot!.retrievedAt;
              }
            }
          }
          if (item.scoreStatus === 'refresh_failed' && prior?.totalScore !== null && prior?.totalScore !== undefined) {
            item.totalScore = prior.totalScore;
            item.scoreRetrievedAt = prior.scoreRetrievedAt ?? previousSnapshot!.retrievedAt;
          }
        }
      }
      if (snapshot.externalPlayerId !== row.external_player_id)
        throw new Error('GoMafia returned a snapshot for another player');
      await db.run(
        'INSERT INTO gomafia_player_snapshots ' +
        '(external_player_id, scope, snapshot_json, retrieved_at, source_url) ' +
        'VALUES (?, ?, ?, ?, ?) ON CONFLICT(external_player_id, scope) DO UPDATE SET ' +
        'snapshot_json=excluded.snapshot_json, retrieved_at=excluded.retrieved_at, source_url=excluded.source_url',
        [row.external_player_id, 'career-v1', JSON.stringify(snapshot), snapshot.retrievedAt, ref.profileUrl],
      );
      updated++;
    } catch {
      await db.run('UPDATE gomafia_refresh_attempts SET last_error=? WHERE external_player_id=?',
        ['Не удалось загрузить публичную статистику', row.external_player_id]);
      failed++;
    } finally { activeProfiles(db).delete(row.external_player_id); }
  }
  return { attempted: rows.length, updated, failed };
}

const activeByDb = new WeakMap<DatabaseWrapper, Set<string>>();
function activeProfiles(db: DatabaseWrapper): Set<string> {
  let active = activeByDb.get(db);
  if (!active) { active = new Set(); activeByDb.set(db, active); }
  return active;
}
// Shared per-database queue: GET, confirmation and periodic worker use one writer.
const jobsByDb = new WeakMap<DatabaseWrapper, Map<string, Promise<unknown>>>();
function profileJobs(db: DatabaseWrapper) {
  let jobs = jobsByDb.get(db);
  if (!jobs) { jobs = new Map(); jobsByDb.set(db, jobs); }
  return jobs;
}
export function isGoMafiaProfileRefreshing(db: DatabaseWrapper, externalPlayerId: string): boolean {
  return profileJobs(db).has(externalPlayerId) || activeProfiles(db).has(externalPlayerId);
}
export function queueGoMafiaProfileRefresh(db: DatabaseWrapper, externalPlayerId: string): void {
  const jobs = profileJobs(db);
  if (isGoMafiaProfileRefreshing(db, externalPlayerId) || new Set([...jobs.keys(), ...activeProfiles(db)]).size >= 4) return;
  const job = refreshVerifiedGoMafiaProfiles(db, { externalPlayerId })
    .catch(error => console.warn('[GOMAFIA] career refresh failed', String(error)))
    .finally(() => jobs.delete(externalPlayerId));
  jobs.set(externalPlayerId, job);
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
