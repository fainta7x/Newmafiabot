import { playerProfilePath } from '../../lib/appNavigation.ts';

export const PLAYER_PROFILE_NAVIGATION_EVENT = '2la:open-player-profile';

/** Opens the canonical profile while retaining the source surface under the overlay. */
export const openCanonicalPlayerProfile = (playerId: string) => {
  const id = String(playerId || '').trim();
  if (!id) return;
  const returnPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  window.history.pushState({ ...(window.history.state || {}), playerProfileReturn: returnPath }, '', playerProfilePath(id));
  window.dispatchEvent(new PopStateEvent('popstate'));
  window.dispatchEvent(new CustomEvent(PLAYER_PROFILE_NAVIGATION_EVENT, { detail: { playerId: id } }));
};
