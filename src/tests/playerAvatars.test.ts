import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.ts';
import { getPlayerAvatarUrl, normalizeAvatarNickname } from '../lib/playerAvatars.ts';

describe('player avatar mapping and serving', () => {
  it('normalizes spaces, case and ё', () => {
    expect(normalizeAvatarNickname('  ЕвГеНий   Чагин ')).toBe('евгений чагин');
    expect(normalizeAvatarNickname('Фёдор')).toBe('федор');
  });

  it('maps every tournament participant and the judge to /player-avatars/...', () => {
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
      expect(url).toMatch(/^\/player-avatars\/[a-z0-9_]+\.jpg$/);
    }
  });

  it('supports known aliases and falls back for an unknown player', () => {
    const bogdanUrl = getPlayerAvatarUrl('Богдан');
    const bogdanchikUrl = getPlayerAvatarUrl('Богданчик');
    expect(bogdanUrl).toBe(bogdanchikUrl);
    expect(typeof bogdanUrl).toBe('string');
    expect(bogdanUrl).toBe('/player-avatars/bogdanchik.jpg');

    const chagaUrl = getPlayerAvatarUrl('Чага');
    const evgeniyChaginUrl = getPlayerAvatarUrl('Евгений Чагин');
    expect(chagaUrl).toBe(evgeniyChaginUrl);
    expect(typeof chagaUrl).toBe('string');
    expect(chagaUrl).toBe('/player-avatars/chagin.jpg');

    expect(getPlayerAvatarUrl('Новый игрок')).toBeNull();
  });

  it('serves static avatar file via Express route and returns 404 for missing image', async () => {
    const app = await createApp();

    const response = await request(app).get('/player-avatars/vid.jpg');
    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('image/jpeg');
    expect(response.body).toBeDefined();
    expect(Buffer.isBuffer(response.body) ? response.body.length : Object.keys(response.body).length).toBeGreaterThan(0);

    const notFound = await request(app).get('/player-avatars/unknown.jpg');
    expect(notFound.status).toBe(404);
  });
});
