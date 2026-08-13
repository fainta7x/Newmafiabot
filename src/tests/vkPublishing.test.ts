import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createVkWallPost,
  getVkDestinations,
  getVkIntegrationStatus,
  setVkRuntimeUserToken,
} from '../server/services/vkPublishingService.ts';

const ENV_KEYS = [
  'VK_ACCESS_TOKEN',
  'VK_GROUP_ACCESS_TOKEN',
  'VK_GROUP_ID',
  'VK_CHANNEL_API_PEER_ID',
  'VK_CHANNEL_PEER_ID',
] as const;

const originalEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

afterEach(() => {
  for (const key of ENV_KEYS) {
    const value = originalEnv[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  setVkRuntimeUserToken('');
  vi.restoreAllMocks();
});

describe('VK publishing adapter', () => {
  it('does not mistake a public channel URL suffix for an API peer_id', () => {
    delete process.env.VK_CHANNEL_API_PEER_ID;
    process.env.VK_CHANNEL_PEER_ID = '-233806277';
    const channel = getVkDestinations().find((item) => item.key === 'channel');
    expect(channel).toMatchObject({ active: true, supported: false, groupId: null });
  });

  it('accepts a separately configured channel API peer_id', () => {
    process.env.VK_CHANNEL_API_PEER_ID = '2000000042';
    const channel = getVkDestinations().find((item) => item.key === 'channel');
    expect(channel).toMatchObject({ active: true, supported: true, groupId: '2000000042' });
  });

  it('uses the community token for public publishing instead of the VK ID login token', async () => {
    process.env.VK_GROUP_ACCESS_TOKEN = 'community-token';
    setVkRuntimeUserToken('vk2.authentication-only');
    expect(getVkIntegrationStatus()).toMatchObject({
      configured: true,
      publisher_token_source: 'community',
    });

    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        response: { object_id: 212761164, type: 'group' },
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        response: { post_id: 77 },
      }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await createVkWallPost({ groupId: '212761164', message: 'Анонс' });
    expect(result.postId).toBe(77);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    for (const call of fetchMock.mock.calls) {
      const body = call[1]?.body as URLSearchParams;
      expect(body.get('access_token')).toBe('community-token');
    }
  });
});
