export type MusicSourceKind = 'yandex_track' | 'yandex_playlist';

export type NormalizedMusicSource = {
  kind: MusicSourceKind;
  sourceUrl: string;
  normalizedUrl: string;
  embedUrl: string | null;
};

const YANDEX_HOSTS = new Set([
  'music.yandex.ru',
  'music.yandex.com',
  'music.yandex.kz',
  'music.yandex.by',
  'music.yandex.uz',
]);

const cleanId = (value: string | undefined) => String(value || '').trim().replace(/[^0-9]/g, '');

export function normalizeYandexMusicUrl(rawValue: string): NormalizedMusicSource {
  const raw = String(rawValue || '').trim();
  if (!raw) throw new Error('Вставьте ссылку Яндекс Музыки.');

  let url: URL;
  try {
    url = new URL(raw.startsWith('http://') || raw.startsWith('https://') ? raw : `https://${raw}`);
  } catch {
    throw new Error('Не удалось распознать ссылку.');
  }

  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  if (!YANDEX_HOSTS.has(host)) throw new Error('Поддерживаются ссылки Яндекс Музыки.');

  const iframeTrack = url.pathname.replace(/\/+$/, '') === '/iframe' && url.hash.match(/^#track\/(\d+)\/(\d+)$/);
  if (iframeTrack) {
    const trackId = cleanId(iframeTrack[1]);
    const albumId = cleanId(iframeTrack[2]);
    if (!trackId || !albumId) throw new Error('Некорректная ссылка на трек.');
    return {
      kind: 'yandex_track',
      sourceUrl: raw,
      normalizedUrl: `https://music.yandex.ru/album/${albumId}/track/${trackId}`,
      embedUrl: `https://music.yandex.ru/iframe/#track/${trackId}/${albumId}`,
    };
  }

  const track = url.pathname.match(/^\/album\/(\d+)\/track\/(\d+)\/?$/);
  if (track) {
    const albumId = cleanId(track[1]);
    const trackId = cleanId(track[2]);
    return {
      kind: 'yandex_track',
      sourceUrl: raw,
      normalizedUrl: `https://music.yandex.ru/album/${albumId}/track/${trackId}`,
      embedUrl: `https://music.yandex.ru/iframe/#track/${trackId}/${albumId}`,
    };
  }

  const playlist = url.pathname.match(/^\/users\/([^/]+)\/playlists\/(\d+)\/?$/);
  if (playlist) {
    const owner = decodeURIComponent(playlist[1]).trim();
    const playlistId = cleanId(playlist[2]);
    if (!owner || !playlistId) throw new Error('Некорректная ссылка на плейлист.');
    return {
      kind: 'yandex_playlist',
      sourceUrl: raw,
      normalizedUrl: `https://music.yandex.ru/users/${encodeURIComponent(owner)}/playlists/${playlistId}`,
      embedUrl: null,
    };
  }

  throw new Error('Нужна ссылка на трек или плейлист Яндекс Музыки.');
}

export const musicEntryKey = (normalizedUrl: string) => `yandex:${normalizedUrl}`;
