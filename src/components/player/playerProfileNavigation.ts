export const PLAYER_PROFILE_NAVIGATION_EVENT = '2la:open-player-profile';

export const playerProfilePath = (playerId: string) => `/player/players/${encodeURIComponent(playerId)}`;

/**
 * Opens the canonical player profile without unmounting the source Player Cabinet surface.
 * The source screen therefore keeps its filters, selected tab and scroll position when
 * browser/Telegram Back returns from the profile overlay.
 */
export const openCanonicalPlayerProfile = (playerId: string) => {
  const id = String(playerId || '').trim();
  if (!id) return;
  window.dispatchEvent(new CustomEvent(PLAYER_PROFILE_NAVIGATION_EVENT, { detail: { playerId: id } }));
};
