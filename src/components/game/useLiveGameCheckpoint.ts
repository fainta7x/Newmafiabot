import { useEffect } from 'react';
import type { GameKey } from '../../shared/game.ts';
import { liveGameCheckpointApi, readLiveGameCheckpoint } from '../../lib/liveGameCheckpoint.ts';

const INTERVAL_MS = 3_000;

/** «Продолжить игру»: sends this device's session of ANY game to the server every few seconds while it changes. */
export const useLiveGameCheckpoint = (key: GameKey, livePhase: string, enabled: boolean) => {
  useEffect(() => {
    if (!enabled || livePhase === 'setup' || livePhase === 'finished') return;
    let disposed = false;
    let inFlight = false;
    let lastSent = '';
    const tick = async () => {
      if (disposed || inFlight) return;
      const checkpoint = readLiveGameCheckpoint(key);
      if (!checkpoint) return;
      const signature = JSON.stringify(checkpoint);
      if (signature === lastSent) return;
      inFlight = true;
      try {
        await liveGameCheckpointApi.save(key, checkpoint);
        lastSent = signature;
      } catch { /* the game goes on; the next tick tries again */ } finally {
        inFlight = false;
      }
    };
    void tick();
    const id = window.setInterval(() => void tick(), INTERVAL_MS);
    return () => { disposed = true; window.clearInterval(id); };
  }, [key, livePhase, enabled]);
};
