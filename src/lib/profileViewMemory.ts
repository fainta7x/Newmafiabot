export type ProfileView = {
  tab?: string; period?: 'all' | 'season' | 'custom'; from?: string; to?: string;
  role?: string; team?: string; result?: string; statPeriod?: string; statFormat?: string;
  offset?: number; scrolls?: Record<string, number>;
};
const key = (viewer: string, player: string) => `profile-view:${viewer}:${player}`;
/** Preferences only: never persist profile responses, contacts or game data. */
export function readProfileView(viewer: string, player: string): ProfileView {
  try {
    const value = JSON.parse(sessionStorage.getItem(key(viewer, player)) || '{}');
    return value && typeof value === 'object' ? { ...value, offset: Math.max(0, Math.trunc(Number(value.offset) || 0)) } : {};
  } catch { return {}; }
}
export function writeProfileView(viewer: string, player: string, view: ProfileView) {
  try { sessionStorage.setItem(key(viewer, player), JSON.stringify(view)); } catch { /* Optional view memory. */ }
}
