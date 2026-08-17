const DB_NAME = 'mafia_speech_recordings_v1';
const STORE_NAME = 'clips';
const LEGACY_LIVE_SESSION_KEY = 'mafia_live_session';
const CLUB_SESSION_KEY = /^mafia_live_session:club:(\d+)$/;
const MAX_CLIP_BYTES = 5 * 1024 * 1024;
const RETRY_DELAY_MS = 10_000;
const POLL_INTERVAL_MS = 700;
const ROOT_GRACE_MS = 2_500;

type SpeechSyncStatus = 'pending' | 'uploaded' | 'failed' | 'rejected';

type StoredSpeechClip = {
  id: string;
  session_id: string;
  slot: number;
  player_id: number | null;
  nickname: string;
  round: number;
  speech_type: string;
  started_at: string;
  duration_seconds: number;
  mime_type: string;
  blob: Blob;
  server_game_id?: number | null;
  server_sync_status?: SpeechSyncStatus | null;
  server_sync_error?: string | null;
  server_last_attempt_at?: string | null;
  server_synced_at?: string | null;
};

type StorageReader = Pick<Storage, 'length' | 'key' | 'getItem'>;

const runtime = {
  setupMounted: false,
  pollTimer: null as number | null,
  polling: false,
  baselineReady: false,
  baselinePromise: null as Promise<void> | null,
  knownClipIds: new Set<string>(),
  inFlight: new Set<string>(),
  activeGameId: null as number | null,
  rootMissingSince: null as number | null,
};

const openSpeechDb = () => new Promise<IDBDatabase>((resolve, reject) => {
  const request = indexedDB.open(DB_NAME, 1);
  request.onupgradeneeded = () => {
    const db = request.result;
    if (!db.objectStoreNames.contains(STORE_NAME)) {
      const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      store.createIndex('session_id', 'session_id', { unique: false });
      store.createIndex('player_id', 'player_id', { unique: false });
    }
  };
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});

const readSpeechClips = async (): Promise<StoredSpeechClip[]> => {
  const db = await openSpeechDb();
  try {
    return await new Promise<StoredSpeechClip[]>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const request = transaction.objectStore(STORE_NAME).getAll();
      request.onsuccess = () => resolve((request.result || []) as StoredSpeechClip[]);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
};

const persistSpeechClip = async (clip: StoredSpeechClip) => {
  const db = await openSpeechDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).put(clip);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    db.close();
  }
};

export const resolveActiveClubGameId = (providedStorage?: StorageReader | null): number | null => {
  const storage = providedStorage ?? (typeof window !== 'undefined' ? window.localStorage : null);
  if (!storage) return null;
  const liveSnapshot = storage.getItem(LEGACY_LIVE_SESSION_KEY);
  if (!liveSnapshot) return null;

  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (!key) continue;
    const match = CLUB_SESSION_KEY.exec(key);
    if (!match) continue;
    if (storage.getItem(key) !== liveSnapshot) continue;
    const gameId = Number(match[1]);
    if (Number.isInteger(gameId) && gameId > 0) return gameId;
  }
  return null;
};

export const buildSpeechClipUploadUrl = (gameId: number, clip: Pick<StoredSpeechClip,
  'id' | 'session_id' | 'slot' | 'round' | 'duration_seconds' | 'nickname' | 'speech_type' | 'started_at'>) => {
  const query = new URLSearchParams({
    clip_id: clip.id,
    session_id: clip.session_id,
    seat_number: String(clip.slot),
    round_number: String(clip.round),
    duration_seconds: String(clip.duration_seconds),
    speaker_nickname: clip.nickname,
    speech_type: clip.speech_type,
    started_at: clip.started_at,
  });
  return `/api/player/speech-recordings/club-games/${encodeURIComponent(String(gameId))}/clips?${query.toString()}`;
};

const responseError = async (response: Response) => {
  const body = await response.json().catch(() => null) as { error?: string } | null;
  return body?.error || `HTTP ${response.status}`;
};

const isPermanentFailure = (status: number) => [400, 404, 409, 413, 415].includes(status);

const canRetry = (clip: StoredSpeechClip) => {
  if (!clip.server_last_attempt_at) return true;
  const lastAttempt = Date.parse(clip.server_last_attempt_at);
  return !Number.isFinite(lastAttempt) || Date.now() - lastAttempt >= RETRY_DELAY_MS;
};

const uploadSpeechClip = async (gameId: number, clip: StoredSpeechClip) => {
  if (runtime.inFlight.has(clip.id)) return;
  runtime.inFlight.add(clip.id);
  const attemptedAt = new Date().toISOString();
  const pending: StoredSpeechClip = {
    ...clip,
    server_game_id: gameId,
    server_sync_status: 'pending',
    server_sync_error: null,
    server_last_attempt_at: attemptedAt,
  };

  try {
    if (!(clip.blob instanceof Blob) || clip.blob.size <= 0) {
      await persistSpeechClip({ ...pending, server_sync_status: 'rejected', server_sync_error: 'Локальная аудиозапись пуста.' });
      return;
    }
    if (clip.blob.size > MAX_CLIP_BYTES) {
      await persistSpeechClip({ ...pending, server_sync_status: 'rejected', server_sync_error: 'Одна речь должна быть не больше 5 МБ.' });
      return;
    }

    await persistSpeechClip(pending);
    const response = await fetch(buildSpeechClipUploadUrl(gameId, clip), {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': clip.mime_type || 'audio/webm' },
      body: clip.blob,
    });

    if (!response.ok) {
      const error = await responseError(response);
      await persistSpeechClip({
        ...pending,
        server_sync_status: isPermanentFailure(response.status) ? 'rejected' : 'failed',
        server_sync_error: error,
      });
      return;
    }

    await persistSpeechClip({
      ...pending,
      server_sync_status: 'uploaded',
      server_sync_error: null,
      server_synced_at: new Date().toISOString(),
    });
  } catch (error: any) {
    try {
      await persistSpeechClip({
        ...pending,
        server_sync_status: 'failed',
        server_sync_error: error?.message || 'Не удалось синхронизировать запись.',
      });
    } catch {}
  } finally {
    runtime.inFlight.delete(clip.id);
  }
};

const primeBaseline = async () => {
  if (runtime.baselineReady) return;
  if (runtime.baselinePromise) return runtime.baselinePromise;
  runtime.baselinePromise = readSpeechClips()
    .then((clips) => {
      clips.forEach((clip) => runtime.knownClipIds.add(clip.id));
      runtime.baselineReady = true;
    })
    .catch(() => undefined)
    .finally(() => { runtime.baselinePromise = null; });
  return runtime.baselinePromise;
};

const syncPendingClips = async (gameId: number) => {
  const clips = await readSpeechClips();
  const uploads: Promise<void>[] = [];

  clips.forEach((clip) => {
    const boundGameId = Number(clip.server_game_id || 0) || null;
    const knownBeforeThisPoll = runtime.knownClipIds.has(clip.id);

    if (boundGameId === gameId) {
      runtime.knownClipIds.add(clip.id);
      if (clip.server_sync_status !== 'uploaded' && clip.server_sync_status !== 'rejected' && canRetry(clip)) {
        uploads.push(uploadSpeechClip(gameId, clip));
      }
      return;
    }

    if (boundGameId !== null) {
      runtime.knownClipIds.add(clip.id);
      return;
    }

    if (!knownBeforeThisPoll) {
      runtime.knownClipIds.add(clip.id);
      uploads.push(uploadSpeechClip(gameId, clip));
    }
  });

  if (uploads.length) await Promise.all(uploads);
};

const shutdownRuntime = () => {
  if (typeof window !== 'undefined' && runtime.pollTimer !== null) window.clearInterval(runtime.pollTimer);
  runtime.setupMounted = false;
  runtime.pollTimer = null;
  runtime.polling = false;
  runtime.baselineReady = false;
  runtime.baselinePromise = null;
  runtime.knownClipIds.clear();
  runtime.activeGameId = null;
  runtime.rootMissingSince = null;
};

const checkLifecycle = () => {
  if (runtime.setupMounted) {
    runtime.rootMissingSince = null;
    return;
  }
  const rootExists = typeof document !== 'undefined' && Boolean(document.querySelector('.evening-live-engine-shell'));
  if (rootExists) {
    runtime.rootMissingSince = null;
    return;
  }
  if (runtime.rootMissingSince === null) runtime.rootMissingSince = Date.now();
  if (Date.now() - runtime.rootMissingSince > ROOT_GRACE_MS) shutdownRuntime();
};

const poll = async () => {
  if (runtime.polling) return;
  runtime.polling = true;
  try {
    if (!runtime.baselineReady) {
      await primeBaseline();
      return;
    }

    const resolvedGameId = resolveActiveClubGameId();
    if (resolvedGameId) runtime.activeGameId = resolvedGameId;
    if (runtime.activeGameId) await syncPendingClips(runtime.activeGameId);
  } catch {
    // Recording must never interrupt the live game. Failed uploads remain local
    // and are retried by the next polling cycle.
  } finally {
    runtime.polling = false;
    checkLifecycle();
  }
};

const startPolling = () => {
  if (typeof window === 'undefined' || runtime.pollTimer !== null) return;
  void poll();
  runtime.pollTimer = window.setInterval(() => void poll(), POLL_INTERVAL_MS);
};

export const mountSpeechRecordingServerSync = () => {
  if (typeof window === 'undefined' || typeof indexedDB === 'undefined') return () => undefined;
  runtime.setupMounted = true;
  runtime.rootMissingSince = null;
  startPolling();
  return () => {
    runtime.setupMounted = false;
    checkLifecycle();
  };
};

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', shutdownRuntime);
}
