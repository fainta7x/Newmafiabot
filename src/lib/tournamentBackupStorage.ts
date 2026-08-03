export interface LocalTournamentBackup {
  tournament_id: string;
  saved_at: string;
  completed_protocols_count: number;
  total_games_count: number;
  backupData: any;
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

export async function saveLocalTournamentBackup(tournamentId: string, backupData: any): Promise<void> {
  try {
    const db = await openDB();
    const existing = await getLocalTournamentBackup(tournamentId);

    const completedCount = backupData?.metadata?.completed_protocols_count ?? 
      (backupData?.tournament_game_protocols || []).filter((p: any) => p.status === 'completed').length;
    const playerResultsCount = backupData?.metadata?.player_results_count ??
      (backupData?.tournament_game_player_results || []).length;
    const totalCount = backupData?.metadata?.games_count ?? (backupData?.tournament_games || []).length;
    const createdAt = backupData?.metadata?.created_at || new Date().toISOString();

    if (existing) {
      const existingCompleted = existing.completed_protocols_count ?? 0;
      const existingResults = existing.backupData?.metadata?.player_results_count ??
        (existing.backupData?.tournament_game_player_results || []).length;

      if (completedCount < existingCompleted) {
        console.warn(`[Monotonicity] Ignoring backup update: incoming completed count (${completedCount}) < existing (${existingCompleted})`);
        return;
      }

      if (completedCount === existingCompleted && playerResultsCount < existingResults) {
        console.warn(`[Monotonicity] Ignoring backup update: incoming player_results_count (${playerResultsCount}) < existing (${existingResults})`);
        return;
      }

      if (completedCount === existingCompleted && playerResultsCount === existingResults) {
        const existingCreatedAt = existing.backupData?.metadata?.created_at || existing.saved_at;
        if (existingCreatedAt && new Date(createdAt).getTime() < new Date(existingCreatedAt).getTime()) {
          console.warn(`[Monotonicity] Ignoring backup update: incoming timestamp (${createdAt}) older than existing (${existingCreatedAt})`);
          return;
        }
      }
    }

    const record: LocalTournamentBackup = {
      tournament_id: tournamentId,
      saved_at: new Date().toISOString(),
      completed_protocols_count: completedCount,
      total_games_count: totalCount || 10,
      backupData,
    };

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(record);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('Failed to save tournament backup to IndexedDB:', err);
    throw err;
  }
}

export async function getLocalTournamentBackup(tournamentId: string): Promise<LocalTournamentBackup | null> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(tournamentId);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('Failed to read tournament backup from IndexedDB:', err);
    return null;
  }
}

export async function deleteLocalTournamentBackup(tournamentId: string): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(tournamentId);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('Failed to delete tournament backup from IndexedDB:', err);
  }
}

let syncDebounceTimer: ReturnType<typeof setTimeout> | null = null;

export async function fetchAndSaveTournamentBackup(tournamentId: string): Promise<LocalTournamentBackup | null> {
  try {
    const res = await fetch(`/api/tournaments/${tournamentId}/backup`);
    if (!res.ok) {
      throw new Error(`Server returned ${res.status}`);
    }
    const backupData = await res.json();
    await saveLocalTournamentBackup(tournamentId, backupData);
    return await getLocalTournamentBackup(tournamentId);
  } catch (err) {
    console.warn('Error syncing tournament backup to IndexedDB:', err);
    throw err;
  }
}

export function debouncedSyncTournamentBackup(tournamentId: string, delayMs = 2000): void {
  if (syncDebounceTimer) {
    clearTimeout(syncDebounceTimer);
  }
  syncDebounceTimer = setTimeout(() => {
    fetchAndSaveTournamentBackup(tournamentId).catch(() => {});
  }, delayMs);
}
