import { useEffect, useState } from 'react';
import PlayerLiveCenter from './PlayerLiveCenter.tsx';

export default function PlayerLiveOnlyCenter() {
  const [isLive, setIsLive] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const refresh = async () => {
      try {
        const response = await fetch('/api/player/evening-journey', {
          credentials: 'include',
          cache: 'no-store',
        });
        if (!response.ok) return;
        const body = await response.json().catch(() => ({}));
        if (!cancelled) setIsLive(body?.journey?.phase === 'live');
      } catch {
        // The floating control is optional; keep the cabinet clean on fetch errors.
      }
    };

    void refresh();
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh();
    }, 10_000);
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  return isLive ? <PlayerLiveCenter /> : null;
}
