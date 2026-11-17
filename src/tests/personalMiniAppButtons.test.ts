import { afterEach, describe, expect, it, vi } from 'vitest';
import { miniAppButtons, telegramActionMarkup } from '../server/services/personalNotificationText.ts';

// 2026-11-17 «авторизации сбрасываются»: a `url` button opens Telegram's browser, where the app does not know the
// player (on iPhone without cookies, so every time). Buttons to the app open it as a Mini App instead.
describe('personal Telegram buttons open the app as a Mini App', () => {
  afterEach(() => { vi.unstubAllEnvs(); });

  it('turns a url button to the app into web_app and leaves other links alone', () => {
    vi.stubEnv('PUBLIC_APP_URL', 'https://club.example');
    const markup = { inline_keyboard: [[{ text: '🎨 Открыть', url: 'https://club.example/player/telephone/1' }, { text: 'VK', url: 'https://vk.com/club' }], [{ text: 'Да', callback_data: 'yes' }]] };
    expect(miniAppButtons(markup)).toEqual({ inline_keyboard: [[{ text: '🎨 Открыть', web_app: { url: 'https://club.example/player/telephone/1' } }, { text: 'VK', url: 'https://vk.com/club' }], [{ text: 'Да', callback_data: 'yes' }]] });
  });

  it('a message without buttons gets «Открыть в приложении» to its page', () => {
    vi.stubEnv('PUBLIC_APP_URL', 'https://club.example/player');
    expect(telegramActionMarkup('/player/santa')).toEqual({ inline_keyboard: [[{ text: '📱 Открыть в приложении', web_app: { url: 'https://club.example/player/santa' } }]] });
    expect(telegramActionMarkup('/admin')).toBeNull();
    expect(telegramActionMarkup(null)).toBeNull();
  });
});
