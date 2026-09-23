import { describe, expect, it } from 'vitest';
import { countGames, countPlayers, countWins, russianPlural } from './russianPlural';

describe('russianPlural', () => {
  it('picks the Russian noun form for a count', () => {
    expect([1, 2, 5, 11, 21, 22, 112].map(countGames)).toEqual(['1 игра', '2 игры', '5 игр', '11 игр', '21 игра', '22 игры', '112 игр']);
    expect(countPlayers(3)).toBe('3 игрока');
    expect(countWins(0)).toBe('0 побед');
    expect(countGames(undefined)).toBe('0 игр');
    expect(russianPlural(1.5, 'а', 'б', 'в')).toBe('б');
  });
});
