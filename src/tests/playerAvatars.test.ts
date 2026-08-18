import { describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import publicRoutesBase from '../server/routes/publicRoutesBase.ts';
import { getPlayerAvatarUrl, normalizeAvatarNickname } from '../lib/playerAvatars.ts';

describe('player avatar mapping and serving', () => {
  it('normalizes spaces, case and ё', () => {
    expect(normalizeAvatarNickname('  ЕвГеНий   Чагин ')).toBe('евгений чагин');
    expect(normalizeAvatarNickname('Фёдор')).toBe('федор');
  });

  it('maps every tournament participant and the judge to /api/public/player-avatar-data/...', () => {
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
      expect(url).toMatch(/^\/api\/public\/player-avatar-data\/[a-z0-9_]+\.jpg$/);
    }
  });

  it('supports known aliases and falls back for an unknown player', () => {
    const bogdanUrl = getPlayerAvatarUrl('Богдан');
    const bogdanchikUrl = getPlayerAvatarUrl('Богданчик');
    expect(bogdanUrl).toBe(bogdanchikUrl);
    expect(typeof bogdanUrl).toBe('string');
    expect(bogdanUrl).toBe('/api/public/player-avatar-data/bogdanchik.jpg');

    const chagaUrl = getPlayerAvatarUrl('Чага');
    const evgeniyChaginUrl = getPlayerAvatarUrl('Евгений Чагин');
    expect(chagaUrl).toBe(evgeniyChaginUrl);
    expect(typeof chagaUrl).toBe('string');
    expect(chagaUrl).toBe('/api/public/player-avatar-data/chagin.jpg');

    expect(getPlayerAvatarUrl('Новый игрок')).toBeNull();
  });

  it('serves static avatar base64 dataUrl via Express route and returns 404 for missing image', async () => {
    const app = express();
    app.use('/api/public', publicRoutesBase);

    const response = await request(app).get('/api/public/player-avatar-data/vid.jpg');
    expect(response.status).toBe(200);
    expect(response.body.dataUrl).toBeDefined();
    expect(typeof response.body.dataUrl).toBe('string');
    expect(response.body.dataUrl.startsWith('data:image/jpeg;base64,')).toBe(true);

    const notFound = await request(app).get('/api/public/player-avatar-data/unknown.jpg');
    expect(notFound.status).toBe(404);
  });
});
