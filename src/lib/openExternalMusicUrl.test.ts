// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { openExternalMusicUrl } from './openExternalMusicUrl.ts';

describe('openExternalMusicUrl', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete (window as Window & { Telegram?: unknown }).Telegram;
  });

  it('delegates to Telegram WebApp when available', () => {
    const openLink = vi.fn();
    Object.defineProperty(window, 'Telegram', {
      configurable: true,
      value: { WebApp: { openLink } },
    });

    expect(openExternalMusicUrl('https://music.yandex.ru/album/42/track/7')).toBe(true);
    expect(openLink).toHaveBeenCalledOnce();
    expect(openLink).toHaveBeenCalledWith('https://music.yandex.ru/album/42/track/7');
  });

  it('ignores empty links', () => {
    expect(openExternalMusicUrl('  ')).toBe(false);
  });
});
