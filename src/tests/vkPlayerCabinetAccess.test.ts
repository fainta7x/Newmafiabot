import { describe, expect, it } from 'vitest';
import { parsePlayerRoute, playerPathForSection, playerProfilePath } from '../lib/appNavigation.ts';

const canonicalSections = [
  ['home', '/player'],
  ['events', '/player/events'],
  ['games', '/player/games'],
  ['rating', '/player/rating'],
  ['stats', '/player/stats'],
  ['elo', '/player/elo'],
  ['career', '/player/career'],
  ['clubworld', '/player/seasons'],
  ['club', '/player/club'],
  ['wallet', '/player/wallet'],
  ['profile', '/player/profile'],
  ['recaps', '/player/recaps'],
  ['conduct', '/player/conduct'],
] as const;

describe('VK canonical player cabinet access', () => {
  it('routes every main cabinet destination through the shared /player application', () => {
    for (const [section, path] of canonicalSections) {
      expect(playerPathForSection(section)).toBe(path);
      expect(path.startsWith('/player')).toBe(true);
      expect(parsePlayerRoute(path).section).toBe(section);
    }
  });

  it('keeps event, replay and public-player profile deep links inside the canonical cabinet', () => {
    expect(playerPathForSection('events', 'evening-42')).toBe('/player/events/evening-42');
    expect(parsePlayerRoute('/player/events/evening-42')).toMatchObject({ section: 'events', target: 'evening-42' });

    expect(playerProfilePath('player-42')).toBe('/player/players/player-42');
    expect(parsePlayerRoute('/player/players/player-42')).toMatchObject({
      section: 'profile',
      target: 'player:player-42',
    });

    expect(parsePlayerRoute('/player/replay/game-42')).toMatchObject({
      section: 'games',
      replayGameKey: 'game-42',
    });
  });

  it('keeps payment aliases on the same canonical player wallet', () => {
    expect(playerPathForSection('payments')).toBe('/player/wallet');
    expect(playerPathForSection('wallet')).toBe('/player/wallet');
    expect(parsePlayerRoute('/player/payments').canonicalPath).toBe('/player/wallet');
  });
});
