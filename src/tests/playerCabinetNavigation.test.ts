import { describe, expect, it } from 'vitest';
import {
  PLAYER_CABINET_NAV,
  PLAYER_NAV_SECTION,
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
    // «Карьера» and «Статистика» live in the one profile now.
    expect(normalizePlayerCabinetSection('stats')).toBe('profile');
    expect(normalizePlayerCabinetSection('career')).toBe('profile');
    expect(normalizePlayerCabinetSection('elo')).toBe('profile');
  });

  it('keeps game and rating sub-sections in their canonical groups', () => {
    for (const section of ['games', 'recaps'] as const) {
      expect(isPlayerGameSection(section)).toBe(true);
      expect(isPlayerRatingSection(section)).toBe(false);
    }

    for (const section of ['rating', 'ratingperiods', 'ratingtournaments'] as const) {
      expect(isPlayerRatingSection(section)).toBe(true);
      expect(isPlayerGameSection(section)).toBe(false);
    }
  });

  it('maps every section to its place in the five-item menu with always-accessible School', () => {
    for (const section of ['events', 'recaps', 'games'] as const) expect(isPlayerCabinetNavActive('evenings', section)).toBe(true);
    for (const section of ['rating', 'ratingperiods', 'ratingtournaments', 'club', 'clubworld', 'more'] as const) {
      expect(isPlayerCabinetNavActive('community', section)).toBe(true);
    }
    for (const section of ['profile', 'elo', 'stats', 'career'] as const) expect(isPlayerCabinetNavActive('progress', section)).toBe(true);
    expect(isPlayerCabinetNavActive('evenings', 'rating')).toBe(false);
    expect(isPlayerCabinetNavActive('community', 'games')).toBe(false);
    expect(isPlayerCabinetNavActive('progress', 'club')).toBe(false);
    expect(isPlayerCabinetNavActive('school', 'learning')).toBe(true);
    expect(isPlayerCabinetNavActive('school', 'profile')).toBe(false);
  });

  it('highlights exactly the open place and none for the wallet and the settings', () => {
    const cases = [['home', 'home'], ['events', 'evenings'], ['games', 'evenings'], ['rating', 'community'], ['club', 'community'], ['profile', 'progress'], ['learning', 'school']] as const;
    for (const [section, expectedNav] of cases) {
      const active = PLAYER_CABINET_NAV.filter((item) => isPlayerCabinetNavActive(item.id, section)).map((item) => item.id);
      expect(active).toEqual([expectedNav]);
    }
    for (const section of ['wallet', 'settings', 'conduct'] as const) {
      expect(PLAYER_CABINET_NAV.some((item) => isPlayerCabinetNavActive(item.id, section))).toBe(false);
    }
  });

  it('keeps the menu order and opens each place on its first screen', () => {
    expect(PLAYER_CABINET_NAV.map((item) => item.label)).toEqual(['Главная', 'Вечера', 'Сообщество', 'Прогресс', 'Школа']);
    expect(PLAYER_NAV_SECTION).toEqual({ home: 'home', evenings: 'events', community: 'rating', progress: 'profile', school: 'learning' });
  });
});
