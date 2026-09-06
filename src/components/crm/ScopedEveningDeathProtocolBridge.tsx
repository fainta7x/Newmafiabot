import { useEffect, useState } from 'react';
import { EveningDeathProtocolBridge } from './EveningDeathProtocolOverlay.tsx';

const hasMountedLiveGame = () =>
  typeof document !== 'undefined' && Boolean(document.querySelector('.evening-live-engine-shell'));

/**
 * Death protocol is a judge-only Live Game surface. The underlying live session
 * intentionally survives navigation/recovery, so a stale death_protocol state
 * must never mount this global overlay over the player cabinet or public pages.
 */
export default function ScopedEveningDeathProtocolBridge() {
  const [active, setActive] = useState(() => hasMountedLiveGame());

  useEffect(() => {
    const sync = () => setActive(hasMountedLiveGame());
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });
    sync();
    return () => observer.disconnect();
  }, []);

  return active ? <EveningDeathProtocolBridge /> : null;
}
