import { describe, expect, it } from 'vitest';
import {
  PLAYER_CABINET_NAV,
  isPlayerCabinetNavActive,
  isPlayerGameSection,
  isPlayerRatingSection,
  normalizePlayerCabinetSection,
} from '../components/player/playerCabinetNavigation.ts';

describe('player cabinet navigation model', () => {
  it('normalizes legacy aliases without changing current sections', () => {
    expect(normalizePlayerCabinetSection('more')).toBe('club');
    expect(normalizePlayerCabinetSection('payments')).toBe('wallet');
    expect(normalizePlayerCabinetSection('home')).toBe('home');
    expect(normalizePlayerCabinetSection('games')).toBe('games');
  });

  it('keeps game and rating sub-sections in their canonical groups', () => {
    for (const section of ['games', 'stats', 'career', 'recaps'] as const) {
      expect(isPlayerGameSection(section)).toBe(true);
      expect(isPlayerRatingSection(section)).toBe(false);
    }

    for (const section of ['rating', 'elo', 'ratingperiods', 'clubworld'] as const) {
      expect(isPlayerRatingSection(section)).toBe(true);
      expect(isPlayerGameSection(section)).toBe(false);
    }
  });

  it('maps nested sections to the correct primary navigation item', () => {
    expect(isPlayerCabinetNavActive('games', 'games')).toBe(true);
    expect(isPlayerCabinetNavActive('games', 'stats')).toBe(true);
    expect(isPlayerCabinetNavActive('games', 'career')).toBe(true);
    expect(isPlayerCabinetNavActive('rating', 'elo')).toBe(true);
    expect(isPlayerCabinetNavActive('rating', 'clubworld')).toBe(true);
    expect(isPlayerCabinetNavActive('club', 'more')).toBe(true);
    expect(isPlayerCabinetNavActive('rating', 'games')).toBe(false);
    expect(isPlayerCabinetNavActive('club', 'profile')).toBe(false);
  });

  it('keeps the primary navigation order stable', () => {
    expect(PLAYER_CABINET_NAV.map((item) => item.id)).toEqual(['home', 'events', 'games', 'rating', 'club']);
  });
});
