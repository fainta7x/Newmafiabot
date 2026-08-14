import { describe, expect, it } from 'vitest';
import { appBackTarget, isRoutePrefix, parsePlayerRoute, playerPathForSection } from './appNavigation.ts';

describe('player route parsing', () => {
  it('keeps canonical player roots stable', () => {
    expect(parsePlayerRoute('/player')).toMatchObject({ section: 'home', canonicalPath: '/player', target: null, replayGameKey: null });
    expect(parsePlayerRoute('/player/games')).toMatchObject({ section: 'games', canonicalPath: '/player/games' });
    expect(parsePlayerRoute('/player/seasons')).toMatchObject({ section: 'clubworld', canonicalPath: '/player/seasons' });
    expect(parsePlayerRoute('/player/rating/periods')).toMatchObject({ section: 'ratingperiods', canonicalPath: '/player/rating/periods' });
  });

  it('normalizes old judging aliases to the conduct route', () => {
    for (const alias of ['judging', 'host', 'table']) {
      expect(parsePlayerRoute(`/player/${alias}`)).toMatchObject({ section: 'conduct', canonicalPath: '/player/conduct' });
    }
  });

  it('preserves recap and replay targets through refresh-safe URLs', () => {
    expect(parsePlayerRoute('/player/recaps/evening%3A42')).toMatchObject({
      section: 'recaps',
      target: 'evening:42',
      canonicalPath: '/player/recaps/evening%3A42',
    });
    expect(parsePlayerRoute('/player/replay/club%3Agame-1')).toMatchObject({
      section: 'games',
      replayGameKey: 'club:game-1',
      canonicalPath: '/player/replay/club%3Agame-1',
    });
  });

  it('falls unknown player paths back to the canonical home', () => {
    expect(parsePlayerRoute('/player/does-not-exist')).toMatchObject({ section: 'home', canonicalPath: '/player' });
  });
});

describe('path builders and back targets', () => {
  it('builds encoded recap and rating-period links', () => {
    expect(playerPathForSection('recaps', 'evening:42')).toBe('/player/recaps/evening%3A42');
    expect(playerPathForSection('ratingperiods')).toBe('/player/rating/periods');
  });

  it('gives Telegram a deterministic parent screen', () => {
    expect(appBackTarget('/player')).toBeNull();
    expect(appBackTarget('/player/games')).toBe('/player');
    expect(appBackTarget('/player/replay/club%3A1')).toBe('/player/games');
    expect(appBackTarget('/player/recaps/e1')).toBe('/player/recaps');
    expect(appBackTarget('/player/elo')).toBe('/player/rating');
    expect(appBackTarget('/player/rating/periods')).toBe('/player/rating');
    expect(appBackTarget('/player/seasons')).toBe('/player/rating');
    expect(appBackTarget('/admin')).toBeNull();
    expect(appBackTarget('/admin/evenings/e1/games')).toBe('/admin/evenings/e1');
    expect(appBackTarget('/admin/evenings/e1')).toBe('/admin/evenings');
    expect(appBackTarget('/admin/players/p1')).toBe('/admin/players');
  });

  it('does not confuse similarly named prefixes', () => {
    expect(isRoutePrefix('/join/abc', '/join')).toBe(true);
    expect(isRoutePrefix('/joining', '/join')).toBe(false);
    expect(isRoutePrefix('/liveboard', '/live')).toBe(false);
  });
});
