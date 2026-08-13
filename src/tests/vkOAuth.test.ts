import { describe, expect, it } from 'vitest';
import {
  appendVkOAuthResult,
  buildVkCodeChallenge,
  encodeVkTokenVerifier,
  getVkOAuthAppId,
  getVkOAuthScopes,
} from '../server/services/vkOAuthService.ts';

describe('VK OAuth helpers', () => {
  it('uses the registered 2LA Noire VK ID app by default', () => {
    const previous = process.env.VK_APP_ID;
    delete process.env.VK_APP_ID;
    expect(getVkOAuthAppId()).toBe('54719021');
    if (previous === undefined) delete process.env.VK_APP_ID;
    else process.env.VK_APP_ID = previous;
  });

  it('requests only the API scopes required for publishing and community access', () => {
    expect(getVkOAuthScopes()).toEqual(['wall', 'groups']);
  });

  it('matches VK ID PKCE challenge and token-verifier encoding', () => {
    expect(buildVkCodeChallenge('abc')).toBe('ungWv48Bz-pBQUDeXa4iI7ADYaOWF3qctBD_YfIAFa0');
    expect(encodeVkTokenVerifier('abc')).toBe('YWJj');
  });

  it('keeps the app hash while appending OAuth result', () => {
    expect(appendVkOAuthResult('/crm?tab=evening#vk', 'vk_connected', '1'))
      .toBe('/crm?tab=evening&vk_connected=1#vk');
  });

  it('rejects external return URLs', () => {
    expect(appendVkOAuthResult('https://evil.example/path', 'vk_error', 'no'))
      .toBe('/?vk_error=no');
  });
});
