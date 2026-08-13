import { describe, expect, it } from 'vitest';
import {
  appendVkOAuthResult,
  buildVkAuthorizationCodeTokenRequest,
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

  it('uses the same verifier for VK ID PKCE challenge and token exchange', () => {
    expect(buildVkCodeChallenge('abc')).toBe('ungWv48Bz-pBQUDeXa4iI7ADYaOWF3qctBD_YfIAFa0');
    expect(encodeVkTokenVerifier('abc')).toBe('abc');
  });

  it('matches the current VK ID Web SDK token exchange shape', () => {
    const request = buildVkAuthorizationCodeTokenRequest({
      appId: '54719021',
      verifier: 'verifier-123',
      redirectUri: 'https://twola-noire-web-staging.onrender.com/api/integrations/vk/oauth/callback',
      code: 'vk-code',
      deviceId: 'device-1',
      state: 'state-1',
    });
    expect(request.query.get('grant_type')).toBe('authorization_code');
    expect(request.query.get('client_id')).toBe('54719021');
    expect(request.query.get('code_verifier')).toBe('verifier-123');
    expect(request.query.get('device_id')).toBe('device-1');
    expect(request.query.get('state')).toBe('state-1');
    expect(request.query.has('code')).toBe(false);
    expect(request.body.get('code')).toBe('vk-code');
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
