import { describe, expect, it } from 'vitest';
import { medalTierFromPlace, nominationGlyphFromTitle } from '../components/player/TrophyIcons.tsx';

describe('trophy icons', () => {
  it('reads the medal place from the verified place text only', () => {
    expect(medalTierFromPlace('1 место')).toBe(1);
    expect(medalTierFromPlace('2-е место')).toBe(2);
    expect(medalTierFromPlace('3 место на турнире')).toBe(3);
    expect(medalTierFromPlace('11 место')).toBeNull();
    expect(medalTierFromPlace('участник')).toBeNull();
    expect(medalTierFromPlace(null)).toBeNull();
  });

  it('picks a nomination symbol from its title', () => {
    expect(nominationGlyphFromTitle('Лучший шериф турнира')).toBe('sheriff');
    expect(nominationGlyphFromTitle('Лучший дон')).toBe('don');
    expect(nominationGlyphFromTitle('MVP вечера')).toBe('mvp');
    expect(nominationGlyphFromTitle('Лучший ход')).toBe('move');
    expect(nominationGlyphFromTitle('Что-то особенное')).toBe('star');
  });
});
