import { useEffect } from 'react';
import { buildDealBroadcastState, readDealBroadcast, type DealBroadcastMetadata } from '../../lib/liveBroadcastDeal';
import type { LiveBroadcastState } from '../../lib/liveBroadcast';

/**
 * While the judge deals the roles (the game is still in setup), the stream shows the deal: one loop for every game format,
 * each sending through its own broadcast route. A failed send is retried by the next tick; the deal never waits for it.
 */
export const useDealBroadcast = (
  enabled: boolean,
  metadata: DealBroadcastMetadata | null,
  publish: (state: LiveBroadcastState) => Promise<unknown>,
) => {
  const metadataKey = metadata ? JSON.stringify(metadata) : '';
  useEffect(() => {
    if (!enabled || !metadata) return undefined;
    let disposed = false;
    let inFlight = false;
    let lastSent = '';
    let lastAt = 0;
    const sync = async () => {
      if (disposed || inFlight) return;
      const deal = readDealBroadcast();
      if (!deal) return;
      const signature = JSON.stringify(deal);
      if (signature === lastSent && Date.now() - lastAt < 5_000) return;
      inFlight = true;
      try {
        await publish(buildDealBroadcastState(metadata, deal));
        lastSent = signature;
        lastAt = Date.now();
      } catch { lastSent = ''; } finally { inFlight = false; }
    };
    void sync();
    const interval = window.setInterval(() => { void sync(); }, 350);
    return () => { disposed = true; window.clearInterval(interval); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, metadataKey]);
};
