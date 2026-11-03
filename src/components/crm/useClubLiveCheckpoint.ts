import { useEffect } from 'react';
import { clubGamesApi, type LiveGameCheckpointPayload } from '../../lib/clubGamesApi';
import { clubLiveDeathProtocolKey, clubLiveEvidenceKey, clubLiveProtocolNotesKey, clubLiveSessionKey } from '../../lib/liveClubSession';

/** Undo steps kept in the server copy: enough to take back the last actions, small enough for one request. */
const HISTORY_KEPT = 5;
const INTERVAL_MS = 3_000;

const read = (key: string): string | null => { try { return localStorage.getItem(key); } catch { return null; } };

/** The device copy of a club game's session as the server keeps it (AR04 «Продолжить игру»). */
export const readClubLiveCheckpoint = (gameId: number): LiveGameCheckpointPayload | null => {
  const raw = read(clubLiveSessionKey(gameId));
  if (!raw) return null;
  try {
    const session = JSON.parse(raw);
    if (!session?.phase || session.phase === 'setup') return null;
    if (Array.isArray(session.historyStack)) session.historyStack = session.historyStack.slice(-HISTORY_KEPT);
    return {
      session: JSON.stringify(session),
      evidence: read(clubLiveEvidenceKey(gameId)),
      death_protocols: read(clubLiveDeathProtocolKey(gameId)),
      notes: read(clubLiveProtocolNotesKey(gameId)),
    };
  } catch {
    return null;
  }
};

/** Writes a server copy back to this device, so the engine restores it as its own saved session. */
export const writeClubLiveCheckpoint = (gameId: number, checkpoint: LiveGameCheckpointPayload) => {
  localStorage.setItem(clubLiveSessionKey(gameId), checkpoint.session);
  if (checkpoint.evidence) localStorage.setItem(clubLiveEvidenceKey(gameId), checkpoint.evidence);
  if (checkpoint.death_protocols) localStorage.setItem(clubLiveDeathProtocolKey(gameId), checkpoint.death_protocols);
  if (checkpoint.notes !== null && checkpoint.notes !== undefined) localStorage.setItem(clubLiveProtocolNotesKey(gameId), checkpoint.notes);
};

/** Sends the device copy to the server every few seconds while it changes; a failure is retried on the next tick. */
export const useClubLiveCheckpoint = (gameId: number, livePhase: string, enabled: boolean) => {
  useEffect(() => {
    if (!enabled || livePhase === 'setup' || livePhase === 'finished') return;
    let disposed = false;
    let inFlight = false;
    let lastSent = '';
    const tick = async () => {
      if (disposed || inFlight) return;
      const checkpoint = readClubLiveCheckpoint(gameId);
      if (!checkpoint) return;
      const signature = JSON.stringify(checkpoint);
      if (signature === lastSent) return;
      inFlight = true;
      try {
        await clubGamesApi.saveLiveCheckpoint(gameId, checkpoint);
        lastSent = signature;
      } catch { /* the game goes on; the next tick tries again */ } finally {
        inFlight = false;
      }
    };
    void tick();
    const id = window.setInterval(() => void tick(), INTERVAL_MS);
    return () => { disposed = true; window.clearInterval(id); };
  }, [gameId, livePhase, enabled]);
};
