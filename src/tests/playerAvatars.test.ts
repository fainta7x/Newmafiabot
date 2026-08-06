import { describe, expect, it } from 'vitest';
import { getPlayerAvatarUrl, normalizeAvatarNickname } from '../lib/playerAvatars.ts';

describe('player avatar mapping', () => {
  it('normalizes spaces, case and ё', () => {
    expect(normalizeAvatarNickname('  ЕвГеНий   Чагин ')).toBe('евгений чагин');
    expect(normalizeAvatarNickname('Фёдор')).toBe('федор');
  });

  it('maps every tournament participant and the judge', () => {
    const nicknames = [
      'Богданчик',
      'Фандорин',
      'Спящий',
      'Знак',
      'Матроскина',
      'Денди',
      'Насон',
      'Пристань',
      'Джава',
      'Вид',
      'Чагин',
    ];
    for (const nickname of nicknames) {
      const url = getPlayerAvatarUrl(nickname);
      expect(typeof url).toBe('string');
      expect(url).not.toBe('');
      expect(url!.length).toBeGreaterThan(0);
    }
  });

  it('supports known aliases and falls back for an unknown player', () => {
    const bogdanUrl = getPlayerAvatarUrl('Богдан');
    const bogdanchikUrl = getPlayerAvatarUrl('Богданчик');
    expect(bogdanUrl).toBe(bogdanchikUrl);
    expect(typeof bogdanUrl).toBe('string');

    const chagaUrl = getPlayerAvatarUrl('Чага');
    const evgeniyChaginUrl = getPlayerAvatarUrl('Евгений Чагин');
    expect(chagaUrl).toBe(evgeniyChaginUrl);
    expect(typeof chagaUrl).toBe('string');

    expect(getPlayerAvatarUrl('Новый игрок')).toBeNull();
  });
});
