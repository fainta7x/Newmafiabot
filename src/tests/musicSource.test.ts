import { describe, expect, it } from 'vitest';
import { normalizeYandexMusicUrl } from '../lib/musicSource.ts';

describe('Yandex Music links', () => {
  it('accepts the current shared playlist link without an owner, with or without tracking parameters', () => {
    const uuid = 'lk.4f1e6b0a-2c1d-4a53-9a77-3d9d4e6a1b22';
    const plain = normalizeYandexMusicUrl(`https://music.yandex.ru/playlists/${uuid}`);
    expect(plain).toMatchObject({ kind: 'yandex_playlist', normalizedUrl: `https://music.yandex.ru/playlists/${uuid}`, embedUrl: null });
    expect(normalizeYandexMusicUrl(`https://music.yandex.ru/playlists/${uuid}?utm_source=web&utm_medium=copy_link`).normalizedUrl).toBe(plain.normalizedUrl);
    expect(normalizeYandexMusicUrl('music.yandex.ru/playlists/1000/').normalizedUrl).toBe('https://music.yandex.ru/playlists/1000');
  });

  it('still accepts the old owner playlist link and track links', () => {
    expect(normalizeYandexMusicUrl('https://music.yandex.ru/users/some.user/playlists/1003')).toMatchObject({ kind: 'yandex_playlist', normalizedUrl: 'https://music.yandex.ru/users/some.user/playlists/1003' });
    expect(normalizeYandexMusicUrl('https://music.yandex.ru/album/123/track/456')).toMatchObject({ kind: 'yandex_track', normalizedUrl: 'https://music.yandex.ru/album/123/track/456' });
  });

  it('still rejects other pages and other sites', () => {
    expect(() => normalizeYandexMusicUrl('https://music.yandex.ru/')).toThrow('Нужна ссылка на трек или плейлист');
    expect(() => normalizeYandexMusicUrl('https://music.yandex.ru/playlists/')).toThrow('Нужна ссылка на трек или плейлист');
    expect(() => normalizeYandexMusicUrl('https://example.com/playlists/abc')).toThrow('Яндекс Музыки');
  });
});
