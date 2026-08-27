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
    expect(appBackTarget('/player/career')).toBe('/player/games');
    expect(appBackTarget('/player/elo')).toBe('/player/rating');
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
