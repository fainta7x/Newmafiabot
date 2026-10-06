import { describe, expect, it } from 'vitest';
import { appBackTarget, parsePlayerRoute, playerPathForSection } from '../lib/appNavigation.ts';

describe('player app navigation', () => {
  it('keeps event detail in the player events route', () => {
    expect(playerPathForSection('events', 'evening 1')).toBe('/player/events/evening%201');
    expect(parsePlayerRoute('/player/events/evening%201')).toMatchObject({
      section: 'events',
      target: 'evening 1',
      canonicalPath: '/player/events/evening%201',
    });
  });

  it('backs from event detail to events before leaving the section', () => {
    expect(appBackTarget('/player/events/evening-1')).toBe('/player/events');
    expect(appBackTarget('/player/events')).toBe('/player');
  });

  it('keeps game and rating sub-sections inside their hubs', () => {
    // «Карьера» is part of the profile now: its old link opens the profile and goes back to the main screen.
    expect(appBackTarget('/player/career')).toBe('/player');
    // Personal Elo history is a tab of the profile: the old address opens it
    expect(parsePlayerRoute('/player/elo')).toMatchObject({ section: 'profile', target: 'tab:elo', canonicalPath: '/player/profile/elo' });
    expect(parsePlayerRoute('/player/profile/elo')).toMatchObject({ section: 'profile', target: 'tab:elo' });
    expect(parsePlayerRoute('/player/profile')).toMatchObject({ section: 'profile', target: null });
  });

  it('gives a game its own address and backs from it to where the link was tapped', () => {
    expect(playerPathForSection('games', 'club:abc')).toBe('/player/games/club%3Aabc');
    expect(parsePlayerRoute('/player/games/club%3Aabc')).toMatchObject({ section: 'games', target: 'club:abc', canonicalPath: '/player/games/club%3Aabc' });
    expect(parsePlayerRoute('/player/games')).toMatchObject({ section: 'games', target: null });
    // without a remembered place Back goes to the list of games
    expect(appBackTarget('/player/games/club%3Aabc')).toBe('/player/games');
  });

  it('keeps the staff music library inside the conduct hub', () => {
    expect(playerPathForSection('conduct', 'music')).toBe('/player/conduct/music');
    expect(parsePlayerRoute('/player/conduct/music')).toMatchObject({
      section: 'conduct', target: 'music', canonicalPath: '/player/conduct/music',
    });
    expect(appBackTarget('/player/conduct/music')).toBe('/player/conduct');
  });

  it('returns nested CRM tools to the More hub', () => {
    expect(appBackTarget('/admin/more/music')).toBe('/admin/more');
  });
});

describe('new player menu addresses (owner, 2026-10-06)', () => {
  it('opens «Настройки» and «Прогресс» by address and keeps the old ones', async () => {
    const { parsePlayerRoute, playerPathForSection } = await import('../lib/appNavigation.ts');
    expect(parsePlayerRoute('/player/settings')).toMatchObject({ section: 'settings', canonicalPath: '/player/settings' });
    expect(parsePlayerRoute('/player/progress')).toMatchObject({ section: 'profile', canonicalPath: '/player/profile' });
    expect(playerPathForSection('profile', 'tab:learning')).toBe('/player/profile/learning');
    expect(parsePlayerRoute('/player/profile/learning')).toMatchObject({ section: 'profile', target: 'tab:learning' });
    for (const path of ['/player/events', '/player/recaps', '/player/games', '/player/rating', '/player/club', '/player/seasons', '/player/wallet']) {
      expect(parsePlayerRoute(path).canonicalPath).toBe(path);
    }
  });
});
