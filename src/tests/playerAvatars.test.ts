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
      expect(getPlayerAvatarUrl(nickname), nickname).toMatch(/^\/avatars\/tournament-2026\/.+\.jpg$/);
    }
  });

  it('supports known aliases and falls back for an unknown player', () => {
    expect(getPlayerAvatarUrl('Богдан')).toBe(getPlayerAvatarUrl('Богданчик'));
    expect(getPlayerAvatarUrl('Чага')).toBe(getPlayerAvatarUrl('Евгений Чагин'));
    expect(getPlayerAvatarUrl('Новый игрок')).toBeNull();
  });
});
