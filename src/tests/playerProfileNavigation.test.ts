/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { appBackTarget, parsePlayerRoute, playerProfilePath } from '../lib/appNavigation.ts';
import { openCanonicalPlayerProfile } from '../components/player/playerProfileNavigation.ts';

describe('canonical player profile navigation', () => {
  afterEach(() => { window.history.replaceState({}, '', '/'); vi.restoreAllMocks(); });

  it('parses a canonical player path without rewriting it to another cabinet section', () => {
    expect(playerProfilePath('player id')).toBe('/player/players/player%20id');
    expect(parsePlayerRoute('/player/players/player%20id')).toEqual({
      section: 'profile', target: 'player:player id', replayGameKey: null, canonicalPath: '/player/players/player%20id',
    });
  });

  it('stores the exact source route for browser and Telegram Back', () => {
    window.history.replaceState({ existing: true }, '', '/player/rating');
    openCanonicalPlayerProfile('p1');
    expect(window.location.pathname).toBe('/player/players/p1');
    expect(window.history.state.playerProfileReturn).toBe('/player/rating');
    expect(appBackTarget('/player/players/p1')).toBe('/player/rating');
  });
});
