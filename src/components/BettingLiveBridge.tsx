import { useEffect } from 'react';

type LivePlayer = { slot_num?: number; nickname?: string; role?: string };

type StoredSpeechClip = {
  id: string;
  session_id: string;
  slot: number;
  nickname: string;
  round: number;
  speech_type: string;
  started_at: string;
  duration_seconds: number;
  mime_type: string;
  blob: Blob;
};

const SPEECH_DB_NAME = 'mafia_speech_recordings_v1';
const SPEECH_STORE_NAME = 'clips';

const normalizedNames = (values: string[]) => values
  .map((value) => value.trim().toLocaleLowerCase('ru-RU'))
  .filter(Boolean)
  .sort((a, b) => a.localeCompare(b, 'ru'));

const sameNames = (left: string[], right: string[]) => {
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
};

const openSpeechDb = () => new Promise<IDBDatabase>((resolve, reject) => {
  const request = indexedDB.open(SPEECH_DB_NAME, 1);
  request.onupgradeneeded = () => {
    const db = request.result;
    if (!db.objectStoreNames.contains(SPEECH_STORE_NAME)) {
      const store = db.createObjectStore(SPEECH_STORE_NAME, { keyPath: 'id' });
      store.createIndex('session_id', 'session_id', { unique: false });
      store.createIndex('player_id', 'player_id', { unique: false });
    }
  };
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});

const readRecentSpeechClips = async (sinceMs: number): Promise<StoredSpeechClip[]> => {
  if (typeof indexedDB === 'undefined') return [];
  const db = await openSpeechDb();
  try {
    const clips = await new Promise<StoredSpeechClip[]>((resolve, reject) => {
      const transaction = db.transaction(SPEECH_STORE_NAME, 'readonly');
      const request = transaction.objectStore(SPEECH_STORE_NAME).getAll();
      request.onsuccess = () => resolve((request.result || []) as StoredSpeechClip[]);
      request.onerror = () => reject(request.error);
    });
    return clips
      .filter((clip) => Date.parse(clip.started_at) >= sinceMs)
      .sort((a, b) => Date.parse(a.started_at) - Date.parse(b.started_at));
  } finally {
    db.close();
  }
};

const uploadSpeechClip = async (gameId: number, clip: StoredSpeechClip) => {
  const query = new URLSearchParams({
    clip_id: clip.id,
    session_id: clip.session_id,
    seat_number: String(clip.slot),
    speaker_nickname: clip.nickname,
    round_number: String(clip.round || 1),
    speech_type: clip.speech_type || 'Речь',
    started_at: clip.started_at,
    duration_seconds: String(clip.duration_seconds || 0),
  });
  return fetch(`/api/player/speech-recordings/club-games/${encodeURIComponent(String(gameId))}/clips?${query.toString()}`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': clip.mime_type || 'audio/webm' },
    body: clip.blob,
  });
};

export default function BettingLiveBridge() {
  useEffect(() => {
    let busy = false;
    let speechBusy = false;
    let lastReconcileAt = 0;
    let liveSeenAt: number | null = null;
    const speechSyncedIds = new Set<string>();
    const speechRejectedIds = new Set<string>();
    const speechRetryAfter = new Map<string, number>();

    const syncSpeech = async (gameId: number, liveNames: string[]) => {
      if (speechBusy || liveSeenAt === null) return;
      speechBusy = true;
      try {
        const clips = await readRecentSpeechClips(liveSeenAt - 60_000);
        const activeNames = new Set(liveNames);
        for (const clip of clips) {
          if (!clip?.id || !clip?.blob || clip.blob.size <= 0) continue;
          const normalizedNickname = String(clip.nickname || '').trim().toLocaleLowerCase('ru-RU');
          if (!activeNames.has(normalizedNickname)) continue;
          if (speechSyncedIds.has(clip.id) || speechRejectedIds.has(clip.id)) continue;
          const storageKey = `speech_recording_uploaded_${gameId}_${clip.id}`;
          if (sessionStorage.getItem(storageKey) === '1') {
            speechSyncedIds.add(clip.id);
            continue;
          }
          if ((speechRetryAfter.get(clip.id) || 0) > Date.now()) continue;

          try {
            const response = await uploadSpeechClip(gameId, clip);
            if (response.ok) {
              speechSyncedIds.add(clip.id);
              speechRetryAfter.delete(clip.id);
              sessionStorage.setItem(storageKey, '1');
              continue;
            }
            if ([400, 403, 413, 415].includes(response.status)) {
              speechRejectedIds.add(clip.id);
              console.warn(`[speech-recording] Server rejected clip ${clip.id}: ${response.status}`);
              continue;
            }
            speechRetryAfter.set(clip.id, Date.now() + 5000);
          } catch (error) {
            speechRetryAfter.set(clip.id, Date.now() + 5000);
            console.warn('[speech-recording] Failed to upload clip, will retry:', error);
          }
        }
      } catch (error) {
        console.warn('[speech-recording] Failed to read local clips for sync:', error);
      } finally {
        speechBusy = false;
      }
    };

    const tick = async () => {
      if (busy) return;
      const now = Date.now();
      if (now - lastReconcileAt > 5000) {
        lastReconcileAt = now;
        void fetch('/api/games/betting/reconcile', { method: 'POST', credentials: 'include' }).catch(() => undefined);
      }

      let parsed: any = null;
      try {
        const raw = localStorage.getItem('mafia_live_session');
        parsed = raw ? JSON.parse(raw) : null;
      } catch {}
      if (!parsed || parsed.phase === 'setup') {
        liveSeenAt = null;
        return;
      }
      if (liveSeenAt === null) liveSeenAt = Date.now();

      const activePlayers: LivePlayer[] = Array.isArray(parsed.activePlayers) ? parsed.activePlayers : [];
      if (activePlayers.length !== 10) return;
      const roles = activePlayers.map((player) => ({ seat_number: Number(player.slot_num), role: player.role }));
      if (roles.some((item) => !Number.isInteger(item.seat_number) || !item.role)) return;
      const liveNames = normalizedNames(activePlayers.map((player) => String(player.nickname || '')));
      if (liveNames.length !== 10) return;

      busy = true;
      try {
        const response = await fetch('/api/games?archived=0', { credentials: 'include' });
        if (!response.ok) return;
        const games = await response.json();
        const candidates = (Array.isArray(games) ? games : [])
          .filter((game: any) => game?.status === 'draft' && game?.club_protocol?.player_results?.length === 10)
          .filter((game: any) => sameNames(
            liveNames,
            normalizedNames(game.club_protocol.player_results.map((item: any) => String(item.display_name || ''))),
          ))
          .sort((a: any, b: any) => Number(b.global_game_number || b.id || 0) - Number(a.global_game_number || a.id || 0));
        const game = candidates[0];
        if (!game?.id) return;

        void syncSpeech(Number(game.id), liveNames);

        const storageKey = `betting_pool_opened_game_${game.id}`;
        if (sessionStorage.getItem(storageKey) === '1') return;

        const openResponse = await fetch(`/api/games/${game.id}/betting/open`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ roles }),
        });
        if (openResponse.ok || openResponse.status === 409) sessionStorage.setItem(storageKey, '1');
      } catch (error) {
        console.warn('[BETS] Live bridge failed to resolve current game:', error);
      } finally {
        busy = false;
      }
    };

    void tick();
    const interval = window.setInterval(() => { void tick(); }, 750);
    return () => window.clearInterval(interval);
  }, []);

  return null;
}
