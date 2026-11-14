import { useEffect, useRef, useState } from 'react';
import type { GameKey } from '../../shared/game.ts';
import { liveGameCheckpointApi, readCheckpointRevision, readLiveGameCheckpoint, storeCheckpointRevision, writeLiveGameCheckpoint } from '../../lib/liveGameCheckpoint.ts';
import { markAutoRestore } from '../../lib/liveGameResume.ts';
import { RequestJsonError } from '../../lib/requestJson.ts';

const INTERVAL_MS = 3_000;
export interface CheckpointSyncStatus {
  error: string | null;
  conflict: boolean;
  busy: boolean;
  retry: () => Promise<void>;
  restore: () => Promise<void>;
  useThisDevice: () => Promise<void>;
}

/** The revision belongs to this running writer. Another tab's newer revision
 * must never silently authorize this tab to overwrite the server. */
export const useLiveGameCheckpoint = (key: GameKey, livePhase: string, enabled: boolean): CheckpointSyncStatus => {
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [busy, setBusy] = useState(false);
  const phase = useRef(livePhase);
  phase.current = livePhase;
  const actions = useRef({ retry: async () => {}, restore: async () => {}, useThisDevice: async () => {} });
  useEffect(() => {
    if (!enabled) return;
    let disposed = false;
    let inFlight = false;
    let blocked = false;
    let lastSent = '';
    let revision = readCheckpointRevision(key);
    setError(null); setConflict(false);
    const failed = (cause: unknown) => {
      if (disposed) return;
      blocked = cause instanceof RequestJsonError && cause.body?.code === 'checkpoint_conflict';
      setConflict(blocked);
      setError(blocked ? 'На сервере есть другая копия игры. Выберите, какую продолжить.' : 'Серверная копия не обновляется. Игра на этом устройстве продолжается.');
    };
    const save = async (takeOver = false) => {
      if (disposed || inFlight || (!takeOver && blocked) || phase.current === 'setup' || phase.current === 'finished') return;
      const checkpoint = readLiveGameCheckpoint(key);
      if (!checkpoint) return;
      const signature = JSON.stringify(checkpoint);
      if (!takeOver && signature === lastSent) return;
      inFlight = true; setBusy(true);
      try {
        if (takeOver) {
          try { revision = (await liveGameCheckpointApi.load(key)).revision; }
          catch (cause) {
            // A completed/reopened game may no longer have its earlier copy.
            if (cause instanceof RequestJsonError && cause.status === 404) revision = null;
            else throw cause;
          }
        }
        if (disposed) return;
        const answer = await liveGameCheckpointApi.save(key, checkpoint, revision);
        revision = answer.revision;
        // The server may have accepted a response that never reached us. In that
        // case the next attempt conflicts safely instead of blindly overwriting.
        if (!disposed) {
          storeCheckpointRevision(key, revision);
          lastSent = signature; blocked = false; setConflict(false); setError(null);
        }
      } catch (cause) { failed(cause); } finally { inFlight = false; if (!disposed) setBusy(false); }
    };
    actions.current = {
      retry: () => save(),
      useThisDevice: () => save(true),
      restore: async () => {
        if (disposed || inFlight) return;
        inFlight = true; setBusy(true);
        try {
          const copy = await liveGameCheckpointApi.load(key);
          if (disposed) return;
          writeLiveGameCheckpoint(key, copy);
          markAutoRestore();
          window.location.reload();
        } catch (cause) { failed(cause); } finally { inFlight = false; if (!disposed) setBusy(false); }
      },
    };
    void save();
    const id = window.setInterval(() => void save(), INTERVAL_MS);
    return () => { disposed = true; window.clearInterval(id); };
  }, [key, enabled]);
  return { error, conflict, busy, retry: () => actions.current.retry(), restore: () => actions.current.restore(), useThisDevice: () => actions.current.useThisDevice() };
};
