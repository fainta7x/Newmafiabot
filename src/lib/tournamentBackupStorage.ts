import { api } from './api.ts';

export interface LocalTournamentBackup {
  tournament_id: string;
  saved_at: string;
  completed_protocols_count: number;
  total_games_count: number;
  backupData: any;
}

interface BackupFreshness {
  completed: number;
  results: number;
  updatedAtMs: number;
  checksum: string;
}

interface CleanupCandidate {
  backupKey: string;
  expectedValue: string;
}

const DB_NAME = 'MafiaCRM_LocalBackups';
const STORE_NAME = 'tournament_backups';
const DB_VERSION = 1;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) {
      reject(new Error('IndexedDB is not supported in this environment'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'tournament_id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function newestTimestamp(backupData: any): number {
  const candidates: unknown[] = [
    backupData?.metadata?.data_updated_at,
    backupData?.tournament?.updated_at,
  ];

  for (const collection of [
    backupData?.tournament_games,
    backupData?.tournament_game_protocols,
    backupData?.tournament_game_best_moves,
    backupData?.tournament_final_resolutions,
    backupData?.tournament_protocol_imports,
  ]) {
    if (!Array.isArray(collection)) continue;
    for (const row of collection) {
      candidates.push(row?.updated_at, row?.completed_at, row?.created_at);
    }
  }

  return candidates.reduce<number>((latest, value) => {
    if (typeof value !== 'string') return latest;
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? Math.max(latest, parsed) : latest;
  }, 0);
}

export function getBackupFreshness(backupData: any): BackupFreshness {
  return {
    completed: backupData?.metadata?.completed_protocols_count ??
      (backupData?.tournament_game_protocols || []).filter((p: any) => p.status === 'completed').length,
    results: backupData?.metadata?.player_results_count ??
      (backupData?.tournament_game_player_results || []).length,
    updatedAtMs: newestTimestamp(backupData),
    checksum: typeof backupData?.checksum === 'string' ? backupData.checksum : '',
  };
}

export function shouldReplaceLocalBackup(existingData: any, incomingData: any): boolean {
  const existing = getBackupFreshness(existingData);
  const incoming = getBackupFreshness(incomingData);

  if (incoming.completed !== existing.completed) return incoming.completed > existing.completed;
  if (incoming.results !== existing.results) return incoming.results > existing.results;
  if (incoming.updatedAtMs !== existing.updatedAtMs) return incoming.updatedAtMs > existing.updatedAtMs;

  // Equal progress with a different payload and no newer data timestamp is ambiguous.
  return Boolean(incoming.checksum && incoming.checksum === existing.checksum);
}

export async function saveLocalTournamentBackup(tournamentId: string, backupData: any): Promise<void> {
  const existing = await getLocalTournamentBackup(tournamentId);
  if (existing && !shouldReplaceLocalBackup(existing.backupData, backupData)) {
    console.warn('[Monotonicity] Ignoring a tournament backup that is older or ambiguous.');
    return;
  }

  const freshness = getBackupFreshness(backupData);
  const totalCount = backupData?.metadata?.games_count ?? (backupData?.tournament_games || []).length;
  const record: LocalTournamentBackup = {
    tournament_id: tournamentId,
    saved_at: new Date().toISOString(),
    completed_protocols_count: freshness.completed,
    total_games_count: totalCount || 10,
    backupData,
  };

  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(record);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error || new Error('IndexedDB transaction failed'));
    };
    tx.onabort = () => {
      db.close();
      reject(tx.error || new Error('IndexedDB transaction was aborted'));
    };
  });
}

export async function getLocalTournamentBackup(tournamentId: string): Promise<LocalTournamentBackup | null> {
  try {
    const db = await openDB();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const request = tx.objectStore(STORE_NAME).get(tournamentId);
      let result: LocalTournamentBackup | null = null;
      request.onsuccess = () => { result = request.result || null; };
      tx.oncomplete = () => {
        db.close();
        resolve(result);
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error || request.error);
      };
    });
  } catch (err) {
    console.warn('Failed to read tournament backup from IndexedDB:', err);
    return null;
  }
}

export async function deleteLocalTournamentBackup(tournamentId: string): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(tournamentId);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error || new Error('IndexedDB transaction failed'));
      };
    });
  } catch (err) {
    console.warn('Failed to delete tournament backup from IndexedDB:', err);
  }
}

export async function fetchAndSaveTournamentBackup(tournamentId: string): Promise<LocalTournamentBackup | null> {
  try {
    // api.getTournamentBackup sends the organizer token and cookies. A raw fetch
    // silently failed with 401 in token-based Preview sessions.
    const backupData = await api.getTournamentBackup(tournamentId);
    await saveLocalTournamentBackup(tournamentId, backupData);
    return await getLocalTournamentBackup(tournamentId);
  } catch (err) {
    console.warn('Error syncing tournament backup to IndexedDB:', err);
    throw err;
  }
}

const syncDebounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
const pendingCleanup = new Map<string, Map<string, string>>();

export function debouncedSyncTournamentBackup(
  tournamentId: string,
  delayMs = 2000,
  cleanup?: CleanupCandidate
): void {
  const existingTimer = syncDebounceTimers.get(tournamentId);
  if (existingTimer) clearTimeout(existingTimer);

  if (cleanup) {
    const candidates = pendingCleanup.get(tournamentId) || new Map<string, string>();
    candidates.set(cleanup.backupKey, cleanup.expectedValue);
    pendingCleanup.set(tournamentId, candidates);
  }

  const timer = setTimeout(async () => {
    syncDebounceTimers.delete(tournamentId);
    try {
      await fetchAndSaveTournamentBackup(tournamentId);
      const candidates = pendingCleanup.get(tournamentId);
      if (candidates) {
        for (const [backupKey, expectedValue] of candidates) {
          if (localStorage.getItem(backupKey) === expectedValue) {
            localStorage.removeItem(backupKey);
          }
        }
        pendingCleanup.delete(tournamentId);
      }
    } catch (_) {
      // Keep the per-game localStorage copies as the last-resort draft backup.
    }
  }, delayMs);

  syncDebounceTimers.set(tournamentId, timer);
}
