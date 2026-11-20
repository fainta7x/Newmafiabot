import { afterEach, describe, expect, it, vi } from 'vitest';
import { playerPathToStartParam, startParamToPlayerPath } from '../shared/miniAppStart.ts';
import { miniAppLink } from '../server/services/gameResultCardService.ts';

// 2026-11-17: links in group posts open the bot's Main Mini App on the right page, signed in through Telegram.
describe('Main Mini App links from group posts', () => {
  afterEach(() => { vi.unstubAllEnvs(); });

  it('a player page path survives the start parameter both ways', () => {
    for (const path of ['/player/santa', '/player/sudoku', '/player/daily-word', '/player/telephone/7859dae3-dcce-44bc-9d48-c27a4261f8dd', '/player/events/abc']) {
      const param = playerPathToStartParam(path)!;
      expect(param).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(startParamToPlayerPath(param)).toBe(path);
    }
    expect(playerPathToStartParam('/player')).toBe('');
    expect(playerPathToStartParam('/admin/x')).toBeNull();
    expect(playerPathToStartParam('/player/x?y=1')).toBeNull();
    expect(startParamToPlayerPath('../etc')).toBeNull();
    expect(startParamToPlayerPath('')).toBeNull();
    expect(startParamToPlayerPath(null)).toBeNull();
  });

  it('builds t.me/<bot>?startapp=… and falls back to the plain app link without a bot', async () => {
    vi.stubEnv('PUBLIC_APP_URL', 'https://app.example');
    expect(await miniAppLink('/player/telephone/abc-1', 'MafiaTulaBot')).toBe('https://t.me/MafiaTulaBot?startapp=telephone__abc-1');
    expect(await miniAppLink('/player', 'MafiaTulaBot')).toBe('https://t.me/MafiaTulaBot?startapp');
    expect(await miniAppLink('/player/santa', null)).toBe('https://app.example/player/santa');
    expect(await miniAppLink('/player/x?y=1', 'MafiaTulaBot')).toBe('https://app.example/player/x?y=1');
  });
});
